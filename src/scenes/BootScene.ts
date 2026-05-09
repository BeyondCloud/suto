import Phaser from 'phaser';
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

// 主線會用到的大檔影片：在 BootScene splash 階段先 fetch 完進 HTTP cache，
// 不然第一次進主線時 sam.mp4 還沒 buffer 完，DOM video 的 'playing' 事件
// 在 Firefox 會比實際音訊輸出早 fire 導致 beat timer 起算太早。
import samVideoUrl from '../assets/mp4/sam.mp4';
import openingVideoUrl from '../assets/mp4/開頭影片.mp4';
import tutorial2VideoUrl from '../assets/tutorial-2.mp4';

import suto400ImageUrl from '../assets/suto400.png';
import openingBgImageUrl from '../assets/opening.png';
import judgementRules1ImageUrl from '../assets/判定規則.png';
import judgementRules2ImageUrl from '../assets/判定規則2.png';
import tutorialImageUrl from '../assets/tutorial.png';
import downImageUrl from '../assets/down.png';
import downLeftImageUrl from '../assets/down_left.png';
import gameoverBgUrl from '../assets/gameover.png';
import loadingImageUrl from '../assets/loading.png';

const CHALLENGE_TUTORIAL_AUDIO_KEY = 'challenge_tutorial_intro';

const UNLOCK_TIMEOUT_MS = 2000;

const STORY_VIDEO_URLS: readonly string[] = [
  samVideoUrl,
  openingVideoUrl,
  tutorial2VideoUrl,
];

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
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.background = '#000000';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";
    overlay.style.fontSize = '32px';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.textAlign = 'center';
    overlay.style.cursor = 'pointer';
    overlay.style.userSelect = 'none';
    overlay.style.touchAction = 'none';
    overlay.textContent = '點擊任意處開始';
    document.body.appendChild(overlay);

    let proceeded = false;
    const proceed = () => {
      if (proceeded) return;
      proceeded = true;

      overlay.style.cursor = 'default';
      overlay.textContent = '載入素材中... 0%';

      const cleanup = () => {
        overlay.removeEventListener('pointerdown', onPointer);
        window.removeEventListener('keydown', onKey);
        overlay.remove();
      };

      const startMenu = () => {
        cleanup();
        this.scene.start('MenuScene');
      };

      const waitForUnlock = () => {
        if (!this.sound.locked) {
          startMenu();
          return;
        }
        let resolved = false;
        const onUnlocked = () => {
          if (resolved) return;
          resolved = true;
          startMenu();
        };
        this.sound.once(Phaser.Sound.Events.UNLOCKED, onUnlocked);
        this.time.delayedCall(UNLOCK_TIMEOUT_MS, () => {
          if (resolved) return;
          resolved = true;
          this.sound.off(Phaser.Sound.Events.UNLOCKED, onUnlocked);
          console.warn('[BootScene] AudioContext unlock 逾時，仍進入主畫面');
          startMenu();
        });
      };

      // 用顯式 fetch 把 body 全部讀完，瀏覽器一定會把回應放進 HTTP cache，
      // 之後 GameScene 的 <video src=...> 直接讀 cache，DOM video 的 'playing'
      // 事件就不會比音訊輸出提早 fire（即 GameScene 的 sync gate 才能正確生效）。
      let completed = 0;
      const total = STORY_VIDEO_URLS.length;
      const updateProgress = () => {
        const pct = total === 0 ? 100 : Math.round((completed / total) * 100);
        overlay.textContent = `載入素材中... ${pct}%`;
      };

      Promise.allSettled(
        STORY_VIDEO_URLS.map(async url => {
          try {
            const resp = await fetch(url);
            await resp.arrayBuffer();
          } catch (e) {
            console.warn('[BootScene] 預載失敗:', url, e);
          } finally {
            completed += 1;
            updateProgress();
          }
        }),
      ).then(() => {
        overlay.textContent = '進入主畫面...';
        waitForUnlock();
      });
    };

    const onPointer = () => proceed();
    const onKey = () => proceed();
    overlay.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
  }
}
