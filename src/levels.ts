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
        // {
        //   type: 'rotation',
        //   start: 'U',
        //   rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        // },
        // {
        //   type: 'rotation',
        //   start: 'U',
        //   rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        // },
        // {
        //   type: 'rotation',
        //   start: 'U',
        //   rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        // },
        {
          type: 'normal',
          prompts: ['w', 'd', 'd', 'a', 'x', 'a', 'd', 'w'],
        },
        {
          type: 'normal',
          prompts: ['w', 'x', 'a', 'd', 'x', 'x', 'x', 'x'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'],
        },
        {
          type: 'rotation',
          start: 'w',
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
      bpm: 183,
      audio_clip: 'src/assets/audio/120.wav',
      sections: [
        {
          type: 'normal',
          prompts: ['q', 'e', 'z', 'c', 'q', 'e', 'z', 'c'],
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
          start: 'w',
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
          prompts: ['x', 'w', 'x', 'w','x', 'w','x', 'w'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w','x', 'w','x', 'w'],
        },
        {
          type: 'normal',
          prompts: ['w', 'w', 'w', 'x', 'w', 'w', 'w', 'x'],
        },
        {
          type: 'normal',
          prompts: ['x', 'd', 'w', 'a', 'x', 'd', 'w', 'a', ],
        },
        {
          type: 'normal',
          prompts: ['w', 'x', 'w', 'x', 'e', 'c', 'q', 'z'],
        },
        {
          type: 'rotation',
          start: 'w',
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
          prompts: ['x', 'w', 'x', 'w','w', 'w','w', 'w'],
        },
        {
          type: 'normal',
          prompts: ['e', 'd', 'e', 'd','a', 'q','a', 'q'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'a', 'w', 'a', 'e', 'a', 'x'],
        },
        {
          type: 'normal',
          prompts: ['x', 'd', 'w', 'a', 'x', 'd', 'w', 'a', ],
        },
        {
          type: 'normal',
          prompts: ['w', 'x', 'w', 'x', 'e', 'c', 'q', 'z'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L', 'L', 'L', 'R', 'R'],
        }
      ],
    }

  ],
};
