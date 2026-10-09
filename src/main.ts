import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { PlayScene } from './scenes/PlayScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config/constants';
import { userProfile } from './state/UserProfile';
import { buildTopbar, setTopbarVisible } from './ui/overlay/screens';
import { onLobbyStart, lobby } from './ui/overlay/lobbyScreen';

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
  scene: [BootScene, MenuScene, LevelSelectScene, PlayScene, GameScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// Store start level for BootScene to access
(window as any).__START_LEVEL = startLevel;

// --- Profile + overlay UI bootstrapping ---
void userProfile.init().finally(() => {
  buildTopbar();
});

// When the multiplayer lobby starts a game, launch GameScene in net mode.
// Each player uses their own loadout — no loadout is passed here.
onLobbyStart((_loadout, levelId) => {
  const isHost = !!userProfile.user && lobby.room?.hostId === userProfile.user.id;
  // Stop PlayScene if it's active (we're launching from the lobby)
  const playScene = game.scene.getScene('PlayScene');
  if (playScene && playScene.scene.isActive()) {
    playScene.scene.stop();
  }
  game.scene.start('GameScene', {
    levelId,
    netRole: isHost ? 'host' : 'guest',
  });
});

// The top bar overlays the HUD; hide it during gameplay
let wasInGame: boolean | null = null;
game.events.on('step', () => {
  const scene = game.scene.getScene('GameScene');
  const inGame = !!(scene && scene.scene.isActive());
  if (inGame !== wasInGame) {
    wasInGame = inGame;
    setTopbarVisible(!inGame);
  }
});

// Expose for debugging
(window as any).__game = game;
(window as any).__lobby = lobby;
