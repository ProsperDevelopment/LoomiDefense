import Phaser from 'phaser';
import type { TowerType } from '../types';
import { TOWER_LIST, TOWER_UPGRADES, TOWER_DEFINITIONS } from '../data/towers';

export interface TowerPanelCallbacks {
  onTowerSelect: (type: TowerType | null) => void;
  onSellTower: () => void;
  onUpgradeTower: () => void;
  canAfford: (cost: number) => boolean;
  onCancel: () => void;
}

/**
 * Compact popup tower panel that appears at cursor position.
 */
export class TowerPanel {
  private scene: Phaser.Scene;
  private callbacks: TowerPanelCallbacks;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;

  constructor(scene: Phaser.Scene, callbacks: TowerPanelCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(200);
    this.container.setVisible(false);
  }

  showAtCursor(pointerX: number, pointerY: number, mode: 'build' | 'tower', towerData?: { type: TowerType; level: number; sellValue: number }): void {
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Keep popup within screen bounds
    let x = pointerX + 20;
    let y = pointerY - 50;
    if (x + 180 > width) x = pointerX - 200;
    if (y < 10) y = 10;
    if (y + 200 > height) y = height - 200;

    if (mode === 'build') {
      this.createBuildMenu(x, y);
    } else if (mode === 'tower' && towerData) {
      this.createTowerInfoMenu(x, y, towerData);
    }

    this.container.setVisible(true);
    this.visible = true;
  }

  hide(): void {
    this.container.setVisible(false);
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  private createBuildMenu(x: number, y: number): void {
    // Background
    const bg = this.scene.add.rectangle(0, 0, 180, 180, 0x1a1a3a, 0.95);
    bg.setStrokeStyle(2, 0x4a4a6a);
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(0, -75, 'BUILD TOWER', {
      fontSize: '11px', color: '#aaaaaa', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(title);

    // Tower buttons
    TOWER_LIST.forEach((tower, i) => {
      const btnY = -45 + i * 38;
      const canAfford = this.callbacks.canAfford(tower.cost);

      const btnBg = this.scene.add.rectangle(0, btnY, 160, 32, canAfford ? 0x2a2a4a : 0x1a1a2a);
      btnBg.setStrokeStyle(1, canAfford ? 0x4a4a6a : 0x333344);

      const icon = this.scene.add.rectangle(-60, btnY, 16, 16,
        Phaser.Display.Color.HexStringToColor(tower.color).color);

      const name = this.scene.add.text(-45, btnY - 6, tower.name, {
        fontSize: '10px', color: canAfford ? '#ffffff' : '#666666',
      });

      const cost = this.scene.add.text(-45, btnY + 6, `${tower.cost}g`, {
        fontSize: '9px', color: canAfford ? '#FFD700' : '#666644',
      });

      this.container.add([btnBg, icon, name, cost]);

      if (canAfford) {
        btnBg.setInteractive({ useHandCursor: true });
        btnBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          (this.scene as any).popupClickHandled = true;
          this.callbacks.onTowerSelect(tower.type);
          this.hide();
        });
        btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a3a5a));
        btnBg.on('pointerout', () => btnBg.setFillStyle(0x2a2a4a));
      }
    });

    // Cancel button
    const cancelBg = this.scene.add.rectangle(0, 70, 160, 28, 0x8B0000);
    cancelBg.setStrokeStyle(1, 0xffffff);
    const cancelText = this.scene.add.text(0, 70, 'CANCEL', {
      fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add([cancelBg, cancelText]);

    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      (this.scene as any).popupClickHandled = true;
      this.callbacks.onCancel();
      this.hide();
    });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0xAA0000));
    cancelBg.on('pointerout', () => cancelBg.setFillStyle(0x8B0000));

    // Position container
    this.container.setPosition(x + 90, y + 90);
  }

  private createTowerInfoMenu(x: number, y: number, data: { type: TowerType; level: number; sellValue: number }): void {
    const towerDef = TOWER_DEFINITIONS[data.type];
    const upgradeData = TOWER_UPGRADES[data.level];
    const canUpgrade = data.level < 3;
    const upgradeCost = canUpgrade ? Math.floor(towerDef.cost * upgradeData.costMultiplier) : 0;

    // Background
    const bg = this.scene.add.rectangle(0, 0, 180, 160, 0x1a1a3a, 0.95);
    bg.setStrokeStyle(2, 0x4a4a6a);
    this.container.add(bg);

    // Tower name and level
    const title = this.scene.add.text(0, -65, `${towerDef.name} Lv.${data.level}`, {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(title);

    // Stats
    const stats = this.scene.add.text(0, -42, `DMG: ${towerDef.damage} | RNG: ${towerDef.range}`, {
      fontSize: '9px', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.container.add(stats);

    // Sell button
    const sellBg = this.scene.add.rectangle(0, -15, 140, 28, 0x8B0000);
    sellBg.setStrokeStyle(1, 0xffffff);
    const sellText = this.scene.add.text(0, -15, `SELL (+${data.sellValue}g)`, {
      fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add([sellBg, sellText]);

    sellBg.setInteractive({ useHandCursor: true });
    sellBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      (this.scene as any).popupClickHandled = true;
      this.callbacks.onSellTower();
      this.hide();
    });
    sellBg.on('pointerover', () => sellBg.setFillStyle(0xAA0000));
    sellBg.on('pointerout', () => sellBg.setFillStyle(0x8B0000));

    // Upgrade button
    if (canUpgrade) {
      const upgradeBg = this.scene.add.rectangle(0, 20, 140, 28, 0x2E7D32);
      upgradeBg.setStrokeStyle(1, 0xffffff);
      const upgradeText = this.scene.add.text(0, 20, `UPGRADE (${upgradeCost}g)`, {
        fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.container.add([upgradeBg, upgradeText]);

      upgradeBg.setInteractive({ useHandCursor: true });
      upgradeBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        (this.scene as any).popupClickHandled = true;
        this.callbacks.onUpgradeTower();
        this.hide();
      });
      upgradeBg.on('pointerover', () => upgradeBg.setFillStyle(0x43A047));
      upgradeBg.on('pointerout', () => upgradeBg.setFillStyle(0x2E7D32));
    } else {
      const maxText = this.scene.add.text(0, 20, 'MAX LEVEL', {
        fontSize: '10px', color: '#FFD700', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.container.add(maxText);
    }

    // Cancel button
    const cancelBg = this.scene.add.rectangle(0, 55, 140, 28, 0x555555);
    cancelBg.setStrokeStyle(1, 0xffffff);
    const cancelText = this.scene.add.text(0, 55, 'CLOSE', {
      fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add([cancelBg, cancelText]);

    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      (this.scene as any).popupClickHandled = true;
      this.hide();
    });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0x666666));
    cancelBg.on('pointerout', () => cancelBg.setFillStyle(0x555555));

    // Position container
    this.container.setPosition(x + 90, y + 80);
  }

  // Legacy methods - no-ops for compatibility
  selectTower(_type: TowerType | null): void {}
  getSelectedTower(): TowerType | null { return null; }
  showTowerInfo(_towerType: TowerType, _level: number, _sellValue: number): void {}
  hideTowerInfo(): void {}

  destroy(): void {
    this.container.destroy();
  }
}
