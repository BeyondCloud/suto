/**
 * Centralized stacking-order management.
 *
 * Two distinct stacking systems coexist:
 *
 *  - HTML_LAYER: CSS z-index, applied to HTML elements (cursor, video, masks).
 *    These layer relative to the Phaser canvas as a single block in the
 *    document's root stacking context.
 *
 *  - SCENE_LAYER: Phaser GameObject `setDepth(...)`, painted INSIDE the canvas.
 *    Only meaningful relative to other Phaser objects in the same scene; the
 *    whole canvas is a single CSS layer from the document's perspective.
 *
 * Final composite, bottom -> top:
 *
 *   <html background>                      (#fff, set in index.html)
 *   HTML_LAYER.GAME_AREA_BG                (-2) black backdrop over canvas area
 *   HTML_LAYER.STORY_SAM_VIDEO             (-1) picture-in-picture story video
 *   <body + Phaser canvas (transparent)>   <- SCENE_LAYER depths paint here
 *   HTML_LAYER.CURSOR                      (10) cursor gif & clip frame
 *   HTML_LAYER.JUDGEMENT_LABEL             (30) floating "perfect"/"miss" text
 *   HTML_LAYER.FULLSCREEN_VIDEO            (1000) opening / tutorial2 video
 *   HTML_LAYER.FULLSCREEN_VIDEO_PROMPT     (1001) prompt text on tutorial2 video
 *   HTML_LAYER.GAME_FRAME_BEZEL            (max) white bezel masking outside frame
 *
 * Notes:
 *  - The Phaser canvas is set to `transparent: true` in `main.ts`, so HTML
 *    layers with negative z-index (GAME_AREA_BG, STORY_SAM_VIDEO) paint behind
 *    canvas content. The body must therefore be transparent (see index.html);
 *    if body had a background, it would occlude the negative-z-index layers.
 *  - The "outer frame is white" requirement is satisfied by the html element's
 *    `#ffffff` background showing through outside the canvas-bounded layers.
 */

/** CSS z-index for HTML overlays (DOM elements outside the Phaser canvas). */
export const HTML_LAYER = {
  /** Black backdrop sized to the canvas; the in-game "background" color. */
  GAME_AREA_BG: -2,
  /** Picture-in-picture sam video shown during story mode. */
  STORY_SAM_VIDEO: -1,
  /** Cursor frames (clip frame & gif frame). */
  CURSOR: 10,
  /** Floating judgement labels ("perfect", "miss", etc.) anchored to cursor. */
  JUDGEMENT_LABEL: 30,
  /** Opening video / tutorial2 looping video container. */
  FULLSCREEN_VIDEO: 1000,
  /** "Press any key" prompt overlaid on the tutorial2 video. */
  FULLSCREEN_VIDEO_PROMPT: 1001,
  /**
   * White bezel masking the area outside the gameplay frame; must paint above
   * everything else (incl. cursor) so the cursor doesn't bleed past the frame.
   */
  GAME_FRAME_BEZEL: 2_147_483_647,
} as const;

/**
 * z-index for elements *inside* the cursor frame's stacking context
 * (cursorGifFrame establishes the context via positive z-index + position).
 * These do NOT compose with HTML_LAYER; they only order siblings within cursor.
 */
export const CURSOR_SUBLAYER = {
  GIF: 0,
  CHECK_POINT_DOT: 1,
  BORDER: 2,
} as const;

/** Phaser GameObject depth, applied via `setDepth(...)`. */
export const SCENE_LAYER = {
  // ---------- MenuScene ----------
  MENU_BACKGROUND: -10,
  /** Translucent stripe behind the hovered menu option. */
  MENU_SELECTION_STRIPE: -1,

  // ---------- MainlineIntroScene ----------
  /** Frozen last frame of opening video, used as tutorial backdrop. */
  INTRO_BACKGROUND: 0,
  INTRO_TUTORIAL_IMAGE: 1,
  INTRO_CONTINUE_PROMPT: 6,

  // ---------- GameScene: judgement UI on the gameplay frame ----------
  /** Edge judgement zone (invisible hitbox along the frame edge). */
  JUDGE_EDGE_ZONE: 4,
  /** Outer + inner judgement circles at each cardinal/diagonal point. */
  JUDGE_CIRCLE: 5,
  /** Edge / corner judgement lines (the "judgement line" UI). */
  JUDGE_LINE: 6,
  /** Brief flash glow when an edge is hit. */
  EDGE_HIT_FLASH: 7,
  /** Animated line that flies inward on a successful edge hit. */
  EDGE_HIT_LINE: 8,

  // ---------- GameScene: HUD, prompts, and effects ----------
  /** Stage / round / judgement / delay text and life bar. */
  HUD: 10,
  /** Direction arrow icons inside the prompt grid. */
  PROMPT_ARROW: 15,
  /** Highlight rectangle showing the currently expected prompt cell. */
  PROMPT_INDICATOR: 16,
  /** Debug-only hitbox graphics. */
  HITBOX_DEBUG: 25,
  /** Particle burst spawned on a successful edge hit. */
  EDGE_PARTICLE: 45,
  /** Full-screen white flash overlay (e.g. on perfect hit). */
  FLASH_OVERLAY: 50,

  // ---------- GameScene: modal overlays ----------
  PAUSE_MENU: 100,
  COUNTDOWN: 110,
  DEBUG_OVERLAY: 120,

  // ---------- GameScene: game-over screen ----------
  GAMEOVER_BG: 180,
  GAMEOVER_DIM: 181,
  GAMEOVER_BUTTON: 199,
  GAMEOVER_BUTTON_LABEL: 200,
} as const;
