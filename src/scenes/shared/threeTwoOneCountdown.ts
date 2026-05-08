import Phaser from 'phaser';

interface ThreeTwoOneCountdownOptions {
  intervalMs: number;
  onComplete: () => void;
}

export interface ThreeTwoOneCountdownController {
  setPaused: (paused: boolean) => void;
  cancel: () => void;
}

export const runThreeTwoOneCountdown = (
  scene: Phaser.Scene,
  countdownText: Phaser.GameObjects.Text,
  options: ThreeTwoOneCountdownOptions,
): ThreeTwoOneCountdownController => {
  let count = 3;
  let cancelled = false;
  let paused = false;
  let timer: Phaser.Time.TimerEvent | undefined;

  const scheduleNextTick = () => {
    timer = scene.time.delayedCall(options.intervalMs, tick);
    timer.paused = paused;
  };

  const tick = () => {
    if (cancelled) return;

    if (count > 0) {
      countdownText.setText(String(count));
      countdownText.setVisible(true);
      count--;
      scheduleNextTick();
      return;
    }

    timer = undefined;
    countdownText.setVisible(false);
    options.onComplete();
  };

  tick();

  return {
    setPaused(nextPaused: boolean) {
      paused = nextPaused;
      if (timer) timer.paused = nextPaused;
    },
    cancel() {
      cancelled = true;
      timer?.remove(false);
      timer = undefined;
      countdownText.setVisible(false);
    },
  };
};