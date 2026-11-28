import { exportAttribution } from "./core/dataExports";
import { SeriesTrends } from "./features/public/SeriesTrends";
import { canShowPublicationTrends } from "./core/seriesTrends";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  FlaskConical,
  Info,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useScorecard } from "./data/context";
import { groupLabels } from "./core/scoring";
import {
  bannerCopy,
  browseAllLabel,
  headerCopy,
  navLinks,
  countRowLabel,
  groupCountLabel,
  hasCosponsorships,
  heroCopy,
  notGradedGroupLabel,
  notGradedLabel,
  scoredLabel,
} from "./core/copy";
import type { Dataset, Publication } from "./core/publication";
import { publicationUrl } from "./core/navigation";
import { matchRoute } from "./core/routes";
import { stateFragment } from "./core/states";
import {
  LegislationPage,
  ComparePage,
  ReportsPage,
  ArchivesPage,
} from "./features/public";
import { Profile } from "./features/public/Profile";
import { Finder } from "./features/public/Finder";
import { Freshness } from "./features/public/Freshness";
import { Avatar, Grade } from "./features/public/member";
import { useFilterClass } from "./features/public/motion";
import {
  base,
  fictional,
  fmt,
  migrateLegacyFragment,
  normalize,
  query,
  readAsOf,
  readFragment,
  readState,
  readStoredState,
  writeFragment,
  writeStoredState,
  writeState,
} from "./features/public/helpers";
import { EditorPage } from "./features/editor/EditorPage";
import { Methodology } from "./features/public/Methodology";
import { PolicyLab } from "./features/PolicyLab";
import { toCsv } from "./core/research";
import { evidenceLabel } from "./core/evidence";
import type { Group, Member } from "./core/types";

const defaults = {
  q: "",
  chamber: "",
  state: "",
  party: "",
  membership: "",
  group: "",
  sort: "score",
};
type Filters = typeof defaults;
// `state` is read from the URL fragment (or an old ?state= link), never written to the query.
const readBrowse = () => readFragment("browse") === "all";
const groupOrder: Group[] = ["reformer", "mixed", "surveillance", "unproven"];
// On the home page, with no state in the address, the visitor's stored pick fills it in memory.
const readFilters = (home = false): Filters =>
  ({
    ...Object.fromEntries(
      Object.entries(defaults).map(([k, v]) => [k, query().get(k) ?? v]),
    ),
    state: readState() || (home ? readStoredState() : ""),
    q: readFragment("q"),
  }) as Filters;
function saveFile(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportRows(
  list: Member[],
  dataset: Dataset,
  score: (
    m: Member,
    asOf?: string,
  ) => { grade: string; value: number | null; group: Group; reason: string },
  asOf?: string,
  publication?: Publication,
) {
  const attribution = exportAttribution(
    dataset,
    publication?.id,
    location.origin,
    "/scorecard/",
    publication?.createdAt,
  );
  const rubric = dataset.rubric;
  return [
    [
      dataset.demo
        ? fictional(dataset)
          ? "Fictional preview — not actual congressional records"
          : "Preview — real records, unreviewed placeholder scores"
        : "Restore the Fourth surveillance scorecard",
    ],
    ["Dataset", dataset.id],
    ["Publication", publication?.id ?? "unpublished"],
    ["Licence", attribution.licence, attribution.licenceUrl ?? ""],
    ["Citation", attribution.citation],
    ["Scorer", publication?.scoring?.version ?? "legacy/recalculated"],
    ["Rubric", rubric.version],
    ["As of", asOf ?? dataset.asOf],
    [
      "Name",
      "Current party",
      "State",
      "Current chamber",
      "Grade",
      "Reform alignment",
      "Category",
      "Evidence status",
    ],
    ...list.map((m) => {
      const s = score(m, asOf);
      return [
        m.name,
        m.party,
        m.state,
        m.chamber,
        s.grade,
        fmt(s.value),
        groupLabels[s.group],
        s.reason,
      ];
    }),
  ];
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="select-label">
      <span>{label}</span>
      <div className="select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <ChevronDown size={14} />
      </div>
    </label>
  );
}
function MemberTable({ list, asOf }: { list: Member[]; asOf?: string }) {
  const { score, publication, dataset, linkId } = useScorecard();
  const notGraded = notGradedLabel(dataset.rubric.minVotes);
  // The directory sorts not-graded members last; the first one opens their labelled group.
  const firstUngraded = list.findIndex((m) => score(m, asOf).value === null);
  const ungradedCount = firstUngraded < 0 ? 0 : list.length - firstUngraded;
  return (
    <div
      className="table-scroll directory-table"
      role="region"
      aria-label="Legislator directory"
      tabIndex={0}
    >
      <table className="member-table" role="table">
        <caption className="sr-only">Legislator directory</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              Legislator
            </th>
            <th scope="col" role="columnheader">
              Current party / chamber
            </th>
            <th scope="col" role="columnheader">
              Grade
            </th>
            <th scope="col" role="columnheader">
              Reform alignment
            </th>
            <th scope="col" role="columnheader">
              Across administrations
            </th>
            <th scope="col" role="columnheader">
              <span className="sr-only">Profile</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {list.map((m, i) => {
            const s = score(m, asOf);
            return (
              <Fragment key={m.id}>
                {i === firstUngraded && (
                  <tr className="not-graded-group" role="row">
                    <th role="rowheader" scope="rowgroup" colSpan={6}>
                      {notGradedGroupLabel(ungradedCount)}
                    </th>
                  </tr>
                )}
                <tr role="row">
                  <td role="cell">
                    <a
                      className="member-name"
                      href={publicationUrl(
                        `${base}/members/${m.id}`,
                        linkId,
                        asOf,
                      )}
                    >
                      <Avatar member={m} />
                      <span>
                        <strong>{m.name}</strong>
                        <small>
                          {m.state}
                          {m.district !== undefined
                            ? ` · District ${m.district}`
                            : ""}
                        </small>
                      </span>
                    </a>
                  </td>
                  <td role="cell">
                    <span className={`party-dot ${m.party.toLowerCase()}`} />
                    {m.party}
                    <small>{m.chamber}</small>
                  </td>
                  <td role="cell">
                    <Grade member={m} asOf={asOf} />
                  </td>
                  <td role="cell">
                    {s.value === null ? (
                      <span className="alignment-text not-graded">
                        {notGraded}
                      </span>
                    ) : (
                      <>
                        <span className="alignment-text">{fmt(s.value)}</span>
                        <div className="meter">
                          <span style={{ width: `${s.value}%` }} />
                        </div>
                      </>
                    )}
                  </td>
                  <td role="cell">
                    <span className={`category ${s.group}`}>
                      <span />
                      {s.group === "reformer"
                        ? "Consistent reformer"
                        : s.group === "surveillance"
                          ? "Surveillance supporter"
                          : s.group === "mixed"
                            ? "Mixed record"
                            : "Not enough evidence"}
                    </span>
                    <small>
                      {scoredLabel(s, dataset.votes)} ·{" "}
                      {s.reason.startsWith("Unproven")
                        ? "More evidence needed"
                        : "Both contexts reviewed"}
                    </small>
                  </td>
                  <td role="cell">
                    <a
                      className="icon-link"
                      href={publicationUrl(
                        `${base}/members/${m.id}`,
                        linkId,
                        asOf,
                      )}
                      aria-label={`View ${m.name}'s profile`}
                    >
                      <ArrowUpRight size={18} />
                    </a>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {!list.length && (
        <div className="empty">
          <Search size={28} />
          <h3>No matching legislators</h3>
          <p>Try a different name or clear one of your filters.</p>
        </div>
      )}
    </div>
  );
}
/**
 * Content the Worker rendered into #root for this page (home and member profiles), captured by
 * main.tsx before React mounts. Shown unchanged while the publication loads, so the first paint
 * never turns back into a blank loading state. Its state picker and name box already work.
 */
function ServerPaint({
  html,
  state,
  onState,
  onName,
}: {
  html: string;
  /** The current state, whose no-script delegation block stays shown (see worker/render.ts). */
  state: string;
  onState: (state: string) => void;
  onName: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onState, onName });
  handlers.current = { onState, onName };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      if (target.name === "state") handlers.current.onState(target.value);
      else if (target.name === "q") handlers.current.onName(target.value);
    };
    el.addEventListener("change", listener);
    el.addEventListener("input", listener);
    return () => {
      el.removeEventListener("change", listener);
      el.removeEventListener("input", listener);
    };
  }, []);
  // :target stops tracking once React re-creates this markup, and replaceState never moves it, so
  // mark the current state's block with a class before paint instead (styles.css, .server-chosen).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = state ? stateFragment(state) : null;
    for (const t of el.querySelectorAll(".state-target"))
      t.classList.toggle("server-chosen", t.id === id);
  }, [state, html]);
  // The markup is the Worker's own, built from escaped text (worker/render.ts).
  return (
    <div
      ref={ref}
      className="server-paint"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
export default function App({ serverHtml }: { serverHtml?: string } = {}) {
  const {
    dataset,
    members,
    publication,
    linkId,
    state: dataState,
    error: dataError,
  } = useScorecard();
  const path = window.location.pathname.replace(/\/$/, "");
  const route = matchRoute(window.location.pathname);
  const isFormer = route.name === "former";
  const home = route.name === "home";
  const [filters, setFilters] = useState<Filters>(() => readFilters(home));
  // The home directory opens in place ("Browse all"); the open state lives in the fragment.
  const [browse, setBrowse] = useState(readBrowse);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    migrateLegacyFragment();
    const listener = () => {
      setFilters(readFilters(home));
      setBrowse(readBrowse());
    };
    window.addEventListener("popstate", listener);
    window.addEventListener("hashchange", listener);
    return () => {
      window.removeEventListener("popstate", listener);
      window.removeEventListener("hashchange", listener);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard");
    } catch {
      setNotice(
        "Clipboard unavailable. Use the download option or copy the address from your browser.",
      );
    }
  };
  function changeFilter(key: keyof Filters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (key === "state" || key === "q") {
      writeFragment(key, value);
      // A pick (or a clear) in the finder is remembered in this browser only.
      if (key === "state") writeStoredState(value);
      return;
    }
    const params = query();
    Object.entries(next).forEach(([k, v]) =>
      k !== "state" && k !== "q" && v && v !== defaults[k as keyof Filters]
        ? params.set(k, v)
        : params.delete(k),
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`,
    );
  }
  function openBrowse(open: boolean) {
    setBrowse(open);
    writeFragment("browse", open ? "all" : "");
  }
  function reset() {
    setFilters(defaults);
    const p = query();
    Object.keys(defaults).forEach((key) => p.delete(key));
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (p.size ? `?${p}` : "") + window.location.hash,
    );
    writeState("");
    writeStoredState("");
    writeFragment("q", "");
  }
  // A state that is not in the data (stale link) filters nothing and selects nothing.
  const knownState = members.some((m) => m.state === filters.state)
    ? filters.state
    : "";
  const effectiveFilters = { ...filters, state: knownState };
  const member =
    route.name === "member"
      ? members.find((m) => m.id === route.id)
      : undefined;
  const notFoundPage = (
    <section className="container empty">
      <h1>Page not found</h1>
      <a href={publicationUrl(`${base}/`, linkId)}>Back to the directory</a>
    </section>
  );
  const directoryPage = (
    <>
      <section className="hero-line container">
        <h1>{isFormer ? heroCopy.former : heroCopy.home}</h1>
      </section>
      {!isFormer && (
        <div className="container finder-wrap">
          <Finder
            state={effectiveFilters.state}
            onState={(s) => changeFilter("state", s)}
            name={filters.q}
            onName={(q) => changeFilter("q", q)}
            level={2}
          />
        </div>
      )}
      {!isFormer &&
      canShowPublicationTrends(publication) &&
      dataset.seriesTrends?.length ? (
        <SeriesTrends series={dataset.seriesTrends} publicationId={linkId} />
      ) : null}
      <section
        className="container scorecard-section"
        aria-label="Explore legislators"
      >
        {isFormer && (
          <div className="section-heading">
            <div>
              <div className="eyebrow muted">
                {isFormer ? "HISTORICAL EXPLORER" : "EXPLORE THE RECORD"}
              </div>
              <h2>
                {isFormer ? "All former members" : "All members"}
                <span className="count-pill">
                  {
                    members.filter((m) =>
                      isFormer ? m.status !== "active" : m.status === "active",
                    ).length
                  }{" "}
                  {fictional(dataset) ? "demo members" : "members"}
                </span>
              </h2>
            </div>
            <a
              className="subtle-link"
              href={publicationUrl(
                isFormer ? `${base}/` : `${base}/former`,
                linkId,
              )}
            >
              {isFormer ? "Current members" : "Former members"}{" "}
              <ArrowRight size={16} />
            </a>
            <a
              className="subtle-link"
              href={publicationUrl(`${base}/research`, linkId)}
            >
              Build a research report <ArrowUpRight size={16} />
            </a>
          </div>
        )}
        <Directory
          // Home: the finder owns the state; "Browse all" is the whole roster.
          filters={
            isFormer ? effectiveFilters : { ...effectiveFilters, state: "" }
          }
          setFilter={changeFilter}
          reset={reset}
          archive={isFormer}
          copy={copy}
          open={isFormer || browse}
          onBrowse={openBrowse}
          links={
            <>
              <a
                className="subtle-link"
                href={publicationUrl(`${base}/former`, linkId)}
              >
                {headerCopy.formerMembers} <ArrowRight size={16} />
              </a>
              <a
                className="subtle-link"
                href={publicationUrl(`${base}/research`, linkId)}
              >
                {headerCopy.research} <ArrowUpRight size={16} />
              </a>
            </>
          }
        />
      </section>
      {isFormer && (
        <section className="container bottom-callout">
          <div>
            <span className="eyebrow">FOLLOW THE EVIDENCE</span>
            <h2>A score should start a conversation.</h2>
            <p>
              Open a profile to see the votes, the calculation, and what the
              record can—and cannot—tell us.
            </p>
          </div>
          <a
            className="button dark"
            href={publicationUrl(`${base}/methodology`, linkId)}
          >
            Explore the methodology <ArrowRight size={16} />
          </a>
        </section>
      )}
    </>
  );
  function routePage(): ReactNode {
    switch (route.name) {
      case "home":
      case "former":
        return directoryPage;
      case "member":
        return member ? (
          <Profile
            member={member}
            copy={copy}
            serverPainted={serverHtml !== undefined}
          />
        ) : (
          notFoundPage
        );
      case "research":
        return <ReportsPage dataset={dataset} publication={publication} />;
      case "compare":
        return <ComparePage dataset={dataset} publication={publication} />;
      case "legislation":
        return (
          <LegislationPage
            dataset={dataset}
            publication={publication}
            voteId={route.voteId}
          />
        );
      case "archive":
        return <ArchivesPage dataset={dataset} publication={publication} />;
      case "find":
        return (
          <section className="container inner-page">
            <Finder
              state={effectiveFilters.state}
              onState={(s) => changeFilter("state", s)}
              name={filters.q}
              onName={(q) => changeFilter("q", q)}
              level={1}
            />
          </section>
        );
      case "methodology":
        return <Methodology dataset={dataset} publication={publication} />;
      case "methodologyLab":
        return <PolicyLab dataset={dataset} />;
      case "editor":
        return <EditorPage dataset={dataset} />;
      case "notFound":
        return notFoundPage;
      default: {
        const unhandled: never = route;
        return unhandled;
      }
    }
  }
  if (dataState === "loading" && serverHtml && route.name !== "editor")
    return (
      <ServerPaint
        html={serverHtml}
        state={knownState}
        onState={(s) => changeFilter("state", s)}
        onName={(q) => changeFilter("q", q)}
      />
    );
  return (
    <>
      <a className="skip-link" href="#main">
        {headerCopy.skip}
      </a>
      <div className="preview-banner">
        <span className="preview-dot" />{" "}
        {dataState === "loading"
          ? bannerCopy.loading
          : dataset.demo
            ? bannerCopy.preview
            : bannerCopy.published}{" "}
        <span className="preview-copy">
          {dataset.demo
            ? fictional(dataset)
              ? bannerCopy.fictional
              : bannerCopy.placeholder
            : bannerCopy.publishedLine(dataset.asOf, publication?.id ?? "")}
        </span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={publicationUrl(`${base}/`, linkId)}>
            <span className="brand-symbol">
              IV
              <span />
            </span>
            <span>
              RESTORE
              <br />
              <strong>THE FOURTH</strong>
            </span>
          </a>
          <nav aria-label="Main navigation">
            {navLinks.map((n) => (
              <a
                key={n.href}
                href={publicationUrl(n.href, linkId)}
                className={
                  n.href.replace(/\/$/, "") === path ||
                  (n.title === "Scorecard" && (!!member || isFormer))
                    ? "active"
                    : ""
                }
              >
                {n.title}
              </a>
            ))}
          </nav>
          <a className="about-link" href={headerCopy.missionUrl}>
            {headerCopy.mission} <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <Freshness />
      <main id="main">
        {route.name === "editor" ? (
          <EditorPage dataset={dataset} />
        ) : dataState === "loading" ? (
          <section className="container empty" role="status">
            Loading the published scorecard…
          </section>
        ) : dataState === "error" ? (
          <section className="container empty" role="alert">
            <h1>Scorecard unavailable</h1>
            <p>{dataError}</p>
            <button className="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </section>
        ) : (
          routePage()
        )}
      </main>
      <footer className="container">
        <div>
          <strong>RESTORE THE FOURTH</strong>
          <p>Defending the right to be left alone.</p>
        </div>
        <div>
          Independent. Nonpartisan. Evidence-led.
          <br />
          <a href={publicationUrl(`${base}/methodology#sources`, linkId)}>
            Sources & reuse
          </a>
          <span>
            {" "}
            ·{" "}
            {dataset.demo
              ? fictional(dataset)
                ? "Fictional preview"
                : `Placeholder preview · evidence through ${dataset.asOf}`
              : `Evidence through ${dataset.asOf}`}
          </span>
          <br />
          <a href={`${base}/editor`}>Staff workspace</a> ·{" "}
          <a href={publicationUrl(`${base}/find`, linkId)}>
            Find my representatives
          </a>
        </div>
      </footer>
      {notice && (
        <div role="status" className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </>
  );
}
function Directory({
  filters,
  setFilter,
  reset,
  archive,
  copy,
  open,
  onBrowse,
  links,
}: {
  filters: Filters;
  setFilter: (k: keyof Filters, v: string) => void;
  reset: () => void;
  archive: boolean;
  copy: (text: string) => Promise<void>;
  /** False on the home page until "Browse all" (or a count link) opens the directory. */
  open: boolean;
  onBrowse: (open: boolean) => void;
  /** Former-member and research links, shown beside "Browse all" on the home page. */
  links: ReactNode;
}) {
  const { score, dataset, members, publication, linkId } = useScorecard();
  const [asOf, setAsOf] = useState(readAsOf(dataset));
  const [status, setStatus] = useState(query().get("status") || "all");
  const source = members.filter((m) =>
    archive
      ? m.status !== "active" && (status === "all" || m.status === status)
      : m.status === "active",
  );
  const date = archive ? asOf : undefined;
  const matching = source
    .filter((m) => {
      const terms = normalize(filters.q).split(/\s+/).filter(Boolean);
      return (
        terms.every((t) =>
          normalize(`${m.name} ${m.state} ${m.party}`).includes(t),
        ) &&
        (!filters.chamber || m.chamber === filters.chamber) &&
        (!filters.state || m.state === filters.state) &&
        (!filters.party || m.party === filters.party) &&
        (!filters.membership ||
          [...m.committees, ...m.caucuses].includes(filters.membership)) &&
        (!filters.group || score(m, date).group === filters.group)
      );
    })
    .sort((a, b) =>
      filters.sort === "name"
        ? a.name.localeCompare(b.name)
        : (score(b, date).value ?? -1) - (score(a, date).value ?? -1) ||
          a.name.localeCompare(b.name),
    );
  // Members the scorer left ungraded (value null) form their own last group under either sort.
  const filtered = [
    ...matching.filter((m) => score(m, date).value !== null),
    ...matching.filter((m) => score(m, date).value === null),
  ];
  const counts = (group: Group) =>
    source.filter((m) => score(m, date).group === group).length;
  // Plan item 3.4: the result table fades in briefly when a filter changes (skipped above ~100 rows).
  const resultsMotion = useFilterClass(
    JSON.stringify([filters, status, date]),
    filtered.length,
  );
  const countRow = (
    <nav className="count-row" aria-label={countRowLabel}>
      {groupOrder.map((g) => (
        <a
          key={g}
          className={`count-link ${g}`}
          href={publicationUrl(
            `${base}/${archive ? "former" : ""}?group=${g}${archive ? "" : "#browse=all"}`,
            linkId,
          )}
          aria-current={filters.group === g ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            setFilter("group", filters.group === g ? "" : g);
            if (!archive) onBrowse(true);
          }}
        >
          <span className={`count-icon ${g}`} aria-hidden="true" />
          {groupCountLabel(g, counts(g))}
        </a>
      ))}
    </nav>
  );
  function archiveParam(key: string, value: string) {
    const p = query();
    p.set(key, value);
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  }
  return (
    <>
      {archive && (
        <div className="archive-controls">
          <Info size={20} />
          <p>
            <strong>Historical exploration, not published snapshots.</strong>{" "}
            Alternate cutoffs recalculate the selected evidence using its rubric
            and the current scoring engine. Use the Archive page for immutable
            publications.
          </p>
          <label>
            Evidence through
            <input
              type="date"
              min={dataset.votes.reduce(
                (date, vote) => (vote.date < date ? vote.date : date),
                dataset.asOf,
              )}
              max={dataset.asOf}
              value={asOf}
              onChange={(e) => {
                if (e.target.value) {
                  setAsOf(e.target.value);
                  archiveParam("asOf", e.target.value);
                }
              }}
            />
          </label>
          <Select
            label="Member status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              archiveParam("status", v);
            }}
          >
            <option value="all">All former members</option>
            <option value="inactive">Inactive</option>
            <option value="deceased">Deceased</option>
          </Select>
        </div>
      )}
      {countRow}
      {!archive && (
        <div className="browse-bar">
          <button
            type="button"
            className="button"
            aria-expanded={open}
            aria-controls="directory-panel"
            onClick={() => onBrowse(!open)}
          >
            {browseAllLabel(source.length)}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {links}
        </div>
      )}
      {open && (
        <div className="directory-panel" id="directory-panel">
          <div className="filter-bar">
            {archive && (
              <label className="search-box">
                <Search size={18} />
                <span className="sr-only">Search legislators</span>
                <input
                  type="search"
                  placeholder="Search by name or state…"
                  value={filters.q}
                  onChange={(e) => setFilter("q", e.target.value)}
                />
              </label>
            )}
            <Select
              label="Current chamber"
              value={filters.chamber}
              onChange={(v) => setFilter("chamber", v)}
            >
              <option value="">All chambers</option>
              <option>House</option>
              <option>Senate</option>
            </Select>
            {archive && (
              <Select
                label="State"
                value={filters.state}
                onChange={(v) => setFilter("state", v)}
              >
                <option value="">All states</option>
                {[...new Set(source.map((m) => m.state))].sort().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
            <Select
              label="Current party"
              value={filters.party}
              onChange={(v) => setFilter("party", v)}
            >
              <option value="">All parties</option>
              <option>Democratic</option>
              <option>Republican</option>
              <option>Independent</option>
            </Select>
            <Select
              label="Committee / caucus"
              value={filters.membership}
              onChange={(v) => setFilter("membership", v)}
            >
              <option value="">All memberships</option>
              {[
                ...new Set(
                  source.flatMap((m) => [...m.committees, ...m.caucuses]),
                ),
              ]
                .sort()
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </Select>
          </div>
          <div className="table-toolbar">
            <div role="status">
              <strong>{filtered.length}</strong> legislators
              {filters.group && (
                <span className="filter-chip">
                  {groupLabels[filters.group as Group] ?? filters.group}
                  <button
                    aria-label="Clear group filter"
                    onClick={() => setFilter("group", "")}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {Object.keys(filters).some(
                (k) =>
                  filters[k as keyof Filters] !== defaults[k as keyof Filters],
              ) && (
                <button className="inline-button" onClick={reset}>
                  Clear filters
                </button>
              )}
            </div>
            <div className="toolbar-actions">
              <label>
                Sort by{" "}
                <select
                  aria-label="Sort results"
                  value={filters.sort}
                  onChange={(e) => setFilter("sort", e.target.value)}
                >
                  <option value="score">Highest score</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
              <button onClick={() => void copy(window.location.href)}>
                <Copy size={14} /> Share view
              </button>
              <button
                onClick={() =>
                  saveFile(
                    dataset.demo
                      ? "scorecard-demo.csv"
                      : "surveillance-scorecard.csv",
                    toCsv(
                      exportRows(filtered, dataset, score, date, publication),
                    ),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <ArrowDownToLine size={15} /> Export
              </button>
            </div>
          </div>
          <div className={`directory-results ${resultsMotion}`.trim()}>
            <MemberTable list={filtered} asOf={date} />
          </div>
          <div className="table-footer">
            <Info size={14} />
            <span>
              Grades reflect reform-aligned votes. Consistency is evaluated
              separately.{" "}
              <a href={publicationUrl(`${base}/methodology`, linkId)}>
                How scoring works
              </a>
            </span>
            <span className="demo-stamp">
              {fictional(dataset)
                ? "FICTIONAL DATA"
                : dataset.demo
                  ? "PLACEHOLDER SCORES"
                  : dataset.asOf}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
