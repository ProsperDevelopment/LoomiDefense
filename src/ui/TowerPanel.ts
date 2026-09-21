import Phaser from 'phaser';
import type { TowerType } from '../types';
import { TOWER_LIST, TOWER_UPGRADES, TOWER_DEFINITIONS } from '../data/towers';
import { CELL_SIZE } from '../config/constants';

export interface TowerPanelCallbacks {
  onTowerSelect: (type: TowerType | null) => void;
  onSellTower: () => void;
  onUpgradeTower: () => void;
}

/**
 * Tower selection panel at the bottom of the screen.
 * Shows available towers and their costs.
 */
export class TowerPanel {
  private scene: Phaser.Scene;
  private selectedTower: TowerType | null = null;
  private buttons: Phaser.GameObjects.Container[] = [];
  private selectedIndicator: Phaser.GameObjects.Rectangle | null = null;
  private bg: Phaser.GameObjects.Rectangle;
  private callbacks: TowerPanelCallbacks;

  // Info display
  private infoText: Phaser.GameObjects.Text;
  private sellButton: Phaser.GameObjects.Container | null = null;
  private upgradeButton: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, callbacks: TowerPanelCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    const panelY = 580;

    // Background
    this.bg = scene.add.rectangle(512, panelY + 60, 1024, 140, 0x222244, 0.95);
    this.bg.setDepth(100);

    // Tower buttons
    const startX = 100;
    const spacing = 180;

    TOWER_LIST.forEach((towerData, i) => {
      const x = startX + i * spacing;
      const container = this.createTowerButton(x, panelY + 40, towerData);
      this.buttons.push(container);
    });

    // Info text
    this.infoText = scene.add.text(100, panelY + 90, 'Select a tower to place', {
      fontSize: '14px',
      color: '#cccccc',
      wordWrap: { width: 400 },
    });
    this.infoText.setDepth(101);

    // Sell button (hidden by default)
    this.sellButton = this.createActionButton(700, panelY + 30, 'SELL', 0xe74c3c, () => {
      this.callbacks.onSellTower();
    });
    this.sellButton?.setVisible(false);

    // Upgrade button (hidden by default)
    this.upgradeButton = this.createActionButton(700, panelY + 70, 'UPGRADE', 0x4CAF50, () => {
      this.callbacks.onUpgradeTower();
    });
    this.upgradeButton?.setVisible(false);
  }

  private createTowerButton(
    x: number,
    y: number,
    data: { type: TowerType; name: string; cost: number; color: string; description: string },
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setDepth(101);

    // Button background
    const bg = this.scene.add.rectangle(0, 0, 140, 60, 0x333355);
    bg.setStrokeStyle(2, 0x555577);

    // Color indicator
    const colorRect = this.scene.add.rectangle(-50, 0, 20, 20,
      Phaser.Display.Color.HexStringToColor(data.color).color);

    // Name
    const nameText = this.scene.add.text(-30, -12, data.name, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    });

    // Cost
    const costText = this.scene.add.text(-30, 6, `${data.cost}g`, {
      fontSize: '11px',
      color: '#FFD700',
    });

    container.add([bg, colorRect, nameText, costText]);

    // Interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.selectTower(data.type);
    });
    bg.on('pointerover', () => {
      bg.setFillStyle(0x444466);
      this.infoText.setText(`${data.name}: ${data.description}\nCost: ${data.cost}g`);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x333355);
    });

    return container;
  }

  private createActionButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setDepth(101);

    const bg = this.scene.add.rectangle(0, 0, 100, 30, color);
    bg.setStrokeStyle(1, 0xffffff);

    const text = this.scene.add.text(0, 0, label, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setFillStyle(color + 0x222222));
    bg.on('pointerout', () => bg.setFillStyle(color));

    return container;
  }

  selectTower(type: TowerType | null): void {
    this.selectedTower = type;
    this.callbacks.onTowerSelect(type);

    // Update visual selection
    this.buttons.forEach((btn, i) => {
      const bg = btn.getAt(0) as Phaser.GameObjects.Rectangle;
      if (TOWER_LIST[i].type === type) {
        bg.setStrokeStyle(3, 0xFFD700);
      } else {
        bg.setStrokeStyle(2, 0x555577);
      }
    });
  }

  getSelectedTower(): TowerType | null {
    return this.selectedTower;
  }

  showTowerInfo(towerType: TowerType, level: number, sellValue: number): void {
    const upgradeData = TOWER_UPGRADES[level];
    let info = `Selected: ${towerType.toUpperCase()} (Lv.${level}) | Sell: ${sellValue}g`;
    if (upgradeData && level < 3) {
      const upgradeCost = Math.floor(TOWER_DEFINITIONS[towerType].cost * upgradeData.costMultiplier);
      info += `\nUpgrade: ${upgradeCost}g | +${Math.round((upgradeData.damageMultiplier - 1) * 100)}% dmg | +${Math.round((upgradeData.rangeMultiplier - 1) * 100)}% range`;
    } else if (level >= 3) {
      info += '\nMAX LEVEL';
    }
    this.infoText.setText(info);
    this.sellButton?.setVisible(true);
    this.upgradeButton?.setVisible(level < 3);
  }

  hideTowerInfo(): void {
    this.infoText.setText('Select a tower to place');
    this.sellButton?.setVisible(false);
    this.upgradeButton?.setVisible(false);
  }

  destroy(): void {
    this.buttons.forEach(btn => btn.destroy());
    this.sellButton?.destroy();
    this.upgradeButton?.destroy();
    this.bg.destroy();
    this.infoText.destroy();
  }
}
