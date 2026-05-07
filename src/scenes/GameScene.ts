import Phaser from 'phaser';
import suto400GifUrl from '../assets/suto400_2x.gif';
import gameoverBgUrl from '../assets/gameover.png';
import loadingImageUrl from '../assets/loading.png';
import samVideoUrl from '../assets/mp4/sam.mp4';
import endingVideo1Url from '../assets/end1-1.mp4';
import endingVideo2Url from '../assets/end1-2.mp4';
import endingDUrl from '../assets/D.mp4';
import endingCUrl from '../assets/C.mp4';
import endingBUrl from '../assets/B.mp4';
import promptDUrl from '../assets/audio/D.wav';
import promptLUrl from '../assets/audio/L.wav';
import promptRUrl from '../assets/audio/R.wav';
import promptUUrl from '../assets/audio/U.wav';
import clapUrl from '../assets/audio/clap.wav';
import missUrl from '../assets/audio/miss.wav';
import storyCheckStartUrl from '../assets/audio/short/suto.wav';
import gameoverSfxUrl from '../assets/audio/long/gameover.wav';
import stage120Url from '../assets/audio/120.wav';
import {
  DEFAULT_SETTINGS,
  GAME_WIDTH, GAME_HEIGHT,
  DIR_ANGLE,
  getRotationPoints,
} from '../config';
import type { GameSettings, Direction } from '../config';
import { HTML_LAYER, CURSOR_SUBLAYER, SCENE_LAYER } from '../layers';
import { LEVEL_DATA } from '../levels';
import type { Stage, Section, NormalSection, RotationSection, DelaySection, LevelData } from '../levels';
import { GameSceneDebugController } from './debug/GameSceneDebugController';
import type { DebugEndingPreset } from './debug/GameSceneDebugController';

const ALL_DIRS: Direction[] = ['w', 'e', 'd', 'c', 'x', 'z', 'a', 'q'];
const CARDINAL_DIRS: Direction[] = ['w', 'x', 'a', 'd'];
const CHECKPOINT_RADIUS = 18;
const CURSOR_CHECK_POINT_DOT_SIZE = 10;
const CURSOR_CHECK_POINT_EDGE_INSET_PX = 2;
const GAME_FRAME_INSET_X = 96;
const GAME_FRAME_INSET_Y = 54;
const GAME_FRAME_LEFT = GAME_FRAME_INSET_X;
const GAME_FRAME_RIGHT = GAME_WIDTH - GAME_FRAME_INSET_X;
const GAME_FRAME_TOP = GAME_FRAME_INSET_Y;
const GAME_FRAME_BOTTOM = GAME_HEIGHT - GAME_FRAME_INSET_Y;
const GAME_FRAME_WIDTH = GAME_FRAME_RIGHT - GAME_FRAME_LEFT;
const GAME_FRAME_HEIGHT = GAME_FRAME_BOTTOM - GAME_FRAME_TOP;
const FALSE_TOUCH_DAMAGE = 5;
const MISS_DAMAGE = 5;
const DEFAULT_STAGE_AUDIO_CLIP = 'src/assets/audio/120.wav';
const HIT_SPARK_TEXTURE_KEY = 'hit_spark';
const PROMPT_AUDIO_GAP_MS = 50;
const PROMPT_AUDIO_KEYS: Partial<Record<Direction, string>> = {
  w: 'prompt_U',
  x: 'prompt_D',
  a: 'prompt_L',
  d: 'prompt_R',
};
const BUTTON_EFFECT_REQUIRED_CLICKS = 10;
const BUTTON_EFFECT_SCALE_STEP = 0.04;
const ENDING_RETURN_COOLDOWN_MS = 1000;
const DEFAULT_DELAY_TEXT_COLOR = '#37ff55';

type GameMode = 'challenge' | 'story';

const getStageAudioKey = (clipPath: string): string => `stage_audio_${clipPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
const getCustomImageKey = (imgPath: string): string => `custom_img_${imgPath.replace(/[^a-zA-Z0-9]/g, '_')}`;

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
  cornerLine?: Phaser.GameObjects.Line;
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
  private mode: GameMode = 'challenge';
  private levelData: LevelData = LEVEL_DATA;
  private settings!: GameSettings;
  private stageIndex!: number;
  private currentStage!: Stage;
  private currentStageAudioKey: string | null = null;
  private currentStageAudio?: Phaser.Sound.BaseSound;
  private promptAudioSound?: Phaser.Sound.BaseSound;
  private promptAudioEvents: Phaser.Time.TimerEvent[] = [];
  private promptAudioSequenceId = 0;
  private sectionIndex = 0;
  private sectionRepeatIteration = 1;
  private currentSection!: Section;
  private storySamVideoRoot?: HTMLDivElement;
  private storySamVideo?: HTMLVideoElement;
  private endingVideoRoot?: HTMLDivElement;
  private endingVideo?: HTMLVideoElement;
  private endingSummaryCard?: HTMLDivElement;
  private endingPromptText?: HTMLDivElement;
  private endingReturnReady = false;
  private endingSequenceStarted = false;
  private endingReturnReadyEvent?: Phaser.Time.TimerEvent;
  private endingKeyHandler?: (event: KeyboardEvent) => void;
  private endingPointerHandler?: (event: PointerEvent) => void;
  private endingMouseHandler?: (event: MouseEvent) => void;
  private endingTouchHandler?: (event: TouchEvent) => void;
  private debugController?: GameSceneDebugController;
  private readonly endingRootAttr = 'data-suto-ending-root';
  private readonly endingPromptAttr = 'data-suto-ending-prompt';
  private readonly refreshStorySamVideoBounds = () => {
    if (!this.storySamVideoRoot) return;
    const rect = this.game.canvas.getBoundingClientRect();
    this.storySamVideoRoot.style.left = `${rect.left}px`;
    this.storySamVideoRoot.style.top = `${rect.top}px`;
    this.storySamVideoRoot.style.width = `${rect.width}px`;
    this.storySamVideoRoot.style.height = `${rect.height}px`;
  };
  private readonly refreshEndingVideoBounds = () => {
    if (!this.endingVideoRoot) return;
    const rect = this.game.canvas.getBoundingClientRect();
    this.endingVideoRoot.style.left = `${rect.left}px`;
    this.endingVideoRoot.style.top = `${rect.top}px`;
    this.endingVideoRoot.style.width = `${rect.width}px`;
    this.endingVideoRoot.style.height = `${rect.height}px`;
  };

  // Timing
  private beatMs = 500;
  private beatCount = 0;
  // Cumulative absolute time the current section should end at, so frame jitter
  // from delayedCall doesn't compound across sections.
  private sectionTargetEndTimeMs: number | null = null;
  private gamePhase: 'prompt' | 'check' = 'prompt';

  // UI
  private checkpoints: CheckpointUI[] = [];
  private hitboxGraphics!: Phaser.GameObjects.Graphics;
  private cursorClipFrame!: HTMLDivElement;
  private cursorGifFrame!: HTMLDivElement;
  private cursorGif!: HTMLImageElement;
  private cursorGifBorder!: HTMLDivElement;
  private cursorCheckPointDot!: HTMLDivElement;
  private gameFrameMask: HTMLDivElement[] = [];
  private suppressGameFrameMask = false;
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
    this.refreshGameFrameMask(rect);

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
  private delayText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private beatTimer!: Phaser.Time.TimerEvent;

  // Prompt phase
  private isRotation = false;
  private rotCurrentDir: Direction = 'w';
  private promptImages: Phaser.GameObjects.Image[] = [];
  private promptIndicator?: Phaser.GameObjects.Rectangle;
  private promptIndicatorTween?: Phaser.Tweens.Tween;
  private promptRotationAngle = { value: 180 };
  private promptRotationTween?: Phaser.Tweens.Tween;
  private promptCellCenters: Array<{ x: number; y: number }> = [];
  private promptCellWidth = 0;
  private promptCellHeight = 0;
  private promptIndicatorSize = 0;

  // Button effect
  private isButtonEffectActive = false;
  private buttonEffectClicks = 0;
  private buttonEffectContainer?: Phaser.GameObjects.Container;
  private buttonEffectRect?: Phaser.GameObjects.Rectangle;
  private buttonEffectProgress?: Phaser.GameObjects.Text;
  private buttonEffectLabel?: Phaser.GameObjects.Text;
  private buttonEffectCountdownRing?: Phaser.GameObjects.Graphics;
  private buttonEffectCountdownText?: Phaser.GameObjects.Text;
  private buttonEffectCountdownTween?: Phaser.Tweens.Tween;
  private buttonEffectCountdownDurationMs = 0;
  private readonly buttonEffectCountdownState = { value: 1 };
  private buttonEffectCanReachA = false;

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
  private isGameOver = false;
  private pauseContainer!: Phaser.GameObjects.Container;
  private countdownText!: Phaser.GameObjects.Text;

  // Flash
  private flashOverlay!: Phaser.GameObjects.Rectangle;

  // Pre-stage loading overlay (covers screen during prewarmStageAudio so the
  // ~800ms WebAudio cold-start consumption is hidden as a transition).
  private loadingOverlayRect?: Phaser.GameObjects.Rectangle;
  private loadingOverlayImage?: Phaser.GameObjects.Image;
  private pendingDebugEndingPreset?: DebugEndingPreset;

  constructor() {
    super('GameScene');
  }

  init(data: { settings: GameSettings; stageIndex: number; mode?: GameMode; levelData?: LevelData; debugEndingPreset?: DebugEndingPreset }) {
    this.settings = data.settings;
    this.stageIndex = data.stageIndex ?? 0;
    this.mode = data.mode ?? 'challenge';
    this.levelData = data.levelData ?? LEVEL_DATA;
    this.pendingDebugEndingPreset = data.debugEndingPreset;
  }

  preload() {
    this.load.image('down', 'src/assets/down.png');
    this.load.image('down_left', 'src/assets/down_left.png');
    this.load.image('gameover_bg', gameoverBgUrl);
    this.load.image('loading_overlay', loadingImageUrl);
    this.load.audio('prompt_U', promptUUrl);
    this.load.audio('prompt_D', promptDUrl);
    this.load.audio('prompt_L', promptLUrl);
    this.load.audio('prompt_R', promptRUrl);
    this.load.audio('clap', clapUrl);
    this.load.audio('miss', missUrl);
    this.load.audio('story_check_start', storyCheckStartUrl);
    this.load.audio('gameover_sfx', gameoverSfxUrl);

    const customSectionImages = new Set(
      this.levelData.stages.flatMap(stage =>
        stage.sections
          .filter((sec): sec is NormalSection => sec.type === 'normal' && Boolean((sec as NormalSection).image))
          .map(sec => sec.image as string),
      ),
    );
    for (const imgPath of customSectionImages) {
      this.load.image(getCustomImageKey(imgPath), imgPath);
    }

    const stageAudioClips = new Set(
      this.levelData.stages
        .map(stage => stage.audio_clip)
        .filter((clipPath): clipPath is string => Boolean(clipPath)),
    );
    for (const clipPath of stageAudioClips) {
      this.load.audio(getStageAudioKey(clipPath), resolveStageAudioClipUrl(clipPath));
    }
  }

  create() {
    this.applyMasterVolume();
    this.isGameOver = false;
    this.endingSequenceStarted = false;
    this.suppressGameFrameMask = false;
    this.loadStage(this.stageIndex);
    this.sectionIndex = 0;
    this.sectionRepeatIteration = 1;
    this.lifeValue = 100;
    this.perfectCount = 0;
    this.missCount = 0;
    this.falseTouchCount = 0;
    this.sectionTargetEndTimeMs = null;
    this.shrinkTweens.clear();
    this.debugController = new GameSceneDebugController({
      scene: this,
      onSelectEndingPreset: (preset) => this.applyEndingPreviewPreset(preset),
    });

    this.hitboxGraphics = this.add.graphics().setDepth(SCENE_LAYER.HITBOX_DEBUG);
    this.createHUD();
    this.createLifeBar();
    this.createCheckpoints();
    this.createHitSparkTexture();
    this.createCursors();
    this.createPauseMenu();
    this.createStorySamVideo();
    this.flashOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(SCENE_LAYER.FLASH_OVERLAY);

    this.setCheckpointsVisible(false);

    this.input.keyboard!.on('keydown-ESC', () => this.onEsc());
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => this.onMouseMove(ptr));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupScene());

    if (this.pendingDebugEndingPreset) {
      const preset = this.pendingDebugEndingPreset;
      this.pendingDebugEndingPreset = undefined;
      this.time.delayedCall(0, () => {
        this.debugController?.triggerEndingPreset(preset);
      });
      return;
    }

    if (this.mode === 'story') {
      this.time.delayedCall(this.settings.storyStartDelayMs, () => this.startSection());
    } else {
      this.showLoadingOverlay();
      this.prewarmStageAudio().then(() => {
        this.hideLoadingOverlay();
        if (this.isGameOver || !this.scene.isActive()) return;
        this.startSection();
      });
    }
  }

  // Phaser/WebAudio's first few plays of a buffer at a given playbackRate have
  // a cold-start that halves each call (~233ms → ~117ms → ~58ms in challenge
  // mode). With section duration sized exactly to 16 beats, that cold-start
  // cuts up to 1 beat off rep 1 and 0.5 beat off rep 2 of each rate.
  //
  // The cold-start appears to be per-rate (rate=1 sections feel fine, rate≠1
  // sections don't), so prewarm every unique rate the stage uses with silent
  // plays. We have to actually wait long enough for those warmups to begin
  // running through their cold-start before letting the real section start —
  // an earlier fire-and-forget version of this didn't, and the cold-start was
  // still hitting the first real play.
  private prewarmStageAudio(): Promise<void> {
    if (!this.currentStageAudioKey || this.mode !== 'challenge') return Promise.resolve();
    const baseBpm = this.currentStage?.bpm ?? 0;
    if (baseBpm <= 0) return Promise.resolve();

    const rates = new Set<number>();
    for (const section of this.currentStage.sections) {
      if (section.type === 'delay') continue;
      const sectionBpm = (section as NormalSection | RotationSection).bpm ?? baseBpm;
      if (sectionBpm <= 0) continue;
      rates.add(Phaser.Math.Clamp(sectionBpm / baseBpm, 0.25, 4));
    }
    rates.delete(1);
    if (rates.size === 0) return Promise.resolve();

    const warmups: Phaser.Sound.BaseSound[] = [];
    for (const rate of rates) {
      for (let i = 0; i < 3; i++) {
        const warmup = this.sound.add(this.currentStageAudioKey);
        warmup.play({ volume: 0, rate });
        warmups.push(warmup);
      }
    }

    // 800ms is enough to cover the 233+117+58ms halving sequence with margin.
    return new Promise<void>(resolve => {
      this.time.delayedCall(800, () => {
        for (const w of warmups) {
          if (w.isPlaying) w.stop();
          w.destroy();
        }
        resolve();
      });
    });
  }

  private loadStage(index: number) {
    this.currentStage = this.levelData.stages[index];
    this.sectionRepeatIteration = 1;
    this.beatMs = 60000 / this.currentStage.bpm;
    this.currentStageAudioKey = this.currentStage.audio_clip ? getStageAudioKey(this.currentStage.audio_clip) : null;
    this.debugController?.updateMetrics();
  }

  private getSectionRepeat(section: Section): number {
    if (section.type === 'delay') return 1;
    const rawRepeat = section.repeat ?? 1;
    if (!Number.isFinite(rawRepeat)) return 1;
    return Math.max(1, Math.floor(rawRepeat));
  }

  private createHUD() {
    const cx = GAME_WIDTH / 2;
    this.stageText = this.add.text(cx, GAME_FRAME_TOP + 18, '', { fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(SCENE_LAYER.HUD);
    this.roundText = this.add.text(cx, GAME_FRAME_TOP + 52, '', { fontSize: '20px', color: '#cccccc' }).setOrigin(0.5, 0).setDepth(SCENE_LAYER.HUD);
    this.delayText = this.add.text(cx, GAME_HEIGHT / 4, '', {
      fontSize: '80px',
      color: DEFAULT_DELAY_TEXT_COLOR,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 520 },
    }).setOrigin(0.5, 0.5).setDepth(SCENE_LAYER.HUD).setVisible(false);
    this.judgementText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', { fontSize: '22px', color: '#ffffff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0.5).setDepth(SCENE_LAYER.HUD);
    this.debugController?.createHud();
    this.updateHUD();
    this.updateJudgementText();
    this.debugController?.updateMetrics();
  }

  private applyEndingPreviewPreset(preset: DebugEndingPreset) {
    if (this.endingSequenceStarted || this.isGameOver) return;

    this.perfectCount = preset.perfect;
    this.missCount = preset.miss;
    this.falseTouchCount = preset.falseTouch;
    this.lifeValue = Phaser.Math.Clamp(preset.life, 0, 100);
    this.updateJudgementText();
    this.drawLifeBar();

    this.playEndingPreviewSequence();
  }

  private playEndingPreviewSequence() {
    if (this.endingSequenceStarted || this.isGameOver) return;
    this.endingSequenceStarted = true;
    this.debugController?.hideEndingOverlay();

    this.isPaused = false;
    this.clearButtonEffectUI();
    this.input.setDefaultCursor('default');
    this.pauseContainer?.setVisible(false);
    this.countdownText?.setVisible(false);
    this.beatTimer?.remove(false);
    this.promptRotationTween?.stop();
    this.stopAllShrinks();
    this.clearPromptGrid();
    this.stopStagePhaseClip();
    this.stopPromptAudioSequence();
    this.removeStorySamVideo();
    this.sound.stopAll();
    this.suppressGameFrameMask = true;
    this.setGameFrameMaskVisible(false);
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.hitboxGraphics.clear();

    const { rank: _previewRank } = this.buildEndingSummary();
    const _previewVideoUrl = _previewRank === 'D' ? endingDUrl : _previewRank === 'C' ? endingCUrl : _previewRank === 'B' ? endingBUrl : endingVideo2Url;
    this.playEndingVideoWithSummaryAndReturn(_previewVideoUrl).catch(() => {
      this.removeEndingVideoOverlay();
      this.returnToMenu();
    });
  }

  private getCurrentBpm(): number {
    if (this.currentSection?.type !== 'delay' && this.currentSection?.bpm != null) {
      return this.currentSection.bpm;
    }
    return this.currentStage?.bpm ?? 0;
  }

  private getStageAudioPlaybackRate(): number {
    if (this.mode !== 'challenge') return 1;
    const baseBpm = this.currentStage?.bpm ?? 0;
    const targetBpm = this.getCurrentBpm();
    if (baseBpm <= 0 || targetBpm <= 0) return 1;
    return Phaser.Math.Clamp(targetBpm / baseBpm, 0.25, 4);
  }

  private setDelayText(text?: string, color?: string) {
    const content = text?.trim() ?? '';
    const resolvedColor = color?.trim() || DEFAULT_DELAY_TEXT_COLOR;
    this.delayText.setText(content);
    this.delayText.setColor(resolvedColor);
    this.delayText.setVisible(content.length > 0);
  }

  private updateHUD() {
    this.stageText.setText(`Stage ${this.currentStage.stage_number}`);
    const { current, total } = this.getPhaseProgress();
    this.roundText.setText(`${current}/${total}`);
  }

  private getPhaseProgress() {
    let total = 0;
    let current = 0;

    for (let stageIdx = 0; stageIdx < this.levelData.stages.length; stageIdx++) {
      const stage = this.levelData.stages[stageIdx];
      for (let sectionIdx = 0; sectionIdx < stage.sections.length; sectionIdx++) {
        const section = stage.sections[sectionIdx];
        if (section.type === 'delay') continue;

        const repeat = this.getSectionRepeat(section);
        total += repeat;

        if (stageIdx < this.stageIndex) {
          current += repeat;
          continue;
        }

        if (stageIdx === this.stageIndex) {
          if (sectionIdx < this.sectionIndex) {
            current += repeat;
            continue;
          }

          if (sectionIdx === this.sectionIndex) {
            current += Math.min(this.sectionRepeatIteration, repeat);
          }
        }
      }
    }

    if (total === 0) return { current: 0, total: 0 };

    return { current, total };
  }

  private updateJudgementText() {
    this.judgementText.setText([
      `Perfect ${this.perfectCount}`,
      `Miss ${this.missCount}`,
      `X ${this.falseTouchCount}`,
    ]);
  }

  private createLifeBar() {
    this.lifeBar = this.add.graphics().setDepth(SCENE_LAYER.HUD);
    this.drawLifeBar();
  }

  private drawLifeBar() {
    this.lifeBar.clear();
    const x = GAME_FRAME_LEFT + 24, barH = 300, barW = 18;
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
      const outer = this.add.arc(pos.x, pos.y, 60, 0, 360, false, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 1).setDepth(SCENE_LAYER.JUDGE_CIRCLE);
      const inner = this.add.arc(pos.x, pos.y, CHECKPOINT_RADIUS, 0, 360, false, 0xffffff, 0.5).setDepth(SCENE_LAYER.JUDGE_CIRCLE);
      const cp: CheckpointUI = { dir, pos, outerCircle: outer, innerCircle: inner };

      if (this.isCardinal(dir)) {
        const zone = this.createEdgeZone(dir).setDepth(SCENE_LAYER.JUDGE_EDGE_ZONE).setVisible(false);
        const line = this.createEdgeLine(dir).setDepth(SCENE_LAYER.JUDGE_LINE).setVisible(false);
        outer.setVisible(false);
        inner.setVisible(false);
        cp.edgeZone = zone;
        cp.edgeLine = line;
      } else {
        cp.cornerLine = this.createCornerJudgeLine(dir).setDepth(SCENE_LAYER.JUDGE_LINE).setVisible(false);
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
      cp.cornerLine?.setVisible(vis);
    }
  }

  private setInnerCheckpointsVisible(vis: boolean) {
    for (const cp of this.checkpoints) {
      cp.outerCircle.setVisible(false);
      cp.innerCircle.setVisible(vis && !this.isCardinal(cp.dir));
      cp.edgeZone?.setVisible(vis);
      cp.edgeLine?.setVisible(vis);
      cp.cornerLine?.setVisible(vis);
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
    this.cursorClipFrame.style.overflow = 'hidden';
    this.cursorClipFrame.style.zIndex = String(HTML_LAYER.CURSOR);
    this.cursorClipFrame.style.display = 'none';

    this.cursorGifFrame = document.createElement('div');
    this.cursorGifFrame.style.position = 'absolute';
    this.cursorGifFrame.style.pointerEvents = 'none';
    this.cursorGifFrame.style.left = '0';
    this.cursorGifFrame.style.top = '0';
    this.cursorGifFrame.style.transform = 'translate3d(-9999px, -9999px, 0) translate(-50%, -50%)';
    this.cursorGifFrame.style.willChange = 'transform';
    this.cursorGifFrame.style.zIndex = String(HTML_LAYER.CURSOR);
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
    this.cursorGif.style.zIndex = String(CURSOR_SUBLAYER.GIF);
    this.cursorGifFrame.appendChild(this.cursorGif);

    this.cursorCheckPointDot = document.createElement('div');
    this.cursorCheckPointDot.style.position = 'absolute';
    this.cursorCheckPointDot.style.left = '50%';
    this.cursorCheckPointDot.style.top = '50%';
    this.cursorCheckPointDot.style.width = `${CURSOR_CHECK_POINT_DOT_SIZE}px`;
    this.cursorCheckPointDot.style.height = `${CURSOR_CHECK_POINT_DOT_SIZE}px`;
    this.cursorCheckPointDot.style.borderRadius = '50%';
    this.cursorCheckPointDot.style.background = '#ff1d1d';
    this.cursorCheckPointDot.style.border = '2px solid #ffffff';
    this.cursorCheckPointDot.style.boxSizing = 'border-box';
    this.cursorCheckPointDot.style.pointerEvents = 'none';
    this.cursorCheckPointDot.style.zIndex = String(CURSOR_SUBLAYER.CHECK_POINT_DOT);
    this.cursorCheckPointDot.style.display = 'none';
    this.cursorCheckPointDot.style.transform = 'translate3d(-9999px, -9999px, 0) translate(-50%, -50%)';
    this.cursorGifFrame.appendChild(this.cursorCheckPointDot);

    this.cursorGifBorder = document.createElement('div');
    this.cursorGifBorder.style.position = 'absolute';
    this.cursorGifBorder.style.inset = '0';
    this.cursorGifBorder.style.pointerEvents = 'none';
    this.cursorGifBorder.style.border = '2px solid #fff';
    this.cursorGifBorder.style.boxSizing = 'border-box';
    this.cursorGifBorder.style.zIndex = String(CURSOR_SUBLAYER.BORDER);
    this.cursorGifFrame.appendChild(this.cursorGifBorder);

    this.cursorClipFrame.appendChild(this.cursorGifFrame);

    document.body.appendChild(this.cursorClipFrame);
    this.createGameFrameMask();
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
    this.clearButtonEffectUI();
    this.debugController?.dispose();
    this.debugController = undefined;
    this.removeStorySamVideo();
    this.removeEndingVideoOverlay();
    this.hideLoadingOverlay();
    this.endingSequenceStarted = false;
    this.suppressGameFrameMask = false;
    this.stopStagePhaseClip();
    this.stopPromptAudioSequence();
    this.cursorGifAngleTween?.stop();
    window.removeEventListener('resize', this.refreshGifCursorLayout);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    this.cursorCheckPointDot?.remove();
    this.cursorClipFrame?.remove();
    for (const panel of this.gameFrameMask) panel.remove();
    this.gameFrameMask = [];
    this.resetGifCursorCache();
    this.beatTimer?.remove(false);
    this.promptRotationTween?.stop();
    for (const event of this.shrinkStartEvents) event.remove(false);
    this.shrinkStartEvents = [];
    for (const t of this.shrinkTweens.values()) t.stop();
    this.shrinkTweens.clear();
    this.activeShrinks.clear();
    this.falseTouchedLines.clear();
    this.penaltyCooldownUntil = 0;
  }

  private createGameFrameMask() {
    this.gameFrameMask = Array.from({ length: 4 }, () => {
      const panel = document.createElement('div');
      panel.style.position = 'fixed';
      panel.style.pointerEvents = 'none';
      panel.style.background = '#ffffff';
      panel.style.zIndex = String(HTML_LAYER.GAME_FRAME_BEZEL);
      panel.style.display = 'none';
      document.body.appendChild(panel);
      return panel;
    });
  }

  private refreshGameFrameMask(rect: DOMRect) {
    if (this.gameFrameMask.length !== 4) return;

    if (this.suppressGameFrameMask) {
      this.setGameFrameMaskVisible(false);
      return;
    }

    const insetX = GAME_FRAME_INSET_X * this.cursorScaleX;
    const insetY = GAME_FRAME_INSET_Y * this.cursorScaleY;
    const [top, bottom, left, right] = this.gameFrameMask;

    top.style.left = `${rect.left}px`;
    top.style.top = `${rect.top}px`;
    top.style.width = `${rect.width}px`;
    top.style.height = `${insetY}px`;

    bottom.style.left = `${rect.left}px`;
    bottom.style.top = `${rect.bottom - insetY}px`;
    bottom.style.width = `${rect.width}px`;
    bottom.style.height = `${insetY}px`;

    left.style.left = `${rect.left}px`;
    left.style.top = `${rect.top + insetY}px`;
    left.style.width = `${insetX}px`;
    left.style.height = `${Math.max(0, rect.height - insetY * 2)}px`;

    right.style.left = `${rect.right - insetX}px`;
    right.style.top = `${rect.top + insetY}px`;
    right.style.width = `${insetX}px`;
    right.style.height = `${Math.max(0, rect.height - insetY * 2)}px`;

    this.setGameFrameMaskVisible(true);
  }

  private setGameFrameMaskVisible(visible: boolean) {
    for (const panel of this.gameFrameMask) {
      panel.style.display = visible ? 'block' : 'none';
      if (visible) {
        document.body.appendChild(panel);
      }
    }
  }

  private createPauseMenu() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.pauseContainer = this.add.container(cx, cy).setDepth(SCENE_LAYER.PAUSE_MENU).setVisible(false);
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
    this.countdownText = this.add.text(cx, cy, '', { fontSize: '80px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(SCENE_LAYER.COUNTDOWN).setVisible(false);
  }

  // ---------- Section flow ----------

  private startSection() {
    if (this.isGameOver) return;
    this.currentSection = this.currentStage.sections[this.sectionIndex];
    this.clearButtonEffectUI();

    let sectionDurationMs: number;
    if (this.currentSection.type === 'delay') {
      sectionDurationMs = Math.max(0, (this.currentSection as DelaySection).ms);
    } else {
      const sectionBpm = (this.currentSection as NormalSection | RotationSection).bpm ?? this.currentStage.bpm;
      sectionDurationMs = 16 * (60000 / sectionBpm);
    }
    this.sectionTargetEndTimeMs = this.sectionTargetEndTimeMs === null
      ? this.time.now + sectionDurationMs
      : this.sectionTargetEndTimeMs + sectionDurationMs;

    if (this.currentSection.type === 'delay') {
      this.stopPromptAudioSequence();
      this.stopStagePhaseClip();
      this.stopAllShrinks();
      this.clearPromptGrid();
      this.setCheckpointsVisible(false);
      this.setGifCursorVisible(false);
      this.beatTimer?.remove();
      this.beatCount = 0;
      this.updateHUD();
      this.setDelayText(this.currentSection.text, this.currentSection.color);

      const remaining = Math.max(0, this.sectionTargetEndTimeMs - this.time.now);
      this.time.delayedCall(remaining, () => {
        if (this.isGameOver) return;
        this.setDelayText();
        this.advanceToNextSection();
      });
      return;
    }

    this.setDelayText();
    const sectionBpm = this.currentSection.bpm;
    this.beatMs = 60000 / (sectionBpm ?? this.currentStage.bpm);
    this.isRotation = this.currentSection.type === 'rotation';
    this.beatCount = 0;
    this.updateHUD();
    this.debugController?.updateMetrics();
    this.startPromptPhase();
  }

  private startPromptPhase() {
    if (this.isGameOver) return;
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

    if (!this.isRotation && this.mode !== 'story') {
      this.startPromptAudioSequence((this.currentSection as NormalSection).prompts);
    }
  }

  private startCheckPhase() {
    if (this.isGameOver) return;
    this.gamePhase = 'check';
    this.stopPromptAudioSequence();
    this.clearPromptGrid();

    if (this.isButtonEffectSection()) {
      this.stopAllShrinks();
      this.setCheckpointsVisible(false);
      this.setGifCursorVisible(false);
      this.hitboxGraphics.clear();
      this.beatCount = 0;
      this.showButtonEffectUI();

      this.beatTimer?.remove();
      this.onBeat();
      this.beatTimer = this.time.addEvent({ delay: this.beatMs, repeat: 7, callback: this.onBeat, callbackScope: this });
      return;
    }

    this.clearButtonEffectUI();
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
    if (this.isGameOver) return;
    if (this.gamePhase === 'prompt') {
      this.highlightPromptBeat(this.beatCount);
      this.beatCount++;
      if (this.beatCount >= 8) {
        this.beatTimer?.remove();
        this.startCheckPhase();
      }
    } else {
      if (this.isButtonEffectActive) {
        this.beatCount++;
        if (this.beatCount >= 8) {
          this.beatTimer?.remove();
          const remaining = Math.max(0, (this.sectionTargetEndTimeMs ?? this.time.now) - this.time.now);
          this.time.delayedCall(remaining, () => this.onCheckPhaseEnd());
        }
        return;
      }

      if (this.beatCount >= 8) {
        this.beatTimer?.remove();
        return;
      }
      this.triggerShrinkForBeat(this.beatCount);
      this.beatCount++;
      if (this.beatCount >= 8) {
        this.beatTimer?.remove();
        // Anchor section end to its cumulative absolute target so per-frame jitter
        // doesn't compound across sections.
        const remaining = Math.max(0, (this.sectionTargetEndTimeMs ?? this.time.now) - this.time.now);
        this.time.delayedCall(remaining, () => this.onCheckPhaseEnd());
      }
    }
  }

  private onCheckPhaseEnd() {
    if (this.isGameOver) return;

    if (this.isButtonEffectActive) {
      const success = this.buttonEffectClicks >= BUTTON_EFFECT_REQUIRED_CLICKS;
      this.clearButtonEffectUI();
      if (!success) {
        this.triggerGameOver();
        return;
      }
      this.setCheckpointsVisible(false);
      this.setGifCursorVisible(false);
      this.advanceToNextSection();
      return;
    }

    if (this.pendingShrinkStartCount > 0 || this.activeShrinks.size > 0) {
      this.time.delayedCall(16, () => this.onCheckPhaseEnd());
      return;
    }

    this.stopAllShrinks();
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.advanceToNextSection();
  }

  private advanceToNextSection() {
    if (this.isGameOver) return;
    this.clearButtonEffectUI();

    if (this.currentSection.type !== 'delay') {
      const repeat = this.getSectionRepeat(this.currentSection);
      if (this.sectionRepeatIteration < repeat) {
        this.sectionRepeatIteration++;
        this.startSection();
        return;
      }
    }

    this.sectionRepeatIteration = 1;
    this.sectionIndex++;
    if (this.sectionIndex >= this.currentStage.sections.length) {
      this.stageIndex++;
      if (this.stageIndex >= this.levelData.stages.length) {
        if (this.mode === 'story') {
          this.playStoryEndingSequence();
        } else {
          this.time.delayedCall(500, () => this.scene.start('MenuScene'));
        }
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
    this.promptRotationTween?.stop();
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
      this.promptRotationAngle.value = DIR_ANGLE[sec.start];
      for (let i = 0; i < 8; i++) {
        this.promptImages.push(this.addArrowImage(0, 0, sec.start));
      }
      this.applyPromptRotationAngle();
    } else {
      const sec = this.currentSection as NormalSection;
      const customKey = sec.image ? getCustomImageKey(sec.image) : undefined;
      for (let i = 0; i < 8; i++) {
        this.promptImages.push(this.addArrowImage(0, 0, sec.prompts[i], customKey));
      }
    }
    this.positionPromptGrid(x, y);

    if (!this.isRotation && (this.currentSection as NormalSection).effect === 'fadein') {
      const fadeInDurationMs = this.beatMs * 8;
      for (const img of this.promptImages) {
        img.setAlpha(0);
        this.tweens.add({
          targets: img,
          alpha: 0.9,
          duration: fadeInDurationMs,
          ease: 'Sine.easeOut',
        });
      }
    }

    this.drawHitbox(x, y);
  }

  private addArrowImage(x: number, y: number, dir: Direction, overrideKey?: string): Phaser.GameObjects.Image {
    const isDiagonal = dir === 'q' || dir === 'e' || dir === 'z' || dir === 'c';
    const key = overrideKey ?? (isDiagonal ? 'down_left' : 'down');
    const img = this.add.image(x, y, key).setDepth(SCENE_LAYER.PROMPT_ARROW).setAlpha(0.9);
    img.setAngle(isDiagonal ? DIR_ANGLE[dir] - 45 : DIR_ANGLE[dir]);
    return img;
  }

  private positionPromptGrid(x: number, y: number) {
    const cols = 4;
    const rows = 2;
    const cellW = this.settings.hitboxWidth / cols;
    const cellH = this.settings.hitboxHeight / rows;
    const isSmall = !this.isRotation && (this.currentSection as NormalSection).effect === 'small';
    const arrowSize = isSmall ? 60 : 120;
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
        .setDepth(SCENE_LAYER.PROMPT_INDICATOR)
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
      const [, next] = getRotationPoints(this.rotCurrentDir, rotDir);
      this.promptRotationTween?.stop();
      this.promptRotationAngle.value = this.shortestAngle(this.promptRotationAngle.value, DIR_ANGLE[this.rotCurrentDir]);
      this.promptRotationTween = this.tweens.add({
        targets: this.promptRotationAngle,
        value: this.shortestAngle(this.promptRotationAngle.value, DIR_ANGLE[next]),
        duration: this.beatMs,
        ease: 'Linear',
        onUpdate: () => this.applyPromptRotationAngle(),
        onComplete: () => this.applyPromptRotationAngle(),
      });
      this.rotCurrentDir = next;
    }
  }

  private startPromptAudioSequence(prompts: Direction[]) {
    this.stopPromptAudioSequence();

    const audioKeys = prompts.flatMap(dir => {
      const key = PROMPT_AUDIO_KEYS[dir];
      return key ? [key] : [];
    });
    if (audioKeys.length === 0) return;

    const sequenceId = this.promptAudioSequenceId;
    let index = 0;

    const playNext = () => {
      if (sequenceId !== this.promptAudioSequenceId || index >= audioKeys.length) return;

      const promptSound = this.sound.add(audioKeys[index]);
      index++;
      this.promptAudioSound = promptSound;

      promptSound.once(Phaser.Sound.Events.COMPLETE, () => {
        if (this.promptAudioSound === promptSound) {
          this.promptAudioSound = undefined;
        }
        promptSound.destroy();
        if (sequenceId !== this.promptAudioSequenceId || index >= audioKeys.length) return;

        const event = this.time.delayedCall(PROMPT_AUDIO_GAP_MS, () => {
          this.promptAudioEvents = this.promptAudioEvents.filter(item => item !== event);
          playNext();
        });
        event.paused = this.isPaused;
        this.promptAudioEvents.push(event);
      });

      promptSound.play();
    };

    playNext();
  }

  private pausePromptAudioSequence() {
    if (this.promptAudioSound?.isPlaying) this.promptAudioSound.pause();
    for (const event of this.promptAudioEvents) event.paused = true;
  }

  private resumePromptAudioSequence() {
    if (this.promptAudioSound?.isPaused) this.promptAudioSound.resume();
    for (const event of this.promptAudioEvents) event.paused = false;
  }

  private stopPromptAudioSequence() {
    this.promptAudioSequenceId++;
    for (const event of this.promptAudioEvents) event.remove(false);
    this.promptAudioEvents = [];
    if (!this.promptAudioSound) return;
    this.promptAudioSound.stop();
    this.promptAudioSound.destroy();
    this.promptAudioSound = undefined;
  }

  private playStagePhaseClip() {
    if (!this.currentStageAudioKey) return;
    // Restart audio per section/rep so each one is anchored to audio time 0.
    // The audio file is ~5.197s but 16 beats at base BPM is ~5.232s, so the
    // file is encoded at ~184.7 BPM rather than 183.5. Letting audio run
    // continuously across reps would compound that ~25ms-per-rep mismatch
    // into audible drift (≥1 beat after 10 reps). Per-rep restart resets
    // the phase each time. The cold-start that used to bite rep 1 is now
    // absorbed by prewarmStageAudio() before the first section runs.
    this.stopStagePhaseClip();
    const stageAudio = this.sound.add(this.currentStageAudioKey);
    const rate = this.getStageAudioPlaybackRate();
    this.currentStageAudio = stageAudio;
    stageAudio.once(Phaser.Sound.Events.COMPLETE, () => {
      if (this.currentStageAudio === stageAudio) this.currentStageAudio = undefined;
      stageAudio.destroy();
    });
    stageAudio.play({ rate });
  }

  private pauseStagePhaseClip() {
    if (this.currentStageAudio?.isPlaying) this.currentStageAudio.pause();
  }

  private resumeStagePhaseClip() {
    if (this.currentStageAudio?.isPaused) this.currentStageAudio.resume();
  }

  private stopStagePhaseClip() {
    if (!this.currentStageAudio) return;
    this.currentStageAudio.stop();
    this.currentStageAudio.destroy();
    this.currentStageAudio = undefined;
  }

  private showLoadingOverlay() {
    this.hideLoadingOverlay();
    // The white frame bezel is HTML and sits above the canvas, so a Phaser
    // overlay alone gets clipped at the edges. Hide the bezel for the duration
    // of the loading transition.
    this.suppressGameFrameMask = true;
    this.setGameFrameMaskVisible(false);
    this.loadingOverlayRect = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setDepth(SCENE_LAYER.LOADING_OVERLAY);
    const margin = 24;
    this.loadingOverlayImage = this.add
      .image(GAME_WIDTH - margin, GAME_HEIGHT - margin, 'loading_overlay')
      .setOrigin(1, 1)
      .setDepth(SCENE_LAYER.LOADING_IMAGE);
  }

  private hideLoadingOverlay() {
    this.loadingOverlayRect?.destroy();
    this.loadingOverlayRect = undefined;
    this.loadingOverlayImage?.destroy();
    this.loadingOverlayImage = undefined;
    if (this.suppressGameFrameMask) {
      this.suppressGameFrameMask = false;
      this.setGameFrameMaskVisible(true);
    }
  }

  private createStorySamVideo() {
    if (this.mode !== 'story') return;

    this.removeStorySamVideo();

    this.storySamVideoRoot = document.createElement('div');
    this.storySamVideoRoot.style.position = 'fixed';
    this.storySamVideoRoot.style.pointerEvents = 'none';
    this.storySamVideoRoot.style.zIndex = String(HTML_LAYER.STORY_SAM_VIDEO);

    const shell = document.createElement('div');
    shell.style.position = 'absolute';
    shell.style.right = '20px';
    shell.style.bottom = '20px';
    shell.style.width = '22%';
    shell.style.minWidth = '220px';
    shell.style.maxWidth = '320px';
    shell.style.aspectRatio = '16 / 9';
    shell.style.border = '2px solid rgba(255, 255, 255, 0.82)';
    shell.style.background = '#000000';
    shell.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.5)';
    shell.style.overflow = 'hidden';

    this.storySamVideo = document.createElement('video');
    this.storySamVideo.src = samVideoUrl;
    this.storySamVideo.autoplay = true;
    this.storySamVideo.loop = true;
    this.storySamVideo.controls = false;
    this.storySamVideo.muted = false;
    this.storySamVideo.volume = this.getMasterVolume();
    this.storySamVideo.playsInline = true;
    this.storySamVideo.preload = 'auto';
    this.storySamVideo.style.width = '100%';
    this.storySamVideo.style.height = '100%';
    this.storySamVideo.style.objectFit = 'cover';

    shell.appendChild(this.storySamVideo);
    this.storySamVideoRoot.appendChild(shell);
    document.body.appendChild(this.storySamVideoRoot);

    this.refreshStorySamVideoBounds();
    window.addEventListener('resize', this.refreshStorySamVideoBounds);
    this.storySamVideo.play().catch(() => {
      // Browser autoplay policy may require user interaction.
    });
  }

  private pauseStorySamVideo() {
    if (!this.storySamVideo) return;
    this.storySamVideo.pause();
  }

  private resumeStorySamVideo() {
    if (!this.storySamVideo) return;
    this.storySamVideo.play().catch(() => {
      // Ignore autoplay resume rejection.
    });
  }

  private removeStorySamVideo() {
    window.removeEventListener('resize', this.refreshStorySamVideoBounds);

    if (this.storySamVideo) {
      this.storySamVideo.pause();
      this.storySamVideo.src = '';
      this.storySamVideo.load();
      this.storySamVideo.remove();
      this.storySamVideo = undefined;
    }

    this.storySamVideoRoot?.remove();
    this.storySamVideoRoot = undefined;
  }

  private applyPromptRotationAngle() {
    for (const img of this.promptImages) {
      img.setAlpha(1);
      img.setAngle(this.promptRotationAngle.value);
    }
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
    return Phaser.Math.Clamp(this.settings.checkDepth ?? 50, 0, Math.min(GAME_FRAME_WIDTH, GAME_FRAME_HEIGHT) / 2);
  }

  private cornerLineDepth(): number {
    return Phaser.Math.Clamp(this.settings.cornerLineDepth ?? 130, 20, Math.min(GAME_FRAME_WIDTH, GAME_FRAME_HEIGHT) / 2);
  }

  private isCardinal(dir: Direction): boolean {
    return dir === 'w' || dir === 'x' || dir === 'a' || dir === 'd';
  }

  private getTargetPos(dir: Direction): { x: number; y: number } {
    const d = this.checkDepth();
    const diagonalInset = 0;
    const positions: Record<Direction, { x: number; y: number }> = {
      w: { x: GAME_WIDTH / 2, y: GAME_FRAME_TOP + d },
      x: { x: GAME_WIDTH / 2, y: GAME_FRAME_BOTTOM - d },
      a: { x: GAME_FRAME_LEFT + d, y: GAME_HEIGHT / 2 },
      d: { x: GAME_FRAME_RIGHT - d, y: GAME_HEIGHT / 2 },
      q: { x: GAME_FRAME_LEFT + d + diagonalInset, y: GAME_FRAME_TOP + d + diagonalInset },
      e: { x: GAME_FRAME_RIGHT - d - diagonalInset, y: GAME_FRAME_TOP + d + diagonalInset },
      z: { x: GAME_FRAME_LEFT + d + diagonalInset, y: GAME_FRAME_BOTTOM - d - diagonalInset },
      c: { x: GAME_FRAME_RIGHT - d - diagonalInset, y: GAME_FRAME_BOTTOM - d - diagonalInset },
    };
    return positions[dir];
  }

  private createEdgeZone(dir: Direction): Phaser.GameObjects.Rectangle {
    const d = this.checkDepth();
    const color = 0xffffff;
    const alpha = 0.16;
    if (dir === 'w') return this.add.rectangle(GAME_WIDTH / 2, GAME_FRAME_TOP + d / 2, GAME_FRAME_WIDTH, d, color, alpha);
    if (dir === 'x') return this.add.rectangle(GAME_WIDTH / 2, GAME_FRAME_BOTTOM - d / 2, GAME_FRAME_WIDTH, d, color, alpha);
    if (dir === 'a') return this.add.rectangle(GAME_FRAME_LEFT + d / 2, GAME_HEIGHT / 2, d, GAME_FRAME_HEIGHT, color, alpha);
    return this.add.rectangle(GAME_FRAME_RIGHT - d / 2, GAME_HEIGHT / 2, d, GAME_FRAME_HEIGHT, color, alpha);
  }

  private createEdgeLine(dir: Direction): Phaser.GameObjects.Rectangle {
    const d = this.checkDepth();
    const thickness = 4;
    if (dir === 'w') return this.add.rectangle(GAME_WIDTH / 2, GAME_FRAME_TOP + d, GAME_FRAME_WIDTH, thickness, 0xffffff, 0.95);
    if (dir === 'x') return this.add.rectangle(GAME_WIDTH / 2, GAME_FRAME_BOTTOM - d, GAME_FRAME_WIDTH, thickness, 0xffffff, 0.95);
    if (dir === 'a') return this.add.rectangle(GAME_FRAME_LEFT + d, GAME_HEIGHT / 2, thickness, GAME_FRAME_HEIGHT, 0xffffff, 0.95);
    return this.add.rectangle(GAME_FRAME_RIGHT - d, GAME_HEIGHT / 2, thickness, GAME_FRAME_HEIGHT, 0xffffff, 0.95);
  }

  private createCornerJudgeLine(dir: Direction): Phaser.GameObjects.Line {
    const d = this.cornerLineDepth();
    const left = GAME_FRAME_LEFT;
    const right = GAME_FRAME_RIGHT;
    const top = GAME_FRAME_TOP;
    const bottom = GAME_FRAME_BOTTOM;

    if (dir === 'q') {
      return this.add.line(0, 0, left + d, top, left, top + d, 0xffffff, 0.95).setOrigin(0, 0);
    }
    if (dir === 'e') {
      return this.add.line(0, 0, right - d, top, right, top + d, 0xffffff, 0.95).setOrigin(0, 0);
    }
    if (dir === 'z') {
      return this.add.line(0, 0, left, bottom - d, left + d, bottom, 0xffffff, 0.95).setOrigin(0, 0);
    }
    return this.add.line(0, 0, right, bottom - d, right - d, bottom, 0xffffff, 0.95).setOrigin(0, 0);
  }

  private isDiagonalCornerLineHit(pointX: number, pointY: number, dir: Direction): boolean {
    const d = this.cornerLineDepth();

    if (dir === 'q') {
      const x = (GAME_FRAME_LEFT + d) - pointX;
      const y = (GAME_FRAME_TOP + d) - pointY;
      return x >= 0 && y >= 0 && x + y >= d;
    }

    if (dir === 'e') {
      const x = pointX - (GAME_FRAME_RIGHT - d);
      const y = (GAME_FRAME_TOP + d) - pointY;
      return x >= 0 && y >= 0 && x + y >= d;
    }

    if (dir === 'z') {
      const x = (GAME_FRAME_LEFT + d) - pointX;
      const y = pointY - (GAME_FRAME_BOTTOM - d);
      return x >= 0 && y >= 0 && x + y >= d;
    }

    if (dir === 'c') {
      const x = pointX - (GAME_FRAME_RIGHT - d);
      const y = pointY - (GAME_FRAME_BOTTOM - d);
      return x >= 0 && y >= 0 && x + y >= d;
    }

    return false;
  }

  private createEdgeHitFlash(dir: Direction): Phaser.GameObjects.Rectangle {
    const d = this.checkDepth();
    const color = 0xffde4a;
    if (dir === 'w') return this.add.rectangle(GAME_WIDTH / 2, GAME_FRAME_TOP + d / 2, GAME_FRAME_WIDTH, d, color, 0);
    if (dir === 'x') return this.add.rectangle(GAME_WIDTH / 2, GAME_FRAME_BOTTOM - d / 2, GAME_FRAME_WIDTH, d, color, 0);
    if (dir === 'a') return this.add.rectangle(GAME_FRAME_LEFT + d / 2, GAME_HEIGHT / 2, d, GAME_FRAME_HEIGHT, color, 0);
    return this.add.rectangle(GAME_FRAME_RIGHT - d / 2, GAME_HEIGHT / 2, d, GAME_FRAME_HEIGHT, color, 0);
  }

  private createHitSparkTexture() {
    if (this.textures.exists(HIT_SPARK_TEXTURE_KEY)) return;

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 6);
    g.generateTexture(HIT_SPARK_TEXTURE_KEY, 16, 16);
    g.destroy();
  }

  private playEdgeHitEffect(dir: Direction) {
    this.playEdgeParticleBurst(dir);

    if (!this.isCardinal(dir)) return;

    const d = this.checkDepth();
    const thickness = 6;
    const flyRatio = 0.25;
    const flash = this.createEdgeHitFlash(dir).setDepth(SCENE_LAYER.EDGE_HIT_FLASH);
    const line = this.createEdgeLine(dir)
      .setDepth(SCENE_LAYER.EDGE_HIT_LINE)
      .setFillStyle(0xfff1a8, 1)
      .setAlpha(1);

    const target: { x?: number; y?: number } = {};
    if (dir === 'w' || dir === 'x') {
      const startY = dir === 'w' ? GAME_FRAME_TOP + d : GAME_FRAME_BOTTOM - d;
      target.y = Phaser.Math.Linear(startY, GAME_HEIGHT / 2, flyRatio);
      line.setSize(GAME_FRAME_WIDTH, thickness);
      line.setPosition(GAME_WIDTH / 2, startY);
    } else {
      const startX = dir === 'a' ? GAME_FRAME_LEFT + d : GAME_FRAME_RIGHT - d;
      target.x = Phaser.Math.Linear(startX, GAME_WIDTH / 2, flyRatio);
      line.setSize(thickness, GAME_FRAME_HEIGHT);
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

  private playEdgeParticleBurst(dir: Direction) {
    const d = this.checkDepth();
    const edgeInset = this.isCardinal(dir) ? d : d + 100;
    const positions = this.getEdgeParticlePositions(dir, edgeInset);
    const velocity = this.getEdgeParticleVelocity(dir);
    const emitter = this.add.particles(0, 0, HIT_SPARK_TEXTURE_KEY, {
      emitting: false,
      lifespan: { min: 360, max: 680 },
      speedX: velocity.speedX,
      speedY: velocity.speedY,
      accelerationY: dir === 'w' ? 260 : dir === 'x' ? -260 : 0,
      scale: { start: 0.72, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xfff1a8, 0x7cff8f, 0x8ff8ff, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(SCENE_LAYER.EDGE_PARTICLE);

    for (const pos of positions) {
      emitter.explode(this.isCardinal(dir) ? 9 : 34, pos.x, pos.y);
    }

    this.time.delayedCall(900, () => emitter.destroy());
  }

  private getEdgeParticlePositions(dir: Direction, inset: number): Array<{ x: number; y: number }> {
    if (dir === 'w' || dir === 'x') {
      const y = dir === 'w' ? GAME_FRAME_TOP + inset : GAME_FRAME_BOTTOM - inset;
      return [
        { x: GAME_WIDTH / 2 - GAME_FRAME_WIDTH * 0.34, y },
        { x: GAME_WIDTH / 2 - GAME_FRAME_WIDTH * 0.17, y },
        { x: GAME_WIDTH / 2, y },
        { x: GAME_WIDTH / 2 + GAME_FRAME_WIDTH * 0.17, y },
        { x: GAME_WIDTH / 2 + GAME_FRAME_WIDTH * 0.34, y },
      ];
    }

    if (dir === 'a' || dir === 'd') {
      const x = dir === 'a' ? GAME_FRAME_LEFT + inset : GAME_FRAME_RIGHT - inset;
      return [
        { x, y: GAME_HEIGHT / 2 - GAME_FRAME_HEIGHT * 0.34 },
        { x, y: GAME_HEIGHT / 2 - GAME_FRAME_HEIGHT * 0.17 },
        { x, y: GAME_HEIGHT / 2 },
        { x, y: GAME_HEIGHT / 2 + GAME_FRAME_HEIGHT * 0.17 },
        { x, y: GAME_HEIGHT / 2 + GAME_FRAME_HEIGHT * 0.34 },
      ];
    }

    const left = GAME_FRAME_LEFT + inset;
    const right = GAME_FRAME_RIGHT - inset;
    const top = GAME_FRAME_TOP + inset;
    const bottom = GAME_FRAME_BOTTOM - inset;
    const positions: Record<Direction, { x: number; y: number }> = {
      w: { x: GAME_WIDTH / 2, y: top },
      x: { x: GAME_WIDTH / 2, y: bottom },
      a: { x: left, y: GAME_HEIGHT / 2 },
      d: { x: right, y: GAME_HEIGHT / 2 },
      q: { x: left, y: top },
      e: { x: right, y: top },
      z: { x: left, y: bottom },
      c: { x: right, y: bottom },
    };
    return [positions[dir]];
  }

  private getEdgeParticleVelocity(dir: Direction): {
    speedX: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
    speedY: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
  } {
    const spread = { min: -180, max: 180 };
    if (dir === 'w') return { speedX: spread, speedY: { min: 80, max: 320 } };
    if (dir === 'x') return { speedX: spread, speedY: { min: -320, max: -80 } };
    if (dir === 'a') return { speedX: { min: 80, max: 320 }, speedY: spread };
    if (dir === 'd') return { speedX: { min: -320, max: -80 }, speedY: spread };

    const xDir = dir === 'q' || dir === 'z' ? 1 : -1;
    const yDir = dir === 'q' || dir === 'e' ? 1 : -1;
    const diagonalRange = (sign: number) => sign > 0 ? { min: 80, max: 320 } : { min: -320, max: -80 };
    return {
      speedX: diagonalRange(xDir),
      speedY: diagonalRange(yDir),
    };
  }

  private triggerShrinkForBeat(beat: number) {
    if (this.isGameOver) return;
    // Scale lead by audio playback rate so visual judgment stays aligned with the
    // rate-shifted stage audio when section BPM differs from stage BPM.
    const lead = this.settings.shrinkLeadMs / this.getStageAudioPlaybackRate();
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
    if (this.isGameOver) return;
    const cp = this.checkpoints.find(c => c.dir === dir)!;
    const outer = cp.outerCircle;
    outer.setRadius(60).setAlpha(1).setVisible(false);
    cp.edgeLine?.setAlpha(1).setVisible(this.shouldShowCardinalGuideLine());

    const delay = Math.max(0, this.beatMs - leadMs);
    this.pendingShrinkStartCount++;
    const event = this.time.delayedCall(delay, () => {
      if (this.isGameOver) {
        this.pendingShrinkStartCount = Math.max(0, this.pendingShrinkStartCount - 1);
        return;
      }
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
    if (this.isGameOver) return;
    const active = this.activeShrinks.get(id);
    if (!active) return;

    if (!active.hit) this.onMiss(active.dir);

    this.activeShrinks.delete(id);
    this.shrinkTweens.delete(id);
    if (!this.hasActiveShrinkForDir(active.dir)) {
      const cp = this.checkpoints.find(c => c.dir === active.dir)!;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
      cp.edgeZone?.setAlpha(0.16);
      cp.edgeLine?.setAlpha(1).setVisible(this.shouldShowCardinalGuideLine());
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

  private isButtonEffectSection(): boolean {
    return this.currentSection.type === 'normal' && this.currentSection.effect === 'button';
  }

  private showButtonEffectUI() {
    this.clearButtonEffectUI();
    this.isButtonEffectActive = true;
    this.buttonEffectClicks = 0;
    this.input.setDefaultCursor('default');

    // Pre-check: can completing all 10 button clicks achieve A rating?
    // Uses the same rank logic as buildEndingSummary via computeRank.
    const projectedRank = this.computeRank(
      this.perfectCount + BUTTON_EFFECT_REQUIRED_CLICKS,
      this.missCount,
      this.falseTouchCount,
    );
    this.buttonEffectCanReachA = ['S++', 'S+', 'S', 'A'].includes(projectedRank);

    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 120;
    const container = this.add.container(x, y).setDepth(SCENE_LAYER.HUD + 6);

    const rect = this.add.rectangle(0, 0, 360, 96, 0xbf2f2f, 0.96)
      .setStrokeStyle(4, 0xffffff, 0.95)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(0, -10, '嚴厲斥責', {
      fontSize: '42px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const progress = this.add.text(0, -78, `0/${BUTTON_EFFECT_REQUIRED_CLICKS}`, {
      fontSize: '24px',
      color: '#ffe6e6',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    rect.on('pointerover', () => this.applyButtonEffectTheme(true));
    rect.on('pointerout', () => this.applyButtonEffectTheme(false));
    rect.on('pointerdown', () => this.onButtonEffectClick());

    container.add([rect, label, progress]);
    this.buttonEffectContainer = container;
    this.buttonEffectRect = rect;
    this.buttonEffectProgress = progress;
    this.buttonEffectLabel = label;

    this.buttonEffectCountdownRing = this.add.graphics().setDepth(SCENE_LAYER.HUD + 7);
    this.buttonEffectCountdownText = this.add.text(x, y - 130, '', {
      fontSize: '28px',
      color: '#ffe8a6',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(SCENE_LAYER.HUD + 8);

    this.buttonEffectCountdownDurationMs = this.beatMs * 8;
    this.buttonEffectCountdownState.value = 1;
    this.drawButtonEffectCountdown();
    this.buttonEffectCountdownTween = this.tweens.add({
      targets: this.buttonEffectCountdownState,
      value: 0,
      duration: this.buttonEffectCountdownDurationMs,
      ease: 'Linear',
      onUpdate: () => this.drawButtonEffectCountdown(),
      onComplete: () => this.drawButtonEffectCountdown(),
    });

    this.applyButtonEffectTheme(false);
  }

  private drawButtonEffectCountdown() {
    if (!this.buttonEffectCountdownRing || !this.buttonEffectCountdownText) return;

    const ratio = Phaser.Math.Clamp(this.buttonEffectCountdownState.value, 0, 1);
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 120;
    const radius = 74;
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * ratio;

    this.buttonEffectCountdownRing.clear();
    this.buttonEffectCountdownRing.lineStyle(8, 0x1f1f27, 0.42);
    this.buttonEffectCountdownRing.strokeCircle(x, y, radius);

    if (ratio > 0) {
      this.buttonEffectCountdownRing.lineStyle(10, 0xffdb6e, 0.58);
      this.buttonEffectCountdownRing.beginPath();
      this.buttonEffectCountdownRing.arc(x, y, radius, start, end, false);
      this.buttonEffectCountdownRing.strokePath();
    }

    const remainSec = Math.max(0, (ratio * this.buttonEffectCountdownDurationMs) / 1000);
    this.buttonEffectCountdownText.setText(`${remainSec.toFixed(1)}s`);
  }

  private applyButtonEffectTheme(hovered: boolean) {
    if (!this.buttonEffectRect) return;
    if (this.buttonEffectClicks >= BUTTON_EFFECT_REQUIRED_CLICKS) return;

    const isLatePhase = this.buttonEffectCanReachA && this.buttonEffectClicks > 5;
    if (isLatePhase) {
      if (hovered) {
        this.buttonEffectRect.setFillStyle(0x8655e8, 1);
        this.buttonEffectRect.setStrokeStyle(4, 0xf4ebff, 1);
      } else {
        this.buttonEffectRect.setFillStyle(0x7341d8, 0.96);
        this.buttonEffectRect.setStrokeStyle(4, 0xe8daff, 0.95);
      }
      return;
    }

    if (hovered) {
      this.buttonEffectRect.setFillStyle(0xd43d3d, 1);
      this.buttonEffectRect.setStrokeStyle(4, 0xfff5f5, 1);
    } else {
      this.buttonEffectRect.setFillStyle(0xbf2f2f, 0.96);
      this.buttonEffectRect.setStrokeStyle(4, 0xffffff, 0.95);
    }
  }

  private onButtonEffectClick() {
    if (!this.isButtonEffectActive || this.isPaused || this.isGameOver) return;
    if (this.buttonEffectClicks >= BUTTON_EFFECT_REQUIRED_CLICKS) return;

    this.buttonEffectClicks++;
    this.perfectCount++;
    this.updateJudgementText();
    this.lifeValue = Math.min(100, this.lifeValue + 4);
    this.drawLifeBar();
    this.sound.play('clap');

    const targetScale = 1 + this.buttonEffectClicks * BUTTON_EFFECT_SCALE_STEP;
    if (this.buttonEffectContainer) {
      this.tweens.killTweensOf(this.buttonEffectContainer);
      this.tweens.add({
        targets: this.buttonEffectContainer,
        scaleX: targetScale,
        scaleY: targetScale,
        duration: 100,
        ease: 'Back.easeOut',
      });
    }

    this.buttonEffectProgress?.setText(`${this.buttonEffectClicks}/${BUTTON_EFFECT_REQUIRED_CLICKS}`);
    this.buttonEffectLabel?.setText(this.buttonEffectCanReachA && this.buttonEffectClicks > 5 ? '憂鬱藍調' : '嚴厲斥責');
    this.applyButtonEffectTheme(false);

    if (this.buttonEffectClicks >= BUTTON_EFFECT_REQUIRED_CLICKS) {
      this.buttonEffectRect?.disableInteractive();
      this.buttonEffectRect?.setFillStyle(0x2f9d44, 0.98);
      this.buttonEffectProgress?.setColor('#d7ffe0');

      // End this button section immediately once the required clicks are met,
      // instead of waiting for the remaining beats to elapse.
      this.beatTimer?.remove(false);
      this.time.delayedCall(0, () => this.onCheckPhaseEnd());
    }
  }

  private clearButtonEffectUI() {
    this.isButtonEffectActive = false;
    this.buttonEffectClicks = 0;
    this.buttonEffectContainer?.destroy(true);
    this.buttonEffectContainer = undefined;
    this.buttonEffectRect = undefined;
    this.buttonEffectProgress = undefined;
    this.buttonEffectLabel = undefined;
    this.buttonEffectCountdownTween?.stop();
    this.buttonEffectCountdownTween = undefined;
    this.buttonEffectCountdownRing?.destroy();
    this.buttonEffectCountdownRing = undefined;
    this.buttonEffectCountdownText?.destroy();
    this.buttonEffectCountdownText = undefined;
    this.buttonEffectCountdownDurationMs = 0;
    this.buttonEffectCountdownState.value = 1;
    if (!this.isGameOver && !this.isPaused) {
      this.input.setDefaultCursor('none');
    }
  }

  // ---------- Input ----------

  private onMouseMove(ptr: Phaser.Input.Pointer) {
    if (this.isGameOver) return;
    this.updateCursorPosition(ptr.x, ptr.y);
  }

  private getCursorPosition(): { x: number; y: number } {
    return { x: this.cursorWorldX, y: this.cursorWorldY };
  }

  private updateCursorPosition(x: number, y: number) {
    this.cursorWorldX = x;
    this.cursorWorldY = y;

    if (this.isGameOver) return;

    if (this.gamePhase === 'prompt') this.positionPromptGrid(x, y);
    this.updateGifCursorPosition(x, y);
    this.drawHitbox(x, y);

    if (this.gamePhase !== 'check' || this.isPaused) return;
    this.checkActiveHits(x, y);
  }

  private drawHitbox(x: number, y: number) {
    this.hitboxGraphics.clear();
    if (!this.isGameOver && (this.gamePhase === 'prompt' || this.gamePhase === 'check') && !this.isPaused && !this.isButtonEffectActive) {
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
    const centerScreenX = this.cursorWorldX * this.cursorScaleX;
    const centerScreenY = this.cursorWorldY * this.cursorScaleY;
    const localX = point.screenX - centerScreenX;
    const localY = point.screenY - centerScreenY;
    this.cursorCheckPointDot.style.transform = `translate3d(${localX}px, ${localY}px, 0) translate(-50%, -50%)`;
  }

  private isCursorDomBlockingCheckPoint(): boolean {
    if (!this.cursorClipFrame || !this.cursorGifFrame || !this.cursorGif) return false;
    return this.cursorClipFrame.style.display !== 'none'
      && this.cursorGifFrame.style.display !== 'none'
      && this.cursorWidth > 0
      && this.cursorHeight > 0;
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
    if (rect.top <= GAME_FRAME_TOP + d) touched.push('w');
    if (rect.bottom >= GAME_FRAME_BOTTOM - d) touched.push('x');
    if (rect.left <= GAME_FRAME_LEFT + d) touched.push('a');
    if (rect.right >= GAME_FRAME_RIGHT - d) touched.push('d');
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
    if (dir === 'q') return ['w', 'a'];
    if (dir === 'e') return ['w', 'd'];
    if (dir === 'z') return ['x', 'a'];
    if (dir === 'c') return ['x', 'd'];
    return CARDINAL_DIRS.includes(dir) ? [dir] : [];
  }

  private isPenaltyCooldownActive(): boolean {
    return this.time.now < this.penaltyCooldownUntil;
  }

  private shouldShowCardinalGuideLine(): boolean {
    return this.gamePhase === 'check' && !this.isGameOver;
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
    switch (dir) {
      case 'w':
        return point.worldY <= GAME_FRAME_TOP;
      case 'x':
        return point.worldY >= GAME_FRAME_BOTTOM;
      case 'a':
        return point.worldX <= GAME_FRAME_LEFT;
      case 'd':
        return point.worldX >= GAME_FRAME_RIGHT;
      default:
        return this.isDiagonalCornerLineHit(point.worldX, point.worldY, dir);
    }
  }

  private getInnerSquareDirectionPos(dir: Direction): { x: number; y: number } {
    const maxInset = Math.min(GAME_FRAME_WIDTH, GAME_FRAME_HEIGHT) / 2 - 10;
    const inset = Phaser.Math.Clamp(this.checkDepth() + 100, 0, maxInset);
    const left = GAME_FRAME_LEFT + inset;
    const right = GAME_FRAME_RIGHT - inset;
    const top = GAME_FRAME_TOP + inset;
    const bottom = GAME_FRAME_BOTTOM - inset;

    const positions: Record<Direction, { x: number; y: number }> = {
      w: { x: GAME_WIDTH / 2, y: top },
      e: { x: right, y: top },
      d: { x: right, y: GAME_HEIGHT / 2 },
      c: { x: right, y: bottom },
      x: { x: GAME_WIDTH / 2, y: bottom },
      z: { x: left, y: bottom },
      a: { x: left, y: GAME_HEIGHT / 2 },
      q: { x: left, y: top },
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
      cp.edgeLine?.setAlpha(1).setVisible(this.shouldShowCardinalGuideLine());
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
    this.lifeValue = Math.max(0, this.lifeValue - MISS_DAMAGE);
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
    text.style.zIndex = String(HTML_LAYER.JUDGEMENT_LABEL);
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
    if (this.isGameOver) return;

    this.isGameOver = true;
    this.clearButtonEffectUI();
    this.input.setDefaultCursor('default');
    this.beatTimer?.remove();
    this.stopAllShrinks();
    this.clearPromptGrid();
    this.stopStagePhaseClip();
    this.stopPromptAudioSequence();
    this.removeStorySamVideo();
    this.removeEndingVideoOverlay();
    this.sound.stopAll();
    this.sound.play('gameover_sfx');
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.hitboxGraphics.clear();
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const homeY = cy + 84;
    this.add.image(cx, cy, 'gameover_bg').setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(SCENE_LAYER.GAMEOVER_BG);
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.62).setDepth(SCENE_LAYER.GAMEOVER_DIM);
    const homeBtn = this.add.rectangle(cx, homeY, 320, 92, 0x9147ff, 0.96)
      .setStrokeStyle(3, 0xf3e8ff, 0.95)
      .setDepth(SCENE_LAYER.GAMEOVER_BUTTON)
      .setInteractive({ useHandCursor: true });
    const homeBtnLabel = this.add.text(cx, homeY, '返回主頁', { fontSize: '42px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(SCENE_LAYER.GAMEOVER_BUTTON_LABEL);
    homeBtn.on('pointerover', () => {
      homeBtn.setFillStyle(0xa45cff, 1);
      homeBtn.setStrokeStyle(3, 0xffffff, 1);
      homeBtnLabel.setScale(1.03);
    });
    homeBtn.on('pointerout', () => {
      homeBtn.setFillStyle(0x9147ff, 0.96);
      homeBtn.setStrokeStyle(3, 0xf3e8ff, 0.95);
      homeBtnLabel.setScale(1);
    });
    homeBtn.on('pointerdown', () => {
      homeBtn.setFillStyle(0x7b31ea, 1);
      homeBtnLabel.setScale(0.98);
      this.time.delayedCall(90, () => this.returnToMenu());
    });
  }

  // ---------- Pause ----------

  private setGameplayTimersPaused(paused: boolean) {
    if (this.beatTimer) this.beatTimer.paused = paused;
    if (paused) {
      this.pauseStagePhaseClip();
      this.pausePromptAudioSequence();
      this.pauseStorySamVideo();
    } else {
      this.resumeStagePhaseClip();
      this.resumePromptAudioSequence();
      this.resumeStorySamVideo();
    }
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
    if (this.buttonEffectCountdownTween) {
      if (paused) {
        this.buttonEffectCountdownTween.pause();
      } else {
        this.buttonEffectCountdownTween.resume();
      }
    }
    if (this.promptRotationTween) {
      if (paused) {
        this.promptRotationTween.pause();
      } else {
        this.promptRotationTween.resume();
      }
    }
  }

  private returnToMenu() {
    this.isPaused = false;
    this.clearButtonEffectUI();
    this.removeStorySamVideo();
    this.removeEndingVideoOverlay();
    this.stopStagePhaseClip();
    this.stopPromptAudioSequence();
    this.setGameplayTimersPaused(false);
    this.input.setDefaultCursor('default');
    this.setGifCursorVisible(false);
    this.pauseContainer.setVisible(false);
    this.countdownText.setVisible(false);
    this.beatTimer?.remove(false);
    this.promptRotationTween?.stop();
    this.stopAllShrinks();
    this.time.delayedCall(0, () => this.scene.start('MenuScene'));
  }

  private playStoryEndingSequence() {
    if (this.endingSequenceStarted || this.isGameOver) return;
    this.endingSequenceStarted = true;

    this.isPaused = false;
    this.clearButtonEffectUI();
    this.input.setDefaultCursor('default');
    this.pauseContainer?.setVisible(false);
    this.countdownText?.setVisible(false);
    this.beatTimer?.remove(false);
    this.promptRotationTween?.stop();
    this.stopAllShrinks();
    this.clearPromptGrid();
    this.stopStagePhaseClip();
    this.stopPromptAudioSequence();
    this.removeStorySamVideo();
    this.sound.stopAll();
    this.suppressGameFrameMask = true;
    this.setGameFrameMaskVisible(false);
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.hitboxGraphics.clear();

    this.playStoryEndingSequenceInternal().catch(() => {
      this.removeEndingVideoOverlay();
      this.returnToMenu();
    });
  }

  private async playStoryEndingSequenceInternal() {
    const { rank } = this.buildEndingSummary();
    if (rank === 'D') {
      await this.playEndingVideoWithSummaryAndReturn(endingDUrl);
    } else if (rank === 'C') {
      await this.playEndingVideoWithSummaryAndReturn(endingCUrl);
    } else if (rank === 'B') {
      await this.playEndingVideoWithSummaryAndReturn(endingBUrl);
    } else {
      await this.playEndingVideo(endingVideo1Url);
      await this.playEndingVideoWithSummaryAndReturn(endingVideo2Url);
    }
  }

  private playEndingVideo(videoUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.removeEndingVideoOverlay();
      this.createEndingVideoRoot(videoUrl);
      let completed = false;

      const complete = () => {
        if (completed) return;
        completed = true;
        this.removeEndingVideoOverlay();
        resolve();
      };

      if (!this.endingVideo) {
        complete();
        return;
      }

      this.endingVideo.addEventListener('ended', complete, { once: true });
      this.endingVideo.addEventListener('error', complete, { once: true });
      this.endingVideo.play().catch(() => {
        complete();
      });
    });
  }

  private playEndingVideoWithSummaryAndReturn(videoUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.removeEndingVideoOverlay();
      this.createEndingVideoRoot(videoUrl);
      this.createEndingSummaryCard();
      this.createEndingPromptText();
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        this.removeEndingVideoOverlay();
        this.returnToMenu();
        resolve();
      };

      const tryFinish = () => {
        if (!this.endingReturnReady) return;
        finish();
      };

      this.endingReturnReady = false;
      this.endingPromptText!.textContent = '讀取結算中...';
      this.endingReturnReadyEvent = this.time.delayedCall(ENDING_RETURN_COOLDOWN_MS, () => {
        this.endingReturnReady = true;
        if (this.endingPromptText) {
          this.endingPromptText.textContent = '按任意按鍵返回主選單';
        }
      });

      this.endingKeyHandler = () => tryFinish();
      this.endingPointerHandler = () => tryFinish();
      this.endingMouseHandler = () => tryFinish();
      this.endingTouchHandler = () => tryFinish();
      window.addEventListener('keydown', this.endingKeyHandler);
      window.addEventListener('pointerdown', this.endingPointerHandler);
      document.addEventListener('mousedown', this.endingMouseHandler, true);
      document.addEventListener('touchstart', this.endingTouchHandler, true);

      if (!this.endingVideo) {
        finish();
        return;
      }

      this.endingVideo.addEventListener('error', () => {
        // Video decode failure should not block returning to menu.
        this.endingReturnReady = true;
        if (this.endingPromptText) {
          this.endingPromptText.textContent = '按任意按鍵返回主選單';
        }
      }, { once: true });

      this.endingVideo.play().catch(() => {
        this.endingReturnReady = true;
        if (this.endingPromptText) {
          this.endingPromptText.textContent = '按任意按鍵返回主選單';
        }
      });
    });
  }

  private createEndingVideoRoot(videoUrl: string) {
    this.endingVideoRoot = document.createElement('div');
    this.endingVideoRoot.setAttribute(this.endingRootAttr, '1');
    this.endingVideoRoot.style.position = 'fixed';
    this.endingVideoRoot.style.pointerEvents = 'auto';
    this.endingVideoRoot.style.background = '#000000';
    this.endingVideoRoot.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO);
    this.endingVideoRoot.style.overflow = 'hidden';

    this.endingVideo = document.createElement('video');
    this.endingVideo.src = videoUrl;
    this.endingVideo.autoplay = true;
    this.endingVideo.loop = false;
    this.endingVideo.controls = false;
    this.endingVideo.volume = this.getMasterVolume();
    this.endingVideo.playsInline = true;
    this.endingVideo.preload = 'auto';
    this.endingVideo.style.width = '100%';
    this.endingVideo.style.height = '100%';
    this.endingVideo.style.objectFit = 'contain';
    this.endingVideo.style.background = '#000000';

    this.endingVideoRoot.appendChild(this.endingVideo);
    document.body.appendChild(this.endingVideoRoot);

    this.refreshEndingVideoBounds();
    window.addEventListener('resize', this.refreshEndingVideoBounds);
  }

  private createEndingSummaryCard() {
    if (!this.endingVideoRoot) return;

    const { accuracyPercent, rank, verdict } = this.buildEndingSummary();
    const scoreBar = this.buildEndingScoreBar(accuracyPercent, rank);

    this.endingSummaryCard = document.createElement('div');
    this.endingSummaryCard.style.position = 'absolute';
    this.endingSummaryCard.style.left = '50%';
    this.endingSummaryCard.style.top = '60%';
    this.endingSummaryCard.style.transform = 'translate(-50%, -50%)';
    this.endingSummaryCard.style.width = 'min(72vw, 620px)';
    this.endingSummaryCard.style.maxWidth = '92%';
    this.endingSummaryCard.style.padding = '22px 26px';
    this.endingSummaryCard.style.background = 'rgba(8, 12, 18, 0.74)';
    this.endingSummaryCard.style.border = '2px solid rgba(255, 255, 255, 0.84)';
    this.endingSummaryCard.style.borderRadius = '14px';
    this.endingSummaryCard.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.5)';
    this.endingSummaryCard.style.color = '#ffffff';
    this.endingSummaryCard.style.fontFamily = "'Noto Sans TC', 'PingFang TC', sans-serif";
    this.endingSummaryCard.style.pointerEvents = 'none';
    this.endingSummaryCard.innerHTML = [
      `<div style=\"font-size:40px;font-weight:800;letter-spacing:1px;line-height:1.05;margin-bottom:10px;\">Accuracy ${accuracyPercent} %</div>`,
      `<div style=\"font-size:30px;font-weight:800;color:#ffe082;letter-spacing:1px;margin-bottom:12px;\">評價 ${rank}</div>`,
      scoreBar,
      `<div style=\"font-size:26px;font-weight:700;line-height:1.3;margin-bottom:12px;\">${verdict}</div>`,
      `<div style=\"font-size:22px;line-height:1.55;color:#d9e3f0;\"><span style=\"color:#7cff8f;font-weight:700;\">Perfect ${this.perfectCount}</span> / <span style=\"color:#ff5a6b;font-weight:700;\">Miss ${this.missCount}</span> / <span style=\"color:#ffb14a;font-weight:700;\">X ${this.falseTouchCount}</span> / HP ${this.lifeValue}</div>`,
    ].join('');
    this.endingVideoRoot.appendChild(this.endingSummaryCard);
  }

  private buildEndingScoreBar(score: number, rank: string): string {
    const clampedScore = Phaser.Math.Clamp(score, 0, 100);
    const ranks = [
      { label: 'D', min: 0, color: '#355CFF' },
      { label: 'C', min: 70, color: '#17B7FF' },
      { label: 'B', min: 80, color: '#FF9F43' },
      { label: 'A', min: 90, color: '#FFC857' },
      { label: 'S', min: 95, color: '#FFE66D' },
      { label: 'S+', min: 99, color: '#8CE99A' },
      { label: 'S++', min: 100, color: '#52D681' },
    ];

    const markerNudgeX: Record<string, number> = {
      S: 0,
      'S+': 0,
      'S++': 14,
    };
    const markerBaseY = 96;
    const markerStemHeight = 60;
    const toNonLinearPercent = (min: number): number => {
      const t = Phaser.Math.Clamp(min / 100, 0, 1);
      // Expand the dense high-score range near 100 for readable marker spacing.
      const curved = 1 - Math.log10(1 + 9 * (1 - t));
      return Phaser.Math.Clamp(curved * 100, 0, 100);
    };
    const rankIndex = ranks.findIndex(item => item.label === rank);
    const rankUpperBound = rankIndex >= 0 && rankIndex < ranks.length - 1
      ? ranks[rankIndex + 1].min
      : 100;
    const scoreForDisplay = Math.min(clampedScore, rankUpperBound - (rankUpperBound < 100 ? 0 : 0.01));
    const scoreDisplayPercent = toNonLinearPercent(scoreForDisplay);
    const markerLefts = ranks.map(item => toNonLinearPercent(item.min));

    const markers = ranks.map(({ label, min, color }, index) => {
      const left = markerLefts[index];
      const isCurrentRank = label === rank;
      const nudgeX = markerNudgeX[label] ?? 0;
      const isLeftEdge = min === 0;
      const isRightEdge = min === 100;
      const anchorTransform = isLeftEdge ? 'translateX(0)' : isRightEdge ? 'translateX(-100%)' : 'translateX(-50%)';
      const stemLeft = isLeftEdge ? '0%' : isRightEdge ? '100%' : '50%';
      const stemTop = markerBaseY - markerStemHeight;
      const labelTop = stemTop - 18;
      const minTop = labelTop - 14;

      return `<div style=\"position:absolute;left:${left}%;top:0;transform:${anchorTransform};min-width:36px;\">`
        + `<div style=\"position:absolute;left:${stemLeft};top:${stemTop}px;transform:translateX(-50%);width:2px;height:${markerStemHeight}px;background:rgba(255,255,255,0.58);\"></div>`
        + `<div style=\"position:absolute;left:${stemLeft};top:${labelTop}px;transform:translateX(-50%);margin-left:${nudgeX}px;font-size:14px;font-weight:800;letter-spacing:0.08em;color:${isCurrentRank ? color : 'rgba(232, 239, 248, 0.88)'};white-space:nowrap;\">${label}</div>`
        + `<div style=\"position:absolute;left:${stemLeft};top:${minTop}px;transform:translateX(-50%);margin-left:${nudgeX}px;font-size:11px;color:rgba(217, 227, 240, 0.72);white-space:nowrap;\">${min}</div>`
        + `</div>`;
    }).join('');

    const gradientStops = ranks.flatMap((item, index) => {
      const start = toNonLinearPercent(item.min);
      const nextMin = index < ranks.length - 1 ? ranks[index + 1].min : 100;
      const end = Phaser.Math.Clamp(Math.max(start, toNonLinearPercent(nextMin)), 0, 100);
      return [`${item.color} ${start}%`, `${item.color} ${end}%`];
    }).join(', ');

    return [
      '<style>@keyframes sutoScoreTopFill{from{transform:scaleX(0);}to{transform:scaleX(1);}}</style>',
      '<div style="margin:0 0 16px;">',
      '<div style="display:flex;justify-content:flex-start;align-items:center;margin-bottom:8px;font-size:15px;font-weight:700;color:#d9e3f0;letter-spacing:0.04em;">',
      '<span>Score</span>',
      '</div>',
      '<div style="position:relative;padding-top:84px;padding-bottom:0px;">',
      '<div style="position:absolute;left:0;right:0;top:50px;height:40px;border-radius:999px;background:rgba(64, 120, 72, 0.35);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(140, 255, 162, 0.18);">',
      `<div style="width:${scoreDisplayPercent}%;height:100%;background:linear-gradient(90deg,#3cff84 0%,#31d66f 55%,#23b95d 100%);transform-origin:left center;transform:scaleX(0);animation:sutoScoreTopFill 0.5s ease-out forwards;"></div>`,
      '</div>',
      '<div style="position:relative;height:16px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.12);">',
      `<div style="position:absolute;inset:0;background:linear-gradient(90deg, ${gradientStops});"></div>`,
      '</div>',
      markers,
      '</div>',
      `<div style="display:flex;justify-content:flex-end;font-size:13px;font-weight:800;color:#ffffff;letter-spacing:0.04em;">${clampedScore} / 100</div>`,
      '</div>',
    ].join('');
  }

  private createEndingPromptText() {
    if (!this.endingVideoRoot) return;

    this.endingPromptText = document.createElement('div');
    this.endingPromptText.setAttribute(this.endingPromptAttr, '1');
    this.endingPromptText.style.position = 'absolute';
    this.endingPromptText.style.left = '50%';
    this.endingPromptText.style.bottom = '6%';
    this.endingPromptText.style.transform = 'translateX(-50%)';
    this.endingPromptText.style.color = '#ffffff';
    this.endingPromptText.style.fontFamily = "'Noto Sans TC', 'PingFang TC', sans-serif";
    this.endingPromptText.style.fontSize = '30px';
    this.endingPromptText.style.fontWeight = '800';
    this.endingPromptText.style.letterSpacing = '1px';
    this.endingPromptText.style.textShadow =
      '0 0 2px #000, 0 0 2px #000, 0 0 2px #000, 0 0 2px #000, 0 0 2px #000, 0 0 2px #000';
    this.endingPromptText.style.pointerEvents = 'none';
    this.endingVideoRoot.appendChild(this.endingPromptText);
  }

  private applyMasterVolume() {
    this.sound.volume = this.getMasterVolume();
    if (this.storySamVideo) this.storySamVideo.volume = this.getMasterVolume();
    if (this.endingVideo) this.endingVideo.volume = this.getMasterVolume();
  }

  private getMasterVolume(): number {
    return Phaser.Math.Clamp(this.settings?.masterVolume ?? DEFAULT_SETTINGS.masterVolume, 0, 1);
  }

  private computeRank(perfect: number, miss: number, falseTouch: number): string {
    const total = perfect + miss;
    const accuracy = total > 0 ? perfect / total : 1;
    const rawAccuracyPercent = Math.round(accuracy * 100);
    const accuracyPercent = falseTouch > 0 ? Math.min(99, rawAccuracyPercent) : rawAccuracyPercent;
    if (miss === 0) return falseTouch === 0 ? 'S++' : 'S+';
    if (accuracyPercent >= 95) return 'S';
    if (accuracyPercent >= 90) return 'A';
    if (accuracyPercent >= 80) return 'B';
    if (accuracyPercent >= 70) return 'C';
    return 'D';
  }

  private buildEndingSummary(): { accuracyPercent: number; rank: string; verdict: string } {
    const total = this.perfectCount + this.missCount;
    const accuracy = total > 0 ? this.perfectCount / total : 1;
    const rawAccuracyPercent = Math.round(accuracy * 100);
    const accuracyPercent = this.falseTouchCount > 0 ? Math.min(99, rawAccuracyPercent) : rawAccuracyPercent;
    const rank = this.computeRank(this.perfectCount, this.missCount, this.falseTouchCount);
    const verdicts: Record<string, string> = {
      'S++': '完美無缺！等等...你花這麼多時間練這個做什麼?',
      'S+':  '幾乎完美！你是控頭的神！<br>(沒有誤觸"X"判定才能S++喔)',
      'S':   '你比超負荷還快！',
      'A':   '欸欸欸不行太快了太快了',
      'B':   '還能再更快嗎?',
      'C':   '很快了, 再快一點',
      'D':   '太慢摟',
    };
    return { accuracyPercent, rank, verdict: verdicts[rank] ?? '' };
  }

  private removeEndingVideoOverlay() {
    window.removeEventListener('resize', this.refreshEndingVideoBounds);

    this.endingReturnReadyEvent?.remove(false);
    this.endingReturnReadyEvent = undefined;
    this.endingReturnReady = false;

    if (this.endingKeyHandler) {
      window.removeEventListener('keydown', this.endingKeyHandler);
      this.endingKeyHandler = undefined;
    }
    if (this.endingPointerHandler) {
      window.removeEventListener('pointerdown', this.endingPointerHandler);
      this.endingPointerHandler = undefined;
    }
    if (this.endingMouseHandler) {
      document.removeEventListener('mousedown', this.endingMouseHandler, true);
      this.endingMouseHandler = undefined;
    }
    if (this.endingTouchHandler) {
      document.removeEventListener('touchstart', this.endingTouchHandler, true);
      this.endingTouchHandler = undefined;
    }

    if (this.endingVideo) {
      this.endingVideo.pause();
      this.endingVideo.currentTime = 0;
      this.endingVideo.src = '';
      this.endingVideo.load();
      this.endingVideo.remove();
      this.endingVideo = undefined;
    }

    this.endingSummaryCard?.remove();
    this.endingSummaryCard = undefined;

    this.endingPromptText?.remove();
    this.endingPromptText = undefined;

    this.endingVideoRoot?.remove();
    this.endingVideoRoot = undefined;

    const staleRoots = document.querySelectorAll<HTMLDivElement>(`[${this.endingRootAttr}]`);
    staleRoots.forEach(node => node.remove());
  }

  private onEsc() {
    if (this.isPaused || this.endingSequenceStarted) return;
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
        this.input.setDefaultCursor(this.isButtonEffectActive ? 'default' : 'none');
        this.setGifCursorVisible(this.gamePhase === 'check' && !this.isButtonEffectActive);
      }
    };
    tick();
  }

  update() {
    this.debugController?.updateMetrics();
    if (this.gamePhase === 'check' && !this.isPaused && !this.isButtonEffectActive) {
      this.checkActiveHits(this.cursorWorldX, this.cursorWorldY);
    }
  }
}
