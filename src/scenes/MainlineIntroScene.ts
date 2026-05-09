import Phaser from 'phaser';
import openingVideoUrl from '../assets/mp4/開頭影片.mp4';
import tutorial2VideoUrl from '../assets/tutorial-2.mp4';
import type { GameSettings } from '../config';
import { DEFAULT_SETTINGS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { HTML_LAYER, SCENE_LAYER } from '../layers';
import { MAIN_LEVEL_DATA } from '../levels';
import { UI_CJK_FONT_FAMILY } from '../uiFonts';

const INTRO_COUNTDOWN_BPM = 183.5;

export class MainlineIntroScene extends Phaser.Scene {
  private settings!: GameSettings;
  private openingRoot?: HTMLDivElement;
  private openingVideo?: HTMLVideoElement;
  private tutorial2Root?: HTMLDivElement;
  private tutorial2Video?: HTMLVideoElement;
  private tutorial2PromptRoot?: HTMLDivElement;
  private tutorial2ConfirmKeyHandler?: (event: KeyboardEvent) => void;
  private tutorial2ConfirmPointerHandler?: (event: PointerEvent) => void;
  private tutorial2ConfirmMouseHandler?: (event: MouseEvent) => void;
  private tutorial2ConfirmTouchHandler?: (event: TouchEvent) => void;
  private tutorial2ConfirmDomHandler?: (event: Event) => void;
  private tutorialLoopSound?: Phaser.Sound.BaseSound;
  private continuePromptText?: Phaser.GameObjects.Text;
  private tutorialDisplayRect?: { x: number; y: number; width: number; height: number };
  private readonly openingLastFrameTextureKey = 'opening_last_frame';
  private tutorial2StartRequested = false;
  private readonly tutorial2RootAttr = 'data-suto-tutorial2-root';
  private readonly tutorial2PromptAttr = 'data-suto-tutorial2-prompt';

  private readonly refreshOpeningVideoBounds = () => {
    const rect = this.game.canvas.getBoundingClientRect();
    if (this.openingRoot) {
      this.openingRoot.style.left = `${rect.left}px`;
      this.openingRoot.style.top = `${rect.top}px`;
      this.openingRoot.style.width = `${rect.width}px`;
      this.openingRoot.style.height = `${rect.height}px`;
    }
    if (this.tutorial2Root) {
      const scaleX = rect.width / GAME_WIDTH;
      const scaleY = rect.height / GAME_HEIGHT;
      const target = this.tutorialDisplayRect ?? {
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT / 2,
        width: GAME_WIDTH * 0.92,
        height: GAME_HEIGHT * 0.84,
      };
      const left = rect.left + (target.x - target.width / 2) * scaleX;
      const top = rect.top + (target.y - target.height / 2) * scaleY;
      this.tutorial2Root.style.left = `${left}px`;
      this.tutorial2Root.style.top = `${top}px`;
      this.tutorial2Root.style.width = `${target.width * scaleX}px`;
      this.tutorial2Root.style.height = `${target.height * scaleY}px`;
    }
    if (this.tutorial2PromptRoot) {
      const scaleY = rect.height / GAME_HEIGHT;
      this.tutorial2PromptRoot.style.left = `${rect.left + rect.width / 2}px`;
      this.tutorial2PromptRoot.style.top = `${rect.top + (GAME_HEIGHT - 68) * scaleY}px`;
    }
  };

  constructor() {
    super('MainlineIntroScene');
  }

  init(data: { settings: GameSettings }) {
    this.settings = data.settings;
  }

  create() {
    this.applyMasterVolume();
    this.tutorial2StartRequested = false;
    this.forceRemoveTutorial2Artifacts();
    this.input.setDefaultCursor('default');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.refreshOpeningVideoBounds);
      this.removeOpeningVideo();
      this.removeTutorial2Video();
      this.stopTutorialLoop();
      this.continuePromptText?.destroy();
      this.continuePromptText = undefined;
      this.tutorialDisplayRect = undefined;
      this.tutorial2StartRequested = false;
      this.forceRemoveTutorial2Artifacts();
      if (this.textures.exists(this.openingLastFrameTextureKey)) {
        this.textures.remove(this.openingLastFrameTextureKey);
      }
    });

    this.playOpeningVideoThenShowTutorial();
  }

  private playOpeningVideoThenShowTutorial() {
    const complete = () => {
      this.captureOpeningLastFrameTexture();
      this.removeOpeningVideo();
      this.showTutorialScreen();
    };

    this.openingRoot = document.createElement('div');
    this.openingRoot.style.position = 'fixed';
    this.openingRoot.style.pointerEvents = 'none';
    this.openingRoot.style.background = '#000000';
    this.openingRoot.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO);
    this.openingRoot.style.overflow = 'hidden';

    this.openingVideo = document.createElement('video');
    this.openingVideo.src = openingVideoUrl;
    this.openingVideo.autoplay = true;
    this.openingVideo.controls = false;
    this.openingVideo.volume = this.getMasterVolume();
    this.openingVideo.playsInline = true;
    this.openingVideo.preload = 'auto';
    this.openingVideo.style.width = '100%';
    this.openingVideo.style.height = '100%';
    this.openingVideo.style.objectFit = 'contain';
    this.openingVideo.style.background = '#000000';

    this.openingVideo.addEventListener('ended', complete, { once: true });
    this.openingVideo.addEventListener('error', complete, { once: true });

    this.openingRoot.appendChild(this.openingVideo);
    document.body.appendChild(this.openingRoot);
    this.refreshOpeningVideoBounds();
    window.addEventListener('resize', this.refreshOpeningVideoBounds);

    this.openingVideo.play().catch(() => {
      complete();
    });
  }

  private removeOpeningVideo() {
    if (this.openingVideo) {
      this.openingVideo.pause();
      this.openingVideo.src = '';
      this.openingVideo.load();
      this.openingVideo.remove();
      this.openingVideo = undefined;
    }

    this.openingRoot?.remove();
    this.openingRoot = undefined;
  }

  private captureOpeningLastFrameTexture() {
    const video = this.openingVideo;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return;
    }

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    const ctx = frameCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

    if (this.textures.exists(this.openingLastFrameTextureKey)) {
      this.textures.remove(this.openingLastFrameTextureKey);
    }
    this.textures.addCanvas(this.openingLastFrameTextureKey, frameCanvas);
  }

  private showTutorialScreen() {
    if (this.textures.exists(this.openingLastFrameTextureKey)) {
      const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.openingLastFrameTextureKey).setDepth(SCENE_LAYER.INTRO_BACKGROUND);
      const scale = Math.min(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height);
      bg.setScale(scale);
    }

    const tutorial = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'tutorial').setDepth(SCENE_LAYER.INTRO_TUTORIAL_IMAGE);
    const ratio = Math.min((GAME_WIDTH * 0.92) / tutorial.width, (GAME_HEIGHT * 0.84) / tutorial.height);
    tutorial.setDisplaySize(tutorial.width * ratio, tutorial.height * ratio);
    this.tutorialDisplayRect = {
      x: tutorial.x,
      y: tutorial.y,
      width: tutorial.displayWidth,
      height: tutorial.displayHeight,
    };

    if (!this.continuePromptText) {
      this.continuePromptText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 68, '按任意按鍵繼續', {
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(SCENE_LAYER.INTRO_CONTINUE_PROMPT);
    } else {
      this.continuePromptText.setVisible(true);
    }

    this.playTutorialLoop();

    let transitioned = false;
    const showTutorial2 = () => {
      if (transitioned) return;
      transitioned = true;
      this.showTutorial2VideoScreen();
    };

    this.input.keyboard?.once('keydown', showTutorial2);
    this.input.once('pointerdown', showTutorial2);
  }

  private showTutorial2VideoScreen() {
    this.removeTutorial2Video();
    this.forceRemoveTutorial2Artifacts();

    this.tutorial2Root = document.createElement('div');
    this.tutorial2Root.setAttribute(this.tutorial2RootAttr, '1');
    this.tutorial2Root.style.position = 'fixed';
    this.tutorial2Root.style.pointerEvents = 'auto';
    this.tutorial2Root.style.background = '#000000';
    this.tutorial2Root.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO);
    this.tutorial2Root.style.overflow = 'hidden';

    this.tutorial2Video = document.createElement('video');
    this.tutorial2Video.src = tutorial2VideoUrl;
    this.tutorial2Video.autoplay = true;
    this.tutorial2Video.loop = true;
    this.tutorial2Video.controls = false;
    this.tutorial2Video.volume = this.getMasterVolume();
    this.tutorial2Video.playsInline = true;
    this.tutorial2Video.preload = 'auto';
    this.tutorial2Video.style.width = '100%';
    this.tutorial2Video.style.height = '100%';
    this.tutorial2Video.style.objectFit = 'contain';
    this.tutorial2Video.style.background = '#000000';

    this.tutorial2Root.appendChild(this.tutorial2Video);
    document.body.appendChild(this.tutorial2Root);

    this.tutorial2PromptRoot = document.createElement('div');
    this.tutorial2PromptRoot.setAttribute(this.tutorial2PromptAttr, '1');
    this.tutorial2PromptRoot.textContent = '按任意按鍵繼續';
    this.tutorial2PromptRoot.style.position = 'fixed';
    this.tutorial2PromptRoot.style.pointerEvents = 'auto';
    this.tutorial2PromptRoot.style.transform = 'translate(-50%, -50%)';
    this.tutorial2PromptRoot.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO_PROMPT);
    this.tutorial2PromptRoot.style.color = '#ffffff';
    this.tutorial2PromptRoot.style.fontFamily = UI_CJK_FONT_FAMILY;
    this.tutorial2PromptRoot.style.fontWeight = 'bold';
    this.tutorial2PromptRoot.style.fontSize = '32px';
    this.tutorial2PromptRoot.style.webkitTextStroke = '6px #000000';
    this.tutorial2PromptRoot.style.paintOrder = 'stroke fill';
    document.body.appendChild(this.tutorial2PromptRoot);

    this.refreshOpeningVideoBounds();
    window.addEventListener('resize', this.refreshOpeningVideoBounds);

    this.tutorial2Video.play().catch(() => {
      // Ignore autoplay failures on restrictive browsers.
    });

    this.continuePromptText?.setVisible(false);

    const startGame = () => {
      if (this.tutorial2StartRequested) return;
      this.tutorial2StartRequested = true;
      this.continuePromptText?.setVisible(false);
      this.stopTutorialLoop();
      this.removeTutorial2Video();
      this.forceRemoveTutorial2Artifacts();
      this.scene.start('GameScene', {
        settings: this.settings,
        stageIndex: 0,
        mode: 'story',
        levelData: MAIN_LEVEL_DATA,
        introCountdownBpm: INTRO_COUNTDOWN_BPM,
      });
    };

    this.tutorial2ConfirmKeyHandler = () => startGame();
    this.tutorial2ConfirmPointerHandler = () => startGame();
    window.addEventListener('keydown', this.tutorial2ConfirmKeyHandler);
    window.addEventListener('pointerdown', this.tutorial2ConfirmPointerHandler);
    this.tutorial2ConfirmMouseHandler = () => startGame();
    this.tutorial2ConfirmTouchHandler = () => startGame();
    document.addEventListener('mousedown', this.tutorial2ConfirmMouseHandler, true);
    document.addEventListener('touchstart', this.tutorial2ConfirmTouchHandler, true);
    this.tutorial2ConfirmDomHandler = () => startGame();
    this.tutorial2Root.addEventListener('pointerdown', this.tutorial2ConfirmDomHandler);
    this.tutorial2Root.addEventListener('mousedown', this.tutorial2ConfirmDomHandler);
    this.tutorial2Root.addEventListener('touchstart', this.tutorial2ConfirmDomHandler);
    this.tutorial2Video.addEventListener('pointerdown', this.tutorial2ConfirmDomHandler);
    this.tutorial2Video.addEventListener('mousedown', this.tutorial2ConfirmDomHandler);
    this.tutorial2Video.addEventListener('touchstart', this.tutorial2ConfirmDomHandler);
    this.tutorial2PromptRoot.addEventListener('pointerdown', this.tutorial2ConfirmDomHandler);
    this.tutorial2PromptRoot.addEventListener('mousedown', this.tutorial2ConfirmDomHandler);
    this.tutorial2PromptRoot.addEventListener('touchstart', this.tutorial2ConfirmDomHandler);
    this.input.keyboard?.once('keydown', startGame);
    this.input.once('pointerdown', startGame);
  }

  private removeTutorial2Video() {
    window.removeEventListener('resize', this.refreshOpeningVideoBounds);
    if (this.tutorial2ConfirmKeyHandler) {
      window.removeEventListener('keydown', this.tutorial2ConfirmKeyHandler);
      this.tutorial2ConfirmKeyHandler = undefined;
    }
    if (this.tutorial2ConfirmPointerHandler) {
      window.removeEventListener('pointerdown', this.tutorial2ConfirmPointerHandler);
      this.tutorial2ConfirmPointerHandler = undefined;
    }
    if (this.tutorial2ConfirmMouseHandler) {
      document.removeEventListener('mousedown', this.tutorial2ConfirmMouseHandler, true);
      this.tutorial2ConfirmMouseHandler = undefined;
    }
    if (this.tutorial2ConfirmTouchHandler) {
      document.removeEventListener('touchstart', this.tutorial2ConfirmTouchHandler, true);
      this.tutorial2ConfirmTouchHandler = undefined;
    }
    if (this.tutorial2ConfirmDomHandler) {
      this.tutorial2Root?.removeEventListener('pointerdown', this.tutorial2ConfirmDomHandler);
      this.tutorial2Root?.removeEventListener('mousedown', this.tutorial2ConfirmDomHandler);
      this.tutorial2Root?.removeEventListener('touchstart', this.tutorial2ConfirmDomHandler);
      this.tutorial2Video?.removeEventListener('pointerdown', this.tutorial2ConfirmDomHandler);
      this.tutorial2Video?.removeEventListener('mousedown', this.tutorial2ConfirmDomHandler);
      this.tutorial2Video?.removeEventListener('touchstart', this.tutorial2ConfirmDomHandler);
      this.tutorial2PromptRoot?.removeEventListener('pointerdown', this.tutorial2ConfirmDomHandler);
      this.tutorial2PromptRoot?.removeEventListener('mousedown', this.tutorial2ConfirmDomHandler);
      this.tutorial2PromptRoot?.removeEventListener('touchstart', this.tutorial2ConfirmDomHandler);
      this.tutorial2ConfirmDomHandler = undefined;
    }

    if (this.tutorial2Video) {
      this.tutorial2Video.pause();
      this.tutorial2Video.currentTime = 0;
      this.tutorial2Video.src = '';
      this.tutorial2Video.load();
      this.tutorial2Video.remove();
      this.tutorial2Video = undefined;
    }

    this.tutorial2Root?.remove();
    this.tutorial2Root = undefined;

    this.tutorial2PromptRoot?.remove();
    this.tutorial2PromptRoot = undefined;
  }

  private forceRemoveTutorial2Artifacts() {
    const staleRoots = document.querySelectorAll<HTMLDivElement>(`[${this.tutorial2RootAttr}]`);
    staleRoots.forEach(node => node.remove());
    const stalePrompts = document.querySelectorAll<HTMLDivElement>(`[${this.tutorial2PromptAttr}]`);
    stalePrompts.forEach(node => node.remove());
  }

  private playTutorialLoop() {
    this.stopTutorialLoop();
    this.applyMasterVolume();
    this.tutorialLoopSound = this.sound.add('tutorial_loop', { loop: true });
    this.tutorialLoopSound.play();
  }

  private stopTutorialLoop() {
    if (!this.tutorialLoopSound) {
      return;
    }
    this.tutorialLoopSound.stop();
    this.tutorialLoopSound.destroy();
    this.tutorialLoopSound = undefined;
  }

  private applyMasterVolume() {
    this.sound.volume = this.getMasterVolume();
    if (this.openingVideo) this.openingVideo.volume = this.getMasterVolume();
    if (this.tutorial2Video) this.tutorial2Video.volume = this.getMasterVolume();
  }

  private getMasterVolume(): number {
    return Phaser.Math.Clamp(this.settings?.masterVolume ?? DEFAULT_SETTINGS.masterVolume, 0, 1);
  }
}
