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
  audio_clip?: string;
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
      audio_clip: 'src/assets/audio/120.wav',
      sections: [
        // {
        //   type: 'normal',
        //   prompts: ['UL', 'UR', 'DL', 'DR', 'UL', 'UR', 'DL', 'DR'],
        // },
        {
          type: 'normal',
          prompts: ['U', 'R', 'R', 'L', 'D', 'L', 'R', 'U'],
        },
        {
          type: 'normal',
          prompts: ['U', 'D', 'L', 'R', 'D', 'D', 'D', 'D'],
        },
        {
          type: 'rotation',
          start: 'U',
          rotate: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'],
        },
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

      ],
    },
    {
      stage_number: 2,
      bpm: 120,
      audio_clip: 'src/assets/audio/120.wav',
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
      audio_clip: 'src/assets/audio/120.wav',
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

// Copy for mainline mode. You can edit this without affecting challenge mode data.
export const MAIN_LEVEL_DATA: LevelData = {
  stages: [
    {
      stage_number: 1,
      bpm: 183,
      sections: [
        {
          type: 'normal',
          prompts: ['D', 'U', 'D', 'U','D', 'U','D', 'U'],
        },
        {
          type: 'normal',
          prompts: ['D', 'U', 'D', 'U','D', 'U','D', 'U'],
        },
        {
          type: 'normal',
          prompts: ['U', 'U', 'U', 'D', 'U', 'U', 'U', 'D'],
        },
        {
          type: 'normal',
          prompts: ['D', 'R', 'U', 'L', 'D', 'R', 'U', 'L', ],
        },
        {
          type: 'normal',
          prompts: ['U', 'D', 'U', 'D', 'UR', 'DR', 'UL', 'DL'],
        },
        {
          type: 'rotation',
          start: 'U',
          rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        }
      ],
    },
    {
      stage_number: 2,
      bpm: 183,
      sections: [
        {
          type: 'normal',
          prompts: ['UL', 'UR', 'DL', 'DR', 'UL', 'UR', 'DL', 'DR'],
        },
      ],
    },
    {
      stage_number: 3,
      bpm: 183,
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
