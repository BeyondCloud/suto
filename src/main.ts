import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { HTML_LAYER } from './layers';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { MainlineIntroScene } from './scenes/MainlineIntroScene';

const CJK_UI_FONT_FAMILY = "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
const CJK_TEXT_TEST_STRING = '回國語測試|MÉqgy';

type PartialTextStyle = Phaser.Types.GameObjects.Text.TextStyle;

const mergeCjkPadding = (padding: PartialTextStyle['padding']): Phaser.Types.GameObjects.Text.TextPadding => {
  const base: Phaser.Types.GameObjects.Text.TextPadding = { left: 0, right: 0, top: 8, bottom: 3 };
  if (typeof padding === 'number') {
    return { left: padding, right: padding, top: Math.max(8, padding), bottom: Math.max(3, padding) };
  }
  if (!padding || typeof padding !== 'object') {
    return base;
  }

  return {
    left: padding.left ?? 0,
    right: padding.right ?? 0,
    top: Math.max(8, padding.top ?? 0),
    bottom: Math.max(3, padding.bottom ?? 0),
  };
};

const applyCjkTextMetricsPatch = () => {
  // Phaser measures glyph bounds with a test string. Include CJK glyphs to avoid top clipping.
  const styleProto = Phaser.GameObjects.TextStyle.prototype as unknown as {
    fontFamily?: string;
    testString?: string;
    baselineY?: number;
  };
  styleProto.fontFamily = CJK_UI_FONT_FAMILY;
  styleProto.testString = CJK_TEXT_TEST_STRING;
  styleProto.baselineY = 1.35;
};

const applyCjkTextFactoryPatch = () => {
  const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
    text: (
      x: number,
      y: number,
      text: string | string[],
      style?: PartialTextStyle,
    ) => Phaser.GameObjects.Text;
  };

  const originalTextFactory = factoryProto.text;
  factoryProto.text = function patchedTextFactory(
    x: number,
    y: number,
    text: string | string[],
    style?: PartialTextStyle,
  ): Phaser.GameObjects.Text {
    const nextStyle: PartialTextStyle = style ? { ...style } : {};
    if (!nextStyle.fontFamily) {
      nextStyle.fontFamily = CJK_UI_FONT_FAMILY;
    }
    if (!nextStyle.testString) {
      nextStyle.testString = CJK_TEXT_TEST_STRING;
    }
    nextStyle.padding = mergeCjkPadding(nextStyle.padding);
    return originalTextFactory.call(this, x, y, text, nextStyle);
  };
};

applyCjkTextMetricsPatch();
applyCjkTextFactoryPatch();

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
