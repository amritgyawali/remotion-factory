import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, inflateRawSync } from "node:zlib";

/**
 * Extract text from a PDF with no external tools.
 *
 * poppler is not installed and the Python path is unavailable, so this walks
 * the PDF's own structure: find every stream object, inflate the ones that are
 * FlateDecode compressed, and pull the text-showing operators out of the
 * content streams.
 *
 * This is not a general PDF parser and does not try to be. It handles the case
 * that matters here — a text-only document produced by a normal generator —
 * and it will do a poor job on anything with unusual encodings or fonts that
 * remap glyphs. The output is checked by eye before anything is built from it.
 *
 *   node scripts/extract-pdf.mjs <file.pdf> <out.txt>
 */

const [, , input, output] = process.argv;
if (!input) {
  console.error("usage: node scripts/extract-pdf.mjs <file.pdf> [out.txt]");
  process.exit(1);
}

const raw = readFileSync(input);

/** Every `stream ... endstream` body in the file, as raw bytes. */
function streams(buffer) {
  const found = [];
  const openTag = Buffer.from("stream");
  const closeTag = Buffer.from("endstream");

  let at = 0;
  while (at < buffer.length) {
    const open = buffer.indexOf(openTag, at);
    if (open === -1) break;

    // Skip the EOL that must follow the `stream` keyword: CRLF or LF.
    let start = open + openTag.length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;

    const close = buffer.indexOf(closeTag, start);
    if (close === -1) break;

    found.push(buffer.subarray(start, close));
    at = close + closeTag.length;
  }
  return found;
}

/** Inflate if it is deflate data; return null if it plainly is not. */
function maybeInflate(chunk) {
  for (const attempt of [inflateSync, inflateRawSync]) {
    try {
      return attempt(chunk);
    } catch {
      // Not this encoding; try the next.
    }
  }
  return null;
}

/**
 * Decode a PDF string literal, resolving the escapes that carry real text.
 * Octal escapes matter: generators emit \351 for accented characters.
 */
function decodeLiteral(body) {
  let out = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = body[++index];
    if (next === undefined) break;

    if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && body[index + 1] >= "0" && body[index + 1] <= "7") {
        octal += body[++index];
      }
      out += String.fromCharCode(parseInt(octal, 8));
      continue;
    }

    const simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
    if (next in simple) out += simple[next];
    else if (next === "\n") continue; // line continuation
    else out += next;
  }
  return out;
}

/** `<48656C6C6F>` -> "Hello". */
function decodeHex(body) {
  const clean = body.replace(/[^0-9A-Fa-f]/g, "");
  let out = "";
  for (let index = 0; index + 1 < clean.length; index += 2) {
    out += String.fromCharCode(parseInt(clean.slice(index, index + 2), 16));
  }
  return out;
}

/**
 * Pull text out of one content stream.
 *
 * Handles the three operators that actually show text: Tj, TJ (an array of
 * strings and kerning numbers) and the quote forms. `Td`/`TD`/`T*`/`ET` are
 * treated as line breaks so the output keeps the document's line structure —
 * without that, a whole page arrives as one unreadable run.
 */
function textFrom(content) {
  const source = content.toString("latin1");
  let out = "";

  // One regex over the operators, in source order, so the text stays in reading
  // order rather than being grouped by operator type.
  const pattern = /\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]+>|\bTJ\b|\bTj\b|\bTd\b|\bTD\b|\bT\*|\bET\b|\bTf\b/g;

  let match;
  let pendingBreak = false;
  while ((match = pattern.exec(source)) !== null) {
    const token = match[0];

    if (token === "Td" || token === "TD" || token === "T*" || token === "ET") {
      pendingBreak = true;
      continue;
    }
    if (token === "TJ" || token === "Tj" || token === "Tf") continue;

    const text = token.startsWith("(")
      ? decodeLiteral(token.slice(1, -1))
      : decodeHex(token.slice(1, -1));

    if (!text) continue;
    if (pendingBreak) {
      out += "\n";
      pendingBreak = false;
    }
    out += text;
  }

  return out;
}

const pages = [];
for (const chunk of streams(raw)) {
  const inflated = maybeInflate(chunk);
  if (!inflated) continue;

  // A content stream contains text operators. Anything else — a font file, an
  // image, an embedded colour profile — will not, and is skipped.
  const body = inflated.toString("latin1");
  if (!/\bTJ\b|\bTj\b/.test(body)) continue;

  const text = textFrom(inflated).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text) pages.push(text);
}

const joined = pages.map((page, index) => `===PAGE ${index + 1}===\n${page}`).join("\n\n");

if (output) {
  writeFileSync(output, `${joined}\n`, "utf8");
  console.log(`pages with text: ${pages.length}`);
  console.log(`characters: ${joined.length}`);
  console.log(`wrote ${output}`);
} else {
  console.log(joined);
}
