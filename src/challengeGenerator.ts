import type { Direction } from './config';
import type {
  LevelData,
  NormalSection,
  RotationSection,
  Section,
  Stage,
} from './levels';

// Cyclic-shift orbits used by GameScene's `mode: 'random'`. Picking any
// representative direction in an orbit is equivalent — the runtime will rotate
// the whole section by a random offset within the orbit. Only the *relative*
// distance between selected directions is preserved.
const CARDINALS: Direction[] = ['w', 'd', 'x', 'a'];
const DIAGONALS: Direction[] = ['q', 'e', 'c', 'z'];

// 8-azimuth clockwise order (w at top). Used to compute step-distance between
// any two directions, e.g. w-q = 1, w-d = 2, w-c = 3, w-x = 4.
const AZIMUTH_ORDER: Direction[] = ['w', 'e', 'd', 'c', 'x', 'z', 'a', 'q'];
function azimuthStep(a: Direction, b: Direction): number {
  const ia = AZIMUTH_ORDER.indexOf(a);
  const ib = AZIMUTH_ORDER.indexOf(b);
  const diff = Math.abs(ia - ib);
  return Math.min(diff, 8 - diff);
}

// ---------------------------------------------------------------------------
// Pattern generation (length 8, tokens A/B/C/D)
// ---------------------------------------------------------------------------

type Token = 'A' | 'B' | 'C' | 'D';
const TOKENS: Token[] = ['A', 'B', 'C', 'D'];

function allWords(numTokens: 2 | 3 | 4, length: number): string[] {
  const tokens = TOKENS.slice(0, numTokens);
  const out: string[] = [];
  const buf: string[] = [];
  function rec(depth: number) {
    if (depth === length) {
      out.push(buf.join(''));
      return;
    }
    for (const t of tokens) {
      buf.push(t);
      rec(depth + 1);
      buf.pop();
    }
  }
  rec(0);
  return out;
}

function hasNConsecutive(word: string, n: number): boolean {
  return TOKENS.some(t => word.includes(t.repeat(n)));
}

function tokenCount(word: string, t: Token): number {
  let c = 0;
  for (const ch of word) if (ch === t) c++;
  return c;
}

function maxTokenCount(word: string): number {
  return Math.max(...TOKENS.map(t => tokenCount(word, t)));
}

function usesAllTokens(word: string, numTokens: number): boolean {
  for (let i = 0; i < numTokens; i++) {
    if (!word.includes(TOKENS[i])) return false;
  }
  return true;
}

// Two-token buckets follow the user's Python rules verbatim:
//   - reject 5+ consecutive identical chars
//   - reject any token appearing 6+ times
//   - "easy" = first half == second half OR contains 4 consecutive identical
//   - "hard" = the rest
function buildTwoTokenBuckets(): { easy: string[]; hard: string[] } {
  const easy: string[] = [];
  const hard: string[] = [];
  for (const word of allWords(2, 8)) {
    if (hasNConsecutive(word, 5)) continue;
    if (tokenCount(word, 'A') >= 6 || tokenCount(word, 'B') >= 6) continue;
    if (!usesAllTokens(word, 2)) continue;

    const isEasy = word.slice(0, 4) === word.slice(4) || hasNConsecutive(word, 4);
    if (isEasy) easy.push(word);
    else hard.push(word);
  }
  return { easy, hard };
}

// Three-token: each token appears at least twice, no 4-run, max count <= 4.
function buildThreeTokenBucket(): string[] {
  const out: string[] = [];
  for (const word of allWords(3, 8)) {
    if (!usesAllTokens(word, 3)) continue;
    if (hasNConsecutive(word, 4)) continue;
    if (maxTokenCount(word) > 4) continue;
    if (TOKENS.slice(0, 3).some(t => tokenCount(word, t) < 2)) continue;
    out.push(word);
  }
  return out;
}

// Four-token: each token appears at least once, no 3-run, max count <= 3.
function buildFourTokenBucket(): string[] {
  const out: string[] = [];
  for (const word of allWords(4, 8)) {
    if (!usesAllTokens(word, 4)) continue;
    if (hasNConsecutive(word, 3)) continue;
    if (maxTokenCount(word) > 3) continue;
    out.push(word);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Token -> Direction assignment
// ---------------------------------------------------------------------------

type Family = 'cardinal' | 'diagonal' | 'mixed';

type TokenAssignment = Partial<Record<Token, Direction>>;

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickRandomDistinct<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function assignFromPool(
  numTokens: 2 | 3 | 4,
  pool: readonly Direction[],
  rng: () => number,
): TokenAssignment {
  const dirs = pickRandomDistinct(pool, numTokens, rng);
  const a: TokenAssignment = {};
  for (let i = 0; i < numTokens; i++) a[TOKENS[i]] = dirs[i];
  return a;
}

// Mixed: at least one cardinal AND one diagonal, all pairwise step-distances
// within [minStep, maxStep]. Falls back to free pick after retries.
function assignMixed(
  numTokens: 2 | 3 | 4,
  minStep: number,
  maxStep: number,
  rng: () => number,
): TokenAssignment {
  const all = [...CARDINALS, ...DIAGONALS];
  for (let attempt = 0; attempt < 200; attempt++) {
    const dirs = pickRandomDistinct(all, numTokens, rng);
    const hasCard = dirs.some(d => CARDINALS.includes(d));
    const hasDiag = dirs.some(d => DIAGONALS.includes(d));
    if (!hasCard || !hasDiag) continue;

    let ok = true;
    for (let i = 0; i < dirs.length && ok; i++) {
      for (let j = i + 1; j < dirs.length && ok; j++) {
        const s = azimuthStep(dirs[i], dirs[j]);
        if (s < minStep || s > maxStep) ok = false;
      }
    }
    if (!ok) continue;

    const a: TokenAssignment = {};
    for (let i = 0; i < numTokens; i++) a[TOKENS[i]] = dirs[i];
    return a;
  }
  return assignFromPool(numTokens, all, rng);
}

function patternToPrompts(pattern: string, assignment: TokenAssignment): Direction[] {
  return pattern.split('').map(c => {
    const dir = assignment[c as Token];
    if (!dir) throw new Error(`Unmapped token ${c}`);
    return dir;
  });
}

// ---------------------------------------------------------------------------
// Rotation generation
// ---------------------------------------------------------------------------

// Buckets ordered by number of L<->R direction changes.
//   easy  = 0 changes (steady spin)
//   mid   = 1-3 changes (regular flips)
//   hard  = 4+ changes (chaotic)
const ROTATION_BUCKETS: Record<'easy' | 'mid' | 'hard', readonly ('L' | 'R')[][]> = {
  easy: [
    ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'],
    ['L', 'L', 'L', 'L', 'L', 'L', 'L', 'L'],
  ],
  mid: [
    ['R', 'R', 'R', 'R', 'L', 'L', 'L', 'L'],
    ['L', 'L', 'L', 'L', 'R', 'R', 'R', 'R'],
    ['R', 'R', 'L', 'L', 'R', 'R', 'L', 'L'],
    ['L', 'L', 'R', 'R', 'L', 'L', 'R', 'R'],
    ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
    ['L', 'L', 'R', 'R', 'R', 'R', 'L', 'L'],
  ],
  hard: [
    ['R', 'L', 'L', 'R', 'R', 'R', 'L', 'R'],
    ['R', 'L', 'R', 'L', 'L', 'R', 'L', 'R'],
    ['L', 'R', 'L', 'R', 'R', 'L', 'R', 'L'],
    ['R', 'L', 'R', 'R', 'L', 'R', 'L', 'L'],
  ],
};

function generateRotationSection(
  difficulty: 'easy' | 'mid' | 'hard',
  rng: () => number,
): RotationSection {
  return {
    type: 'rotation',
    start: pickRandom(CARDINALS, rng),
    rotate: [...pickRandom(ROTATION_BUCKETS[difficulty], rng)],
  };
}

// ---------------------------------------------------------------------------
// Stage recipe and progression
// ---------------------------------------------------------------------------

export interface StageRecipe {
  family: Family;
  numTokens: 2 | 3 | 4;
  patternBucket: 'easy' | 'hard' | 'any';
  rotationDifficulty: 'easy' | 'mid' | 'hard';
  // Only meaningful when family === 'mixed'. Bounds the azimuth-step distance
  // between any two assigned directions: [1,1]=鄰跳, [2,2]=對面跳, [3,3]=斜對跳,
  // [4,4]=對角跳, [1,4]=自由.
  mixedStepRange?: [number, number];
}

export const DEFAULT_PROGRESSION: StageRecipe[] = [
  { family: 'cardinal', numTokens: 2, patternBucket: 'easy', rotationDifficulty: 'easy' },
  { family: 'diagonal', numTokens: 2, patternBucket: 'easy', rotationDifficulty: 'easy'  },
  { family: 'cardinal', numTokens: 2, patternBucket: 'hard', rotationDifficulty: 'easy' },
  { family: 'diagonal', numTokens: 2, patternBucket: 'hard', rotationDifficulty: 'easy'  },
  { family: 'mixed',    numTokens: 2, patternBucket: 'any',  rotationDifficulty: 'easy',  mixedStepRange: [1, 1] }, // 鄰跳
  { family: 'mixed',    numTokens: 3, patternBucket: 'any',  rotationDifficulty: 'mid',   mixedStepRange: [1, 2] },
  { family: 'cardinal', numTokens: 3, patternBucket: 'any',  rotationDifficulty: 'mid'  },
  { family: 'cardinal', numTokens: 4, patternBucket: 'any',  rotationDifficulty: 'mid'  },
  { family: 'diagonal', numTokens: 3, patternBucket: 'any',  rotationDifficulty: 'mid' },
  { family: 'diagonal', numTokens: 4, patternBucket: 'any',  rotationDifficulty: 'hard' },
  { family: 'mixed',    numTokens: 2, patternBucket: 'any',  rotationDifficulty: 'hard', mixedStepRange: [3, 3] }, // 斜對跳
  { family: 'mixed',    numTokens: 4, patternBucket: 'any',  rotationDifficulty: 'hard', mixedStepRange: [1, 4] }, // 自由
  { family: 'mixed',    numTokens: 4, patternBucket: 'any',  rotationDifficulty: 'hard', mixedStepRange: [1, 4] }, // 自由
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  bpm?: number;                 // base BPM, default 160
  sectionsPerStage?: number;    // default 6
  rotationChance?: number;      // per-section probability of rotation, default 1/8
  audioClip?: string;
  progression?: StageRecipe[];  // default DEFAULT_PROGRESSION
  loops?: number;               // number of times to repeat the progression, default 1
  bpmIncrementPerLoop?: number; // BPM bump applied per extra loop, default 20
  rng?: () => number;           // PRNG, default Math.random
}

export function generateChallengeLevelData(options: GenerateOptions = {}): LevelData {
  const {
    bpm = 180,
    sectionsPerStage = 3,
    rotationChance = 1 / 8,
    audioClip,
    progression = DEFAULT_PROGRESSION,
    loops = 5,
    bpmIncrementPerLoop = 20,
    rng = Math.random,
  } = options;

  const twoBuckets = buildTwoTokenBuckets();
  const threeBucket = buildThreeTokenBucket();
  const fourBucket = buildFourTokenBucket();

  function pickPattern(numTokens: 2 | 3 | 4, bucket: 'easy' | 'hard' | 'any'): string {
    if (numTokens === 2) {
      const arr = bucket === 'easy' ? twoBuckets.easy
                : bucket === 'hard' ? twoBuckets.hard
                : [...twoBuckets.easy, ...twoBuckets.hard];
      return pickRandom(arr, rng);
    }
    if (numTokens === 3) return pickRandom(threeBucket, rng);
    return pickRandom(fourBucket, rng);
  }

  function makeAssignment(recipe: StageRecipe): TokenAssignment {
    if (recipe.family === 'cardinal') return assignFromPool(recipe.numTokens, CARDINALS, rng);
    if (recipe.family === 'diagonal') return assignFromPool(recipe.numTokens, DIAGONALS, rng);
    const [lo, hi] = recipe.mixedStepRange ?? [1, 4];
    return assignMixed(recipe.numTokens, lo, hi, rng);
  }

  function generateNormalSection(recipe: StageRecipe): NormalSection {
    const pattern = pickPattern(recipe.numTokens, recipe.patternBucket);
    const assignment = makeAssignment(recipe);
    return {
      type: 'normal',
      prompts: patternToPrompts(pattern, assignment),
    };
  }

  function generateStage(recipe: StageRecipe, stageIndex: number, currentBpm: number): Stage {
    const sections: Section[] = [];
    for (let i = 0; i < sectionsPerStage; i++) {
      sections.push(rng() < rotationChance
        ? generateRotationSection(recipe.rotationDifficulty, rng)
        : generateNormalSection(recipe));
    }
    return {
      stage_text: `Stage ${stageIndex + 1}`,
      bpm: currentBpm,
      mode: 'random',
      audio_clip: audioClip,
      sections,
    };
  }

  const stages: Stage[] = [];
  for (let loop = 0; loop < loops; loop++) {
    const loopBpm = bpm + loop * bpmIncrementPerLoop;
    for (const recipe of progression) {
      stages.push(generateStage(recipe, stages.length, loopBpm));
    }
  }

  return { stages };
}
