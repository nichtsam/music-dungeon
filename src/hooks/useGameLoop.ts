import { useEffect, useRef } from "react";
import { useDungeon } from "../store";
import { derivePlayerStats, sprintMaxSeconds, sprintMultiplier } from "../stats";
import { GRID, ROOM_PX, type Rect } from "../roomLayout";
import { TILE } from "../sprites";

export const CHAR = 34; // character collision box px
export const SPEED = 250; // px/s
const INTERACT_PAD = 26;
const STAMINA_REGEN_SEC = 8; // seconds from empty to full
const STAMINA_REENGAGE = 0.15; // fraction required to sprint again after empty

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
  staminaRef,
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
  staminaRef?: React.RefObject<HTMLDivElement | null>;
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
    let stam = -1; // seconds of sprint left; -1 = init to max on first tick
    let winded = false; // emptied the bar; locked out until it refills a bit
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      const state = useDungeon.getState();
      if (state.view !== "dungeon") {
        held.clear();
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = pos.current;
      const moving = held.size > 0 && !leavingRef.current;

      // stamina: attuned slow tracks stretch the bar, fast tracks raise the speed
      const stats = derivePlayerStats(state.dwell, state.placed, state.tracks);
      const maxStam = sprintMaxSeconds(stats.stamina);
      if (stam < 0) stam = maxStam;
      if (winded && stam >= maxStam * STAMINA_REENGAGE) winded = false;
      const sprinting = moving && held.has("sprint") && !winded && stam > 0;
      if (sprinting) {
        stam = Math.max(0, stam - dt);
        if (stam === 0) winded = true;
      } else {
        stam = Math.min(maxStam, stam + dt * (maxStam / STAMINA_REGEN_SEC));
      }
      const bar = staminaRef?.current;
      if (bar) {
        const frac = stam / maxStam;
        bar.style.width = `${frac * 100}%`;
        bar.style.filter = winded ? "grayscale(1)" : "none";
        if (bar.parentElement)
          bar.parentElement.style.opacity = frac >= 0.999 ? "0" : "1";
      }

      if (moving) {
        const spd = sprinting ? SPEED * sprintMultiplier(stats.agility) : SPEED;
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
