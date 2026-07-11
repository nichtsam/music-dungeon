import { describe, expect, it } from "vitest";
import {
  DOOR_THRESHOLD,
  doorLabel,
  generateExits,
  hashKey,
  keyOf,
  valence,
  type RoomCell,
} from "../dungeon";
import type { ScoredTrack, TrackModels } from "../api";

const mk = (id: string, score: number): ScoredTrack => ({
  score,
  track: { id, title: id },
});
const M = (moods: Record<string, number>, bpm: number | null = 100): TrackModels => ({
  moods,
  bpm,
  genre: null,
});

// --- hashKey ------------------------------------------------------------------

describe("hashKey", () => {
  it("is deterministic", () => {
    expect(hashKey("0,0,0")).toBe(hashKey("0,0,0"));
    expect(hashKey("hello")).toBe(hashKey("hello"));
  });
  it("produces different values for different inputs", () => {
    expect(hashKey("0,0,0")).not.toBe(hashKey("1,0,0"));
    expect(hashKey("abc")).not.toBe(hashKey("xyz"));
  });
  it("returns a non-negative integer", () => {
    const h = hashKey("test");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
  });
});

// --- valence ------------------------------------------------------------------

describe("valence", () => {
  it("returns 0 for undefined models", () => {
    expect(valence(undefined)).toBe(0);
  });
  it("is positive for happy/uplifting tracks", () => {
    expect(valence(M({ happy: 0.8, uplifting: 0.7 }))).toBeGreaterThan(0);
  });
  it("is negative for dark/sad tracks", () => {
    expect(valence(M({ dark: 0.9, sad: 0.6 }))).toBeLessThan(0);
  });
  it("bright tracks have higher valence than dark tracks", () => {
    const bright = valence(M({ happy: 0.9, uplifting: 0.8 }));
    const dark = valence(M({ dark: 0.9, sad: 0.8 }));
    expect(bright).toBeGreaterThan(dark);
  });
});

// --- doorLabel ----------------------------------------------------------------

describe("doorLabel", () => {
  it("falls back to '% similar' when models missing", () => {
    expect(doorLabel(undefined, undefined, 0.8)).toBe("80% similar");
    expect(doorLabel(M({}), undefined, 0.75)).toBe("75% similar");
  });
  it("picks the dominant mood delta", () => {
    expect(doorLabel(M({ dark: 0.2 }), M({ dark: 0.6 }), 0.8)).toBe("darker");
    expect(doorLabel(M({ dark: 0.6 }), M({ dark: 0.2 }), 0.8)).toBe("brighter");
  });
  it("picks BPM over a weak mood delta", () => {
    // BPM diff 40 = full swing; mood diff 0.05 = below threshold
    const label = doorLabel(M({ calm: 0.5 }, 80), M({ calm: 0.55 }, 120), 0.8);
    expect(label).toBe("faster");
  });
  it("picks largest delta when multiple moods qualify", () => {
    // energetic: +0.15 (exceeds 0.12 threshold), dark: +0.3 (larger)
    const label = doorLabel(
      M({ energetic: 0.2, dark: 0.1 }),
      M({ energetic: 0.35, dark: 0.4 }),
      0.8,
    );
    expect(label).toBe("darker");
  });
  it("falls back when delta below threshold", () => {
    expect(doorLabel(M({ dark: 0.5 }), M({ dark: 0.55 }), 0.9)).toBe("90% similar");
  });
});

// --- generateExits -----------------------------------------------------------

describe("generateExits", () => {
  const baseCells: Record<string, RoomCell> = {
    "0,0,0": { pos: [0, 0, 0], trackId: "self" },
  };
  const basePlaced: Record<string, string> = { self: "0,0,0" };
  const sims = ["a", "b", "c", "d", "e"].map((id, i) =>
    mk(id, 0.95 - i * 0.03),
  );
  const nbm = { a: M({ happy: 0.9 }), e: M({ dark: 0.9 }) };

  it("places 5 new rooms for 5 eligible similars", () => {
    const g = generateExits("0,0,0", baseCells, basePlaced, {}, sims, M({}), nbm);
    expect(g.exits.length).toBe(5);
  });

  it("assigns brightest track to 'up' and darkest to 'down'", () => {
    const g = generateExits("0,0,0", baseCells, basePlaced, {}, sims, M({}), nbm);
    expect(g.exits.find((e) => e.slot === "up")?.toTitle).toBe("a");
    expect(g.exits.find((e) => e.slot === "down")?.toTitle).toBe("e");
  });

  it("reciprocal door: entering a generated neighbor gives a door back", () => {
    const g1 = generateExits("0,0,0", baseCells, basePlaced, {}, sims, M({}), nbm);
    const cells2 = { ...baseCells, ...g1.newCells };
    for (const [k, c] of Object.entries(cells2)) if (k === "0,0,0") c.exits = g1.exits;
    const placed2 = { ...basePlaced, ...g1.newPlaced };
    const northKey = g1.exits.find((e) => e.slot === "north")!.toKey;
    const g2 = generateExits(
      northKey, cells2, placed2, { self: { id: "self", title: "self" } },
      [mk("e", 0.95), mk("self", 0.9), mk("z", 0.5)], M({}), {},
    );
    const back = g2.exits.find((e) => e.toKey === "0,0,0");
    expect(back?.kind).toBe("door");
    expect(back?.slot).toBe("south");
  });

  it("already-placed track becomes a portal, not a new room", () => {
    const g1 = generateExits("0,0,0", baseCells, basePlaced, {}, sims, M({}), nbm);
    const cells2 = { ...baseCells, ...g1.newCells };
    for (const [k, c] of Object.entries(cells2)) if (k === "0,0,0") c.exits = g1.exits;
    const placed2 = { ...basePlaced, ...g1.newPlaced };
    const northKey = g1.exits.find((e) => e.slot === "north")!.toKey;
    const g2 = generateExits(
      northKey, cells2, placed2, { self: { id: "self", title: "self" } },
      [mk("e", 0.95), mk("self", 0.9), mk("z", 0.5)], M({}), {},
    );
    expect(g2.exits.filter((e) => e.kind === "portal").length).toBe(1);
    expect(g2.exits.find((e) => e.kind === "portal")?.toKey).toBe(placed2.e);
  });

  it("below-threshold similars produce no new exits (dead end via reciprocal only)", () => {
    const g1 = generateExits("0,0,0", baseCells, basePlaced, {}, sims, M({}), nbm);
    const cells2 = { ...baseCells, ...g1.newCells };
    for (const [k, c] of Object.entries(cells2)) if (k === "0,0,0") c.exits = g1.exits;
    const placed2 = { ...basePlaced, ...g1.newPlaced };
    const northKey = g1.exits.find((e) => e.slot === "north")!.toKey;
    const g3 = generateExits(
      northKey, cells2, placed2, {},
      [mk("w1", 0.5), mk("w2", 0.4)], M({}), {},
    );
    expect(g3.exits.every((e) => e.kind === "door" && e.toKey === "0,0,0")).toBe(true);
  });

  it("entrance always offers at least one exit even below threshold", () => {
    const g4 = generateExits(
      "0,0,0",
      { "0,0,0": { pos: [0, 0, 0], trackId: "self" } },
      { self: "0,0,0" },
      {},
      [mk("w1", 0.5), mk("w2", 0.4)],
      M({}),
      {},
    );
    expect(g4.exits.length).toBe(1);
  });

  it("DOOR_THRESHOLD is 0.72", () => {
    expect(DOOR_THRESHOLD).toBe(0.72);
  });

  it("keyOf produces 'x,y,z' string", () => {
    expect(keyOf([1, 2, 3])).toBe("1,2,3");
    expect(keyOf([0, 0, 0])).toBe("0,0,0");
  });
});
