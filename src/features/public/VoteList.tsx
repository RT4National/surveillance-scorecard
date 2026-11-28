import { useState } from "react";
import type { Vote } from "../../core/types";
import { base, Provenance, publicUrl, type Props } from "./pageShared";

export function congressLabel(date: string): string {
  const parsed = new Date(date);
  const year = parsed.getUTCFullYear();
  // Modern Congresses begin on January 3 of odd-numbered years.
  const beforeOpening = parsed.getUTCMonth() === 0 && parsed.getUTCDate() < 3;
  const congress = Math.floor((year - Number(beforeOpening) - 1789) / 2) + 1;
  if (!Number.isFinite(congress) || congress < 1) return "Other dates";
  const suffix = [11, 12, 13].includes(congress % 100)
    ? "th"
    : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[
        congress % 10
      ] ?? "th");
  return `${congress}${suffix} Congress`;
}

export function VoteList({ dataset, publication }: Props) {
  const [topic, setTopic] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const groups = new Map<string, Vote[]>();
  const votes = dataset.votes
    .filter(
      (vote) =>
        (!topic || vote.topic === topic) &&
        [vote.bill, vote.title, vote.commonName].some((value) =>
          value?.toLowerCase().includes(query),
        ),
    )
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  for (const vote of votes) {
    const label = congressLabel(vote.date);
    const group = groups.get(label) ?? [];
    group.push(vote);
    groups.set(label, group);
  }

  return (
    <section className="public-page">
      <h1>Legislation &amp; votes</h1>
      <Provenance dataset={dataset} publication={publication} />
      <div className="public-controls">
        <label>
          Search votes
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Issue
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="">All issues</option>
            {[...new Set(dataset.votes.map((vote) => vote.topic))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
      </div>
      {!votes.length && <p role="status">No votes match these filters.</p>}
      {[...groups].map(([congress, items]) => (
        <section key={congress}>
          <h2>{congress}</h2>
          <div className="public-grid">
            {items.map((vote) => (
              <article key={vote.id}>
                <small>
                  {vote.date} · {vote.chamber} ·{" "}
                  {vote.kind === "cosponsorship" ? "Bill support" : "Roll call"}
                </small>
                <h3>
                  <a
                    href={publicUrl(
                      `${base}/legislation/${encodeURIComponent(vote.id)}`,
                      publication,
                    )}
                  >
                    {vote.bill}: {vote.title}
                  </a>
                </h3>
                {vote.commonName && <p>{vote.commonName}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
