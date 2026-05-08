import Phaser from 'phaser';

interface ThreeTwoOneCountdownOptions {
  intervalMs: number;
  onComplete: () => void;
}

export const runThreeTwoOneCountdown = (
  scene: Phaser.Scene,
  countdownText: Phaser.GameObjects.Text,
  options: ThreeTwoOneCountdownOptions,
) => {
  let count = 3;

  const tick = () => {
    if (count > 0) {
      countdownText.setText(String(count));
      countdownText.setVisible(true);
      count--;
      scene.time.delayedCall(options.intervalMs, tick);
      return;
    }

    countdownText.setVisible(false);
    options.onComplete();
  };

  tick();
};