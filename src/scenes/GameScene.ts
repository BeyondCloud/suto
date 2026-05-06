import Phaser from 'phaser';
import suto400GifUrl from '../assets/suto400_2x.gif';
import promptDUrl from '../assets/audio/D.wav';
import promptLUrl from '../assets/audio/L.wav';
import promptRUrl from '../assets/audio/R.wav';
import promptUUrl from '../assets/audio/U.wav';
import clapUrl from '../assets/audio/clap.wav';
import missUrl from '../assets/audio/miss.wav';
import stage120Url from '../assets/audio/120.wav';
import {
  GAME_WIDTH, GAME_HEIGHT,
  DIR_ANGLE, ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX, ELLIPSE_RY,
  getRotationPoints,
} from '../config';
import type { GameSettings, Direction } from '../config';
import { LEVEL_DATA } from '../levels';
import type { Stage, Section, NormalSection, RotationSection } from '../levels';

const ALL_DIRS: Direction[] = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL'];
const CARDINAL_DIRS: Direction[] = ['U', 'D', 'L', 'R'];
const CHECKPOINT_RADIUS = 18;
const CURSOR_CHECK_POINT_DOT_SIZE = 10;
const CURSOR_CHECK_POINT_EDGE_INSET_PX = 2;
const FALSE_TOUCH_DAMAGE = 5;
const DEFAULT_STAGE_AUDIO_CLIP = 'src/assets/audio/120.wav';
const PROMPT_AUDIO_KEYS: Partial<Record<Direction, string>> = {
  U: 'prompt_U',
  D: 'prompt_D',
  L: 'prompt_L',
  R: 'prompt_R',
};

const getStageAudioKey = (clipPath: string): string => `stage_audio_${clipPath.replace(/[^a-zA-Z0-9]/g, '_')}`;

const resolveStageAudioClipUrl = (clipPath: string): string => {
  if (clipPath === DEFAULT_STAGE_AUDIO_CLIP) return stage120Url;
  return clipPath;
};

interface CheckpointUI {
  dir: Direction;
  pos: { x: number; y: number };
  outerCircle: Phaser.GameObjects.Arc;
  innerCircle: Phaser.GameObjects.Arc;
  edgeZone?: Phaser.GameObjects.Rectangle;
  edgeLine?: Phaser.GameObjects.Rectangle;
}

interface ActiveShrink {
  id: number;
  dir: Direction;
  hit: boolean;
  judgementTimeMs: number;
  tween?: Phaser.Tweens.Tween;
}

interface HitboxRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export class GameScene extends Phaser.Scene {
  private settings!: GameSettings;
  private stageIndex!: number;
  private currentStage!: Stage;
  private currentStageAudioKey: string | null = null;
  private sectionIndex = 0;
  private currentSection!: Section;

  // Timing
  private beatMs = 500;
  private beatCount = 0;
  private gamePhase: 'prompt' | 'check' = 'prompt';

  // UI
  private ellipseGraphics!: Phaser.GameObjects.Graphics;
  private checkpoints: CheckpointUI[] = [];
  private hitboxGraphics!: Phaser.GameObjects.Graphics;
  private cursorClipFrame!: HTMLDivElement;
  private cursorGifFrame!: HTMLDivElement;
  private cursorGif!: HTMLImageElement;
  private cursorGifBorder!: HTMLDivElement;
  private cursorCheckPointDot!: HTMLDivElement;
  private cursorGifAngle = { value: 180 };
  private cursorGifAngleTween?: Phaser.Tweens.Tween;
  private cursorScaleX = 1;
  private cursorScaleY = 1;
  private cursorCanvasLeft = 0;
  private cursorCanvasTop = 0;
  private cursorWidth = 0;
  private cursorHeight = 0;
  private cursorWorldX = GAME_WIDTH / 2;
  private cursorWorldY = GAME_HEIGHT / 2;
  private lastCursorX = Number.NaN;
  private lastCursorY = Number.NaN;
  private lastCursorAngle = Number.NaN;
  private resetGifCursorCache() {
    this.cursorWidth = 0;
    this.cursorHeight = 0;
    this.lastCursorX = Number.NaN;
    this.lastCursorY = Number.NaN;
    this.lastCursorAngle = Number.NaN;
  }
  private readonly refreshGifCursorMetrics = () => {
    if (!this.cursorClipFrame || !this.cursorGifFrame || !this.cursorGif) return;

    const rect = this.game.canvas.getBoundingClientRect();
    this.cursorCanvasLeft = rect.left;
    this.cursorCanvasTop = rect.top;
    this.cursorScaleX = rect.width / GAME_WIDTH;
    this.cursorScaleY = rect.height / GAME_HEIGHT;
    this.cursorClipFrame.style.left = `${rect.left}px`;
    this.cursorClipFrame.style.top = `${rect.top}px`;
    this.cursorClipFrame.style.width = `${rect.width}px`;
    this.cursorClipFrame.style.height = `${rect.height}px`;

    const width = this.settings.hitboxWidth * this.cursorScaleX;
    const height = this.settings.hitboxHeight * this.cursorScaleY;
    if (width !== this.cursorWidth || height !== this.cursorHeight) {
      this.cursorWidth = width;
      this.cursorHeight = height;
      this.cursorGifFrame.style.width = `${width}px`;
      this.cursorGifFrame.style.height = `${height}px`;
      this.cursorGif.style.width = `${width}px`;
      this.cursorGif.style.height = `${height}px`;
    }
  };
  private readonly refreshGifCursorLayout = () => {
    this.refreshGifCursorMetrics();
    this.lastCursorX = Number.NaN;
    this.lastCursorY = Number.NaN;
    this.updateGifCursorPosition(this.cursorWorldX, this.cursorWorldY);
  };
  private readonly onWindowPointerMove = (event: PointerEvent) => {
    this.refreshGifCursorMetrics();
    const x = (event.clientX - this.cursorCanvasLeft) / this.cursorScaleX;
    const y = (event.clientY - this.cursorCanvasTop) / this.cursorScaleY;
    this.updateCursorPosition(x, y);
  };
  private lifeBar!: Phaser.GameObjects.Graphics;
  private lifeValue = 100;
  private perfectCount = 0;
  private missCount = 0;
  private falseTouchCount = 0;
  private judgementText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private beatTimer!: Phaser.Time.TimerEvent;

  // Prompt phase
  private isRotation = false;
  private rotCurrentDir: Direction = 'U';
  private promptImages: Phaser.GameObjects.Image[] = [];
  private promptIndicator?: Phaser.GameObjects.Rectangle;
  private promptIndicatorTween?: Phaser.Tweens.Tween;
  private promptCellCenters: Array<{ x: number; y: number }> = [];
  private promptCellWidth = 0;
  private promptCellHeight = 0;
  private promptIndicatorSize = 0;

  // Check phase
  private beatTargets: Direction[] = [];
  private beatTargetPairs: [Direction, Direction][] = [];
  private shrinkTweens: Map<number, Phaser.Tweens.Tween> = new Map();
  private shrinkStartEvents: Phaser.Time.TimerEvent[] = [];
  private pendingShrinkStartCount = 0;
  private activeShrinks: Map<number, ActiveShrink> = new Map();
  private nextShrinkId = 1;
  private falseTouchedLines: Set<Direction> = new Set();
  private penaltyCooldownUntil = 0;

  // Pause
  private isPaused = false;
  private pauseContainer!: Phaser.GameObjects.Container;
  private countdownText!: Phaser.GameObjects.Text;

  // Flash
  private flashOverlay!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('GameScene');
  }

  init(data: { settings: GameSettings; stageIndex: number }) {
    this.settings = data.settings;
    this.stageIndex = data.stageIndex ?? 0;
  }

  preload() {
    this.load.image('down', 'src/assets/down.png');
    this.load.image('down_left', 'src/assets/down_left.png');
    this.load.audio('prompt_U', promptUUrl);
    this.load.audio('prompt_D', promptDUrl);
    this.load.audio('prompt_L', promptLUrl);
    this.load.audio('prompt_R', promptRUrl);
    this.load.audio('clap', clapUrl);
    this.load.audio('miss', missUrl);

    const stageAudioClips = new Set(LEVEL_DATA.stages.map(stage => stage.audio_clip));
    for (const clipPath of stageAudioClips) {
      this.load.audio(getStageAudioKey(clipPath), resolveStageAudioClipUrl(clipPath));
    }
  }

  create() {
    this.loadStage(this.stageIndex);
    this.sectionIndex = 0;
    this.lifeValue = 100;
    this.perfectCount = 0;
    this.missCount = 0;
    this.falseTouchCount = 0;
    this.shrinkTweens.clear();

    this.ellipseGraphics = this.add.graphics();
    this.hitboxGraphics = this.add.graphics().setDepth(25);
    this.drawEllipse();
    this.createHUD();
    this.createLifeBar();
    this.createCheckpoints();
    this.createCursors();
    this.createPauseMenu();
    this.flashOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(50);

    this.setCheckpointsVisible(false);

    this.input.keyboard!.on('keydown-ESC', () => this.onEsc());
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => this.onMouseMove(ptr));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupScene());

    this.startSection();
  }

  private loadStage(index: number) {
    this.currentStage = LEVEL_DATA.stages[index];
    this.beatMs = 60000 / this.currentStage.bpm;
    this.currentStageAudioKey = getStageAudioKey(this.currentStage.audio_clip);
  }

  private drawEllipse() {
    this.ellipseGraphics.clear();
    if (this.settings.debugMode) {
      this.ellipseGraphics.lineStyle(2, 0xffffff, 1);
      this.ellipseGraphics.strokeEllipse(ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX * 2, ELLIPSE_RY * 2);
      const d = this.checkDepth();
      this.ellipseGraphics.lineStyle(1, 0x66d9ff, 0.6);
      this.ellipseGraphics.strokeRect(d, d, GAME_WIDTH - d * 2, GAME_HEIGHT - d * 2);
    }
  }

  private createHUD() {
    const cx = GAME_WIDTH / 2;
    this.stageText = this.add.text(cx, 24, '', { fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(10);
    this.roundText = this.add.text(cx, 58, '', { fontSize: '20px', color: '#cccccc' }).setOrigin(0.5, 0).setDepth(10);
    this.judgementText = this.add.text(GAME_WIDTH - 24, 24, '', { fontSize: '22px', color: '#ffffff', fontStyle: 'bold', align: 'right' }).setOrigin(1, 0).setDepth(10);
    this.updateHUD();
    this.updateJudgementText();
  }

  private updateHUD() {
    this.stageText.setText(`Stage ${this.currentStage.stage_number}`);
    this.roundText.setText(`${this.sectionIndex + 1}/${this.currentStage.sections.length}`);
  }

  private updateJudgementText() {
    this.judgementText.setText([
      `Perfect ${this.perfectCount}`,
      `Miss ${this.missCount}`,
      `X ${this.falseTouchCount}`,
    ]);
  }

  private createLifeBar() {
    this.lifeBar = this.add.graphics().setDepth(10);
    this.drawLifeBar();
  }

  private drawLifeBar() {
    this.lifeBar.clear();
    const x = 24, barH = 300, barW = 18;
    const y = GAME_HEIGHT / 2 - barH / 2;
    this.lifeBar.fillStyle(0x333333, 1);
    this.lifeBar.fillRect(x, y, barW, barH);
    const ratio = Math.max(0, this.lifeValue) / 100;
    const fillH = barH * ratio;
    const color = this.lifeValue <= 30 ? 0xcc2222 : this.lifeValue <= 70 ? 0xcccc22 : 0x00cc44;
    this.lifeBar.fillStyle(color, 1);
    this.lifeBar.fillRect(x, y + (barH - fillH), barW, fillH);
  }

  private createCheckpoints() {
    this.checkpoints = [];
    for (const dir of ALL_DIRS) {
      const pos = this.getTargetPos(dir);
      const outer = this.add.arc(pos.x, pos.y, 60, 0, 360, false, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 1).setDepth(5);
      const inner = this.add.arc(pos.x, pos.y, CHECKPOINT_RADIUS, 0, 360, false, 0xffffff, 0.5).setDepth(5);
      const cp: CheckpointUI = { dir, pos, outerCircle: outer, innerCircle: inner };

      if (this.isCardinal(dir)) {
        const zone = this.createEdgeZone(dir).setDepth(4).setVisible(false);
        const line = this.createEdgeLine(dir).setDepth(6).setVisible(false);
        outer.setVisible(false);
        inner.setVisible(false);
        cp.edgeZone = zone;
        cp.edgeLine = line;
      }

      this.checkpoints.push(cp);
    }
  }

  private setCheckpointsVisible(vis: boolean) {
    for (const cp of this.checkpoints) {
      const circleVisible = vis && !this.isCardinal(cp.dir);
      cp.outerCircle.setVisible(circleVisible);
      cp.innerCircle.setVisible(circleVisible);
      cp.edgeZone?.setVisible(vis);
      cp.edgeLine?.setVisible(vis);
    }
  }

  private setInnerCheckpointsVisible(vis: boolean) {
    for (const cp of this.checkpoints) {
      cp.outerCircle.setVisible(false);
      cp.innerCircle.setVisible(vis && !this.isCardinal(cp.dir));
      cp.edgeZone?.setVisible(vis);
      cp.edgeLine?.setVisible(false);
    }
  }

  private createCursors() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.resetGifCursorCache();
    this.cursorClipFrame = document.createElement('div');
    this.cursorClipFrame.style.position = 'fixed';
    this.cursorClipFrame.style.pointerEvents = 'none';
    this.cursorClipFrame.style.left = '0';
    this.cursorClipFrame.style.top = '0';
    this.cursorClipFrame.style.width = '0';
    this.cursorClipFrame.style.height = '0';
    this.cursorClipFrame.style.overflow = 'visible';
    this.cursorClipFrame.style.zIndex = '10';
    this.cursorClipFrame.style.display = 'none';

    this.cursorGifFrame = document.createElement('div');
    this.cursorGifFrame.style.position = 'absolute';
    this.cursorGifFrame.style.pointerEvents = 'none';
    this.cursorGifFrame.style.left = '0';
    this.cursorGifFrame.style.top = '0';
    this.cursorGifFrame.style.transform = 'translate3d(-9999px, -9999px, 0) translate(-50%, -50%)';
    this.cursorGifFrame.style.willChange = 'transform';
    this.cursorGifFrame.style.zIndex = '10';
    this.cursorGifFrame.style.display = 'none';
    this.cursorGifFrame.style.overflow = 'hidden';
    this.cursorGifFrame.style.background = '#000';
    this.cursorGifFrame.style.boxSizing = 'border-box';

    this.cursorGif = document.createElement('img');
    this.cursorGif.src = suto400GifUrl;
    this.cursorGif.alt = '';
    this.cursorGif.draggable = false;
    this.cursorGif.style.position = 'absolute';
    this.cursorGif.style.left = '50%';
    this.cursorGif.style.top = '50%';
    this.cursorGif.style.pointerEvents = 'none';
    this.cursorGif.style.transformOrigin = 'center center';
    this.cursorGif.style.userSelect = 'none';
    this.cursorGif.style.willChange = 'transform';
    this.cursorGif.style.opacity = '0.85';
    this.cursorGif.style.zIndex = '1';
    this.cursorGifFrame.appendChild(this.cursorGif);

    this.cursorGifBorder = document.createElement('div');
    this.cursorGifBorder.style.position = 'absolute';
    this.cursorGifBorder.style.inset = '0';
    this.cursorGifBorder.style.pointerEvents = 'none';
    this.cursorGifBorder.style.border = '2px solid #fff';
    this.cursorGifBorder.style.boxSizing = 'border-box';
    this.cursorGifBorder.style.zIndex = '2';
    this.cursorGifFrame.appendChild(this.cursorGifBorder);

    this.cursorClipFrame.appendChild(this.cursorGifFrame);

    this.cursorCheckPointDot = document.createElement('div');
    this.cursorCheckPointDot.style.position = 'fixed';
    this.cursorCheckPointDot.style.left = '0';
    this.cursorCheckPointDot.style.top = '0';
    this.cursorCheckPointDot.style.width = `${CURSOR_CHECK_POINT_DOT_SIZE}px`;
    this.cursorCheckPointDot.style.height = `${CURSOR_CHECK_POINT_DOT_SIZE}px`;
    this.cursorCheckPointDot.style.borderRadius = '50%';
    this.cursorCheckPointDot.style.background = '#ff1d1d';
    this.cursorCheckPointDot.style.border = '2px solid #ffffff';
    this.cursorCheckPointDot.style.boxSizing = 'border-box';
    this.cursorCheckPointDot.style.pointerEvents = 'none';
    this.cursorCheckPointDot.style.zIndex = '10000';
    this.cursorCheckPointDot.style.display = 'none';
    this.cursorCheckPointDot.style.transform = 'translate3d(-9999px, -9999px, 0) translate(-50%, -50%)';

    document.body.appendChild(this.cursorClipFrame);
    document.body.appendChild(this.cursorCheckPointDot);
    this.refreshGifCursorMetrics();
    this.setGifCursorAngle(this.cursorGifAngle.value);
    this.updateGifCursorPosition(cx, cy);
    window.addEventListener('resize', this.refreshGifCursorLayout);
    window.addEventListener('pointermove', this.onWindowPointerMove, { passive: true });
    this.input.setDefaultCursor('none');
  }

  private cleanupScene() {
    this.input.setDefaultCursor('default');
    this.setGifCursorVisible(false);
    this.cursorGifAngleTween?.stop();
    window.removeEventListener('resize', this.refreshGifCursorLayout);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    this.cursorCheckPointDot?.remove();
    this.cursorClipFrame?.remove();
    this.resetGifCursorCache();
    this.beatTimer?.remove(false);
    for (const event of this.shrinkStartEvents) event.remove(false);
    this.shrinkStartEvents = [];
    for (const t of this.shrinkTweens.values()) t.stop();
    this.shrinkTweens.clear();
    this.activeShrinks.clear();
    this.falseTouchedLines.clear();
    this.penaltyCooldownUntil = 0;
  }

  private createPauseMenu() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.pauseContainer = this.add.container(cx, cy).setDepth(100).setVisible(false);
    const bg = this.add.rectangle(0, 0, 400, 280, 0x000000, 0.85);
    const title = this.add.text(0, -100, 'PAUSED', { fontSize: '36px', color: '#fff' }).setOrigin(0.5);

    const makeBtn = (label: string, y: number, cb: () => void) => {
      const btn = this.add.text(0, y, label, { fontSize: '26px', color: '#aaffaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setColor('#ffffff'));
      btn.on('pointerout', () => btn.setColor('#aaffaa'));
      btn.on('pointerdown', cb);
      return btn;
    };

    const resumeBtn = makeBtn('繼續', -30, () => this.resumeWithCountdown());
    const homeBtn = makeBtn('返回主頁', 30, () => this.returnToMenu());

    this.pauseContainer.add([bg, title, resumeBtn, homeBtn]);
    this.countdownText = this.add.text(cx, cy, '', { fontSize: '80px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(110).setVisible(false);
  }

  // ---------- Section flow ----------

  private startSection() {
    this.currentSection = this.currentStage.sections[this.sectionIndex];
    this.isRotation = this.currentSection.type === 'rotation';
    this.beatCount = 0;
    this.updateHUD();
    this.startPromptPhase();
  }

  private startPromptPhase() {
    this.gamePhase = 'prompt';
    this.setCheckpointsVisible(false);
    this.clearPromptGrid();
    this.buildPromptGrid();
    this.setGifCursorVisible(false);
    this.beatCount = 0;
    this.playStagePhaseClip();

    // Fire first beat immediately, then repeat
    this.beatTimer?.remove();
    this.onBeat();
    this.beatTimer = this.time.addEvent({ delay: this.beatMs, repeat: 7, callback: this.onBeat, callbackScope: this });
  }

  private startCheckPhase() {
    this.gamePhase = 'check';
    this.clearPromptGrid();
    this.setInnerCheckpointsVisible(true);
    this.beatCount = 0;
    this.buildBeatTargets();
    const firstDir = this.isRotation ? this.beatTargetPairs[0]?.[0] : this.beatTargets[0];
    if (firstDir) this.rotateGifCursorTo(firstDir, 0);
    this.setGifCursorVisible(true);

    this.beatTimer?.remove();
    this.onBeat();
    this.beatTimer = this.time.addEvent({ delay: this.beatMs, repeat: 7, callback: this.onBeat, callbackScope: this });
  }

  private onBeat() {
    if (this.gamePhase === 'prompt') {
      this.highlightPromptBeat(this.beatCount);
      this.beatCount++;
      if (this.beatCount >= 8) {
        this.beatTimer?.remove();
        this.startCheckPhase();
      }
    } else {
      if (this.beatCount >= 8) {
        this.beatTimer?.remove();
        return;
      }
      this.triggerShrinkForBeat(this.beatCount);
      this.beatCount++;
      if (this.beatCount >= 8) {
        this.beatTimer?.remove();
        const lead = Math.max(0, this.settings.shrinkLeadMs);
        const settleAfterLastBeat = this.isRotation
          ? (this.beatMs / 2) + Math.max(this.beatMs, lead)
          : Math.max(this.beatMs, lead);
        const completionSafetyBufferMs = 50;
        this.time.delayedCall(settleAfterLastBeat + completionSafetyBufferMs, () => this.onCheckPhaseEnd());
      }
    }
  }

  private onCheckPhaseEnd() {
    if (this.pendingShrinkStartCount > 0 || this.activeShrinks.size > 0) {
      this.time.delayedCall(16, () => this.onCheckPhaseEnd());
      return;
    }

    this.stopAllShrinks();
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.sectionIndex++;
    if (this.sectionIndex >= this.currentStage.sections.length) {
      this.stageIndex++;
      if (this.stageIndex >= LEVEL_DATA.stages.length) {
        this.time.delayedCall(500, () => this.scene.start('MenuScene'));
      } else {
        this.loadStage(this.stageIndex);
        this.sectionIndex = 0;
        this.startSection();
      }
    } else {
      this.startSection();
    }
  }

  // ---------- Prompt phase ----------

  private clearPromptGrid() {
    for (const img of this.promptImages) img.destroy();
    this.promptImages = [];
    this.promptCellCenters = [];
    this.promptCellWidth = 0;
    this.promptCellHeight = 0;
    this.promptIndicatorSize = 0;
    this.promptIndicatorTween?.stop();
    if (this.promptIndicator?.active) {
      this.promptIndicator.setVisible(false);
    } else {
      this.promptIndicator = undefined;
    }
  }

  private buildPromptGrid() {
    const { x, y } = this.getCursorPosition();

    if (this.isRotation) {
      const sec = this.currentSection as RotationSection;
      this.rotCurrentDir = sec.start;
      for (let i = 0; i < 8; i++) {
        this.promptImages.push(this.addArrowImage(0, 0, sec.start));
      }
    } else {
      const sec = this.currentSection as NormalSection;
      for (let i = 0; i < 8; i++) {
        this.promptImages.push(this.addArrowImage(0, 0, sec.prompts[i]));
      }
    }
    this.positionPromptGrid(x, y);
    this.drawHitbox(x, y);
  }

  private addArrowImage(x: number, y: number, dir: Direction): Phaser.GameObjects.Image {
    const isDiagonal = dir === 'UL' || dir === 'UR' || dir === 'DL' || dir === 'DR';
    const key = isDiagonal ? 'down_left' : 'down';
    const img = this.add.image(x, y, key).setDepth(15).setAlpha(0.9);
    img.setAngle(isDiagonal ? DIR_ANGLE[dir] - 45 : DIR_ANGLE[dir]);
    return img;
  }

  private positionPromptGrid(x: number, y: number) {
    const cols = 4;
    const rows = 2;
    const cellW = this.settings.hitboxWidth / cols;
    const cellH = this.settings.hitboxHeight / rows;
    const arrowSize = 120;
    const startX = x - this.settings.hitboxWidth / 2 + cellW / 2;
    const startY = y - this.settings.hitboxHeight / 2 + cellH / 2;

    this.promptCellWidth = cellW;
    this.promptCellHeight = cellH;
    this.promptIndicatorSize = Math.min(Math.min(cellW, cellH) * 0.95, arrowSize * 1.15);

    for (let i = 0; i < this.promptImages.length; i++) {
      const cellX = startX + (i % cols) * cellW;
      const cellY = startY + Math.floor(i / cols) * cellH;
      this.promptCellCenters[i] = { x: cellX, y: cellY };
      this.promptImages[i]
        .setPosition(cellX, cellY)
        .setDisplaySize(arrowSize, arrowSize);
    }

    if (this.isRotation) {
      this.promptIndicatorTween?.stop();
      this.promptIndicator?.setVisible(false);
    } else {
      // Mouse move repositions the prompt grid; stop old tween so the indicator stays anchored to the cursor.
      this.promptIndicatorTween?.stop();
      this.syncPromptIndicatorWithCell();
    }
  }

  private syncPromptIndicatorWithCell(index = this.beatCount) {
    const cell = this.promptCellCenters[index];
    if (!cell) return;
    const indicatorSize = this.promptIndicatorSize || Math.min(this.promptCellWidth, this.promptCellHeight) * 0.86;
    const indicatorGeom = this.promptIndicator ? ((this.promptIndicator as unknown as { geom?: unknown }).geom ?? null) : null;

    if (!this.promptIndicator || !this.promptIndicator.active || !indicatorGeom) {
      this.promptIndicator = this.add.rectangle(cell.x, cell.y, indicatorSize, indicatorSize)
        .setDepth(16)
        .setFillStyle(0xffffff, 0)
        .setStrokeStyle(3, 0xfff17a, 1);
    }

    this.promptIndicator
      .setVisible(true)
      .setSize(indicatorSize, indicatorSize)
      .setPosition(cell.x, cell.y);
  }

  private movePromptIndicatorToBeat(beat: number) {
    const cell = this.promptCellCenters[beat];
    if (!cell) return;

    this.syncPromptIndicatorWithCell(beat);
    if (!this.promptIndicator) return;

    this.promptIndicatorTween?.stop();
    const isFirstMove = beat === 0;
    if (isFirstMove) {
      this.promptIndicator.setPosition(cell.x, cell.y);
      return;
    }

    this.promptIndicatorTween = this.tweens.add({
      targets: this.promptIndicator,
      x: cell.x,
      y: cell.y,
      duration: Math.min(220, this.beatMs * 0.45),
      ease: 'Cubic.easeOut',
    });
  }

  private highlightPromptBeat(beat: number) {
    if (this.isRotation) {
      this.promptIndicatorTween?.stop();
      this.promptIndicator?.setVisible(false);
    } else {
      this.movePromptIndicatorToBeat(beat);
    }

    if (this.isRotation) {
      const sec = this.currentSection as RotationSection;
      const rotDir = sec.rotate[beat];
      const [diag, next] = getRotationPoints(this.rotCurrentDir, rotDir);
      const halfBeat = this.beatMs / 2;

      for (const img of this.promptImages) {
        img.setAlpha(1);
        const targetDiagAngle = this.getArrowAngle(diag);
        const targetNextAngle = this.getArrowAngle(next);
        this.tweens.add({
          targets: img,
          angle: this.shortestAngle(img.angle, targetDiagAngle),
          duration: halfBeat,
          ease: 'Linear',
          onComplete: () => {
            this.tweens.add({
              targets: img,
              angle: this.shortestAngle(img.angle, targetNextAngle),
              duration: halfBeat,
              ease: 'Linear',
            });
          },
        });
      }
      this.rotCurrentDir = next;
    } else {
      const sec = this.currentSection as NormalSection;
      this.playPromptAudio(sec.prompts[beat]);
    }
  }

  private playPromptAudio(dir: Direction) {
    const key = PROMPT_AUDIO_KEYS[dir];
    if (!key) return;

    this.sound.play(key);
  }

  private playStagePhaseClip() {
    if (!this.currentStageAudioKey) return;
    this.sound.play(this.currentStageAudioKey);
  }

  private getArrowAngle(dir: Direction): number {
    const isDiag = dir === 'UL' || dir === 'UR' || dir === 'DL' || dir === 'DR';
    return isDiag ? DIR_ANGLE[dir] - 45 : DIR_ANGLE[dir];
  }

  private shortestAngle(current: number, target: number): number {
    let delta = ((target - (current % 360)) + 360) % 360;
    if (delta > 180) delta -= 360;
    return current + delta;
  }

  // ---------- Check phase ----------

  private buildBeatTargets() {
    this.beatTargets = [];
    this.beatTargetPairs = [];
    if (this.isRotation) {
      const sec = this.currentSection as RotationSection;
      let cur: Direction = sec.start;
      for (let i = 0; i < 8; i++) {
        const [diag, next] = getRotationPoints(cur, sec.rotate[i]);
        this.beatTargetPairs.push([cur, diag]);
        cur = next;
      }
    } else {
      this.beatTargets = (this.currentSection as NormalSection).prompts;
    }
  }

  private checkDepth(): number {
    return Phaser.Math.Clamp(this.settings.checkDepth ?? 50, 0, Math.min(GAME_WIDTH, GAME_HEIGHT) / 2);
  }

  private isCardinal(dir: Direction): boolean {
    return dir === 'U' || dir === 'D' || dir === 'L' || dir === 'R';
  }

  private getTargetPos(dir: Direction): { x: number; y: number } {
    const d = this.checkDepth();
    const diagonalInset = 100;
    const positions: Record<Direction, { x: number; y: number }> = {
      U: { x: GAME_WIDTH / 2, y: d },
      D: { x: GAME_WIDTH / 2, y: GAME_HEIGHT - d },
      L: { x: d, y: GAME_HEIGHT / 2 },
      R: { x: GAME_WIDTH - d, y: GAME_HEIGHT / 2 },
      UL: { x: d + diagonalInset, y: d + diagonalInset },
      UR: { x: GAME_WIDTH - d - diagonalInset, y: d + diagonalInset },
      DL: { x: d + diagonalInset, y: GAME_HEIGHT - d - diagonalInset },
      DR: { x: GAME_WIDTH - d - diagonalInset, y: GAME_HEIGHT - d - diagonalInset },
    };
    return positions[dir];
  }

  private createEdgeZone(dir: Direction): Phaser.GameObjects.Rectangle {
    const d = this.checkDepth();
    const color = 0xffffff;
    const alpha = 0.16;
    if (dir === 'U') return this.add.rectangle(GAME_WIDTH / 2, d / 2, GAME_WIDTH, d, color, alpha);
    if (dir === 'D') return this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - d / 2, GAME_WIDTH, d, color, alpha);
    if (dir === 'L') return this.add.rectangle(d / 2, GAME_HEIGHT / 2, d, GAME_HEIGHT, color, alpha);
    return this.add.rectangle(GAME_WIDTH - d / 2, GAME_HEIGHT / 2, d, GAME_HEIGHT, color, alpha);
  }

  private createEdgeLine(dir: Direction): Phaser.GameObjects.Rectangle {
    const d = this.checkDepth();
    const thickness = 4;
    if (dir === 'U') return this.add.rectangle(GAME_WIDTH / 2, d, GAME_WIDTH, thickness, 0xffffff, 0.95);
    if (dir === 'D') return this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - d, GAME_WIDTH, thickness, 0xffffff, 0.95);
    if (dir === 'L') return this.add.rectangle(d, GAME_HEIGHT / 2, thickness, GAME_HEIGHT, 0xffffff, 0.95);
    return this.add.rectangle(GAME_WIDTH - d, GAME_HEIGHT / 2, thickness, GAME_HEIGHT, 0xffffff, 0.95);
  }

  private createEdgeHitFlash(dir: Direction): Phaser.GameObjects.Rectangle {
    const d = this.checkDepth();
    const color = 0xffde4a;
    if (dir === 'U') return this.add.rectangle(GAME_WIDTH / 2, d / 2, GAME_WIDTH, d, color, 0);
    if (dir === 'D') return this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - d / 2, GAME_WIDTH, d, color, 0);
    if (dir === 'L') return this.add.rectangle(d / 2, GAME_HEIGHT / 2, d, GAME_HEIGHT, color, 0);
    return this.add.rectangle(GAME_WIDTH - d / 2, GAME_HEIGHT / 2, d, GAME_HEIGHT, color, 0);
  }

  private playEdgeHitEffect(dir: Direction) {
    if (!this.isCardinal(dir)) return;

    const d = this.checkDepth();
    const thickness = 6;
    const flyRatio = 0.25;
    const flash = this.createEdgeHitFlash(dir).setDepth(7);
    const line = this.createEdgeLine(dir)
      .setDepth(8)
      .setFillStyle(0xfff1a8, 1)
      .setAlpha(1);

    const target: { x?: number; y?: number } = {};
    if (dir === 'U' || dir === 'D') {
      const startY = dir === 'U' ? d : GAME_HEIGHT - d;
      target.y = Phaser.Math.Linear(startY, GAME_HEIGHT / 2, flyRatio);
      line.setSize(GAME_WIDTH, thickness);
      line.setPosition(GAME_WIDTH / 2, startY);
    } else {
      const startX = dir === 'L' ? d : GAME_WIDTH - d;
      target.x = Phaser.Math.Linear(startX, GAME_WIDTH / 2, flyRatio);
      line.setSize(thickness, GAME_HEIGHT);
      line.setPosition(startX, GAME_HEIGHT / 2);
    }

    this.tweens.add({
      targets: flash,
      alpha: { from: 0.62, to: 0 },
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    this.tweens.add({
      targets: line,
      ...target,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => line.destroy(),
    });
  }

  private triggerShrinkForBeat(beat: number) {
    const lead = this.settings.shrinkLeadMs;
    if (this.isRotation) {
      const [first, second] = this.beatTargetPairs[beat];
      this.rotateGifCursorTo(first, this.beatMs / 2);
      this.startShrink(first, lead);
      const secondShrinkEvent = this.time.delayedCall(this.beatMs / 2, () => {
        this.rotateGifCursorTo(second, this.beatMs / 2);
        this.startShrink(second, lead);
      });
      this.shrinkStartEvents.push(secondShrinkEvent);
    } else {
      const dir = this.beatTargets[beat];
      this.rotateGifCursorTo(dir, 0);
      this.startShrink(dir, lead);
    }
  }

  private startShrink(dir: Direction, leadMs: number) {
    const cp = this.checkpoints.find(c => c.dir === dir)!;
    const outer = cp.outerCircle;
    outer.setRadius(60).setAlpha(1).setVisible(false);
    cp.edgeLine?.setAlpha(1).setVisible(false);

    const delay = Math.max(0, this.beatMs - leadMs);
    this.pendingShrinkStartCount++;
    const event = this.time.delayedCall(delay, () => {
      this.pendingShrinkStartCount = Math.max(0, this.pendingShrinkStartCount - 1);
      const id = this.nextShrinkId++;
      const active: ActiveShrink = {
        id,
        dir,
        hit: false,
        judgementTimeMs: this.time.now + leadMs,
      };
      this.activeShrinks.set(id, active);

      if (this.isCardinal(dir)) {
        cp.edgeZone?.setVisible(true).setAlpha(0.24);
        cp.edgeLine?.setVisible(true).setAlpha(1);
        const t = this.tweens.add({
          targets: [cp.edgeZone, cp.edgeLine].filter(Boolean),
          alpha: 0.45,
          duration: leadMs,
          ease: 'Linear',
          onComplete: () => this.finishShrink(id),
        });
        active.tween = t;
        this.shrinkTweens.set(id, t);
      } else {
        outer.setVisible(true);
        const t = this.tweens.add({
          targets: outer,
          radius: CHECKPOINT_RADIUS,
          duration: leadMs,
          ease: 'Linear',
          onComplete: () => this.finishShrink(id),
        });
        active.tween = t;
        this.shrinkTweens.set(id, t);
      }

      this.checkActiveHits(this.cursorWorldX, this.cursorWorldY);
    });
    this.shrinkStartEvents.push(event);
  }

  private finishShrink(id: number) {
    const active = this.activeShrinks.get(id);
    if (!active) return;

    if (!active.hit) this.onMiss(active.dir);

    this.activeShrinks.delete(id);
    this.shrinkTweens.delete(id);
    if (!this.hasActiveShrinkForDir(active.dir)) {
      const cp = this.checkpoints.find(c => c.dir === active.dir)!;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
      cp.edgeZone?.setAlpha(0.16);
      cp.edgeLine?.setAlpha(1).setVisible(false);
    }
  }

  private stopAllShrinks() {
    for (const event of this.shrinkStartEvents) event.remove(false);
    this.shrinkStartEvents = [];
    for (const t of this.shrinkTweens.values()) t.stop();
    this.shrinkTweens.clear();
    this.activeShrinks.clear();
    this.pendingShrinkStartCount = 0;
    this.falseTouchedLines.clear();
    this.penaltyCooldownUntil = 0;
    this.cursorGifAngleTween?.stop();
    for (const cp of this.checkpoints) {
      if (!cp.outerCircle.active || !cp.outerCircle.geom) continue;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
      cp.edgeZone?.setAlpha(0.16).setVisible(false);
      cp.edgeLine?.setAlpha(1).setVisible(false);
    }
  }

  // ---------- Input ----------

  private onMouseMove(ptr: Phaser.Input.Pointer) {
    this.updateCursorPosition(ptr.x, ptr.y);
  }

  private getCursorPosition(): { x: number; y: number } {
    return { x: this.cursorWorldX, y: this.cursorWorldY };
  }

  private updateCursorPosition(x: number, y: number) {
    this.cursorWorldX = x;
    this.cursorWorldY = y;

    if (this.gamePhase === 'prompt') this.positionPromptGrid(x, y);
    this.updateGifCursorPosition(x, y);
    this.drawHitbox(x, y);

    if (this.gamePhase !== 'check' || this.isPaused) return;
    this.checkActiveHits(x, y);
  }

  private drawHitbox(x: number, y: number) {
    this.hitboxGraphics.clear();
    if ((this.gamePhase === 'prompt' || this.gamePhase === 'check') && !this.isPaused) {
      this.hitboxGraphics.lineStyle(2, 0xffffff, 1);
      this.hitboxGraphics.strokeRect(x - this.settings.hitboxWidth / 2, y - this.settings.hitboxHeight / 2, this.settings.hitboxWidth, this.settings.hitboxHeight);
    }
  }

  private getHitboxRect(mx: number, my: number): HitboxRect {
    const hw = this.settings.hitboxWidth / 2;
    const hh = this.settings.hitboxHeight / 2;
    return {
      left: mx - hw,
      right: mx + hw,
      top: my - hh,
      bottom: my + hh,
      centerX: mx,
      centerY: my,
    };
  }

  private getCursorCheckPoint() {
    this.refreshGifCursorMetrics();

    const angleRad = (this.cursorGifAngle.value * Math.PI) / 180;
    const localY = Math.max(0, this.cursorHeight / 2 - CURSOR_CHECK_POINT_EDGE_INSET_PX);
    const offsetX = -Math.sin(angleRad) * localY;
    const offsetY = Math.cos(angleRad) * localY;
    const screenX = this.cursorWorldX * this.cursorScaleX + offsetX;
    const screenY = this.cursorWorldY * this.cursorScaleY + offsetY;

    return {
      screenX,
      screenY,
      clientX: this.cursorCanvasLeft + screenX,
      clientY: this.cursorCanvasTop + screenY,
      worldX: screenX / this.cursorScaleX,
      worldY: screenY / this.cursorScaleY,
    };
  }

  private updateCursorCheckPointDot() {
    if (!this.cursorCheckPointDot) return;
    const point = this.getCursorCheckPoint();
    this.cursorCheckPointDot.style.transform = `translate3d(${point.clientX}px, ${point.clientY}px, 0) translate(-50%, -50%)`;
  }

  private isCursorDomBlockingCheckPoint(): boolean {
    if (!this.cursorClipFrame || !this.cursorGifFrame || !this.cursorGif) return false;
    return this.cursorClipFrame.style.display !== 'none'
      && this.cursorGifFrame.style.display !== 'none'
      && this.cursorWidth > 0
      && this.cursorHeight > 0;
  }

  private isOutsideGameBounds(x: number, y: number): boolean {
    return x < 0 || x > GAME_WIDTH || y < 0 || y > GAME_HEIGHT;
  }

  private getClosestCardinalLine(x: number, y: number): Direction {
    const distances: Array<{ dir: Direction; distance: number }> = [
      { dir: 'U', distance: Math.abs(y) },
      { dir: 'D', distance: Math.abs(y - GAME_HEIGHT) },
      { dir: 'L', distance: Math.abs(x) },
      { dir: 'R', distance: Math.abs(x - GAME_WIDTH) },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return distances[0].dir;
  }

  private checkActiveHits(x: number, y: number) {
    const hits: ActiveShrink[] = [];

    for (const active of this.activeShrinks.values()) {
      if (!active.hit && this.isWithinPerfectWindow(active) && this.checkHit(x, y, active.dir)) {
        hits.push(active);
      }
    }

    if (hits.length > 0) {
      for (const active of hits) {
        this.resolvePerfect(active);
      }
      return;
    }

    this.checkFalseTouches(x, y);
  }

  private isWithinPerfectWindow(active: ActiveShrink): boolean {
    const windowMs = Math.max(0, this.settings.perfectJudgeWindowMs ?? 0);
    return Math.abs(this.time.now - active.judgementTimeMs) <= windowMs;
  }

  private checkFalseTouches(x: number, y: number) {
    if (this.activeShrinks.size === 0) {
      this.falseTouchedLines.clear();
      return;
    }

    if (this.isPenaltyCooldownActive()) {
      this.falseTouchedLines.clear();
      return;
    }

    const rect = this.getHitboxRect(x, y);
    const touchedLines = this.getTouchedCardinalLines(rect);
    const allowedLines = this.getAllowedCardinalLines();
    const currentFalseTouches = new Set<Direction>();

    for (const line of touchedLines) {
      if (allowedLines.has(line)) continue;

      currentFalseTouches.add(line);
      if (!this.falseTouchedLines.has(line)) {
        this.onFalseTouch(line);
      }
    }

    this.falseTouchedLines = currentFalseTouches;
  }

  private getTouchedCardinalLines(rect: HitboxRect): Direction[] {
    const d = this.checkDepth();
    const touched: Direction[] = [];
    if (rect.top <= d) touched.push('U');
    if (rect.bottom >= GAME_HEIGHT - d) touched.push('D');
    if (rect.left <= d) touched.push('L');
    if (rect.right >= GAME_WIDTH - d) touched.push('R');
    return touched;
  }

  private getAllowedCardinalLines(): Set<Direction> {
    const allowed = new Set<Direction>();
    let hasDiagonal = false;
    for (const active of this.activeShrinks.values()) {
      for (const line of this.getCardinalLinesForDir(active.dir)) {
        allowed.add(line);
      }
      if (!this.isCardinal(active.dir)) hasDiagonal = true;
    }
    if (hasDiagonal) {
      for (const dir of CARDINAL_DIRS) allowed.add(dir);
    }
    return allowed;
  }

  private getCardinalLinesForDir(dir: Direction): Direction[] {
    if (dir === 'UL') return ['U', 'L'];
    if (dir === 'UR') return ['U', 'R'];
    if (dir === 'DL') return ['D', 'L'];
    if (dir === 'DR') return ['D', 'R'];
    return CARDINAL_DIRS.includes(dir) ? [dir] : [];
  }

  private isPenaltyCooldownActive(): boolean {
    return this.time.now < this.penaltyCooldownUntil;
  }

  private setGifCursorVisible(visible: boolean) {
    if (!this.cursorClipFrame || !this.cursorGifFrame) return;

    this.cursorClipFrame.style.display = visible ? 'block' : 'none';
    this.cursorGifFrame.style.display = visible ? 'block' : 'none';
    if (this.cursorCheckPointDot) {
      this.cursorCheckPointDot.style.display = visible ? 'block' : 'none';
    }
    if (visible) {
      this.updateGifCursorPosition(this.cursorWorldX, this.cursorWorldY);
      this.updateCursorCheckPointDot();
    }
  }

  private updateGifCursorPosition(x: number, y: number) {
    if (!this.cursorClipFrame || !this.cursorGifFrame || !this.cursorGif) return;
    if (this.cursorWidth === 0 || this.cursorHeight === 0) {
      this.refreshGifCursorMetrics();
    }
    if (x === this.lastCursorX && y === this.lastCursorY) return;

    this.lastCursorX = x;
    this.lastCursorY = y;
    const screenX = x * this.cursorScaleX;
    const screenY = y * this.cursorScaleY;
    this.cursorGifFrame.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`;
    this.updateCursorCheckPointDot();
  }

  private rotateGifCursorTo(dir: Direction, duration: number) {
    const targetAngle = DIR_ANGLE[dir];
    this.cursorGifAngleTween?.stop();

    if (duration <= 0) {
      this.cursorGifAngle.value = this.shortestAngle(this.cursorGifAngle.value, targetAngle);
      this.setGifCursorAngle(this.cursorGifAngle.value);
      return;
    }

    this.cursorGifAngle.value = this.cursorGifAngle.value % 360;
    this.cursorGifAngleTween = this.tweens.add({
      targets: this.cursorGifAngle,
      value: this.shortestAngle(this.cursorGifAngle.value, targetAngle),
      duration,
      ease: 'Linear',
      onUpdate: () => this.setGifCursorAngle(this.cursorGifAngle.value),
      onComplete: () => this.setGifCursorAngle(this.cursorGifAngle.value),
    });
  }

  private setGifCursorAngle(angle: number) {
    if (!this.cursorGif) return;
    if (angle === this.lastCursorAngle) return;
    this.lastCursorAngle = angle;
    this.cursorGif.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    this.updateCursorCheckPointDot();
  }

  private checkHit(mx: number, my: number, dir: Direction): boolean {
    void mx;
    void my;
    if (!this.isCursorDomBlockingCheckPoint()) return false;

    const point = this.getCursorCheckPoint();
    if (!this.isOutsideGameBounds(point.worldX, point.worldY)) return false;

    if (dir === 'U' || dir === 'D' || dir === 'L' || dir === 'R') {
      return this.getClosestCardinalLine(point.worldX, point.worldY) === dir;
    }
    if (dir === 'UL') return point.worldY < 0 && point.worldX < 0;
    if (dir === 'UR') return point.worldY < 0 && point.worldX > GAME_WIDTH;
    if (dir === 'DL') return point.worldY > GAME_HEIGHT && point.worldX < 0;
    if (dir === 'DR') return point.worldY > GAME_HEIGHT && point.worldX > GAME_WIDTH;
    return false;
  }

  private getInnerSquareDirectionPos(dir: Direction): { x: number; y: number } {
    const maxInset = Math.min(GAME_WIDTH, GAME_HEIGHT) / 2 - 10;
    const inset = Phaser.Math.Clamp(this.checkDepth() + 100, 0, maxInset);
    const left = inset;
    const right = GAME_WIDTH - inset;
    const top = inset;
    const bottom = GAME_HEIGHT - inset;

    const positions: Record<Direction, { x: number; y: number }> = {
      U: { x: GAME_WIDTH / 2, y: top },
      UR: { x: right, y: top },
      R: { x: right, y: GAME_HEIGHT / 2 },
      DR: { x: right, y: bottom },
      D: { x: GAME_WIDTH / 2, y: bottom },
      DL: { x: left, y: bottom },
      L: { x: left, y: GAME_HEIGHT / 2 },
      UL: { x: left, y: top },
    };

    return positions[dir];
  }

  private getJudgementPos(dir: Direction): { x: number; y: number } {
    return this.getInnerSquareDirectionPos(dir);
  }

  private resolvePerfect(active: ActiveShrink) {
    active.hit = true;
    active.tween?.stop();
    this.activeShrinks.delete(active.id);
    this.shrinkTweens.delete(active.id);

    if (!this.hasActiveShrinkForDir(active.dir)) {
      const cp = this.checkpoints.find(c => c.dir === active.dir)!;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
      cp.edgeZone?.setAlpha(0.16);
      cp.edgeLine?.setAlpha(1).setVisible(false);
    }
    this.onPerfect(active.dir);
  }

  private hasActiveShrinkForDir(dir: Direction): boolean {
    for (const active of this.activeShrinks.values()) {
      if (active.dir === dir) return true;
    }
    return false;
  }

  private onPerfect(dir: Direction) {
    this.penaltyCooldownUntil = this.time.now + this.beatMs;
    this.falseTouchedLines.clear();
    this.perfectCount++;
    this.sound.play('clap');
    this.updateJudgementText();
    this.lifeValue = Math.min(100, this.lifeValue + 4);
    this.drawLifeBar();
    this.playEdgeHitEffect(dir);
    this.showJudgement(dir, 'perfect', '#7cff8f');
    this.flashOverlay.setAlpha(0.35);
    this.tweens.add({ targets: this.flashOverlay, alpha: 0, duration: 180, ease: 'Linear' });
  }

  private onMiss(dir: Direction) {
    this.missCount++;
    this.sound.play('miss');
    this.updateJudgementText();
    this.lifeValue = Math.max(0, this.lifeValue - 20);
    this.drawLifeBar();
    this.showJudgement(dir, 'miss', '#ff5a6b');
    if (this.lifeValue <= 0) this.triggerGameOver();
  }

  private onFalseTouch(dir: Direction) {
    this.falseTouchCount++;
    this.updateJudgementText();
    this.lifeValue = Math.max(0, this.lifeValue - FALSE_TOUCH_DAMAGE);
    this.drawLifeBar();
    this.showJudgement(dir, 'X', '#ffb14a');
    if (this.lifeValue <= 0) this.triggerGameOver();
  }

  private showJudgement(dir: Direction, label: 'perfect' | 'miss' | 'X', color: string) {
    const pos = this.getJudgementPos(dir);
    this.refreshGifCursorMetrics();

    if (!this.cursorClipFrame) return;

    const text = document.createElement('div');
    const baseFontSize = label === 'perfect' ? 34 : 30;
    const fontScale = Math.min(this.cursorScaleX, this.cursorScaleY);
    text.textContent = label;
    text.style.position = 'absolute';
    text.style.left = `${pos.x * this.cursorScaleX}px`;
    text.style.top = `${(pos.y - 48) * this.cursorScaleY}px`;
    text.style.pointerEvents = 'none';
    text.style.zIndex = '30';
    text.style.color = color;
    text.style.fontSize = `${baseFontSize * fontScale}px`;
    text.style.fontWeight = '700';
    text.style.fontFamily = "system-ui, 'Segoe UI', Roboto, sans-serif";
    text.style.lineHeight = '1';
    text.style.whiteSpace = 'nowrap';
    text.style.webkitTextStroke = `${5 * fontScale}px #111118`;
    text.style.paintOrder = 'stroke fill';
    text.style.transformOrigin = 'center center';
    text.style.willChange = 'transform, opacity';
    this.cursorClipFrame.appendChild(text);

    const state = {
      y: pos.y - 48,
      alpha: 0,
      scale: 1,
    };
    const render = () => {
      text.style.top = `${state.y * this.cursorScaleY}px`;
      text.style.opacity = `${state.alpha}`;
      text.style.transform = `translate(-50%, -50%) scale(${state.scale})`;
    };
    render();

    this.tweens.add({
      targets: state,
      y: state.y - 28,
      alpha: 1,
      scale: label === 'perfect' ? 1.14 : 1,
      duration: 120,
      ease: 'Quad.easeOut',
      onUpdate: render,
      onComplete: () => {
        this.tweens.add({
          targets: state,
          y: state.y - 18,
          alpha: 0,
          duration: 420,
          ease: 'Quad.easeIn',
          onUpdate: render,
          onComplete: () => text.remove(),
        });
      },
    });
  }

  private triggerGameOver() {
    this.beatTimer?.remove();
    this.stopAllShrinks();
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.hitboxGraphics.clear();
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.add.text(cx, cy - 40, 'GAME OVER', { fontSize: '64px', color: '#ff4444' }).setOrigin(0.5).setDepth(200);
    this.add.text(cx, cy + 40, '按任意鍵繼續', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5).setDepth(200);
    this.input.keyboard!.once('keydown', () => this.scene.start('MenuScene'));
    this.input.once('pointerdown', () => this.scene.start('MenuScene'));
  }

  // ---------- Pause ----------

  private setGameplayTimersPaused(paused: boolean) {
    if (this.beatTimer) this.beatTimer.paused = paused;
    for (const event of this.shrinkStartEvents) event.paused = paused;
    for (const tween of this.shrinkTweens.values()) {
      if (paused) {
        tween.pause();
      } else {
        tween.resume();
      }
    }
    if (this.cursorGifAngleTween) {
      if (paused) {
        this.cursorGifAngleTween.pause();
      } else {
        this.cursorGifAngleTween.resume();
      }
    }
  }

  private returnToMenu() {
    this.isPaused = false;
    this.setGameplayTimersPaused(false);
    this.input.setDefaultCursor('default');
    this.setGifCursorVisible(false);
    this.pauseContainer.setVisible(false);
    this.countdownText.setVisible(false);
    this.beatTimer?.remove(false);
    this.stopAllShrinks();
    this.time.delayedCall(0, () => this.scene.start('MenuScene'));
  }

  private onEsc() {
    if (this.isPaused) return;
    this.isPaused = true;
    this.setGameplayTimersPaused(true);
    this.pauseContainer.setVisible(true);
    this.setGifCursorVisible(false);
    this.input.setDefaultCursor('default');
  }

  private resumeWithCountdown() {
    this.pauseContainer.setVisible(false);
    this.countdownText.setVisible(true);
    let count = 3;
    const tick = () => {
      if (count > 0) {
        this.countdownText.setText(String(count));
        count--;
        this.time.delayedCall(this.beatMs, tick);
      } else {
        this.countdownText.setVisible(false);
        this.isPaused = false;
        this.setGameplayTimersPaused(false);
        this.input.setDefaultCursor('none');
        this.setGifCursorVisible(this.gamePhase === 'check');
      }
    };
    tick();
  }

  update() {
    if (this.gamePhase === 'check' && !this.isPaused) {
      this.checkActiveHits(this.cursorWorldX, this.cursorWorldY);
    }
    if (this.settings.debugMode) this.drawEllipse();
  }
}
