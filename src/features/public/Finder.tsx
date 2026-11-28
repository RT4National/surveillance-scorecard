import { useId } from "react";
import { useScorecard } from "../../data/context";
import { publicationUrl } from "../../core/navigation";
import {
  districtLabel,
  finderCopy,
  finderHeading,
  showingFirst,
} from "../../core/copy";
import type { Member } from "../../core/types";
import { Avatar, Grade } from "./member";
import { base, delegation, fmt, normalize } from "./helpers";

const searchLimit = 10;

function Row({ member }: { member: Member }) {
  const { score, publication } = useScorecard();
  const s = score(member);
  return (
    <li>
      <a
        className="finder-row"
        href={publicationUrl(`${base}/members/${member.id}`, publication?.id)}
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
  const active = members.filter((m) => m.status === "active");
  const states = [...new Set(active.map((m) => m.state))].sort();
  const chosen = states.includes(state) ? state : "";
  const terms = normalize(name).split(/\s+/).filter(Boolean);
  const named = (m: Member) =>
    terms.every((t) => normalize(m.name).includes(t));
  const list = chosen ? delegation(members, chosen).filter(named) : [];
  const matches = terms.length && !chosen
    ? active
        .filter(named)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className="finder" aria-labelledby={`${id}-title`}>
      <Heading id={`${id}-title`}>{finderCopy.title}</Heading>
      <div className="finder-controls">
        <label>
          <span>{finderCopy.state}</span>
          <select value={chosen} onChange={(e) => onState(e.target.value)}>
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
            placeholder={finderCopy.namePlaceholder}
            autoComplete="off"
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
      </div>
      <p className="finder-note">{finderCopy.privacy}</p>
      <p className="finder-note">
        {finderCopy.districtHelp}{" "}
        <a href={finderCopy.houseUrl} rel="noopener noreferrer">
          {finderCopy.houseLink}
        </a>
      </p>
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
    </section>
  );
}
