// 0x72 DungeonTileset II v1.4 (CC0) — hand-picked sprite coords from tiles_list_v1.4.
// Rendered via background-position on the scaled sheet; repeating tile areas
// use a small canvas-extracted data-URL pattern.
import type { CSSProperties } from "react";

export const SHEET = "/sprites/0x72_DungeonTilesetII_v1.4.png";
export const SHEET_SIZE = 512;
export const SCALE = 3;
export const TILE = 16 * SCALE; // 48px

export type Spr = [x: number, y: number, w: number, h: number];

export const SPR = {
  wallMid: [32, 16, 16, 16] as Spr,
  wallLeft: [16, 16, 16, 16] as Spr,
  wallRight: [48, 16, 16, 16] as Spr,
  wallTopMid: [32, 0, 16, 16] as Spr,
  wallTopLeft: [16, 0, 16, 16] as Spr,
  wallTopRight: [48, 0, 16, 16] as Spr,
  wallSideMidLeft: [0, 128, 16, 16] as Spr,
  wallSideMidRight: [16, 128, 16, 16] as Spr,
  wallSideFrontLeft: [0, 144, 16, 16] as Spr,
  wallSideFrontRight: [16, 144, 16, 16] as Spr,
  cornerTopLeft: [32, 112, 16, 16] as Spr,
  cornerTopRight: [48, 112, 16, 16] as Spr,
  cornerLeft: [32, 128, 16, 16] as Spr,
  cornerRight: [48, 128, 16, 16] as Spr,
  cornerBottomLeft: [32, 144, 16, 16] as Spr,
  cornerBottomRight: [48, 144, 16, 16] as Spr,
  wallColumnTop: [96, 80, 16, 16] as Spr,
  wallColumnMid: [96, 96, 16, 16] as Spr,
  wallGoo: [64, 80, 16, 16] as Spr,
  wallGooBase: [64, 96, 16, 16] as Spr,
  columnBase: [80, 112, 16, 16] as Spr,
  fountainTop: [64, 0, 16, 16] as Spr,
  floor1: [16, 64, 16, 16] as Spr,
  floor2: [32, 64, 16, 16] as Spr,
  floor3: [48, 64, 16, 16] as Spr,
  floor4: [16, 80, 16, 16] as Spr,
  floor7: [16, 96, 16, 16] as Spr,
  floor8: [32, 96, 16, 16] as Spr, // cracked — suspect floor spots
  ladder: [48, 96, 16, 16] as Spr,
  hole: [96, 144, 16, 16] as Spr,
  doorClosed: [32, 224, 32, 32] as Spr,
  doorsAll: [16, 221, 64, 35] as Spr, // frame + closed leaf, 4x2.2 tiles
  doorLeafLeft: [32, 224, 16, 32] as Spr, // single leaf halves — fit 1x2 side gaps
  doorLeafRight: [48, 224, 16, 32] as Spr,
  wallSideTopLeft: [0, 112, 16, 16] as Spr,
  wallSideTopRight: [16, 112, 16, 16] as Spr,
  crate: [288, 298, 16, 22] as Spr,
  skull: [288, 320, 16, 16] as Spr,
  columnTop: [80, 80, 16, 16] as Spr,
  columnMid: [80, 96, 16, 16] as Spr,
  flaskRed: [288, 240, 16, 16] as Spr,
  flaskBlue: [304, 240, 16, 16] as Spr,
  chestOpen: [304, 288, 16, 16] as Spr,
  bannerRed: [16, 32, 16, 16] as Spr,
  bannerBlue: [32, 32, 16, 16] as Spr,
  bannerGreen: [16, 48, 16, 16] as Spr,
  bannerYellow: [32, 48, 16, 16] as Spr,
  // 3-frame animated wall fountains (frames advance +16px in x)
  fountainMidRed: [64, 16, 16, 16] as Spr,
  fountainMidBlue: [64, 48, 16, 16] as Spr,
  fountainBasinRed: [64, 32, 16, 16] as Spr,
  fountainBasinBlue: [64, 64, 16, 16] as Spr,
  // wizzard_m: 16x28 frames, 4-frame idle at x=128, 4-frame run at x=192 (y=164)
  wizIdle: [128, 164, 16, 28] as Spr,
};

export function spriteStyle([x, y, w, h]: Spr): CSSProperties {
  return {
    width: w * SCALE,
    height: h * SCALE,
    backgroundImage: `url(${SHEET})`,
    backgroundPosition: `${-x * SCALE}px ${-y * SCALE}px`,
    backgroundSize: SHEET_SIZE * SCALE,
    imageRendering: "pixelated",
  };
}

// extract one tile to a data-URL so it can be used as a repeating background
const patternCache = new Map<string, string>();
let sheetImg: HTMLImageElement | null = null;
const listeners: (() => void)[] = [];

function loadSheet(cb: () => void) {
  if (sheetImg?.complete) return cb();
  listeners.push(cb);
  if (!sheetImg) {
    sheetImg = new Image();
    sheetImg.src = SHEET;
    sheetImg.onload = () => listeners.splice(0).forEach((l) => l());
  }
}

export function tilePattern(spr: Spr, cb: (url: string) => void): void {
  const key = spr.join(",");
  const hit = patternCache.get(key);
  if (hit) return cb(hit);
  loadSheet(() => {
    const [x, y, w, h] = spr;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(sheetImg!, x, y, w, h, 0, 0, w, h);
    const url = c.toDataURL();
    patternCache.set(key, url);
    cb(url);
  });
}
