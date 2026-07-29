import type { DevJokeProps } from '../compositions/DevJoke.js';

/**
 * DAY 1 · COMEDY · DevJoke · 15s + 2s end card
 * Title      : Make The Logo Bigger
 * Hook A     : MAKE THE LOGO BIGGER (round 7)
 * Hook B     : Client feedback, round 7 of 7.
 * Hook C     : We made the logo bigger 7 times.
 * Caption    : Round 7. We shipped round 1. Tag a designer who has lived this.
 * Retention  : Escalation plus a perfect loop — frame 15s is identical to frame 1.
 * CTA        : none. Pure reach video.
 *
 * Beats, motion and sound live in src/lib/timeline.js and audio/build_audio.py.
 * Rebuild the track with `npm run audio:day01` after changing any cue.
 */
export const day01: DevJokeProps = {
  audioSrc: 'day01_audio.wav',
};
