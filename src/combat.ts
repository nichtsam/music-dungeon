// Pure combat model — no DOM, no React. All per-frame logic lives here;
// the game loop in useGameLoop.ts drives it, Room2D seeds enemy state.
import { hashKey } from "./dungeon";
import { GRID, ROOM_PX } from "./roomLayout";
import { TILE } from "./sprites";

export type RoomType = "combat" | "treasure" | "rest";
export type EnemyKind = "charger" | "shooter";

export interface Enemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shootCooldown: number; // shooters: next shot; chargers: pause before next sprint
  chargeTimeLeft?: number; // chargers only: remaining sprint seconds (0/undefined = paused)
  chargeDx?: number; // locked sprint direction (normalised), set at charge start
  chargeDy?: number;
  chargeHit?: boolean; // true after landing one impact per sprint — prevents multi-frame damage
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromPlayer: boolean;
  damage: number;
}

export interface CollisionResult {
  playerDmg: number;
  enemyHits: Array<{ id: string; damage: number }>;
  consumedProjIds: string[];
  chargerHitIds: string[]; // chargers that landed sprint impact this frame
}

// ponytail: 8/10 combat, 1/10 treasure, 1/10 rest; seed varies per run
export function roomTypeFor(cellKey: string, seed = ""): RoomType {
  const h = hashKey(cellKey + seed) % 10;
  if (h <= 7) return "combat";
  if (h <= 8) return "treasure";
  return "rest";
}

const SPAWN_LO = 3 * TILE;
const SPAWN_HI = (GRID - 3) * TILE;
const EDGE_INSET_LO = 2 * TILE; // min distance from wall
const EDGE_INSET_HI = 5 * TILE; // max distance from wall
export const ENEMY_RADIUS = 22;
export const PLAYER_RADIUS = 14; // slightly forgiving vs CHAR/2 = 17

export function spawnEnemies(cellKey: string, _playerX: number, _playerY: number, wave = 0): Enemy[] {
  const h = hashKey(cellKey);
  const count = 6 + (h % 3); // 6–8

  // Balanced kinds: floor(count/2) shooters + rest chargers, shuffled deterministically.
  const kinds: EnemyKind[] = Array.from({ length: count }, (_, i) =>
    i < Math.floor(count / 2) ? "shooter" : "charger",
  );
  for (let i = count - 1; i > 0; i--) {
    const j = hashKey(`${cellKey}:shuf:${i}:${wave}`) % (i + 1);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }

  // How many enemies land on each side (round-robin), for even spacing.
  const perSide = [0, 0, 0, 0];
  for (let i = 0; i < count; i++) perSide[i % 4]++;
  const sideIdx = [0, 0, 0, 0];

  const range = SPAWN_HI - SPAWN_LO;
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    const seed = hashKey(`${cellKey}:${i}:${wave}`);
    const side = i % 4;
    // Evenly spaced within the side + small jitter so enemies don't stack.
    const k = sideIdx[side]++;
    const n = perSide[side];
    const jitter = ((seed >>> 12) % 41) - 20; // ±20 px
    const along = Math.round(SPAWN_LO + ((k + 1) / (n + 1)) * range + jitter);
    const inset = EDGE_INSET_LO + ((seed >>> 8) % (EDGE_INSET_HI - EDGE_INSET_LO));
    let x: number, y: number;
    if (side === 0) { x = along; y = SPAWN_LO + inset; }
    else if (side === 1) { x = along; y = SPAWN_HI - inset; }
    else if (side === 2) { x = SPAWN_LO + inset; y = along; }
    else { x = SPAWN_HI - inset; y = along; }
    const kind = kinds[i];
    const hp = kind === "charger" ? 20 : 15;
    const cooldown = kind === "charger" ? 0.5 + (seed % 10) * 0.15 : 2.5;
    enemies.push({ id: `${cellKey}:${i}:${wave}`, kind, x, y, hp, maxHp: hp, shootCooldown: cooldown });
  }
  return enemies;
}

const CHARGE_SPEED = 620;    // px/s during sprint
const CHARGE_DURATION = 1.2; // seconds per sprint (~744px range)
const CHARGE_PAUSE = 2.5;    // seconds between sprints
const SHOOTER_PREFERRED_DIST = 250; // px
const SHOOTER_SPEED = 70;
const ROOM_LO = 2 * TILE;
const ROOM_HI = (GRID - 1) * TILE;

export function moveEnemies(enemies: Enemy[], px: number, py: number, dt: number): Enemy[] {
  const pcx = px + 17;
  const pcy = py + 17;
  const pos: [number, number][] = enemies.map((e) => {
    let nx = e.x, ny = e.y;
    if (e.kind === "charger") {
      if ((e.chargeTimeLeft ?? 0) > 0 && e.chargeDx !== undefined) {
        nx += e.chargeDx * CHARGE_SPEED * dt;
        ny += (e.chargeDy ?? 0) * CHARGE_SPEED * dt;
      }
    } else {
      const dx = pcx - e.x, dy = pcy - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < SHOOTER_PREFERRED_DIST) {
        nx -= (dx / dist) * SHOOTER_SPEED * dt;
        ny -= (dy / dist) * SHOOTER_SPEED * dt;
      }
    }
    return [nx, ny];
  });
  // separation: smooth repulsion that kicks in well before visual overlap,
  // so enemies never stack. Larger radius ensures push > AI convergence velocity.
  const REPULSE_R = 80;
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
      const d = Math.hypot(dx, dy);
      if (d < REPULSE_R) {
        const push = (REPULSE_R - d) * 0.5;
        // if exactly coincident, push along an axis determined by index
        const ux = d > 0.5 ? dx / d : (i % 2 === 0 ? 1 : -1);
        const uy = d > 0.5 ? dy / d : 0;
        pos[i][0] += ux * push; pos[i][1] += uy * push;
        pos[j][0] -= ux * push; pos[j][1] -= uy * push;
      }
    }
  }
  return enemies.map((e, i) => ({
    ...e,
    x: Math.max(ROOM_LO, Math.min(ROOM_HI, pos[i][0])),
    y: Math.max(ROOM_LO, Math.min(ROOM_HI, pos[i][1])),
  }));
}

const SHOOTER_PROJ_SPEED = 320; // px/s
const SHOOTER_COOLDOWN = 2.5; // seconds

export function tickShooters(
  enemies: Enemy[],
  px: number,
  py: number,
  dt: number,
  projIdBase: number,
): { enemies: Enemy[]; spawned: Projectile[] } {
  const pcx = px + 17;
  const pcy = py + 17;
  const spawned: Projectile[] = [];
  let seq = projIdBase;
  const updated = enemies.map((e) => {
    if (e.kind === "charger") {
      const ct = (e.chargeTimeLeft ?? 0) - dt;
      if ((e.chargeTimeLeft ?? 0) > 0) {
        // sprinting — keep going until time runs out
        return ct > 0
          ? { ...e, chargeTimeLeft: ct }
          : { ...e, chargeTimeLeft: 0, shootCooldown: CHARGE_PAUSE, chargeDx: 0, chargeDy: 0 };
      }
      const cd = e.shootCooldown - dt;
      if (cd <= 0) {
        // pause ended — lock direction toward player NOW, then sprint
        const dx = pcx - e.x, dy = pcy - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        return { ...e, shootCooldown: 0, chargeTimeLeft: CHARGE_DURATION, chargeDx: dx / dist, chargeDy: dy / dist, chargeHit: false };
      }
      return { ...e, shootCooldown: cd };
    }
    if (e.kind !== "shooter") return e;
    const cd = e.shootCooldown - dt;
    if (cd > 0) return { ...e, shootCooldown: cd };
    const dx = pcx - e.x;
    const dy = pcy - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    spawned.push({
      id: `p${seq++}`,
      x: e.x, y: e.y,
      vx: (dx / dist) * SHOOTER_PROJ_SPEED,
      vy: (dy / dist) * SHOOTER_PROJ_SPEED,
      fromPlayer: false,
      damage: 15,
    });
    return { ...e, shootCooldown: SHOOTER_COOLDOWN };
  });
  return { enemies: updated, spawned };
}

export const PLAYER_PROJ_SPEED = 420; // px/s

export function moveProjectiles(projectiles: Projectile[], dt: number): Projectile[] {
  return projectiles.map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt }));
}

export function isOutOfBounds(p: Projectile): boolean {
  return p.x < -20 || p.x > ROOM_PX + 20 || p.y < -20 || p.y > ROOM_PX + 20;
}

const PLAYER_PROJ_RADIUS = 10; // matches canvas render size
const ENEMY_PROJ_RADIUS = 8;
const CHARGE_IMPACT_DMG = 28; // single hit on sprint contact

export function checkCollisions(
  enemies: Enemy[],
  projectiles: Projectile[],
  px: number,
  py: number,
): CollisionResult {
  const pcx = px + 17;
  const pcy = py + 17;
  let playerDmg = 0;
  const enemyHits: Array<{ id: string; damage: number }> = [];
  const consumedProjIds: string[] = [];
  const chargerHitIds: string[] = [];
  const hitEnemyIds = new Set<string>();

  for (const e of enemies) {
    if (e.kind === "charger" && (e.chargeTimeLeft ?? 0) > 0 && !e.chargeHit) {
      if (Math.hypot(e.x - pcx, e.y - pcy) < ENEMY_RADIUS + PLAYER_RADIUS) {
        playerDmg += CHARGE_IMPACT_DMG;
        chargerHitIds.push(e.id);
      }
    }
  }

  for (const proj of projectiles) {
    if (proj.fromPlayer) {
      for (const e of enemies) {
        if (hitEnemyIds.has(e.id)) continue;
        if (Math.hypot(proj.x - e.x, proj.y - e.y) < PLAYER_PROJ_RADIUS + ENEMY_RADIUS) {
          enemyHits.push({ id: e.id, damage: proj.damage });
          consumedProjIds.push(proj.id);
          hitEnemyIds.add(e.id);
          break;
        }
      }
    } else {
      if (Math.hypot(proj.x - pcx, proj.y - pcy) < ENEMY_PROJ_RADIUS + PLAYER_RADIUS) {
        playerDmg += proj.damage;
        consumedProjIds.push(proj.id);
      }
    }
  }

  return { playerDmg, enemyHits, consumedProjIds, chargerHitIds };
}
