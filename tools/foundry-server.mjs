#!/usr/bin/env node
/**
 * Start or stop a local headless Foundry server for testing.
 *   node tools/foundry-server.mjs start --v 13|14
 *   node tools/foundry-server.mjs stop --v 13|14
 *   node tools/foundry-server.mjs status
 * v13: ~/bin/FoundryVTT-Node-13.351, data ~/Library/Application Support/FoundryVTT, port 30000.
 * v14: ~/bin/FoundryVTT-Node-14.370, data ~/Library/Application Support/FoundryVTT-14, port 30001.
 * The pid is kept in build/foundry-v<N>.pid. A server that this tool did not start is left alone.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVERS = {
  13: { app: join(homedir(), "bin/FoundryVTT-Node-13.351/main.js"), data: join(homedir(), "Library/Application Support/FoundryVTT"), port: 30000 },
  14: { app: join(homedir(), "bin/FoundryVTT-Node-14.370/main.js"), data: join(homedir(), "Library/Application Support/FoundryVTT-14"), port: 30001 }
};
const [cmd = "status"] = process.argv.slice(2);
const vi = process.argv.indexOf("--v");
const versions = vi > 0 ? [process.argv[vi + 1]] : ["13", "14"];

const listening = port => { try { return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`).toString().trim(); } catch { return ""; } };
mkdirSync(join(ROOT, "build"), { recursive: true });

for (const v of versions) {
  const s = SERVERS[v];
  const pidFile = join(ROOT, "build", `foundry-v${v}.pid`);
  const pid = listening(s.port);
  if (cmd === "status") { console.log(`v${v} port ${s.port}: ${pid ? `running (pid ${pid})` : "stopped"}`); continue; }
  if (cmd === "start") {
    if (pid) { console.log(`v${v} already running on ${s.port} (pid ${pid})`); continue; }
    const log = openSync(join(ROOT, "build", `foundry-v${v}.log`), "a");
    const child = spawn(process.execPath, [s.app, `--dataPath=${s.data}`, `--port=${s.port}`, "--headless", "--noupdate"], { detached: true, stdio: ["ignore", log, log] });
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    for (let i = 0; i < 60 && !listening(s.port); i++) await new Promise(r => setTimeout(r, 500));
    console.log(`v${v} ${listening(s.port) ? "started" : "FAILED to start"} on ${s.port} (pid ${child.pid}); log build/foundry-v${v}.log`);
  }
  if (cmd === "stop") {
    const own = existsSync(pidFile) ? readFileSync(pidFile, "utf8").trim() : "";
    if (!pid) { console.log(`v${v} not running`); rmSync(pidFile, { force: true }); continue; }
    if (!own || !pid.split("\n").includes(own)) { console.log(`v${v} pid ${pid} was not started by this tool; leaving it`); continue; }
    process.kill(Number(own));
    rmSync(pidFile, { force: true });
    console.log(`v${v} stopped`);
  }
}
