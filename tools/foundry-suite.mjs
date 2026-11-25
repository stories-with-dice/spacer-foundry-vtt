#!/usr/bin/env node
/**
 * Run every browser test (test/foundry/*.js listed in SUITE) on Foundry v13 and/or v14.
 *   node tools/foundry-suite.mjs            both versions, one after the other
 *   node tools/foundry-suite.mjs --v 14     one version
 *
 * Both servers share packs/ and LevelDB allows one process per pack, so the suite tests one
 * version at a time: it starts the server if needed (and stops it after, if it started it), or
 * with --switch-world, switches a running server to `spacer-test` and back to its previous world at
 * the end. Without --switch-world, a version whose server has another world open is skipped.
 * Exit code 1 when any test fails.
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUITE = ["smoke", "content", "play", "chargen", "craft", "tools", "scene"];
const PORTS = { 13: 30000, 14: 30001 };
const vi = process.argv.indexOf("--v");
const versions = vi > 0 ? [process.argv[vi + 1]] : ["13", "14"];

const node = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", ...opts });
const status = async port => { try { return await (await fetch(`http://localhost:${port}/api/status`)).json(); } catch { return null; } };

let failed = 0;
for (const v of versions) {
  console.log(`\n=== Foundry v${v}`);
  const before = await status(PORTS[v]);
  const started = !before;
  if (before?.world && before.world !== "spacer-test" && !process.argv.includes("--switch-world")) {
    console.log(`SKIP v${v}: world "${before.world}" is open. Close it, or pass --switch-world if the user allowed it.`);
    failed++;
    continue;
  }
  if (started) console.log(node(["tools/foundry-server.mjs", "start", "--v", v]).stdout.trim());
  for (const [i, name] of SUITE.entries()) {
    const args = ["tools/foundry-run.mjs", "--v", v, "--script", `test/foundry/${name}.js`, "--shot", `test-results/suite-${name}-v${v}.png`];
    if (i === 0) args.push("--relaunch");
    if (process.argv.includes("--switch-world")) args.push("--switch-world");
    const res = node(args, { maxBuffer: 64 * 1024 * 1024 });
    const ok = res.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) console.log((res.stdout + res.stderr).split("\n").filter(l => /FAILED|ERRORS|error|deprecation/i.test(l)).slice(0, 20).join("\n"));
  }
  if (started) console.log(node(["tools/foundry-server.mjs", "stop", "--v", v]).stdout.trim());
  else if (before?.world && before.world !== "spacer-test") {
    // Give the server back with the world it had, which also releases the packs.
    node(["tools/foundry-run.mjs", "--v", v, "--world", before.world, "--switch-world"]);
    console.log(`restored world ${before.world}`);
  }
}
console.log(failed ? `\n${failed} test(s) failed` : "\nall browser tests passed");
process.exit(failed ? 1 : 0);
