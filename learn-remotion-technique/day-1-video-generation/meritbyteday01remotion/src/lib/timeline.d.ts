export interface Day01State {
  rawFrame: number;
  frame: number;
  scene: 'site' | 'chat' | 'endcard';
  logoH: number;
  navShift: number;
  navWrapped: boolean;
  navClipped: boolean;
  heroImgH: number;
  headlineShift: number;
  logoX: number;
  logoOverlaps: boolean;
  contentPush: number;
  scrollY: number;
  hook: { text: string; sub: string; opacity: number };
  chip: { label: string; scale: number; opacity: number } | null;
  aside: { text: string; opacity: number; y: number } | null;
  payoff: { text: string; opacity: number; scale: number; tickProgress: number } | null;
  chat: {
    typing: boolean;
    status: string | null;
    ghostWidth: number;
    text: string;
    landed: boolean;
    bubbleScale: number;
    dotPhase: number;
    still: boolean;
  } | null;
  endcard: { markScale: number; markOpacity: number; textOpacity: number } | null;
  lockup: boolean;
}

export interface ScriptRow {
  from: number;
  to: number;
  text: string | null;
  note: string;
}

export const FPS: number;
export const WIDTH: number;
export const HEIGHT: number;
export const BODY_END: number;
export const LOOP_CUT: number;
export const END_CARD: number;
export const DURATION: number;
export const MESSAGE: string;
export const ROWS: ScriptRow[];
export function getState(frame: number): Day01State;
