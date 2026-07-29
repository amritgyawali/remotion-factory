// Frame renderer. Drives Chromium over the DevTools Protocol and writes one PNG
// per frame — the same "deterministic function of frame -> headless Chromium
// screenshot" pipeline Remotion uses internally.
//
// usage: node renderer/render.mjs [outDir] [startFrame] [endFrame]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const OUT = path.resolve(ROOT, process.argv[2] || 'frames');
const PORT = 8731;
const CDP_PORT = 9333;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

// ---- static server ---------------------------------------------------------
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('nope');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ---- chromium --------------------------------------------------------------
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`,
  '--remote-debugging-address=127.0.0.1',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--font-render-hinting=none',
  '--disable-lcd-text', '--disable-features=DefaultPassthroughCommandDecoder',
  '--force-color-profile=srgb', '--allow-file-access-from-files',
  '--window-size=1080,1920', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

async function waitForCdp() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('chromium did not expose CDP');
}
const wsUrl = await waitForCdp();

// ---- minimal CDP client ----------------------------------------------------
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', {
  width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false,
});

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/renderer/index.html` });

// wait for the module to boot
for (let i = 0; i < 200; i++) {
  const r = await S('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true });
  if (r.result.value) break;
  await new Promise((r) => setTimeout(r, 100));
}

const durRes = await S('Runtime.evaluate', { expression: 'window.DURATION', returnByValue: true });
const DURATION = durRes.result.value;
if (!DURATION) throw new Error('scene failed to load — check module errors');

const start = Number(process.argv[3] ?? 0);
const end = Number(process.argv[4] ?? DURATION);
fs.mkdirSync(OUT, { recursive: true });

console.log(`rendering frames ${start}..${end - 1} of ${DURATION} -> ${OUT}`);
const t0 = Date.now();
for (let f = start; f < end; f++) {
  const r = await S('Runtime.evaluate', { expression: `window.setFrame(${f})`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('setFrame threw: ' + JSON.stringify(r.exceptionDetails));
  const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, optimizeForSpeed: true });
  fs.writeFileSync(path.join(OUT, `f${String(f).padStart(4, '0')}.png`), Buffer.from(shot.data, 'base64'));
  if (f % 60 === 0) process.stdout.write(`  ${f} `);
}
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

ws.close();
chrome.kill();
server.close();
process.exit(0);
