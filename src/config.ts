export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export interface GameSettings {
  masterVolume: number;
  bpm: number;
  shrinkLeadMs: number;
  perfectJudgeWindowMs: number;
  nodeConfirmToggle: boolean;
  hitboxWidth: number;
  hitboxHeight: number;
  checkDepth: number;
  cornerLineDepth: number;
  storyStartDelayMs: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.6,
  bpm: 183,
  shrinkLeadMs: 500,
  perfectJudgeWindowMs: 100,
  nodeConfirmToggle: false,
  hitboxWidth: 500,
  hitboxHeight: 300,
  checkDepth: 50,
  cornerLineDepth: 270,
  storyStartDelayMs: 0, // 開場 Delay (ms)
};

export const D_RANK_ACC = 75;
export const C_RANK_ACC = 80;
export const B_RANK_ACC = 85;
export const A_RANK_ACC = 90;
export const S_RANK_ACC = 95;
export const S_PLUS_RANK_ACC = 99;
export const S_DOUBLE_PLUS_RANK_ACC = 100;

// Directions
export type Direction = 'w' | 'x' | 'a' | 'd' | 'q' | 'e' | 'z' | 'c';

// Angle in degrees for each direction (rotation from down.png which points down = 0°)
export const DIR_ANGLE: Record<Direction, number> = {
  x: 0,
  z: 45,
  a: 90,
  q: 135,
  w: 180,
  e: 225,
  d: 270,
  c: 315,
};

// Cardinal directions in clockwise order
export const CLOCKWISE_ORDER: Direction[] = ['w', 'e', 'd', 'c', 'x', 'z', 'a', 'q'];

// For rotation section: given a cardinal start and rotation direction, get intermediate diagonal and next cardinal
export function getRotationPoints(current: Direction, rotDir: 'L' | 'R'): [Direction, Direction] {
  const idx = CLOCKWISE_ORDER.indexOf(current);
  if (rotDir === 'R') {
    // clockwise: cardinal -> next diagonal -> next cardinal
    const diag = CLOCKWISE_ORDER[(idx + 1) % 8] as Direction;
    const next = CLOCKWISE_ORDER[(idx + 2) % 8] as Direction;
    return [diag, next];
  } else {
    // counter-clockwise
    const diag = CLOCKWISE_ORDER[(idx + 7) % 8] as Direction;
    const next = CLOCKWISE_ORDER[(idx + 6) % 8] as Direction;
    return [diag, next];
  }
}

// Ellipse parameters
export const ELLIPSE_CX = GAME_WIDTH / 2;
export const ELLIPSE_CY = GAME_HEIGHT / 2;
export const ELLIPSE_RX = (GAME_WIDTH - 200) / 2; // Leave some margin on sides
export const ELLIPSE_RY = (GAME_HEIGHT - 100) / 2; // Leave some margin on top/bottom

// Get screen position of a direction's checkpoint on the ellipse edge
export function getCheckpointPos(dir: Direction): { x: number; y: number } {
  // Angle: U=top=-90°, R=right=0°, D=bottom=90°, L=left=180°
  const angles: Record<Direction, number> = {
    w: -90, e: -45, d: 0, c: 45,
    x: 90, z: 135, a: 180, q: -135,
  };
  const rad = (angles[dir] * Math.PI) / 180;
  return {
    x: ELLIPSE_CX + ELLIPSE_RX * Math.cos(rad),
    y: ELLIPSE_CY + ELLIPSE_RY * Math.sin(rad),
  };
}
