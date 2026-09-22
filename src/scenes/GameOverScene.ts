import Phaser from 'phaser';
import { MAP_DEFINITIONS } from '../data/maps';

interface GameOverData {
  victory: boolean;
  score: number;
  wave: number;
  levelId?: number;
}

/**
 * Game over scene - shows win/lose screen with stats.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.cameras.main.setBackgroundColor(0x1a1a2e);

    const isVictory = data.victory;
    const titleColor = isVictory ? '#4CAF50' : '#e74c3c';
    const titleText = isVictory ? 'VICTORY!' : 'DEFEAT';
    const levelId = data.levelId || 1;

    // Title
    const title = this.add.text(width / 2, height / 3, titleText, {
      fontSize: '48px',
      color: titleColor,
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    // Stats
    const stats = this.add.text(width / 2, height / 3 + 70,
      `Score: ${data.score}\nWaves Survived: ${data.wave}`, {
      fontSize: '18px',
      color: '#cccccc',
      align: 'center',
    });
    stats.setOrigin(0.5);

    // Next Level button (only on victory)
    if (isVictory) {
      const nextLevelId = levelId + 1;
      const hasNextLevel = MAP_DEFINITIONS.some(m => m.id === nextLevelId);
      if (hasNextLevel) {
        this.createButton(width / 2, height / 2 + 60, 'NEXT LEVEL', () => {
          this.scene.start('GameScene', { levelId: nextLevelId });
        });
      }
    }

    // Play Again button
    this.createButton(width / 2, height / 2 + 120, 'PLAY AGAIN', () => {
      this.scene.start('GameScene', { levelId });
    });

    // Level Select button
    this.createButton(width / 2, height / 2 + 180, 'SELECT LEVEL', () => {
      this.scene.start('LevelSelectScene');
    });

    // Menu button
    this.createButton(width / 2, height / 2 + 240, 'MAIN MENU', () => {
      this.scene.start('MenuScene');
    });
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, 200, 45, 0x4CAF50);
    bg.setStrokeStyle(2, 0xffffff);

    const text = this.add.text(0, 0, label, {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => { bg.setFillStyle(0x5CBF60); bg.setScale(1.05); text.setScale(1.05); });
    bg.on('pointerout', () => { bg.setFillStyle(0x4CAF50); bg.setScale(1); text.setScale(1); });
  }
}
