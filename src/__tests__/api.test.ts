import { describe, expect, it } from "vitest";
import { audioUrl } from "../api";

describe("audioUrl", () => {
  it("derives jamendo id from mp3 filename title", () => {
    expect(audioUrl({ title: "12345.mp3" })).toBe(
      "/audio/download/track/12345/mp32/",
    );
  });

  it("prefers externalId over title", () => {
    expect(audioUrl({ title: "99999.mp3", externalId: "777" })).toBe(
      "/audio/download/track/777/mp32/",
    );
  });

  it("returns null for mock tracks (no mp3 title, no externalId)", () => {
    expect(audioUrl({ title: "Neon Bloom" })).toBeNull();
  });
});
