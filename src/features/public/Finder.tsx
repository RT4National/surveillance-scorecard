import { useId, useRef } from "react";
import { useScorecard } from "../../data/context";
import { publicationUrl } from "../../core/navigation";
import {
  changeStateLabel,
  districtLabel,
  finderCopy,
  stateGridLabel,
  finderHeading,
  showingFirst,
} from "../../core/copy";
import type { Member } from "../../core/types";
import { Avatar, Grade } from "./member";
import { base, delegation, fmt, normalize } from "./helpers";
import { filterMotionLimit, useFilterClass } from "./motion";
import { stateAbbreviation, stateFragment } from "../../core/states";

const searchLimit = 10;

function Row({ member }: { member: Member }) {
  const { score, linkId } = useScorecard();
  const s = score(member);
  return (
    <li data-filter-row="">
      <a
        className="finder-row"
        href={publicationUrl(`${base}/members/${member.id}`, linkId)}
      >
        <Grade member={member} />
        <Avatar member={member} />
        <span className="finder-name">
          <strong>{member.name}</strong>
          <small>
            {member.party} ·{" "}
            {member.chamber === "Senate"
              ? finderCopy.senate
              : districtLabel(member.district)}
          </small>
        </span>
        <span className="finder-value">
          {s.value === null ? finderCopy.notGraded : fmt(s.value)}
        </span>
      </a>
    </li>
  );
}

function Group({ label, list }: { label: string; list: Member[] }) {
  if (!list.length) return null;
  return (
    <>
      <h3>{finderHeading(label, list.length)}</h3>
      <ul className="finder-list">
        {list.map((m) => (
          <Row key={m.id} member={m} />
        ))}
      </ul>
    </>
  );
}

/**
 * State picker and name search. The state is held by the caller (URL fragment);
 * the name search is local and never written to the URL. Nothing here asks for an address.
 */
export function Finder({
  state,
  onState,
  name,
  onName,
  level,
}: {
  state: string;
  onState: (state: string) => void;
  name: string;
  onName: (name: string) => void;
  level: 1 | 2;
}) {
  const { members } = useScorecard();
  const id = useId();
  const select = useRef<HTMLSelectElement>(null);
  const active = members.filter((m) => m.status === "active");
  const states = [...new Set(active.map((m) => m.state))].sort();
  const chosen = states.includes(state) ? state : "";
  const terms = normalize(name).split(/\s+/).filter(Boolean);
  const named = (m: Member) =>
    terms.every((t) => normalize(m.name).includes(t));
  const list = chosen ? delegation(members, chosen).filter(named) : [];
  const matches =
    terms.length && !chosen
      ? active.filter(named).sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const Heading = level === 1 ? "h1" : "h2";
  const rowCount = chosen ? list.length : Math.min(matches.length, searchLimit);
  // Older browsers use the shared enter-only animation.
  const motion = useFilterClass(`${chosen}|${name}`, rowCount);
  return (
    <section className="finder" aria-labelledby={`${id}-title`}>
      <Heading id={`${id}-title`}>{finderCopy.title}</Heading>
      <div className="finder-controls">
        <label>
          <span>{finderCopy.state}</span>
          <select
            ref={select}
            name="state"
            value={chosen}
            onChange={(e) => onState(e.target.value)}
          >
            <option value="">{finderCopy.chooseState}</option>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{finderCopy.name}</span>
          <input
            type="search"
            name="q"
            placeholder={finderCopy.namePlaceholder}
            autoComplete="off"
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
      </div>
      <nav className="state-grid" aria-label={stateGridLabel}>
        {states.map((s) => (
          <a
            key={s}
            href={`#${stateFragment(s)}`}
            aria-label={s}
            title={s}
            aria-current={s === chosen ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onState(s);
            }}
          >
            {stateAbbreviation(s)}
          </a>
        ))}
      </nav>
      <p className="finder-note">{finderCopy.privacy}</p>
      <p className="finder-note">
        {finderCopy.districtHelp}{" "}
        <a href={finderCopy.houseUrl} rel="noopener noreferrer">
          {finderCopy.houseLink}
        </a>
      </p>
      <div
        className={`finder-results ${motion}`.trim()}
        data-filter-list={rowCount <= filterMotionLimit ? "" : undefined}
      >
        {terms.length > 0 && !chosen && (
          <>
            <h3>
              {finderHeading(finderCopy.matches, matches.length)}
              {matches.length > searchLimit && (
                <small> · {showingFirst(searchLimit)}</small>
              )}
            </h3>
            <ul className="finder-list">
              {matches.slice(0, searchLimit).map((m) => (
                <Row key={m.id} member={m} />
              ))}
            </ul>
          </>
        )}
        {chosen && (
          <>
            <p className="finder-chosen">
              <strong>{chosen}</strong> ·{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  onState("");
                  select.current?.focus();
                }}
              >
                {changeStateLabel}
              </button>
            </p>
            <Group
              label={finderCopy.senate}
              list={list.filter((m) => m.chamber === "Senate")}
            />
            <Group
              label={finderCopy.house}
              list={list.filter((m) => m.chamber !== "Senate")}
            />
          </>
        )}
      </div>
    </section>
  );
}
