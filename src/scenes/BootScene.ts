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

    // Background tiles are loaded on demand per level (only the tiles the
    // level actually uses) — see GameScene.drawBackgroundTiles.

    // Sound effects (Ninja Adventure pack, CC0)
    this.load.audio('sfx_slash', 'assets/audio/Slash.wav');      // arrow shot
    this.load.audio('sfx_slash2', 'assets/audio/Slash2.wav');    // sniper shot
    this.load.audio('sfx_impact', 'assets/audio/Impact.wav');    // cannon shot / base hit
    this.load.audio('sfx_magic', 'assets/audio/Magic1.wav');     // frost shot
    this.load.audio('sfx_fireball', 'assets/audio/Fireball.wav');// mortar shot
    this.load.audio('sfx_fx', 'assets/audio/Fx.wav');            // tesla shot
    this.load.audio('sfx_hit1', 'assets/audio/Hit1.wav');        // enemy death
    this.load.audio('sfx_hit5', 'assets/audio/Hit5.wav');        // enemy death
    this.load.audio('sfx_hit9', 'assets/audio/Hit9.wav');        // enemy death
    this.load.audio('sfx_build', 'assets/audio/PowerUp1.wav');   // tower placed
    this.load.audio('sfx_upgrade', 'assets/audio/PowerUp2.wav'); // tower upgraded
    this.load.audio('sfx_coin', 'assets/audio/Coin.wav');        // tower sold
    this.load.audio('sfx_wave', 'assets/audio/Bonus.wav');       // wave started
    this.load.audio('sfx_success', 'assets/audio/Success1.wav'); // victory jingle
    this.load.audio('sfx_gameover', 'assets/audio/GameOver.wav');// defeat jingle

    // Load Ninja Adventure tower tileset (768x192 after 200% resize, 12 columns x 3 rows, 64x64 tiles)
    // Each tower has 3 consecutive frames: normal, damaged1, damaged2
    this.load.spritesheet('towers_tileset', 'assets/images/towers/towers_tileset.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    // Load Ninja Adventure monster sprites (128x128 after 200% resize, 4 columns x 4 rows)
    this.load.spritesheet('enemy_slime', 'assets/images/enemies/slime.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('enemy_bear', 'assets/images/enemies/bear.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('enemy_dragon', 'assets/images/enemies/dragon.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('enemy_spider', 'assets/images/enemies/spider.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('enemy_beast', 'assets/images/enemies/beast.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('enemy_cyclops', 'assets/images/enemies/cyclops.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('enemy_snake', 'assets/images/enemies/snake.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    // Load projectile sprites
    this.load.image('projectile_fire', 'assets/images/projectiles/fire.png');

    // Generate tower and projectile textures
    this.generateTextures();
  }

  create(): void {
    // Sprite sheets are 128x128 with 4 columns x 4 rows (32x32 frames)
    // Columns = directions, Rows = animation frames
    // Column 0 (frames 0, 4, 8, 12) = Down
    // Column 1 (frames 1, 5, 9, 13) = Up
    // Column 2 (frames 2, 6, 10, 14) = Left
    // Column 3 (frames 3, 7, 11, 15) = Right

    const monsters = ['slime', 'bear', 'dragon', 'spider', 'beast', 'cyclops', 'snake'];

    for (const name of monsters) {
      // Down (column 0): frames 0, 4, 8, 12
      this.anims.create({
        key: `${name}_walk`,
        frames: [
          { key: `enemy_${name}`, frame: 0 },
          { key: `enemy_${name}`, frame: 4 },
          { key: `enemy_${name}`, frame: 8 },
          { key: `enemy_${name}`, frame: 12 },
        ],
        frameRate: 8,
        repeat: -1,
      });

      // Up (column 1): frames 1, 5, 9, 13
      this.anims.create({
        key: `${name}_up`,
        frames: [
          { key: `enemy_${name}`, frame: 1 },
          { key: `enemy_${name}`, frame: 5 },
          { key: `enemy_${name}`, frame: 9 },
          { key: `enemy_${name}`, frame: 13 },
        ],
        frameRate: 8,
        repeat: -1,
      });

      // Left (column 2): frames 2, 6, 10, 14
      this.anims.create({
        key: `${name}_left`,
        frames: [
          { key: `enemy_${name}`, frame: 2 },
          { key: `enemy_${name}`, frame: 6 },
          { key: `enemy_${name}`, frame: 10 },
          { key: `enemy_${name}`, frame: 14 },
        ],
        frameRate: 8,
        repeat: -1,
      });

      // Right (column 3): frames 3, 7, 11, 15
      this.anims.create({
        key: `${name}_right`,
        frames: [
          { key: `enemy_${name}`, frame: 3 },
          { key: `enemy_${name}`, frame: 7 },
          { key: `enemy_${name}`, frame: 11 },
          { key: `enemy_${name}`, frame: 15 },
        ],
        frameRate: 8,
        repeat: -1,
      });
    }

    // Check for URL level parameter
    const startLevel = (window as any).__START_LEVEL;
    if (startLevel !== null && !isNaN(startLevel)) {
      this.scene.start('GameScene', { levelId: startLevel });
    } else {
      this.scene.start('MenuScene');
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

    // Sniper round - long thin bullet
    this.createProjectileTexture('projectile_sniper', (ctx) => {
      ctx.fillStyle = '#8BC34A';
      ctx.fillRect(0, 5, 9, 2);
      ctx.fillStyle = '#33691E';
      ctx.beginPath();
      ctx.moveTo(9, 4);
      ctx.lineTo(12, 6);
      ctx.lineTo(9, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#558B2F';
      ctx.fillRect(0, 4, 2, 4);
    });

    // Mortar shell - round with fins
    this.createProjectileTexture('projectile_mortar', (ctx) => {
      ctx.fillStyle = '#37474F';
      ctx.beginPath();
      ctx.arc(6, 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FF9800';
      ctx.beginPath();
      ctx.arc(6, 6, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#263238';
      ctx.fillRect(1, 2, 3, 2);
      ctx.fillRect(8, 2, 3, 2);
      ctx.fillRect(1, 8, 3, 2);
      ctx.fillRect(8, 8, 3, 2);
    });

    // Tesla bolt - zigzag spark
    this.createProjectileTexture('projectile_tesla', (ctx) => {
      ctx.strokeStyle = '#00BCD4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(1, 1);
      ctx.lineTo(6, 4);
      ctx.lineTo(3, 6);
      ctx.lineTo(9, 8);
      ctx.stroke();
      ctx.fillStyle = '#E0F7FA';
      ctx.beginPath();
      ctx.arc(9, 8, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#84FFFF';
      ctx.beginPath();
      ctx.arc(2, 3, 1.5, 0, Math.PI * 2);
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
