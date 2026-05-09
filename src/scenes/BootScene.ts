import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { preloadButtonHoverSound } from './shared/buttonHoverSound';

import welcomeAudioUrl from '../assets/audio/welcome.wav';
import mainlineClickAudioUrl from '../assets/audio/short/來.wav';
import tutorialLoopUrl from '../assets/audio/loop/tutorial.wav';
import promptUUrl from '../assets/audio/U.wav';
import promptDUrl from '../assets/audio/D.wav';
import promptLUrl from '../assets/audio/L.wav';
import promptRUrl from '../assets/audio/R.wav';
import clapUrl from '../assets/audio/clap.wav';
import missUrl from '../assets/audio/miss.wav';
import storyCheckStartUrl from '../assets/audio/short/suto.wav';
import gameoverSfxUrl from '../assets/audio/long/gameover.wav';

import suto400ImageUrl from '../assets/suto400.png';
import openingBgImageUrl from '../assets/opening.png';
import judgementRules1ImageUrl from '../assets/判定規則.png';
import judgementRules2ImageUrl from '../assets/判定規則2.png';
import tutorialImageUrl from '../assets/tutorial.png';
import downImageUrl from '../assets/down.png';
import downLeftImageUrl from '../assets/down_left.png';
import gameoverBgUrl from '../assets/gameover.png';
import loadingImageUrl from '../assets/loading.png';

// challenge tutorial cue 與 tutorial_loop 共用音檔但走獨立 cache key
const CHALLENGE_TUTORIAL_AUDIO_KEY = 'challenge_tutorial_intro';

// 等 UNLOCKED 事件最多 2 秒；瀏覽器拒絕 resume 時 fallback 進主畫面
const UNLOCK_TIMEOUT_MS = 2000;

const PROMPT_FONT_FAMILY = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.image('suto400', suto400ImageUrl);
    this.load.image('opening_bg', openingBgImageUrl);
    this.load.image('judgement_rules_1', judgementRules1ImageUrl);
    this.load.image('judgement_rules_2', judgementRules2ImageUrl);
    this.load.image('tutorial', tutorialImageUrl);
    this.load.image('down', downImageUrl);
    this.load.image('down_left', downLeftImageUrl);
    this.load.image('gameover_bg', gameoverBgUrl);
    this.load.image('loading_overlay', loadingImageUrl);

    this.load.audio('welcome', welcomeAudioUrl);
    this.load.audio('mainline-click', mainlineClickAudioUrl);
    this.load.audio('tutorial_loop', tutorialLoopUrl);
    this.load.audio('prompt_U', promptUUrl);
    this.load.audio('prompt_D', promptDUrl);
    this.load.audio('prompt_L', promptLUrl);
    this.load.audio('prompt_R', promptRUrl);
    this.load.audio('clap', clapUrl);
    this.load.audio('miss', missUrl);
    this.load.audio('story_check_start', storyCheckStartUrl);
    this.load.audio('gameover_sfx', gameoverSfxUrl);
    this.load.audio(CHALLENGE_TUTORIAL_AUDIO_KEY, tutorialLoopUrl);
    preloadButtonHoverSound(this);
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    // Phaser 的 audio loader 已經在 preload 階段同步 decode 完，這裡不用再等 decode。
    // 真正會卡到 first-play 同步的是 AudioContext 的 lock：
    // 瀏覽器 autoplay policy 一定要先有 user gesture 才能 resume，且 manager.locked
    // 翻 false 還要等 resume 的 promise + 一輪 game update。如果在 lock 狀態下 play，
    // BaseSound.play 不會擋下來，buffer source 會被排程到 suspended context 上，等 resume
    // 時時間軸已過 → 短音直接被吃掉、長音從中段播 → 與遊戲 timer 永久 off-sync。
    //
    // 所以這邊明確等 user 點一下，並等 Phaser.Sound.Events.UNLOCKED 確認 context 真的 resumed
    // 才轉場到 MenuScene。這樣後面 welcome / stage audio 第一次播都不會撞 race。

    if (!this.sound.locked) {
      this.scene.start('MenuScene');
      return;
    }

    const promptText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '點擊任意處開始', {
        fontFamily: PROMPT_FONT_FAMILY,
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    let proceeded = false;
    const proceed = () => {
      if (proceeded) return;
      proceeded = true;
      promptText.setText('載入中...');

      const startMenu = () => {
        promptText.destroy();
        this.scene.start('MenuScene');
      };

      if (!this.sound.locked) {
        startMenu();
        return;
      }

      this.sound.once(Phaser.Sound.Events.UNLOCKED, startMenu);
      this.time.delayedCall(UNLOCK_TIMEOUT_MS, () => {
        if (!this.sound.locked) return;
        console.warn('[BootScene] AudioContext unlock 逾時，仍進入主畫面');
        this.sound.off(Phaser.Sound.Events.UNLOCKED, startMenu);
        startMenu();
      });
    };

    this.input.once('pointerdown', proceed);
    this.input.keyboard?.once('keydown', proceed);
  }
}
