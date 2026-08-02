import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PLANS_DIR = "plans";
const SOURCE_DIR = path.join("plan-source", "campaign");

async function cleanPlans() {
  const names = (await readdir(PLANS_DIR)).filter((name) => name.endsWith(".json")).sort();
  let changed = 0;

  for (const name of names) {
    const plan = JSON.parse(await readFile(path.join(PLANS_DIR, name), "utf8"));
    let planChanged = false;

    for (const item of plan.items) {
      if (item.props?.variant === "logo") {
        if (item.template === "DevJoke") {
          delete item.props.variant;
          planChanged = true;
          console.log(`${name}: Removed logo variant from ${item.id}`);
        }
      }
    }

    if (planChanged) {
      await writeFile(path.join(PLANS_DIR, name), `${JSON.stringify(plan, null, 2)}\n`);
      changed++;
    }
  }

  console.log(`Cleaned ${changed} plan file(s)`);
}

async function cleanSources() {
  const names = (await readdir(SOURCE_DIR)).filter((name) => name.endsWith(".json")).sort();
  let changed = 0;

  for (const name of names) {
    const source = JSON.parse(await readFile(path.join(SOURCE_DIR, name), "utf8"));
    let sourceChanged = false;

    if (source.items) {
      for (const item of source.items) {
        if (item.props?.variant === "logo") {
          if (item.template === "DevJoke") {
            delete item.props.variant;
            sourceChanged = true;
            console.log(`${name}: Removed logo variant from item`);
          }
        }
      }
    }

    if (sourceChanged) {
      await writeFile(path.join(SOURCE_DIR, name), `${JSON.stringify(source, null, 2)}\n`);
      changed++;
    }
  }

  console.log(`Cleaned ${changed} source file(s)`);
}

await cleanPlans();
await cleanSources();