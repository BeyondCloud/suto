import cmonbruhImageUrl from './assets/cmonbruh.png';
import stage120AudioUrl from './assets/audio/120.wav';
import challengeLoopAudioUrl from './assets/audio/loop/challenge.wav';
import type { Direction } from './config';

export interface NormalSection {
  type: 'normal';
  bpm?: number;
  repeat?: number;
  prompts: Direction[];
  image?: string;
  effect?: 'small' | 'fadein' | 'button';
}

export interface RotationSection {
  type: 'rotation';
  bpm?: number;
  repeat?: number;
  start: Direction;
  rotate: ('L' | 'R')[];
}

export interface DelaySection {
  type: 'delay';
  ms: number;
  text?: string;
  color?: string;
}

export type Section = NormalSection | RotationSection | DelaySection;

export type StageMode = 'normal' | 'random';

export interface Stage {
  stage_number: number;
  bpm: number;
  mode?: StageMode;
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
      bpm: 160,
      // audio_clip必須為16拍整的循環音樂
      audio_clip: challengeLoopAudioUrl,
      sections: [
        {
          type: 'normal',
          prompts: ['w', 'w', 'w', 'w',
                    'x', 'x', 'x', 'x'],
        },
        {
          type: 'normal',
          prompts: ['w', 'w', 'x', 'x',
                    'w', 'w', 'x', 'x'],
        },

        {
          type: 'normal',
          prompts: ['w', 'w', 'w', 'x',
                    'x', 'x', 'x', 'w'],
        },
        //=============================
        {
          type: 'normal',
          prompts: ['w', 'q', 'w', 'q',
                    'q', 'q', 'q', 'q'],
        },
        {
          type: 'normal',
          prompts: ['x', 'd', 'w', 'a',
                    'x', 'd', 'w', 'a', ],
        },
        {
          type: 'normal',
          prompts: ['w', 'w', 'w', 'w',
                    'w', 'w', 'w', 'w'],
        }
      ],
    },
    {
      stage_number: 2,
      bpm: 183,
      audio_clip: stage120AudioUrl,
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
      audio_clip: stage120AudioUrl,
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
      bpm: 183.5,
      sections: [
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'x', 'w', 'x', 'w'],
        },
        {
          type: 'normal',
          prompts: ['x', 'w', 'x', 'w',
                    'w', 'x', 'w', 'x'],
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
          ms: 2615, // 60000 / 183.5 * 8 = 2615.80
          text: 'Level - 2',
        },
      ],
    },
   {
      stage_number: 2,
      bpm: 183.5,
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
          effect: 'fadein',
          prompts: ['x', 'w', 'x', 'w',
                    'c', 'e', 'q', 'z'],
        },
        {
          type: 'normal',
          effect: 'small',
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
          ms: 2320,
          text: 'Level - 3',
        },
      ],
    },
   {
      stage_number: 3,
      bpm: 183,
      sections: [
        {
          bpm: 215.5,
          type: 'normal',
          prompts: ['x', 'a', 'w', 'w',
                    'x', 'd', 'x', 'x'],
        },
        {
          bpm: 243.5,
          type: 'normal',
          prompts: ['x', 'c', 'w', 'c',
                    'a', 'q', 'x', 'e'],
        },
        {
          bpm: 257,
          type: 'normal',
          prompts: ['c', 'x', 'a', 'c',
                    'w', 'q', 'c', 'e'],
        },
        {
          bpm: 275,
          type: 'normal',
          prompts: ['x', 'w', 'c', 'w',
                    'q', 'c', 'z', 'x'],
        },
        {
          bpm: 291,
          type: 'normal',
          prompts: ['x', 'd', 'c', 'x',
                    'w', 'x', 'a', 'x'],
        },
        {
            type: 'delay',
            ms: 4112,
            text: 'WARNING',
          color: '#ff3b30',
        },
        {
            type: 'delay',
            ms: 2515,
            text: '',
        },
        {
          bpm: 183.5,
          type: 'normal',
          effect: 'button',
          image: cmonbruhImageUrl,
          prompts: ['x', 'x', 'x', 'x',
                    'x', 'x', 'x', 'x'],
        }

      ],
    },
  ],
};
