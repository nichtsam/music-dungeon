import { describe, expect, it } from "vitest";
import {
  agilityShare,
  completenessOf,
  derivePlayerStats,
  DWELL_TARGET,
  sprintMaxSeconds,
  sprintMultiplier,
} from "../stats";
import type { TrackInfo } from "../dungeon";

const T = (id: string, bpm: number | null): TrackInfo => ({
  id,
  title: id,
  models: { moods: {}, bpm, genre: null },
});

// --- completenessOf -------------------------------------------------------

describe("completenessOf", () => {
  it("maps dwell to 0..1 against DWELL_TARGET", () => {
    expect(completenessOf(undefined)).toBe(0);
    expect(completenessOf(DWELL_TARGET / 2)).toBe(0.5);
    expect(completenessOf(DWELL_TARGET * 2)).toBe(1);
  });
});

// --- agilityShare ---------------------------------------------------------

describe("agilityShare", () => {
  it("maps slow tracks to stamina, fast to agility", () => {
    expect(agilityShare(60)).toBe(0);
    expect(agilityShare(120)).toBe(0.5);
    expect(agilityShare(180)).toBe(1);
  });
  it("clamps outside 60..180", () => {
    expect(agilityShare(40)).toBe(0);
    expect(agilityShare(220)).toBe(1);
  });
  it("splits evenly when bpm unknown", () => {
    expect(agilityShare(null)).toBe(0.5);
  });
});

// --- derivePlayerStats ------------------------------------------------------

// helper: check only the core attunement axes (not combat-derived fields)
const axes = (s: ReturnType<typeof derivePlayerStats>) => ({ agility: s.agility, stamina: s.stamina });

describe("derivePlayerStats", () => {
  const tracks = {
    fast: T("fast", 180),
    slow: T("slow", 60),
    mid: T("mid", 150),
  };
  const placed = { fast: "0,0,0", slow: "1,0,0", mid: "2,0,0" };

  it("returns zero with no dwell", () => {
    expect(axes(derivePlayerStats({}, placed, tracks))).toEqual({ agility: 0, stamina: 0 });
  });

  it("ignores rooms below DWELL_TARGET", () => {
    const dwell = { "0,0,0": DWELL_TARGET - 1 };
    expect(axes(derivePlayerStats(dwell, placed, tracks))).toEqual({ agility: 0, stamina: 0 });
  });

  it("grants 1 point per attuned track, split by bpm", () => {
    const dwell = { "0,0,0": DWELL_TARGET, "1,0,0": DWELL_TARGET };
    expect(axes(derivePlayerStats(dwell, placed, tracks))).toEqual({
      agility: 1, // fast: 180bpm -> all agility
      stamina: 1, // slow: 60bpm -> all stamina
    });
  });

  it("sums fractional splits across tracks", () => {
    const dwell = { "2,0,0": DWELL_TARGET * 3 }; // extra dwell doesn't stack
    expect(axes(derivePlayerStats(dwell, placed, tracks))).toEqual({
      agility: 0.75, // 150bpm
      stamina: 0.25,
    });
  });

  it("splits evenly for tracks with missing models", () => {
    const dwell = { "0,0,0": DWELL_TARGET };
    const bare = { fast: { id: "fast", title: "fast" } };
    expect(axes(derivePlayerStats(dwell, { fast: "0,0,0" }, bare))).toEqual({
      agility: 0.5,
      stamina: 0.5,
    });
  });

  it("counts historic attunement from totalDwell even without current dwell", () => {
    const totalDwell = { fast: DWELL_TARGET + 5 };
    expect(axes(derivePlayerStats({}, placed, tracks, {}, totalDwell))).toEqual({
      agility: 1,
      stamina: 0,
    });
  });

  it("derives combat stats from agility and stamina", () => {
    const dwell = { "0,0,0": DWELL_TARGET, "1,0,0": DWELL_TARGET }; // 1 agility, 1 stamina
    const s = derivePlayerStats(dwell, placed, tracks);
    expect(s.maxHP).toBe(60); // 50 + 1*10
    expect(s.attackRate).toBeCloseTo(0.76); // 0.8 - 1*0.04
    expect(s.attackDmg).toBe(14); // 10 + (1+1)*2
  });

  it("attackRate clamps at 0.3s minimum", () => {
    // need 12.5 agility to hit the floor: 0.8 - 12.5*0.04 = 0.3
    const manyFast = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`t${i}`, `${i},0,0`]));
    const fastTracks = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`t${i}`, T(`t${i}`, 180)]));
    const fullDwell = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${i},0,0`, DWELL_TARGET]));
    const s = derivePlayerStats(fullDwell, manyFast, fastTracks);
    expect(s.attackRate).toBeGreaterThanOrEqual(0.3);
  });
});

// --- sprint scaling ---------------------------------------------------------

describe("sprint scaling", () => {
  it("starts at 2x speed and 1.5s duration", () => {
    expect(sprintMultiplier(0)).toBe(2);
    expect(sprintMaxSeconds(0)).toBe(1.5);
  });
  it("grows with stats", () => {
    expect(sprintMultiplier(5)).toBe(2.5);
    expect(sprintMaxSeconds(5)).toBe(4);
  });
});
