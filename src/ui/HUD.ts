import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';

/**
 * In-game HUD showing gold, lives, score, and wave info.
 */
export class HUD {
  private scene: Phaser.Scene;
  private goldText: Phaser.GameObjects.Text;
  private livesText: Phaser.GameObjects.Text;
  private waveText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private bg: Phaser.GameObjects.Rectangle;

  private gold: number = 0;
  private lives: number = 0;
  private score: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Background bar
    this.bg = scene.add.rectangle(512, 20, 1024, 40, 0x222244, 0.9);
    this.bg.setDepth(100);

    this.goldText = scene.add.text(20, 10, 'Gold: 0', {
      fontSize: '16px',
      color: '#FFD700',
      fontStyle: 'bold',
    });
    this.goldText.setDepth(101);

    this.livesText = scene.add.text(200, 10, 'Lives: 20', {
      fontSize: '16px',
      color: '#ff4444',
      fontStyle: 'bold',
    });
    this.livesText.setDepth(101);

    this.waveText = scene.add.text(400, 10, 'Wave: 0/0', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.waveText.setDepth(101);

    this.scoreText = scene.add.text(600, 10, 'Score: 0', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.scoreText.setDepth(101);

    // Listen for events
    eventBus.on('gold-changed', (p) => {
      this.gold = p.total;
      this.updateDisplay();
    });

    eventBus.on('lives-changed', (p) => {
      this.lives = p.total;
      this.updateDisplay();
    });
  }

  setGold(amount: number): void {
    this.gold = amount;
    this.updateDisplay();
  }

  setLives(amount: number): void {
    this.lives = amount;
    this.updateDisplay();
  }

  setScore(amount: number): void {
    this.score = amount;
    this.updateDisplay();
  }

  setWave(current: number, total: number): void {
    this.waveText.setText(`Wave: ${current}/${total}`);
  }

  private updateDisplay(): void {
    this.goldText.setText(`Gold: ${this.gold}`);
    this.livesText.setText(`Lives: ${this.lives}`);
    this.scoreText.setText(`Score: ${this.score}`);
  }

  destroy(): void {
    this.goldText.destroy();
    this.livesText.destroy();
    this.waveText.destroy();
    this.scoreText.destroy();
    this.bg.destroy();
  }
}
