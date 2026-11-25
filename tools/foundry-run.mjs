#!/usr/bin/env node
/**
 * Drive a local Foundry server with Playwright: launch the test world, join as Gamemaster,
 * optionally run a test script in the page, take a screenshot, and report console errors.
 *
 * Usage:
 *   node tools/foundry-run.mjs --v 13 [--world spacer-test] [--script test/foundry/smoke.js] [--shot out.png] [--keep]
 *
 * The server must be running: `node tools/foundry-server.mjs start --v 13`.
 * A --script file holds the body of an async function evaluated in the page (it can use `game`,
 * `ui`, `CONFIG`, ...). Its return value is printed as JSON. A thrown error fails the run.
 * Exit code 1 when the script throws or the page logs errors.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const version = opt("v", "13");
const port = version === "14" ? 30001 : 30000;
const world = opt("world", "spacer-test");
const script = opt("script");
const shot = opt("shot");
const base = `http://localhost:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", err => errors.push(`pageerror: ${err.message}`));
page.on("console", msg => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  if (msg.type() === "warning" && /deprecat/i.test(msg.text())) errors.push(`deprecation: ${msg.text().slice(0, 300)}`);
});

try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  // Launch the world from the setup screen when no world is active, or switch worlds.
  const active = await page.evaluate(async () => (await (await fetch("/api/status")).json()).world ?? null).catch(() => null);
  if (active !== world) {
    if (active) {
      await page.goto(`${base}/setup`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.evaluate(async () => fetch("/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "shutdown" }) })).catch(() => {});
      await page.waitForTimeout(3000);
    }
    await page.goto(`${base}/setup`, { waitUntil: "domcontentloaded" });
    const res = await page.evaluate(async w => {
      const r = await fetch("/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "launchWorld", world: w }) });
      return `${r.status} ${await r.text()}`.slice(0, 400);
    }, world);
    console.log(`launchWorld: ${res}`);
    await page.waitForTimeout(4000);
  }
  await page.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('select[name="userid"]', { timeout: 60000 });
  // A user who still has an open session (the previous run's browser) is disabled until the
  // server notices the disconnect; reload the join page until the Gamemaster is free.
  let gm;
  for (let i = 0; i < 30 && !gm; i++) {
    gm = await page.$$eval('select[name="userid"] option', opts => opts.find(o => /gamemaster/i.test(o.textContent) && !o.disabled)?.value);
    if (!gm) { await page.waitForTimeout(2000); await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector('select[name="userid"]'); }
  }
  if (!gm) throw new Error("Gamemaster user stays busy on the join screen");
  await page.selectOption('select[name="userid"]', gm);
  await page.click('button[name="join"]');
  await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  // Errors from the setup and join screens are not ours; count only what the world logs.
  errors.length = 0;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  console.log(`joined ${world} on Foundry ${await page.evaluate(() => game.version)} as ${await page.evaluate(() => game.user.name)}`);

  let failed = false;
  if (script) {
    const body = readFileSync(script, "utf8");
    try {
      const result = await page.evaluate(`(async () => { ${body}\n })()`);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      failed = true;
      console.log(`SCRIPT FAILED: ${err.message}`);
    }
    await page.waitForTimeout(1000);
  }
  if (shot) { await page.screenshot({ path: shot }); console.log(`screenshot: ${shot}`); }
  const real = errors.filter(e => !/favicon|Failed to load resource.*(404|socket)/i.test(e));
  if (real.length) { console.log("ERRORS:\n" + real.join("\n")); failed = true; }
  else console.log("no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
} catch (err) {
  console.log(`RUN FAILED: ${err.message}`);
  if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
  await page.screenshot({ path: shot ?? `test-results/fail-v${version}.png` }).catch(() => {});
  await browser.close();
  process.exit(1);
}
