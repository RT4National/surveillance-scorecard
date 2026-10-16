import { describe, expect, it } from "vitest";
import { applyMemberships } from "./memberships";

const members = [
  { id: "A000001", committees: ["Old"], caucuses: [] as string[] },
  { id: "B000002", committees: [] as string[], caucuses: [] as string[] },
];
describe("current committee and caucus memberships", () => {
  it("replaces committees with top-level names and adds confident caucus matches", () => {
    const result = applyMemberships(
      members,
      [
        {
          memberId: "A000001",
          name: "House Committee on the Judiciary",
          parent: null,
        },
        { memberId: "A000001", name: "Subcommittee on Crime", parent: "HSJU" },
        {
          memberId: "A000001",
          name: "House Committee on the Judiciary",
          parent: null,
        },
        {
          memberId: "Z000009",
          name: "Senate Committee on Finance",
          parent: null,
        },
      ],
      [
        {
          name: "Liberty Caucus",
          members: [
            { memberId: "A000001", confidence: "high" },
            { memberId: "B000002", confidence: "low" },
          ],
        },
      ],
    );
    expect(result.members).toEqual([
      {
        id: "A000001",
        committees: ["House Committee on the Judiciary"],
        caucuses: ["Liberty Caucus"],
      },
      { id: "B000002", committees: [], caucuses: [] },
    ]);
    expect(result.skipped).toEqual({
      unknownMembers: ["Z000009"],
      lowConfidence: 1,
    });
  });
});
