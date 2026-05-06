import type { Direction } from './config';

export interface NormalSection {
  type: 'normal';
  bpm?: number;
  prompts: Direction[];
}

export interface RotationSection {
  type: 'rotation';
  bpm?: number;
  start: Direction;
  rotate: ('L' | 'R')[];
}

export interface DelaySection {
  type: 'delay';
  ms: number;
  text?: string;
}

export type Section = NormalSection | RotationSection | DelaySection;

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
      bpm: 182,
    //   audio_clip: 'src/assets/audio/120.wav',
      audio_clip: 'src/assets/audio/loop/tutorial.wav',
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
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L',
                   'R', 'R', 'L', 'L'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L',
                   'R', 'R', 'L', 'L'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L',
                   'R', 'R', 'L', 'L'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L',
                   'R', 'R', 'L', 'L'],
        },
        {
          type: 'normal',
          prompts: ['w', 'd', 'd', 'a', 'x', 'a', 'd', 'w'],
        },
        {
          type: 'delay',
          ms: 1000,
          text: '準備下一段',
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
      bpm: 182,
      sections: [
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'x', 'w', 'x', 'w'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'x', 'w', 'x', 'w'],
        },
        {
          type: 'normal',
          prompts: ['w', 'w', 'w', 'x',
                    'w', 'w', 'w', 'x'],
        },
        {
          type: 'normal',
          prompts: ['x', 'd', 'w', 'a',
                    'x', 'd', 'w', 'a', ],
        },
        {
          type: 'normal',
          prompts: ['w', 'x', 'w', 'x',
                    'e', 'c', 'q', 'z'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L',
                   'L', 'L', 'R', 'R'],
        },
        {
          type: 'delay',
          ms: 2637, // 60000 / 182 * 8 = 2637.36
          text: 'Level - 2',
        },
      ],
    },
   {
      stage_number: 2,
      bpm: 182,
      sections: [

        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'w', 'w', 'w', 'w'],
        },
        {
          type: 'normal',
          prompts: ['c', 'd', 'c', 'd',
                    'a', 'z','a', 'z'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'c', 'e', 'q', 'z'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'x', 'a', 'd', 'x'],
        },
        {
          type: 'rotation',
          start: 'w',
          rotate: ['R', 'R', 'L', 'L',
                   'R', 'R', 'L', 'L'],
        },
        {
          type: 'normal',
          prompts: ['e', 'a', 'c', 'z',
                    'q', 'd', 'w', 'e'],
        },
        {
          type: 'delay',
          ms: 2637,
          text: 'Level - 3',
        },
      ],
    },
   {
      stage_number: 3,
      bpm: 183,
      sections: [
        {
          type: 'normal',
          prompts: ['x', 'a', 'w', 'w',
                    'x', 'd', 'x', 'x'],
        },
        {
          type: 'normal',
          prompts: ['x', 'c', 'w', 'c',
                    'a', 'q', 'x', 'e'],
        },
        {
          type: 'normal',
          prompts: ['c', 'x', 'a', 'c',
                    'w', 'q', 'c', 'e'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'c', 'w',
                    'q', 'c', 'z', 'x'],
        },
        {
          type: 'normal',
          prompts: ['x', 'd', 'c', 'x',
                    'w', 'x', 'a', 'x'],
        },
        {
          type: 'normal',
          prompts: ['x', 'x', 'x', 'x',
                    'x', 'x', 'x', 'x'],
        }
      ],
    }

  ],
};
