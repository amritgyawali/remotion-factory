import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeManifest, readManifest, writeManifest } from "./archive-video.mjs";
import { MIN_BITRATE, MIN_BYTES, videoProblems } from "./verify-video.mjs";

/**
 * Measured from a real 17-second DevJoke render on this project:
 * 1080x1920, 17.05s, 2,416,239 bytes, 1,134,029 bits/s. The thresholds are
 * calibrated against these, not against a guess.
 */
const MEASURED_BYTES = 2_416_239;
const MEASURED_BITRATE = 1_134_029;

/** A probe of the kind a healthy 17-second render produces. */
function goodProbe({ width = 1080, height = 1920, duration = 17, bitRate = MEASURED_BITRATE } = {}) {
  return {
    streams: [
      { codec_type: "video", codec_name: "h264", width, height, duration: String(duration) },
      { codec_type: "data", codec_name: "bin_data" },
    ],
    format: { duration: String(duration), bit_rate: String(bitRate) },
  };
}

const HEALTHY_BYTES = MEASURED_BYTES;

test("accepts a sound render", () => {
  assert.deepEqual(videoProblems(goodProbe(), HEALTHY_BYTES, { expectedSeconds: 17 }), []);
});

test("tolerates the sub-second drift an encoder introduces", () => {
  const problems = videoProblems(goodProbe({ duration: 17.03 }), HEALTHY_BYTES, {
    expectedSeconds: 17,
  });
  assert.deepEqual(problems, []);
});

test("rejects a video whose length does not match the plan", () => {
  const problems = videoProblems(goodProbe({ duration: 9 }), HEALTHY_BYTES, {
    expectedSeconds: 17,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duration is 9\.00s, expected 17s/);
});

test("rejects a blank render that compressed to almost nothing", () => {
  // The failure this whole check exists for: a valid, playable, empty video.
  const problems = videoProblems(goodProbe({ bitRate: 40_000 }), 90_000, {
    expectedSeconds: 17,
  });
  assert.equal(problems.length, 2, problems.join("; "));
  assert.match(problems.join(" "), /below the .* floor/);
  assert.match(problems.join(" "), /blank or frozen/);
});

test("derives bitrate when the container does not report one", () => {
  const probe = goodProbe();
  delete probe.format.bit_rate;
  delete probe.streams[0].bit_rate;

  // 100 kB over 17s is ~47 kbps — far under the floor, and only visible
  // because the check falls back to computing it from the file size.
  const problems = videoProblems(probe, 100_000, { expectedSeconds: 17 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /blank or frozen/);
});

test("rejects a frame that is not the vertical format", () => {
  const problems = videoProblems(goodProbe({ width: 1920, height: 1080 }), HEALTHY_BYTES, {
    expectedSeconds: 17,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /1920x1080, expected 1080x1920/);
});

test("rejects a file with no video stream", () => {
  const probe = goodProbe();
  probe.streams = [{ codec_type: "audio", codec_name: "aac" }];
  const problems = videoProblems(probe, HEALTHY_BYTES, { expectedSeconds: 17 });
  assert.deepEqual(problems, ["expected exactly 1 video stream, found 0"]);
});

test("thresholds keep clear of what the templates actually produce", () => {
  // Guards against a future edit raising the floors into the range a real
  // render occupies, which would fail every run instead of only bad ones.
  // Motion graphics compress well, so the margin here is deliberately stated
  // rather than assumed: roughly 4x on bitrate, 24x on size.
  assert.ok(MIN_BITRATE < MEASURED_BITRATE / 4, "bitrate floor is too close to a real render");
  assert.ok(MIN_BYTES < MEASURED_BYTES / 10, "size floor is too close to a real render");
});

test("re-archiving an id replaces its record instead of duplicating it", () => {
  const first = mergeManifest(
    { videos: [] },
    { id: "d01-a", week: "2026-w31", url: "https://example.test/first.mp4" },
  );
  const second = mergeManifest(first, {
    id: "d01-a",
    week: "2026-w31",
    url: "https://example.test/second.mp4",
  });

  assert.equal(second.videos.length, 1);
  assert.equal(second.videos[0].url, "https://example.test/second.mp4");
});

test("manifest entries stay sorted so the committed diff is readable", () => {
  const manifest = ["d02-a", "d01-b", "d01-a"].reduce(
    (acc, id) => mergeManifest(acc, { id, week: "2026-w31" }),
    { videos: [] },
  );
  assert.deepEqual(
    manifest.videos.map((video) => video.id),
    ["d01-a", "d01-b", "d02-a"],
  );
});

test("manifest survives a round trip and starts empty when absent", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "archive-"));
  try {
    const manifestPath = path.join(dir, "archive", "manifest.json");
    assert.deepEqual(await readManifest(manifestPath), { videos: [] });

    const entry = { id: "d01-a", week: "2026-w31", sha256: "abc", bytes: 10 };
    await writeManifest(mergeManifest({ videos: [] }, entry), manifestPath);
    assert.deepEqual((await readManifest(manifestPath)).videos, [entry]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
