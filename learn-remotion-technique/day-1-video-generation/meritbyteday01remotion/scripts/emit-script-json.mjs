// Emits day01.script.json — the machine-readable beat sheet.
// Generated FROM timeline.js + cues.json so the JSON can never drift from the
// code that actually renders. This is the shape to scale into a plan.json of 30.

import fs from 'node:fs';
import { ROWS, DURATION, FPS, WIDTH, HEIGHT, MESSAGE, LOOP_CUT, END_CARD, getState } from '../src/lib/timeline.js';

const cues = JSON.parse(fs.readFileSync('audio/cues.json', 'utf8'));
const cuesByFrame = {};
for (const c of cues.cues) (cuesByFrame[c.frame] ??= []).push(c);

const doc = {
  $schema: './script.schema.json',
  day: 1,
  title: 'Make The Logo Bigger',
  emotion: 'COMEDY',
  template: 'DevJoke',
  bodyLengthSeconds: 15,
  endCardSeconds: 2,
  composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },

  rules: {
    noHumans: true,
    noVoice: true,
    soundOnly: true,
    remotionOnly: true,
    bannedOnScreen: ['faces', 'hands', 'bodies', 'silhouettes', 'avatars', 'photographs',
                     'illustrated characters', 'cursors driven by a hand', 'stock footage',
                     'screen recordings'],
    bannedInAudio: ['voiceover', 'dialogue', 'narration', 'whispers', 'crowd voices',
                    'AI speech', 'vocal pads', 'breaths', 'chanting', 'lyrics'],
  },

  hooks: {
    A: 'MAKE THE LOGO BIGGER (round 7)',
    B: 'Client feedback, round 7 of 7.',
    C: 'We made the logo bigger 7 times.',
    mechanic: 'the number / escalation promise',
    whyItHolds: 'The round counter is a promise of escalation. Nobody leaves before they see round 7.',
    readableByFrame: 6,
    minPointSize: 90,
    maxWords: 7,
  },

  musicBed: {
    instrument: 'playful plucked synth',
    bpm: cues.bpm,
    bpmNote: 'brief says 100; 90 keeps beat=20 frames / eighth=10 / sixteenth=5 so every cue is frame-exact and on-grid. Still inside the 88-108 DevJoke band.',
    behaviour: 'One instrument layer added on every round so the track escalates with the logo. Full stop at the ping.',
    key: 'A minor',
    progression: ['Am', 'Am', 'F', 'G'],
    layerEntry: { pluck: 0, bass: 0, kick: 30, shaker: 60, hihat: 90 },
    stripToBassOnly: [180, 210],
    hardStopFrame: 312,
    silence: [330, 360],
    quietReentryFrame: 360,
    fullReturnFrame: 390,
    resetToBarOneFrame: 420,
  },

  mix: {
    bedLufs: -16,
    sfxPeakDbfs: [-12, -8],
    duck: { depthDb: -4, holdFrames: 6, appliesTo: 'every major SFX hit' },
    masterLufs: -14,
    truePeakDbtp: -1,
  },

  retention: {
    device: 'Escalation plus a perfect loop.',
    seamlessLoop: { cutFrame: LOOP_CUT, identicalTo: [0, 30],
                    note: 'frames 420-449 are byte-identical to frames 0-29' },
    persistentLockup: 'lower-left MeritByte.com from second zero, so the brand survives the loop',
  },

  caption: 'Round 7. We shipped round 1. Tag a designer who has lived this.',
  cta: null,
  ctaNote: 'No CTA. Pure reach video.',

  rows: ROWS.map((r) => {
    const s = getState(r.from);
    return {
      fromFrame: r.from,
      toFrame: r.to,
      fromSecond: r.from / FPS,
      toSecond: r.to / FPS,
      onScreenText: r.text,
      motion: r.note,
      logoHeightPx: r.from < END_CARD ? Math.round(s.logoH) : null,
      scene: s.scene,
      sound: (cuesByFrame[r.from] ?? []).map((c) => ({ sfx: c.sfx, dbfs: c.dbfs, ducksBed: c.ducks_bed })),
    };
  }),

  sfxCues: cues.cues.map((c) => ({
    frame: c.frame, second: c.second, sfx: c.sfx, peakDbfs: c.dbfs, ducksBed: c.ducks_bed,
  })),

  copy: { chatMessage: MESSAGE, chatChannel: '#vertex-website', chatSender: 'Vertex Co.',
          senderInitials: 'VC', mockSite: 'Vertex', mockDomain: 'vertex.io' },

  endCard: {
    durationFrames: DURATION - END_CARD,
    background: '#191919',
    line1: 'MeritByte Technologies',
    line2: 'MeritByte.com',
    motion: 'logo mark springs in over 6 frames, text fades up, then completely still',
    audio: 'logo sting + one warm chime; bed resolves to its final chord and fades across the full 2s',
    note: 'identical on all thirty videos — one component, EndCard.tsx',
  },
};

fs.writeFileSync('day01.script.json', JSON.stringify(doc, null, 2));
console.log(`wrote day01.script.json — ${doc.rows.length} rows, ${doc.sfxCues.length} cues`);
