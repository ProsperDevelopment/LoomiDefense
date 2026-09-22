import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config/constants';

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const levelParam = urlParams.get('level');
const startLevel = levelParam ? parseInt(levelParam, 10) : null;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  parent: document.body,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// Store start level for BootScene to access
(window as any).__START_LEVEL = startLevel;
