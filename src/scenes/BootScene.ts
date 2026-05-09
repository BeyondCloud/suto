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

// preload 後等待 decode 的安全網（毫秒）。decodeAudioData 對巨大檔案理論上幾百毫秒就完成，
// 設長一點以防 mobile 慢機。逾時就放行，不卡 user 進不了主畫面。
const DECODE_TIMEOUT_MS = 3000;

const AUDIO_KEYS_TO_PRELOAD: readonly string[] = [
  'welcome',
  'mainline-click',
  'tutorial_loop',
  'prompt_U',
  'prompt_D',
  'prompt_L',
  'prompt_R',
  'clap',
  'miss',
  'story_check_start',
  'gameover_sfx',
  CHALLENGE_TUTORIAL_AUDIO_KEY,
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // images
    this.load.image('suto400', suto400ImageUrl);
    this.load.image('opening_bg', openingBgImageUrl);
    this.load.image('judgement_rules_1', judgementRules1ImageUrl);
    this.load.image('judgement_rules_2', judgementRules2ImageUrl);
    this.load.image('tutorial', tutorialImageUrl);
    this.load.image('down', downImageUrl);
    this.load.image('down_left', downLeftImageUrl);
    this.load.image('gameover_bg', gameoverBgUrl);
    this.load.image('loading_overlay', loadingImageUrl);

    // audio
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
    const loadingText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '載入中...', {
        fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Phaser 在 audio 下載完之後會自動 queue decode（WebAudioSoundManager.decodeAudio）。
    // 這邊用 sound.add(key).duration > 0 判斷單檔是否已 decode，未 decode 的等
    // Phaser.Sound.Events.DECODED 事件，全部 ready 才切到 MenuScene，避免第一次進主畫面時
    // sound.play 撞 decode race 而 silent fail / 與 stage timer off-sync。
    const pending = new Set<string>();
    for (const key of AUDIO_KEYS_TO_PRELOAD) {
      if (!this.cache.audio.exists(key)) continue;
      const probe = this.sound.add(key, { volume: 0 });
      if (probe.duration > 0) {
        probe.destroy();
        continue;
      }
      probe.destroy();
      pending.add(key);
    }
    // include button-hover separately (key from helper)
    if (this.cache.audio.exists('button-hover')) {
      const probe = this.sound.add('button-hover', { volume: 0 });
      if (probe.duration <= 0) pending.add('button-hover');
      probe.destroy();
    }

    const proceed = () => {
      this.sound.off(Phaser.Sound.Events.DECODED, onDecoded);
      loadingText.destroy();
      this.scene.start('MenuScene');
    };

    if (pending.size === 0) {
      proceed();
      return;
    }

    const onDecoded = (decodedKey: string) => {
      pending.delete(decodedKey);
      if (pending.size === 0) proceed();
    };
    this.sound.on(Phaser.Sound.Events.DECODED, onDecoded);

    this.time.delayedCall(DECODE_TIMEOUT_MS, () => {
      if (pending.size > 0) {
        console.warn('[BootScene] decode 逾時，未完成:', [...pending]);
        proceed();
      }
    });
  }
}
