import Phaser from 'phaser';

/**
 * Boot scene - loads all game assets.
 * Uses CC0 assets from Kenney.nl and OpenGameArt.org
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      fontSize: '20px',
      color: '#ffffff',
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x4CAF50, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Generate terrain tiles programmatically
    this.generateTerrainTiles();

    // Load animated enemy sprites (4 frames each, 128x128 per frame)
    this.load.spritesheet('enemy_monster', 'assets/images/enemies/monster_idle.png', {
      frameWidth: 128,
      frameHeight: 128,
    });

    this.load.spritesheet('enemy_skeleton', 'assets/images/enemies/skeleton_idle.png', {
      frameWidth: 128,
      frameHeight: 128,
    });

    // Load ant spritesheet (2 frames, 16x16 each)
    this.load.spritesheet('enemy_ant', 'assets/images/enemies/ant_red.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    // Load bat spritesheet (4 frames, 32x32 each)
    this.load.spritesheet('enemy_bat', 'assets/images/enemies/bat_walk.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    // Load monster spritesheet (4 frames, 32x32 each)
    this.load.spritesheet('enemy_monster', 'assets/images/enemies/monster_walk.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    // Load projectile sprites
    this.load.image('projectile_fire', 'assets/images/projectiles/fire.png');

    // Generate tower and projectile textures
    this.generateTextures();
  }

  create(): void {
    // Create monster animation
    this.anims.create({
      key: 'monster_idle',
      frames: this.anims.generateFrameNumbers('enemy_monster', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    // Create skeleton animation
    this.anims.create({
      key: 'skeleton_idle',
      frames: this.anims.generateFrameNumbers('enemy_skeleton', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    // Create ant animation
    this.anims.create({
      key: 'ant_walk',
      frames: this.anims.generateFrameNumbers('enemy_ant', { start: 0, end: 1 }),
      frameRate: 6,
      repeat: -1,
    });

    // Create bat animation
    this.anims.create({
      key: 'bat_fly',
      frames: this.anims.generateFrameNumbers('enemy_bat', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1,
    });

    // Create monster animation
    this.anims.create({
      key: 'monster_walk',
      frames: this.anims.generateFrameNumbers('enemy_monster', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    this.scene.start('MenuScene');
  }

  private generateTerrainTiles(): void {
    const s = 48;

    // Helper to draw grass texture
    const drawGrass = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#3a7c2e';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#4a8c3e';
      for (let i = 0; i < 15; i++) {
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 4);
      }
      ctx.fillStyle = '#2a6c1e';
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 2);
      }
    };

    // Helper to draw stone road
    const drawStoneRoad = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#6b6b6b';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(2, 2, 20, 20);
      ctx.fillRect(26, 2, 20, 20);
      ctx.fillRect(14, 26, 20, 20);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(0, 22, s, 2);
      ctx.fillRect(22, 0, 2, 22);
      ctx.fillRect(2, 24, 2, 24);
      ctx.fillRect(24, 24, 2, 24);
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(4, 4, 4, 2);
      ctx.fillRect(28, 4, 4, 2);
    };

    // Generate each tile as separate texture
    const tiles: { key: string; draw: (ctx: CanvasRenderingContext2D) => void }[] = [
      { key: 'tile_grass', draw: drawGrass },
      { key: 'tile_stone_v', draw: drawStoneRoad },
      { key: 'tile_stone_h', draw: (ctx) => {
        ctx.save();
        ctx.translate(s, 0);
        ctx.rotate(Math.PI / 2);
        drawStoneRoad(ctx);
        ctx.restore();
      }},
      { key: 'tile_stone_cross', draw: drawStoneRoad },
      { key: 'tile_trans_tl', draw: (ctx) => {
        drawGrass(ctx);
        ctx.fillStyle = '#6b6b6b';
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(s, s);
        ctx.lineTo(0, s);
        ctx.closePath();
        ctx.fill();
      }},
      { key: 'tile_trans_tr', draw: (ctx) => {
        drawGrass(ctx);
        ctx.fillStyle = '#6b6b6b';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(s, s);
        ctx.closePath();
        ctx.fill();
      }},
      { key: 'tile_trans_bl', draw: (ctx) => {
        drawGrass(ctx);
        ctx.fillStyle = '#6b6b6b';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s, 0);
        ctx.lineTo(s, s);
        ctx.closePath();
        ctx.fill();
      }},
      { key: 'tile_trans_br', draw: (ctx) => {
        drawGrass(ctx);
        ctx.fillStyle = '#6b6b6b';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.closePath();
        ctx.fill();
      }},
    ];

    for (const tile of tiles) {
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, s, s);
      tile.draw(ctx);
      this.textures.addCanvas(tile.key, canvas);
    }
  }

  private generateTextures(): void {
    // Arrow Tower - wooden tower with arrow slit
    this.createTowerTexture('tower_arrow', (ctx) => {
      // Base
      ctx.fillStyle = '#5D4E37';
      ctx.fillRect(8, 40, 48, 20);
      // Tower body
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(12, 16, 40, 32);
      // Battlements
      ctx.fillStyle = '#6B5B45';
      ctx.fillRect(12, 12, 8, 8);
      ctx.fillRect(28, 12, 8, 8);
      ctx.fillRect(44, 12, 8, 8);
      // Arrow slit
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(28, 24, 8, 16);
      // Window
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(20, 28, 6, 6);
      ctx.fillRect(38, 28, 6, 6);
    });

    // Cannon Tower - stone tower with cannon
    this.createTowerTexture('tower_cannon', (ctx) => {
      // Base
      ctx.fillStyle = '#4A3728';
      ctx.fillRect(6, 44, 52, 16);
      // Tower body
      ctx.fillStyle = '#7A6B52';
      ctx.fillRect(10, 20, 44, 30);
      // Battlements
      ctx.fillStyle = '#8B7B62';
      ctx.fillRect(10, 14, 10, 10);
      ctx.fillRect(27, 14, 10, 10);
      ctx.fillRect(44, 14, 10, 10);
      // Cannon barrel
      ctx.fillStyle = '#2C2C2C';
      ctx.fillRect(24, 8, 16, 14);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(28, 4, 8, 8);
      // Cannonball
      ctx.fillStyle = '#4A4A4A';
      ctx.beginPath();
      ctx.arc(32, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Frost Tower - crystal tower
    this.createTowerTexture('tower_frost', (ctx) => {
      // Base
      ctx.fillStyle = '#1a3a5c';
      ctx.fillRect(10, 48, 44, 12);
      // Tower body
      ctx.fillStyle = '#2196F3';
      ctx.fillRect(16, 24, 32, 28);
      // Crystal spire
      ctx.fillStyle = '#64B5F6';
      ctx.beginPath();
      ctx.moveTo(20, 24);
      ctx.lineTo(32, 4);
      ctx.lineTo(44, 24);
      ctx.closePath();
      ctx.fill();
      // Inner crystal
      ctx.fillStyle = '#E3F2FD';
      ctx.beginPath();
      ctx.moveTo(26, 20);
      ctx.lineTo(32, 10);
      ctx.lineTo(38, 20);
      ctx.closePath();
      ctx.fill();
      // Frost crystals
      ctx.fillStyle = '#B3E5FC';
      ctx.beginPath();
      ctx.arc(20, 18, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(44, 18, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Arrow projectile
    this.createProjectileTexture('projectile_arrow', (ctx) => {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(2, 5, 8, 2);
      ctx.fillStyle = '#A0A0A0';
      ctx.beginPath();
      ctx.moveTo(10, 3);
      ctx.lineTo(12, 6);
      ctx.lineTo(10, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.lineTo(2, 6);
      ctx.lineTo(0, 9);
      ctx.closePath();
      ctx.fill();
    });

    // Cannonball
    this.createProjectileTexture('projectile_cannon', (ctx) => {
      ctx.fillStyle = '#2C2C2C';
      ctx.beginPath();
      ctx.arc(6, 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4A4A4A';
      ctx.beginPath();
      ctx.arc(4, 4, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Frost shard
    this.createProjectileTexture('projectile_frost', (ctx) => {
      ctx.fillStyle = '#64B5F6';
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(10, 4);
      ctx.lineTo(8, 8);
      ctx.lineTo(4, 8);
      ctx.lineTo(2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#E3F2FD';
      ctx.beginPath();
      ctx.arc(6, 5, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private createTowerTexture(key: string, drawFunc: (ctx: CanvasRenderingContext2D) => void): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);
    drawFunc(ctx);
    this.textures.addCanvas(key, canvas);
  }

  private createProjectileTexture(key: string, drawFunc: (ctx: CanvasRenderingContext2D) => void): void {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 12, 12);
    drawFunc(ctx);
    this.textures.addCanvas(key, canvas);
  }
}
