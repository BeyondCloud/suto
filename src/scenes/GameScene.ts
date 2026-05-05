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
  private cursorStatic!: Phaser.GameObjects.Image;
  private cursorGif!: HTMLImageElement;
  private cursorGifVisible = false;
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
    this.load.image('suto400_static', 'src/assets/suto400.png');
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
    this.cursorStatic = this.add.image(cx, cy, 'suto400_static')
      .setDisplaySize(this.settings.hitboxWidth, this.settings.hitboxHeight)
      .setDepth(20).setVisible(false).setAlpha(0.85);
    this.cursorGif = document.createElement('img');
    this.cursorGif.src = suto400GifUrl;
    this.cursorGif.alt = '';
    this.cursorGif.draggable = false;
    this.cursorGif.style.position = 'fixed';
    this.cursorGif.style.pointerEvents = 'none';
    this.cursorGif.style.transform = 'translate(-50%, -50%)';
    this.cursorGif.style.opacity = '0.85';
    this.cursorGif.style.zIndex = '10';
    this.cursorGif.style.display = 'none';
    document.body.appendChild(this.cursorGif);
    this.updateGifCursorPosition(cx, cy);
    this.input.setDefaultCursor('none');
  }

  private cleanupScene() {
    this.input.setDefaultCursor('default');
    this.setGifCursorVisible(false);
    this.cursorGif?.remove();
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
    this.cursorStatic.setVisible(true);
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
    this.cursorStatic.setVisible(false);
    this.setGifCursorVisible(true);
    this.beatCount = 0;
    this.buildBeatTargets();

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
    const cols = 4, cellW = 100, cellH = 100;
    const startX = GAME_WIDTH / 2 - (cols * cellW) / 2 + cellW / 2;
    const startY = GAME_HEIGHT / 2 - (2 * cellH) / 2 + cellH / 2;

    if (this.isRotation) {
      const sec = this.currentSection as RotationSection;
      this.rotCurrentDir = sec.start;
      for (let i = 0; i < 8; i++) {
        const x = startX + (i % cols) * cellW;
        const y = startY + Math.floor(i / cols) * cellH;
        this.promptImages.push(this.addArrowImage(x, y, sec.start));
      }
    } else {
      const sec = this.currentSection as NormalSection;
      for (let i = 0; i < 8; i++) {
        const x = startX + (i % cols) * cellW;
        const y = startY + Math.floor(i / cols) * cellH;
        this.promptImages.push(this.addArrowImage(x, y, sec.prompts[i]));
      }
    }
  }

  private addArrowImage(x: number, y: number, dir: Direction): Phaser.GameObjects.Image {
    const isDiagonal = dir === 'UL' || dir === 'UR' || dir === 'DL' || dir === 'DR';
    const key = isDiagonal ? 'down_left' : 'down';
    const img = this.add.image(x, y, key).setDisplaySize(70, 70).setDepth(15).setAlpha(0.4);
    img.setAngle(isDiagonal ? DIR_ANGLE[dir] - 45 : DIR_ANGLE[dir]);
    return img;
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
      this.startShrink(first, lead);
      const secondShrinkEvent = this.time.delayedCall(this.beatMs / 2, () => this.startShrink(second, lead));
      this.shrinkStartEvents.push(secondShrinkEvent);
    } else {
      this.startShrink(this.beatTargets[beat], lead);
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
    for (const cp of this.checkpoints) {
      if (!cp.outerCircle.active || !cp.outerCircle.geom) continue;
      cp.outerCircle.setRadius(60).setAlpha(1).setVisible(false);
    }
  }

  // ---------- Input ----------

  private onMouseMove(ptr: Phaser.Input.Pointer) {
    const { x, y } = ptr;
    this.cursorStatic.setPosition(x, y);
    this.updateGifCursorPosition(x, y);

    this.hitboxGraphics.clear();
    if (this.settings.debugMode && this.gamePhase === 'check') {
      this.hitboxGraphics.lineStyle(2, 0x00ff00, 1);
      this.hitboxGraphics.strokeRect(x - this.settings.hitboxWidth / 2, y - this.settings.hitboxHeight / 2, this.settings.hitboxWidth, this.settings.hitboxHeight);
    }

    if (this.gamePhase !== 'check' || this.isPaused) return;
    this.checkActiveHits(x, y);
  }

  private checkActiveHits(x: number, y: number) {
    for (const active of this.activeShrinks.values()) {
      if (!active.hit && this.checkHit(x, y, active.dir)) {
        this.resolvePerfect(active);
      }
    }
  }

  private setGifCursorVisible(visible: boolean) {
    this.cursorGifVisible = visible;
    if (!this.cursorGif) return;

    this.cursorGif.style.display = visible ? 'block' : 'none';
    if (visible) {
      const pointer = this.input.activePointer;
      this.updateGifCursorPosition(pointer.x, pointer.y);
    }
  }

  private updateGifCursorPosition(x: number, y: number) {
    if (!this.cursorGif) return;

    const rect = this.game.canvas.getBoundingClientRect();
    const scaleX = rect.width / GAME_WIDTH;
    const scaleY = rect.height / GAME_HEIGHT;
    this.cursorGif.style.left = `${rect.left + x * scaleX}px`;
    this.cursorGif.style.top = `${rect.top + y * scaleY}px`;
    this.cursorGif.style.width = `${this.settings.hitboxWidth * scaleX}px`;
    this.cursorGif.style.height = `${this.settings.hitboxHeight * scaleY}px`;
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
    this.cursorStatic.setVisible(false);
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
    if (this.cursorGifVisible) {
      const pointer = this.input.activePointer;
      this.updateGifCursorPosition(pointer.x, pointer.y);
    }
  }
}
