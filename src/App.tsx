import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  FlaskConical,
  History,
  Info,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useScorecard } from "./data/context";
import { groupLabels, scoreMember } from "./core/scoring";
import type { Dataset, Publication } from "./core/publication";
import { publishedScore } from "./core/publication-scores";
import {
  LegislationPage,
  ComparePage,
  ReportsPage,
  ArchivesPage,
  RepresentativeFinder,
  CorrectionForm,
} from "./features/public";
import { EditorPage } from "./features/editor/EditorPage";
import { PolicyLab } from "./features/PolicyLab";
import { toCsv } from "./core/research";
import type { Group, Member } from "./core/types";

const base = "/scorecard";
const query = () => new URLSearchParams(window.location.search);
const readAsOf = (dataset: Dataset) => {
  const date = query().get("asOf");
  return date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date <= dataset.asOf
    ? date
    : dataset.asOf;
};
const publicationUrl = (
  path: string,
  publicationId?: string,
  asOf?: string,
) => {
  const params = new URLSearchParams();
  if (publicationId) params.set("publication", publicationId);
  if (asOf) params.set("asOf", asOf);
  return path + (params.size ? `?${params}` : "");
};
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
const readFilters = (): Filters =>
  Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [k, query().get(k) ?? v]),
  ) as Filters;
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const fmt = (n: number | null) =>
  n === null ? "Not yet rated" : `${Math.round(n)}%`;
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
  asOf?: string,
  publication?: Publication,
) {
  const rubric = dataset.rubric;
  const score = (m: Member, date = dataset.asOf) =>
    publication
      ? publishedScore(publication, m, date)
      : scoreMember(m, dataset.votes, dataset.records, rubric, date);
  return [
    [
      dataset.demo
        ? "Fictional preview — not actual congressional records"
        : "Restore the Fourth surveillance scorecard",
    ],
    ["Dataset", dataset.id],
    ["Publication", publication?.id ?? "unpublished"],
    ["Scorer", publication?.scoring?.version ?? "legacy/recalculated"],
    ["Rubric", rubric.version],
    ["As of", asOf ?? dataset.asOf],
    [
      "Name",
      "Party",
      "State",
      "Chamber",
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
function Avatar({
  member,
  large = false,
}: {
  member: Member;
  large?: boolean;
}) {
  if (
    member.portrait?.url.startsWith("/scorecard/portraits/") &&
    member.portrait.reviewedBy &&
    member.portrait.attribution
  )
    return (
      <img
        className={`avatar ${large ? "large" : ""}`}
        src={member.portrait.url}
        alt=""
        loading="lazy"
        title={member.portrait.attribution}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`avatar ${large ? "large" : ""} ${member.party.toLowerCase()}`}
    >
      {member.name
        .split(" ")
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
function Grade({ member, asOf }: { member: Member; asOf?: string }) {
  const { score } = useScorecard();
  const s = score(member, asOf);
  return (
    <span
      className={`grade ${s.value === null ? "unrated" : s.value >= 80 ? "good" : s.value >= 50 ? "mixed" : "poor"}`}
      aria-label={`Grade ${s.grade === "—" ? "not yet rated" : s.grade}`}
    >
      {s.grade}
    </span>
  );
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
  const { score, publication } = useScorecard();
  return (
    <div className="table-scroll">
      <table className="member-table">
        <thead>
          <tr>
            <th>Legislator</th>
            <th>Party / Chamber</th>
            <th>Grade</th>
            <th>Reform alignment</th>
            <th>Across administrations</th>
            <th>
              <span className="sr-only">Profile</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const s = score(m, asOf);
            return (
              <tr key={m.id}>
                <td>
                  <a
                    className="member-name"
                    href={publicationUrl(
                      `${base}/members/${m.id}`,
                      publication?.id,
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
                <td>
                  <span className={`party-dot ${m.party.toLowerCase()}`} />
                  {m.party}
                  <small>{m.chamber}</small>
                </td>
                <td>
                  <Grade member={m} asOf={asOf} />
                </td>
                <td>
                  <span className="alignment-text">{fmt(s.value)}</span>
                  <div className="meter">
                    <span style={{ width: `${s.value ?? 0}%` }} />
                  </div>
                </td>
                <td>
                  <span className={`category ${s.group}`}>
                    <span />
                    {s.group === "reformer"
                      ? "Consistent reformer"
                      : s.group === "surveillance"
                        ? "Surveillance supporter"
                        : "Conditional / unproven"}
                  </span>
                  <small>
                    {s.counted} scored votes ·{" "}
                    {s.reason.startsWith("Unproven")
                      ? "More evidence needed"
                      : "Both contexts reviewed"}
                  </small>
                </td>
                <td>
                  <a
                    className="icon-link"
                    href={publicationUrl(
                      `${base}/members/${m.id}`,
                      publication?.id,
                      asOf,
                    )}
                    aria-label={`View ${m.name}'s profile`}
                  >
                    <ArrowUpRight size={18} />
                  </a>
                </td>
              </tr>
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
export default function App() {
  const {
    dataset,
    members,
    publication,
    state: dataState,
    error: dataError,
  } = useScorecard();
  const path = window.location.pathname.replace(/\/$/, "");
  const isArchive = path === `${base}/archive`;
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const listener = () => setFilters(readFilters());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
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
    const params = query();
    Object.entries(next).forEach(([k, v]) =>
      v && v !== defaults[k as keyof Filters]
        ? params.set(k, v)
        : params.delete(k),
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }
  function reset() {
    setFilters(defaults);
    const p = query();
    Object.keys(defaults).forEach((key) => p.delete(key));
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (p.size ? `?${p}` : ""),
    );
  }
  const nav = [
    { href: `${base}/`, title: "Scorecard" },
    { href: `${base}/legislation`, title: "Legislation" },
    { href: `${base}/compare`, title: "Compare" },
    { href: `${base}/research`, title: "Research" },
    { href: `${base}/methodology`, title: "Methodology" },
    { href: `${base}/archive`, title: "Archive" },
  ];
  const member = path.startsWith(`${base}/members/`)
    ? members.find((m) => m.id === path.split("/").at(-1))
    : undefined;
  const knownPath =
    path === base || nav.some((n) => n.href === path) || !!member;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="preview-banner">
        <span className="preview-dot" />{" "}
        {dataState === "loading"
          ? "LOADING SCORECARD"
          : dataset.demo
            ? "DESIGN PREVIEW"
            : "PUBLISHED SCORECARD"}{" "}
        <span className="preview-copy">
          {dataset.demo
            ? "Fictional members and votes. Explore the proposed experience."
            : `Evidence through ${dataset.asOf} · Publication ${publication?.id}`}
        </span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={`${base}/`}>
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
            {nav.map((n) => (
              <a
                key={n.href}
                href={publicationUrl(n.href, publication?.id)}
                className={
                  n.href.replace(/\/$/, "") === path ||
                  (n.title === "Scorecard" && !!member)
                    ? "active"
                    : ""
                }
              >
                {n.title}
              </a>
            ))}
          </nav>
          <a className="about-link" href="https://restorethe4th.com/">
            Our mission <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <main id="main">
        {path === `${base}/editor` ? (
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
        ) : member ? (
          <Profile member={member} copy={copy} />
        ) : path === `${base}/research` || path === `${base}/reports` ? (
          <ReportsPage dataset={dataset} publication={publication} />
        ) : path === `${base}/compare` ? (
          <ComparePage dataset={dataset} publication={publication} />
        ) : path === `${base}/legislation` ||
          path.startsWith(`${base}/legislation/`) ? (
          <LegislationPage
            dataset={dataset}
            publication={publication}
            voteId={path.split("/")[3]}
          />
        ) : path === `${base}/archive` || path === `${base}/archives` ? (
          <ArchivesPage dataset={dataset} publication={publication} />
        ) : path === `${base}/find` ? (
          <section className="container inner-page">
            <RepresentativeFinder dataset={dataset} />
          </section>
        ) : path === `${base}/methodology` ? (
          <PolicyLab dataset={dataset} />
        ) : !knownPath ? (
          <section className="container empty">
            <h1>Profile not found</h1>
            <p>This address does not match a member in this preview.</p>
            <a href={`${base}/`}>Return to the scorecard</a>
          </section>
        ) : (
          <>
            <section className="hero container">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> THE SURVEILLANCE SCORECARD
                </div>
                <h1>
                  {isArchive ? (
                    <>
                      The record.
                      <br />
                      <em>Over time.</em>
                    </>
                  ) : (
                    <>
                      Privacy is a right.
                      <br />
                      <em>Who votes like it?</em>
                    </>
                  )}
                </h1>
                <p>
                  {isArchive
                    ? "Explore former members and revisit the evidence available at a moment in time."
                    : "Follow the votes. Understand the record. See who protects your privacy—and whose principles change with the presidency."}
                </p>
                <a className="text-link" href={`${base}/methodology`}>
                  Every grade has a paper trail <ArrowRight size={16} />
                </a>
              </div>
              <aside className="hero-note">
                <div className="note-top">
                  <ShieldCheck size={23} />
                  <span>PRINCIPLES OVER PARTY</span>
                </div>
                <h2>
                  A voting record.
                  <br />
                  Not a campaign promise.
                </h2>
                <p>
                  We look at actions across administrations to see where support
                  for surveillance reform holds up.
                </p>
                <div className="note-foot">
                  <span className="tiny-line" /> Transparent scores. Accountable
                  power.
                </div>
              </aside>
            </section>
            <section
              className="container scorecard-section"
              aria-label="Explore legislators"
            >
              <div className="section-heading">
                <div>
                  <div className="eyebrow muted">
                    {isArchive ? "HISTORICAL EXPLORER" : "EXPLORE THE RECORD"}
                  </div>
                  <h2>
                    {isArchive ? "The archive" : "Find your legislators"}
                    <span className="count-pill">
                      {
                        members.filter((m) =>
                          isArchive
                            ? m.status !== "active"
                            : m.status === "active",
                        ).length
                      }{" "}
                      {dataset.demo ? "demo members" : "members"}
                    </span>
                  </h2>
                </div>
                <a className="subtle-link" href={`${base}/research`}>
                  Build a research report <ArrowUpRight size={16} />
                </a>
              </div>
              <Directory
                filters={filters}
                setFilter={changeFilter}
                reset={reset}
                archive={isArchive}
                copy={copy}
              />
            </section>
            <section className="container bottom-callout">
              <div>
                <span className="eyebrow">FOLLOW THE EVIDENCE</span>
                <h2>A score should start a conversation.</h2>
                <p>
                  Open a profile to see the votes, the calculation, and what the
                  record can—and cannot—tell us.
                </p>
              </div>
              <a className="button dark" href={`${base}/methodology`}>
                Explore the methodology <ArrowRight size={16} />
              </a>
            </section>
          </>
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
          <a href={`${base}/methodology#sources`}>Sources & reuse</a>
          <span>
            {" "}
            ·{" "}
            {dataset.demo
              ? "Fictional preview"
              : `Evidence through ${dataset.asOf}`}
          </span>
          <br />
          <a href={`${base}/editor`}>Staff workspace</a> ·{" "}
          <a href={`${base}/find`}>Find my representatives</a>
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
}: {
  filters: Filters;
  setFilter: (k: keyof Filters, v: string) => void;
  reset: () => void;
  archive: boolean;
  copy: (text: string) => Promise<void>;
}) {
  const { score, dataset, members, publication } = useScorecard();
  const [asOf, setAsOf] = useState(readAsOf(dataset));
  const [status, setStatus] = useState(query().get("status") || "all");
  const source = members.filter((m) =>
    archive
      ? m.status !== "active" && (status === "all" || m.status === status)
      : m.status === "active",
  );
  const date = archive ? asOf : undefined;
  const filtered = source
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
  const counts = (group: Group) =>
    source.filter((m) => score(m, date).group === group).length;
  const groups: { key: Group; short: string; description: string }[] = [
    {
      key: "reformer",
      short: "Consistent reformers",
      description: "Support reform under presidents of both parties.",
    },
    {
      key: "conditional",
      short: "Conditional & unproven",
      description: "A mixed record, or more evidence still needed.",
    },
    {
      key: "surveillance",
      short: "Surveillance supporters",
      description: "Support surveillance under presidents of both parties.",
    },
  ];
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
      <div className="group-cards">
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() =>
              setFilter("group", filters.group === g.key ? "" : g.key)
            }
            className={`group-card ${g.key} ${filters.group === g.key ? "selected" : ""}`}
            aria-pressed={filters.group === g.key}
          >
            <div>
              <span className="category-dot" />
              <strong>{g.short}</strong>
              <span className="group-count">{counts(g.key)}</span>
            </div>
            <p>{g.description}</p>
            <span className="group-action">
              Explore group <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <div className="directory-panel">
        <div className="filter-bar">
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
          <Select
            label="Chamber"
            value={filters.chamber}
            onChange={(v) => setFilter("chamber", v)}
          >
            <option value="">All chambers</option>
            <option>House</option>
            <option>Senate</option>
          </Select>
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
          <Select
            label="Party"
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
                  toCsv(exportRows(filtered, dataset, date, publication)),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <ArrowDownToLine size={15} /> Export
            </button>
          </div>
        </div>
        <MemberTable list={filtered} asOf={date} />
        <div className="table-footer">
          <Info size={14} />
          <span>
            Grades reflect reform-aligned votes. Consistency is evaluated
            separately. <a href={`${base}/methodology`}>How scoring works</a>
          </span>
          <span className="demo-stamp">
            {dataset.demo ? "FICTIONAL DATA" : dataset.asOf}
          </span>
        </div>
      </div>
    </>
  );
}
function Profile({
  member,
  copy,
}: {
  member: Member;
  copy: (text: string) => Promise<void>;
}) {
  const { score, dataset, rubric, publication } = useScorecard();
  const [asOf, setAsOf] = useState(readAsOf(dataset));
  const s = score(member, asOf);
  return (
    <section className="container inner-page">
      <a className="back-link" href={`${base}/`}>
        <ArrowLeft size={16} /> All legislators
      </a>
      <div className="profile-heading">
        <Avatar member={member} large />
        <div>
          <div className="eyebrow">
            {dataset.demo ? "FICTIONAL LEGISLATOR" : "LEGISLATOR"} ·{" "}
            {member.status.toUpperCase()}
          </div>
          <h1>{member.name}</h1>
          <p>
            {member.party} · {member.state} · {member.chamber}
            {member.district !== undefined
              ? `, District ${member.district}`
              : ""}
          </p>
        </div>
        <button
          className="button"
          onClick={() => void copy(window.location.href)}
        >
          <Copy size={15} /> Copy profile link
        </button>
      </div>
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <Grade member={member} asOf={asOf} />
          <h2>{fmt(s.value)} reform alignment</h2>
          <p>
            {Number(s.earned.toFixed(2))} aligned weighted points out of{" "}
            {Number(s.possible.toFixed(2))} possible · {s.counted} scored votes
          </p>
          <span className={`category ${s.group}`}>{groupLabels[s.group]}</span>
          <p>{s.reason}</p>
          <hr />
          <h3>Committees & caucuses</h3>
          <p>
            {[...member.committees, ...member.caucuses].join(" · ") ||
              "No current memberships listed"}
          </p>
          <p className="muted">
            Service begins {member.since}.{" "}
            {dataset.demo
              ? "Demonstration record."
              : "See the publication sources for verification."}
          </p>
        </aside>
        <div className="profile-main">
          <div className="panel">
            <div className="section-heading">
              <h2>Principles across presidencies</h2>
              <ShieldCheck size={20} />
            </div>
            <p className="muted">
              A strong score alone does not prove consistency. We compare the
              record in both party contexts.
            </p>
            <div className="context-grid">
              <div>
                <span>President of their own party</span>
                <strong>{fmt(s.ownScore)}</strong>
                <small>{s.ownCount} cast votes</small>
              </div>
              <div>
                <span>President of another party</span>
                <strong>{fmt(s.otherScore)}</strong>
                <small>{s.otherCount} cast votes</small>
              </div>
            </div>
            {s.topicCoverageWarning && (
              <p className="coverage-warning">
                <Info size={15} /> {s.topicCoverageWarning}
              </p>
            )}
            <p className="footnote">
              {s.sharedTopics.length} shared issue topics across party contexts.
              Different issue mixes can affect this comparison.
            </p>
          </div>
          <div className="panel">
            <div className="section-heading">
              <h2>
                <History size={18} /> Explore the record over time
              </h2>
              <input
                aria-label="Profile evidence through date"
                type="date"
                min="2021-01-01"
                max={dataset.asOf}
                value={asOf}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setAsOf(e.target.value);
                  const p = query();
                  p.set("asOf", e.target.value);
                  window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}?${p}`,
                  );
                }}
              />
            </div>
            <p className="muted">
              {publication?.scoring && asOf === dataset.asOf
                ? `Frozen published grade · scorer ${publication.scoring.version} · rubric ${rubric.version}.`
                : `Recalculated with rubric ${rubric.version} and the current scoring engine.`}{" "}
              <a href={publicationUrl(`${base}/archive`, publication?.id)}>
                View immutable published versions
              </a>{" "}
              to see what was actually published at the time.
            </p>
            <div className="timeline">
              {[...new Set(s.evidence.map((e) => e.vote.date.slice(0, 4)))]
                .slice(-3)
                .map((year) =>
                  `${year}-12-31` > dataset.asOf
                    ? dataset.asOf
                    : `${year}-12-31`,
                )
                .map((d) => (
                  <button
                    key={d}
                    aria-pressed={d === asOf}
                    onClick={() => {
                      setAsOf(d);
                      const p = query();
                      p.set("asOf", d);
                      window.history.replaceState(
                        null,
                        "",
                        `${window.location.pathname}?${p}`,
                      );
                    }}
                  >
                    <small>{d.slice(0, 4)}</small>
                    <Grade member={member} asOf={d} />
                    <span>Evidence through {d}</span>
                  </button>
                ))}
            </div>
          </div>
          <div className="panel">
            <div className="section-heading">
              <h2>The evidence behind the grade</h2>
              <span className="count-pill">{s.evidence.length} records</span>
            </div>
            {s.evidence.map((e) => (
              <div className="evidence-row" key={e.voteId}>
                <div
                  className={`vote-mark ${!e.scored ? "neutral" : e.aligned ? "yes" : "no"}`}
                >
                  {!e.scored ? (
                    "—"
                  ) : e.aligned ? (
                    <Check size={18} />
                  ) : (
                    <X size={18} />
                  )}
                </div>
                <div>
                  <strong>{e.vote.title}</strong>
                  <p>{e.vote.rationale}</p>
                  <small>
                    {e.vote.date} ·{" "}
                    <a
                      href={`${base}/legislation/${encodeURIComponent(e.vote.id)}${publication ? `?publication=${encodeURIComponent(publication.id)}` : ""}`}
                    >
                      {e.vote.bill}
                    </a>{" "}
                    · {e.vote.topic} ·{" "}
                    {e.vote.source ? (
                      <a href={e.vote.source} rel="noreferrer" target="_blank">
                        Official source
                      </a>
                    ) : (
                      "Fictional source"
                    )}
                  </small>
                </div>
                <div className="vote-result">
                  <strong>{e.outcome}</strong>
                  <small>
                    {e.scored
                      ? `${Number((e.aligned ? e.effectiveWeight : 0).toFixed(2))} / ${Number(e.effectiveWeight.toFixed(2))} points`
                      : e.inWindow
                        ? "Excluded: not cast"
                        : "Outside scoring window"}
                  </small>
                </div>
              </div>
            ))}
            {!s.evidence.length && <p>No evidence before this date.</p>}
            <p className="footnote">
              {dataset.demo
                ? "Fictional evidence is not an official source."
                : `Publication ${publication?.id} · rubric ${rubric.version}.`}{" "}
              {dataset.coverage.join(" ")}
            </p>
          </div>
          <CorrectionForm
            dataset={dataset}
            publication={publication}
            memberId={member.id}
          />
          <div className="panel">
            <h2>Service, party and membership history</h2>
            {dataset.affiliations?.some((a) => a.memberId === member.id) ? (
              <ul className="method-list">
                {dataset.affiliations
                  .filter((a) => a.memberId === member.id)
                  .sort((a, b) => b.start.localeCompare(a.start))
                  .map((a, i) => (
                    <li key={`${a.kind}-${a.start}-${i}`}>
                      <strong>
                        {a.name} · {a.kind}
                      </strong>
                      <span>
                        {a.start} – {a.end ?? "ongoing"} ·{" "}
                        {a.precision === "year"
                          ? "Year-level dates; exact transition day not established"
                          : "Exact dated interval"}{" "}
                        ·{" "}
                        <a href={a.source} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>
                Historical service and membership intervals have not been
                supplied for this publication. Current labels do not establish
                past affiliation.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
