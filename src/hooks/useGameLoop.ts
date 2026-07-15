import { useEffect, useRef } from "react";
import { useDungeon } from "../store";
import { derivePlayerStats, hpRegenRate, sprintMaxSeconds, sprintMultiplier } from "../stats";
import { GRID, ROOM_PX, type Rect } from "../roomLayout";
import { TILE } from "../sprites";
import {
  type Enemy, type Projectile, type LightningArc,
  moveEnemies, tickShooters, moveProjectiles, isOutOfBounds,
  checkCollisions, spawnEnemies, roomTypeFor,
  buildLightningChain,
} from "../combat";

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
  hpBarRef,
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
  hpBarRef?: React.RefObject<HTMLDivElement | null>;
}): { enemiesRef: React.MutableRefObject<Enemy[]>; projectilesRef: React.MutableRefObject<Projectile[]>; playerHPRef: React.MutableRefObject<number>; dungeonMsRef: React.MutableRefObject<number>; lightningRef: React.MutableRefObject<LightningArc[]> } {
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const lightningRef = useRef<LightningArc[]>([]);
  const playerHPRef = useRef(-1); // -1 = uninitialised; init to savedHP ?? maxHP on first combat tick
  const autoAttackCdRef = useRef(0); // seconds until next lightning strike
  const projIdSeqRef = useRef(0);
  const gameOverFiredRef = useRef(false); // prevent double-dispatch
  const waveRef = useRef(0);
  const spawnTimerRef = useRef(0); // seconds until next reinforcement wave
  const prevKeyRef = useRef<string | null>(null);
  // dungeonMs persisted — init from store so lockUntil comparisons survive reload
  const dungeonMsRef = useRef(useDungeon.getState().dungeonMs);

  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") { held.add("sprint"); return; }
      if (e.key === " ") {
        e.preventDefault();
        const s = useDungeon.getState();
        if (s.view !== "dungeon") return;
        const lock = s.lockUntil[s.currentKey ?? ""] ?? 0;
        if (dungeonMsRef.current >= lock) interactRef.current();
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
    const initSave = useDungeon.getState();
    // restore stamina from last save; -1 = uninitialised (will be clamped to maxStam)
    let stam = initSave.savedStamina ?? -1;
    let winded = false; // emptied the bar; locked out until it refills a bit
    let dwellAccum = 0; // seconds accumulated since last flush
    let dwellFlush = 5; // seconds until next flush
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      const state = useDungeon.getState();
      if (state.view !== "dungeon" || state.loading) {
        held.clear();
        raf = requestAnimationFrame(tick);
        return;
      }

      dungeonMsRef.current += dt * 1000;

      // detect room change → flush dwell for old room, reset spawn timer
      if (state.currentKey !== prevKeyRef.current) {
        if (prevKeyRef.current && dwellAccum > 0) {
          state.addDwell(prevKeyRef.current, dwellAccum);
          dwellAccum = 0;
        }
        dwellFlush = 5;
        prevKeyRef.current = state.currentKey;
        spawnTimerRef.current = 6; // first reinforcement 6s after entry
      }

      // dwell + game state: accumulate and flush every 5s
      dwellAccum += dt;
      dwellFlush -= dt;
      if (dwellFlush <= 0) {
        if (state.currentKey) state.addDwell(state.currentKey, dwellAccum);
        // persist HP/stamina/dungeonMs so reload restores mid-run state
        state.saveProgress(
          playerHPRef.current >= 0 ? playerHPRef.current : null,
          stam >= 0 ? stam : null,
          dungeonMsRef.current,
        );
        dwellAccum = 0;
        dwellFlush = 5;
      }

      const p = pos.current;
      const moving = held.size > 0 && !leavingRef.current;

      // stamina: attuned slow tracks stretch the bar, fast tracks raise the speed
      const stats = derivePlayerStats(state.dwell, state.placed, state.tracks, state.durations, state.totalDwell);
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
      // --- combat tick --------------------------------------------------------
      const enemies = enemiesRef.current;
      if (enemies.length > 0 || projectilesRef.current.length > 0) {
        // init HP on first combat encounter: restore saved value, fall back to maxHP
        if (playerHPRef.current < 0) {
          const saved = useDungeon.getState().savedHP;
          playerHPRef.current = saved != null ? Math.min(saved, stats.maxHP) : stats.maxHP;
        }

        // move enemies, tick shooters
        let moved = moveEnemies(enemies, p.x, p.y, dt);
        const { enemies: afterShoot, spawned } = tickShooters(moved, p.x, p.y, dt, projIdSeqRef.current);
        projIdSeqRef.current += spawned.length;
        moved = afterShoot;

        // auto-attack: chain lightning — instant damage across up to CHAIN_COUNT enemies
        autoAttackCdRef.current = Math.max(0, autoAttackCdRef.current - dt);
        let lightningHits: Array<{ id: string; damage: number }> = [];
        if (autoAttackCdRef.current === 0 && moved.length > 0) {
          autoAttackCdRef.current = stats.attackRate;
          const pcx = p.x + 17, pcy = p.y + 17;
          const { hits, arcs } = buildLightningChain(moved, pcx, pcy, stats.attackDmg);
          lightningHits = hits;
          lightningRef.current = [...lightningRef.current, ...arcs];
        }

        // tick lightning arc TTL
        lightningRef.current = lightningRef.current
          .map((a) => ({ ...a, ttl: a.ttl - dt }))
          .filter((a) => a.ttl > 0);

        // move projectiles — collision checked BEFORE OOB filter
        // so a shot that exits the room on its last frame still registers hits
        const movedProj = moveProjectiles([...projectilesRef.current, ...spawned], dt);

        // collisions
        const { playerDmg, enemyHits, consumedProjIds, chargerHitIds } = checkCollisions(
          moved, movedProj, p.x, p.y,
        );
        const consumedSet = new Set(consumedProjIds);
        const chargerHitSet = new Set(chargerHitIds);

        // apply enemy HP hits (collision + lightning) and mark charger impacts
        const allHits = [...enemyHits, ...lightningHits];
        const surviving = moved
          .map((e) => {
            const hit = allHits.find((h) => h.id === e.id);
            const impacted = chargerHitSet.has(e.id);
            if (!hit && !impacted) return e;
            return { ...e, hp: e.hp - (hit?.damage ?? 0), chargeHit: impacted || e.chargeHit };
          })
          .filter((e) => e.hp > 0);

        enemiesRef.current = surviving;
        projectilesRef.current = movedProj.filter((pr) => !consumedSet.has(pr.id) && !isOutOfBounds(pr));

        // wave cleared → trigger immediate reinforcement
        if (surviving.length === 0 && enemies.length > 0) spawnTimerRef.current = 0;

        // player HP — damage then regen (capped at maxHP)
        const regen = hpRegenRate(stats.stamina) * dt;
        playerHPRef.current = Math.min(
          stats.maxHP,
          Math.max(0, playerHPRef.current - playerDmg + regen),
        );
        const hp = playerHPRef.current;
        const hpBar = hpBarRef?.current;
        if (hpBar) {
          const frac = hp / stats.maxHP;
          hpBar.style.width = `${frac * 100}%`;
          hpBar.style.background = frac > 0.5 ? "#4f4" : frac > 0.25 ? "#fa0" : "#f44";
        }
        if (hp <= 0 && !gameOverFiredRef.current) {
          gameOverFiredRef.current = true;
          useDungeon.getState().setGameOver(true);
        }
      }

      // continuous reinforcements — runs every frame regardless of current enemy count
      if (state.currentKey && roomTypeFor(state.currentKey, state.runSeed) === "combat") {
        spawnTimerRef.current -= dt;
        if (spawnTimerRef.current <= 0) {
          spawnTimerRef.current = 5;
          if (enemiesRef.current.length < 15) {
            const wave = ++waveRef.current;
            enemiesRef.current = [...enemiesRef.current, ...spawnEnemies(state.currentKey, p.x, p.y, wave)];
          }
        }
      }
      // --- end combat tick ----------------------------------------------------

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
      const s = useDungeon.getState();
      if (s.currentKey && dwellAccum > 0) s.addDwell(s.currentKey, dwellAccum);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { enemiesRef, projectilesRef, playerHPRef, dungeonMsRef, lightningRef };
}
