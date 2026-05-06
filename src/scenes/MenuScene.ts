import Phaser from 'phaser';
import welcomeAudioUrl from '../assets/audio/welcome.wav';
import mainlineClickAudioUrl from '../assets/audio/short/來.wav';
import { DEFAULT_SETTINGS } from '../config';
import type { GameSettings } from '../config';

const SETTINGS_STORAGE_KEY = 'suto.gameSettings';

export class MenuScene extends Phaser.Scene {
  private settings: GameSettings;
  private settingsVisible = false;
  private settingsContainer!: Phaser.GameObjects.Container;
  private welcomeSound?: Phaser.Sound.BaseSound;

  constructor() {
    super('MenuScene');
    this.settings = this.loadSettings();
  }

  preload() {
    this.load.image('suto400', 'src/assets/suto400.png');
    this.load.image('opening_bg', 'src/assets/opening.png');
    this.load.audio('welcome', welcomeAudioUrl);
    this.load.audio('mainline-click', mainlineClickAudioUrl);
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.input.setDefaultCursor('default');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopWelcomeAudio();
    });

    this.playWelcomeAudio();
    if (this.sound.locked) {
      this.input.once('pointerdown', () => this.playWelcomeAudio());
      this.input.keyboard?.once('keydown', () => this.playWelcomeAudio());
    }

    const background = this.add.image(cx, height / 2, 'opening_bg').setDepth(-10);
    const bgScale = Math.max(width / background.width, height / background.height);
    background.setScale(bgScale);

    // Title
    this.add.text(cx, height * 0.28, 'SUTO!', {
      fontSize: '96px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // A full-width translucent stripe behind the currently hovered menu option.
    const selectionStripe = this.add.rectangle(cx, 0, width, 62, 0x000000, 0.45)
      .setOrigin(0.5)
      .setDepth(-1)
      .setVisible(false);

    // Mainline mode button
    const mainlineBtn = this.add.text(cx, height * 0.45, '[ 主線模式 ]', {
      fontSize: '44px',
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
    const startBtn = this.add.text(cx, height * 0.56, '[ 挑戰模式 ]', {
      fontSize: '40px',
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

    // Settings button
    const settingsBtn = this.add.text(cx, height * 0.67, '[ SETTINGS ]', {
      fontSize: '28px',
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

    // Settings panel
    this.settingsContainer = this.add.container(cx, height * 0.5);
    this.buildSettingsPanel();
    this.settingsContainer.setVisible(false);
  }

  private buildSettingsPanel() {
    const bg = this.add.rectangle(0, 0, 560, 230, 0x111122, 0.95);
    const title = this.add.text(0, -70, 'Settings', { fontSize: '28px', color: '#fff' }).setOrigin(0.5);

    const makeRow = (label: string, yOff: number, getValue: () => string | number, onMinus: () => void, onPlus: () => void) => {
      const lbl = this.add.text(-230, yOff, label, { fontSize: '20px', color: '#ccc' }).setOrigin(0, 0.5);
      const valText = this.add.text(95, yOff, String(getValue()), { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
      const minus = this.add.text(35, yOff, '◀', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const plus = this.add.text(155, yOff, '▶', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      minus.on('pointerdown', () => { onMinus(); valText.setText(String(getValue())); });
      plus.on('pointerdown', () => { onPlus(); valText.setText(String(getValue())); });
      return [lbl, valText, minus, plus];
    };

    const storyDelayRow = makeRow('主線開場 Delay (ms)',
      0,
      () => this.settings.storyStartDelayMs,
      () => {
        this.settings.storyStartDelayMs = Math.max(0, this.settings.storyStartDelayMs - 10);
        this.saveSettings();
      },
      () => {
        this.settings.storyStartDelayMs = Math.min(5000, this.settings.storyStartDelayMs + 10);
        this.saveSettings();
      },
    );

    const closeBtn = this.add.text(0, 70, '[ CLOSE ]', { fontSize: '22px', color: '#ffaaaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleSettings());

    this.settingsContainer.add([
      bg, title,
      ...storyDelayRow,
      closeBtn,
    ]);
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
