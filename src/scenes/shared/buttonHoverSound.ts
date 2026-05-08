import Phaser from 'phaser';
import hoverAudioUrl from '../../assets/audio/short/hover.mp3';

export const BUTTON_HOVER_SOUND_KEY = 'button-hover';

type HoverSoundTarget = Phaser.GameObjects.GameObject & {
  input?: {
    cursor?: string;
    enabled?: boolean;
  };
};

export function preloadButtonHoverSound(scene: Phaser.Scene) {
  if (scene.cache.audio.exists(BUTTON_HOVER_SOUND_KEY)) return;
  scene.load.audio(BUTTON_HOVER_SOUND_KEY, hoverAudioUrl);
}

export function playButtonHoverSound(scene: Phaser.Scene) {
  if (!scene.cache.audio.exists(BUTTON_HOVER_SOUND_KEY)) return;
  try {
    scene.sound.play(BUTTON_HOVER_SOUND_KEY);
  } catch {
    // Browsers can reject audio before the first user gesture; later hovers still work.
  }
}

export function installButtonHoverSound(scene: Phaser.Scene) {
  const onGameObjectOver = (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
    const target = gameObject as HoverSoundTarget;
    if (!target.input?.enabled || target.input.cursor !== 'pointer') return;
    playButtonHoverSound(scene);
  };

  scene.input.on('gameobjectover', onGameObjectOver);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off('gameobjectover', onGameObjectOver);
  });
}

export function wireDomButtonHoverSound(scene: Phaser.Scene, button: HTMLButtonElement) {
  button.addEventListener('mouseenter', () => playButtonHoverSound(scene));
}
