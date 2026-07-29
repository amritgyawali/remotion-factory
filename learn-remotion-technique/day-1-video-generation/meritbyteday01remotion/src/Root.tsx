import React from 'react';
import { Composition } from 'remotion';
import { DevJoke } from './compositions/DevJoke.js';
import { WIDTH, HEIGHT, FPS, DURATION } from './lib/timeline.js';
import { day01 } from './scripts/day01.js';

/**
 * Each of the thirty videos is a props file, not a new project. Day 1 is wired
 * up here; days 5, 8, 12, 16, 20, 24 and 27 reuse this same DevJoke composition.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Day01"
      component={DevJoke}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={day01}
    />
  </>
);
