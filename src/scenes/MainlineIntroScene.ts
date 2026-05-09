import Phaser from 'phaser';
import openingVideoUrl from '../assets/mp4/開頭影片.mp4';
import type { GameSettings } from '../config';
import { DEFAULT_SETTINGS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { HTML_LAYER, SCENE_LAYER } from '../layers';
import { MAIN_LEVEL_DATA } from '../levels';
import { Tutorial2VideoOverlay } from './shared/tutorial2VideoOverlay';

const INTRO_COUNTDOWN_BPM = 183.5;

export class MainlineIntroScene extends Phaser.Scene {
  private settings!: GameSettings;
  private openingRoot?: HTMLDivElement;
  private openingVideo?: HTMLVideoElement;
  private tutorial2Overlay?: Tutorial2VideoOverlay;
  private tutorial2ContinueHandler?: () => void;
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
    this.ensureTutorial2Overlay();
    this.tutorial2Overlay?.forceRemoveArtifacts();
    this.input.setDefaultCursor('default');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.refreshOpeningVideoBounds);
      this.removeOpeningVideo();
      this.tutorial2Overlay?.remove();
      this.stopTutorialLoop();
      this.continuePromptText?.destroy();
      this.continuePromptText = undefined;
      this.tutorialDisplayRect = undefined;
      this.tutorial2ContinueHandler = undefined;
      this.tutorial2StartRequested = false;
      this.tutorial2Overlay?.forceRemoveArtifacts();
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
    this.continuePromptText?.setVisible(false);

    const startGame = () => {
      if (this.tutorial2StartRequested) return;
      this.tutorial2StartRequested = true;
      this.continuePromptText?.setVisible(false);
      this.stopTutorialLoop();
      this.tutorial2Overlay?.remove();
      this.tutorial2Overlay?.forceRemoveArtifacts();
      this.scene.start('GameScene', {
        settings: this.settings,
        stageIndex: 0,
        mode: 'story',
        levelData: MAIN_LEVEL_DATA,
        introCountdownBpm: INTRO_COUNTDOWN_BPM,
      });
    };

    this.ensureTutorial2Overlay();
    this.tutorial2ContinueHandler = startGame;
    this.tutorial2Overlay?.show();
  }

  private ensureTutorial2Overlay() {
    this.tutorial2Overlay ??= new Tutorial2VideoOverlay({
      canvas: this.game.canvas,
      sceneWidth: GAME_WIDTH,
      sceneHeight: GAME_HEIGHT,
      rootAttr: this.tutorial2RootAttr,
      promptAttr: this.tutorial2PromptAttr,
      volume: () => this.getMasterVolume(),
      targetRect: () => this.tutorialDisplayRect ?? {
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT / 2,
        width: GAME_WIDTH * 0.92,
        height: GAME_HEIGHT * 0.84,
      },
      onContinue: () => {
        this.tutorial2ContinueHandler?.();
      },
    });
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
    this.tutorial2Overlay?.setVolume(this.getMasterVolume());
  }

  private getMasterVolume(): number {
    return Phaser.Math.Clamp(this.settings?.masterVolume ?? DEFAULT_SETTINGS.masterVolume, 0, 1);
  }
}
