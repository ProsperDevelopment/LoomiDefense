import Phaser from 'phaser';

/**
 * Wave indicator showing current wave progress, auto-start countdown, and early start bonus.
 */
export class WaveIndicator {
  private scene: Phaser.Scene;
  private waveText: Phaser.GameObjects.Text;
  private startButton: Phaser.GameObjects.Container;
  private progressText: Phaser.GameObjects.Text;
  private countdownText: Phaser.GameObjects.Text;
  private bonusText: Phaser.GameObjects.Text;
  private bg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, onStartWave: () => void, onStartEarly: () => void) {
    this.scene = scene;

    const panelX = 860;
    const panelY = 100;

    // Background
    this.bg = scene.add.rectangle(panelX, panelY + 50, 160, 120, 0x222244, 0.9);
    this.bg.setDepth(100);

    // Wave number
    this.waveText = scene.add.text(panelX, panelY, 'Wave: 0/0', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.waveText.setDepth(101);

    // Progress
    this.progressText = scene.add.text(panelX, panelY + 22, '', {
      fontSize: '12px',
      color: '#cccccc',
    }).setOrigin(0.5);
    this.progressText.setDepth(101);

    // Countdown text (for auto-start)
    this.countdownText = scene.add.text(panelX, panelY + 42, '', {
      fontSize: '12px',
      color: '#FFD700',
    }).setOrigin(0.5);
    this.countdownText.setDepth(101);

    // Bonus text
    this.bonusText = scene.add.text(panelX, panelY + 58, '', {
      fontSize: '10px',
      color: '#4CAF50',
    }).setOrigin(0.5);
    this.bonusText.setDepth(101);

    // Start button container
    this.startButton = this.scene.add.container(panelX, panelY + 82);
    this.startButton.setDepth(101);

    // Early start button (with bonus)
    const earlyBtnBg = this.scene.add.rectangle(0, 0, 130, 30, 0xFF9800);
    earlyBtnBg.setStrokeStyle(2, 0xffffff);

    const earlyBtnText = this.scene.add.text(0, 0, 'EARLY (+25g)', {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.startButton.add([earlyBtnBg, earlyBtnText]);

    earlyBtnBg.setInteractive({ useHandCursor: true });
    earlyBtnBg.on('pointerdown', onStartEarly);
    earlyBtnBg.on('pointerover', () => earlyBtnBg.setFillStyle(0xFFB74D));
    earlyBtnBg.on('pointerout', () => earlyBtnBg.setFillStyle(0xFF9800));
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

  setCountdown(seconds: number): void {
    this.countdownText.setText(`Auto-start: ${seconds}s`);
  }

  setBonusText(text: string): void {
    this.bonusText.setText(text);
  }

  showStartButton(visible: boolean): void {
    this.startButton.setVisible(visible);
  }

  showCountdown(visible: boolean): void {
    this.countdownText.setVisible(visible);
  }

  destroy(): void {
    this.waveText.destroy();
    this.progressText.destroy();
    this.countdownText.destroy();
    this.bonusText.destroy();
    this.startButton.destroy();
    this.bg.destroy();
  }
}
