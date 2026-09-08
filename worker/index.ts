import type { Dataset, Publication } from "../src/core/publication";
import { authenticate, HttpError } from "./auth";
import { digest, validateDataset } from "./validation";
import { research } from "./ai";
import { createPublicationScoring } from "../src/core/publication-scores";
import { members as demoMembers, votes as demoVotes } from "../src/data/demo";
import {
  encodeStoredJson,
  decodeStoredJson,
  MAX_STORED_BYTES,
} from "./storage";

const prefix = "/scorecard/api";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body(
  request: Request,
  maxBytes = 12_000_000,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "JSON required");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Body required");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(
        413,
        `Payload exceeds the ${maxBytes.toLocaleString("en-US")}-byte upload limit`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes));
    if (!v || typeof v !== "object" || Array.isArray(v)) throw Error();
    return v;
  } catch {
    throw new HttpError(400, "Invalid JSON object");
  }
}
interface Draft {
  id: string;
  dataset: string;
  summary: string;
  version: number;
  status: string;
  author: string;
  reviewer: string | null;
  updated_at: string;
  base_publication_id: string | null;
}
async function buildPublication(
  dataset: Dataset,
  summary: string,
  previousId: string | null,
  publishedBy: string,
): Promise<Publication> {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    publishedBy,
    previousId,
    summary,
    digest: await digest(dataset),
    dataset,
    scoring: await createPublicationScoring(dataset),
  };
}
function storePublication(p: Publication) {
  return encodeStoredJson(p, {
    id: p.id,
    createdAt: p.createdAt,
    publishedBy: p.publishedBy,
    summary: p.summary,
    digest: p.digest,
    previousId: p.previousId,
    datasetId: p.dataset.id,
  });
}
async function publication(env: Env, id?: string): Promise<Publication | null> {
  const row = await env.DB.prepare(
    id
      ? "SELECT snapshot FROM publications WHERE id=?"
      : "SELECT snapshot FROM publications JOIN current_publication ON publications.id=current_publication.publication_id",
  )
    .bind(...(id ? [id] : []))
    .first<{ snapshot: string }>();
  return row ? decodeStoredJson<Publication>(row.snapshot) : null;
}
async function api(
  request: Request,
  env: Env,
  path: string,
): Promise<Response> {
  const method = request.method;
  if (
    method !== "GET" &&
    request.headers.get("Origin") &&
    request.headers.get("Origin") !== new URL(request.url).origin
  )
    throw new HttpError(403, "Cross-origin writes refused");
  if (method === "POST" && path === "/research") return research(request, env);
  if (method === "GET" && path === "/publications") {
    const rows = await env.DB.prepare(
      "SELECT id,json_extract(snapshot,'$.createdAt') AS createdAt,json_extract(snapshot,'$.summary') AS summary,json_extract(snapshot,'$.digest') AS digest,COALESCE(json_extract(snapshot,'$.datasetId'),json_extract(snapshot,'$.dataset.id')) AS datasetId,json_extract(snapshot,'$.previousId') AS previousId FROM publications ORDER BY created_at DESC LIMIT 200",
    ).all();
    return json({
      publications: rows.results,
    });
  }
  if (method === "GET" && path.startsWith("/publications/")) {
    const id = path.slice("/publications/".length);
    const p = await publication(env, id === "latest" ? undefined : id);
    if (!p) throw new HttpError(404, "No publication yet");
    return json(p);
  }
  if (method === "POST" && path === "/corrections") {
    const b = await body(request, 20_000);
    const p =
      typeof b.publicationId === "string"
        ? await publication(env, b.publicationId)
        : null;
    if (
      !p ||
      typeof b.message !== "string" ||
      b.message.trim().length < 10 ||
      b.message.length > 4000
    )
      throw new HttpError(
        400,
        "A publication and explanation (10–4000 characters) are required",
      );
    const memberId = typeof b.memberId === "string" ? b.memberId : undefined;
    const voteId = typeof b.voteId === "string" ? b.voteId : undefined;
    if (
      (!memberId && !voteId) ||
      (memberId && !p.dataset.members.some((m) => m.id === memberId)) ||
      (voteId && !p.dataset.votes.some((v) => v.id === voteId)) ||
      (memberId &&
        voteId &&
        !p.dataset.records.some(
          (r) => r.memberId === memberId && r.voteId === voteId,
        ))
    )
      throw new HttpError(400, "Evidence does not exist in this publication");
    const hour = Math.floor(Date.now() / 3600000);
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    const bucket = `${hour}:${await digest(`${hour}:${ip}`)}`;
    const rate = await env.DB.prepare(
      "INSERT INTO rate_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
    )
      .bind(bucket)
      .first<{ count: number }>();
    if (!rate || rate.count > 5)
      throw new HttpError(
        429,
        "Please wait before submitting more corrections",
      );
    await env.DB.prepare("DELETE FROM rate_limits WHERE bucket < ?")
      .bind(`${hour - 24}:`)
      .run();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO corrections(id,publication_id,evidence_id,message,created_at) VALUES(?,?,?,?,?)",
    )
      .bind(
        id,
        p.id,
        JSON.stringify({ memberId, voteId }),
        b.message.trim(),
        new Date().toISOString(),
      )
      .run();
    return json({ id }, 201);
  }
  if (!path.startsWith("/staff/"))
    throw new HttpError(404, "API route not found");
  const actor = await authenticate(request, env);
  if (path === "/staff/session" && method === "GET") return json(actor);
  if (path === "/staff/status" && method === "GET") {
    const p = await publication(env);
    const pointer = await env.DB.prepare(
      "SELECT * FROM current_publication",
    ).first();
    return json({
      pointer,
      publicationId: p?.id ?? null,
      demo: p?.dataset.demo ?? null,
      asOf: p?.dataset.asOf ?? null,
      sourceFreshness:
        p?.dataset.sources.map((s) => ({
          url: s.url,
          retrievedAt: s.retrievedAt,
          ageHours: Math.round(
            (Date.now() - Date.parse(s.retrievedAt)) / 3600000,
          ),
        })) ?? [],
      hasLivePublication: !!p && !p.dataset.demo,
    });
  }
  if (path === "/staff/audit" && method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT * FROM audit ORDER BY sequence DESC LIMIT 200",
        ).all()
      ).results,
    );
  if (path === "/staff/corrections" && method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT * FROM corrections ORDER BY created_at DESC LIMIT 200",
        ).all()
      ).results,
    );
  if (path.startsWith("/staff/corrections/") && method === "PATCH") {
    const b = await body(request, 20_000);
    if (
      !["resolved", "dismissed"].includes(String(b.status)) ||
      typeof b.resolution !== "string" ||
      b.resolution.trim().length < 5 ||
      b.resolution.length > 4000
    )
      throw new HttpError(400, "Status and resolution required");
    const id = path.split("/").at(-1)!;
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE corrections SET status=?,resolution=? WHERE id=? AND status='open'",
      ).bind(b.status, b.resolution, id),
      env.DB.prepare(
        "INSERT INTO audit(actor,action,target,detail) SELECT ?,'correction-resolution',?,? WHERE changes()=1",
      ).bind(actor.email, id, b.resolution),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(409, "Correction already handled or missing");
    return json({ ok: true });
  }
  if (path === "/staff/drafts" && method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT id,summary,version,status,author,reviewer,updated_at,base_publication_id,json_extract(dataset,'$.id') AS datasetId,json_extract(dataset,'$.asOf') AS asOf,json_extract(dataset,'$.demo') AS demo FROM drafts ORDER BY updated_at DESC LIMIT 100",
        ).all()
      ).results.map((d) => ({ ...d, demo: d.demo === 1 })),
    );
  if (path === "/staff/drafts" && method === "POST") {
    const b = await body(request);
    const errors = validateDataset(b.dataset);
    if (errors.length)
      return json({ error: "Dataset validation failed", errors }, 422);
    if (
      typeof b.summary !== "string" ||
      !b.summary.trim() ||
      b.summary.length > 4000
    )
      throw new HttpError(400, "Summary must contain 1–4000 characters");
    const id = crypto.randomUUID();
    if (b.basePublicationId !== null && typeof b.basePublicationId !== "string")
      throw new HttpError(400, "Explicit basePublicationId required");
    const dataset = b.dataset as Dataset;
    const storedDataset = await encodeStoredJson(dataset, {
      id: dataset.id,
      asOf: dataset.asOf,
      demo: dataset.demo,
    });
    const created = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO drafts(id,dataset,summary,status,author,updated_at,base_publication_id) SELECT ?,?,?,'draft',?,?,? WHERE EXISTS(SELECT 1 FROM current_publication WHERE publication_id IS ?)",
      ).bind(
        id,
        storedDataset,
        b.summary,
        actor.email,
        new Date().toISOString(),
        b.basePublicationId,
        b.basePublicationId,
      ),
      env.DB.prepare(
        "INSERT INTO audit(actor,action,target,detail) SELECT ?,'create-draft',?,'{}' WHERE changes()=1",
      ).bind(actor.email, id),
    ]);
    if (!created[0].meta.changes)
      throw new HttpError(
        409,
        "Current publication changed; reload and compare your draft",
      );
    return json({ id, version: 1 }, 201);
  }
  const match = path.match(
    /^\/staff\/drafts\/([^/]+)(?:\/(review|publish|rebase))?$/,
  );
  if (match && !match[2] && method === "GET") {
    const d = await env.DB.prepare("SELECT * FROM drafts WHERE id=?")
      .bind(match[1])
      .first<Draft>();
    if (!d) throw new HttpError(404, "Draft not found");
    return json({ ...d, dataset: await decodeStoredJson<Dataset>(d.dataset) });
  }
  if (match && ["PUT", "POST"].includes(method)) {
    const d = await env.DB.prepare("SELECT * FROM drafts WHERE id=?")
      .bind(match[1])
      .first<Draft>();
    if (!d) throw new HttpError(404, "Draft not found");
    const b = await body(request, method === "PUT" ? 12_000_000 : 20_000);
    if (b.version !== d.version)
      throw new HttpError(409, "Draft changed; reload before editing");
    if (match[2] === "rebase" && method === "POST") {
      if (
        b.basePublicationId !== null &&
        typeof b.basePublicationId !== "string"
      )
        throw new HttpError(400, "Explicit basePublicationId required");
      const r = await env.DB.prepare(
        "UPDATE drafts SET base_publication_id=?,status='draft',reviewer=NULL,author=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status!='published' AND EXISTS(SELECT 1 FROM current_publication WHERE publication_id IS ?)",
      )
        .bind(
          b.basePublicationId,
          actor.email,
          new Date().toISOString(),
          d.id,
          d.version,
          b.basePublicationId,
        )
        .run();
      if (!r.meta.changes)
        throw new HttpError(409, "Draft or current publication changed");
      return json({ id: d.id, version: d.version + 1 });
    }
    if (!match[2] && method === "PUT") {
      if (d.status === "published")
        throw new HttpError(409, "Published drafts cannot be edited");
      if (b.basePublicationId !== d.base_publication_id)
        throw new HttpError(409, "Draft base changed; reload");
      const errors = validateDataset(b.dataset);
      if (errors.length)
        return json({ error: "Dataset validation failed", errors }, 422);
      if (
        typeof b.summary !== "string" ||
        !b.summary.trim() ||
        b.summary.length > 4000
      )
        throw new HttpError(400, "Summary must contain 1–4000 characters");
      const dataset = b.dataset as Dataset;
      const storedDataset = await encodeStoredJson(dataset, {
        id: dataset.id,
        asOf: dataset.asOf,
        demo: dataset.demo,
      });
      const r = await env.DB.prepare(
        "UPDATE drafts SET dataset=?,summary=?,status='draft',reviewer=NULL,author=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status!='published' AND EXISTS(SELECT 1 FROM current_publication WHERE publication_id IS drafts.base_publication_id)",
      )
        .bind(
          storedDataset,
          b.summary,
          actor.email,
          new Date().toISOString(),
          d.id,
          d.version,
        )
        .run();
      if (!r.meta.changes) throw new HttpError(409, "Draft changed");
      return json({ id: d.id, version: d.version + 1 });
    }
    if (match[2] === "review" && method === "POST") {
      if (!["reviewer", "publisher"].includes(actor.role))
        throw new HttpError(403, "Reviewer role required");
      if (d.author === actor.email)
        throw new HttpError(403, "A second person must review");
      const dataset = await decodeStoredJson<Dataset>(d.dataset);
      const errors = validateDataset(dataset);
      if (errors.length)
        return json({ error: "Dataset validation failed", errors }, 422);
      try {
        const prospective = await buildPublication(
          dataset,
          d.summary,
          d.base_publication_id,
          "p".repeat(254),
        );
        const stored = await storePublication(prospective);
        if (
          new TextEncoder().encode(stored).byteLength >
          MAX_STORED_BYTES - 4096
        )
          throw new HttpError(
            413,
            "Publication needs additional metadata capacity",
          );
      } catch (error) {
        if (error instanceof HttpError && error.status === 413)
          throw new HttpError(
            413,
            "Review refused: the complete publication exceeds storage capacity. Reduce the evidence period or payload before requesting review.",
          );
        throw error;
      }
      const r = await env.DB.prepare(
        "UPDATE drafts SET status='review',reviewer=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='draft' AND EXISTS(SELECT 1 FROM current_publication WHERE publication_id IS drafts.base_publication_id)",
      )
        .bind(actor.email, new Date().toISOString(), d.id, d.version)
        .run();
      if (!r.meta.changes)
        throw new HttpError(409, "Draft is not awaiting review");
      return json({ id: d.id, version: d.version + 1 });
    }
    if (match[2] === "publish" && method === "POST") {
      if (actor.role !== "publisher")
        throw new HttpError(403, "Publisher role required");
      if (d.status !== "review" || !d.reviewer)
        throw new HttpError(409, "Review required");
      const dataset = await decodeStoredJson<Dataset>(d.dataset);
      const errors = validateDataset(dataset);
      if (errors.length)
        return json({ error: "Dataset validation failed", errors }, 422);
      const p = await buildPublication(
        dataset,
        d.summary,
        d.base_publication_id,
        actor.email,
      );
      const serialized = await storePublication(p);
      const r = await env.DB.prepare(
        "INSERT INTO publications(id,draft_id,snapshot,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM drafts WHERE id=? AND version=? AND status='review') AND EXISTS(SELECT 1 FROM current_publication WHERE publication_id IS ?)",
      )
        .bind(
          p.id,
          d.id,
          serialized,
          p.createdAt,
          d.id,
          d.version,
          p.previousId,
        )
        .run();
      if (!r.meta.changes)
        throw new HttpError(409, "Draft or publication changed");
      return json(p, 201);
    }
  }
  if (path === "/staff/rollback" && method === "POST") {
    if (actor.role !== "publisher")
      throw new HttpError(403, "Publisher role required");
    const b = await body(request, 20_000);
    if (
      typeof b.publicationId !== "string" ||
      !(await publication(env, b.publicationId)) ||
      typeof b.reason !== "string" ||
      b.reason.trim().length < 10 ||
      b.reason.length > 4000 ||
      !Number.isInteger(b.revision)
    )
      throw new HttpError(
        400,
        "Existing publication, pointer revision and reason required",
      );
    const r = await env.DB.prepare(
      "UPDATE current_publication SET publication_id=?,revision=revision+1,actor=?,reason=? WHERE singleton=1 AND revision=?",
    )
      .bind(b.publicationId, actor.email, b.reason, b.revision)
      .run();
    if (!r.meta.changes)
      throw new HttpError(409, "Publication pointer changed");
    return json({ ok: true });
  }
  throw new HttpError(404, "API route not found");
}
async function page(request: Request, env: Env, url: URL): Promise<Response> {
  let title = "Surveillance reform scorecard";
  let description =
    "Evidence, methodology, and voting records behind surveillance reform grades.";
  let demo = false;
  const detail = url.pathname.match(
    /^\/scorecard\/(members|legislation)\/([^/]+)\/?$/,
  );
  const known =
    /^\/scorecard\/(?:|compare|find|legislation|archive|archives|reports|editor|methodology|research|history)\/?$/.test(
      url.pathname,
    );
  if (!detail && !known) return env.ASSETS.fetch(request);
  const requested = url.searchParams.get("publication");
  const p = await publication(env, requested ?? undefined);
  if (requested && !p)
    return new Response("Publication not found", { status: 404 });
  demo = p?.dataset.demo ?? true;
  if (detail) {
    const id = decodeURIComponent(detail[2]);
    if (detail[1] === "members") {
      const m = (p?.dataset.members ?? demoMembers).find((m) => m.id === id);
      if (!m) return new Response("Member not found", { status: 404 });
      title = `${m.name} — Surveillance reform scorecard`;
      description = `Explore ${m.name}’s surveillance reform record and the evidence behind the grade.`;
    } else {
      const v = (p?.dataset.votes ?? demoVotes).find((v) => v.id === id);
      if (!v) return new Response("Legislation not found", { status: 404 });
      title = `${v.bill}: ${v.title}`;
      description = v.rationale;
    }
  }
  const canonical = new URL(url);
  const noindex = demo || /\/editor\/?$/.test(url.pathname);
  canonical.search = "";
  if (requested) canonical.searchParams.set("publication", requested);
  url.pathname = "/index.html";
  url.search = "";
  const asset = await env.ASSETS.fetch(new Request(url, request));
  const response = new Response(asset.body, asset);
  response.headers.set(
    "X-Robots-Tag",
    noindex ? "noindex, nofollow" : "index, follow",
  );
  response.headers.set("Cache-Control", "no-store");
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return new HTMLRewriter()
    .on("title", {
      element(e) {
        e.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute("content", description);
      },
    })
    .on('meta[name="robots"]', {
      element(e) {
        e.setAttribute(
          "content",
          noindex ? "noindex, nofollow" : "index, follow",
        );
      },
    })
    .on('link[rel="canonical"]', {
      element(e) {
        e.remove();
      },
    })
    .on("head", {
      element(e) {
        e.append(
          `<link rel="canonical" href="${escape(canonical.href)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical.href)}"><meta property="og:type" content="website">`,
          { html: true },
        );
      },
    })
    .transform(response);
}
export default {
  async fetch(request: Request, env: Env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith(prefix + "/"))
        return await api(request, env, url.pathname.slice(prefix.length));
      if (url.pathname === "/scorecard")
        return Response.redirect(`${url.origin}/scorecard/${url.search}`, 308);
      return await page(request, env, url);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error(
        JSON.stringify({
          event: "request-failed",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      return json({ error: "Service temporarily unavailable" }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
