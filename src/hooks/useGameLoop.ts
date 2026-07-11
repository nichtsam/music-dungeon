import { useEffect, useRef } from "react";
import { useDungeon } from "../store";
import { GRID, ROOM_PX, type Rect } from "../roomLayout";
import { TILE } from "../sprites";

export const CHAR = 34; // character collision box px
export const SPEED = 250; // px/s
const INTERACT_PAD = 26;

export interface Focusable {
  id: string;
  rect: Rect;
}

const KEYMAP: Record<string, string> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};

export function useGameLoop<T extends Focusable>({
  pos,
  charRef,
  cameraRef,
  scaleRef,
  viewportRef,
  leavingRef,
  interactablesRef,
  interactRef,
  onFocusChange,
}: {
  pos: React.MutableRefObject<{ x: number; y: number }>;
  charRef: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.RefObject<HTMLDivElement | null>;
  scaleRef: React.MutableRefObject<number>;
  viewportRef: React.MutableRefObject<{ w: number; h: number }>;
  leavingRef: React.MutableRefObject<boolean>;
  interactablesRef: React.MutableRefObject<T[]>;
  interactRef: React.MutableRefObject<() => void>;
  onFocusChange: (it: T | null) => void;
}): void {
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") { held.add("sprint"); return; }
      if (e.key === " ") {
        e.preventDefault();
        if (useDungeon.getState().view === "dungeon") interactRef.current();
        return;
      }
      const dir = KEYMAP[e.key];
      if (dir) { held.add(dir); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") { held.delete("sprint"); return; }
      held.delete(KEYMAP[e.key]);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    let raf = 0;
    let last = performance.now();
    let focusId: string | null = null;
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (useDungeon.getState().view !== "dungeon") {
        held.clear();
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = pos.current;
      const moving = held.size > 0 && !leavingRef.current;
      if (moving) {
        const spd = held.has("sprint") ? SPEED * 2 : SPEED;
        if (held.has("up")) p.y -= spd * dt;
        if (held.has("down")) p.y += spd * dt;
        if (held.has("left")) p.x -= spd * dt;
        if (held.has("right")) p.x += spd * dt;
        p.x = Math.max(TILE, Math.min((GRID - 1) * TILE - CHAR, p.x));
        p.y = Math.max(2 * TILE, Math.min((GRID - 1) * TILE - CHAR, p.y));
      }
      let best: T | null = null;
      let bestD = Infinity;
      for (const it of interactablesRef.current) {
        const r = it.rect;
        if (
          p.x < r.x + r.w + INTERACT_PAD && p.x + CHAR > r.x - INTERACT_PAD &&
          p.y < r.y + r.h + INTERACT_PAD && p.y + CHAR > r.y - INTERACT_PAD
        ) {
          const d = Math.hypot(
            r.x + r.w / 2 - (p.x + CHAR / 2),
            r.y + r.h / 2 - (p.y + CHAR / 2),
          );
          if (d < bestD) { bestD = d; best = it; }
        }
      }
      if ((best?.id ?? null) !== focusId) {
        focusId = best?.id ?? null;
        onFocusChangeRef.current(best);
      }
      const el = charRef.current;
      if (el) {
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.classList.toggle("walking", moving);
        if (held.has("left")) el.classList.add("face-left");
        else if (held.has("right")) el.classList.remove("face-left");
      }
      const cam = cameraRef.current;
      if (cam) {
        const sc = scaleRef.current;
        const { w: vw, h: vh } = viewportRef.current;
        const cx = vw / 2 - (p.x + CHAR / 2) * sc;
        const cy = vh / 2 - (p.y + CHAR / 2) * sc;
        cam.style.transform = `translate(${
          Math.max(vw - ROOM_PX * sc, Math.min(0, cx))
        }px, ${
          Math.max(vh - ROOM_PX * sc, Math.min(0, cy))
        }px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      cancelAnimationFrame(raf);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
