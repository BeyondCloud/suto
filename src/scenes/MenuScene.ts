import Phaser from 'phaser';
import welcomeAudioUrl from '../assets/audio/welcome.wav';
import mainlineClickAudioUrl from '../assets/audio/short/來.wav';
import tutorialLoopUrl from '../assets/audio/loop/tutorial.wav';
import type { Direction } from '../config';
import { DEFAULT_SETTINGS } from '../config';
import type { GameSettings } from '../config';
import { HTML_LAYER, SCENE_LAYER } from '../layers';
import { MAIN_LEVEL_DATA, LEVEL_DATA } from '../levels';
import type { LevelData, NormalSection, RotationSection, Stage } from '../levels';
import {
  DEBUG_ENDING_PRESETS,
  DEBUG_MODE,
} from './debug/GameSceneDebugController';
import type { DebugEndingPreset } from './debug/GameSceneDebugController';
import {
  installButtonHoverSound,
  preloadButtonHoverSound,
  wireDomButtonHoverSound,
} from './shared/buttonHoverSound';

const SETTINGS_STORAGE_KEY = 'suto.gameSettings';
const MASTER_VOLUME_MIN = 0;
const MASTER_VOLUME_MAX = 1;
const MASTER_VOLUME_STEP = 0.01;
const MASTER_VOLUME_PREVIEW_INTERVAL_MS = 120;
const PRACTICE_CUSTOM_STORAGE_KEY = 'suto.practice.custom.v1';
const PRACTICE_RETURN_STORAGE_KEY = 'suto.practice.return.mode.once';
const PRACTICE_REPEAT_COUNT = 999;
const UI_CJK_FONT_FAMILY = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";

type PracticeMode = 'mainline' | 'custom';
type PracticeCommand = Direction | 'L' | 'R';

interface PracticeMainlineItem {
  id: string;
  label: string;
  stageBpm: number;
  section: NormalSection | RotationSection;
}

interface PracticeCustomItem {
  id: string;
  bpm: number;
  commands: PracticeCommand[];
  createdAt: number;
}

export class MenuScene extends Phaser.Scene {
  private settings: GameSettings;
  private settingsVisible = false;
  private settingsContainer!: Phaser.GameObjects.Container;
  private menuContainer!: Phaser.GameObjects.Container;
  private judgementRulesContainer!: Phaser.GameObjects.Container;
  private judgementRulesImage!: Phaser.GameObjects.Image;
  private judgementRulesStep = 0;
  private judgementRulesKeyHandler?: (event: KeyboardEvent) => void;
  private tutorialLoopSound?: Phaser.Sound.BaseSound;
  private welcomeSound?: Phaser.Sound.BaseSound;
  private lastVolumePreviewAt = 0;
  private debugEndingOverlayRoot?: HTMLDivElement;
  private debugEndingHotkeyHandler?: (event: KeyboardEvent) => void;
  private practiceMode: PracticeMode = 'mainline';
  private pendingOpenPracticeMode = false;
  private pendingPracticeMode: PracticeMode = 'mainline';
  private practiceContainer!: Phaser.GameObjects.Container;
  private practiceListViewport!: Phaser.GameObjects.Rectangle;
  private practiceListContent!: Phaser.GameObjects.Container;
  private practiceListMaskGraphics?: Phaser.GameObjects.Graphics;
  private practiceListScrollOffset = 0;
  private practiceListScrollMin = 0;
  private practiceListContentBaseY = 0;
  private practiceMainlineItems: PracticeMainlineItem[] = [];
  private practiceCustomItems: PracticeCustomItem[] = [];
  private practiceModeMainlineBtn!: Phaser.GameObjects.Text;
  private practiceModeCustomBtn!: Phaser.GameObjects.Text;
  private practiceCustomPreviewContainer!: Phaser.GameObjects.Container;
  private practiceCustomBuilderContainer!: Phaser.GameObjects.Container;
  private practiceCustomPreviewSlots: Phaser.GameObjects.Text[] = [];
  private practiceCustomBuildCommands: PracticeCommand[] = [];
  private practiceCustomBpm = 180;
  private isPracticeBpmEditing = false;
  private practiceCustomBpmInputRaw = '';
  private practiceCustomBpmInputBg?: Phaser.GameObjects.Rectangle;
  private practiceCustomBpmValueText?: Phaser.GameObjects.Text;
  private practiceCustomAddBtnBg!: Phaser.GameObjects.Rectangle;
  private practiceCustomAddBtn!: Phaser.GameObjects.Text;
  private practiceBpmKeyHandler?: (event: KeyboardEvent) => void;
  private practiceWheelListener?: (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number) => void;
  private practicePointerListener?: (pointer: Phaser.Input.Pointer) => void;

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
    preloadButtonHoverSound(this);
  }

  init(data?: { openPracticeMode?: boolean; practiceMode?: PracticeMode }) {
    const persistedPracticeMode = this.consumePersistedPracticeReturnMode();
    const openByData = data?.openPracticeMode === true;
    const openByPersisted = persistedPracticeMode !== null;
    this.pendingOpenPracticeMode = openByData || openByPersisted;
    if (openByData) {
      this.pendingPracticeMode = data?.practiceMode === 'custom' ? 'custom' : 'mainline';
      return;
    }
    this.pendingPracticeMode = persistedPracticeMode ?? 'mainline';
  }

  private consumePersistedPracticeReturnMode(): PracticeMode | null {
    try {
      const raw = window.localStorage.getItem(PRACTICE_RETURN_STORAGE_KEY);
      if (raw !== 'mainline' && raw !== 'custom') return null;
      window.localStorage.removeItem(PRACTICE_RETURN_STORAGE_KEY);
      return raw;
    } catch {
      return null;
    }
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const menuBaseY = height * 0.42;
    const menuGapY = height * 0.08;
    this.input.setDefaultCursor('default');
    this.applyMasterVolume();
    installButtonHoverSound(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.endPracticeBpmInlineEdit(false);
      this.stopWelcomeAudio();
      this.stopTutorialLoop();
      this.removeDebugEndingOverlay();
      this.practiceListMaskGraphics?.destroy();
      this.practiceListMaskGraphics = undefined;
      if (this.practiceWheelListener) {
        this.input.off('wheel', this.practiceWheelListener);
        this.practiceWheelListener = undefined;
      }
      if (this.practicePointerListener) {
        this.input.off('pointerdown', this.practicePointerListener);
        this.practicePointerListener = undefined;
      }
      if (this.practiceBpmKeyHandler) {
        window.removeEventListener('keydown', this.practiceBpmKeyHandler);
        this.practiceBpmKeyHandler = undefined;
      }
      if (this.judgementRulesKeyHandler) {
        this.input.keyboard?.off('keydown', this.judgementRulesKeyHandler);
        this.judgementRulesKeyHandler = undefined;
      }
    });

    const shouldPlayWelcomeAudio = !this.pendingOpenPracticeMode;
    if (shouldPlayWelcomeAudio) {
      this.playWelcomeAudio();
      if (this.sound.locked) {
        this.input.once('pointerdown', () => this.playWelcomeAudio());
        this.input.keyboard?.once('keydown', () => this.playWelcomeAudio());
      }
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

    const practiceBtn = this.add.text(cx, menuBaseY + menuGapY * 2, '[ 練習模式 ]', {
      fontStyle: 'bold',
      fontSize: '33px',
      color: '#ffd6a5',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    practiceBtn.on('pointerover', () => {
      selectionStripe.setY(practiceBtn.y).setVisible(true);
      practiceBtn.setColor('#ffffff');
    });
    practiceBtn.on('pointerout', () => {
      practiceBtn.setColor('#ffd6a5');
      selectionStripe.setVisible(false);
    });
    practiceBtn.on('pointerdown', () => {
      this.sound.play('mainline-click');
      this.openPracticeMode();
    });

    const judgementRulesBtn = this.add.text(cx, menuBaseY + menuGapY * 3, '[ 判定規則 ]', {
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
    const settingsBtn = this.add.text(cx, menuBaseY + menuGapY * 4, '[ 設定 ]', {
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
      practiceBtn,
      judgementRulesBtn,
      settingsBtn,
    ]);

    this.practiceMainlineItems = this.buildMainlinePracticeItems();
    this.practiceCustomItems = this.loadCustomPracticeItems();
    this.buildPracticePanel();
    this.practiceContainer.setVisible(false);

    // Settings panel
    this.settingsContainer = this.add.container(cx, height * 0.5);
    this.buildSettingsPanel();
    this.settingsContainer.setVisible(false);

    this.buildJudgementRulesOverlay();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.practiceContainer?.visible && !this.isPracticeBpmEditing) {
        this.closePracticeMode();
      }
    });

    // Open practice panel only after ALL containers are initialized so
    // openPracticeMode() can safely call setVisible on every container.
    if (this.pendingOpenPracticeMode) {
      this.practiceMode = this.pendingPracticeMode;
      this.openPracticeMode();
    }

    if (DEBUG_MODE) {
      this.createDebugEndingOverlay();
    }
  }

  private createDebugEndingOverlay() {
    this.removeDebugEndingOverlay();

    const presets = DEBUG_ENDING_PRESETS;
    const root = document.createElement('div');
    root.setAttribute('data-suto-menu-debug-ending', '1');
    root.style.position = 'fixed';
    root.style.left = '12px';
    root.style.top = '12px';
    root.style.zIndex = String(HTML_LAYER.GAME_FRAME_BEZEL - 1);
    root.style.display = 'grid';
    root.style.gridTemplateColumns = 'repeat(2, minmax(86px, 1fr))';
    root.style.gap = '8px';
    root.style.padding = '12px';
    root.style.width = '248px';
    root.style.background = 'rgba(15, 20, 32, 0.96)';
    root.style.border = '2px solid #ffd24d';
    root.style.borderRadius = '10px';
    root.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.45)';
    root.style.fontFamily = "'Noto Sans TC', 'PingFang TC', sans-serif";
    root.style.pointerEvents = 'auto';

    const title = document.createElement('div');
    title.textContent = 'MENU DEBUG 結算';
    title.style.gridColumn = '1 / -1';
    title.style.fontSize = '16px';
    title.style.fontWeight = '800';
    title.style.color = '#ffe066';
    root.appendChild(title);

    const nodeConfirmRow = document.createElement('div');
    nodeConfirmRow.style.gridColumn = '1 / -1';
    nodeConfirmRow.style.display = 'flex';
    nodeConfirmRow.style.alignItems = 'center';
    nodeConfirmRow.style.justifyContent = 'space-between';
    nodeConfirmRow.style.gap = '8px';

    const nodeConfirmLabel = document.createElement('div');
    nodeConfirmLabel.textContent = '拍點確認';
    nodeConfirmLabel.style.fontSize = '14px';
    nodeConfirmLabel.style.fontWeight = '700';
    nodeConfirmLabel.style.color = '#d8e8ff';
    nodeConfirmRow.appendChild(nodeConfirmLabel);

    const nodeConfirmButton = document.createElement('button');
    nodeConfirmButton.type = 'button';
    nodeConfirmButton.textContent = this.settings.nodeConfirmToggle ? 'ON (全節拍判定 x)' : 'OFF';
    nodeConfirmButton.style.height = '30px';
    nodeConfirmButton.style.padding = '0 10px';
    nodeConfirmButton.style.border = '1px solid #8fb3dc';
    nodeConfirmButton.style.borderRadius = '6px';
    nodeConfirmButton.style.background = '#1f2b3b';
    nodeConfirmButton.style.color = '#ffffff';
    nodeConfirmButton.style.fontSize = '13px';
    nodeConfirmButton.style.fontWeight = '700';
    nodeConfirmButton.style.cursor = 'pointer';
    nodeConfirmButton.onmouseenter = () => {
      nodeConfirmButton.style.background = '#314865';
      nodeConfirmButton.style.borderColor = '#c8dcff';
    };
    wireDomButtonHoverSound(this, nodeConfirmButton);
    nodeConfirmButton.onmouseleave = () => {
      nodeConfirmButton.style.background = '#1f2b3b';
      nodeConfirmButton.style.borderColor = '#8fb3dc';
    };
    nodeConfirmButton.onclick = () => {
      this.settings.nodeConfirmToggle = !this.settings.nodeConfirmToggle;
      nodeConfirmButton.textContent = this.settings.nodeConfirmToggle ? 'ON (全節拍判定 x)' : 'OFF';
      this.saveSettings();
    };
    nodeConfirmRow.appendChild(nodeConfirmButton);
    root.appendChild(nodeConfirmRow);

    presets.forEach(preset => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.rank;
      button.style.height = '40px';
      button.style.border = '2px solid #c8dcff';
      button.style.borderRadius = '8px';
      button.style.background = '#233042';
      button.style.color = '#ffffff';
      button.style.fontSize = '20px';
      button.style.fontWeight = '800';
      button.style.cursor = 'pointer';
      button.onmouseenter = () => {
        button.style.background = '#385276';
        button.style.borderColor = '#ffffff';
      };
      wireDomButtonHoverSound(this, button);
      button.onmouseleave = () => {
        button.style.background = '#233042';
        button.style.borderColor = '#c8dcff';
      };
      button.onclick = () => this.startDebugEndingPreview(preset);
      root.appendChild(button);
    });

    const hint = document.createElement('div');
    hint.textContent = '快捷鍵: 1~7';
    hint.style.gridColumn = '1 / -1';
    hint.style.fontSize = '14px';
    hint.style.fontWeight = '700';
    hint.style.color = '#ffffff';
    root.appendChild(hint);

    document.body.appendChild(root);
    this.debugEndingOverlayRoot = root;

    this.debugEndingHotkeyHandler = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= presets.length) return;
      this.startDebugEndingPreview(presets[index]);
    };
    window.addEventListener('keydown', this.debugEndingHotkeyHandler);
  }

  private removeDebugEndingOverlay() {
    if (this.debugEndingHotkeyHandler) {
      window.removeEventListener('keydown', this.debugEndingHotkeyHandler);
      this.debugEndingHotkeyHandler = undefined;
    }
    this.debugEndingOverlayRoot?.remove();
    this.debugEndingOverlayRoot = undefined;
  }

  private startDebugEndingPreview(preset: DebugEndingPreset) {
    this.scene.start('GameScene', {
      settings: this.settings,
      stageIndex: 0,
      mode: 'challenge',
      debugEndingPreset: preset,
    });
  }

  private buildJudgementRulesOverlay() {
    const { width, height } = this.scale;
    const background = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.92)
      .setInteractive({ useHandCursor: true });
    const image = this.add.image(width / 2, height / 2, 'judgement_rules_1');
    const imageScale = Math.min((width * 0.94) / image.width, (height * 0.86) / image.height);
    image.setScale(imageScale);

    const prompt = this.add.text(width / 2, height - 42, '按任意按鍵繼續', {
      fontSize: '32px',
      fontFamily: "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
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

    this.judgementRulesKeyHandler = (event: KeyboardEvent) => {
      if (!this.judgementRulesContainer.visible) {
        return;
      }
      event.preventDefault();
      this.advanceJudgementRules();
    };
    this.input.keyboard?.on('keydown', this.judgementRulesKeyHandler);
  }

  private buildMainlinePracticeItems(): PracticeMainlineItem[] {
    const items: PracticeMainlineItem[] = [];

    for (const stage of MAIN_LEVEL_DATA.stages) {
      let stageSectionNumber = 0;
      for (const section of stage.sections) {
        if (section.type === 'delay') continue;
        if (section.type === 'normal' && section.effect === 'button') continue;
        stageSectionNumber++;
        if (section.type !== 'normal' && section.type !== 'rotation') continue;

        items.push({
          id: `mainline-${stage.stage_number}-${stageSectionNumber}`,
          label: `${stage.stage_number}-${stageSectionNumber}`,
          stageBpm: stage.bpm,
          section,
        });
      }
    }

    return items;
  }

  private loadCustomPracticeItems(): PracticeCustomItem[] {
    try {
      const raw = window.localStorage.getItem(PRACTICE_CUSTOM_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<Partial<PracticeCustomItem>>;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((entry, index) => {
          const commands = Array.isArray(entry.commands)
            ? entry.commands.filter((cmd): cmd is PracticeCommand => this.isPracticeCommand(cmd))
            : [];
          if (commands.length !== 8) return null;

          return {
            id: typeof entry.id === 'string' ? entry.id : `custom-${Date.now()}-${index}`,
            bpm: this.sanitizePracticeBpm(entry.bpm),
            commands,
            createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
          };
        })
        .filter((entry): entry is PracticeCustomItem => Boolean(entry));
    } catch {
      return [];
    }
  }

  private saveCustomPracticeItems() {
    try {
      window.localStorage.setItem(PRACTICE_CUSTOM_STORAGE_KEY, JSON.stringify(this.practiceCustomItems));
    } catch {
      // Ignore storage write failures.
    }
  }

  private isPracticeCommand(value: unknown): value is PracticeCommand {
    return value === 'w' || value === 'x' || value === 'a' || value === 'd'
      || value === 'q' || value === 'e' || value === 'z' || value === 'c'
      || value === 'L' || value === 'R';
  }

  private sanitizePracticeBpm(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 183.5;
    return Math.max(120, Math.min(360, Math.round(parsed * 10) / 10));
  }

  private formatPracticeBpm(bpm: number): string {
    const normalized = this.sanitizePracticeBpm(bpm);
    return Number.isInteger(normalized) ? `${normalized.toFixed(0)}` : `${normalized.toFixed(1)}`;
  }

  private beginPracticeBpmInlineEdit() {
    if (this.isPracticeBpmEditing) return;

    this.isPracticeBpmEditing = true;
    this.practiceCustomBpmInputRaw = this.formatPracticeBpm(this.practiceCustomBpm);
    this.practiceCustomBpmInputBg?.setStrokeStyle(2, 0xffd88a, 1);
    this.practiceCustomBpmValueText?.setText(`${this.practiceCustomBpmInputRaw}_`);

    this.practiceBpmKeyHandler = (event: KeyboardEvent) => {
      if (!this.isPracticeBpmEditing) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        this.endPracticeBpmInlineEdit(true);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.endPracticeBpmInlineEdit(false);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        this.practiceCustomBpmInputRaw = this.practiceCustomBpmInputRaw.slice(0, -1);
        this.practiceCustomBpmValueText?.setText(`${this.practiceCustomBpmInputRaw || ' '}_`);
        return;
      }

      const isDigit = event.key >= '0' && event.key <= '9';
      const isDot = event.key === '.';
      if (!isDigit && !isDot) return;

      if (isDot && this.practiceCustomBpmInputRaw.includes('.')) return;
      if (this.practiceCustomBpmInputRaw.length >= 6) return;

      event.preventDefault();
      this.practiceCustomBpmInputRaw += event.key;
      this.practiceCustomBpmValueText?.setText(`${this.practiceCustomBpmInputRaw}_`);
    };
    window.addEventListener('keydown', this.practiceBpmKeyHandler);
  }

  private endPracticeBpmInlineEdit(commit: boolean) {
    if (!this.isPracticeBpmEditing) return;

    if (this.practiceBpmKeyHandler) {
      window.removeEventListener('keydown', this.practiceBpmKeyHandler);
      this.practiceBpmKeyHandler = undefined;
    }

    if (commit) {
      const next = this.sanitizePracticeBpm(this.practiceCustomBpmInputRaw);
      this.practiceCustomBpm = next;
    }

    this.practiceCustomBpmInputRaw = '';
    this.isPracticeBpmEditing = false;
    this.practiceCustomBpmInputBg?.setStrokeStyle(2, 0x6da0d4, 1);
    this.practiceCustomBpmValueText?.setText(this.formatPracticeBpm(this.practiceCustomBpm));
  }

  private adjustPracticeBpm(delta: number) {
    this.endPracticeBpmInlineEdit(false);
    this.practiceCustomBpm = this.sanitizePracticeBpm(this.practiceCustomBpm + delta);
    this.practiceCustomBpmValueText?.setText(this.formatPracticeBpm(this.practiceCustomBpm));
  }

  private isPointerInsideGameObject(pointer: Phaser.Input.Pointer, gameObject?: Phaser.GameObjects.GameObject): boolean {
    if (!gameObject || !('getBounds' in gameObject)) return false;
    const bounds = (gameObject as Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle).getBounds();
    return bounds.contains(pointer.x, pointer.y);
  }

  private buildPracticePanel() {
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78)
      .setInteractive({ useHandCursor: false });
    const panel = this.add.rectangle(width / 2, height / 2, width * 0.96, height * 0.92, 0x111a2a, 0.95)
      .setStrokeStyle(2, 0x5072a6, 1);

    const title = this.add.text(68, 88, '練習模式', {
      fontSize: '44px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const topButtonY = 54;
    const topButtonGap = 160;
    const closeBtn = this.add.text(width - 80, topButtonY, '離開', {
      fontSize: '24px',
      color: '#ffe6ec',
      backgroundColor: '#5a2b3b',
      padding: { x: 18, y: 8 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#6c3548'));
    closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#5a2b3b'));
    closeBtn.on('pointerdown', () => this.closePracticeMode());

    this.practiceModeMainlineBtn = this.add.text(width - 204 - topButtonGap * 2, topButtonY, '主播模式', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#335a90',
      padding: { x: 18, y: 8 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.practiceModeMainlineBtn.on('pointerdown', () => this.setPracticeMode('mainline'));

    this.practiceModeCustomBtn = this.add.text(width - 204 - topButtonGap, topButtonY, '自訂', {
      fontSize: '24px',
      color: '#9eb6d9',
      backgroundColor: '#1a283d',
      padding: { x: 18, y: 8 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.practiceModeCustomBtn.on('pointerdown', () => this.setPracticeMode('custom'));

    const leftPreviewLabel = this.add.text(86, 136, '指令預覽 4x2', {
      fontSize: '22px',
      color: '#9ad0ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const previewStartX = 88;
    const previewStartY = 172;
    const previewGapX = 66;
    const previewGapY = 62;
    const previewCellW = 56;
    const previewCellH = 50;
    const previewObjects: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 8; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = previewStartX + col * previewGapX;
      const y = previewStartY + row * previewGapY;
      const cell = this.add.rectangle(x, y, previewCellW, previewCellH, 0x0a1320, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x35557d, 1);
      const slotText = this.add.text(x + previewCellW / 2, y + previewCellH / 2, '-', {
        fontSize: '24px',
        color: '#ecf5ff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      previewObjects.push(cell, slotText);
      this.practiceCustomPreviewSlots.push(slotText);
    }

    this.practiceCustomPreviewContainer = this.add.container(0, 0, [
      leftPreviewLabel,
      ...previewObjects,
    ]);

    const listLeft = width * 0.54;
    const listTop = 104;
    const listWidth = width * 0.4;
    const listHeight = height * 0.77;
    const listFrame = this.add.rectangle(listLeft + listWidth / 2, listTop + listHeight / 2, listWidth, listHeight, 0x0f1724, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x35557d, 1);
    const listTitle = this.add.text(listLeft + 22, listTop + 20, '練習清單（滑鼠滾輪上下滑）', {
      fontSize: '20px',
      color: '#b8d5ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.practiceListViewport = this.add.rectangle(listLeft + 12, listTop + 48, listWidth - 24, listHeight - 60, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: false });
    this.practiceListContentBaseY = listTop + 54;
    this.practiceListContent = this.add.container(listLeft + 18, this.practiceListContentBaseY);

    this.practiceListMaskGraphics = this.add.graphics();
    this.practiceListMaskGraphics.setVisible(false);
    this.practiceListMaskGraphics.fillStyle(0xffffff, 1);
    this.practiceListMaskGraphics.fillRect(
      this.practiceListViewport.x,
      this.practiceListViewport.y,
      this.practiceListViewport.width,
      this.practiceListViewport.height,
    );
    this.practiceListContent.setMask(this.practiceListMaskGraphics.createGeometryMask());

    this.practiceCustomBuilderContainer = this.add.container(0, 0);
    const customBuilderTitle = this.add.text(86, 320, '自訂 8 指令（九宮格 + 旋轉）', {
      fontSize: '22px',
      color: '#ffd9aa',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.practiceCustomBuilderContainer.add(customBuilderTitle);

    const gridLeft = 96;
    const gridTop = 392;
    const cellW = 74;
    const cellH = 62;
    const gridGap = 8;
    const gridLabels: Array<{ label: string; cmd: PracticeCommand | null }> = [
      { label: '↖', cmd: 'q' },
      { label: '↑', cmd: 'w' },
      { label: '↗', cmd: 'e' },
      { label: '←', cmd: 'a' },
      { label: '', cmd: null },
      { label: '→', cmd: 'd' },
      { label: '↙', cmd: 'z' },
      { label: '↓', cmd: 'x' },
      { label: '↘', cmd: 'c' },
    ];

    gridLabels.forEach((entry, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = gridLeft + col * (cellW + gridGap);
      const y = gridTop + row * (cellH + gridGap);
      const bg = this.add.rectangle(x, y, cellW, cellH, entry.cmd ? 0x1f324b : 0x0c1320, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, entry.cmd ? 0x81a8d8 : 0x24364f, 1);
      this.practiceCustomBuilderContainer.add(bg);
      if (entry.label) {
        const text = this.add.text(x + cellW / 2, y + cellH / 2, entry.label, {
          fontSize: '32px',
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        this.practiceCustomBuilderContainer.add(text);
      }
      if (!entry.cmd) return;

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.pushPracticeCustomCommand(entry.cmd as PracticeCommand));
    });

    const actionBtnWidth = 140;
    const actionBtnHeight = 56;
    const actionBtnX = gridLeft + 420;
    const rotateBtnY = gridTop + (cellH + gridGap) * 3 + 26;
    const rotateLeftBtnX = gridLeft + 52;
    const rotateRightBtnX = gridLeft + 186;
    const rotateBtnWidth = 104;
    const rotateBtnHeight = 50;
    const rotateLeftBtnBg = this.add.rectangle(rotateLeftBtnX, rotateBtnY, rotateBtnWidth, rotateBtnHeight, 0x27415f, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x9cc3f1, 1)
      .setInteractive({ useHandCursor: true });
    rotateLeftBtnBg.on('pointerover', () => rotateLeftBtnBg.setFillStyle(0x355b85, 1));
    rotateLeftBtnBg.on('pointerout', () => rotateLeftBtnBg.setFillStyle(0x27415f, 1));
    const rotateLeftBtn = this.add.text(rotateLeftBtnX, rotateBtnY, '⟲', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    rotateLeftBtnBg.on('pointerdown', () => this.pushPracticeCustomCommand('L'));

    const rotateRightBtnBg = this.add.rectangle(rotateRightBtnX, rotateBtnY, rotateBtnWidth, rotateBtnHeight, 0x563024, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffbe8b, 1)
      .setInteractive({ useHandCursor: true });
    rotateRightBtnBg.on('pointerover', () => rotateRightBtnBg.setFillStyle(0x754336, 1));
    rotateRightBtnBg.on('pointerout', () => rotateRightBtnBg.setFillStyle(0x563024, 1));
    const rotateRightBtn = this.add.text(rotateRightBtnX, rotateBtnY, '⟳', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    rotateRightBtnBg.on('pointerdown', () => this.pushPracticeCustomCommand('R'));

    const bpmInputY = gridTop + 36;
    const bpmCenterX = actionBtnX;
    const bpmInputBg = this.add.rectangle(bpmCenterX, bpmInputY, 110, 40, 0x1c3048, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x6da0d4, 1)
      .setInteractive({ useHandCursor: true });
    this.practiceCustomBpmInputBg = bpmInputBg;
    this.practiceCustomBpmValueText = this.add.text(bpmCenterX, bpmInputY, this.formatPracticeBpm(this.practiceCustomBpm), {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    bpmInputBg.on('pointerdown', () => this.beginPracticeBpmInlineEdit());
    this.practiceCustomBpmValueText.setInteractive({ useHandCursor: true });
    this.practiceCustomBpmValueText.on('pointerdown', () => this.beginPracticeBpmInlineEdit());

    const bpmAdjustLabelY = bpmInputY - 34;
    const bpmAdjustButtonY = bpmInputY;
    const farLeftX = bpmCenterX - 112;
    const nearLeftX = bpmCenterX - 76;
    const nearRightX = bpmCenterX + 76;
    const farRightX = bpmCenterX + 112;
    const makeBpmAdjustControl = (x: number, amountLabel: string, buttonLabel: string, delta: number) => {
      const amount = this.add.text(x, bpmAdjustLabelY, amountLabel, {
        fontSize: '16px',
        color: '#9fbbe0',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      const button = this.add.text(x, bpmAdjustButtonY, buttonLabel, {
        fontSize: '26px',
        color: '#eef6ff',
        fontStyle: 'bold',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.adjustPracticeBpm(delta));
      return [amount, button];
    };
    const bpmAdjustButtons = [
      ...makeBpmAdjustControl(farLeftX, '-10', '<<', -10),
      ...makeBpmAdjustControl(nearLeftX, '-5', '<', -5),
         this.add.text(bpmCenterX, bpmAdjustLabelY, 'BPM', {
          fontSize: '16px',
          color: '#9fbbe0',
          fontStyle: 'bold',
        }).setOrigin(0.5),
      ...makeBpmAdjustControl(nearRightX, '+5', '>', 5),
      ...makeBpmAdjustControl(farRightX, '+10', '>>', 10),
    ];

    const clearBtnBg = this.add.rectangle(actionBtnX, gridTop + 240, actionBtnWidth, actionBtnHeight, 0x5f3f27, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xc08b62, 1)
      .setInteractive({ useHandCursor: true });
    clearBtnBg.on('pointerover', () => clearBtnBg.setFillStyle(0x7a5332, 1));
    clearBtnBg.on('pointerout', () => clearBtnBg.setFillStyle(0x5f3f27, 1));
    const clearBtn = this.add.text(actionBtnX, gridTop + 240, '清空', {
      fontSize: '30px',
      fontFamily: UI_CJK_FONT_FAMILY,
      color: '#ffe9d4',
      fontStyle: 'bold',
      padding: { top: 5, bottom: 2 },
    }).setOrigin(0.5);
    clearBtnBg.on('pointerdown', () => {
      this.practiceCustomBuildCommands = [];
      this.refreshPracticeCustomPreview();
    });

    const undoBtnBg = this.add.rectangle(actionBtnX, gridTop + 168, actionBtnWidth, actionBtnHeight, 0x3a465f, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x8ea7c8, 1)
      .setInteractive({ useHandCursor: true });
    undoBtnBg.on('pointerover', () => undoBtnBg.setFillStyle(0x4c5c7c, 1));
    undoBtnBg.on('pointerout', () => undoBtnBg.setFillStyle(0x3a465f, 1));
    const undoBtn = this.add.text(actionBtnX, gridTop + 168, '後退', {
      fontSize: '30px',
      fontFamily: UI_CJK_FONT_FAMILY,
      color: '#eef4ff',
      fontStyle: 'bold',
      padding: { top: 5, bottom: 2 },
    }).setOrigin(0.5);
    undoBtnBg.on('pointerdown', () => {
      if (this.practiceCustomBuildCommands.length === 0) return;
      this.practiceCustomBuildCommands.pop();
      this.refreshPracticeCustomPreview();
    });

    this.practiceCustomAddBtnBg = this.add.rectangle(actionBtnX, gridTop + 96, actionBtnWidth, actionBtnHeight, 0x24402c, 0.4)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x3f6d4d, 1)
      .setInteractive({ useHandCursor: true });
    this.practiceCustomAddBtnBg.on('pointerdown', () => this.addPracticeCustomSet());
    this.practiceCustomAddBtn = this.add.text(actionBtnX, gridTop + 96, '新增', {
      fontSize: '30px',
      fontFamily: UI_CJK_FONT_FAMILY,
      color: '#8fbd99',
      fontStyle: 'bold',
      padding: { top: 5, bottom: 2 },
    }).setOrigin(0.5);
    this.practiceCustomBuilderContainer.add([
      rotateLeftBtnBg,
      rotateLeftBtn,
      rotateRightBtnBg,
      rotateRightBtn,
      ...bpmAdjustButtons,
      bpmInputBg,
      this.practiceCustomBpmValueText,
      clearBtnBg,
      clearBtn,
      undoBtnBg,
      undoBtn,
      this.practiceCustomAddBtnBg,
      this.practiceCustomAddBtn,
    ]);

    this.practiceContainer = this.add.container(0, 0, [
      overlay,
      panel,
      title,
      closeBtn,
      this.practiceModeMainlineBtn,
      this.practiceModeCustomBtn,
      this.practiceCustomPreviewContainer,
      listFrame,
      listTitle,
      this.practiceListViewport,
      this.practiceListContent,
      this.practiceCustomBuilderContainer,
    ]);
    this.practiceContainer.setDepth(25);

    this.practiceWheelListener = (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      if (!this.practiceContainer.visible) return;
      const withinX = pointer.x >= this.practiceListViewport.x && pointer.x <= this.practiceListViewport.x + this.practiceListViewport.width;
      const withinY = pointer.y >= this.practiceListViewport.y && pointer.y <= this.practiceListViewport.y + this.practiceListViewport.height;
      if (!withinX || !withinY) return;

      this.practiceListScrollOffset = Phaser.Math.Clamp(
        this.practiceListScrollOffset - deltaY * 0.7,
        this.practiceListScrollMin,
        0,
      );
      this.practiceListContent.y = this.practiceListContentBaseY + this.practiceListScrollOffset;
    };
    this.input.on('wheel', this.practiceWheelListener);

    this.practicePointerListener = (pointer: Phaser.Input.Pointer) => {
      if (!this.isPracticeBpmEditing) return;
      if (this.isPointerInsideGameObject(pointer, this.practiceCustomBpmInputBg)) return;
      if (this.isPointerInsideGameObject(pointer, this.practiceCustomBpmValueText)) return;
      this.endPracticeBpmInlineEdit(false);
    };
    this.input.on('pointerdown', this.practicePointerListener);

    this.refreshPracticeCustomPreview();
    this.setPracticeMode('mainline');
  }

  private openPracticeMode() {
    this.settingsVisible = false;
    this.settingsContainer.setVisible(false);
    this.menuContainer.setVisible(false);
    this.judgementRulesContainer.setVisible(false);
    this.practiceContainer.setVisible(true);
    this.setPracticeMode(this.practiceMode);
  }

  private closePracticeMode() {
    this.endPracticeBpmInlineEdit(false);
    this.practiceContainer.setVisible(false);
    this.menuContainer.setVisible(true);
  }

  private setPracticeMode(mode: PracticeMode) {
    this.practiceMode = mode;
    const isMainline = mode === 'mainline';
    if (isMainline) {
      this.endPracticeBpmInlineEdit(false);
    }
    this.practiceModeMainlineBtn.setBackgroundColor(isMainline ? '#335a90' : '#1a283d');
    this.practiceModeMainlineBtn.setColor(isMainline ? '#ffffff' : '#9eb6d9');
    this.practiceModeCustomBtn.setBackgroundColor(isMainline ? '#1a283d' : '#335a90');
    this.practiceModeCustomBtn.setColor(isMainline ? '#9eb6d9' : '#ffffff');
    this.practiceCustomPreviewContainer.setVisible(!isMainline);
    this.practiceCustomBuilderContainer.setVisible(!isMainline);
    this.refreshPracticeList();
  }

  private getCommandIcon(command: PracticeCommand): string {
    if (command === 'w') return '↑';
    if (command === 'x') return '↓';
    if (command === 'a') return '←';
    if (command === 'd') return '→';
    if (command === 'q') return '↖';
    if (command === 'e') return '↗';
    if (command === 'z') return '↙';
    if (command === 'c') return '↘';
    if (command === 'L') return 'L';
    return 'R';
  }

  private refreshPracticeCustomPreview() {
    for (let i = 0; i < this.practiceCustomPreviewSlots.length; i++) {
      const cmd = this.practiceCustomBuildCommands[i];
      this.practiceCustomPreviewSlots[i].setText(cmd ? this.getCommandIcon(cmd) : '-');
      this.practiceCustomPreviewSlots[i].setColor(cmd ? '#ecf5ff' : '#6b7f99');
    }

    const isReady = this.practiceCustomBuildCommands.length === 8;
    this.practiceCustomAddBtnBg.setFillStyle(isReady ? 0x2a5f38 : 0x24402c, isReady ? 1 : 0.4);
    this.practiceCustomAddBtnBg.setStrokeStyle(2, isReady ? 0x7bd18f : 0x3f6d4d, 1);
    this.practiceCustomAddBtn.setColor(isReady ? '#e5ffe9' : '#8fbd99');
  }

  private pushPracticeCustomCommand(command: PracticeCommand) {
    if (this.practiceCustomBuildCommands.length >= 8) return;

    const first = this.practiceCustomBuildCommands[0];
    if (first) {
      const firstIsRotation = first === 'L' || first === 'R';
      const nextIsRotation = command === 'L' || command === 'R';
      if (firstIsRotation !== nextIsRotation) {
        this.practiceCustomBuildCommands = [command];
        this.refreshPracticeCustomPreview();
        return;
      }
    }

    this.practiceCustomBuildCommands.push(command);
    this.refreshPracticeCustomPreview();
  }

  private addPracticeCustomSet() {
    if (this.practiceCustomBuildCommands.length !== 8) return;

    const item: PracticeCustomItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      bpm: this.practiceCustomBpm,
      commands: [...this.practiceCustomBuildCommands],
      createdAt: Date.now(),
    };
    this.practiceCustomItems.push(item);
    this.saveCustomPracticeItems();
    this.practiceCustomBuildCommands = [];
    this.refreshPracticeCustomPreview();
    this.refreshPracticeList();
  }

  private removePracticeCustomSet(id: string) {
    this.practiceCustomItems = this.practiceCustomItems.filter(item => item.id !== id);
    this.saveCustomPracticeItems();
    this.refreshPracticeList();
  }

  private refreshPracticeList() {
    this.practiceListContent.removeAll(true);

    const rowHeight = 104;
    let rowIndex = 0;

    if (this.practiceMode === 'mainline') {
      for (const item of this.practiceMainlineItems) {
        const row = this.createPracticeRowForMainline(item, rowIndex * rowHeight);
        this.practiceListContent.add(row);
        rowIndex++;
      }
    } else {
      for (let i = 0; i < this.practiceCustomItems.length; i++) {
        const item = this.practiceCustomItems[i];
        const row = this.createPracticeRowForCustom(item, i + 1, rowIndex * rowHeight);
        this.practiceListContent.add(row);
        rowIndex++;
      }
    }

    if (rowIndex === 0) {
      const empty = this.add.text(22, 22, this.practiceMode === 'mainline' ? '找不到可練習段落' : '尚無自訂段落，先在左側輸入 8 指令', {
        fontSize: '22px',
        color: '#8ea7c8',
      }).setOrigin(0, 0.5);
      this.practiceListContent.add(empty);
      rowIndex = 1;
    }

    const contentHeight = rowIndex * rowHeight;
    this.practiceListScrollMin = Math.min(0, this.practiceListViewport.height - contentHeight - 12);
    this.practiceListScrollOffset = Phaser.Math.Clamp(this.practiceListScrollOffset, this.practiceListScrollMin, 0);
    this.practiceListContent.y = this.practiceListContentBaseY + this.practiceListScrollOffset;
  }

  private createPracticeRowForMainline(item: PracticeMainlineItem, y: number): Phaser.GameObjects.Container {
    const row = this.add.container(0, y);
    const bg = this.add.rectangle(0, 0, this.practiceListViewport.width - 12, 94, 0x182436, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x466188, 1);
    const setRowHighlight = (highlighted: boolean) => {
      bg.setFillStyle(highlighted ? 0x22354e : 0x182436, 0.95);
      bg.setStrokeStyle(1, highlighted ? 0x7ea6d6 : 0x466188, 1);
    };
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => setRowHighlight(true));
    bg.on('pointerout', () => setRowHighlight(false));
    const title = this.add.text(14, 20, `關卡 ${item.label}`, {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const bpmText = this.add.text(14, 72, `BPM ${this.formatPracticeBpm(item.section.bpm ?? item.stageBpm)}`, {
      fontSize: '17px',
      color: '#9fc7f4',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const commands: PracticeCommand[] = item.section.type === 'normal'
      ? [...item.section.prompts]
      : [...item.section.rotate];
    const preview = this.createRowPreview(commands, 146, 12);

    const practiceBtn = this.add.text(this.practiceListViewport.width - 122, 47, '練習', {
      fontSize: '22px',
      color: '#c9ffd6',
      backgroundColor: '#2b5f3d',
      padding: { x: 10, y: 5 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    practiceBtn.on('pointerover', () => practiceBtn.setBackgroundColor('#3a7a50'));
    practiceBtn.on('pointerout', () => practiceBtn.setBackgroundColor('#2b5f3d'));
    practiceBtn.on('pointerover', () => setRowHighlight(true));
    practiceBtn.on('pointerout', () => setRowHighlight(false));
    practiceBtn.on('pointerdown', () => this.startMainlinePractice(item));

    row.add([bg, title, bpmText, ...preview, practiceBtn]);
    return row;
  }

  private createPracticeRowForCustom(item: PracticeCustomItem, displayIndex: number, y: number): Phaser.GameObjects.Container {
    const row = this.add.container(0, y);
    const bg = this.add.rectangle(0, 0, this.practiceListViewport.width - 12, 94, 0x182436, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x466188, 1);
    const setRowHighlight = (highlighted: boolean) => {
      bg.setFillStyle(highlighted ? 0x22354e : 0x182436, 0.95);
      bg.setStrokeStyle(1, highlighted ? 0x7ea6d6 : 0x466188, 1);
    };
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => setRowHighlight(true));
    bg.on('pointerout', () => setRowHighlight(false));
    const title = this.add.text(14, 20, `自訂 ${displayIndex.toString().padStart(2, '0')}`, {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const bpmText = this.add.text(14, 72, `BPM ${this.formatPracticeBpm(item.bpm)}`, {
      fontSize: '17px',
      color: '#9fc7f4',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const preview = this.createRowPreview(item.commands, 146, 12);

    const practiceBtn = this.add.text(this.practiceListViewport.width - 160, 47, '練習', {
      fontSize: '20px',
      color: '#c9ffd6',
      backgroundColor: '#2b5f3d',
      padding: { x: 8, y: 5 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    practiceBtn.on('pointerover', () => practiceBtn.setBackgroundColor('#3a7a50'));
    practiceBtn.on('pointerout', () => practiceBtn.setBackgroundColor('#2b5f3d'));
    practiceBtn.on('pointerover', () => setRowHighlight(true));
    practiceBtn.on('pointerout', () => setRowHighlight(false));
    practiceBtn.on('pointerdown', () => this.startCustomPractice(item));

    const removeBtn = this.add.text(this.practiceListViewport.width - 80, 47, '移除', {
      fontSize: '20px',
      color: '#ffd2d2',
      backgroundColor: '#6d3030',
      padding: { x: 8, y: 5 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    removeBtn.on('pointerover', () => removeBtn.setBackgroundColor('#874040'));
    removeBtn.on('pointerout', () => removeBtn.setBackgroundColor('#6d3030'));
    removeBtn.on('pointerover', () => setRowHighlight(true));
    removeBtn.on('pointerout', () => setRowHighlight(false));
    removeBtn.on('pointerdown', () => this.removePracticeCustomSet(item.id));

    row.add([bg, title, bpmText, ...preview, practiceBtn, removeBtn]);
    return row;
  }

  private createRowPreview(commands: PracticeCommand[], x: number, y: number): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const cellW = 30;
    const cellH = 28;
    for (let i = 0; i < 8; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const cellX = x + col * (cellW + 7);
      const cellY = y + row * (cellH + 6);
      const rect = this.add.rectangle(cellX, cellY, cellW, cellH, 0x08101b, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x3d5b82, 1);
      const txt = this.add.text(cellX + cellW / 2, cellY + cellH / 2, this.getCommandIcon(commands[i] ?? 'w'), {
        fontSize: '16px',
        color: '#eaf4ff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      objects.push(rect, txt);
    }
    return objects;
  }

  private startMainlinePractice(item: PracticeMainlineItem) {
    const targetBpm = item.section.bpm ?? item.stageBpm;
    const section = item.section.type === 'normal'
      ? { ...item.section, bpm: targetBpm, prompts: [...item.section.prompts], repeat: PRACTICE_REPEAT_COUNT }
      : { ...item.section, bpm: targetBpm, rotate: [...item.section.rotate], repeat: PRACTICE_REPEAT_COUNT };

    const practiceAudioClip = LEVEL_DATA.stages[0]?.audio_clip;
    const practiceAudioBaseBpm = LEVEL_DATA.stages[0]?.bpm ?? targetBpm;
    const levelData: LevelData = {
      stages: [
        {
          stage_number: 1,
          bpm: practiceAudioBaseBpm,
          ...(practiceAudioClip ? { audio_clip: practiceAudioClip } : {}),
          sections: [section],
        },
      ],
    };

    this.scene.start('GameScene', {
      settings: this.settings,
      stageIndex: 0,
      mode: 'challenge',
      levelData,
      showPracticeReturnButton: true,
      practiceReturnMode: 'mainline',
    });
  }

  private startCustomPractice(item: PracticeCustomItem) {
    const isRotation = item.commands.every(cmd => cmd === 'L' || cmd === 'R');
    const section: NormalSection | RotationSection = isRotation
      ? {
          type: 'rotation',
          bpm: item.bpm,
          start: 'w',
          rotate: item.commands as ('L' | 'R')[],
          repeat: PRACTICE_REPEAT_COUNT,
        }
      : {
          type: 'normal',
          bpm: item.bpm,
          prompts: item.commands.filter((cmd): cmd is Direction => cmd !== 'L' && cmd !== 'R'),
          repeat: PRACTICE_REPEAT_COUNT,
        };

    const practiceAudioClip = LEVEL_DATA.stages[0]?.audio_clip;
    const practiceAudioBaseBpm = LEVEL_DATA.stages[0]?.bpm ?? item.bpm;
    const stage: Stage = {
      stage_number: 1,
      bpm: practiceAudioBaseBpm,
      ...(practiceAudioClip ? { audio_clip: practiceAudioClip } : {}),
      sections: [section],
    };

    this.scene.start('GameScene', {
      settings: this.settings,
      stageIndex: 0,
      mode: 'challenge',
      levelData: { stages: [stage] },
      showPracticeReturnButton: true,
      practiceReturnMode: 'custom',
    });
  }

  private buildSettingsPanel() {
    const { width, height } = this.scale;
    const inputBlocker = this.add.rectangle(0, 0, width, height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: false });
    const bg = this.add.rectangle(0, 0, 620, 340, 0x111122, 0.95);
    const title = this.add.text(0, -122, '設定', { fontSize: '28px', color: '#fff' }).setOrigin(0.5);

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

    const storyDelayRow = makeRow('開場 Delay (ms)',
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

    const debugNodeConfirmToggleRow: Phaser.GameObjects.GameObject[] = [];
    if (DEBUG_MODE) {
      const label = this.add.text(-230, 82, '拍點確認', { fontSize: '20px', color: '#ccc' }).setOrigin(0, 0.5);
      const value = this.add.text(95, 82, this.settings.nodeConfirmToggle ? 'ON (全節拍判定 x)' : 'OFF', { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
      const button = this.add.text(190, 82, '[ TOGGLE ]', { fontSize: '17px', color: '#8fd3ff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      button.on('pointerdown', () => {
        this.settings.nodeConfirmToggle = !this.settings.nodeConfirmToggle;
        value.setText(this.settings.nodeConfirmToggle ? 'ON (全節拍判定 x)' : 'OFF');
        this.saveSettings();
      });

      debugNodeConfirmToggleRow.push(label, value, button);
    }

    const closeBtn = this.add.text(0, 134, '[ CLOSE ]', { fontSize: '22px', color: '#ffaaaa' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleSettings());

    this.settingsContainer.add([
      inputBlocker,
      bg, title,
      ...volumeSlider,
      ...storyDelayRow,
      ...debugNodeConfirmToggleRow,
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
