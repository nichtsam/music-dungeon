// Tile-grid room layout — the single source of geometry. Everything is placed
// in (col,row) tile units on a 14x14 grid, per the 0x72 tileset's own anatomy:
// top wall = cap row 0 + face row 1, bottom wall = cap row 13, side walls =
// wall_side columns, corners from the corner set, native 2x2 door on north.
import { SPR, TILE, type Spr } from "./sprites";
import { hashKey, type CellExit, type ExitSlot } from "./dungeon";

export const GRID = 42;
export const ROOM_PX = GRID * TILE; // 2016

export interface TilePlace {
  col: number;
  row: number;
  spr: Spr;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  tiles: TilePlace[]; // static wall/dressing/floor-patch layer, render in order
  archways: { slot: ExitSlot; rect: Rect }[]; // dark openings (S/E/W doors)
  bannerCols: number[]; // face-row banner positions (sprite chosen by mood)
  fountainCol: number; // animated mid/basin rendered by Room2D at rows 1/2
  suspectSpots: { x: number; y: number }[]; // pixel, tile-aligned candidates
  props: TilePlace[];
  sealed: { slot: ExitSlot; x: number; y: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // char area edges
}

// door gap lanes: cols 20-21 (north/south), rows 20-21 (east/west) — center of 42-tile grid
export const GAP_LO = 20;
export const GAP_HI = 21;

// interaction zones per exit slot (pixel) — derived from the same grid
export const ZONES: Record<ExitSlot, Rect> = {
  north: { x: GAP_LO * TILE, y: 0, w: 2 * TILE, h: 2 * TILE },
  south: { x: GAP_LO * TILE, y: (GRID - 1) * TILE, w: 2 * TILE, h: TILE },
  west: { x: 0, y: GAP_LO * TILE, w: TILE, h: 2 * TILE },
  east: { x: (GRID - 1) * TILE, y: GAP_LO * TILE, w: TILE, h: 2 * TILE },
  up: { x: 11 * TILE, y: 2 * TILE, w: TILE, h: TILE },
  down: { x: 2 * TILE, y: 11 * TILE, w: TILE, h: TILE },
};

// tile-aligned candidates in the floor area, clear of door lanes (cols/rows
// 20-21), the ladder (11,2), the trapdoor (2,11), and the fountain basin (2,2)
const SUSPECT_TILES: [number, number][] = [
  [4, 8], [20, 15], [8, 30], [35, 10], [12, 38], [30, 20],
  [16, 5], [38, 35], [6, 22], [28, 38],
];
const PROP_TILES: [number, number][] = [
  [6, 6], [36, 36], [36, 10], [4, 32], [10, 6], [32, 36],
];
const PROP_SPRS: Spr[] = [
  SPR.crate, SPR.skull, SPR.flaskRed, SPR.chestOpen, SPR.flaskBlue, SPR.crate,
];
const FLOOR_VARIANTS: Spr[] = [SPR.floor2, SPR.floor3, SPR.floor4, SPR.floor7];

export function buildLayout(
  cellKey: string,
  trackHash: number,
  exits: CellExit[] | undefined,
): Layout {
  const hasDoor = (slot: ExitSlot) =>
    exits?.some((e) => e.kind === "door" && e.slot === slot) ?? false;
  const h = hashKey(cellKey);
  const tiles: TilePlace[] = [];

  // floor variation patches (floor area rows 2..40, cols 1..40)
  for (let i = 0; i < 20; i++) {
    tiles.push({
      // >>> not >>: hashes >= 2^31 turn negative under signed shift
      col: 1 + ((trackHash >>> (i * 3)) % 40),
      row: 2 + ((trackHash >>> (i * 3 + 7)) % 38),
      spr: FLOOR_VARIANTS[(trackHash >>> i) % FLOOR_VARIANTS.length],
    });
  }

  // top wall (cap row 0 + face row 1) and bottom wall (cap row 13)
  for (let c = 1; c < GRID - 1; c++) {
    const inGap = c === GAP_LO || c === GAP_HI;
    if (!(inGap && hasDoor("north"))) {
      tiles.push({ col: c, row: 0, spr: SPR.wallTopMid });
      tiles.push({ col: c, row: 1, spr: SPR.wallMid });
    }
    if (!(inGap && hasDoor("south")))
      tiles.push({ col: c, row: GRID - 1, spr: SPR.wallTopMid });
  }
  // side walls
  for (let r = 2; r < GRID - 1; r++) {
    const inGap = r === GAP_LO || r === GAP_HI;
    // 0x72 naming: "left/right" is the side of the doorway the piece caps,
    // so the room's left wall uses wall_side_mid_RIGHT and vice versa
    if (!(inGap && hasDoor("west")))
      tiles.push({ col: 0, row: r, spr: SPR.wallSideMidRight });
    if (!(inGap && hasDoor("east")))
      tiles.push({ col: GRID - 1, row: r, spr: SPR.wallSideMidLeft });
  }
  // terminate the cut wall ends around door gaps so each opening reads as an
  // intentional passage (front/top caps for side walls, end caps for the
  // bottom strip)
  if (hasDoor("west")) {
    tiles.push(
      { col: 0, row: GAP_LO - 1, spr: SPR.wallSideFrontRight },
      { col: 0, row: GAP_HI + 1, spr: SPR.wallSideTopRight },
    );
  }
  if (hasDoor("east")) {
    tiles.push(
      { col: GRID - 1, row: GAP_LO - 1, spr: SPR.wallSideFrontLeft },
      { col: GRID - 1, row: GAP_HI + 1, spr: SPR.wallSideTopLeft },
    );
  }
  if (hasDoor("south")) {
    tiles.push(
      { col: GAP_LO - 1, row: GRID - 1, spr: SPR.wallTopRight },
      { col: GAP_HI + 1, row: GRID - 1, spr: SPR.wallTopLeft },
    );
  }
  // corners
  tiles.push(
    { col: 0, row: 0, spr: SPR.cornerTopLeft },
    { col: GRID - 1, row: 0, spr: SPR.cornerTopRight },
    { col: 0, row: 1, spr: SPR.cornerLeft },
    { col: GRID - 1, row: 1, spr: SPR.cornerRight },
    { col: 0, row: GRID - 1, spr: SPR.cornerBottomLeft },
    { col: GRID - 1, row: GRID - 1, spr: SPR.cornerBottomRight },
  );

  // wall dressing on the face row: fountain top (animated parts are DOM),
  // plus hash-picked column or goo
  const fountainCol = 2;
  tiles.push({ col: fountainCol, row: 0, spr: SPR.fountainTop });
  if (h % 2) {
    tiles.push(
      { col: GRID - 2, row: 0, spr: SPR.wallColumnTop },
      { col: GRID - 2, row: 1, spr: SPR.wallColumnMid },
    );
  } else {
    tiles.push(
      { col: 10, row: 1, spr: SPR.wallGoo },
      { col: 10, row: 2, spr: SPR.wallGooBase },
    );
  }

  // archways: south/east/west are dark passages leading out of the room,
  // each shaded toward its own direction. Only north — the far wall, the one
  // facing the camera — gets the native face-on door assembly.
  const archways: Layout["archways"] = [];
  if (hasDoor("south")) archways.push({ slot: "south", rect: ZONES.south });
  if (hasDoor("west")) archways.push({ slot: "west", rect: ZONES.west });
  if (hasDoor("east")) archways.push({ slot: "east", rect: ZONES.east });

  // sealed marks for wall slots without doors
  const sealed: Layout["sealed"] = (
    ["north", "east", "south", "west"] as ExitSlot[]
  )
    .filter((s) => !hasDoor(s))
    .map((slot) => {
      const z = ZONES[slot];
      return { slot, x: z.x + z.w / 2, y: z.y + z.h / 2 };
    });

  const props: TilePlace[] = Array.from(
    { length: 2 + (trackHash % 3) },
    (_, i) => {
      const pick = (trackHash + i * 5) % PROP_TILES.length; // 5 ⟂ 6: distinct
      const [col, row] = PROP_TILES[pick];
      return { col, row, spr: PROP_SPRS[pick] };
    },
  );

  return {
    tiles,
    archways,
    bannerCols: [4, 9, 14, 19, 24, 29, 34, 39],
    fountainCol,
    suspectSpots: SUSPECT_TILES.map(([c, r]) => ({ x: c * TILE, y: r * TILE })),
    props,
    sealed,
    bounds: {
      minX: TILE,
      minY: 2 * TILE,
      maxX: (GRID - 1) * TILE,
      maxY: (GRID - 1) * TILE,
    },
  };
}

if (import.meta.env.DEV) {
  const door = (slot: ExitSlot): CellExit => ({
    kind: "door", slot, toKey: slot, toTitle: slot, score: 0.9, label: "",
  });
  const L = buildLayout("0,0,0", 12345, [door("north"), door("east"), door("south")]);
  const wallAt = (col: number, row: number) =>
    L.tiles.some((t) => t.col === col && t.row === row &&
      [SPR.wallTopMid, SPR.wallMid, SPR.wallSideMidLeft, SPR.wallSideMidRight].includes(t.spr));
  console.assert(
    !wallAt(20, 0) && !wallAt(21, 1) && // north gap punched through both rows
      !wallAt(41, 20) && !wallAt(41, 21) && // east gap punched
      !wallAt(20, 41) && wallAt(0, 20) && // south punched, west stays walled
      L.archways.length === 2 &&
      L.archways.map((a) => a.slot).join() === "south,east" &&
      L.sealed.length === 1 && L.sealed[0].slot === "west",
    "buildLayout smoke check failed", L,
  );
}
