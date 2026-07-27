import assert from "node:assert/strict";
import test from "node:test";
import { BED_BPM, BED_TEMPLATES, buildBed } from "./audio/beds.mjs";
import { CATALOGUE } from "./audio/sfx.mjs";
import { renderPack } from "./build-audio.mjs";
import { peak, rms, SAMPLE_RATE, semitones, toWav } from "./audio/synth.mjs";
import { parseMeasurement, TARGET_LUFS, TARGET_TRUE_PEAK } from "./master-audio.mjs";

const isFinitBuffer = (buffer) => buffer.every((sample) => Number.isFinite(sample));

test("every catalogued effect renders audible, finite audio", () => {
  for (const [name, generator] of Object.entries(CATALOGUE)) {
    const buffer = generator({});
    assert.ok(buffer.length > 0, `${name} rendered an empty buffer`);
    assert.ok(isFinitBuffer(buffer), `${name} contains NaN or Infinity`);
    assert.ok(peak(buffer) > 0.01, `${name} is effectively silent`);
    assert.ok(peak(buffer) <= 1, `${name} peaks above full scale and would clip`);
  }
});

test("every bed layer renders audible, finite audio", () => {
  for (const template of BED_TEMPLATES) {
    const { layers, bpm } = buildBed(template, 4);
    assert.equal(bpm, BED_BPM[template]);
    assert.ok(Object.keys(layers).length >= 3, `${template} has too few layers to build with`);

    for (const [name, buffer] of Object.entries(layers)) {
      const where = `${template}.${name}`;
      assert.ok(isFinitBuffer(buffer), `${where} contains NaN — a bad scale index yields undefined`);
      assert.ok(peak(buffer) > 0.01, `${where} is effectively silent`);
      assert.ok(peak(buffer) <= 1, `${where} peaks above full scale and would clip`);
    }
  }
});

test("beds sit below the effects, as the mix table requires", () => {
  // The PDF puts the bed at -16 LUFS and SFX at -8 to -12 dBFS precisely
  // because with no voiceover the effects are carrying the dialogue.
  const { layers } = buildBed("DevJoke", 4);
  const bedLevel = Math.max(...Object.values(layers).map(rms));
  const sfxLevel = rms(CATALOGUE.snap({}));
  assert.ok(bedLevel < sfxLevel, "bed is not quieter than the effects it sits under");
});

test("pitch escalation actually raises pitch", () => {
  // Days 1, 8 and 16 repeat one effect a semitone higher per beat. If the
  // offset were ignored the escalation would silently render as repetition.
  const base = CATALOGUE.snap({ semitones: 0 });
  const up = CATALOGUE.snap({ semitones: 6 });
  assert.notDeepEqual(Array.from(base.slice(0, 400)), Array.from(up.slice(0, 400)));
  assert.ok(Math.abs(semitones(12) - 2) < 1e-9, "an octave is not a doubling");
});

test("synthesis is deterministic across runs", () => {
  // Renders happen unattended; a cue that differs run to run would make a
  // rebuilt pack impossible to compare and every render subtly different.
  assert.deepEqual(
    Array.from(CATALOGUE.whoosh({ direction: "up" })),
    Array.from(CATALOGUE.whoosh({ direction: "up" })),
  );
  assert.deepEqual(
    Array.from(buildBed("TechTip", 2).layers.pulse),
    Array.from(buildBed("TechTip", 2).layers.pulse),
  );
});

test("the pack covers every template's bed and names no duplicates", () => {
  const files = renderPack();
  const names = files.map((file) => file.name);
  assert.equal(new Set(names).size, names.length, "two cues would write to one filename");

  for (const template of BED_TEMPLATES) {
    assert.ok(
      names.some((name) => name.startsWith(`bed-${template}-`)),
      `no bed layers rendered for ${template}`,
    );
  }
  // Day 1 alone escalates a snap through +2, +4 and +6.
  for (const st of [2, 4, 6]) assert.ok(names.includes(`snap-p${st}.wav`), `missing snap-p${st}`);
});

test("wav encoding produces a readable 48kHz mono header", () => {
  const wav = toWav(CATALOGUE.blip({}));
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.readUInt16LE(22), 1, "channels");
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE, "sample rate");
  assert.equal(wav.readUInt16LE(34), 16, "bit depth");
  assert.equal(wav.readUInt32LE(4), wav.length - 8, "RIFF size does not match the file");
});

test("loudness analysis is parsed out of ffmpeg's output", () => {
  // loudnorm prints its JSON after an ffmpeg banner that also contains braces,
  // so the parser has to take the last block, not the first.
  const output = [
    "ffmpeg version n6.0 { configuration: --enable-filter=loudnorm }",
    "[Parsed_loudnorm_0 @ 0x1] ",
    "{",
    '  "input_i" : "-25.92",',
    '  "input_tp" : "-9.81",',
    '  "input_lra" : "7.30",',
    '  "input_thresh" : "-36.10",',
    '  "target_offset" : "0.11"',
    "}",
  ].join("\n");

  const measured = parseMeasurement(output);
  assert.equal(measured.input_i, "-25.92");
  assert.equal(measured.target_offset, "0.11");
});

test("a silent track cannot be loudness-normalised and is reported, not guessed", () => {
  // loudnorm reports -inf for digital black. Feeding that back as a measured
  // value produces a nonsense correction, so it has to fail instead.
  const output = '{ "input_i" : "-inf", "input_tp" : "-inf", "input_lra" : "0.00", "input_thresh" : "-inf", "target_offset" : "0.00" }';
  assert.equal(parseMeasurement(output), null);
  assert.equal(parseMeasurement("no json here at all"), null);
});

test("master targets deliver the PDF's spec after encoder overshoot", () => {
  // "-14 LUFS integrated, true peak -1 dBTP. What every platform normalises to."
  assert.equal(TARGET_LUFS, -14);

  // The filter target is deliberately below the spec, not equal to it: AAC
  // overshoots loudnorm's ceiling by ~1.2 dB, so mastering to -1 delivered a
  // measured +0.71 dBTP. -2 lands the delivered file near -0.85 dBTP.
  assert.ok(
    TARGET_TRUE_PEAK <= -2,
    "true-peak target must leave headroom for AAC overshoot, or delivered files exceed 0 dBTP",
  );
  assert.ok(TARGET_TRUE_PEAK >= -3, "excessive headroom throws away loudness for no benefit");
});
