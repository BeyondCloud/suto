import Phaser from 'phaser';
import openingVideoUrl from '../assets/mp4/開頭影片.mp4';
import type { GameSettings } from '../config';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { MAIN_LEVEL_DATA } from '../levels';

export class MainlineIntroScene extends Phaser.Scene {
  private settings!: GameSettings;
  private openingRoot?: HTMLDivElement;
  private openingVideo?: HTMLVideoElement;
  private readonly openingLastFrameTextureKey = 'opening_last_frame';

  private readonly refreshOpeningVideoBounds = () => {
    if (!this.openingRoot) return;
    const rect = this.game.canvas.getBoundingClientRect();
    this.openingRoot.style.left = `${rect.left}px`;
    this.openingRoot.style.top = `${rect.top}px`;
    this.openingRoot.style.width = `${rect.width}px`;
    this.openingRoot.style.height = `${rect.height}px`;
  };

  constructor() {
    super('MainlineIntroScene');
  }

  init(data: { settings: GameSettings }) {
    this.settings = data.settings;
  }

  preload() {
    this.load.image('tutorial', 'src/assets/tutorial.png');
  }

  create() {
    this.input.setDefaultCursor('default');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.refreshOpeningVideoBounds);
      this.removeOpeningVideo();
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
    this.openingRoot.style.zIndex = '1000';
    this.openingRoot.style.overflow = 'hidden';

    this.openingVideo = document.createElement('video');
    this.openingVideo.src = openingVideoUrl;
    this.openingVideo.autoplay = true;
    this.openingVideo.controls = false;
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
      const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.openingLastFrameTextureKey).setDepth(0);
      const scale = Math.min(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height);
      bg.setScale(scale);
    }

    const tutorial = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'tutorial').setDepth(1);
    const ratio = Math.min((GAME_WIDTH * 0.92) / tutorial.width, (GAME_HEIGHT * 0.84) / tutorial.height);
    tutorial.setDisplaySize(tutorial.width * ratio, tutorial.height * ratio);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 68, '按任意按鍵繼續', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(6);

    let started = false;
    const startGame = () => {
      if (started) return;
      started = true;
      this.scene.start('GameScene', {
        settings: this.settings,
        stageIndex: 0,
        mode: 'story',
        levelData: MAIN_LEVEL_DATA,
      });
    };

    this.input.keyboard?.once('keydown', startGame);
    this.input.once('pointerdown', startGame);
  }
}
