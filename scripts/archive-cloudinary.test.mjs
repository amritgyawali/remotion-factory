import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  BUDGET_BYTES,
  MAX_VIDEO_BYTES,
  configFromEnv,
  selectForEviction,
  signParams,
} from "./archive-cloudinary.mjs";

test("CLOUDINARY_URL parses into its three parts", () => {
  const config = configFromEnv({ CLOUDINARY_URL: "cloudinary://12345:se-cret_AB@mycloud" });
  assert.deepEqual(config, { apiKey: "12345", apiSecret: "se-cret_AB", cloudName: "mycloud" });
});

test("separate variables work when the URL form is absent", () => {
  const config = configFromEnv({
    CLOUDINARY_CLOUD_NAME: "mycloud",
    CLOUDINARY_API_KEY: "12345",
    CLOUDINARY_API_SECRET: "secret",
  });
  assert.equal(config.cloudName, "mycloud");
});

test("an unconfigured environment yields null rather than a broken client", () => {
  assert.equal(configFromEnv({}), null);
  assert.equal(configFromEnv({ CLOUDINARY_URL: "not-a-cloudinary-url" }), null);
});

test("upload signatures follow Cloudinary's documented scheme", () => {
  // Sorted "key=value" pairs joined by &, secret appended, SHA-1 of the whole.
  const params = { timestamp: "1700000000", public_id: "meritbyte/2026-w31/d01-a" };
  const expected = createHash("sha1")
    .update("public_id=meritbyte/2026-w31/d01-a&timestamp=1700000000SECRET")
    .digest("hex");

  assert.equal(signParams(params, "SECRET"), expected);
});

test("unsignable and empty parameters are excluded from the signature", () => {
  // file, api_key, resource_type and cloud_name are excluded by the spec, and
  // including them produces a signature Cloudinary rejects as invalid.
  const withNoise = {
    timestamp: "1700000000",
    file: "binary",
    api_key: "12345",
    resource_type: "video",
    cloud_name: "mycloud",
    folder: "",
  };
  assert.equal(signParams(withNoise, "SECRET"), signParams({ timestamp: "1700000000" }, "SECRET"));
});

test("nothing is evicted while storage fits the budget", () => {
  const resources = [{ publicId: "a", bytes: 2e6, createdAt: "2026-01-01T00:00:00Z" }];
  assert.deepEqual(selectForEviction(resources, 2e6), []);
});

test("the oldest uploads are evicted first, and only as many as needed", () => {
  const resources = [
    { publicId: "newest", bytes: 3 * 1024 ** 3, createdAt: "2026-07-01T00:00:00Z" },
    { publicId: "oldest", bytes: 3 * 1024 ** 3, createdAt: "2026-01-01T00:00:00Z" },
    { publicId: "middle", bytes: 2 * 1024 ** 3, createdAt: "2026-04-01T00:00:00Z" },
  ];
  assert.deepEqual(
    selectForEviction(resources, 1024 ** 3).map((r) => r.publicId),
    ["oldest"],
  );
});

test("limits match the free plan", () => {
  // 25 credits a month, where a credit is 1 GB stored or 1 GB delivered.
  // Capping storage at 8 GB leaves the rest for delivery.
  assert.equal(BUDGET_BYTES, 8 * 1024 ** 3);
  // Reported by the account's own /usage endpoint as video_max_size_bytes.
  assert.equal(MAX_VIDEO_BYTES, 100 * 1024 ** 2);
});

test("the module loads with all its bindings resolved", async () => {
  await assert.doesNotReject(() => import("./archive-cloudinary.mjs"));
});
