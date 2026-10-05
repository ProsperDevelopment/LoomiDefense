import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Enemy } from '../../src/entities/Enemy';
import { Position } from '../../src/components/Position';

const simplePath = [
  { x: 48, y: 48 },
  { x: 96, y: 48 },
  { x: 144, y: 48 },
  { x: 192, y: 48 },
];

describe('Enemy', () => {
  let enemy: Enemy;

  beforeEach(() => {
    enemy = new Enemy('basic', simplePath);
  });

  it('reports the distance left to the base', () => {
    const e = new Enemy('basic', simplePath);
    // Three 48px legs from (48,48) to (192,48)
    expect(e.pathRemaining()).toBe(144);
    e.update(500); // first call snaps onto the first leg
    e.update(500); // walks 30px along it
    expect(e.pathRemaining()).toBeLessThan(144);
  });

  it('initializes with correct type data', () => {
    expect(enemy.type).toBe('basic');
    expect(enemy.data.hp).toBe(80);
    expect(enemy.data.speed).toBe(60);
    expect(enemy.alive).toBe(true);
    expect(enemy.reachedBase).toBe(false);
  });

  it('starts at the first path point', () => {
    expect(enemy.position.x).toBe(48);
    expect(enemy.position.y).toBe(48);
  });

  it('follows the path', () => {
    // Move for a long time to progress along the path
    for (let i = 0; i < 50; i++) {
      enemy.update(100);
    }
    // Should have moved from start
    expect(enemy.position.x).toBeGreaterThan(48);
  });

  it('reports reached base when path ends', () => {
    // Fast-forward through the entire path
    for (let i = 0; i < 500; i++) {
      const reached = enemy.update(100);
      if (reached) break;
    }
    expect(enemy.reachedBase).toBe(true);
  });

  it('can be killed', () => {
    enemy.kill();
    expect(enemy.isDead()).toBe(true);
    expect(enemy.alive).toBe(false);
  });

  it('different types have different stats', () => {
    const fast = new Enemy('fast', simplePath);
    expect(fast.data.speed).toBe(120);
    expect(fast.data.hp).toBe(50);

    const armored = new Enemy('armored', simplePath);
    expect(armored.data.armor).toBe(5);
    expect(armored.data.hp).toBe(250);
  });

  it('accepts custom ID', () => {
    const e = new Enemy('basic', simplePath, 'my_id');
    expect(e.id).toBe('my_id');
  });
});

describe('new enemy types', () => {
  it('defines brute, sprinter and phantom', () => {
    const brute = new Enemy('brute', simplePath);
    expect(brute.data.hp).toBeGreaterThan(400);
    expect(brute.data.armor).toBeGreaterThan(0);
    expect(brute.data.invisible).toBeUndefined();

    const sprinter = new Enemy('sprinter', simplePath);
    expect(sprinter.data.speed).toBeGreaterThan(150);
    expect(sprinter.data.hp).toBeLessThan(60);

    const phantom = new Enemy('phantom', simplePath);
    expect(phantom.data.invisible).toBe(true);
    expect(phantom.data.speed).toBeGreaterThan(60);
  });

  it('phantom is damageable only by upgraded sniper/archer', async () => {
    const { canDamageEnemy } = await import('../../src/utils/damageRules');
    const phantom = new Enemy('phantom', simplePath);
    expect(canDamageEnemy('arrow', 1, phantom.data)).toBe(false);
    expect(canDamageEnemy('arrow', 2, phantom.data)).toBe(true);
    expect(canDamageEnemy('sniper', 3, phantom.data)).toBe(true);
    expect(canDamageEnemy('cannon', 5, phantom.data)).toBe(false);
  });
});

describe('splitter enemy', () => {
  // Long straight path so the21s test never reaches the base
  const longPath = Array.from({ length: 60 }, (_, i) => ({ x: i * 48, y: 0 }));

  it('is quite resistant', () => {
    const splitter = new Enemy('splitter', longPath);
    expect(splitter.data.hp).toBeGreaterThanOrEqual(500);
    expect(splitter.data.armor).toBeGreaterThanOrEqual(6);
    expect(splitter.data.speed).toBeLessThanOrEqual(35);
  });

  it('minis are weaker, quicker half-size copies that never split', () => {
    const parent = new Enemy('splitter', longPath);
    const mini = new Enemy('splitter', longPath, undefined, { mini: true });
    expect(mini.isMini).toBe(true);
    expect(mini.data.hp).toBeLessThan(parent.data.hp);
    // Minis are half as tough as they used to be: 12.5% of the parent
    expect(mini.data.hp).toBe(81); // 650 * 0.125
    expect(mini.data.size).toBeLessThan(parent.data.size);
    expect(mini.data.speed).toBeGreaterThan(parent.data.speed);
    // Parent keeps its own stats (definitions are never mutated)
    expect(parent.data.hp).toBe(650);
    expect(new Enemy('splitter', longPath).data.hp).toBe(650);
  });

  it('stops dead for two seconds every twenty, then signals a split', () => {
    const e = new Enemy('splitter', longPath);
    let t = 0;
    while (t < 19500) {
      e.update(500);
      t += 500;
    }
    expect(e.consumeSplitRequest()).toBe(false);

    // Crossing the 20s mark freezes it in place
    e.update(600);
    const frozenX = e.position.x;
    e.update(500);
    e.update(500);
    expect(e.position.x).toBe(frozenX);
    expect(e.consumeSplitRequest()).toBe(false);

    // The2s stop completes -> one-shot split signal, walking resumes
    e.update(1200);
    expect(e.consumeSplitRequest()).toBe(true);
    expect(e.consumeSplitRequest()).toBe(false);
    const beforeResume = e.position.x;
    e.update(500);
    expect(e.position.x).toBeGreaterThan(beforeResume);
  });
});

describe('ninja summons', () => {
  it('defines the ninja unit with contact damage and no bounty', () => {
    const n = new Enemy('ninja', simplePath);
    expect(n.data.hp).toBe(45);
    expect(n.data.size).toBe(17); // drawn 1.25x — a bit larger than the rest
    expect(n.data.contactDamage).toBeGreaterThan(0);
    expect(n.data.reward).toBe(0); // ninja kills never pay a bounty
  });

  it('walks the path backwards and flags itself friendly', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true, ownerId: 'p1' });
    expect(n.friendly).toBe(true);
    expect(n.ownerId).toBe('p1');
    // Starts at the base (last path point) and heads toward the spawn
    expect(n.position.x).toBe(192);
    for (let i = 0; i < 20; i++) n.update(100);
    expect(n.position.x).toBeLessThan(192);
  });

  it('reaches the enemy spawn end of the path', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    for (let i = 0; i < 500; i++) {
      if (n.update(100)) break;
    }
    expect(n.reachedBase).toBe(true);
    expect(n.friendly).toBe(true); // GameScene skips base damage for friendlies
  });

  it('counts its remaining path from the far end', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    expect(n.pathRemaining()).toBe(144); // same three legs, walked in reverse
  });
});

describe('ninja melee focus', () => {
  it('presses toward the focus instead of walking the path', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    n.meleeFocus = { x: 192, y: 140 }; // off the path, straight below the base
    const y0 = n.position.y;
    const x0 = n.position.x;
    for (let i = 0; i < 10; i++) n.update(100);
    expect(n.position.y).toBeGreaterThan(y0); // moved toward the focus
    expect(n.position.x).toBe(x0);            // not walking the path legs
    expect(n.reachedBase).toBe(false);        // dueling never claims base arrival
  });

  it('resumes the path when the focus clears', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    n.meleeFocus = { x: 192, y: 140 };
    for (let i = 0; i < 10; i++) n.update(100);
    n.meleeFocus = null;
    const y0 = n.position.y;
    for (let i = 0; i < 30; i++) n.update(100);
    // Walks back up to the base waypoint, then on to the reverse legs
    expect(n.position.y).toBeLessThan(y0);
    expect(n.position.x).toBeLessThan(192);
  });

  it('clears duel state on reset', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    n.combatTargetId = 'enemy_basic_1';
    n.meleeFocus = { x: 10, y: 10 };
    n.reset('ninja', simplePath);
    expect(n.combatTargetId).toBeNull();
    expect(n.meleeFocus).toBeNull();
  });
});

describe('ninja throw ammo', () => {
  it('starts dry by default and melee summons never carry a quiver', () => {
    const melee = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    expect(melee.throwsLeft).toBe(0);
    expect(melee.summonLevel).toBe(1);
  });

  it('keeps its quiver until reset, then clears for pooling', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    n.summonLevel = 3;
    n.throwsLeft = 10;
    n.fighting = true;
    n.reset('ninja', simplePath);
    expect(n.throwsLeft).toBe(0);
    expect(n.summonLevel).toBe(1);
    expect(n.fighting).toBe(false);
  });

  it('starts out of the attack stance', () => {
    const n = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    expect(n.fighting).toBe(false);
  });
});

describe('enemy physics: weight, knock, collisions', () => {
  const longPath = Array.from({ length: 60 }, (_, i) => ({ x: i * 48, y: 0 }));

  it('derives weight mostly from health with per-spawn randomness', () => {
    // basic: 80 hp -> weight inside 80 * [0.85, 1.15]
    const w = new Enemy('basic', simplePath).weight;
    expect(w).toBeGreaterThanOrEqual(68);
    expect(w).toBeLessThanOrEqual(92);
    // Splitter minis are far lighter than their parent
    const parent = new Enemy('splitter', longPath);
    const mini = new Enemy('splitter', longPath, undefined, { mini: true });
    expect(mini.weight).toBeLessThan(parent.weight);
  });

  it('phantoms and bats never collide; walkers and ninjas do', () => {
    expect(new Enemy('phantom', simplePath).collidable).toBe(false);
    expect(new Enemy('bat', simplePath).collidable).toBe(false);
    expect(new Enemy('basic', simplePath).collidable).toBe(true);
    expect(new Enemy('ninja', simplePath).collidable).toBe(true);
  });

  it('knockback slides the body against its march, then decays to rest', () => {
    const e = new Enemy('basic', simplePath);
    e.knockVX = -300; // shove backwards along its path
    const x0 = e.position.x;
    e.update(100);
    expect(e.position.x).toBeLessThan(x0); // knocked back
    expect(Math.abs(e.knockVX)).toBeLessThan(300); // decayed
    for (let i = 0; i < 40; i++) e.update(50);
    expect(e.knockVX).toBe(0); // settled
  });
});

describe('collision physics toggle', () => {
  it('starts off and only turns on from a ninja collision', () => {
    const e = new Enemy('basic', simplePath);
    expect(e.physicsEnabled).toBe(false);
    expect(e.physicsBy).toBeNull();

    const ninja = new Enemy('ninja', simplePath, undefined, { reverse: true, friendly: true });
    e.awakenPhysics(ninja);
    expect(e.physicsEnabled).toBe(true);
    expect(e.physicsBy).toBe(ninja);
  });

  it('stays bound to its first living ninja, then drops when that ninja dies', () => {
    const e = new Enemy('basic', simplePath);
    const ninjaA = new Enemy('ninja', simplePath, undefined, { friendly: true });
    const ninjaB = new Enemy('ninja', simplePath, undefined, { friendly: true });
    e.awakenPhysics(ninjaA);
    e.refreshPhysics();
    expect(e.physicsEnabled).toBe(true); // A still alive

    e.awakenPhysics(ninjaB);
    expect(e.physicsBy).toBe(ninjaA); // live binding is kept

    ninjaA.kill();
    e.refreshPhysics();
    expect(e.physicsEnabled).toBe(false);
    expect(e.physicsBy).toBeNull();
  });

  it('clears the toggle on pooling reset', () => {
    const e = new Enemy('basic', simplePath);
    e.awakenPhysics(new Enemy('ninja', simplePath, undefined, { friendly: true }));
    e.reset('basic', simplePath);
    expect(e.physicsEnabled).toBe(false);
    expect(e.physicsBy).toBeNull();
  });
});

describe('debris/corpse physics window', () => {
  it('turns physics on for 500ms after bumping corpse debris, then expires', () => {
    const e = new Enemy('basic', simplePath);
    expect(e.hasPhysics()).toBe(false);

    e.physicsMs = 500; // what a bone, shard or corpse bump does
    expect(e.hasPhysics()).toBe(true);

    e.update(200);
    expect(e.hasPhysics()).toBe(true); // still inside the window
    e.update(300);
    expect(e.hasPhysics()).toBe(false); // window expired
    expect(e.physicsEnabled).toBe(false); // no ninja binding involved
  });

  it('a debris bump never cuts a ninja binding short', () => {
    const e = new Enemy('basic', simplePath);
    const ninja = new Enemy('ninja', simplePath, undefined, { friendly: true });
    e.awakenPhysics(ninja);
    e.physicsMs = 500;
    e.update(600); // window expires
    expect(e.hasPhysics()).toBe(true); // still on from the ninja

    ninja.kill();
    e.refreshPhysics();
    expect(e.hasPhysics()).toBe(false);
  });

  it('clears the debris window on pooling reset', () => {
    const e = new Enemy('basic', simplePath);
    e.physicsMs = 500;
    e.reset('basic', simplePath);
    expect(e.hasPhysics()).toBe(false);
  });
});

describe('low-health panic (below 25% hp)', () => {
  const longPath = Array.from({ length: 60 }, (_, i) => ({ x: i * 48, y: 0 }));

  it('swings the speed up and down below 25% health', () => {
    const e = new Enemy('basic', longPath);
    expect(e.currentSpeed).toBe(e.data.speed);

    e.health.current = e.health.max * 0.2;
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      e.update(100);
      samples.push(e.currentSpeed);
    }
    // One oscillation cycle is ~1047ms, so the samples contain both extremes
    expect(Math.max(...samples)).toBeGreaterThan(e.data.speed * 1.1);
    expect(Math.min(...samples)).toBeLessThan(e.data.speed * 0.9);
  });

  it('keeps a steady speed above the threshold', () => {
    const e = new Enemy('basic', longPath);
    e.health.current = e.health.max * 0.5;
    for (let i = 0; i < 10; i++) e.update(100);
    expect(e.currentSpeed).toBe(e.data.speed);
  });

  it('randomly flickers collision physics on while wounded', () => {
    const e = new Enemy('basic', longPath);
    e.health.current = e.health.max * 0.2;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // always trigger
    try {
      e.update(50);
      expect(e.physicsMs).toBeGreaterThan(0);
      expect(e.hasPhysics()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('battle hit reactions (fx state)', () => {
  it('layers fx offsets over the path and clears them on reset', () => {
    const e = new Enemy('basic', simplePath);
    e.fxY = -24;
    e.fxRotation = Math.PI;
    e.animOverride = 'slime_left';
    expect(e.hasPhysics()).toBe(false); // unrelated systems stay independent

    e.reset('basic', simplePath);
    expect(e.fxX).toBe(0);
    expect(e.fxY).toBe(0);
    expect(e.fxRotation).toBe(0);
    expect(e.animOverride).toBeNull();
  });
});
