export interface EndingSummaryInput {
  perfectCount: number;
  missCount: number;
  falseTouchCount: number;
  lifeValue: number;
}

export interface EndingSummaryResult {
  accuracyPercent: number;
  rank: string;
  verdict: string;
}

export interface EndingRankMarker {
  label: string;
  min: number;
  color: string;
}

export const ENDING_RANKS: EndingRankMarker[] = [
  { label: 'D', min: 0, color: '#355CFF' },
  { label: 'C', min: 70, color: '#17B7FF' },
  { label: 'B', min: 80, color: '#FF9F43' },
  { label: 'A', min: 90, color: '#FFC857' },
  { label: 'S', min: 95, color: '#FFE66D' },
  { label: 'S+', min: 99, color: '#8CE99A' },
  { label: 'S++', min: 100, color: '#52D681' },
];

const ENDING_VERDICTS: Record<string, string> = {
  'S++': '不是, 誰會沒事把這遊戲練到S++拉= =',
  'S+': '完美！你是控頭的神！<br>但不好意思喔, 沒誤觸"X"判定才有S++喔',
  'S': ' 0..0 你比超負荷還快 !',
  'A': '恭喜通關...欸欸欸不行...太快了太快了',
  'B': '還能再更快嗎?',
  'C': '很快了, 再快一點',
  'D': '太慢摟',
};

export const clampScore = (score: number): number => Math.min(100, Math.max(0, score));

export const getEndingScoreDisplayPercent = (score: number): number => {
  const t = clampScore(score) / 100;
  // Expand the dense high-score range near 100 for readable marker spacing.
  const curved = 1 - Math.log10(1 + 9 * (1 - t));
  return clampScore(curved * 100);
};

export const computeEndingRank = (perfect: number, miss: number, falseTouch: number): string => {
  const total = perfect + miss;
  const accuracy = total > 0 ? perfect / total : 1;
  const rawAccuracyPercent = Math.round(accuracy * 100);
  const accuracyPercent = falseTouch > 0 ? Math.min(99, rawAccuracyPercent) : rawAccuracyPercent;
  if (miss === 0) return falseTouch === 0 ? 'S++' : 'S+';
  if (accuracyPercent >= 95) return 'S';
  if (accuracyPercent >= 90) return 'A';
  if (accuracyPercent >= 80) return 'B';
  if (accuracyPercent >= 70) return 'C';
  return 'D';
};

export const buildEndingSummary = (summary: EndingSummaryInput): EndingSummaryResult => {
  const total = summary.perfectCount + summary.missCount;
  const accuracy = total > 0 ? summary.perfectCount / total : 1;
  const rawAccuracyPercent = Math.round(accuracy * 100);
  const accuracyPercent = summary.falseTouchCount > 0 ? Math.min(99, rawAccuracyPercent) : rawAccuracyPercent;
  const rank = computeEndingRank(summary.perfectCount, summary.missCount, summary.falseTouchCount);
  return { accuracyPercent, rank, verdict: ENDING_VERDICTS[rank] ?? '' };
};
