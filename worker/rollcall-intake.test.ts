import { expect, it, vi } from "vitest";
import { stageOfficialRollcall } from "./rollcall-intake";

const source = "https://clerk.house.gov/evs/2025/roll002.xml";
const xml = `<rollcall-vote><vote-metadata><congress>119</congress><session>1st</session><rollcall-num>2</rollcall-num><legis-num>H R 1</legis-num><vote-question>On Passage</vote-question><action-date>3-Jan-2025</action-date><vote-totals><totals-by-vote><yea-total>1</yea-total></totals-by-vote></vote-totals></vote-metadata><vote-data><recorded-vote><legislator name-id="A000001" party="D">Example</legislator><vote>Yea</vote></recorded-vote></vote-data></rollcall-vote>`;

it("stages official ballots and a capture from a House Clerk page link", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
  const stage = await stageOfficialRollcall(
    "https://clerk.house.gov/Votes/20252",
    undefined,
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ redirect: "manual" }),
  );
  expect(stage.records).toEqual([
    {
      memberId: "A000001",
      voteId: "house-119-1-2",
      outcome: "Yes",
      partyAtVote: "Democratic",
    },
  ]);
  expect(stage.sources[0]).toMatchObject({
    url: source,
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});

it("requires an official source before fetching and refuses redirects", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 302 }));
  await expect(
    stageOfficialRollcall(
      "https://example.org/roll002.xml",
      undefined,
      fetcher,
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    stageOfficialRollcall(source, undefined, fetcher),
  ).rejects.toMatchObject({ status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("requires the configured Senate crosswalk and reports a missing LIS identity", async () => {
  const url =
    "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00002.htm";
  const senate = `<roll_call_vote><congress>119</congress><session>1</session><vote_number>2</vote_number><vote_date>January 9, 2025</vote_date><question>On Passage</question><document><document_name>S. 5</document_name></document><count><yeas>0</yeas><nays>1</nays></count><members><member><lis_member_id>S123</lis_member_id><party>I</party><vote_cast>Nay</vote_cast></member></members></roll_call_vote>`;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(senate));
  await expect(
    stageOfficialRollcall(url, undefined, fetcher),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    stageOfficialRollcall(url, '{"S124":"A000001"}', fetcher),
  ).rejects.toMatchObject({
    status: 422,
    message: expect.stringContaining("S123"),
  });
  await expect(
    stageOfficialRollcall(url, '{"S123":"A000001"}', fetcher),
  ).resolves.toMatchObject({
    records: [
      {
        memberId: "A000001",
        voteId: "senate-119-1-2",
        outcome: "No",
        partyAtVote: "Independent",
      },
    ],
  });
});
