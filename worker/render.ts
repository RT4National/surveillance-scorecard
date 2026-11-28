// Server-rendered first paint for the home page and member profiles.
//
// The Worker injects this markup into #root so visitors see content before any JavaScript runs.
// React then renders over it with createRoot (no hydration); until the publication has loaded,
// the app keeps showing this markup unchanged (src/App.tsx, ServerPaint). It therefore mirrors the
// app's structure and class names: when you change the banner, header, finder, count row or the
// profile headline in the app, change it here too. Strings come from src/core/copy.ts.
//
// Every piece of data passes through escapeHtml. Nothing here reads request location data.
import type { Dataset, Publication } from "../src/core/publication";
import type { Group, Member, RecordEntry } from "../src/core/types";
import { publishedScore } from "../src/core/publication-scores";
import { defaultGradeBands, scoreMember } from "../src/core/scoring";
import { publicationUrl } from "../src/core/navigation";
import { bandRange, profileSummary } from "../src/core/summary";
import {
  bandLine,
  bannerCopy,
  browseAllLabel,
  countRowLabel,
  finderCopy,
  groupCountLabel,
  hasCosponsorships,
  headerCopy,
  headlineCopy,
  heroCopy,
  methodologyLinkLabel,
  navLinks,
  notGradedLabel,
  profileCopy,
  scoredLabel,
  scoredNoun,
  splitCopy,
  updatedLabel,
} from "../src/core/copy";
import { fictional, fmt, gradeTone } from "../src/features/public/helpers";
import { splitDisplay } from "../src/features/public/split";

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const e = escapeHtml;

/** What the page shows: the loaded publication (or the fictional demo) and how links pin. */
export interface PageData {
  dataset: Dataset;
  publication?: Publication;
  /** Set only when the visitor asked for ?publication=; links then carry it. */
  linkId?: string;
}
type Score = ReturnType<typeof scoreMember>;

// Lucide icon markup, as lucide-react renders it, so the app's icons replace these in place.
const svg = (size: number, name: string, paths: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}" aria-hidden="true">${paths.map((d) => `<path d="${d}"></path>`).join("")}</svg>`;
const icons = {
  arrowRight: svg(16, "arrow-right", ["M5 12h14", "m12 5 7 7-7 7"]),
  arrowUpRight: (size: number) =>
    svg(size, "arrow-up-right", ["M7 7h10v10", "M7 17 17 7"]),
  arrowLeft: svg(16, "arrow-left", ["m12 19-7-7 7-7", "M19 12H5"]),
  chevronDown: svg(15, "chevron-down", ["m6 9 6 6 6-6"]),
};

/**
 * Score lookup for a page. Frozen publication scores when present; otherwise the scorer over each
 * member's own records, grouped once so a whole-roster count stays linear.
 */
function scorer(data: PageData): (m: Member) => Score {
  const { publication, dataset } = data;
  if (publication?.scoring) return (m) => publishedScore(publication, m);
  const byMember = new Map<string, RecordEntry[]>();
  for (const r of dataset.records) {
    const list = byMember.get(r.memberId);
    if (list) list.push(r);
    else byMember.set(r.memberId, [r]);
  }
  return (m) =>
    scoreMember(
      m,
      dataset.votes,
      byMember.get(m.id) ?? [],
      dataset.rubric,
      dataset.asOf,
    );
}

function chrome(data: PageData, main: string): string {
  const { dataset, publication, linkId } = data;
  const banner = `<div class="preview-banner"><span class="preview-dot"></span> ${e(
    dataset.demo ? bannerCopy.preview : bannerCopy.published,
  )} <span class="preview-copy">${e(
    dataset.demo
      ? fictional(dataset)
        ? bannerCopy.fictional
        : bannerCopy.placeholder
      : bannerCopy.publishedLine(dataset.asOf, publication?.id ?? ""),
  )}</span></div>`;
  const nav = navLinks
    .map(
      (n) =>
        `<a href="${e(publicationUrl(n.href, linkId))}" class="${n.title === "Scorecard" ? "active" : ""}">${e(n.title)}</a>`,
    )
    .join("");
  const header = `<header class="site-header"><div class="header-inner"><a class="brand" href="${e(
    publicationUrl("/scorecard/", linkId),
  )}"><span class="brand-symbol">IV<span></span></span><span>RESTORE<br><strong>THE FOURTH</strong></span></a><nav aria-label="Main navigation">${nav}</nav><a class="about-link" href="${e(
    headerCopy.missionUrl,
  )}">${e(headerCopy.mission)} ${icons.arrowUpRight(15)}</a></div></header>`;
  const freshness = publication
    ? `<div class="freshness"><p class="container"><span>${e(
        updatedLabel(publication.createdAt),
      )}</span><a href="${e(
        publicationUrl("/scorecard/methodology", linkId),
      )}">${e(methodologyLinkLabel)}</a></p></div>`
    : "";
  return `<a class="skip-link" href="#main">${e(headerCopy.skip)}</a>${banner}${header}${freshness}<main id="main">${main}</main>`;
}

const groupOrder: Group[] = ["reformer", "mixed", "surveillance", "unproven"];
// Immutable publications render the same home content every time; keep a few per isolate.
const homeCache = new Map<string, string>();

/** Home: one-line heading, finder (state list and name box), count row and "Browse all". */
export function renderHome(data: PageData): string {
  const { dataset, publication, linkId } = data;
  const key = `${publication?.id ?? `demo:${dataset.id}`}|${linkId ?? ""}`;
  const cached = homeCache.get(key);
  if (cached !== undefined) return chrome(data, cached);
  const score = scorer(data);
  const active = dataset.members.filter((m) => m.status === "active");
  const states = [...new Set(active.map((m) => m.state))].sort();
  const counts = new Map<Group, number>();
  for (const m of active) {
    const g = score(m).group;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const finder = `<div class="container finder-wrap"><section class="finder" aria-labelledby="server-finder-title"><h2 id="server-finder-title">${e(
    finderCopy.title,
  )}</h2><div class="finder-controls"><label><span>${e(
    finderCopy.state,
  )}</span><select name="state"><option value="">${e(
    finderCopy.chooseState,
  )}</option>${states.map((s) => `<option>${e(s)}</option>`).join("")}</select></label><label><span>${e(
    finderCopy.name,
  )}</span><input type="search" name="q" placeholder="${e(
    finderCopy.namePlaceholder,
  )}" autocomplete="off" value=""></label></div><p class="finder-note">${e(
    finderCopy.privacy,
  )}</p><p class="finder-note">${e(finderCopy.districtHelp)} <a href="${e(
    finderCopy.houseUrl,
  )}" rel="noopener noreferrer">${e(finderCopy.houseLink)}</a></p><div class="finder-results"></div></section></div>`;
  const countRow = `<nav class="count-row" aria-label="${e(countRowLabel)}">${groupOrder
    .map(
      (g) =>
        `<a class="count-link ${g}" href="${e(
          publicationUrl(`/scorecard/?group=${g}#browse=all`, linkId),
        )}"><span class="count-icon ${g}" aria-hidden="true"></span>${e(
          groupCountLabel(g, counts.get(g) ?? 0),
        )}</a>`,
    )
    .join("")}</nav>`;
  // "Browse all" is a fragment link here; the app replaces it with the same control as a button.
  const browse = `<div class="browse-bar"><a class="button" href="#browse=all">${e(
    browseAllLabel(active.length),
  )}${icons.chevronDown}</a><a class="subtle-link" href="${e(
    publicationUrl("/scorecard/former", linkId),
  )}">${e(headerCopy.formerMembers)} ${icons.arrowRight}</a><a class="subtle-link" href="${e(
    publicationUrl("/scorecard/research", linkId),
  )}">${e(headerCopy.research)} ${icons.arrowUpRight(16)}</a></div>`;
  const main = `<section class="hero-line container"><h1>${e(
    heroCopy.home,
  )}</h1></section>${finder}<section class="container scorecard-section" aria-label="Explore legislators">${countRow}${browse}</section>`;
  if (homeCache.size >= 8) homeCache.delete(homeCache.keys().next().value!);
  homeCache.set(key, main);
  return chrome(data, main);
}

function avatar(m: Member): string {
  if (
    m.portrait?.url.startsWith("/scorecard/portraits/") &&
    m.portrait.reviewedBy &&
    m.portrait.attribution
  )
    return `<img class="avatar large" src="${e(m.portrait.url)}" alt="" loading="lazy" title="${e(
      m.portrait.attribution,
    )}">`;
  const initials = m.name
    .split(" ")
    .map((n) => n[0])
    .join("");
  return `<span aria-hidden="true" class="avatar large ${e(m.party.toLowerCase())}">${e(initials)}</span>`;
}

/**
 * Member profile headline: name, party, state, chamber, grade, "N of M aligned" and the split.
 * The current party is the roster's; evidence rows (and their party at the time) are left to the app.
 */
export function renderMember(data: PageData, m: Member): string {
  const { dataset, linkId } = data;
  const s = scorer(data)(m);
  const bands = dataset.rubric.gradeBands ?? defaultGradeBands;
  const summary = profileSummary(s, dataset.votes);
  const band = s.value === null ? null : bandRange(s.grade, bands);
  const split = splitDisplay(s, m.party);
  const noun = scoredNoun(hasCosponsorships(dataset.votes));
  const count = (n: number) => `${n} ${n === 1 ? noun.slice(0, -1) : noun}`;
  const portraitCaption = m.portrait?.url.startsWith("/scorecard/portraits/")
    ? `<figcaption><a href="${e(m.portrait.rightsSource)}" rel="noreferrer">${e(
        m.portrait.attribution,
      )}</a></figcaption>`
    : "";
  const lines = [
    headlineCopy.aligned(summary.aligned, summary.scored, summary.years),
    scoredLabel(s, dataset.votes),
    ...(band ? [bandLine(band)] : []),
    ...(summary.notVoted > 0 ? [headlineCopy.notVoted(summary.notVoted)] : []),
  ];
  const splitHtml =
    split.kind === "comparable"
      ? `<div class="split-bars">${(
          [
            [splitCopy.ownLabel, split.own],
            [splitCopy.otherLabel, split.other],
          ] as const
        )
          .map(
            ([label, part]) =>
              `<div class="split-side"><span class="split-label">${e(
                label,
              )}</span><div class="split-bar" aria-hidden="true"><span class="split-fill motion-fill" style="width: ${part.percent}%;"></span></div><strong class="split-percent">${part.percent}%</strong><small class="split-count">${e(
                count(part.count),
              )}</small></div>`,
          )
          .join("")}</div>`
      : split.kind === "unproven"
        ? `<p class="split-counts"><strong>${e(split.counts)}</strong></p><p>${e(split.message)}</p>`
        : `<p>${e(split.message)}</p>`;
  const main = `<section class="container inner-page"><a class="back-link" href="${e(
    publicationUrl("/scorecard/", linkId),
  )}">${icons.arrowLeft} ${e(profileCopy.back)}</a><div class="profile-heading"><figure class="profile-portrait">${avatar(
    m,
  )}${portraitCaption}</figure><div><div class="eyebrow">${e(
    profileCopy.eyebrow(fictional(dataset), m.status),
  )}</div><h1>${e(m.name)}</h1><p>${e(
    `${m.party} · ${m.state} · ${m.chamber}${m.district !== undefined ? `, District ${m.district}` : ""}`,
  )}</p></div></div><div class="profile-layout"><aside class="profile-sidebar"><div class="profile-grade"><span class="grade ${gradeTone(
    s.grade,
    s.value,
    bands,
  )}" aria-label="${e(
    s.value === null
      ? notGradedLabel(dataset.rubric.minVotes)
      : `Grade ${s.grade}`,
  )}">${e(s.grade)}</span><h2>${e(
    s.value === null
      ? notGradedLabel(dataset.rubric.minVotes)
      : profileCopy.alignment(fmt(s.value)),
  )}</h2></div><ul class="headline-lines">${lines
    .map((l) => `<li>${e(l)}</li>`)
    .join(
      "",
    )}</ul></aside><div class="profile-main"><div class="panel"><div class="section-heading"><h2>${e(
    profileCopy.splitHeading,
  )}</h2></div><p class="muted">${e(splitCopy.meaning)}</p>${splitHtml}</div></div></div></section>`;
  return chrome(data, main);
}
