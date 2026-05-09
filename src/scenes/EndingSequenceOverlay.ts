import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { HTML_LAYER } from '../layers';
import { UI_CJK_FONT_FAMILY } from '../uiFonts';
import { EndingCelebrationParticleSystem } from './EndingCelebrationParticleSystem.ts';
import {
  ENDING_RANKS,
  buildEndingSummary,
  clampScore,
  getEndingScoreDisplayPercent,
  type EndingSummaryInput,
  type EndingSummaryResult,
} from './shared/endingSummary.ts';

const ENDING_RETURN_COOLDOWN_MS = 1000;
const ENDING_ROOT_ATTR = 'data-suto-ending-root';
const ENDING_PROMPT_ATTR = 'data-suto-ending-prompt';

interface EndingSequenceOverlayOptions {
  scene: Phaser.Scene;
  getMasterVolume: () => number;
  onReturnToMenu: () => void;
}

export class EndingSequenceOverlay {
  private readonly scene: Phaser.Scene;
  private readonly getMasterVolume: () => number;
  private readonly onReturnToMenu: () => void;

  private endingVideoRoot?: HTMLDivElement;
  private endingVideo?: HTMLVideoElement;
  private endingSummaryCard?: HTMLDivElement;
  private endingPromptText?: HTMLDivElement;
  private endingCelebrationFx?: EndingCelebrationParticleSystem;
  private endingReturnReady = false;
  private endingReturnReadyEvent?: Phaser.Time.TimerEvent;
  private endingKeyHandler?: (event: KeyboardEvent) => void;
  private endingPointerHandler?: (event: PointerEvent) => void;
  private endingMouseHandler?: (event: MouseEvent) => void;
  private endingTouchHandler?: (event: TouchEvent) => void;

  private readonly endingUiScaleCssVar = '--suto-ending-ui-scale';

  constructor(options: EndingSequenceOverlayOptions) {
    this.scene = options.scene;
    this.getMasterVolume = options.getMasterVolume;
    this.onReturnToMenu = options.onReturnToMenu;
  }

  playEndingVideo(videoUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.removeOverlay();
      this.createEndingVideoRoot(videoUrl, false);
      let completed = false;

      const complete = () => {
        if (completed) return;
        completed = true;
        this.removeOverlay();
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

  playEndingVideoWithSummaryAndReturn(videoUrl: string, summary: EndingSummaryInput, loop = false): Promise<void> {
    return new Promise((resolve) => {
      this.removeOverlay();
      this.createEndingVideoRoot(videoUrl, loop);
      this.startEndingCelebrationParticles();
      this.createEndingSummaryCard(summary);
      this.createEndingPromptText();
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        this.removeOverlay();
        this.onReturnToMenu();
        resolve();
      };

      const tryFinish = () => {
        if (!this.endingReturnReady) return;
        finish();
      };

      this.endingReturnReady = false;
      if (this.endingPromptText) {
        this.endingPromptText.textContent = '---------';
      }
      this.endingReturnReadyEvent = this.scene.time.delayedCall(ENDING_RETURN_COOLDOWN_MS, () => {
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

  buildEndingSummary(summary: EndingSummaryInput): EndingSummaryResult {
    return buildEndingSummary(summary);
  }

  syncVideoVolume() {
    if (this.endingVideo) {
      this.endingVideo.volume = this.getMasterVolume();
    }
  }

  removeOverlay() {
    window.removeEventListener('resize', this.refreshEndingVideoBounds);
    this.stopEndingCelebrationParticles();

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

    const staleRoots = document.querySelectorAll<HTMLDivElement>(`[${ENDING_ROOT_ATTR}]`);
    staleRoots.forEach(node => node.remove());
  }

  private readonly refreshEndingVideoBounds = () => {
    if (!this.endingVideoRoot) return;
    const rect = this.scene.game.canvas.getBoundingClientRect();
    this.endingVideoRoot.style.left = `${rect.left}px`;
    this.endingVideoRoot.style.top = `${rect.top}px`;
    this.endingVideoRoot.style.width = `${rect.width}px`;
    this.endingVideoRoot.style.height = `${rect.height}px`;
    this.endingVideoRoot.style.setProperty(this.endingUiScaleCssVar, String(this.getEndingUiScale(rect)));
    this.endingCelebrationFx?.resize();
  };

  private createEndingVideoRoot(videoUrl: string, loop: boolean) {
    this.endingVideoRoot = document.createElement('div');
    this.endingVideoRoot.setAttribute(ENDING_ROOT_ATTR, '1');
    this.endingVideoRoot.style.position = 'fixed';
    this.endingVideoRoot.style.pointerEvents = 'auto';
    this.endingVideoRoot.style.background = '#000000';
    this.endingVideoRoot.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO);
    this.endingVideoRoot.style.overflow = 'hidden';
    this.endingVideoRoot.style.setProperty(this.endingUiScaleCssVar, '1');

    this.endingVideo = document.createElement('video');
    this.endingVideo.src = videoUrl;
    this.endingVideo.autoplay = true;
    this.endingVideo.loop = loop;
    this.endingVideo.controls = false;
    this.endingVideo.volume = this.getMasterVolume();
    this.endingVideo.playsInline = true;
    this.endingVideo.preload = 'auto';
    this.endingVideo.style.width = '100%';
    this.endingVideo.style.height = '100%';
    this.endingVideo.style.objectFit = 'contain';
    this.endingVideo.style.background = '#000000';
    this.endingVideo.style.position = 'absolute';
    this.endingVideo.style.inset = '0';
    this.endingVideo.style.zIndex = '1';

    this.endingVideoRoot.appendChild(this.endingVideo);
    document.body.appendChild(this.endingVideoRoot);

    this.refreshEndingVideoBounds();
    window.addEventListener('resize', this.refreshEndingVideoBounds);
  }

  private createEndingSummaryCard(summary: EndingSummaryInput) {
    if (!this.endingVideoRoot) return;

    const { accuracyPercent, rank, verdict } = this.buildEndingSummary(summary);
    const scoreBar = this.buildEndingScoreBar(accuracyPercent, rank);
    const px = (value: number) => this.scaledUiPx(value);

    this.endingSummaryCard = document.createElement('div');
    this.endingSummaryCard.style.position = 'absolute';
    this.endingSummaryCard.style.left = '50%';
    this.endingSummaryCard.style.top = '35%';
    this.endingSummaryCard.style.bottom = '10%';
    this.endingSummaryCard.style.transform = 'translateX(-50%)';
    this.endingSummaryCard.style.width = `min(72%, ${px(620)})`;
    this.endingSummaryCard.style.maxWidth = '92%';
    this.endingSummaryCard.style.padding = `${px(22)} ${px(26)}`;
    this.endingSummaryCard.style.background = 'rgba(8, 12, 18, 0.74)';
    this.endingSummaryCard.style.border = `${px(2)} solid rgba(255, 255, 255, 0.84)`;
    this.endingSummaryCard.style.borderRadius = px(14);
    this.endingSummaryCard.style.boxShadow = `0 ${px(16)} ${px(36)} rgba(0, 0, 0, 0.5)`;
    this.endingSummaryCard.style.color = '#ffffff';
    this.endingSummaryCard.style.fontFamily = UI_CJK_FONT_FAMILY;
    this.endingSummaryCard.style.display = 'flex';
    this.endingSummaryCard.style.flexDirection = 'column';
    this.endingSummaryCard.style.justifyContent = 'center';
    this.endingSummaryCard.style.pointerEvents = 'none';
    this.endingSummaryCard.style.zIndex = '10';
    this.endingSummaryCard.innerHTML = [
      `<div style=\"font-size:${px(40)};font-weight:800;letter-spacing:${px(1)};line-height:1.05;margin-bottom:${px(10)};\">Accuracy ${accuracyPercent} %</div>`,
      `<div style=\"font-size:${px(30)};font-weight:800;color:#ffe082;letter-spacing:${px(1)};margin-bottom:${px(12)};\">評價 ${rank}</div>`,
      scoreBar,
      `<div style=\"font-size:${px(26)};font-weight:700;line-height:1.3;margin-bottom:${px(12)};color:#7a7a7a;\">${verdict}</div>`,
      `<div style=\"font-size:${px(22)};line-height:1.55;color:#d9e3f0;\"><span style=\"color:#7cff8f;font-weight:700;\">Perfect ${summary.perfectCount}</span> / <span style=\"color:#ff5a6b;font-weight:700;\">Miss ${summary.missCount}</span> / <span style=\"color:#ffb14a;font-weight:700;\">X ${summary.falseTouchCount}</span> / HP ${summary.lifeValue}</div>`,
    ].join('');
    this.endingVideoRoot.appendChild(this.endingSummaryCard);
  }

  private buildEndingScoreBar(score: number, rank: string): string {
    const clampedScore = clampScore(score);
    const ranks = ENDING_RANKS;
    const px = (value: number) => this.scaledUiPx(value);

    const markerNudgeX: Record<string, number> = {
      S: 0,
      'S+': 0,
      'S++': 14,
    };
    const markerBaseY = 96;
    const markerStemHeight = 60;
    const rankIndex = ranks.findIndex(item => item.label === rank);
    const aRankIndex = ranks.findIndex(item => item.label === 'A');
    const hasReachedSpecialEvent = rankIndex >= 0 && aRankIndex >= 0 && rankIndex >= aRankIndex;
    const rankUpperBound = rankIndex >= 0 && rankIndex < ranks.length - 1
      ? ranks[rankIndex + 1].min
      : 100;
    const scoreForDisplay = Math.min(clampedScore, rankUpperBound - (rankUpperBound < 100 ? 0 : 0.01));
    const scoreDisplayPercent = getEndingScoreDisplayPercent(scoreForDisplay);
    const markerLefts = ranks.map(item => getEndingScoreDisplayPercent(item.min));

    const markers = ranks.map(({ label, min, color }, index) => {
      const left = markerLefts[index];
      const isCurrentRank = label === rank;
      const isSpecialEventMarker = label === 'A';
      const nudgeX = markerNudgeX[label] ?? 0;
      const isLeftEdge = min === 0;
      const isRightEdge = min === 100;
      const anchorTransform = isLeftEdge ? 'translateX(0)' : isRightEdge ? 'translateX(-100%)' : 'translateX(-50%)';
      const stemLeft = isLeftEdge ? '0%' : isRightEdge ? '100%' : '50%';
      const stemTop = markerBaseY - markerStemHeight;
      const labelTop = stemTop - 18;
      const minTop = labelTop - 14;

      return `<div style=\"position:absolute;left:${left}%;top:0;transform:${anchorTransform};min-width:${px(36)};\">`
        + `<div style=\"position:absolute;left:${stemLeft};top:${px(stemTop)};transform:translateX(-50%);width:${px(2)};height:${px(markerStemHeight)};background:rgba(255,255,255,0.58);\"></div>`
        + (isSpecialEventMarker
          ? `${hasReachedSpecialEvent
            ? `<div style=\"position:absolute;left:${stemLeft};top:${px(minTop - 42)};transform:translateX(-50%);margin-left:${px(nudgeX)};padding:${px(1)} ${px(8)};border-radius:999px;border:${px(1)} solid rgba(146,255,190,0.85);background:rgba(16,45,32,0.9);font-size:${px(10)};font-weight:800;letter-spacing:0.06em;color:#b6ffd2;white-space:nowrap;\">已達成!</div>`
            : ''}<div style=\"position:absolute;left:${stemLeft};top:${px(minTop - 20)};transform:translateX(-50%);margin-left:${px(nudgeX)};padding:${px(1)} ${px(8)};border-radius:999px;border:${px(1)} solid rgba(255,220,150,0.85);background:rgba(23,28,38,0.9);font-size:${px(10)};font-weight:800;letter-spacing:0.06em;color:#ffe4a3;white-space:nowrap;\">特殊事件</div>`
          : '')
        + `<div style=\"position:absolute;left:${stemLeft};top:${px(labelTop)};transform:translateX(-50%);margin-left:${px(nudgeX)};font-size:${px(14)};font-weight:800;letter-spacing:0.08em;color:${isCurrentRank ? color : 'rgba(232, 239, 248, 0.88)'};white-space:nowrap;\">${label}</div>`
        + `<div style=\"position:absolute;left:${stemLeft};top:${px(minTop)};transform:translateX(-50%);margin-left:${px(nudgeX)};font-size:${px(11)};color:rgba(217, 227, 240, 0.72);white-space:nowrap;\">${min}</div>`
        + `</div>`;
    }).join('');

    const gradientStops = ranks.flatMap((item, index) => {
      const start = getEndingScoreDisplayPercent(item.min);
      const nextMin = index < ranks.length - 1 ? ranks[index + 1].min : 100;
      const end = clampScore(Math.max(start, getEndingScoreDisplayPercent(nextMin)));
      return [`${item.color} ${start}%`, `${item.color} ${end}%`];
    }).join(', ');

    return [
      '<style>@keyframes sutoScoreTopFill{from{transform:scaleX(0);}to{transform:scaleX(1);}}</style>',
      `<div style="margin:0 0 ${px(16)};">`,
      `<div style="display:flex;justify-content:flex-start;align-items:center;margin-bottom:${px(8)};font-size:${px(15)};font-weight:700;color:#d9e3f0;letter-spacing:0.04em;">`,
      '<span>Score</span>',
      '</div>',
      `<div style="position:relative;padding-top:${px(84)};padding-bottom:0;">`,
      `<div style="position:absolute;left:0;right:0;top:${px(50)};height:${px(40)};border-radius:999px;background:rgba(64, 120, 72, 0.35);overflow:hidden;box-shadow:inset 0 0 0 ${px(1)} rgba(140, 255, 162, 0.18);">`,
      `<div style="width:${scoreDisplayPercent}%;height:100%;background:linear-gradient(90deg,#3cff84 0%,#31d66f 55%,#23b95d 100%);transform-origin:left center;transform:scaleX(0);animation:sutoScoreTopFill 0.5s ease-out forwards;"></div>`,
      '</div>',
      `<div style="position:relative;height:${px(16)};border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.12);box-shadow:inset 0 0 0 ${px(1)} rgba(255,255,255,0.12);">`,
      `<div style="position:absolute;inset:0;background:linear-gradient(90deg, ${gradientStops});"></div>`,
      '</div>',
      markers,
      '</div>',
      `<div style="display:flex;justify-content:flex-end;font-size:${px(13)};font-weight:800;color:#ffffff;letter-spacing:0.04em;">${clampedScore} / 100</div>`,
      '</div>',
    ].join('');
  }

  private createEndingPromptText() {
    if (!this.endingVideoRoot) return;

    this.endingPromptText = document.createElement('div');
    this.endingPromptText.setAttribute(ENDING_PROMPT_ATTR, '1');
    this.endingPromptText.style.position = 'absolute';
    this.endingPromptText.style.left = '50%';
    this.endingPromptText.style.bottom = '6%';
    this.endingPromptText.style.transform = 'translateX(-50%)';
    this.endingPromptText.style.color = '#ffffff';
    this.endingPromptText.style.fontFamily = UI_CJK_FONT_FAMILY;
    this.endingPromptText.style.fontSize = this.scaledUiPx(30);
    this.endingPromptText.style.fontWeight = '800';
    this.endingPromptText.style.letterSpacing = this.scaledUiPx(1);
    this.endingPromptText.style.textShadow =
      `0 0 ${this.scaledUiPx(2)} #000, 0 0 ${this.scaledUiPx(2)} #000, 0 0 ${this.scaledUiPx(2)} #000, 0 0 ${this.scaledUiPx(2)} #000, 0 0 ${this.scaledUiPx(2)} #000, 0 0 ${this.scaledUiPx(2)} #000`;
    this.endingPromptText.style.pointerEvents = 'none';
    this.endingPromptText.style.zIndex = '11';
    this.endingVideoRoot.appendChild(this.endingPromptText);
  }

  private getEndingUiScale(rect: Pick<DOMRect, 'width' | 'height'>): number {
    return Phaser.Math.Clamp(Math.min(rect.width / GAME_WIDTH, rect.height / GAME_HEIGHT), 0.65, 1);
  }

  private scaledUiPx(value: number): string {
    return `calc(${value}px * var(${this.endingUiScaleCssVar}, 1))`;
  }

  private startEndingCelebrationParticles() {
    if (!this.endingVideoRoot) return;

    this.stopEndingCelebrationParticles();
    this.endingCelebrationFx = new EndingCelebrationParticleSystem();
    this.endingCelebrationFx.start(this.endingVideoRoot);
  }

  private stopEndingCelebrationParticles() {
    this.endingCelebrationFx?.stop();
    this.endingCelebrationFx = undefined;
  }
}
