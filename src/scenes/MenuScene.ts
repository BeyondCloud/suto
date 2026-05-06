import Phaser from 'phaser';
import { DEFAULT_SETTINGS } from '../config';
import type { GameSettings } from '../config';

export class MenuScene extends Phaser.Scene {
  private settings: GameSettings;
  private settingsVisible = false;
  private settingsContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('MenuScene');
    this.settings = { ...DEFAULT_SETTINGS };
  }

  preload() {
    this.load.image('suto400', 'src/assets/suto400.png');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.input.setDefaultCursor('default');

    // Title
    this.add.text(cx, height * 0.28, 'SUTO', {
      fontSize: '96px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Mainline mode button
    const mainlineBtn = this.add.text(cx, height * 0.45, '[ 主線模式 ]', {
      fontSize: '44px',
      color: '#ffd58f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    mainlineBtn.on('pointerover', () => mainlineBtn.setColor('#ffffff'));
    mainlineBtn.on('pointerout', () => mainlineBtn.setColor('#ffd58f'));
    mainlineBtn.on('pointerdown', () => {
      this.scene.start('MainlineIntroScene', { settings: this.settings });
    });

    // Challenge mode button
    const startBtn = this.add.text(cx, height * 0.56, '[ 挑戰模式 ]', {
      fontSize: '40px',
      color: '#aaffaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setColor('#ffffff'));
    startBtn.on('pointerout', () => startBtn.setColor('#aaffaa'));
    startBtn.on('pointerdown', () => {
      this.scene.start('GameScene', { settings: this.settings, stageIndex: 0, mode: 'challenge' });
    });

    // Settings button
    const settingsBtn = this.add.text(cx, height * 0.67, '[ SETTINGS ]', {
      fontSize: '28px',
      color: '#aaaaff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    settingsBtn.on('pointerover', () => settingsBtn.setColor('#ffffff'));
    settingsBtn.on('pointerout', () => settingsBtn.setColor('#aaaaff'));
    settingsBtn.on('pointerdown', () => this.toggleSettings());

    // Settings panel
    this.settingsContainer = this.add.container(cx, height * 0.5);
    this.buildSettingsPanel();
    this.settingsContainer.setVisible(false);
  }

  private buildSettingsPanel() {
    const bg = this.add.rectangle(0, 0, 560, 400, 0x111122, 0.95);
    const title = this.add.text(0, -170, 'Settings', { fontSize: '28px', color: '#fff' }).setOrigin(0.5);

    const makeRow = (label: string, yOff: number, getValue: () => string | number, onMinus: () => void, onPlus: () => void) => {
      const lbl = this.add.text(-180, yOff, label, { fontSize: '20px', color: '#ccc' }).setOrigin(0, 0.5);
      const valText = this.add.text(60, yOff, String(getValue()), { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
      const minus = this.add.text(-20, yOff, '◀', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const plus = this.add.text(140, yOff, '▶', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      minus.on('pointerdown', () => { onMinus(); valText.setText(String(getValue())); });
      plus.on('pointerdown', () => { onPlus(); valText.setText(String(getValue())); });
      return [lbl, valText, minus, plus];
    };

    const bpmRow = makeRow('BPM',
      -110,
      () => this.settings.bpm,
      () => { this.settings.bpm = Math.max(60, this.settings.bpm - 5); },
      () => { this.settings.bpm = Math.min(240, this.settings.bpm + 5); },
    );

    const shrinkRow = makeRow('Shrink Lead (ms)',
      -65,
      () => this.settings.shrinkLeadMs,
      () => { this.settings.shrinkLeadMs = Math.max(200, this.settings.shrinkLeadMs - 100); },
      () => { this.settings.shrinkLeadMs = Math.min(3000, this.settings.shrinkLeadMs + 100); },
    );

    const hwRow = makeRow('Hitbox W',
      -20,
      () => this.settings.hitboxWidth,
      () => { this.settings.hitboxWidth = Math.max(100, this.settings.hitboxWidth - 20); },
      () => { this.settings.hitboxWidth = Math.min(800, this.settings.hitboxWidth + 20); },
    );

    const hhRow = makeRow('Hitbox H',
      25,
      () => this.settings.hitboxHeight,
      () => { this.settings.hitboxHeight = Math.max(60, this.settings.hitboxHeight - 20); },
      () => { this.settings.hitboxHeight = Math.min(480, this.settings.hitboxHeight + 20); },
    );

    const depthRow = makeRow('Check Depth',
      70,
      () => this.settings.checkDepth,
      () => { this.settings.checkDepth = Math.max(10, this.settings.checkDepth - 10); },
      () => { this.settings.checkDepth = Math.min(200, this.settings.checkDepth + 10); },
    );

    const closeBtn = this.add.text(0, 160, '[ CLOSE ]', { fontSize: '22px', color: '#ffaaaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleSettings());

    this.settingsContainer.add([
      bg, title,
      ...bpmRow, ...shrinkRow, ...hwRow, ...hhRow, ...depthRow,
      closeBtn,
    ]);
  }

  private toggleSettings() {
    this.settingsVisible = !this.settingsVisible;
    this.settingsContainer.setVisible(this.settingsVisible);
  }
}
