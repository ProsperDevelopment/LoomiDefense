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
import { Position } from '../components/Position';
import { Projectile } from '../entities/Projectile';
import { HUD } from '../ui/HUD';
import { TowerPanel } from '../ui/TowerPanel';
import { WaveIndicator } from '../ui/WaveIndicator';
import { MAP_DEFINITIONS } from '../data/maps';
import { TOWER_DEFINITIONS } from '../data/towers';
import { CELL_SIZE, STARTING_LIVES, COLORS, DEV_MODE, LEVEL_STARTING_GOLD, STARTING_GOLD, GRID_OFFSET_Y } from '../config/constants';
import { eventBus } from '../utils/EventBus';
import type { WaveData } from '../types';

// Special waves for dev demo level
const DEV_DEMO_WAVES: WaveData[] = [
  {
    waveNumber: 1,
    entries: [
      { enemyType: 'basic', count: 3, spawnDelay: 500, waveDelay: 0 },
      { enemyType: 'fast', count: 3, spawnDelay: 500, waveDelay: 2000 },
      { enemyType: 'armored', count: 2, spawnDelay: 800, waveDelay: 4000 },
      { enemyType: 'healer', count: 2, spawnDelay: 800, waveDelay: 6000 },
      { enemyType: 'swarm', count: 5, spawnDelay: 300, waveDelay: 8000 },
      { enemyType: 'tank', count: 1, spawnDelay: 1500, waveDelay: 10000 },
      { enemyType: 'elite', count: 1, spawnDelay: 1000, waveDelay: 12000 },
      { enemyType: 'boss', count: 1, spawnDelay: 0, waveDelay: 15000 },
    ],
  },
  {
    waveNumber: 2,
    entries: [
      { enemyType: 'basic', count: 5, spawnDelay: 400, waveDelay: 0 },
      { enemyType: 'fast', count: 5, spawnDelay: 400, waveDelay: 1000 },
      { enemyType: 'armored', count: 3, spawnDelay: 600, waveDelay: 2000 },
      { enemyType: 'healer', count: 3, spawnDelay: 600, waveDelay: 3000 },
      { enemyType: 'swarm', count: 10, spawnDelay: 200, waveDelay: 4000 },
      { enemyType: 'tank', count: 2, spawnDelay: 1200, waveDelay: 6000 },
      { enemyType: 'elite', count: 2, spawnDelay: 800, waveDelay: 8000 },
      { enemyType: 'boss', count: 2, spawnDelay: 2000, waveDelay: 10000 },
    ],
  },
];

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
  private currentLevelId: number = 1;
  private selectedEnemy: Enemy | null = null;
  private targetSight: Phaser.GameObjects.Graphics | null = null;
  private pendingBuildPos: { col: number; row: number } | null = null;
  private pendingRangeCircle: Phaser.GameObjects.Arc | null = null;
  private popupClickHandled: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data: { levelId?: number }): void {
    this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);
    this.resetState();

    const levelId = data.levelId !== undefined ? data.levelId : 1;
    this.currentLevelId = levelId;
    const mapIndex = MAP_DEFINITIONS.findIndex(m => m.id === levelId);
    const mapData = MAP_DEFINITIONS[mapIndex >= 0 ? mapIndex : 0];

    this.grid = new Grid(mapData);
    this.blockSmoothRoadCells();
    this.pathfinding = new Pathfinding(this.grid);

    // Use special waves for dev demo
    const waves = levelId === 0 ? DEV_DEMO_WAVES : undefined;
    this.waveManager = new WaveManager(waves);

    // Use level-specific starting gold
    const startingGold = LEVEL_STARTING_GOLD[levelId] ?? STARTING_GOLD;
    this.economy = new EconomySystem(startingGold);

    this.healthSystem = new HealthSystem();

    this.setLevelLives(levelId);

    eventBus.clear();
    this.drawGrid();
    this.createUI();
    this.setupInput();
    this.setupEvents();

    this.waveManager.onSpawnEnemy = (type) => this.spawnEnemy(type);

    // Start first wave after a short delay
    this.time.delayedCall(2000, () => {
      this.startNextWave();
    });
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

  private setLevelLives(levelId: number): void {
    if (levelId === 0) {
      this.lives = 250;
    } else {
      this.lives = STARTING_LIVES;
    }
  }

  private createUI(): void {
    this.hud = new HUD(this);
    this.hud.setGold(this.economy.getGold());
    this.hud.setLives(this.lives);
    this.hud.setWave(0, this.waveManager.getTotalWaves());

    this.towerPanel = new TowerPanel(this, {
      onTowerSelect: (type) => { if (type) this.onBuildTowerSelect(type); },
      onSellTower: () => this.onSellTower(),
      onUpgradeTower: () => this.onUpgradeTower(),
      canAfford: (cost) => this.economy.canAfford(cost),
      onCancel: () => this.cancelPendingBuild(),
    });

    this.waveIndicator = new WaveIndicator(this, () => this.startNextWave(), () => this.startWaveEarly());
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

    // Pending build range circle (frozen target)
    this.pendingRangeCircle = this.add.circle(0, 0, 100, 0xffffff, 0);
    this.pendingRangeCircle.setStrokeStyle(2, 0x4CAF50, 0.6);
    this.pendingRangeCircle.setVisible(false);
    this.pendingRangeCircle.setDepth(48);

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
      this.towerPanel.hide();
      this.deselectTower();
      this.deselectEnemy();
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

    // Update target sight position
    this.updateTargetSight();

    // Update wave indicator countdown
    if (this.waveManager.isWaitingForNextWave()) {
      this.waveIndicator.showCountdown(true);
      this.waveIndicator.setCountdown(this.waveManager.getAutoStartTimer());
      this.waveIndicator.showStartButton(true);
      this.waveIndicator.setBonusText(`Bonus: +${this.waveManager.getEarlyStartBonus()}g`);
    } else {
      this.waveIndicator.showCountdown(false);
      this.waveIndicator.setBonusText('');
    }
  }

  private updateTargetSight(): void {
    if (this.selectedEnemy) {
      if (!this.selectedEnemy.alive || this.selectedEnemy.isDead()) {
        this.deselectEnemy();
      } else {
        this.drawTargetSight(this.selectedEnemy.position.x, this.selectedEnemy.position.y);
      }
    }
  }

  private drawGrid(): void {
    // Always draw chessboard grass background first (underneath everything)
    for (let row = 0; row < this.grid.rows; row++) {
      for (let col = 0; col < this.grid.cols; col++) {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE + GRID_OFFSET_Y;
        const isDark = (row + col) % 2 === 0;
        this.add.image(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 'tile_grass')
          .setDisplaySize(CELL_SIZE, CELL_SIZE)
          .setTint(isDark ? 0x9a9c5e : 0x8a8c4e);
      }
    }

    const mapData = this.grid.getMapData();

    // Draw background tiles on top of grass (if available)
    if (mapData.bgTiles && mapData.bgTiles.length > 0) {
      const bgCellSize = CELL_SIZE / 2;
      for (let row = 0; row < mapData.bgTiles.length; row++) {
        for (let col = 0; col < mapData.bgTiles[row].length; col++) {
          const tileIdx = mapData.bgTiles[row][col];
          if (tileIdx >= 0) {
            const x = col * bgCellSize;
            const y = row * bgCellSize + GRID_OFFSET_Y;

            const tileNum = tileIdx.toString().padStart(3, '0');
            const tileKey = `nature_tile_${tileNum}`;

            if (this.textures.exists(tileKey)) {
              this.add.image(x + bgCellSize / 2, y + bgCellSize / 2, tileKey)
                .setDisplaySize(bgCellSize, bgCellSize);
            }
          }
        }
      }
    }

    // Draw smooth road
    this.drawSmoothRoad();

    for (const spawn of this.grid.getSpawnPixels()) {
      this.add.rectangle(spawn.x, spawn.y + GRID_OFFSET_Y, 20, 20, 0xe74c3c, 0.7);
      this.add.text(spawn.x, spawn.y + GRID_OFFSET_Y, 'S', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    }

    const basePixels = this.grid.getPathPixels();
    const basePos = basePixels[basePixels.length - 1];
    if (basePos) {
      this.add.rectangle(basePos.x, basePos.y + GRID_OFFSET_Y, 24, 24, 0x4CAF50, 0.7);
      this.add.text(basePos.x, basePos.y + GRID_OFFSET_Y, 'B', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
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

  private blockSmoothRoadCells(): void {
    const pathPixels = this.grid.getPathPixels();
    if (pathPixels.length < 2) return;

    // Sample points along the smooth curve and block only directly overlapping cells
    const cellSize = this.grid.cellSize;
    const roadWidth = cellSize * 0.4;

    for (let i = 0; i < pathPixels.length - 1; i++) {
      const p0 = pathPixels[Math.max(0, i - 1)];
      const p1 = pathPixels[i];
      const p2 = pathPixels[Math.min(pathPixels.length - 1, i + 1)];
      const p3 = pathPixels[Math.min(pathPixels.length - 1, i + 2)];

      const segments = 4;
      for (let t = 0; t <= segments; t++) {
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

        // Block only the cell the road actually passes through
        const { col, row } = this.grid.worldToGrid(x, y);
        if (col >= 0 && col < this.grid.cols && row >= 0 && row < this.grid.rows) {
          const cellType = this.grid.getCell(col, row);
          if (cellType === 'empty') {
            this.grid.setCell(col, row, 'path');
          }
        }
      }
    }
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

    // Don't show hover indicator when pending build is active
    if (this.pendingBuildPos) {
      this.hoverIndicator.setVisible(false);
      this.hoverRangeCircle?.setVisible(false);
      return;
    }

    const canPlace = this.grid.canPlace(col, row);
    const worldPos = this.grid.gridToWorld(col, row);
    this.hoverIndicator.setPosition(worldPos.x, worldPos.y);
    this.hoverIndicator.setVisible(true);

    if (canPlace) {
      this.hoverIndicator.setFillStyle(0xffffff, 0.1);
      this.hoverIndicator.setStrokeStyle(1, 0xffffff, 0.3);
    } else {
      this.hoverIndicator.setVisible(false);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isGameOver) return;

    // Ignore clicks if popup was just clicked
    if (this.popupClickHandled) {
      this.popupClickHandled = false;
      return;
    }

    // Ignore clicks if popup is visible
    if (this.towerPanel.isVisible()) {
      return;
    }

    const { col, row } = this.grid.worldToGrid(pointer.x, pointer.y);
    const existingTower = this.findTowerAt(col, row);

    // Right-click or middle-click to cancel
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
      this.cancelPendingBuild();
      this.deselectTower();
      this.deselectEnemy();
      return;
    }

    // Check if clicking on an enemy
    const clickedEnemy = this.findEnemyAt(pointer.x, pointer.y);
    if (clickedEnemy) {
      this.selectEnemy(clickedEnemy);
      return;
    }

    // If there's a pending build position, clicking anywhere cancels it
    if (this.pendingBuildPos) {
      this.cancelPendingBuild();
      return;
    }

    // Left-click on existing tower - show tower info popup
    if (existingTower) {
      this.selectedTower = existingTower;
      existingTower.showRange(true);
      const sellValue = this.economy.getSellValue(existingTower.type, existingTower.level);
      this.towerPanel.showAtCursor(pointer.x, pointer.y, 'tower', {
        type: existingTower.type,
        level: existingTower.level,
        sellValue,
      });
      return;
    }

    // Left-click on empty cell - freeze target and show build popup
    const canPlace = this.grid.canPlace(col, row);
    if (canPlace) {
      this.pendingBuildPos = { col, row };
      this.showPendingRange(col, row);
      this.towerPanel.showAtCursor(pointer.x, pointer.y, 'build');
    } else {
      this.deselectTower();
    }
  }

  private showPendingRange(col: number, row: number): void {
    const worldPos = this.grid.gridToWorld(col, row);
    if (this.pendingRangeCircle) {
      this.pendingRangeCircle.setPosition(worldPos.x, worldPos.y);
      this.pendingRangeCircle.setVisible(true);
    }
  }

  private cancelPendingBuild(): void {
    this.pendingBuildPos = null;
    if (this.pendingRangeCircle) {
      this.pendingRangeCircle.setVisible(false);
    }
    if (this.selectedTower) {
      this.selectedTower.showRange(false);
      this.selectedTower = null;
    }
  }

  private findEnemyAt(x: number, y: number): Enemy | null {
    const clickRadius = 20;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.isDead()) continue;
      const dist = Math.sqrt(
        (x - enemy.position.x) ** 2 + (y - enemy.position.y) ** 2
      );
      if (dist < clickRadius) {
        return enemy;
      }
    }
    return null;
  }

  private selectEnemy(enemy: Enemy): void {
    this.selectedEnemy = enemy;
    this.showTargetSight(enemy);
  }

  private deselectEnemy(): void {
    this.selectedEnemy = null;
    this.hideTargetSight();
  }

  private showTargetSight(enemy: Enemy): void {
    if (!this.targetSight) {
      this.targetSight = this.add.graphics();
      this.targetSight.setDepth(60);
    }
    this.targetSight.setVisible(true);
    this.drawTargetSight(enemy.position.x, enemy.position.y);
  }

  private drawTargetSight(x: number, y: number): void {
    if (!this.targetSight) return;
    this.targetSight.clear();
    const size = 14;
    const gap = 4;
    this.targetSight.lineStyle(2, 0xff0000, 0.9);
    // Top-left
    this.targetSight.lineBetween(x - size, y - size, x - gap, y - size);
    this.targetSight.lineBetween(x - size, y - size, x - size, y - gap);
    // Top-right
    this.targetSight.lineBetween(x + size, y - size, x + gap, y - size);
    this.targetSight.lineBetween(x + size, y - size, x + size, y - gap);
    // Bottom-left
    this.targetSight.lineBetween(x - size, y + size, x - gap, y + size);
    this.targetSight.lineBetween(x - size, y + size, x - size, y + gap);
    // Bottom-right
    this.targetSight.lineBetween(x + size, y + size, x + gap, y + size);
    this.targetSight.lineBetween(x + size, y + size, x + size, y + gap);
  }

  private hideTargetSight(): void {
    if (this.targetSight) {
      this.targetSight.setVisible(false);
    }
  }

  private onBuildTowerSelect(type: TowerType): void {
    if (!this.pendingBuildPos) return;
    const { col, row } = this.pendingBuildPos;
    this.placeTower(col, row, type);
    this.cancelPendingBuild();
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
    this.towerPanel.hide();
    this.hoverRangeCircle?.setVisible(false);
    this.cancelPendingBuild();
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

    const oldRange = this.selectedTower.range;
    const worldPos = this.selectedTower.getWorldPosition();
    this.selectedTower.upgrade();
    const newRange = this.selectedTower.range;

    // Hide tower's own range circle immediately
    this.selectedTower.showRange(false);

    eventBus.emit('tower-upgraded', { towerType: this.selectedTower.type, newLevel: this.selectedTower.level });
    this.towerPanel.hide();
    this.hud.setGold(this.economy.getGold());

    // Animate range growth
    this.animateRangeGrowth(worldPos, oldRange, newRange);
  }

  private animateRangeGrowth(worldPos: { x: number; y: number }, fromRadius: number, toRadius: number): void {
    const rangeCircle = this.add.circle(worldPos.x, worldPos.y, fromRadius, 0x4CAF50, 0);
    rangeCircle.setStrokeStyle(2, 0x4CAF50, 0.6);
    rangeCircle.setDepth(48);

    // Animate radius growth
    this.tweens.add({
      targets: rangeCircle,
      scaleX: toRadius / fromRadius,
      scaleY: toRadius / fromRadius,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        // Wait 2 seconds then destroy
        this.time.delayedCall(2000, () => {
          rangeCircle.destroy();
        });
      },
    });
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
        // Clear selection if this enemy was selected
        if (this.selectedEnemy === enemy) {
          this.deselectEnemy();
        }
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
    // Prioritize selected enemy if in range and alive
    if (this.selectedEnemy && this.selectedEnemy.alive && !this.selectedEnemy.isDead()) {
      const dist = tower.position.distanceTo(this.selectedEnemy.position);
      if (dist <= tower.range) {
        return { id: this.selectedEnemy.id, position: this.selectedEnemy.position, health: this.selectedEnemy.health };
      }
    }

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
    // Check if enemy is immune to this tower type
    if (primaryTarget.data.immuneTo && primaryTarget.data.immuneTo.includes(proj.getTowerType())) {
      // Show immune indicator
      this.createImmuneIndicator(primaryTarget.position.x, primaryTarget.position.y);
      return;
    }
   
    // Create blood splatter from projectile direction
    this.createBloodSplatter(proj.position, primaryTarget.position, primaryTarget.data.size, 0);

    const dmg = proj.damage;
    const killed = this.healthSystem.applyDamage(
      { id: primaryTarget.id, position: primaryTarget.position, health: primaryTarget.health },
      dmg.baseDamage,
    );
    if (killed) {this.onEnemyKilled(primaryTarget);
      this.createBloodSplatter(proj.position, primaryTarget.position, primaryTarget.data.size, 3);

    }
    if (dmg.slowFactor < 1.0) {
      primaryTarget.health.applySlow(dmg.slowFactor, dmg.slowDuration);
    }
    if (dmg.splashRadius > 0) {
      const nearbyEnemies = this.enemies
        .filter(e => e.alive && e !== primaryTarget && !(e.data.immuneTo && e.data.immuneTo.includes(proj.getTowerType())))
        .map(e => ({ id: e.id, position: e.position, health: e.health }));
      const splashKilled = this.healthSystem.applySplashDamage(
        primaryTarget.position.x, primaryTarget.position.y, dmg.splashRadius, dmg.baseDamage * 0.5, nearbyEnemies,
      );
      for (const k of splashKilled) this.onEnemyKilledById(k.id);
    }
  }

  private createBloodSplatter(fromPos: Position, toPos: Position, enemySize: number, bloodSize: number): void {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    console.log(dist);
    if (dist === 0) dist = 0.5;

    // Normalize direction (hit direction)
    const ndx = dx / dist;
    const ndy = dy / dist;

    // Number of particles
    const particleCount = 6 + (bloodSize * 4);
   

    for (let i = 0; i < particleCount; i++) {
      const size = (2 + bloodSize) + Math.random() * 3;
      const particle = this.add.circle(
        toPos.x,
        toPos.y,
        size,
        0xcc0000,
        1,
      );
      particle.setDepth(30);

      // Random spread around hit direction
      const angle = Math.atan2(ndy, ndx) + (Math.random() - 0.5) * 1.5;
      const speed = 40 + Math.random() * 80;
      const targetX = toPos.x + Math.cos(angle) * speed;
      const targetY = toPos.y + Math.sin(angle) * speed;

      // Main blood particles - fly outward then dry
      this.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        alpha: 0.6,
        duration: 300 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => {
          // Dry blood - turn dark red/brown
          if (particle && particle.active) {
            particle.setFillStyle(0x4a0000, 0.8);
            this.tweens.add({
              targets: particle,
              alpha: 0,
              scale: 0.5,
              duration: 3000,
              onComplete: () => {
                if (particle && particle.active) particle.destroy();
              },
            });  
          } 
        },
      });

      // Also spawn exit blood (opposite direction, fewer particles)
      if (i < 4) {
        const exitAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
        const exitSpeed = 20 + Math.random() * 40;
        const exitParticle = this.add.circle(
          toPos.x,
          toPos.y,
          (1 + bloodSize) + Math.random() * (2 + bloodSize),
          0xcc0000,
          1,
        );
        exitParticle.setDepth(30);

        this.tweens.add({
          targets: exitParticle,
          x: toPos.x + Math.cos(exitAngle) * exitSpeed,
          y: toPos.y + Math.sin(exitAngle) * exitSpeed,
          alpha: 0.4,
          duration: 250,
          ease: 'Power2',
          onComplete: () => {
            if (exitParticle && exitParticle.active) {
              exitParticle.setFillStyle(0x4a0000, 0.6);
              this.tweens.add({
                targets: exitParticle,
                alpha: 0,
                duration: 2000,
                onComplete: () => {
                  if (exitParticle && exitParticle.active) exitParticle.destroy();
                },
              });
            }
          },
        });
      }
    }
  }

  private createImmuneIndicator(x: number, y: number): void {
    const text = this.add.text(x, y - 20, 'IMMUNE', {
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy(),
    });
  }

  private onEnemyKilled(enemy: Enemy): void {
    // Clear selection if this enemy was selected
    if (this.selectedEnemy === enemy) {
      this.deselectEnemy();
    }
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
    this.waveIndicator.showCountdown(false);
    this.waveIndicator.setBonusText('');
    this.hud.setWave(this.waveManager.getWaveNumber(), this.waveManager.getTotalWaves());
  }

  private startWaveEarly(): void {
    if (this.isGameOver) return;
    const bonus = this.waveManager.startWaveEarly();
    if (bonus > 0) {
      this.economy.earn(bonus);
      this.hud.setGold(this.economy.getGold());
      this.startNextWave();
    }
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
    
    // Save progress on victory
    if (victory) {
      this.saveLevelProgress(this.currentLevelId);
    }
    
    this.scene.start('GameOverScene', { victory, score: this.score, wave: this.waveManager.getWaveNumber(), levelId: this.currentLevelId });
  }

  private saveLevelProgress(levelId: number): void {
    const saved = localStorage.getItem('towerDefense_progress');
    const data = saved ? JSON.parse(saved) : { unlocked: [1], completed: [] };
    
    if (!data.completed.includes(levelId)) {
      data.completed.push(levelId);
    }
    
    // Unlock neighbors
    const neighbors = this.getNeighbors(levelId);
    neighbors.forEach(id => {
      if (!data.unlocked.includes(id)) {
        data.unlocked.push(id);
      }
    });
    
    localStorage.setItem('towerDefense_progress', JSON.stringify(data));
  }

  private getNeighbors(levelId: number): number[] {
    const neighbors: number[] = [];
    if (levelId > 1) neighbors.push(levelId - 1);
    if (levelId < 5) neighbors.push(levelId + 1);
    if (levelId === 1) neighbors.push(3);
    if (levelId === 2) neighbors.push(4);
    if (levelId === 3) neighbors.push(1, 5);
    if (levelId === 4) neighbors.push(2, 5);
    if (levelId === 5) neighbors.push(3, 4);
    return [...new Set(neighbors)];
  }
}
