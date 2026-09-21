import Phaser from 'phaser';

/**
 * Wave indicator showing current wave progress and start button.
 */
export class WaveIndicator {
  private scene: Phaser.Scene;
  private waveText: Phaser.GameObjects.Text;
  private startButton: Phaser.GameObjects.Container;
  private progressText: Phaser.GameObjects.Text;
  private bg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, onStartWave: () => void) {
    this.scene = scene;

    const panelX = 860;
    const panelY = 100;

    // Background
    this.bg = scene.add.rectangle(panelX, panelY + 40, 160, 100, 0x222244, 0.9);
    this.bg.setDepth(100);

    // Wave number
    this.waveText = scene.add.text(panelX, panelY, 'Wave: 0/0', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.waveText.setDepth(101);

    // Progress
    this.progressText = scene.add.text(panelX, panelY + 25, '', {
      fontSize: '12px',
      color: '#cccccc',
    }).setOrigin(0.5);
    this.progressText.setDepth(101);

    // Start button
    this.startButton = this.scene.add.container(panelX, panelY + 65);
    this.startButton.setDepth(101);

    const btnBg = this.scene.add.rectangle(0, 0, 120, 35, 0x4CAF50);
    btnBg.setStrokeStyle(2, 0xffffff);

    const btnText = this.scene.add.text(0, 0, 'START WAVE', {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.startButton.add([btnBg, btnText]);

    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', onStartWave);
    btnBg.on('pointerover', () => btnBg.setFillStyle(0x5CBF60));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x4CAF50));
  }

  setWave(current: number, total: number): void {
    this.waveText.setText(`Wave: ${current}/${total}`);
  }

  setProgress(spawned: number, total: number): void {
    if (total > 0) {
      this.progressText.setText(`${spawned}/${total} spawned`);
    } else {
      this.progressText.setText('');
    }
  }

  showStartButton(visible: boolean): void {
    this.startButton.setVisible(visible);
  }

  destroy(): void {
    this.waveText.destroy();
    this.progressText.destroy();
    this.startButton.destroy();
    this.bg.destroy();
  }
}
