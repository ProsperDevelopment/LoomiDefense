import Phaser from 'phaser';
import type { TowerType, EnemyType, TargetMode } from '../types';
import { Grid } from '../utils/Grid';
import { Pathfinding } from '../utils/Pathfinding';
import { WaveManager } from '../systems/WaveManager';
import { EconomySystem } from '../systems/EconomySystem';
import { HealthSystem } from '../systems/HealthSystem';
import { TargetingSystem, type TargetableEntity } from '../systems/TargetingSystem';
import { Tower } from '../entities/Tower';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { HUD } from '../ui/HUD';
import { TowerPanel } from '../ui/TowerPanel';
import { WaveIndicator } from '../ui/WaveIndicator';
import { MAP_DEFINITIONS } from '../data/maps';
import { TOWER_DEFINITIONS } from '../data/towers';
import { CELL_SIZE, STARTING_LIVES, COLORS } from '../config/constants';
import { eventBus } from '../utils/EventBus';

/**
 * Terrain tiles - individual textures generated in BootScene
 */
const TERRAIN_TILES = {
  GRASS: 'tile_grass',
  STONE_VERTICAL: 'tile_stone_v',
  STONE_HORIZONTAL: 'tile_stone_h',
  STONE_CROSS: 'tile_stone_cross',
  TRANSITION_TL: 'tile_trans_tl',
  TRANSITION_TR: 'tile_trans_tr',
  TRANSITION_BL: 'tile_trans_bl',
  TRANSITION_BR: 'tile_trans_br',
};

function getTerrainTileKey(cellType: string, col: number, row: number, grid: Grid): string {
  if (cellType !== 'path' && cellType !== 'spawn' && cellType !== 'base') {
    return TERRAIN_TILES.GRASS;
  }

  const hasLeft = col > 0 && (grid.getCell(col - 1, row) === 'path' || grid.getCell(col - 1, row) === 'spawn' || grid.getCell(col - 1, row) === 'base');
  const hasRight = col < grid.cols - 1 && (grid.getCell(col + 1, row) === 'path' || grid.getCell(col + 1, row) === 'spawn' || grid.getCell(col + 1, row) === 'base');
  const hasUp = row > 0 && (grid.getCell(col, row - 1) === 'path' || grid.getCell(col, row - 1) === 'spawn' || grid.getCell(col, row - 1) === 'base');
  const hasDown = row < grid.rows - 1 && (grid.getCell(col, row + 1) === 'path' || grid.getCell(col, row + 1) === 'spawn' || grid.getCell(col, row + 1) === 'base');

  const horizontal = hasLeft || hasRight;
  const vertical = hasUp || hasDown;

  if (horizontal && vertical) return TERRAIN_TILES.STONE_CROSS;
  if (horizontal) return TERRAIN_TILES.STONE_HORIZONTAL;
  if (vertical) return TERRAIN_TILES.STONE_VERTICAL;
  return TERRAIN_TILES.STONE_VERTICAL;
}

export class GameScene extends Phaser.Scene {
  private grid!: Grid;
  private pathfinding!: Pathfinding;
  private waveManager!: WaveManager;
  private economy!: EconomySystem;
  private healthSystem!: HealthSystem;

  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];

  private lives: number = STARTING_LIVES;
  private score: number = 0;
  private selectedTowerType: TowerType | null = null;
  private selectedTower: Tower | null = null;
  private isGameOver: boolean = false;
  private gameSpeed: number = 1;
  private speedButton!: Phaser.GameObjects.Container;

  private hud!: HUD;
  private towerPanel!: TowerPanel;
  private waveIndicator!: WaveIndicator;

  private hoverIndicator: Phaser.GameObjects.Rectangle | null = null;
  private hoverRangeCircle: Phaser.GameObjects.Arc | null = null;
  private hoverCol: number = -1;
  private hoverRow: number = -1;
  private enemiesAlive: number = 0;
  private enemiesSpawnedInWave: number = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);
    this.resetState();

    const mapData = MAP_DEFINITIONS[0];
    this.grid = new Grid(mapData);
    this.pathfinding = new Pathfinding(this.grid);
    this.waveManager = new WaveManager();
    this.economy = new EconomySystem();
    this.healthSystem = new HealthSystem();

    eventBus.clear();
    this.drawGrid();
    this.createUI();
    this.setupInput();
    this.setupEvents();

    this.waveManager.onSpawnEnemy = (type) => this.spawnEnemy(type);
  }

  private resetState(): void {
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.lives = STARTING_LIVES;
    this.score = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.isGameOver = false;
    this.enemiesAlive = 0;
    this.enemiesSpawnedInWave = 0;
  }

  private createUI(): void {
    this.hud = new HUD(this);
    this.hud.setGold(this.economy.getGold());
    this.hud.setLives(this.lives);
    this.hud.setWave(0, this.waveManager.getTotalWaves());

    this.towerPanel = new TowerPanel(this, {
      onTowerSelect: (type) => this.selectedTowerType = type,
      onSellTower: () => this.onSellTower(),
      onUpgradeTower: () => this.onUpgradeTower(),
    });

    this.waveIndicator = new WaveIndicator(this, () => this.startNextWave());
    this.waveIndicator.setWave(0, this.waveManager.getTotalWaves());

    this.hoverIndicator = this.add.rectangle(0, 0, CELL_SIZE - 2, CELL_SIZE - 2, 0x4CAF50, 0.3);
    this.hoverIndicator.setStrokeStyle(2, 0x4CAF50);
    this.hoverIndicator.setVisible(false);
    this.hoverIndicator.setDepth(50);

    // Hover range circle (shown in build mode)
    this.hoverRangeCircle = this.add.circle(0, 0, 100, 0xffffff, 0);
    this.hoverRangeCircle.setStrokeStyle(1, 0xffffff, 0.4);
    this.hoverRangeCircle.setVisible(false);
    this.hoverRangeCircle.setDepth(49);

    this.createSpeedButton();
  }

  private createSpeedButton(): void {
    const btn = this.add.container(980, 50);
    btn.setDepth(100);

    const bg = this.add.rectangle(0, 0, 60, 30, 0x333355);
    bg.setStrokeStyle(2, 0x555577);

    const text = this.add.text(0, 0, '1x', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.add([bg, text]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
      text.setText(`${this.gameSpeed}x`);
      bg.setFillStyle(this.gameSpeed === 2 ? 0x4CAF50 : 0x333355);
    });
    bg.on('pointerover', () => bg.setFillStyle(0x444466));
    bg.on('pointerout', () => bg.setFillStyle(this.gameSpeed === 2 ? 0x4CAF50 : 0x333355));

    this.speedButton = btn;
  }

  private setupInput(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    // Keyboard shortcuts
    this.input.keyboard?.on('keydown-U', () => this.onUpgradeTower());
    this.input.keyboard?.on('keydown-X', () => this.onSellTower());
    this.input.keyboard?.on('keydown-ESC', () => {
      this.selectedTowerType = null;
      this.towerPanel.selectTower(null);
      this.deselectTower();
    });
  }

  private setupEvents(): void {
    eventBus.on('enemy-killed', (p) => {
      this.economy.earn(p.reward);
      this.score += p.reward;
      this.hud.setGold(this.economy.getGold());
      this.hud.setScore(this.score);
      this.enemiesAlive--;
      this.checkWaveComplete();
    });

    eventBus.on('enemy-reached-base', (p) => {
      this.lives -= p.damage;
      this.hud.setLives(this.lives);
      this.enemiesAlive--;
      this.checkWaveComplete();
      if (this.lives <= 0) this.gameOver(false);
    });
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver) return;
    const scaledDelta = delta * this.gameSpeed;
    this.waveManager.update(scaledDelta);
    this.updateEnemies(scaledDelta);
    this.updateTowerCombat(scaledDelta);
    this.updateProjectiles(scaledDelta);
  }

  private drawGrid(): void {
    // Draw grass background
    for (let row = 0; row < this.grid.rows; row++) {
      for (let col = 0; col < this.grid.cols; col++) {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE;
        this.add.image(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 'tile_grass')
          .setDisplaySize(CELL_SIZE, CELL_SIZE);
      }
    }

    // Draw smooth road
    this.drawSmoothRoad();

    for (const spawn of this.grid.getSpawnPixels()) {
      this.add.rectangle(spawn.x, spawn.y, 20, 20, 0xe74c3c, 0.7);
      this.add.text(spawn.x, spawn.y, 'S', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    }

    const basePixels = this.grid.getPathPixels();
    const basePos = basePixels[basePixels.length - 1];
    if (basePos) {
      this.add.rectangle(basePos.x, basePos.y, 24, 24, 0x4CAF50, 0.7);
      this.add.text(basePos.x, basePos.y, 'B', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    }
  }

  private drawSmoothRoad(): void {
    const pathPixels = this.grid.getPathPixels();
    if (pathPixels.length < 2) return;

    const graphics = this.add.graphics();
    graphics.setDepth(1);

    // Convert grid points to smooth curve points
    const smoothPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < pathPixels.length; i++) {
      smoothPoints.push({ x: pathPixels[i].x, y: pathPixels[i].y });
    }

    // Draw road outline (darker)
    graphics.lineStyle(36, 0x4a4a4a, 1);
    this.drawSmoothPath(graphics, smoothPoints);

    // Draw road fill (grey)
    graphics.lineStyle(28, 0x7a7a7a, 1);
    this.drawSmoothPath(graphics, smoothPoints);

    // Draw road center line (lighter)
    graphics.lineStyle(2, 0x9a9a9a, 0.5);
    this.drawSmoothPath(graphics, smoothPoints);
  }

  private drawSmoothPath(graphics: Phaser.GameObjects.Graphics, points: { x: number; y: number }[]): void {
    if (points.length < 2) return;

    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);

    // Use catmull-rom style smoothing
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const segments = 8;
      for (let t = 1; t <= segments; t++) {
        const tt = t / segments;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;

        const x = 0.5 * (
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3 +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
          (-p0.x + p2.x) * tt +
          2 * p1.x
        );
        const y = 0.5 * (
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3 +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
          (-p0.y + p2.y) * tt +
          2 * p1.y
        );

        graphics.lineTo(x, y);
      }
    }

    graphics.strokePath();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const { col, row } = this.grid.worldToGrid(pointer.x, pointer.y);
    if (col === this.hoverCol && row === this.hoverRow) return;
    this.hoverCol = col;
    this.hoverRow = row;
    if (!this.hoverIndicator) return;
    if (col < 0 || col >= this.grid.cols || row < 0 || row >= this.grid.rows) {
      this.hoverIndicator.setVisible(false);
      this.hoverRangeCircle?.setVisible(false);
      return;
    }
    const canPlace = this.grid.canPlace(col, row);
    const worldPos = this.grid.gridToWorld(col, row);
    this.hoverIndicator.setPosition(worldPos.x, worldPos.y);
    this.hoverIndicator.setVisible(true);

    // Show range circle in build mode
    if (this.selectedTowerType) {
      const cost = TOWER_DEFINITIONS[this.selectedTowerType].cost;
      const range = TOWER_DEFINITIONS[this.selectedTowerType].range;
      if (this.hoverRangeCircle) {
        this.hoverRangeCircle.setPosition(worldPos.x, worldPos.y);
        this.hoverRangeCircle.setRadius(range);
        this.hoverRangeCircle.setVisible(true);
      }
      if (canPlace && this.economy.canAfford(cost)) {
        this.hoverIndicator.setFillStyle(0x4CAF50, 0.3);
        this.hoverIndicator.setStrokeStyle(2, 0x4CAF50);
      } else {
        this.hoverIndicator.setFillStyle(0xe74c3c, 0.3);
        this.hoverIndicator.setStrokeStyle(2, 0xe74c3c);
      }
    } else {
      this.hoverRangeCircle?.setVisible(false);
      if (canPlace) {
        this.hoverIndicator.setFillStyle(0xffffff, 0.1);
        this.hoverIndicator.setStrokeStyle(1, 0xffffff, 0.3);
      } else {
        this.hoverIndicator.setVisible(false);
      }
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isGameOver) return;
    const { col, row } = this.grid.worldToGrid(pointer.x, pointer.y);
    const existingTower = this.findTowerAt(col, row);

    // Right-click or middle-click to deselect build mode
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
      this.selectedTowerType = null;
      this.towerPanel.selectTower(null);
      if (existingTower) {
        this.selectExistingTower(existingTower);
      }
      return;
    }

    // Left-click on existing tower while in build mode - deselect build, select tower
    if (existingTower && this.selectedTowerType) {
      this.selectedTowerType = null;
      this.towerPanel.selectTower(null);
      this.selectExistingTower(existingTower);
      return;
    }

    // Left-click on existing tower while not in build mode - select it
    if (existingTower && !this.selectedTowerType) {
      this.selectExistingTower(existingTower);
      return;
    }

    // Left-click on empty cell while in build mode - place tower
    if (this.selectedTowerType) {
      this.placeTower(col, row, this.selectedTowerType);
    } else {
      this.deselectTower();
    }
  }

  private placeTower(col: number, row: number, type: TowerType): void {
    const data = TOWER_DEFINITIONS[type];
    if (!this.grid.canPlace(col, row)) return;
    if (!this.economy.canAfford(data.cost)) return;
    this.economy.spend(data.cost);
    this.grid.placeTower(col, row);
    const tower = new Tower(type, col, row);
    tower.createSprite(this);
    tower.showRange(false);
    this.towers.push(tower);
    eventBus.emit('tower-placed', { towerType: type, x: col, y: row });
    if (tower.sprite) {
      this.tweens.add({ targets: tower.sprite, scaleX: 1.2, scaleY: 1.2, duration: 100, yoyo: true });
    }
    this.hoverRangeCircle?.setVisible(false);
    this.hud.setGold(this.economy.getGold());
  }

  private selectExistingTower(tower: Tower): void {
    if (this.selectedTower) this.selectedTower.showRange(false);
    this.selectedTower = tower;
    tower.showRange(true);
    const sellValue = this.economy.getSellValue(tower.type, tower.level);
    this.towerPanel.showTowerInfo(tower.type, tower.level, sellValue);
  }

  private deselectTower(): void {
    if (this.selectedTower) { this.selectedTower.showRange(false); this.selectedTower = null; }
    this.towerPanel.hideTowerInfo();
    this.hoverRangeCircle?.setVisible(false);
  }

  private onSellTower(): void {
    if (!this.selectedTower) return;
    const refund = this.economy.getSellValue(this.selectedTower.type, this.selectedTower.level);
    this.economy.earn(refund);
    this.grid.removeTower(this.selectedTower.getGridCol(), this.selectedTower.getGridRow());
    this.selectedTower.destroy();
    this.towers = this.towers.filter(t => t !== this.selectedTower);
    eventBus.emit('tower-sold', { towerType: this.selectedTower.type, refund });
    this.deselectTower();
    this.hud.setGold(this.economy.getGold());
  }

  private onUpgradeTower(): void {
    if (!this.selectedTower || this.selectedTower.level >= 3) return;
    const cost = this.economy.getUpgradeCost(this.selectedTower.type, this.selectedTower.level);
    if (!this.economy.canAfford(cost)) return;
    this.economy.spend(cost);
    this.selectedTower.upgrade();
    eventBus.emit('tower-upgraded', { towerType: this.selectedTower.type, newLevel: this.selectedTower.level });
    const sellValue = this.economy.getSellValue(this.selectedTower.type, this.selectedTower.level);
    this.towerPanel.showTowerInfo(this.selectedTower.type, this.selectedTower.level, sellValue);
    this.hud.setGold(this.economy.getGold());
  }

  private findTowerAt(col: number, row: number): Tower | null {
    return this.towers.find(t => t.getGridCol() === col && t.getGridRow() === row) || null;
  }

  private updateEnemies(deltaMs: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      const reachedBase = enemy.update(deltaMs);
      if (reachedBase) {
        eventBus.emit('enemy-reached-base', { damage: 1 });
        this.removeEnemy(enemy, i);
      }
    }
  }

  private removeEnemy(enemy: Enemy, index?: number): void {
    enemy.destroy();
    if (index !== undefined) {
      this.enemies.splice(index, 1);
    } else {
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) this.enemies.splice(idx, 1);
    }
  }

  private updateTowerCombat(deltaMs: number): void {
    for (const tower of this.towers) {
      tower.update(deltaMs);
      if (!tower.canFire()) continue;
      const target = this.findTarget(tower);
      if (!target) continue;
      tower.fire();
      this.fireProjectile(tower, target);
    }
  }

  private findTarget(tower: Tower): TargetableEntity | null {
    const enemies = this.enemies
      .filter(e => e.alive && !e.isDead())
      .map(e => ({ id: e.id, position: e.position, health: e.health }));
    return TargetingSystem.findTarget(tower.position, tower.range, enemies, tower.targetMode);
  }

  private fireProjectile(tower: Tower, target: TargetableEntity): void {
    const towerPos = tower.getWorldPosition();
    const damage = { baseDamage: tower.damage, splashRadius: tower.splashRadius, slowFactor: tower.slowFactor, slowDuration: tower.slowDuration };
    const proj = new Projectile(tower.type, towerPos.x, towerPos.y, damage as any, target.id, Phaser.Display.Color.HexStringToColor(tower.data.color).color);
    proj.createSprite(this);
    this.projectiles.push(proj);
    eventBus.emit('projectile-fired', { towerType: tower.type, x: towerPos.x, y: towerPos.y });
  }

  private updateProjectiles(deltaMs: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) { proj.destroy(); this.projectiles.splice(i, 1); continue; }
      const targetEnemy = this.enemies.find(e => e.id === proj.getTargetId() && e.alive);
      const targetPos = targetEnemy ? targetEnemy.position : null;
      const reached = proj.update(deltaMs, targetPos);
      if (reached && targetEnemy && proj.hasHit(targetEnemy.position)) {
        this.applyProjectileDamage(proj, targetEnemy);
        proj.alive = false;
      } else if (!targetPos) {
        proj.alive = false;
      }
    }
  }

  private applyProjectileDamage(proj: Projectile, primaryTarget: Enemy): void {
    const dmg = proj.damage;
    const killed = this.healthSystem.applyDamage(
      { id: primaryTarget.id, position: primaryTarget.position, health: primaryTarget.health },
      dmg.baseDamage,
    );
    if (killed) this.onEnemyKilled(primaryTarget);
    if (dmg.slowFactor < 1.0) {
      primaryTarget.health.applySlow(dmg.slowFactor, dmg.slowDuration);
    }
    if (dmg.splashRadius > 0) {
      const nearbyEnemies = this.enemies
        .filter(e => e.alive && e !== primaryTarget)
        .map(e => ({ id: e.id, position: e.position, health: e.health }));
      const splashKilled = this.healthSystem.applySplashDamage(
        primaryTarget.position.x, primaryTarget.position.y, dmg.splashRadius, dmg.baseDamage * 0.5, nearbyEnemies,
      );
      for (const k of splashKilled) this.onEnemyKilledById(k.id);
    }
  }

  private onEnemyKilled(enemy: Enemy): void {
    const reward = enemy.data.reward;
    eventBus.emit('enemy-killed', { enemyType: enemy.type, reward, x: enemy.position.x, y: enemy.position.y });
    this.createDeathEffect(enemy.position.x, enemy.position.y, enemy.data.color);
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) this.removeEnemy(enemy, idx);
  }

  private onEnemyKilledById(id: string): void {
    const enemy = this.enemies.find(e => e.id === id && e.alive);
    if (enemy) this.onEnemyKilled(enemy);
  }

  private createDeathEffect(x: number, y: number, color: string): void {
    const particles = this.add.circle(x, y, 4, Phaser.Display.Color.HexStringToColor(color).color);
    this.tweens.add({
      targets: particles, alpha: 0, scaleX: 2, scaleY: 2, duration: 300,
      onComplete: () => particles.destroy(),
    });
  }

  private spawnEnemy(type: EnemyType): void {
    const path = this.grid.getPathPixels();
    const enemy = new Enemy(type, path);
    enemy.createSprite(this);
    this.enemies.push(enemy);
    this.enemiesAlive++;
    this.enemiesSpawnedInWave++;
  }

  private startNextWave(): void {
    if (this.isGameOver) return;
    this.enemiesSpawnedInWave = 0;
    this.waveManager.startWave();
    this.waveIndicator.showStartButton(false);
    this.hud.setWave(this.waveManager.getWaveNumber(), this.waveManager.getTotalWaves());
  }

  private checkWaveComplete(): void {
    if (!this.waveManager.isWaveActive()) return;
    if (this.enemiesAlive <= 0 && this.enemiesSpawnedInWave >= this.waveManager.getTotalEnemiesInWave()) {
      this.economy.earn(25);
      this.hud.setGold(this.economy.getGold());
      this.waveManager.completeWave();
      if (this.waveManager.isComplete()) {
        this.gameOver(true);
      } else {
        this.waveIndicator.showStartButton(true);
        this.waveIndicator.setWave(this.waveManager.getWaveNumber(), this.waveManager.getTotalWaves());
      }
    }
  }

  private gameOver(victory: boolean): void {
    this.isGameOver = true;
    this.scene.start('GameOverScene', { victory, score: this.score, wave: this.waveManager.getWaveNumber() });
  }
}
