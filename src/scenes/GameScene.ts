import Phaser from 'phaser';
import suto400GifUrl from '../assets/suto400_2x.gif';
import {
  GAME_WIDTH, GAME_HEIGHT,
  DIR_ANGLE, ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX, ELLIPSE_RY,
  getCheckpointPos, getRotationPoints,
} from '../config';
import type { GameSettings, Direction } from '../config';
import { LEVEL_DATA } from '../levels';
import type { Stage, Section, NormalSection, RotationSection } from '../levels';

const ALL_DIRS: Direction[] = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL'];
const CHECKPOINT_RADIUS = 18;
const HIT_RADIUS = 30;

interface CheckpointUI {
  dir: Direction;
  pos: { x: number; y: number };
  outerCircle: Phaser.GameObjects.Arc;
  innerCircle: Phaser.GameObjects.Arc;
}

interface ActiveShrink {
  id: number;
  dir: Direction;
  hit: boolean;
  tween?: Phaser.Tweens.Tween;
}

export class GameScene extends Phaser.Scene {
  private settings!: GameSettings;
  private stageIndex!: number;
  private currentStage!: Stage;
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
  private cursorGifFrame!: HTMLDivElement;
  private cursorGif!: HTMLImageElement;
  private cursorGifAngle = { value: 180 };
  private cursorGifAngleTween?: Phaser.Tweens.Tween;
  private cursorScaleX = 1;
  private cursorScaleY = 1;
  private cursorCanvasLeft = 0;
  private cursorCanvasTop = 0;
  private cursorWidth = 0;
  private cursorHeight = 0;
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
    if (!this.cursorGifFrame || !this.cursorGif) return;

    const rect = this.game.canvas.getBoundingClientRect();
    this.cursorCanvasLeft = rect.left;
    this.cursorCanvasTop = rect.top;
    this.cursorScaleX = rect.width / GAME_WIDTH;
    this.cursorScaleY = rect.height / GAME_HEIGHT;

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
  private lifeBar!: Phaser.GameObjects.Graphics;
  private lifeValue = 100;
  private stageText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private beatTimer!: Phaser.Time.TimerEvent;

  // Prompt phase
  private isRotation = false;
  private rotCurrentDir: Direction = 'U';
  private promptImages: Phaser.GameObjects.Image[] = [];

  // Check phase
  private beatTargets: Direction[] = [];
  private beatTargetPairs: [Direction, Direction][] = [];
  private shrinkTweens: Map<Direction, Phaser.Tweens.Tween> = new Map();
  private shrinkStartEvents: Phaser.Time.TimerEvent[] = [];
  private activeShrinks: Map<number, ActiveShrink> = new Map();
  private activeShrinkIdsByDir: Map<Direction, number> = new Map();
  private nextShrinkId = 1;

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
  }

  create() {
    this.beatMs = 60000 / this.settings.bpm;
    this.currentStage = LEVEL_DATA.stages[this.stageIndex];
    this.sectionIndex = 0;
    this.lifeValue = 100;
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

  private drawEllipse() {
    this.ellipseGraphics.clear();
    if (this.settings.debugMode) {
      this.ellipseGraphics.lineStyle(2, 0xffffff, 1);
      this.ellipseGraphics.strokeEllipse(ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX * 2, ELLIPSE_RY * 2);
    }
  }

  private createHUD() {
    const cx = GAME_WIDTH / 2;
    this.stageText = this.add.text(cx, 24, '', { fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(10);
    this.roundText = this.add.text(cx, 58, '', { fontSize: '20px', color: '#cccccc' }).setOrigin(0.5, 0).setDepth(10);
    this.updateHUD();
  }

  private updateHUD() {
    this.stageText.setText(`Stage ${this.currentStage.stage_number}`);
    this.roundText.setText(`${this.sectionIndex + 1}/${this.currentStage.sections.length}`);
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
      const pos = getCheckpointPos(dir);
      const outer = this.add.arc(pos.x, pos.y, 60, 0, 360, false, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 1).setDepth(5);
      const inner = this.add.arc(pos.x, pos.y, CHECKPOINT_RADIUS, 0, 360, false, 0xffffff, 0.5).setDepth(5);
      this.checkpoints.push({ dir, pos, outerCircle: outer, innerCircle: inner });
    }
  }

  private setCheckpointsVisible(vis: boolean) {
    for (const cp of this.checkpoints) {
      cp.outerCircle.setVisible(vis);
      cp.innerCircle.setVisible(vis);
    }
  }

  private setInnerCheckpointsVisible(vis: boolean) {
    for (const cp of this.checkpoints) {
      cp.outerCircle.setVisible(false);
      cp.innerCircle.setVisible(vis);
    }
  }

  private createCursors() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.resetGifCursorCache();
    this.cursorGifFrame = document.createElement('div');
    this.cursorGifFrame.style.position = 'fixed';
    this.cursorGifFrame.style.pointerEvents = 'none';
    this.cursorGifFrame.style.left = '0';
    this.cursorGifFrame.style.top = '0';
    this.cursorGifFrame.style.transform = 'translate3d(-9999px, -9999px, 0) translate(-50%, -50%)';
    this.cursorGifFrame.style.willChange = 'transform';
    this.cursorGifFrame.style.zIndex = '10';
    this.cursorGifFrame.style.display = 'none';
    this.cursorGifFrame.style.overflow = 'hidden';
    this.cursorGifFrame.style.background = '#000';
    this.cursorGifFrame.style.border = '2px solid #fff';
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
    this.cursorGifFrame.appendChild(this.cursorGif);
    document.body.appendChild(this.cursorGifFrame);
    this.refreshGifCursorMetrics();
    this.setGifCursorAngle(this.cursorGifAngle.value);
    this.updateGifCursorPosition(cx, cy);
    window.addEventListener('resize', this.refreshGifCursorMetrics);
    this.input.setDefaultCursor('none');
  }

  private cleanupScene() {
    this.input.setDefaultCursor('default');
    this.setGifCursorVisible(false);
    this.cursorGifAngleTween?.stop();
    window.removeEventListener('resize', this.refreshGifCursorMetrics);
    this.cursorGifFrame?.remove();
    this.resetGifCursorCache();
    this.beatTimer?.remove(false);
    for (const event of this.shrinkStartEvents) event.remove(false);
    this.shrinkStartEvents = [];
    for (const t of this.shrinkTweens.values()) t.stop();
    this.shrinkTweens.clear();
    this.activeShrinks.clear();
    this.activeShrinkIdsByDir.clear();
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
        this.time.delayedCall(this.settings.shrinkLeadMs, () => this.onCheckPhaseEnd());
      }
    }
  }

  private onCheckPhaseEnd() {
    this.stopAllShrinks();
    this.setCheckpointsVisible(false);
    this.setGifCursorVisible(false);
    this.sectionIndex++;
    if (this.sectionIndex >= this.currentStage.sections.length) {
      this.stageIndex++;
      if (this.stageIndex >= LEVEL_DATA.stages.length) {
        this.time.delayedCall(500, () => this.scene.start('MenuScene'));
      } else {
        this.currentStage = LEVEL_DATA.stages[this.stageIndex];
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
  }

  private buildPromptGrid() {
    const pointer = this.input.activePointer;
    const x = pointer.x || GAME_WIDTH / 2;
    const y = pointer.y || GAME_HEIGHT / 2;

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
    const img = this.add.image(x, y, key).setDepth(15).setAlpha(0.4);
    img.setAngle(isDiagonal ? DIR_ANGLE[dir] - 45 : DIR_ANGLE[dir]);
    return img;
  }

  private positionPromptGrid(x: number, y: number) {
    const cols = 4;
    const rows = 2;
    const cellW = this.settings.hitboxWidth / cols;
    const cellH = this.settings.hitboxHeight / rows;
    const arrowSize = Math.max(24, Math.min(cellW, cellH) * 0.55);
    const startX = x - this.settings.hitboxWidth / 2 + cellW / 2;
    const startY = y - this.settings.hitboxHeight / 2 + cellH / 2;

    for (let i = 0; i < this.promptImages.length; i++) {
      this.promptImages[i]
        .setPosition(startX + (i % cols) * cellW, startY + Math.floor(i / cols) * cellH)
        .setDisplaySize(arrowSize, arrowSize);
    }
  }

  private highlightPromptBeat(beat: number) {
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
      for (let i = 0; i < this.promptImages.length; i++) {
        this.promptImages[i].setAlpha(i === beat ? 1 : 0.35);
      }
    }
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

    const existing = this.shrinkTweens.get(dir);
    if (existing) existing.stop();

    const delay = Math.max(0, this.beatMs - leadMs);
    const event = this.time.delayedCall(delay, () => {
      const id = this.nextShrinkId++;
      const active: ActiveShrink = { id, dir, hit: false };
      this.activeShrinks.set(id, active);
      this.activeShrinkIdsByDir.set(dir, id);
      outer.setVisible(true);
      const t = this.tweens.add({
        targets: outer,
        radius: CHECKPOINT_RADIUS,
        duration: leadMs,
        ease: 'Linear',
        onComplete: () => this.finishShrink(id),
      });
      active.tween = t;
      this.shrinkTweens.set(dir, t);
      this.checkActiveHits(this.input.activePointer.x, this.input.activePointer.y);
    });
    this.shrinkStartEvents.push(event);
  }

  private finishShrink(id: number) {
    const active = this.activeShrinks.get(id);
    if (!active) return;

    if (!active.hit) this.onMiss(active.dir);

    this.activeShrinks.delete(id);
    if (this.activeShrinkIdsByDir.get(active.dir) === id) {
      this.activeShrinkIdsByDir.delete(active.dir);
      this.shrinkTweens.delete(active.dir);
      const cp = this.checkpoints.find(c => c.dir === active.dir)!;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
    }
  }

  private stopAllShrinks() {
    for (const event of this.shrinkStartEvents) event.remove(false);
    this.shrinkStartEvents = [];
    for (const t of this.shrinkTweens.values()) t.stop();
    this.shrinkTweens.clear();
    this.activeShrinks.clear();
    this.activeShrinkIdsByDir.clear();
    this.cursorGifAngleTween?.stop();
    for (const cp of this.checkpoints) {
      if (!cp.outerCircle.active || !cp.outerCircle.geom) continue;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
    }
  }

  // ---------- Input ----------

  private onMouseMove(ptr: Phaser.Input.Pointer) {
    const { x, y } = ptr;
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

  private checkActiveHits(x: number, y: number) {
    for (const active of this.activeShrinks.values()) {
      if (!active.hit && this.checkHit(x, y, active.dir)) {
        this.resolvePerfect(active);
      }
    }
  }

  private setGifCursorVisible(visible: boolean) {
    if (!this.cursorGifFrame) return;

    this.cursorGifFrame.style.display = visible ? 'block' : 'none';
    if (visible) {
      const pointer = this.input.activePointer;
      this.updateGifCursorPosition(pointer.x, pointer.y);
    }
  }

  private updateGifCursorPosition(x: number, y: number) {
    if (!this.cursorGifFrame || !this.cursorGif) return;
    if (this.cursorWidth === 0 || this.cursorHeight === 0) {
      this.refreshGifCursorMetrics();
    }
    if (x === this.lastCursorX && y === this.lastCursorY) return;

    this.lastCursorX = x;
    this.lastCursorY = y;
    const screenX = this.cursorCanvasLeft + x * this.cursorScaleX;
    const screenY = this.cursorCanvasTop + y * this.cursorScaleY;
    this.cursorGifFrame.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`;
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
  }

  private checkHit(mx: number, my: number, dir: Direction): boolean {
    const pos = getCheckpointPos(dir);
    const hw = this.settings.hitboxWidth / 2, hh = this.settings.hitboxHeight / 2;
    const cx = Phaser.Math.Clamp(pos.x, mx - hw, mx + hw);
    const cy = Phaser.Math.Clamp(pos.y, my - hh, my + hh);
    const dx = pos.x - cx, dy = pos.y - cy;
    return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS;
  }

  private resolvePerfect(active: ActiveShrink) {
    active.hit = true;
    active.tween?.stop();
    this.activeShrinks.delete(active.id);

    if (this.activeShrinkIdsByDir.get(active.dir) === active.id) {
      this.activeShrinkIdsByDir.delete(active.dir);
      this.shrinkTweens.delete(active.dir);
    }

    const cp = this.checkpoints.find(c => c.dir === active.dir)!;
    cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
    this.onPerfect(active.dir);
  }

  private onPerfect(dir: Direction) {
    this.lifeValue = Math.min(100, this.lifeValue + 5);
    this.drawLifeBar();
    this.showJudgement(dir, 'perfect', '#7cff8f');
    this.flashOverlay.setAlpha(0.35);
    this.tweens.add({ targets: this.flashOverlay, alpha: 0, duration: 180, ease: 'Linear' });
  }

  private onMiss(dir: Direction) {
    this.lifeValue = Math.max(0, this.lifeValue - 20);
    this.drawLifeBar();
    this.showJudgement(dir, 'miss', '#ff5a6b');
    if (this.lifeValue <= 0) this.triggerGameOver();
  }

  private showJudgement(dir: Direction, label: 'perfect' | 'miss', color: string) {
    const pos = getCheckpointPos(dir);
    const text = this.add.text(pos.x, pos.y - 48, label, {
      fontSize: label === 'perfect' ? '34px' : '30px',
      color,
      fontStyle: 'bold',
      stroke: '#111118',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({
      targets: text,
      y: text.y - 28,
      alpha: 1,
      scale: label === 'perfect' ? 1.14 : 1,
      duration: 120,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          y: text.y - 18,
          alpha: 0,
          duration: 420,
          ease: 'Quad.easeIn',
          onComplete: () => text.destroy(),
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
    if (this.settings.debugMode) this.drawEllipse();
  }
}
