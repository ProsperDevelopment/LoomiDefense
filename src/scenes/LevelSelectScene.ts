import Phaser from 'phaser';
import { MAP_DEFINITIONS } from '../data/maps';
import { DEV_MODE } from '../config/constants';

export class LevelSelectScene extends Phaser.Scene {
  private unlockedLevels: Set<number> = new Set();
  private completedLevels: Set<number> = new Set();
  private hexNodes: { id: number; graphics: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; status: Phaser.GameObjects.Text; x: number; y: number }[] = [];

  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.cameras.main.setBackgroundColor(0x0a0a1a);
    this.loadProgress();

    // Title
    this.add.text(width / 2, 40, 'SELECT LEVEL', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Dev mode indicator
    if (DEV_MODE) {
      this.add.text(width / 2, 68, 'DEV MODE', {
        fontSize: '12px', color: '#FFD700',
      }).setOrigin(0.5);
    }

    // Create hexagonal grid
    this.createHexGrid();

    // Back button
    const backBtn = this.add.text(50, height - 40, 'BACK', {
      fontSize: '14px', color: '#ffffff', backgroundColor: '#333355',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5);
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('MenuScene'));
    backBtn.on('pointerover', () => backBtn.setBackgroundColor('#444466'));
    backBtn.on('pointerout', () => backBtn.setBackgroundColor('#333355'));

    // Legend
    this.add.text(width / 2, height - 40, '🔵 Unlocked  🟢 Completed  ⬛ Locked', {
      fontSize: '12px', color: '#666666',
    }).setOrigin(0.5);
  }

  private createHexGrid(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const hexSize = 32;
    const hexWidth = hexSize * 2;
    const hexHeight = hexSize * Math.sqrt(3);

    // Sort levels: dev demo first, then by id
    const sortedMaps = [...MAP_DEFINITIONS].sort((a, b) => {
      if (a.id === 0) return -1;
      if (b.id === 0) return 1;
      return a.id - b.id;
    });

    const levelCount = sortedMaps.length;
    const cols = Math.ceil(Math.sqrt(levelCount * 1.5));
    const rows = Math.ceil(levelCount / cols);

    const startX = width / 2 - (cols * hexWidth * 0.75) / 2;
    const startY = 100;

    let levelIndex = 0;

    for (let row = 0; row < rows && levelIndex < levelCount; row++) {
      for (let col = 0; col < cols && levelIndex < levelCount; col++) {
        const map = sortedMaps[levelIndex];
        const offsetX = row % 2 === 1 ? hexWidth * 0.75 : 0;
        const x = startX + col * hexWidth * 0.75 + offsetX;
        const y = startY + row * hexHeight * 0.55;

        const unlocked = this.unlockedLevels.has(map.id);
        const completed = this.completedLevels.has(map.id);

        this.createHexNode(x, y, hexSize, map.id, map.name, unlocked, completed);
        levelIndex++;
      }
    }
  }

  private createHexNode(x: number, y: number, size: number, levelId: number, name: string, unlocked: boolean, completed: boolean): void {
    const graphics = this.add.graphics();
    const label = this.add.text(x, y - 4, `${levelId}`, {
      fontSize: '14px', color: unlocked ? '#ffffff' : '#666666', fontStyle: 'bold',
    }).setOrigin(0.5);

    const statusText = completed ? '✓' : (unlocked ? '' : '🔒');
    const status = this.add.text(x, y + 12, statusText, {
      fontSize: '10px', color: unlocked ? '#ffffff' : '#555555',
    }).setOrigin(0.5);

    // Draw hexagon
    const fillColor = completed ? 0x2ecc71 : (unlocked ? 0x3498db : 0x333333);
    const lineColor = completed ? 0x27ae60 : (unlocked ? 0x2980b9 : 0x222222);

    graphics.fillStyle(fillColor, 0.9);
    graphics.lineStyle(2, lineColor, 1);
    graphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + size * Math.cos(angle);
      const hy = y + size * Math.sin(angle);
      if (i === 0) graphics.moveTo(hx, hy);
      else graphics.lineTo(hx, hy);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    this.hexNodes.push({ id: levelId, graphics, label, status, x, y });

    // Make clickable if unlocked
    if (unlocked) {
      const hitZone = this.add.zone(x, y, size * 2, size * 2);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => this.scene.start('GameScene', { levelId }));
      hitZone.on('pointerover', () => {
        graphics.clear();
        graphics.fillStyle(completed ? 0x27ae60 : 0x2980b9, 1);
        graphics.lineStyle(3, 0xffffff, 1);
        this.drawHex(graphics, x, y, size);
      });
      hitZone.on('pointerout', () => {
        graphics.clear();
        graphics.fillStyle(fillColor, 0.9);
        graphics.lineStyle(2, lineColor, 1);
        this.drawHex(graphics, x, y, size);
      });
    }
  }

  private drawHex(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    graphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + size * Math.cos(angle);
      const hy = y + size * Math.sin(angle);
      if (i === 0) graphics.moveTo(hx, hy);
      else graphics.lineTo(hx, hy);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  private loadProgress(): void {
    if (DEV_MODE) {
      // Dev mode: unlock all levels
      this.unlockedLevels = new Set(MAP_DEFINITIONS.map(m => m.id));
      this.completedLevels = new Set();
      return;
    }

    const saved = localStorage.getItem('towerDefense_progress');
    if (saved) {
      const data = JSON.parse(saved);
      this.unlockedLevels = new Set(data.unlocked || [1]);
      this.completedLevels = new Set(data.completed || []);
    } else {
      this.unlockedLevels = new Set([1]);
      this.completedLevels = new Set();
    }
  }
}
