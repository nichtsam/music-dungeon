import { describe, expect, it } from "vitest";
import { topMood, paletteFor } from "../theme";
import type { TrackModels } from "../api";

const M = (moods: Record<string, number>): TrackModels => ({ moods, bpm: null, genre: null });

describe("topMood", () => {
  it("returns null for undefined models", () => {
    expect(topMood(undefined)).toBeNull();
    expect(topMood(null)).toBeNull();
  });
  it("returns null for empty moods", () => {
    expect(topMood(M({}))).toBeNull();
  });
  it("returns the highest-scoring mood", () => {
    expect(topMood(M({ dark: 0.3, happy: 0.8, sad: 0.5 }))).toBe("happy");
  });
  it("works for single-mood models", () => {
    expect(topMood(M({ calm: 1.0 }))).toBe("calm");
  });
});

describe("paletteFor", () => {
  it("returns a palette with glow and accent for known mood", () => {
    const pal = paletteFor(M({ dark: 0.9 }));
    expect(pal.glow).toBeDefined();
    expect(pal.accent).toBeDefined();
    expect(pal.glow).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("falls back to calm palette for null/unknown mood", () => {
    const fallback = paletteFor(null);
    const calm = paletteFor(M({ calm: 1.0 }));
    expect(fallback).toEqual(calm);
  });
  it("falls back to calm for unrecognized top mood", () => {
    const pal = paletteFor(M({ unrecognized: 1.0 }));
    const calm = paletteFor(M({ calm: 1.0 }));
    expect(pal).toEqual(calm);
  });
  it("each known mood returns a distinct glow color", () => {
    const moods = ["dark", "sad", "calm", "happy", "energetic", "aggressive"];
    const glows = moods.map((mood) => paletteFor(M({ [mood]: 1.0 })).glow);
    const unique = new Set(glows);
    expect(unique.size).toBe(moods.length);
  });
});
