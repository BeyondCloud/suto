const CHALLENGE_BEST_STAGE_STORAGE_KEY = 'suto.challenge.bestStage';

const parseStoredStage = (raw: string | null): number => {
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const getChallengeBestStage = (): number => {
  try {
    return parseStoredStage(window.localStorage.getItem(CHALLENGE_BEST_STAGE_STORAGE_KEY));
  } catch {
    return 0;
  }
};

export const recordChallengeBestStage = (stage: number): number => {
  const reachedStage = Math.max(0, Math.trunc(stage));
  if (reachedStage <= 0) return getChallengeBestStage();

  const bestStage = Math.max(getChallengeBestStage(), reachedStage);
  try {
    window.localStorage.setItem(CHALLENGE_BEST_STAGE_STORAGE_KEY, String(bestStage));
  } catch {
    // Ignore storage write failures; gameplay should continue normally.
  }
  return bestStage;
};
