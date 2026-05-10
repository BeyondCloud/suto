import {
  A_RANK_ACC,
  B_RANK_ACC,
  C_RANK_ACC,
  D_RANK_ACC,
  S_DOUBLE_PLUS_RANK_ACC,
  S_PLUS_RANK_ACC,
  S_RANK_ACC,
} from '../../config';

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

export interface DebugEndingPreset {
  rank: string;
  perfect: number;
  miss: number;
  falseTouch: number;
  life: number;
}

interface EndingRankDefinition extends EndingRankMarker {
  verdict: string;
  debugPreset: Omit<DebugEndingPreset, 'rank'>;
}

const ENDING_RANK_DEFINITIONS: EndingRankDefinition[] = [
  {
    label: 'D',
    min: 0,
    color: '#355CFF',
    verdict: '太慢摟',
    debugPreset: { perfect: D_RANK_ACC, miss: 100 - D_RANK_ACC, falseTouch: 8, life: 36 },
  },
  {
    label: 'C',
    min: C_RANK_ACC,
    color: '#17B7FF',
    verdict: '很快了, 再快一點',
    debugPreset: { perfect: C_RANK_ACC, miss: 100 - C_RANK_ACC, falseTouch: 6, life: 58 },
  },
  {
    label: 'B',
    min: B_RANK_ACC,
    color: '#FF9F43',
    verdict: '還能再更快嗎?',
    debugPreset: { perfect: B_RANK_ACC, miss: 100 - B_RANK_ACC, falseTouch: 5, life: 72 },
  },
  {
    label: 'A',
    min: A_RANK_ACC,
    color: '#FFC857',
    verdict: '恭喜通關...欸欸欸不行...太快了太快了',
    debugPreset: { perfect: A_RANK_ACC, miss: 100 - A_RANK_ACC, falseTouch: 4, life: 84 },
  },
  {
    label: 'S',
    min: S_RANK_ACC,
    color: '#FFE66D',
    verdict: ' 0..0 你比超負荷還快 !',
    debugPreset: { perfect: S_RANK_ACC, miss: 100 - S_RANK_ACC, falseTouch: 2, life: 92 },
  },
  {
    label: 'S+',
    min: S_PLUS_RANK_ACC,
    color: '#8CE99A',
    verdict: '你是控頭的神！<br>提示: 沒誤觸"X"判定才有S++喔',
    debugPreset: { perfect: S_DOUBLE_PLUS_RANK_ACC, miss: 0, falseTouch: 3, life: 96 },
  },
  {
    label: 'S++',
    min: S_DOUBLE_PLUS_RANK_ACC,
    color: '#52D681',
    verdict: '不是, 誰會沒事把這遊戲練到S++拉= =',
    debugPreset: { perfect: S_DOUBLE_PLUS_RANK_ACC, miss: 0, falseTouch: 0, life: 100 },
  },
];

export const ENDING_RANKS: EndingRankMarker[] = [
  ...ENDING_RANK_DEFINITIONS.map(({ label, min, color }) => ({ label, min, color })),
];

export const DEBUG_ENDING_PRESETS: DebugEndingPreset[] = [...ENDING_RANK_DEFINITIONS]
  .reverse()
  .map(({ label, debugPreset }) => ({ rank: label, ...debugPreset }));

const ENDING_VERDICTS = ENDING_RANK_DEFINITIONS.reduce<Record<string, string>>((acc, { label, verdict }) => {
  acc[label] = verdict;
  return acc;
}, {});

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
  const accuracyPercent = falseTouch > 0 ? Math.min(S_PLUS_RANK_ACC, rawAccuracyPercent) : rawAccuracyPercent;
  const matchedRank = [...ENDING_RANK_DEFINITIONS]
    .reverse()
    .find(({ label, min }) => accuracyPercent >= min && !(label === 'S++' && falseTouch > 0));
  if (matchedRank) return matchedRank.label;
  return 'D';
};

export const buildEndingSummary = (summary: EndingSummaryInput): EndingSummaryResult => {
  const total = summary.perfectCount + summary.missCount;
  const accuracy = total > 0 ? summary.perfectCount / total : 1;
  const rawAccuracyPercent = Math.round(accuracy * 100);
  const accuracyPercent = summary.falseTouchCount > 0 ? Math.min(S_PLUS_RANK_ACC, rawAccuracyPercent) : rawAccuracyPercent;
  const rank = computeEndingRank(summary.perfectCount, summary.missCount, summary.falseTouchCount);
  return { accuracyPercent, rank, verdict: ENDING_VERDICTS[rank] ?? '' };
};
