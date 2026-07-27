import assert from "node:assert/strict";
import test from "node:test";
import { BUDGET_BYTES, keyFor, selectForEviction } from "./archive-r2.mjs";
import { signRequest, xmlValues } from "./r2.mjs";
import {
  archiveSpread,
  audioDistance,
  duplicateProblems,
  findDuplicates,
  MAX_VISUAL_DISTANCE,
  visualDistance,
} from "./uniqueness.mjs";

/**
 * AWS's published SigV4 test vector ("get-vanilla" from the signature test
 * suite). Signing is the one part of the R2 client that fails silently as a
 * 403 with no explanation, so it is verified against a known-good answer
 * rather than against a live endpoint.
 */
test("SigV4 matches AWS's published test vector", () => {
  const result = signRequest({
    method: "GET",
    host: "example.amazonaws.com",
    canonicalUri: "/",
    canonicalQuery: "",
    headers: { "x-amz-date": "20150830T123600Z" },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    amzDate: "20150830T123600Z",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    service: "service",
  });

  assert.equal(result.signedHeaders, "host;x-amz-date");
  assert.equal(
    result.canonicalRequest,
    [
      "GET",
      "/",
      "",
      "host:example.amazonaws.com",
      "x-amz-date:20150830T123600Z",
      "",
      "host;x-amz-date",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n"),
  );
  assert.equal(
    result.signature,
    "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
  );
});

test("signatures change with the payload, so a body cannot be swapped", () => {
  const base = {
    method: "PUT",
    host: "acct.r2.cloudflarestorage.com",
    canonicalUri: "/bucket/2026-w31/d01-a.mp4",
    canonicalQuery: "",
    headers: { "x-amz-date": "20260728T000000Z" },
    amzDate: "20260728T000000Z",
    accessKeyId: "key",
    secretAccessKey: "secret",
  };
  const one = signRequest({ ...base, payloadHash: "a".repeat(64) });
  const two = signRequest({ ...base, payloadHash: "b".repeat(64) });
  assert.notEqual(one.signature, two.signature);
});

test("bucket listings parse out of S3 XML", () => {
  const xml =
    "<ListBucketResult><Contents><Key>2026-w31/d01-a.mp4</Key><Size>2100670</Size>" +
    "<LastModified>2026-07-28T00:00:00.000Z</LastModified></Contents>" +
    "<Contents><Key>2026-w31/d01-b.mp4</Key><Size>2200000</Size>" +
    "<LastModified>2026-07-28T06:00:00.000Z</LastModified></Contents>" +
    "<IsTruncated>false</IsTruncated></ListBucketResult>";

  const rows = xmlValues(xml, "Contents");
  assert.equal(rows.length, 2);
  assert.equal(xmlValues(rows[0], "Key")[0], "2026-w31/d01-a.mp4");
  assert.equal(Number(xmlValues(rows[1], "Size")[0]), 2200000);
});

test("nothing is evicted while the bucket fits the budget", () => {
  const objects = [{ key: "a", size: 1e9, lastModified: "2026-01-01T00:00:00Z" }];
  assert.deepEqual(selectForEviction(objects, 2e6), []);
});

test("the oldest objects are evicted, and only as many as needed", () => {
  const objects = [
    { key: "new", size: 3 * 1024 ** 3, lastModified: "2026-07-01T00:00:00Z" },
    { key: "oldest", size: 3 * 1024 ** 3, lastModified: "2026-01-01T00:00:00Z" },
    { key: "middle", size: 2 * 1024 ** 3, lastModified: "2026-04-01T00:00:00Z" },
  ];

  // 8 GB used, 1 GB incoming -> 1 GB over. The oldest object alone covers it.
  const evicted = selectForEviction(objects, 1024 ** 3);
  assert.deepEqual(
    evicted.map((object) => object.key),
    ["oldest"],
  );
});

test("the budget stays clear of the free allowance", () => {
  // R2 gives 10 GB-month free and bills on peak usage during the month, not on
  // the figure at the end, so the cap is deliberately below the allowance.
  assert.ok(BUDGET_BYTES <= 8 * 1024 ** 3);
  assert.ok(BUDGET_BYTES < 10 * 1024 ** 3);
});

test("keys are grouped by week so pruning is chronological", () => {
  assert.equal(keyFor("2026-w31", "d01-a"), "2026-w31/d01-a.mp4");
});

const signature = (seed) => seed.repeat(128).slice(0, 128);

test("an identical video is caught as a duplicate", () => {
  const same = { id: "d02-a", visualSignature: signature("a"), audioSignature: signature("5").slice(0, 32) };
  const archive = [{ ...same, id: "d01-a", week: "2026-w31" }];

  const problems = duplicateProblems(same, archive);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /looks and sounds like "d01-a"/);
});

test("a shared bed alone is not a duplicate", () => {
  // Two DevJoke videos legitimately share a bed. Only picture AND sound
  // matching means nothing new was made.
  const candidate = { id: "d02-a", visualSignature: signature("f"), audioSignature: signature("5").slice(0, 32) };
  const archive = [
    { id: "d01-a", week: "2026-w31", visualSignature: signature("0"), audioSignature: signature("5").slice(0, 32) },
  ];
  assert.deepEqual(findDuplicates(candidate, archive), []);
});

test("a missing fingerprint blocks publishing rather than passing silently", () => {
  const problems = duplicateProblems({ id: "d02-a", visualSignature: null, audioSignature: null }, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /uniqueness could not be checked/);
});

test("distance functions behave at the extremes", () => {
  assert.equal(visualDistance(signature("a"), signature("a")), 0);
  assert.ok(visualDistance(signature("0"), signature("f")) > MAX_VISUAL_DISTANCE);
  assert.equal(audioDistance("0f", "0f"), 0);
  assert.equal(audioDistance("00", "ff"), 15);
  // Mismatched or absent fingerprints must never read as "identical".
  assert.equal(audioDistance("00", "000"), Infinity);
  assert.equal(visualDistance(null, signature("a")), Infinity);
});

test("archive spread reports the closest pair", () => {
  const spread = archiveSpread([
    { id: "a", visualSignature: signature("0"), audioSignature: "0" },
    { id: "b", visualSignature: signature("f"), audioSignature: "f" },
    { id: "c", visualSignature: signature("0"), audioSignature: "0" },
  ]);
  assert.equal(spread.compared, 3);
  assert.equal(spread.closestVisual, 0);
  assert.deepEqual(spread.closestPair, ["a", "c"]);
});

/**
 * `node --check` validates syntax only, so a used-but-unimported name passes it
 * and then throws at runtime — on the first live archive, which is the worst
 * possible moment. Importing every module proves the bindings actually resolve.
 */
test("every script module loads with all its bindings resolved", async () => {
  const modules = [
    "./archive-video.mjs",
    "./archive-r2.mjs",
    "./r2.mjs",
    "./uniqueness.mjs",
    "./inspect-frames.mjs",
    "./verify-video.mjs",
    "./master-audio.mjs",
    "./build-audio.mjs",
    "./queue.mjs",
    "./accept-week.mjs",
    "./weekly-plan.mjs",
    "./validate-plan.mjs",
    "./audio/synth.mjs",
    "./audio/sfx.mjs",
    "./audio/beds.mjs",
  ];

  for (const specifier of modules) {
    await assert.doesNotReject(() => import(specifier), `${specifier} failed to load`);
  }
});

test("archive-video really exports what render-all calls", async () => {
  const module = await import("./archive-video.mjs");
  for (const name of ["archiveVideo", "readManifest", "writeManifest", "mergeManifest"]) {
    assert.equal(typeof module[name], "function", `archive-video.mjs is missing ${name}`);
  }
});
