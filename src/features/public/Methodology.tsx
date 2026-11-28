import { dataLicence } from "../../core/dataExports";
import { useEffect } from "react";
import { correctionCopy, headerCopy } from "../../core/copy";
import { defaultGradeBands } from "../../core/scoring";
import { base, Provenance, publicUrl, type Props } from "./pageShared";
import { Legend } from "./Legend";

export function Methodology({ dataset, publication }: Props) {
  const { rubric } = dataset;
  const licence = dataLicence(dataset);
  const bands = rubric.gradeBands ?? defaultGradeBands;
  useEffect(() => {
    if (location.hash === "#sources")
      document.getElementById("sources")?.scrollIntoView?.();
  }, []);

  return (
    <section className="public-page">
      <h1>How grades work</h1>
      <Provenance dataset={dataset} publication={publication} />
      <h2>What we score</h2>
      <p>
        The scorecard covers selected congressional actions on surveillance
        reform. Each item lists the reform position, the weight it carries, and
        the reason it was included.
      </p>
      <p>
        Missed votes contribute no points or weight. Actions outside the scoring
        window and records from before a member took office are also excluded.
      </p>
      <p>
        Cosponsoring a pro-reform bill can only raise the alignment score.
        Cosponsoring an anti-reform bill can only lower it. Members who do not
        cosponsor receive no record for that item.
      </p>
      <Legend />

      <h2>Calculate a grade</h2>
      <p>
        Alignment is 100 × the total weight of actions aligned with reform ÷ the
        total weight of scored actions. A grade requires at least{" "}
        {rubric.minVotes} scored actions.
      </p>
      {rubric.lookbackYears !== undefined && (
        <p>
          Only actions from the {rubric.lookbackYears}-year window before the
          evidence cutoff count.
        </p>
      )}
      {rubric.halfLifeYears !== undefined && (
        <p>
          An action’s weight halves every {rubric.halfLifeYears} years as it
          ages.
        </p>
      )}
      <div
        className="public-table"
        role="region"
        aria-label="Grade bands"
        tabIndex={0}
      >
        <table>
          <caption>Grade bands in rubric {rubric.version}</caption>
          <thead>
            <tr>
              <th scope="col">Grade</th>
              <th scope="col">Minimum alignment</th>
            </tr>
          </thead>
          <tbody>
            {[...bands]
              .sort((a, b) => b.minimum - a.minimum)
              .map((band) => (
                <tr key={band.label}>
                  <th scope="row">{band.label}</th>
                  <td>At least {band.minimum}% weighted alignment</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h2>Compare across presidents</h2>
      <p>
        The split shows alignment under presidents from the member’s own party
        and from another party, using the member’s party at the time of each
        action. Independents do not receive a displayed split.
      </p>
      <p>
        A comparison needs the overall grade minimum and at least{" "}
        {rubric.minPerContext} scored actions in each group.
        {(rubric.minSharedTopics ?? 0) > 0 &&
          ` It also needs at least ${rubric.minSharedTopics} shared topics.`}
      </p>
      <p>
        The issues that come to a vote change across presidencies, and members
        have different opportunities to vote. A difference between the two
        scores cannot establish why a member voted as they did.
      </p>

      <h2 id="sources">Sources and reuse</h2>
      <p>
        Vote pages link to official House Clerk and Senate records or
        Congress.gov. Portraits carry their own attribution and rights
        information.
      </p>
      {dataset.sources.length > 0 && (
        <ul>
          {dataset.sources.map((source) => (
            <li key={source.sha256 + source.url}>
              <a href={source.url}>{source.kind} source</a> · retrieved{" "}
              {source.retrievedAt}
            </li>
          ))}
        </ul>
      )}
      <p>
        {licence ? (
          <>
            The scorecard data is available under{" "}
            <a href={licence.url}>{licence.name}</a>.
          </>
        ) : (
          "Restore the Fourth is still confirming the reuse licence for the scorecard text and data."
        )}
      </p>

      <h2>Contact staff about a record</h2>
      <p>
        Choose “Report an error” beside the record on a{" "}
        <a href={publicUrl(`${base}/legislation`, publication)}>vote page</a> or
        a member profile. Include an official source staff can check.
      </p>
      <p>{correctionCopy.next}</p>
      <p>
        For general inquiries, visit{" "}
        <a href={headerCopy.missionUrl}>Restore the Fourth</a>.
      </p>
      <p>
        <a href={publicUrl(`${base}/methodology/lab`, publication)}>
          Try the grading rules in the rubric lab
        </a>
      </p>
    </section>
  );
}
