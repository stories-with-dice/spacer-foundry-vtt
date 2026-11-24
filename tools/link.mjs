#!/usr/bin/env node
/** Symlink this repo into the local Foundry v13 and v14 data folders as systems/spacer. */
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIRS = [
  join(homedir(), "Library/Application Support/FoundryVTT/Data"),
  join(homedir(), "Library/Application Support/FoundryVTT-14/Data")
];
for (const data of DATA_DIRS) {
  if (!existsSync(data)) { console.log(`skip ${data} (missing)`); continue; }
  const target = join(data, "systems", "spacer");
  if (existsSync(target) || (() => { try { return lstatSync(target).isSymbolicLink(); } catch { return false; } })()) {
    if (!lstatSync(target).isSymbolicLink()) { console.log(`skip ${target} (real folder, not a link)`); continue; }
    unlinkSync(target);
  }
  symlinkSync(ROOT, target, "dir");
  console.log(`linked ${target} -> ${ROOT}`);
}
