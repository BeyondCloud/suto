import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { HTML_LAYER } from './layers';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { MainlineIntroScene } from './scenes/MainlineIntroScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  transparent: true,
  scene: [MenuScene, MainlineIntroScene, GameScene],
  parent: 'app',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

const gameAreaBg = document.createElement('div');
gameAreaBg.style.position = 'fixed';
gameAreaBg.style.background = '#000000';
gameAreaBg.style.zIndex = String(HTML_LAYER.GAME_AREA_BG);
gameAreaBg.style.pointerEvents = 'none';
document.body.appendChild(gameAreaBg);

const syncGameAreaBg = () => {
  const canvas = game.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  gameAreaBg.style.left = `${rect.left}px`;
  gameAreaBg.style.top = `${rect.top}px`;
  gameAreaBg.style.width = `${rect.width}px`;
  gameAreaBg.style.height = `${rect.height}px`;
};

window.addEventListener('resize', syncGameAreaBg);
game.scale.on(Phaser.Scale.Events.RESIZE, syncGameAreaBg);
requestAnimationFrame(syncGameAreaBg);
