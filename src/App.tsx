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
import { dataset, members, records, votes } from "./data/demo";
import { groupLabels, rubric, scoreMember } from "./core/scoring";
import { rankByParty, toCsv, voteIntersection } from "./core/research";
import type { Group, Member } from "./core/types";

const base = "/scorecard";
const query = () => new URLSearchParams(window.location.search);
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
const score = (m: Member, asOf?: string) =>
  scoreMember(m, votes, records, rubric, asOf);
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
function exportRows(list: Member[], asOf?: string) {
  return [
    ["Fictional preview — not actual congressional records"],
    ["Dataset", dataset.id],
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
                    href={`${base}/members/${m.id}${asOf ? `?asOf=${asOf}` : ""}`}
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
                    href={`${base}/members/${m.id}${asOf ? `?asOf=${asOf}` : ""}`}
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
function Distribution({
  list,
  asOf,
  id = "distribution",
}: {
  list: Member[];
  asOf?: string;
  id?: string;
}) {
  const grades = ["A+", "A", "B", "C", "D", "F", "—"];
  const counts = grades.map(
    (g) => list.filter((m) => score(m, asOf).grade === g).length,
  );
  const max = Math.max(1, ...counts);
  return (
    <svg
      id={id}
      viewBox="0 0 560 230"
      role="img"
      aria-label={`Fictional grade distribution: ${grades.map((g, i) => `${g}: ${counts[i]}`).join(", ")}`}
    >
      <rect width="560" height="230" fill="#f8f8f2" />
      <text x="22" y="25" fill="#33483e" fontSize="13" fontFamily="sans-serif">
        Fictional preview · {list.length} members · {asOf ?? dataset.asOf}
      </text>
      {grades.map((g, i) => (
        <g key={g}>
          <rect
            x={32 + i * 75}
            y={164 - (counts[i] / max) * 100}
            width="38"
            height={(counts[i] / max) * 100}
            rx="4"
            fill={
              i < 3
                ? "#2f6555"
                : i < 5
                  ? "#b29a5e"
                  : i === 5
                    ? "#ac6858"
                    : "#9b9f98"
            }
          />
          <text
            x={51 + i * 75}
            y={153 - (counts[i] / max) * 100}
            textAnchor="middle"
            fontSize="13"
            fill="#33483e"
          >
            {counts[i]}
          </text>
          <text
            x={51 + i * 75}
            y="187"
            textAnchor="middle"
            fontSize="13"
            fill="#33483e"
          >
            {g}
          </text>
        </g>
      ))}
      <text x="22" y="215" fill="#616c64" fontSize="10" fontFamily="sans-serif">
        Proposal rubric {rubric.version} · Not actual congressional grades
      </text>
    </svg>
  );
}
export default function App() {
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
    window.history.replaceState(null, "", window.location.pathname);
  }
  const nav = [
    { href: `${base}/`, title: "Scorecard" },
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
        <span className="preview-dot" /> DESIGN PREVIEW{" "}
        <span className="preview-copy">
          Fictional members and votes. Explore the proposed experience.
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
                href={n.href}
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
        {member ? (
          <Profile member={member} copy={copy} />
        ) : path === `${base}/research` ? (
          <Research copy={copy} />
        ) : path === `${base}/methodology` ? (
          <Methodology />
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
                      demo members
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
          <span> · Fictional preview</span>
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
  const [asOf, setAsOf] = useState(query().get("asOf") || dataset.asOf);
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
            These fictional records are recalculated using the proposed rubric.
            Production archives will preserve the original publication and
            rubric.
          </p>
          <label>
            Evidence through
            <input
              type="date"
              min="2021-01-01"
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
                  "scorecard-demo.csv",
                  toCsv(exportRows(filtered, date)),
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
          <span className="demo-stamp">FICTIONAL DATA</span>
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
  const [asOf, setAsOf] = useState(query().get("asOf") || dataset.asOf);
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
            FICTIONAL LEGISLATOR · {member.status.toUpperCase()}
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
            {s.earned} aligned weighted points out of {s.possible} possible ·{" "}
            {s.counted} scored votes
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
            Demo service begins {member.since}. Initials stand in for licensed
            portraits.
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
              Recalculated with proposal {rubric.version}; these are not
              archived publications.
            </p>
            <div className="timeline">
              {["2022-12-31", "2024-12-31", "2026-09-07"].map((d) => (
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
                  <span>
                    {d < "2025"
                      ? "Democratic presidency"
                      : "Republican presidency"}
                  </span>
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
                    {e.vote.date} · {e.vote.bill} · {e.vote.topic} · Fictional
                    source
                  </small>
                </div>
                <div className="vote-result">
                  <strong>{e.outcome}</strong>
                  <small>
                    {e.scored
                      ? `${e.aligned ? e.vote.weight : 0} / ${e.vote.weight} points`
                      : "Excluded"}
                  </small>
                </div>
              </div>
            ))}
            {!s.evidence.length && <p>No evidence before this date.</p>}
            <p className="footnote">
              Real records will link to specific Congress.gov bills and official
              roll calls. No fictional vote is presented as an official source.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
function Research({ copy }: { copy: (text: string) => Promise<void> }) {
  const [mode, setMode] = useState(
    query().get("mode") === "intersection" ? "intersection" : "ranking",
  );
  const [limit, setLimit] = useState(
    Math.min(10, Math.max(1, Number(query().get("limit")) || 10)),
  );
  const [voteA, setVoteA] = useState(query().get("voteA") || "demo-house-1");
  const [voteB, setVoteB] = useState(query().get("voteB") || "demo-house-2");
  const [outcomeA, setOutcomeA] = useState(
    query().get("outcomeA") === "No" ? "No" : "Yes",
  );
  const [outcomeB, setOutcomeB] = useState(
    query().get("outcomeB") === "Yes" ? "Yes" : "No",
  );
  const [question, setQuestion] = useState("");
  const [help, setHelp] = useState("");
  const active = members.filter((m) => m.status === "active");
  const result =
    mode === "ranking"
      ? rankByParty(active, votes, records, limit)
      : voteIntersection(active, records, voteA, outcomeA, voteB, outcomeB);
  useEffect(() => {
    const p = new URLSearchParams({
      mode,
      limit: String(limit),
      voteA,
      voteB,
      outcomeA,
      outcomeB,
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  }, [mode, limit, voteA, voteB, outcomeA, outcomeB]);
  function ask() {
    const match = question
      .trim()
      .match(
        /^(?:show(?: me)? |give me )?(?:the )?(?:top|best) (\d+) democrats and (?:the )?(?:(?:top|best) )?(\d+) republicans[?.]?$/i,
      );
    if (match && match[1] === match[2] && +match[1] >= 1 && +match[1] <= 10) {
      setMode("ranking");
      setLimit(+match[1]);
      setHelp(
        "Matched the party-ranking template. Results below use the fictional dataset.",
      );
    } else
      setHelp(
        "This preview recognizes “top 10 Democrats and top 10 Republicans.” Use the vote comparison below for intersections. General AI questions are not connected yet.",
      );
  }
  return (
    <section className="container inner-page">
      <div className="eyebrow">THE RESEARCH DESK</div>
      <h1>
        Ask better questions.
        <br />
        <em>Share the evidence.</em>
      </h1>
      <p className="page-intro">
        Compare votes, find patterns, and take the results with you.
      </p>
      <div className="research-question">
        <FlaskConical size={24} />
        <div>
          <h2>Start with a question</h2>
          <p>
            Template-based preview. Grounded AI research is planned for the
            verified dataset.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              aria-label="Research question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Show me the top 10 Democrats and top 10 Republicans"
              maxLength={500}
            />
            <button className="button dark" type="submit">
              Explore <ArrowRight size={16} />
            </button>
          </form>
          <p role="status">{help}</p>
        </div>
      </div>
      <div className="panel">
        <div className="section-heading">
          <h2>Build your report</h2>
          <span className="count-pill">Fictional dataset</span>
        </div>
        <div className="segmented">
          <button
            aria-pressed={mode === "ranking"}
            onClick={() => setMode("ranking")}
          >
            Rank by party
          </button>
          <button
            aria-pressed={mode === "intersection"}
            onClick={() => setMode("intersection")}
          >
            Compare two votes
          </button>
        </div>
        <div className="query-controls">
          {mode === "ranking" ? (
            <>
              <Select
                label="Results per party"
                value={String(limit)}
                onChange={(v) => setLimit(+v)}
              >
                {[1, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </Select>
              <p>
                Democratic and Republican members, ranked separately by reform
                alignment. Unrated members are excluded; ties are ordered by
                name.
              </p>
            </>
          ) : (
            <>
              <Select label="First vote" value={voteA} onChange={setVoteA}>
                {votes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.bill} · {v.title}
                  </option>
                ))}
              </Select>
              <Select label="Voted" value={outcomeA} onChange={setOutcomeA}>
                <option>Yes</option>
                <option>No</option>
              </Select>
              <span>AND</span>
              <Select label="Second vote" value={voteB} onChange={setVoteB}>
                {votes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.bill} · {v.title}
                  </option>
                ))}
              </Select>
              <Select label="Voted" value={outcomeB} onChange={setOutcomeB}>
                <option>Yes</option>
                <option>No</option>
              </Select>
            </>
          )}
        </div>
      </div>
      <div className="report-heading">
        <div>
          <h2>{result.length} matching legislators</h2>
          <p>
            Active fictional members · {dataset.asOf} · {rubric.version}
          </p>
        </div>
        <div className="toolbar-actions">
          <button onClick={() => void copy(window.location.href)}>
            <Copy size={15} /> Share report
          </button>
          <button
            onClick={() =>
              void copy(
                exportRows(result)
                  .map((r) => r.join("\t"))
                  .join("\n"),
              )
            }
          >
            Copy table
          </button>
          <button
            onClick={() =>
              saveFile(
                "research-demo.csv",
                toCsv(exportRows(result)),
                "text/csv;charset=utf-8",
              )
            }
          >
            <ArrowDownToLine size={15} /> CSV
          </button>
        </div>
      </div>
      <div className="directory-panel">
        <MemberTable list={result} />
      </div>
      <div className="research-bottom">
        <div className="panel">
          <div className="section-heading">
            <h2>Grade distribution</h2>
            <button
              className="inline-button"
              onClick={() => {
                const svg = document.getElementById("research-chart");
                if (svg)
                  saveFile(
                    "fictional-scorecard-chart.svg",
                    new XMLSerializer().serializeToString(svg),
                    "image/svg+xml",
                  );
              }}
            >
              <ArrowDownToLine size={14} /> Download SVG
            </button>
          </div>
          <Distribution list={result} id="research-chart" />
        </div>
        <div className="panel">
          <div className="eyebrow">KNOW THE LIMITS</div>
          <h2>Evidence first. Always.</h2>
          <p>
            This report uses {members.length} fictional profiles and{" "}
            {votes.length} fictional roll calls. It does not describe Congress.
          </p>
          <p>
            Production reports will include official source links, publication
            versions, and coverage. An unanswered question should stay
            unanswered until the evidence is available.
          </p>
          <a className="text-link" href={`${base}/methodology#sources`}>
            Our source policy <ArrowRight size={15} />
          </a>
        </div>
      </div>
    </section>
  );
}
function Methodology() {
  const [minimum, setMinimum] = useState(rubric.minVotes);
  const [threshold, setThreshold] = useState(rubric.consistencyThreshold);
  const [selected, setSelected] = useState(members[0].id);
  const m = members.find((m) => m.id === selected)!;
  const settings = {
    ...rubric,
    minVotes: minimum,
    consistencyThreshold: threshold,
  };
  const result = scoreMember(m, votes, records, settings);
  return (
    <section className="container inner-page">
      <div className="eyebrow">AN OPEN METHODOLOGY</div>
      <h1>
        No black boxes.
        <br />
        <em>Just the record.</em>
      </h1>
      <p className="page-intro">
        Every grade should be reproducible. Every judgment should be
        explainable.
      </p>
      <div className="method-layout">
        <div>
          <div className="panel">
            <span className="step-number">01 / THE GRADE</span>
            <h2>Measure alignment, not years served.</h2>
            <p>
              We divide the weighted votes aligned with surveillance reform by
              the weight of all scored votes cast. A longer career does not
              automatically create a more extreme score.
            </p>
            <div className="formula">
              Reform-aligned weight <span>÷</span> Total cast-vote weight{" "}
              <span>× 100</span>
            </div>
            <p>
              At least {rubric.minVotes} cast votes are needed for a grade. “Not
              voting” and “Not eligible” do not count as opposition. Evidence
              counts remain visible.
            </p>
            <div className="grade-key">
              {[
                ["A+", "97–100"],
                ["A", "90–<97"],
                ["B", "80–<90"],
                ["C", "65–<80"],
                ["D", "50–<65"],
                ["F", "0–<50"],
              ].map(([g, range]) => (
                <div key={g}>
                  <strong>{g}</strong>
                  <small>{range}%</small>
                </div>
              ))}
            </div>
            <p className="footnote">
              Grades use unrounded scores. All thresholds and weights are a
              proposal for editorial review. This rubric does not force a
              particular distribution.
            </p>
          </div>
          <div className="panel">
            <span className="step-number">02 / THE CONSISTENCY</span>
            <h2>Principles should outlast a presidency.</h2>
            <p>
              We calculate alignment separately under presidents of the member’s
              party at the time and presidents of another party. Each context
              needs at least {rubric.minPerContext} cast votes.
            </p>
            <ul className="method-list">
              <li>
                <strong>Consistent reformer</strong>
                <span>At least 75% reform alignment in each context.</span>
              </li>
              <li>
                <strong>Consistent surveillance supporter</strong>
                <span>At most 25% reform alignment in each context.</span>
              </li>
              <li>
                <strong>Conditional / unproven</strong>
                <span>
                  Everyone else. Mixed voting and insufficient evidence are
                  labeled separately. This category alone does not establish a
                  partisan motive.
                </span>
              </li>
            </ul>
            <p className="footnote">
              Independent members remain unproven until an own-party alignment
              policy is approved. Party at the time of each vote is retained.
            </p>
          </div>
          <div className="panel" id="sources">
            <span className="step-number">03 / SOURCES & REUSE</span>
            <h2>Traceable, reusable public information.</h2>
            <p>
              <a href="https://www.congress.gov/">Congress.gov</a> is the
              intended primary source. Specific official House and Senate roll
              calls will supplement coverage. Each production record must carry
              its original source, retrieval date, and publication version.
            </p>
            <p>
              Portraits will prefer Wikimedia Commons, with per-image license
              and attribution checks. Preview initials avoid implying that an
              unreviewed image is cleared for reuse.
            </p>
            <p>
              The requested “CCBYA” license is provisionally interpreted as{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/">
                CC BY 4.0
              </a>
              , subject to confirmation. Third-party sources and images retain
              their own terms.
            </p>
            <p>
              Inspired by{" "}
              <a href="https://github.com/RT4National/DecideTheFuture">
                DecideTheFuture
              </a>
              . This is an original implementation with fictional records; it
              does not republish its code or data.
            </p>
          </div>
        </div>
        <aside>
          <div className="rubric-lab panel">
            <div className="eyebrow">
              <SlidersHorizontal size={15} /> RUBRIC LAB
            </div>
            <h2>Inspect the calculation.</h2>
            <p>
              Try a proposed threshold. Changes stay in this preview and never
              publish a grade.
            </p>
            <Select
              label="Fictional member"
              value={selected}
              onChange={setSelected}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <label className="range-label">
              Minimum votes for a grade <strong>{minimum}</strong>
              <input
                type="range"
                min="1"
                max="6"
                value={minimum}
                onChange={(e) => setMinimum(+e.target.value)}
              />
            </label>
            <label className="range-label">
              Consistency threshold <strong>{threshold}%</strong>
              <input
                type="range"
                min="60"
                max="100"
                step="5"
                value={threshold}
                onChange={(e) => setThreshold(+e.target.value)}
              />
            </label>
            <div className="lab-result">
              <span>PROPOSED RESULT</span>
              <strong>{result.grade}</strong>
              <p>
                {result.earned} ÷ {result.possible} × 100 = {fmt(result.value)}
              </p>
              <b>{groupLabels[result.group]}</b>
              <p>{result.reason}</p>
            </div>
            <button
              className="button"
              onClick={() => {
                setMinimum(rubric.minVotes);
                setThreshold(rubric.consistencyThreshold);
              }}
            >
              Reset proposal
            </button>
            <p className="footnote">
              Rubric {rubric.version} · local simulation
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
