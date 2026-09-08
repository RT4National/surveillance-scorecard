import { describe, expect, it } from "vitest";
import {
  parseHouseDirectory,
  parseSenateDirectory,
} from "./public-directories";
const occupied = `<member><statedistrict>AQ00</statedistrict><member-info><bioguideID>A000001</bioguideID><official-name>Example Member</official-name><party>R</party><state postal-code="AS"/><sworn-date date="20250103"/></member-info><committee-assignments><committee rank=""/></committee-assignments></member>`;
const vacant = `<member><statedistrict>CA01</statedistrict><member-info><bioguideID/><footnote>Vacancy due to resignation.</footnote></member-info></member>`;
const house = `<MemberData publish-date="September 2, 2026"><members>${occupied}${vacant}</members><committees><committee comcode="JU00"><committee-fullname>Committee on the Judiciary</committee-fullname></committee></committees></MemberData>`;
const senate = `<contact_information><member><bioguide_id>B000002</bioguide_id><first_name>Example</first_name><last_name>Senator</last_name><party>I</party><state>VT</state></member></contact_information>`;
describe("Public official directory supplemental staging", () => {
  it("retains Clerk American Samoa alias, placeholders and vacancies without claiming completed reconciliation", async () => {
    const result = await parseHouseDirectory(house);
    expect(result.complete).toBe(false);
    expect(result.members[0].state).toBe("AS");
    expect(result.members[0].swornDate).toBe("2025-01-03");
    expect(result.members[0].committees).toEqual([]);
    expect(result.vacancies).toHaveLength(1);
    expect(result.listedSeats).toBe(2);
  });
  it("joins committee codes to source names without inventing history start dates", async () => {
    const result = await parseHouseDirectory(
      house.replace(
        '<committee rank=""/>',
        '<committee comcode="JU00" rank="1"/>',
      ),
    );
    expect(result.members[0].committees).toEqual([
      { code: "JU00", name: "Committee on the Judiciary" },
    ]);
    expect("affiliations" in result).toBe(false);
  });
  it("refuses duplicate seats, invalid sworn dates and unrecognized committee codes", async () => {
    await expect(
      parseHouseDirectory(house.replace(occupied, occupied + occupied)),
    ).rejects.toThrow("duplicate");
    await expect(
      parseHouseDirectory(house.replace("20250103", "20250230")),
    ).rejects.toThrow("sworn");
    await expect(
      parseHouseDirectory(
        house.replace('<committee rank=""/>', '<committee comcode="UNKNOWN"/>'),
      ),
    ).rejects.toThrow("Unknown");
  });
  it("preserves Senate identifiers without inventing service or LIS identifiers", async () => {
    const result = await parseSenateDirectory(senate);
    expect(result.complete).toBe(false);
    expect(result.members[0].memberId).toBe("B000002");
    expect(result.members[0].swornDate).toBeUndefined();
    expect("lisId" in result.members[0]).toBe(false);
    await expect(
      parseSenateDirectory(
        senate.replace(
          "</contact_information>",
          senate.slice(
            senate.indexOf("<member>"),
            senate.indexOf("</contact_information>"),
          ) + "</contact_information>",
        ),
      ),
    ).rejects.toThrow("duplicate");
  });
  it("refuses malformed XML and entity declarations", async () => {
    await expect(
      parseHouseDirectory('<!ENTITY leak SYSTEM "file:///etc/passwd">' + house),
    ).rejects.toThrow("Invalid");
    await expect(parseSenateDirectory(senate.slice(0, -3))).rejects.toThrow(
      "Invalid",
    );
  });
});
