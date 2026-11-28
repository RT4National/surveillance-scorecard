import { useEffect, useState, type ReactNode } from "react";
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
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useScorecard } from "./data/context";
import { groupLabels, scoreMember } from "./core/scoring";
import type { Dataset, Publication } from "./core/publication";
import { publishedScore } from "./core/publication-scores";
import { publicationUrl } from "./core/navigation";
import { matchRoute } from "./core/routes";
import {
  LegislationPage,
  ComparePage,
  ReportsPage,
  ArchivesPage,
  RepresentativeFinder,
} from "./features/public";
import { Profile } from "./features/public/Profile";
import { Avatar, Grade } from "./features/public/member";
import {
  base,
  fictional,
  fmt,
  query,
  readAsOf,
} from "./features/public/helpers";
import { EditorPage } from "./features/editor/EditorPage";
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
const readFilters = (): Filters =>
  Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [k, query().get(k) ?? v]),
  ) as Filters;
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
        ? fictional(dataset)
          ? "Fictional preview — not actual congressional records"
          : "Preview — real records, unreviewed placeholder scores"
        : "Restore the Fourth surveillance scorecard",
    ],
    ["Dataset", dataset.id],
    ["Publication", publication?.id ?? "unpublished"],
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
  const { score, publication } = useScorecard();
  return (
    <div className="table-scroll">
      <table className="member-table">
        <thead>
          <tr>
            <th>Legislator</th>
            <th>Current party / chamber</th>
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
                        : s.group === "mixed"
                          ? "Mixed record"
                          : "Not enough evidence"}
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
  const route = matchRoute(window.location.pathname);
  const isFormer = route.name === "former";
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
  const member =
    route.name === "member"
      ? members.find((m) => m.id === route.id)
      : undefined;
  const notFoundPage = (
    <section className="container empty">
      <h1>Page not found</h1>
      <a href={publicationUrl(`${base}/`, publication?.id)}>
        Back to the directory
      </a>
    </section>
  );
  const directoryPage = (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> THE SURVEILLANCE SCORECARD
          </div>
          <h1>
            {isFormer ? (
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
            {isFormer
              ? "Explore former members and revisit the evidence available at a moment in time."
              : "Follow the votes. Understand the record. See who protects your privacy—and whose principles change with the presidency."}
          </p>
          <a
            className="text-link"
            href={publicationUrl(`${base}/methodology`, publication?.id)}
          >
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
            We look at actions across administrations to see where support for
            surveillance reform holds up.
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
              {isFormer ? "HISTORICAL EXPLORER" : "EXPLORE THE RECORD"}
            </div>
            <h2>
              {isFormer ? "Former members" : "Find your legislators"}
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
              publication?.id,
            )}
          >
            {isFormer ? "Current members" : "Former members"}{" "}
            <ArrowRight size={16} />
          </a>
          <a
            className="subtle-link"
            href={publicationUrl(`${base}/research`, publication?.id)}
          >
            Build a research report <ArrowUpRight size={16} />
          </a>
        </div>
        <Directory
          filters={filters}
          setFilter={changeFilter}
          reset={reset}
          archive={isFormer}
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
        <a
          className="button dark"
          href={publicationUrl(`${base}/methodology`, publication?.id)}
        >
          Explore the methodology <ArrowRight size={16} />
        </a>
      </section>
    </>
  );
  function routePage(): ReactNode {
    switch (route.name) {
      case "home":
      case "former":
        return directoryPage;
      case "member":
        return member ? <Profile member={member} copy={copy} /> : notFoundPage;
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
            <RepresentativeFinder dataset={dataset} />
          </section>
        );
      case "methodology":
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
            ? fictional(dataset)
              ? "Fictional members and votes. Explore the proposed experience."
              : "Real congressional records. Scores use unreviewed placeholder vote directions, not Restore the Fourth's positions."
            : `Evidence through ${dataset.asOf} · Publication ${publication?.id}`}
        </span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href={publicationUrl(`${base}/`, publication?.id)}
          >
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
                  (n.title === "Scorecard" && (!!member || isFormer))
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
          <a
            href={publicationUrl(
              `${base}/methodology#sources`,
              publication?.id,
            )}
          >
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
          <a href={publicationUrl(`${base}/find`, publication?.id)}>
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
      key: "mixed",
      short: "Mixed record",
      description:
        "Voted both ways, or differently depending on the president's party.",
    },
    {
      key: "unproven",
      short: "Not enough evidence",
      description:
        "Too few scored votes, or votes under only one party's president.",
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
        <p>
          Current party and chamber describe the roster in this publication,
          including the last recorded affiliation for former members. Historical
          date filters narrow vote evidence, not roster membership.
        </p>
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
            label="Current chamber"
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
            separately.{" "}
            <a href={publicationUrl(`${base}/methodology`, publication?.id)}>
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
    </>
  );
}
