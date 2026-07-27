import { createHash, createHmac } from "node:crypto";

/**
 * A minimal S3 client for Cloudflare R2, signing requests with AWS Signature
 * Version 4.
 *
 * Written rather than pulled in because the whole client is four operations —
 * list, put, delete, head — and the alternative is adding the AWS SDK (tens of
 * megabytes) to a repository whose only other dependencies are React and
 * Remotion. It also has to run on a GitHub runner before `npm install` has any
 * chance to fail, and node:crypto is always there.
 */

const SERVICE = "s3";
/** R2 ignores the region but SigV4 requires one in the credential scope. */
const REGION = "auto";

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();

/**
 * Build the canonical request, string-to-sign and signature.
 *
 * Split out from the request so it can be checked against AWS's published
 * SigV4 test vectors. Signing is the one part of this client that is easy to
 * get subtly wrong and impossible to debug from a 403, so it is verified
 * against a known-good vector rather than against a live endpoint.
 */
export function signRequest({
  method,
  host,
  canonicalUri,
  canonicalQuery,
  headers,
  payloadHash,
  amzDate,
  accessKeyId,
  secretAccessKey,
  region = REGION,
  service = SERVICE,
}) {
  const dateStamp = amzDate.slice(0, 8);
  const all = { host, ...headers };

  const names = Object.keys(all)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = names
    .map((name) => {
      const actual = Object.keys(all).find((k) => k.toLowerCase() === name);
      return `${name}:${String(all[actual]).trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = hmac(key, stringToSign).toString("hex");

  return {
    canonicalRequest,
    stringToSign,
    signature,
    signedHeaders,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** RFC 3986. S3 keys routinely contain characters encodeURIComponent leaves alone. */
function uriEncode(value, encodeSlash = true) {
  return String(value)
    .split("")
    .map((character) => {
      if (/[A-Za-z0-9_\-~.]/.test(character)) return character;
      if (character === "/") return encodeSlash ? "%2F" : "/";
      return Array.from(Buffer.from(character, "utf8"))
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    })
    .join("");
}

function signingKey(secret, date) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), REGION), SERVICE), "aws4_request");
}

/**
 * Sign and send one request. `body` must be a Buffer or empty string — R2
 * requires the payload hash, so streaming uploads are deliberately not
 * supported here; these files are single-digit megabytes.
 */
export async function r2Request({
  method,
  endpoint,
  key = "",
  query = {},
  body = "",
  headers = {},
  accessKeyId,
  secretAccessKey,
}) {
  const url = new URL(endpoint);
  const canonicalUri = key
    ? `/${uriEncode(key, false).replace(/^\/+/, "")}`
    : url.pathname === "" ? "/" : url.pathname;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = sha256Hex(payload);

  const allHeaders = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...headers,
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${uriEncode(name)}=${uriEncode(query[name])}`)
    .join("&");

  const { authorization } = signRequest({
    method,
    host: url.host,
    canonicalUri,
    canonicalQuery,
    headers: allHeaders,
    payloadHash,
    amzDate,
    accessKeyId,
    secretAccessKey,
  });

  const target = `${url.origin}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  return fetch(target, {
    method,
    headers: { ...allHeaders, Authorization: authorization },
    body: method === "GET" || method === "HEAD" ? undefined : payload,
  });
}

/** Values out of a flat XML element, which is all the S3 responses here need. */
export function xmlValues(xml, tag) {
  const matches = xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"));
  return Array.from(matches, (match) => match[1]);
}

/** Every object in the bucket, following continuation tokens. */
export async function listObjects(config, prefix = "") {
  const objects = [];
  let token;

  do {
    const query = { "list-type": "2", "max-keys": "1000" };
    if (prefix) query.prefix = prefix;
    if (token) query["continuation-token"] = token;

    const response = await r2Request({ ...config, method: "GET", query });
    const xml = await response.text();
    if (!response.ok) {
      throw new Error(`R2 list failed (${response.status}): ${xml.slice(0, 300)}`);
    }

    for (const entry of xmlValues(xml, "Contents")) {
      objects.push({
        key: xmlValues(entry, "Key")[0],
        size: Number(xmlValues(entry, "Size")[0] ?? 0),
        lastModified: xmlValues(entry, "LastModified")[0] ?? null,
      });
    }

    const truncated = xmlValues(xml, "IsTruncated")[0] === "true";
    token = truncated ? xmlValues(xml, "NextContinuationToken")[0] : undefined;
  } while (token);

  return objects;
}

export async function putObject(config, key, body, contentType = "application/octet-stream") {
  const response = await r2Request({
    ...config,
    method: "PUT",
    key,
    body,
    headers: { "content-type": contentType, "content-length": String(body.length) },
  });

  if (!response.ok) {
    throw new Error(`R2 put "${key}" failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return { key, size: body.length };
}

export async function deleteObject(config, key) {
  const response = await r2Request({ ...config, method: "DELETE", key });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete "${key}" failed (${response.status})`);
  }
  return response.status;
}

/** Config from the environment, or null when R2 is not set up. */
export function r2ConfigFromEnv(env = process.env) {
  const endpoint = env.R2_ENDPOINT;
  const bucket = env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  // R2's S3 endpoint is account-scoped; the bucket is the first path segment.
  const base = endpoint.replace(/\/+$/, "");
  return {
    endpoint: base.endsWith(`/${bucket}`) ? base : `${base}/${bucket}`,
    accessKeyId,
    secretAccessKey,
    bucket,
  };
}
