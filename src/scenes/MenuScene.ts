import Phaser from 'phaser';
import welcomeAudioUrl from '../assets/audio/welcome.wav';
import mainlineClickAudioUrl from '../assets/audio/short/來.wav';
import tutorialLoopUrl from '../assets/audio/loop/tutorial.wav';
import { DEFAULT_SETTINGS } from '../config';
import type { GameSettings } from '../config';
import { SCENE_LAYER } from '../layers';

const SETTINGS_STORAGE_KEY = 'suto.gameSettings';
const MASTER_VOLUME_MIN = 0;
const MASTER_VOLUME_MAX = 1;
const MASTER_VOLUME_STEP = 0.01;
const MASTER_VOLUME_PREVIEW_INTERVAL_MS = 120;

export class MenuScene extends Phaser.Scene {
  private settings: GameSettings;
  private settingsVisible = false;
  private settingsContainer!: Phaser.GameObjects.Container;
  private menuContainer!: Phaser.GameObjects.Container;
  private judgementRulesContainer!: Phaser.GameObjects.Container;
  private judgementRulesImage!: Phaser.GameObjects.Image;
  private judgementRulesStep = 0;
  private tutorialLoopSound?: Phaser.Sound.BaseSound;
  private welcomeSound?: Phaser.Sound.BaseSound;
  private lastVolumePreviewAt = 0;

  constructor() {
    super('MenuScene');
    this.settings = this.loadSettings();
  }

  preload() {
    this.load.image('suto400', 'src/assets/suto400.png');
    this.load.image('opening_bg', 'src/assets/opening.png');
    this.load.image('judgement_rules_1', 'src/assets/判定規則.png');
    this.load.image('judgement_rules_2', 'src/assets/判定規則2.png');
    this.load.audio('welcome', welcomeAudioUrl);
    this.load.audio('mainline-click', mainlineClickAudioUrl);
    this.load.audio('tutorial_loop', tutorialLoopUrl);
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const menuBaseY = height * 0.42;
    const menuGapY = height * 0.08;
    this.input.setDefaultCursor('default');
    this.applyMasterVolume();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopWelcomeAudio();
      this.stopTutorialLoop();
    });

    this.playWelcomeAudio();
    if (this.sound.locked) {
      this.input.once('pointerdown', () => this.playWelcomeAudio());
      this.input.keyboard?.once('keydown', () => this.playWelcomeAudio());
    }

    const background = this.add.image(cx, height / 2, 'opening_bg').setDepth(SCENE_LAYER.MENU_BACKGROUND);
    const bgScale = Math.max(width / background.width, height / background.height);
    background.setScale(bgScale);

    this.menuContainer = this.add.container(0, 0);

    // Title
    const title = this.add.text(cx, height * 0.28, 'SUTO!', {
      fontSize: '96px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // A full-width translucent stripe behind the currently hovered menu option.
    const selectionStripe = this.add.rectangle(cx, 0, width, 62, 0x000000, 0.45)
      .setOrigin(0.5)
      .setDepth(SCENE_LAYER.MENU_SELECTION_STRIPE)
      .setVisible(false);

    // Mainline mode button
    const mainlineBtn = this.add.text(cx, menuBaseY, '[ 主播模式 ]', {
      fontSize: '33px',
      color: '#ffd58f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    mainlineBtn.on('pointerover', () => {
      selectionStripe.setY(mainlineBtn.y).setVisible(true);
      mainlineBtn.setColor('#ffffff');
    });
    mainlineBtn.on('pointerout', () => {
      mainlineBtn.setColor('#ffd58f');
      selectionStripe.setVisible(false);
    });
    mainlineBtn.on('pointerdown', () => {
      this.sound.play('mainline-click');
      this.scene.start('MainlineIntroScene', { settings: this.settings });
    });

    // Challenge mode button
    const startBtn = this.add.text(cx, menuBaseY + menuGapY, '[ 挑戰模式 ]', {
      fontStyle: 'bold',
      fontSize: '33px',
      color: '#aaffaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => {
      selectionStripe.setY(startBtn.y).setVisible(true);
      startBtn.setColor('#ffffff');
    });
    startBtn.on('pointerout', () => {
      startBtn.setColor('#aaffaa');
      selectionStripe.setVisible(false);
    });
    startBtn.on('pointerdown', () => {
      this.scene.start('GameScene', { settings: this.settings, stageIndex: 0, mode: 'challenge' });
    });

    const judgementRulesBtn = this.add.text(cx, menuBaseY + menuGapY * 2, '[ 判定規則 ]', {
      fontSize: '33px',
      fontStyle: 'bold',
      color: '#ffb3dc',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    judgementRulesBtn.on('pointerover', () => {
      selectionStripe.setY(judgementRulesBtn.y).setVisible(true);
      judgementRulesBtn.setColor('#ffffff');
    });
    judgementRulesBtn.on('pointerout', () => {
      judgementRulesBtn.setColor('#ffb3dc');
      selectionStripe.setVisible(false);
    });
    judgementRulesBtn.on('pointerdown', () => {
      this.sound.play('mainline-click');
      this.openJudgementRules();
    });

    // Settings button
    const settingsBtn = this.add.text(cx, menuBaseY + menuGapY * 3, '[ 設定 ]', {
      fontSize: '33px',
      fontStyle: 'bold',
      color: '#aaaaff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    settingsBtn.on('pointerover', () => {
      selectionStripe.setY(settingsBtn.y).setVisible(true);
      settingsBtn.setColor('#ffffff');
    });
    settingsBtn.on('pointerout', () => {
      settingsBtn.setColor('#aaaaff');
      selectionStripe.setVisible(false);
    });
    settingsBtn.on('pointerdown', () => this.toggleSettings());

    this.menuContainer.add([
      title,
      selectionStripe,
      mainlineBtn,
      startBtn,
      judgementRulesBtn,
      settingsBtn,
    ]);

    // Settings panel
    this.settingsContainer = this.add.container(cx, height * 0.5);
    this.buildSettingsPanel();
    this.settingsContainer.setVisible(false);

    this.buildJudgementRulesOverlay();
  }

  private buildJudgementRulesOverlay() {
    const { width, height } = this.scale;
    const background = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.92)
      .setInteractive({ useHandCursor: true });
    const image = this.add.image(width / 2, height / 2, 'judgement_rules_1');
    const imageScale = Math.min((width * 0.94) / image.width, (height * 0.86) / image.height);
    image.setScale(imageScale);

    const prompt = this.add.text(width / 2, height - 42, '點一下繼續', {
      fontSize: '26px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.judgementRulesContainer = this.add.container(0, 0, [background, image, prompt]);
    this.judgementRulesContainer.setDepth(20);
    this.judgementRulesContainer.setVisible(false);
    this.judgementRulesImage = image;

    background.on('pointerdown', () => this.advanceJudgementRules());
    image.setInteractive({ useHandCursor: true });
    image.on('pointerdown', () => this.advanceJudgementRules());
    prompt.setInteractive({ useHandCursor: true });
    prompt.on('pointerdown', () => this.advanceJudgementRules());
  }

  private buildSettingsPanel() {
    const bg = this.add.rectangle(0, 0, 620, 290, 0x111122, 0.95);
    const title = this.add.text(0, -102, '設定', { fontSize: '28px', color: '#fff' }).setOrigin(0.5);

    const makeRow = (label: string, yOff: number, getValue: () => string | number, onMinus: () => void, onPlus: () => void, onMinusTen?: () => void, onPlusTen?: () => void) => {
      const lbl = this.add.text(-230, yOff, label, { fontSize: '20px', color: '#ccc' }).setOrigin(0, 0.5);
      const valText = this.add.text(95, yOff, String(getValue()), { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
      const minusTen = this.add.text(-5, yOff, '◀◀', { fontSize: '18px', color: '#aaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const minus = this.add.text(45, yOff, '◀', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const plus = this.add.text(145, yOff, '▶', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const plusTen = this.add.text(195, yOff, '▶▶', { fontSize: '18px', color: '#aaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      minusTen.on('pointerdown', () => { (onMinusTen ?? onMinus)(); valText.setText(String(getValue())); });
      minus.on('pointerdown', () => { onMinus(); valText.setText(String(getValue())); });
      plus.on('pointerdown', () => { onPlus(); valText.setText(String(getValue())); });
      plusTen.on('pointerdown', () => { (onPlusTen ?? onPlus)(); valText.setText(String(getValue())); });
      return [lbl, valText, minusTen, minus, plus, plusTen];
    };

    const volumeSlider = this.createMasterVolumeSlider(-44);

    const storyDelayRow = makeRow('主線開場 Delay (ms)',
      32,
      () => this.settings.storyStartDelayMs,
      () => {
        this.settings.storyStartDelayMs = Math.max(0, this.settings.storyStartDelayMs - 1);
        this.saveSettings();
      },
      () => {
        this.settings.storyStartDelayMs = Math.min(5000, this.settings.storyStartDelayMs + 1);
        this.saveSettings();
      },
      () => {
        this.settings.storyStartDelayMs = Math.max(0, this.settings.storyStartDelayMs - 10);
        this.saveSettings();
      },
      () => {
        this.settings.storyStartDelayMs = Math.min(5000, this.settings.storyStartDelayMs + 10);
        this.saveSettings();
      },
    );

    const closeBtn = this.add.text(0, 104, '[ CLOSE ]', { fontSize: '22px', color: '#ffaaaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleSettings());

    this.settingsContainer.add([
      bg, title,
      ...volumeSlider,
      ...storyDelayRow,
      closeBtn,
    ]);
  }

  private createMasterVolumeSlider(yOff: number): Phaser.GameObjects.GameObject[] {
    const trackX = 72;
    const trackWidth = 260;
    const trackHeight = 8;
    const minKnobX = trackX - trackWidth / 2;

    const label = this.add.text(-260, yOff, 'Master Volume', { fontSize: '20px', color: '#ccc' }).setOrigin(0, 0.5);
    const valueText = this.add.text(244, yOff, this.formatMasterVolume(), { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
    const track = this.add.rectangle(trackX, yOff, trackWidth, trackHeight, 0x30304a, 1).setOrigin(0.5);
    const fill = this.add.rectangle(minKnobX, yOff, this.settings.masterVolume * trackWidth, trackHeight, 0x87d7ff, 1).setOrigin(0, 0.5);
    const knob = this.add.circle(this.getMasterVolumeKnobX(minKnobX, trackWidth), yOff, 13, 0xffffff, 1)
      .setStrokeStyle(2, 0x87d7ff, 1)
      .setInteractive({ useHandCursor: true, draggable: true });
    const hitArea = this.add.rectangle(trackX, yOff, trackWidth + 32, 34, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });

    const sync = () => {
      const volume = Phaser.Math.Clamp(this.settings.masterVolume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX);
      knob.setX(this.getMasterVolumeKnobX(minKnobX, trackWidth));
      fill.setDisplaySize(volume * trackWidth, trackHeight);
      valueText.setText(this.formatMasterVolume());
    };

    const setFromWorldX = (worldX: number) => {
      const raw = Phaser.Math.Clamp((worldX - minKnobX) / trackWidth, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX);
      const nextVolume = Phaser.Math.Clamp(Math.round(raw / MASTER_VOLUME_STEP) * MASTER_VOLUME_STEP, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX);
      if (nextVolume === this.settings.masterVolume) return;

      this.settings.masterVolume = nextVolume;
      sync();
      this.applyMasterVolume();
      this.saveSettings();
      this.playMasterVolumePreview();
    };

    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => setFromWorldX(pointer.x - this.settingsContainer.x));
    track.on('pointerdown', (pointer: Phaser.Input.Pointer) => setFromWorldX(pointer.x - this.settingsContainer.x));
    this.input.setDraggable(knob);
    knob.on('drag', (pointer: Phaser.Input.Pointer) => setFromWorldX(pointer.x - this.settingsContainer.x));
    knob.on('pointerover', () => knob.setFillStyle(0xdff5ff, 1));
    knob.on('pointerout', () => knob.setFillStyle(0xffffff, 1));

    sync();

    return [label, valueText, hitArea, track, fill, knob];
  }

  private getMasterVolumeKnobX(minKnobX: number, trackWidth: number): number {
    return minKnobX + Phaser.Math.Clamp(this.settings.masterVolume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX) * trackWidth;
  }

  private formatMasterVolume(): string {
    return `${Math.round(Phaser.Math.Clamp(this.settings.masterVolume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX) * 100)}%`;
  }

  private openJudgementRules() {
    this.judgementRulesStep = 1;
    this.judgementRulesImage.setTexture('judgement_rules_1');
    this.menuContainer.setVisible(false);
    this.settingsVisible = false;
    this.settingsContainer.setVisible(false);
    this.judgementRulesContainer.setVisible(true);
    this.playTutorialLoop();
  }

  private advanceJudgementRules() {
    if (!this.judgementRulesContainer.visible) {
      return;
    }

    if (this.judgementRulesStep === 1) {
      this.judgementRulesStep = 2;
      this.judgementRulesImage.setTexture('judgement_rules_2');
      return;
    }

    this.judgementRulesStep = 0;
    this.stopTutorialLoop();
    this.judgementRulesContainer.setVisible(false);
    this.menuContainer.setVisible(true);
    this.playWelcomeAudio();
  }

  private playTutorialLoop() {
    if (this.tutorialLoopSound?.isPlaying) {
      return;
    }

    this.applyMasterVolume();
    this.tutorialLoopSound?.destroy();
    this.tutorialLoopSound = this.sound.add('tutorial_loop', { loop: true });
    const started = this.tutorialLoopSound.play();
    if (started) {
      return;
    }

    this.tutorialLoopSound.destroy();
    this.tutorialLoopSound = undefined;
  }

  private stopTutorialLoop() {
    if (!this.tutorialLoopSound) {
      return;
    }

    this.tutorialLoopSound.stop();
    this.tutorialLoopSound.destroy();
    this.tutorialLoopSound = undefined;
  }

  private toggleSettings() {
    this.settingsVisible = !this.settingsVisible;
    this.settingsContainer.setVisible(this.settingsVisible);
  }

  private loadSettings(): GameSettings {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }

      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        masterVolume: Phaser.Math.Clamp(parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private playWelcomeAudio() {
    if (this.welcomeSound?.isPlaying) {
      return;
    }

    const sound = this.sound.add('welcome');
    const started = sound.play();
    if (started) {
      this.welcomeSound = sound;
      return;
    }

    sound.destroy();
  }

  private applyMasterVolume() {
    this.settings.masterVolume = Phaser.Math.Clamp(this.settings.masterVolume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX);
    this.sound.volume = this.settings.masterVolume;
  }

  private playMasterVolumePreview() {
    const now = this.time.now;
    if (now - this.lastVolumePreviewAt < MASTER_VOLUME_PREVIEW_INTERVAL_MS) {
      return;
    }

    this.lastVolumePreviewAt = now;
    this.sound.play('mainline-click');
  }

  private stopWelcomeAudio() {
    if (!this.welcomeSound) {
      return;
    }

    this.welcomeSound.stop();
    this.welcomeSound.destroy();
    this.welcomeSound = undefined;
  }

  private saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage write failures.
    }
  }
}
