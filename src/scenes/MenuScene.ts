import Phaser from 'phaser';

/**
 * Main menu scene.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.cameras.main.setBackgroundColor(0x1a1a2e);

    // Title
    const title = this.add.text(width / 2, height / 3, 'TOWER DEFENSE', {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(width / 2, height / 3 + 60, 'Defend the base!', {
      fontSize: '18px',
      color: '#888888',
    });
    subtitle.setOrigin(0.5);

    // Play button
    this.createButton(width / 2, height / 2 + 40, 'PLAY', () => {
      this.scene.start('GameScene');
    });

    // Instructions
    const instructions = this.add.text(width / 2, height * 0.75,
      'Click grid cells to place towers\nDefeat all waves to win', {
      fontSize: '14px',
      color: '#666666',
      align: 'center',
    });
    instructions.setOrigin(0.5);

    // Version
    const version = this.add.text(width - 10, height - 10, 'v1.0.0', {
      fontSize: '11px',
      color: '#444444',
    });
    version.setOrigin(1, 1);
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, 200, 50, 0x4CAF50);
    bg.setStrokeStyle(2, 0xffffff);

    const text = this.add.text(0, 0, label, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => {
      bg.setFillStyle(0x5CBF60);
      bg.setScale(1.05);
      text.setScale(1.05);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x4CAF50);
      bg.setScale(1);
      text.setScale(1);
    });
  }
}
