import Phaser from 'phaser';
import type { TowerType, TargetMode } from '../types';
import { TOWER_LIST, TOWER_UPGRADES, TOWER_DEFINITIONS, MAX_TOWER_LEVEL } from '../data/towers';
import { TOWER_SPRITE_FRAMES } from '../entities/Tower';

export interface TowerPanelCallbacks {
  onTowerSelect: (type: TowerType | null) => void;
  onSellTower: () => void;
  onUpgradeTower: () => void;
  canAfford: (cost: number) => boolean;
  /** True when this player already hit the build cap for the type. */
  maxedOut?: (type: TowerType) => boolean;
  /** Cycle the selected tower's targeting mode. */
  onAimChange?: (mode: TargetMode) => void;
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
  private availableTypes: TowerType[] | null = null;

  constructor(scene: Phaser.Scene, callbacks: TowerPanelCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(200);
    this.container.setVisible(false);
  }

  /** Restrict the build menu to a loadout (null = all towers). */
  setAvailableTypes(types: TowerType[] | null): void {
    this.availableTypes = types;
  }

  private get buildableTowers() {
    const list = TOWER_LIST;
    if (!this.availableTypes) return list;
    return list.filter((t) => this.availableTypes!.includes(t.type));
  }

  showAtCursor(pointerX: number, pointerY: number, mode: 'build' | 'tower', towerData?: { type: TowerType; level: number; sellValue: number; aim: TargetMode }): void {
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
    const towers = this.buildableTowers;
    const btnSize = 56;
    const padding = 8;
    const totalWidth = towers.length * (btnSize + padding) + padding;
    const totalHeight = btnSize + padding * 2 + 40; // tower buttons + cancel button

    // Background
    const bg = this.scene.add.rectangle(0, 0, totalWidth + padding * 2, totalHeight, 0x1a1a3a, 0.95);
    bg.setStrokeStyle(2, 0x4a4a6a);
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(0, -totalHeight / 2 + 12, 'BUILD', {
      fontSize: '10px', color: '#aaaaaa', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(title);

    // Tower icon buttons
    const startX = -(totalWidth / 2) + padding + btnSize / 2;

    towers.forEach((tower, i) => {
      const btnX = startX + i * (btnSize + padding);
      const btnY = 6; // no cancel row anymore — buttons sit lower
      const canAfford = this.callbacks.canAfford(tower.cost);
      const maxed = this.callbacks.maxedOut?.(tower.type) ?? false;
      const enabled = canAfford && !maxed;

      // Button background
      const btnBg = this.scene.add.rectangle(btnX, btnY, btnSize, btnSize, enabled ? 0x2a2a4a : 0x1a1a2a);
      btnBg.setStrokeStyle(2, enabled ? 0x4a4a6a : 0x333344);

      // Tower icon from tileset
      const frame = TOWER_SPRITE_FRAMES[tower.type];
      const icon = this.scene.add.image(btnX, btnY - 2, 'towers_tileset', frame);
      icon.setDisplaySize(btnSize - 12, btnSize - 12);

      // Cost text below icon (or MAX when the build cap is hit)
      const cost = this.scene.add.text(btnX, btnY + btnSize / 2 - 6, maxed ? 'MAX' : `${tower.cost}g`, {
        fontSize: '8px', color: maxed ? '#ff7766' : canAfford ? '#FFD700' : '#666644',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.container.add([btnBg, icon, cost]);

      if (enabled) {
        btnBg.setInteractive({ useHandCursor: true });
        btnBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          (this.scene as any).popupClickHandled = true;
          this.callbacks.onTowerSelect(tower.type);
          this.hide();
        });
        btnBg.on('pointerover', () => {
          btnBg.setFillStyle(0x3a3a5a);
          btnBg.setStrokeStyle(2, 0xFFD700);
        });
        btnBg.on('pointerout', () => {
          btnBg.setFillStyle(0x2a2a4a);
          btnBg.setStrokeStyle(2, 0x4a4a6a);
        });
      }
    });

    // No cancel button — clicking outside closes the popup

    // Position container
    this.container.setPosition(x + totalWidth / 2 + padding, y + totalHeight / 2);
  }

  private createTowerInfoMenu(x: number, y: number, data: { type: TowerType; level: number; sellValue: number; aim: TargetMode }): void {
    const towerDef = TOWER_DEFINITIONS[data.type];
    const upgradeData = TOWER_UPGRADES[data.level];
    const canUpgrade = data.level < MAX_TOWER_LEVEL;
    const upgradeCost = canUpgrade ? Math.floor(towerDef.cost * upgradeData.costMultiplier) : 0;

    // Background
    const bg = this.scene.add.rectangle(0, 0, 180, 180, 0x1a1a3a, 0.95);
    bg.setStrokeStyle(2, 0x4a4a6a);
    this.container.add(bg);

    // Tower icon
    const frame = TOWER_SPRITE_FRAMES[data.type];
    const icon = this.scene.add.image(0, -60, 'towers_tileset', frame);
    icon.setDisplaySize(48, 48);
    this.container.add(icon);

    // Tower name and level
    const title = this.scene.add.text(0, -30, `${towerDef.name} Lv.${data.level}`, {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(title);

    // Stats
    const stats = this.scene.add.text(0, -12, `DMG: ${towerDef.damage} | RNG: ${towerDef.range}`, {
      fontSize: '9px', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.container.add(stats);

    // Sell button
    const sellBg = this.scene.add.rectangle(0, 15, 140, 28, 0x8B0000);
    sellBg.setStrokeStyle(1, 0xffffff);
    const sellText = this.scene.add.text(0, 15, `SELL (+${data.sellValue}g)`, {
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
      const upgradeBg = this.scene.add.rectangle(0, 48, 140, 28, 0x2E7D32);
      upgradeBg.setStrokeStyle(1, 0xffffff);
      const upgradeText = this.scene.add.text(0, 48, `UPGRADE (${upgradeCost}g)`, {
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
      const maxText = this.scene.add.text(0, 48, 'MAX LEVEL', {
        fontSize: '10px', color: '#FFD700', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.container.add(maxText);
    }

    // Aim toggle: cycles first -> last -> strongest -> random
    // (no close button — clicking outside closes the popup)
    const aimModes: TargetMode[] = ['first', 'last', 'strongest', 'random'];
    const aimBg = this.scene.add.rectangle(0, 78, 140, 28, 0x263238);
    aimBg.setStrokeStyle(1, 0x90a4ae);
    const aimText = this.scene.add.text(0, 78, `AIM: ${data.aim.toUpperCase()}`, {
      fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add([aimBg, aimText]);

    aimBg.setInteractive({ useHandCursor: true });
    aimBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      (this.scene as any).popupClickHandled = true;
      const next = aimModes[(aimModes.indexOf(data.aim) + 1) % aimModes.length];
      data.aim = next;
      aimText.setText(`AIM: ${next.toUpperCase()}`);
      this.callbacks.onAimChange?.(next);
    });
    aimBg.on('pointerover', () => aimBg.setFillStyle(0x37474f));
    aimBg.on('pointerout', () => aimBg.setFillStyle(0x263238));

    // Position container
    this.container.setPosition(x + 90, y + 90);
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
