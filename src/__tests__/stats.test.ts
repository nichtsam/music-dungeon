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
  it("maps slow tracks to 0, fast to 1", () => {
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

describe("derivePlayerStats", () => {
  const tracks = {
    fast: T("fast", 180),  // agilityShare=1
    slow: T("slow", 60),   // agilityShare=0
    mid:  T("mid",  150),  // agilityShare=0.75
  };
  const placed = { fast: "0,0,0", slow: "1,0,0", mid: "2,0,0" };

  it("returns base values with no dwell", () => {
    const s = derivePlayerStats({}, placed, tracks);
    expect(s.maxHP).toBe(50);
    expect(s.attackDmg).toBe(10);
    expect(s.agility).toBe(0);
    expect(s.stamina).toBe(0);
  });

  it("accumulates maxHP and attackDmg from all tracks regardless of BPM", () => {
    // fast+slow each 30s: pts=2 each → maxHP=50+2*5+2*5=70, attackDmg=10+2*1.25+2*1.25=15
    const dwell = { "0,0,0": DWELL_TARGET, "1,0,0": DWELL_TARGET };
    const s = derivePlayerStats(dwell, placed, tracks);
    expect(s.maxHP).toBe(70);
    expect(s.attackDmg).toBe(15);
    expect(s.agility).toBe(2);
    expect(s.stamina).toBe(2);
  });

  it("BPM weights agility and stamina independently", () => {
    // mid track (150bpm, f=0.75): pts=2 → maxHP=50+10=60, atkDmg=10+2.5=12.5, agi=1.5, stam=0.5
    const dwell = { "2,0,0": DWELL_TARGET * 3 };
    const s = derivePlayerStats(dwell, placed, tracks);
    expect(s.maxHP).toBe(60);
    expect(s.attackDmg).toBe(12.5);
    expect(s.agility).toBe(1.5);
    expect(s.stamina).toBe(0.5);
  });

  it("partial listen accumulates proportionally", () => {
    // 29s fast: pts=29/30 → maxHP=50+pts*5, attackDmg=10+pts*1.25, agility=pts
    const dwell = { "0,0,0": DWELL_TARGET - 1 };
    const s = derivePlayerStats(dwell, placed, tracks);
    const pts = (DWELL_TARGET - 1) / DWELL_TARGET;
    expect(s.maxHP).toBeCloseTo(50 + pts * 5);
    expect(s.attackDmg).toBeCloseTo(10 + pts * 1.25);
    expect(s.agility).toBeCloseTo(pts);
    expect(s.stamina).toBe(0);
  });

  it("unknown BPM gives agility = stamina = 0.5 × pts", () => {
    // bare track (f=0.5): pts=2 → maxHP=50+10=60, atkDmg=10+2.5=12.5, agi=1, stam=1
    const dwell = { "0,0,0": DWELL_TARGET };
    const bare = { fast: { id: "fast", title: "fast" } };
    const s = derivePlayerStats(dwell, { fast: "0,0,0" }, bare);
    expect(s.maxHP).toBe(60);
    expect(s.attackDmg).toBe(12.5);
    expect(s.agility).toBe(1);
    expect(s.stamina).toBe(1);
  });

  it("counts historic attunement from totalDwell", () => {
    const totalDwell = { fast: DWELL_TARGET + 5 };
    const s = derivePlayerStats({}, placed, tracks, {}, totalDwell);
    expect(s.maxHP).toBe(60);      // 50 + 2*5
    expect(s.attackDmg).toBe(12.5);  // 10 + 2*1.25
    expect(s.agility).toBe(2);
    expect(s.stamina).toBe(0);
  });

  it("counts past-run tracks via pastTracks when not in placed", () => {
    const totalDwell = { slow: DWELL_TARGET };
    const pastTracks = { slow: T("slow", 60) };
    const s = derivePlayerStats({}, {}, {}, {}, totalDwell, pastTracks);
    expect(s.maxHP).toBe(60);
    expect(s.attackDmg).toBe(12.5);
    expect(s.agility).toBe(0);
    expect(s.stamina).toBe(2);
  });

  it("duration bonus scales with track length", () => {
    // fast 60s track: pts=4 → maxHP=50+20=70, atkDmg=10+5=15, agi=4
    const s = derivePlayerStats({ "0,0,0": 60 }, { fast: "0,0,0" }, tracks, { fast: 60 });
    expect(s.maxHP).toBe(70);
    expect(s.attackDmg).toBe(15);
    expect(s.agility).toBe(4);
    expect(s.stamina).toBe(0);
  });

  it("attackRate derived from agility, clamped at 0.3s", () => {
    // fast+slow each 30s: agility=2 → rate = 0.8-2*0.04 = 0.72
    const dwell = { "0,0,0": DWELL_TARGET, "1,0,0": DWELL_TARGET };
    const s = derivePlayerStats(dwell, placed, tracks);
    expect(s.attackRate).toBeCloseTo(0.72);

    // 20 fast tracks: agility=40 → clamped to 0.3
    const manyFast = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`t${i}`, `${i},0,0`]));
    const fastTracks = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`t${i}`, T(`t${i}`, 180)]));
    const fullDwell = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${i},0,0`, DWELL_TARGET]));
    expect(derivePlayerStats(fullDwell, manyFast, fastTracks).attackRate).toBeGreaterThanOrEqual(0.3);
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
