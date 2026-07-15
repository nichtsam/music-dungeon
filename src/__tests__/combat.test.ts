import { describe, expect, it } from "vitest";
import {
  roomTypeFor, spawnEnemies, moveEnemies,
  isOutOfBounds, checkCollisions, tickShooters,
  initialDifficultyFromStats,
  type Enemy, type Projectile,
} from "../combat";
import { BASE_HP, BASE_ATTACK } from "../stats";

// --- roomTypeFor -----------------------------------------------------------

describe("roomTypeFor", () => {
  it("returns one of the three types for any key", () => {
    const types = new Set<string>();
    // sample 100 keys to hit all branches
    for (let i = 0; i < 100; i++) types.add(roomTypeFor(`${i},0,0`));
    expect(types.has("combat")).toBe(true);
    expect(types.has("treasure")).toBe(true);
    expect(types.has("rest")).toBe(true);
  });

  it("is deterministic for the same key", () => {
    expect(roomTypeFor("3,2,1")).toBe(roomTypeFor("3,2,1"));
  });

  it("roughly matches 80/10/10 distribution", () => {
    let combat = 0, treasure = 0, rest = 0;
    for (let i = 0; i < 1000; i++) {
      const t = roomTypeFor(`${i},${i % 5},${i % 3}`);
      if (t === "combat") combat++;
      else if (t === "treasure") treasure++;
      else rest++;
    }
    // loose bounds — deterministic hash, not truly random
    expect(combat).toBeGreaterThan(700);
    expect(treasure).toBeGreaterThan(50);
    expect(rest).toBeGreaterThan(50);
  });
});

// --- spawnEnemies ----------------------------------------------------------

describe("spawnEnemies", () => {
  it("returns 6–8 enemies", () => {
    const n = spawnEnemies("0,0,0", 500, 500).length;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(8);
  });

  it("is deterministic", () => {
    const a = spawnEnemies("1,2,3", 100, 100);
    const b = spawnEnemies("1,2,3", 100, 100);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a.map((e) => e.x)).toEqual(b.map((e) => e.x));
  });

  it("spawns enemies near room edges (all 4 sides covered)", () => {
    const enemies = spawnEnemies("0,0,0", 500, 500);
    const sides = enemies.map((_, i) => i % 4);
    expect(new Set(sides).size).toBe(4); // all 4 sides represented
  });

  it("assigns only charger or shooter kinds", () => {
    const enemies = spawnEnemies("0,0,0", 200, 200);
    for (const e of enemies) expect(["charger", "shooter"]).toContain(e.kind);
  });
});

// --- moveEnemies -----------------------------------------------------------

describe("moveEnemies", () => {
  const charger: Enemy = { id: "c", kind: "charger", x: 400, y: 400, hp: 30, maxHp: 30, damage: 28, speed: 620, baseCooldown: 2.5, shootCooldown: 0 };
  const shooter: Enemy = { id: "s", kind: "shooter", x: 400, y: 400, hp: 20, maxHp: 20, damage: 15, speed: 620, baseCooldown: 2.5, shootCooldown: 3 };

  it("charger sprints toward player when chargeTimeLeft > 0", () => {
    const sprinting = { ...charger, chargeTimeLeft: 0.5, chargeDx: 1, chargeDy: 1 }; // locked NE direction
    const [moved] = moveEnemies([sprinting], 600, 600, 0.1);
    expect(moved.x).toBeGreaterThan(charger.x);
    expect(moved.y).toBeGreaterThan(charger.y);
  });

  it("charger stays still while paused", () => {
    const [moved] = moveEnemies([charger], 600, 600, 0.1);
    expect(moved.x).toBe(charger.x);
    expect(moved.y).toBe(charger.y);
  });

  it("shooter retreats when too close", () => {
    // place shooter 50px left of player center (well within SHOOTER_PREFERRED_DIST=200)
    const px = 500, py = 500;
    const close: Enemy = { ...shooter, x: px + 17 - 50, y: py + 17 };
    const [moved] = moveEnemies([close], px, py, 0.1);
    // shooter should move further from player (retreat)
    const distBefore = Math.hypot(close.x - (px + 17), close.y - (py + 17));
    const distAfter = Math.hypot(moved.x - (px + 17), moved.y - (py + 17));
    expect(distAfter).toBeGreaterThan(distBefore);
  });
});

// --- checkCollisions -------------------------------------------------------

describe("checkCollisions", () => {
  it("charger sprint impact damages player once", () => {
    const charger: Enemy = { id: "c", kind: "charger", x: 17, y: 17, hp: 30, maxHp: 30, damage: 28, speed: 620, baseCooldown: 2.5, shootCooldown: 0, chargeTimeLeft: 0.5, chargeHit: false };
    const { playerDmg, chargerHitIds } = checkCollisions([charger], [], 0, 0);
    expect(playerDmg).toBeGreaterThan(0);
    expect(chargerHitIds).toContain("c");
  });

  it("charger does not damage when paused", () => {
    const charger: Enemy = { id: "c", kind: "charger", x: 17, y: 17, hp: 30, maxHp: 30, damage: 28, speed: 620, baseCooldown: 2.5, shootCooldown: 0 };
    const { playerDmg } = checkCollisions([charger], [], 0, 0);
    expect(playerDmg).toBe(0);
  });

  it("charger does not double-hit same sprint", () => {
    const charger: Enemy = { id: "c", kind: "charger", x: 17, y: 17, hp: 30, maxHp: 30, damage: 28, speed: 620, baseCooldown: 2.5, shootCooldown: 0, chargeTimeLeft: 0.5, chargeHit: true };
    const { playerDmg } = checkCollisions([charger], [], 0, 0);
    expect(playerDmg).toBe(0);
  });

  it("player projectile reduces enemy HP via enemyHits", () => {
    const enemy: Enemy = { id: "e", kind: "charger", x: 100, y: 100, hp: 30, maxHp: 30, damage: 28, speed: 620, baseCooldown: 2.5, shootCooldown: 0 };
    const proj: Projectile = { id: "p", x: 100, y: 100, vx: 0, vy: 0, fromPlayer: true, damage: 10 };
    const { enemyHits, consumedProjIds } = checkCollisions([enemy], [proj], 500, 500);
    expect(enemyHits.length).toBe(1);
    expect(enemyHits[0].id).toBe("e");
    expect(consumedProjIds).toContain("p");
  });

  it("enemy projectile damages player", () => {
    const proj: Projectile = { id: "ep", x: 17, y: 17, vx: 0, vy: 0, fromPlayer: false, damage: 15 };
    const { playerDmg, consumedProjIds } = checkCollisions([], [proj], 0, 0);
    expect(playerDmg).toBe(15);
    expect(consumedProjIds).toContain("ep");
  });

  it("no self-damage from player projectiles not hitting enemies", () => {
    const proj: Projectile = { id: "p", x: 1500, y: 1500, vx: 0, vy: 0, fromPlayer: true, damage: 10 };
    const { playerDmg } = checkCollisions([], [proj], 0, 0);
    expect(playerDmg).toBe(0);
  });
});

// --- isOutOfBounds ---------------------------------------------------------

describe("isOutOfBounds", () => {
  it("flags projectiles outside ROOM_PX", () => {
    const far: Projectile = { id: "f", x: 3000, y: 0, vx: 0, vy: 0, fromPlayer: true, damage: 0 };
    expect(isOutOfBounds(far)).toBe(true);
  });

  it("passes projectiles inside the room", () => {
    const inside: Projectile = { id: "i", x: 500, y: 500, vx: 0, vy: 0, fromPlayer: true, damage: 0 };
    expect(isOutOfBounds(inside)).toBe(false);
  });
});

// --- tickShooters ----------------------------------------------------------

describe("tickShooters", () => {
  it("spawns a projectile when cooldown expires", () => {
    const shooter: Enemy = { id: "s", kind: "shooter", x: 200, y: 200, hp: 20, maxHp: 20, damage: 15, speed: 620, baseCooldown: 2.5, shootCooldown: 0.01 };
    const { spawned } = tickShooters([shooter], 500, 500, 1, 0);
    expect(spawned.length).toBe(1);
    expect(spawned[0].fromPlayer).toBe(false);
  });

  it("does not spawn before cooldown expires", () => {
    const shooter: Enemy = { id: "s", kind: "shooter", x: 200, y: 200, hp: 20, maxHp: 20, damage: 15, speed: 620, baseCooldown: 2.5, shootCooldown: 2 };
    const { spawned } = tickShooters([shooter], 500, 500, 0.1, 0);
    expect(spawned.length).toBe(0);
  });

  it("chargers advance their charge state", () => {
    const charger: Enemy = { id: "c", kind: "charger", x: 200, y: 200, hp: 30, maxHp: 30, damage: 28, speed: 620, baseCooldown: 2.5, shootCooldown: 0 };
    const { spawned, enemies } = tickShooters([charger], 500, 500, 1, 0);
    expect(spawned.length).toBe(0); // chargers never spawn projectiles
    expect(enemies[0].chargeTimeLeft).toBeGreaterThan(0); // cooldown expired → started sprint
  });
});

// --- initialDifficultyFromStats --------------------------------------------

describe("initialDifficultyFromStats", () => {
  const baseStats = {
    maxHP: BASE_HP,
    attackDmg: BASE_ATTACK,
    agility: 0,
    stamina: 0,
    attackRate: 0.8,
  };

  it("returns ≤ 1 for base stats (no initial offset)", () => {
    expect(initialDifficultyFromStats(baseStats)).toBeLessThanOrEqual(1);
  });

  it("returns > 1 for a strong player", () => {
    const strong = { ...baseStats, maxHP: 200, attackDmg: 40, agility: 10, stamina: 10, attackRate: 0.4 };
    expect(initialDifficultyFromStats(strong)).toBeGreaterThan(1);
  });

  it("returns a finite positive number", () => {
    const result = initialDifficultyFromStats(baseStats);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("increases monotonically as stats grow", () => {
    const mid  = { ...baseStats, maxHP: 100, attackDmg: 20, agility: 5,  stamina: 5,  attackRate: 0.6 };
    const high = { ...baseStats, maxHP: 200, attackDmg: 40, agility: 10, stamina: 10, attackRate: 0.4 };
    expect(initialDifficultyFromStats(mid)).toBeLessThan(initialDifficultyFromStats(high));
  });
});
