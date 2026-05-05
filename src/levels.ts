import type { Direction } from './config';

export interface NormalSection {
  type: 'normal';
  prompts: Direction[];
}

export interface RotationSection {
  type: 'rotation';
  start: Direction;
  rotate: ('L' | 'R')[];
}

export type Section = NormalSection | RotationSection;

export interface Stage {
  stage_number: number;
  bpm: number;
  sections: Section[];
}

export interface LevelData {
  stages: Stage[];
}

export const LEVEL_DATA: LevelData = {
  stages: [
    {
      stage_number: 1,
      bpm: 120,
      sections: [
        // {
        //   type: 'normal',
        //   prompts: ['U', 'U', 'U', 'U', 'D', 'D', 'D', 'D'],
        // },
        {
          type: 'rotation',
          start: 'U',
          rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        },
        // {
        //   type: 'normal',
        //   prompts: ['U', 'D', 'L', 'R', 'U', 'D', 'L', 'R'],
        // },
        // {
        //   type: 'normal',
        //   prompts: ['L', 'R', 'U', 'R', 'L', 'D', 'U', 'L'],
        // },
        {
          type: 'normal',
          prompts: ['U', 'R', 'R', 'L', 'D', 'L', 'R', 'U'],
        }
      ],
    },
    {
      stage_number: 2,
      bpm: 120,
      sections: [
        {
          type: 'normal',
          prompts: ['UL', 'UR', 'DL', 'DR', 'UL', 'UR', 'DL', 'DR'],
        },
      ],
    },
    {
      stage_number: 3,
      bpm: 120,
      sections: [
        {
          type: 'rotation',
          start: 'U',
          rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        },
      ],
    },
  ],
};
