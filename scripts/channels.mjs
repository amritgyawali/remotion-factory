/**
 * Prints your connected Postiz channels with the integration ids you paste
 * into plan.json. Needed because identifiers aren't unique — two Instagram
 * accounts both report "instagram-standalone".
 *
 *   POSTIZ_API_URL=... POSTIZ_API_KEY=... npm run channels
 */
const base = (process.env.POSTIZ_API_URL ?? "").replace(/\/+$/, "");
const url = base.endsWith("/public/v1") ? base : `${base}/public/v1`;
const key = process.env.POSTIZ_API_KEY;

if (!base || !key) {
  console.error("Set POSTIZ_API_URL and POSTIZ_API_KEY first.");
  process.exit(1);
}

const res = await fetch(`${url}/integrations`, { headers: { Authorization: key } });
if (!res.ok) {
  console.error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

const integrations = await res.json();
const seen = new Map();

console.log(`\n${integrations.length} channel(s)\n`);
for (const i of integrations) {
  seen.set(i.identifier, (seen.get(i.identifier) ?? 0) + 1);
  console.log(`  ${i.disabled ? "OFF" : " ON"}  ${i.identifier.padEnd(24)} ${String(i.name).padEnd(24)} ${i.id}`);
}

const ambiguous = [...seen.entries()].filter(([, n]) => n > 1);
if (ambiguous.length) {
  console.log(
    `\nMore than one channel shares ${ambiguous
      .map(([id]) => `"${id}"`)
      .join(", ")} — reference those by id in plan.json, never by identifier.`,
  );
}

console.log(
  `\nPaste into plan.json:\n\n  "channels": ${JSON.stringify(
    integrations.filter((i) => !i.disabled).map((i) => i.id),
  )}\n`,
);
