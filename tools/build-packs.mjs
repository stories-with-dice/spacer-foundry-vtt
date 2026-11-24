#!/usr/bin/env node
/**
 * Build the compendium packs.
 *
 * Reads the hand-written content in src/content/<pack>/*.json (format: docs/content-format.md),
 * gives every document a stable id derived from its pack, type, and name, writes Foundry JSON
 * to build/<pack>/, and compiles it into LevelDB at packs/<pack>/ with the Foundry CLI.
 *
 * Usage: node tools/build-packs.mjs [--json-only]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));

const DEFAULT_IMG = {
  Item: {
    skill: "icons/svg/book.svg", weapon: "icons/svg/sword.svg", armor: "icons/svg/shield.svg",
    gear: "icons/svg/item-bag.svg", psionic: "icons/svg/aura.svg", drug: "icons/svg/pill.svg",
    shipWeapon: "icons/svg/target.svg"
  },
  Actor: {
    character: "icons/svg/mystery-man.svg", npc: "icons/svg/mystery-man.svg", creature: "icons/svg/pawprint.svg",
    vehicle: "icons/svg/wingfoot.svg", ship: "icons/svg/thrust.svg"
  },
  RollTable: "icons/svg/d20-grey.svg",
  Macro: "icons/svg/dice-target.svg"
};

/** Stable 16-character id from any string. */
export function stableId(...parts) {
  const hash = createHash("sha256").update(parts.join("\u0000")).digest();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) id += alphabet[hash[i] % alphabet.length];
  return id;
}

function readContent(dir) {
  const docs = [];
  if (!existsSync(dir)) return docs;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) docs.push(...readContent(path));
    else if (name.endsWith(".json")) {
      let data;
      try { data = JSON.parse(readFileSync(path, "utf8")); }
      catch (err) { throw new Error(`${path}: ${err.message}`); }
      for (const d of Array.isArray(data) ? data : [data]) docs.push({ ...d, __file: path });
    }
  }
  return docs;
}

const STATS = { coreVersion: "13.351", systemId: SYSTEM.id, systemVersion: SYSTEM.version, createdTime: 0, modifiedTime: 0, lastModifiedBy: null };

function buildItem(pack, d, sort, parentKey) {
  const _id = d._id ?? stableId(pack, parentKey ?? "", "Item", d.type, d.name, parentKey ? String(sort) : "");
  return {
    _id, name: d.name, type: d.type, img: d.img ?? DEFAULT_IMG.Item[d.type] ?? "icons/svg/item-bag.svg",
    system: d.system ?? {}, effects: [], folder: d.folder ?? null, sort, ownership: { default: 0 }, flags: d.flags ?? {},
    _stats: STATS,
    _key: parentKey ? `!actors.items!${parentKey}.${_id}` : `!items!${_id}`
  };
}

function buildActor(pack, d, sort) {
  const _id = d._id ?? stableId(pack, "Actor", d.type, d.name);
  const img = d.img ?? DEFAULT_IMG.Actor[d.type] ?? "icons/svg/mystery-man.svg";
  return {
    _id, name: d.name, type: d.type, img, system: d.system ?? {},
    items: (d.items ?? []).map((it, i) => buildItem(pack, it, i * 100, _id)),
    effects: [], folder: d.folder ?? null, sort, ownership: { default: 0 }, flags: d.flags ?? {},
    prototypeToken: { name: d.name, actorLink: d.type === "character", texture: { src: img }, ...(d.prototypeToken ?? {}) },
    _stats: STATS,
    _key: `!actors!${_id}`
  };
}

function buildTable(pack, d, sort) {
  const _id = d._id ?? stableId(pack, "RollTable", d.name);
  const results = (d.results ?? []).map((r, i) => {
    const rid = stableId(pack, _id, "result", String(i));
    const range = r.range ?? [i + 1, i + 1];
    return {
      _id: rid, type: r.documentUuid ? "document" : "text", name: r.name ?? "", img: r.img ?? null,
      description: r.text ?? r.description ?? "", documentUuid: r.documentUuid ?? null,
      weight: r.weight ?? Math.max(1, range[1] - range[0] + 1), range, drawn: false, flags: r.flags ?? {},
      _stats: STATS,
      _key: `!tables.results!${_id}.${rid}`
    };
  });
  return {
    _id, name: d.name, img: d.img ?? DEFAULT_IMG.RollTable, description: d.description ?? "",
    formula: d.formula, replacement: d.replacement ?? true, displayRoll: d.displayRoll ?? true,
    results, folder: d.folder ?? null, sort, ownership: { default: 0 }, flags: d.flags ?? {},
    _stats: STATS,
    _key: `!tables!${_id}`
  };
}

function buildJournal(pack, d, sort) {
  const _id = d._id ?? stableId(pack, "JournalEntry", d.name);
  const pages = (d.pages ?? []).map((p, i) => {
    const pid = p._id ?? stableId(pack, _id, "page", p.name, String(i));
    return {
      _id: pid, name: p.name, type: "text", title: { show: p.showTitle ?? true, level: p.level ?? 1 },
      text: { content: p.html ?? "", format: 1 }, sort: i * 100, ownership: { default: -1 }, flags: p.flags ?? {},
      _stats: STATS,
      _key: `!journal.pages!${_id}.${pid}`
    };
  });
  return {
    _id, name: d.name, pages, folder: d.folder ?? null, sort, ownership: { default: 0 }, flags: d.flags ?? {},
    _stats: STATS,
    _key: `!journal!${_id}`
  };
}

function buildMacro(pack, d, sort) {
  const _id = d._id ?? stableId(pack, "Macro", d.name);
  return {
    _id, name: d.name, type: d.type ?? "script", img: d.img ?? DEFAULT_IMG.Macro, command: d.command ?? "",
    scope: "global", folder: d.folder ?? null, sort, ownership: { default: 0 }, flags: d.flags ?? {},
    _stats: STATS,
    _key: `!macros!${_id}`
  };
}

const BUILDERS = { Item: buildItem, Actor: buildActor, RollTable: buildTable, JournalEntry: buildJournal, Macro: buildMacro };

/** Build every pack to plain Foundry JSON. Returns { [pack]: docs[] } (folders included). */
export function buildAll() {
  const out = {};
  const seen = new Map();
  for (const pack of SYSTEM.packs) {
    const builder = BUILDERS[pack.type];
    const docs = readContent(join(ROOT, "src", "content", pack.name));
    const folders = new Map();
    const built = docs.map((d, i) => {
      const folderName = d.folder;
      const { __file, ...doc } = d;
      if (folderName) {
        if (!folders.has(folderName)) {
          const fid = stableId(pack.name, "Folder", folderName);
          folders.set(folderName, { _id: fid, name: folderName, type: pack.type, sorting: "m", sort: folders.size * 100, folder: null, color: null, flags: {}, _stats: STATS, _key: `!folders!${fid}` });
        }
        doc.folder = folders.get(folderName)._id;
      }
      const res = builder(pack.name, doc, i * 100);
      const dupKey = `${pack.name}/${res._id}`;
      if (seen.has(dupKey)) throw new Error(`Duplicate document "${doc.name}" in pack ${pack.name} (${__file} and ${seen.get(dupKey)})`);
      seen.set(dupKey, __file);
      return res;
    });
    out[pack.name] = [...folders.values(), ...built];
  }
  return out;
}

async function main() {
  const jsonOnly = process.argv.includes("--json-only");
  const packs = buildAll();
  const buildDir = join(ROOT, "build");
  rmSync(buildDir, { recursive: true, force: true });
  for (const [name, docs] of Object.entries(packs)) {
    const dir = join(buildDir, name);
    mkdirSync(dir, { recursive: true });
    for (const d of docs) writeFileSync(join(dir, `${d._id}.json`), JSON.stringify(d, null, 2));
    console.log(`${name}: ${docs.length} documents`);
  }
  if (jsonOnly) return;
  const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
  for (const name of Object.keys(packs)) {
    const dest = join(ROOT, "packs", name);
    rmSync(dest, { recursive: true, force: true });
    await compilePack(join(buildDir, name), dest, { log: false });
  }
  console.log("Compiled packs into packs/");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
