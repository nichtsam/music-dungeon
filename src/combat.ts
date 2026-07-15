// Pure combat model — no DOM, no React. All per-frame logic lives here;
// the game loop in useGameLoop.ts drives it, Room2D seeds enemy state.
import { hashKey } from "./dungeon";
import { GRID, ROOM_PX } from "./roomLayout";
import { TILE } from "./sprites";
import { hpRegenRate, sprintMultiplier, REGEN_BASE, type PlayerStats } from "./stats";

export interface MoodModifier {
  enemySpeedMult: number;
  shootCooldownMult: number;  // <1 = faster shooting
  spawnCountMult: number;
  spawnCapMult: number;
  enemyHPMult: number;
  enemyDmgMult: number;
  playerSpeedMult: number;
  playerAttackCdMult: number; // >1 = slower player attack rate
  playerDmgMult: number;
  playerHitChance: number;    // 0–1; <1 = chance to miss
  sprintSpeedMult: number;    // multiplier on sprint speed bonus only
  staminaRegenMult: number;   // >1 = faster stamina regen
  hpRegenMult: number;        // >1 = faster HP regen
  sprintDisabled: boolean;
}

export const MOOD_MODIFIER_NONE: MoodModifier = {
  enemySpeedMult: 1, shootCooldownMult: 1,
  spawnCountMult: 1, spawnCapMult: 1,
  enemyHPMult: 1, enemyDmgMult: 1,
  playerSpeedMult: 1, playerAttackCdMult: 1,
  playerDmgMult: 1, playerHitChance: 1,
  sprintSpeedMult: 1, staminaRegenMult: 1, hpRegenMult: 1,
  sprintDisabled: false,
};

const AGGRESSIVE_ENEMY_SPEED    = 1.5;
const AGGRESSIVE_SHOOT_COOLDOWN = 0.65;
const HAPPY_SPAWN_MULT          = 3;
const HAPPY_CAP_MULT            = 3;
const SAD_PLAYER_SPEED          = 0.6;
const DARK_ENEMY_HP             = 2.0;
const ETHEREAL_HIT_CHANCE       = 0.5;
const UPLIFTING_PLAYER_SPEED    = 1.4;
const ENERGETIC_ENEMY_SPEED     = 1.3;
const ENERGETIC_PLAYER_SPEED    = 1.2;
const EPIC_ENEMY_DMG            = 1.6;
const ROMANTIC_SPAWN_MULT       = 0.5;
const ROMANTIC_CAP_MULT         = 0.5;
const SEXY_ENEMY_SPEED          = 0.7;
const SEXY_ENEMY_DMG            = 1.5;
const SCARY_ENEMY_HP            = 1.5;
const SCARY_ENEMY_DMG           = 1.3;
const CHILL_ATTACK_CD_MULT      = 2.0;
const CHILL_PLAYER_DMG          = 0.4;
const CHILL_SPRINT_SPEED        = 0.5;
const CHILL_STAMINA_REGEN       = 3.0;
const CHILL_HP_REGEN            = 3.0;

export function moodModifiersFor(mood: string | null): MoodModifier {
  const n = MOOD_MODIFIER_NONE;
  switch (mood) {
    case "aggressive": return { ...n, enemySpeedMult: AGGRESSIVE_ENEMY_SPEED, shootCooldownMult: AGGRESSIVE_SHOOT_COOLDOWN };
    case "happy":      return { ...n, spawnCountMult: HAPPY_SPAWN_MULT, spawnCapMult: HAPPY_CAP_MULT };
    case "sad":        return { ...n, playerSpeedMult: SAD_PLAYER_SPEED };
    case "calm":       return { ...n, sprintDisabled: true };
    case "chill":      return { ...n, playerAttackCdMult: CHILL_ATTACK_CD_MULT, playerDmgMult: CHILL_PLAYER_DMG, sprintSpeedMult: CHILL_SPRINT_SPEED, staminaRegenMult: CHILL_STAMINA_REGEN, hpRegenMult: CHILL_HP_REGEN };
    case "dark":       return { ...n, enemyHPMult: DARK_ENEMY_HP };
    case "ethereal":   return { ...n, playerHitChance: ETHEREAL_HIT_CHANCE };
    case "uplifting":  return { ...n, playerSpeedMult: UPLIFTING_PLAYER_SPEED };
    case "energetic":  return { ...n, enemySpeedMult: ENERGETIC_ENEMY_SPEED, playerSpeedMult: ENERGETIC_PLAYER_SPEED };
    case "epic":       return { ...n, enemyDmgMult: EPIC_ENEMY_DMG };
    case "romantic":   return { ...n, spawnCountMult: ROMANTIC_SPAWN_MULT, spawnCapMult: ROMANTIC_CAP_MULT };
    case "scary":      return { ...n, enemyHPMult: SCARY_ENEMY_HP, enemyDmgMult: SCARY_ENEMY_DMG };
    case "sexy":       return { ...n, enemySpeedMult: SEXY_ENEMY_SPEED, enemyDmgMult: SEXY_ENEMY_DMG };
    default:           return n;
  }
}

export type RoomType = "combat" | "treasure" | "rest";
export type EnemyKind = "charger" | "shooter";

export interface Enemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;      // baked at spawn — charger impact or shooter projectile dmg
  speed: number;       // charger sprint px/s; shooter walk speed is fixed
  baseCooldown: number; // shooter reset value after each shot (shorter = faster)
  shootCooldown: number;
  chargeTimeLeft?: number;
  chargeDx?: number;
  chargeDy?: number;
  chargeHit?: boolean;
}

// Difficulty grows with dungeon time — stay longer, enemies get harder.
// Player must keep listening to stay ahead; neglecting dwell falls behind.
// At DIFFICULTY_SCALE_MS, enemy stats double (+100%).
export const DIFFICULTY_SCALE_MS = 300_000; // 5 minutes to double
export const difficultyFor = (dungeonMs: number) => 1 + dungeonMs / DIFFICULTY_SCALE_MS;

// Balance targets for initial difficulty scaling (all tunable).
export const BALANCE_HITS_TO_KILL      = 3;    // player attacks to kill a charger
export const BALANCE_HITS_TO_DIE       = 3;    // charger hits to kill player
export const CHARGER_BASE_HP           = 20;   // must stay in sync with spawnEnemies
export const CHARGER_BASE_DMG          = 28;   // must stay in sync with spawnEnemies
export const INITIAL_DIFFICULTY_DAMPING = 0.8; // keeps initial feel slightly under "perfect match"
const PLAYER_BASE_SPEED = 250; // px/s, matches SPEED in useGameLoop
const SHOOTER_BASE_HP   = 15;
const SHOOTER_BASE_DMG  = 15;

// Derives the difficulty scalar a new dungeon should start at, based on the
// player's accumulated stats. Four axes (attack/HP/speed/sustain) are
// combined via geometric mean so no single stat dominates.
export function initialDifficultyFromStats(stats: PlayerStats): number {
  const d_attack  = (BALANCE_HITS_TO_KILL * stats.attackDmg) / CHARGER_BASE_HP;
  const d_hp      = stats.maxHP / (BALANCE_HITS_TO_DIE * CHARGER_BASE_DMG);
  const d_speed   = Math.pow(
    (PLAYER_BASE_SPEED * sprintMultiplier(stats.agility)) / CHARGE_SPEED,
    2,
  );
  const d_sustain = Math.max(1, hpRegenRate(stats.stamina) / REGEN_BASE);
  return INITIAL_DIFFICULTY_DAMPING * Math.pow(d_attack * d_hp * d_speed * d_sustain, 0.25);
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

export function spawnEnemies(cellKey: string, _playerX: number, _playerY: number, wave = 0, difficulty = 1, modifier: MoodModifier = MOOD_MODIFIER_NONE): Enemy[] {
  const h = hashKey(cellKey);
  const count = Math.max(1, Math.round((6 + (h % 3)) * modifier.spawnCountMult)); // base 6–8

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
    const sqrtD = Math.sqrt(difficulty);
    const hp = Math.round((kind === "charger" ? CHARGER_BASE_HP : SHOOTER_BASE_HP) * difficulty * modifier.enemyHPMult);
    const dmg = Math.round((kind === "charger" ? CHARGER_BASE_DMG : SHOOTER_BASE_DMG) * difficulty * modifier.enemyDmgMult);
    const spd = Math.round(CHARGE_SPEED * sqrtD * modifier.enemySpeedMult);
    const baseCooldown = kind === "charger" ? CHARGE_PAUSE : (SHOOTER_COOLDOWN / sqrtD) * modifier.shootCooldownMult;
    const initCooldown = kind === "charger" ? 0.5 + (seed % 10) * 0.15 : baseCooldown;
    enemies.push({ id: `${cellKey}:${i}:${wave}`, kind, x, y, hp, maxHp: hp, damage: dmg, speed: spd, baseCooldown, shootCooldown: initCooldown });
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
        nx += e.chargeDx * e.speed * dt;
        ny += (e.chargeDy ?? 0) * e.speed * dt;
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
      damage: e.damage,
    });
    return { ...e, shootCooldown: e.baseCooldown };
  });
  return { enemies: updated, spawned };
}

export const PLAYER_PROJ_SPEED = 420; // px/s
export const CHAIN_COUNT = 3;          // max enemies per lightning strike
export const CHAIN_DECAY = 0.6;        // damage multiplier per hop

export interface LightningArc {
  x1: number; y1: number;
  x2: number; y2: number;
  ttl: number; // seconds remaining (starts at LIGHTNING_TTL)
}

export const LIGHTNING_TTL = 0.18; // seconds the arc is visible

// Returns the greedy nearest-neighbor chain starting at (ox, oy).
// Each hop's damage is reduced by CHAIN_DECAY.
export function buildLightningChain(
  enemies: Enemy[],
  ox: number,
  oy: number,
  dmg: number,
): { hits: Array<{ id: string; damage: number }>; arcs: LightningArc[] } {
  const hits: Array<{ id: string; damage: number }> = [];
  const arcs: LightningArc[] = [];
  const used = new Set<string>();
  let cx = ox, cy = oy, d = dmg;
  for (let hop = 0; hop < CHAIN_COUNT; hop++) {
    let best: Enemy | null = null, bestDist = Infinity;
    for (const e of enemies) {
      if (used.has(e.id)) continue;
      const dist = Math.hypot(e.x - cx, e.y - cy);
      if (dist < bestDist) { bestDist = dist; best = e; }
    }
    if (!best) break;
    hits.push({ id: best.id, damage: d });
    arcs.push({ x1: cx, y1: cy, x2: best.x, y2: best.y, ttl: LIGHTNING_TTL });
    used.add(best.id);
    cx = best.x; cy = best.y;
    d *= CHAIN_DECAY;
  }
  return { hits, arcs };
}

export function moveProjectiles(projectiles: Projectile[], dt: number): Projectile[] {
  return projectiles.map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt }));
}

export function isOutOfBounds(p: Projectile): boolean {
  return p.x < -20 || p.x > ROOM_PX + 20 || p.y < -20 || p.y > ROOM_PX + 20;
}

const PLAYER_PROJ_RADIUS = 10; // matches canvas render size
const ENEMY_PROJ_RADIUS = 8;

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
        playerDmg += e.damage;
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
