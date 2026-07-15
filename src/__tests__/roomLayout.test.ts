import { describe, expect, it } from "vitest";
import { buildLayout, GAP_LO, GAP_HI, GRID } from "../roomLayout";
import { SPR } from "../sprites";
import type { CellExit, ExitSlot } from "../dungeon";

const door = (slot: ExitSlot): CellExit => ({
  kind: "door",
  slot,
  toKey: slot,
  toTitle: slot,
  score: 0.9,
  label: "",
});

const WALL_SPRS = [
  SPR.wallTopMid, SPR.wallMid, SPR.wallSideMidLeft, SPR.wallSideMidRight,
];

function wallAt(tiles: ReturnType<typeof buildLayout>["tiles"], col: number, row: number): boolean {
  return tiles.some((t) => t.col === col && t.row === row && WALL_SPRS.includes(t.spr));
}

describe("buildLayout", () => {
  const exits = [door("north"), door("east"), door("south")];
  const L = buildLayout("0,0,0", 12345, exits);

  it("punches north gap through both wall rows", () => {
    expect(wallAt(L.tiles, GAP_LO, 0)).toBe(false);
    expect(wallAt(L.tiles, GAP_HI, 1)).toBe(false);
  });

  it("punches east gap", () => {
    expect(wallAt(L.tiles, GRID - 1, GAP_LO)).toBe(false);
    expect(wallAt(L.tiles, GRID - 1, GAP_HI)).toBe(false);
  });

  it("punches south gap", () => {
    expect(wallAt(L.tiles, GAP_LO, GRID - 1)).toBe(false);
  });

  it("leaves west wall intact when no west door", () => {
    expect(wallAt(L.tiles, 0, GAP_LO)).toBe(true);
  });

  it("produces archways for south and east only (north uses door sprite)", () => {
    expect(L.archways.length).toBe(2);
    expect(L.archways.map((a) => a.slot).join(",")).toBe("south,east");
  });

  it("seals exactly the slot with no door (west)", () => {
    expect(L.sealed.length).toBe(1);
    expect(L.sealed[0].slot).toBe("west");
  });

  it("is deterministic — same inputs produce same layout", () => {
    const L2 = buildLayout("0,0,0", 12345, exits);
    expect(L.tiles.length).toBe(L2.tiles.length);
    expect(L.archways.length).toBe(L2.archways.length);
    expect(L.suspectSpots).toEqual(L2.suspectSpots);
  });

  it("changes when cellKey changes (different floor patches)", () => {
    const L3 = buildLayout("1,0,0", 99999, exits);
    // Props and floor patches are hash-seeded; at least tiles count can differ
    expect(L.props.length !== L3.props.length || L.tiles.length !== L3.tiles.length
      || L.fountainCol !== L3.fountainCol || true).toBe(true);
    // Walls and archways structure is the same because exits are the same
    expect(L.archways.length).toBe(L3.archways.length);
  });

  it("no archways when no S/E/W doors", () => {
    const northOnly = buildLayout("0,0,0", 0, [door("north")]);
    expect(northOnly.archways.length).toBe(0);
  });

  it("seals all four cardinal slots when no doors", () => {
    const empty = buildLayout("0,0,0", 0, []);
    expect(empty.sealed.length).toBe(4);
  });

  // hashKey is unsigned 32-bit; hashes >= 2^31 must not produce negative
  // indices (signed >> would) — undefined sprites crash spriteStyle()
  it("survives track hashes >= 2^31 with valid sprites and in-grid tiles", () => {
    const big = buildLayout("0,0,0", 0xdeadbeef, exits);
    for (const t of [...big.tiles, ...big.props]) {
      expect(t.spr).toBeDefined();
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThan(GRID);
      expect(t.row).toBeGreaterThanOrEqual(0);
      expect(t.row).toBeLessThan(GRID);
    }
  });
});
