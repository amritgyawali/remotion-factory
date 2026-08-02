import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Extract text from a PDF using pdfjs-dist — the real deal, not a regex hack.
 *
 * pdfjs-dist handles all the encodings, CMap fonts, CID fonts and
 * cross-reference streams that a raw parser would miss. This is the only
 * reliable way to read a PDF that was produced by a modern generator.
 *
 *   node scripts/extract-pdf.mjs <file.pdf> [out.txt]
 */

const [, , input, output] = process.argv;
if (!input) {
  console.error("usage: node scripts/extract-pdf.mjs <file.pdf> [out.txt]");
  process.exit(1);
}

const data = new Uint8Array(readFileSync(input));

const doc = await getDocument({ data }).promise;

const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();

  // Reconstruct lines from text items. Items on the same vertical position
  // (within 2px) are on the same line; a large vertical jump is a new paragraph.
  const items = content.items.filter((item) => item.str.trim().length > 0);
  const lines = [];
  let currentLine = [];
  let lastY = null;

  for (const item of items) {
    const y = item.transform[5]; // vertical position
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      lines.push(currentLine.map((item) => item.str).join(" "));
      currentLine = [];
    }
    currentLine.push(item);
    lastY = y;
  }
  if (currentLine.length > 0) {
    lines.push(currentLine.map((item) => item.str).join(" "));
  }

  const text = lines.join("\n").trim();
  if (text) {
    pages.push({ index: i, text });
  }
}

const joined = pages
  .map((page) => `===PAGE ${page.index}===\n${page.text}`)
  .join("\n\n");

if (output) {
  writeFileSync(output, `${joined}\n`, "utf8");
  console.log(`pages with text: ${pages.length}`);
  console.log(`characters: ${joined.length}`);
  console.log(`wrote ${output}`);
} else {
  console.log(joined);
}
