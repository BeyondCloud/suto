import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { HTML_LAYER, SCENE_LAYER } from '../../layers';
import { wireDomButtonHoverSound } from '../shared/buttonHoverSound';
// Turn on debug mode by adding ?debug=1 to the URL, e.g., http://localhost:5173/?debug=1
function parseDebugModeFromUrl(): boolean {
  if (typeof window === 'undefined') return false;

  const debugParam = new URLSearchParams(window.location.search).get('debug');
  if (!debugParam) return false;

  const normalized = debugParam.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

export const DEBUG_MODE = parseDebugModeFromUrl();

export interface DebugEndingPreset {
  rank: string;
  perfect: number;
  miss: number;
  falseTouch: number;
  life: number;
}

export const DEBUG_ENDING_PRESETS: DebugEndingPreset[] = [
  { rank: 'S++', perfect: 100, miss: 0, falseTouch: 0, life: 100 },
  { rank: 'S+', perfect: 100, miss: 0, falseTouch: 3, life: 96 },
  { rank: 'S', perfect: 95, miss: 5, falseTouch: 2, life: 92 },
  { rank: 'A', perfect: 90, miss: 10, falseTouch: 4, life: 84 },
  { rank: 'B', perfect: 80, miss: 20, falseTouch: 5, life: 72 },
  { rank: 'C', perfect: 70, miss: 30, falseTouch: 6, life: 58 },
  { rank: 'D', perfect: 60, miss: 40, falseTouch: 8, life: 36 },
];

interface GameSceneDebugControllerOptions {
  scene: Phaser.Scene;
  onSelectEndingPreset: (preset: DebugEndingPreset) => void;
  onPreviewButtonTooSlowGameOver: () => void;
}

export class GameSceneDebugController {
  private readonly scene: Phaser.Scene;
  private readonly onSelectEndingPreset: (preset: DebugEndingPreset) => void;
  private readonly onPreviewButtonTooSlowGameOver: () => void;
  private debugText?: Phaser.GameObjects.Text;
  private overlayRoot?: HTMLDivElement;
  private hotkeyHandler?: (event: KeyboardEvent) => void;

  constructor(options: GameSceneDebugControllerOptions) {
    this.scene = options.scene;
    this.onSelectEndingPreset = options.onSelectEndingPreset;
    this.onPreviewButtonTooSlowGameOver = options.onPreviewButtonTooSlowGameOver;
  }

  get enabled(): boolean {
    return DEBUG_MODE;
  }

  createHud() {
    if (!this.enabled) return;

    this.debugText = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontSize: '26px',
      color: '#ffe066',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(SCENE_LAYER.DEBUG_OVERLAY);

    this.createEndingOverlay();
    this.updateMetrics();
  }

  updateMetrics() {
    if (!this.enabled || !this.debugText) return;
    this.debugText.setText('');
  }

  triggerEndingPreset(preset?: DebugEndingPreset): boolean {
    if (!this.enabled || !preset) return false;
    this.onSelectEndingPreset(preset);
    return true;
  }

  hideEndingOverlay() {
    if (this.hotkeyHandler) {
      window.removeEventListener('keydown', this.hotkeyHandler);
      this.hotkeyHandler = undefined;
    }

    this.overlayRoot?.remove();
    this.overlayRoot = undefined;
  }

  dispose() {
    this.hideEndingOverlay();
    this.debugText?.destroy();
    this.debugText = undefined;
  }

  private createEndingOverlay() {
    this.hideEndingOverlay();

    const root = document.createElement('div');
    root.setAttribute('data-suto-debug-ending', '1');
    root.style.position = 'fixed';
    root.style.left = '12px';
    root.style.top = '12px';
    root.style.zIndex = String(HTML_LAYER.GAME_FRAME_BEZEL - 1);
    root.style.display = 'grid';
    root.style.gridTemplateColumns = 'repeat(2, minmax(86px, 1fr))';
    root.style.gap = '8px';
    root.style.padding = '12px';
    root.style.width = '224px';
    root.style.background = 'rgba(15, 20, 32, 0.96)';
    root.style.border = '2px solid #ffd24d';
    root.style.borderRadius = '10px';
    root.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.45)';
    root.style.fontFamily = "'Noto Sans TC', 'PingFang TC', sans-serif";
    root.style.pointerEvents = 'auto';

    const title = document.createElement('div');
    title.textContent = 'DEBUG 結算預覽';
    title.style.gridColumn = '1 / -1';
    title.style.fontSize = '16px';
    title.style.fontWeight = '800';
    title.style.color = '#ffe066';
    root.appendChild(title);

    DEBUG_ENDING_PRESETS.forEach((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.rank;
      button.style.height = '40px';
      button.style.border = '2px solid #c8dcff';
      button.style.borderRadius = '8px';
      button.style.background = '#233042';
      button.style.color = '#ffffff';
      button.style.fontSize = '20px';
      button.style.fontWeight = '800';
      button.style.cursor = 'pointer';
      button.onmouseenter = () => {
        button.style.background = '#385276';
        button.style.borderColor = '#ffffff';
      };
      wireDomButtonHoverSound(this.scene, button);
      button.onmouseleave = () => {
        button.style.background = '#233042';
        button.style.borderColor = '#c8dcff';
      };
      button.onclick = () => this.onSelectEndingPreset(preset);
      root.appendChild(button);
    });

    const gameOverPreviewButton = document.createElement('button');
    gameOverPreviewButton.type = 'button';
    gameOverPreviewButton.textContent = '預覽按太慢';
    gameOverPreviewButton.style.gridColumn = '1 / -1';
    gameOverPreviewButton.style.height = '42px';
    gameOverPreviewButton.style.border = '2px solid #ffd4d4';
    gameOverPreviewButton.style.borderRadius = '8px';
    gameOverPreviewButton.style.background = '#7a1f30';
    gameOverPreviewButton.style.color = '#ffffff';
    gameOverPreviewButton.style.fontSize = '18px';
    gameOverPreviewButton.style.fontWeight = '800';
    gameOverPreviewButton.style.cursor = 'pointer';
    gameOverPreviewButton.onmouseenter = () => {
      gameOverPreviewButton.style.background = '#9a2c3f';
      gameOverPreviewButton.style.borderColor = '#fff1f1';
    };
    wireDomButtonHoverSound(this.scene, gameOverPreviewButton);
    gameOverPreviewButton.onmouseleave = () => {
      gameOverPreviewButton.style.background = '#7a1f30';
      gameOverPreviewButton.style.borderColor = '#ffd4d4';
    };
    gameOverPreviewButton.onclick = () => this.onPreviewButtonTooSlowGameOver();
    root.appendChild(gameOverPreviewButton);

    const hint = document.createElement('div');
    hint.textContent = '快捷鍵: 1~7';
    hint.style.gridColumn = '1 / -1';
    hint.style.fontSize = '14px';
    hint.style.fontWeight = '700';
    hint.style.color = '#ffffff';
    root.appendChild(hint);

    document.body.appendChild(root);
    this.overlayRoot = root;

    this.hotkeyHandler = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= DEBUG_ENDING_PRESETS.length) return;
      this.onSelectEndingPreset(DEBUG_ENDING_PRESETS[index]);
    };
    window.addEventListener('keydown', this.hotkeyHandler);
  }

}
