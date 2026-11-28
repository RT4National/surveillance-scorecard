// @vitest-environment jsdom
// Avatar picks the small thumbnail in lists and the original for the large profile portrait,
// in the app and in the Worker's first paint alike.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Avatar } from "./member";
import { demoDataset } from "../../data/demo-dataset";
import { renderHome, renderMember } from "../../../worker/render";
import type { Member } from "../../core/types";

afterEach(cleanup);
const base = demoDataset.members.find((m) => m.status === "active")!;
const portrait = {
  url: "/scorecard/portraits/A000055-e602.jpg",
  attribution: "Photo: public domain",
  rights: "public-domain" as const,
  rightsSource: "https://commons.wikimedia.org/wiki/File:A.jpg",
  reviewedBy: "reviewer",
};
const member: Member = { ...base, portrait };
const img = () => document.querySelector("img")!;

describe("Avatar", () => {
  it("uses the thumbnail for small avatars, with a size and lazy loading", () => {
    render(<Avatar member={member} />);
    expect(img().getAttribute("src")).toBe(
      "/scorecard/portraits/A000055-e602.w96.jpg",
    );
    expect(img().getAttribute("width")).toBe("39");
    expect(img().getAttribute("height")).toBe("43");
    expect(img().getAttribute("loading")).toBe("lazy");
  });
  it("uses the original for the large profile portrait", () => {
    render(<Avatar member={member} large />);
    expect(img().getAttribute("src")).toBe(portrait.url);
    expect(img().getAttribute("width")).toBe("86");
    expect(img().getAttribute("height")).toBe("94");
    expect(img().getAttribute("loading")).toBe("lazy");
  });
  it("falls back to the original when a thumbnail is missing", () => {
    render(<Avatar member={member} />);
    fireEvent.error(img());
    expect(img().getAttribute("src")).toBe(portrait.url);
  });
  it("still shows initials for unreviewed, unattributed or external portraits", () => {
    for (const p of [
      { ...portrait, reviewedBy: "" },
      { ...portrait, attribution: "" },
      { ...portrait, url: "https://upload.wikimedia.org/x.jpg" },
    ]) {
      render(<Avatar member={{ ...member, portrait: p }} />);
      expect(document.querySelector("img")).toBeNull();
      cleanup();
    }
  });
  it("matches the Worker's first paint: thumbnail in the finder, original on the profile", () => {
    const dataset = {
      ...demoDataset,
      members: demoDataset.members.map((m) =>
        m.id === member.id ? member : m,
      ),
    };
    const home = renderHome({ dataset });
    expect(home).toContain(
      'src="/scorecard/portraits/A000055-e602.w96.jpg" alt="" loading="lazy" decoding="async" width="39" height="43"',
    );
    expect(home).not.toContain('src="/scorecard/portraits/A000055-e602.jpg"');
    const profile = renderMember({ dataset }, member);
    expect(profile).toContain(
      'src="/scorecard/portraits/A000055-e602.jpg" alt="" loading="lazy" decoding="async" width="86" height="94"',
    );
  });
});
