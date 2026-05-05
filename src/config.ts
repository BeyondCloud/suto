export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export interface GameSettings {
  bpm: number;
  shrinkLeadMs: number;
  hitboxWidth: number;
  hitboxHeight: number;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  bpm: 183,
  shrinkLeadMs: 1000,
  hitboxWidth: 400,
  hitboxHeight: 240,
  debugMode: false,
};

// Directions
export type Direction = 'U' | 'D' | 'L' | 'R' | 'UL' | 'UR' | 'DL' | 'DR';

// Angle in degrees for each direction (rotation from down.png which points down = 0°)
export const DIR_ANGLE: Record<Direction, number> = {
  D: 0,
  DL: 45,
  L: 90,
  UL: 135,
  U: 180,
  UR: 225,
  R: 270,
  DR: 315,
};

// Cardinal directions in clockwise order
export const CLOCKWISE_ORDER: Direction[] = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL'];

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
    U: -90, UR: -45, R: 0, DR: 45,
    D: 90, DL: 135, L: 180, UL: -135,
  };
  const rad = (angles[dir] * Math.PI) / 180;
  return {
    x: ELLIPSE_CX + ELLIPSE_RX * Math.cos(rad),
    y: ELLIPSE_CY + ELLIPSE_RY * Math.sin(rad),
  };
}
