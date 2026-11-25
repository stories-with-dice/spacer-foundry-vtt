/**
 * Content checks: every compendium source document in src/content/ is consistent.
 * - Roll tables: every total the formula can roll hits exactly one result.
 * - Items and actors: every `system` key exists in the data model schema, with the right type.
 * - Weapons and vehicles: the skill they use exists in the skills pack.
 * - Images: only Foundry core icons (no book art).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAll } from "../tools/build-packs.mjs";
import "./helpers/foundry-shim.mjs";

const { CharacterData, NpcData, CreatureData, VehicleData, ShipData } = await import("../module/data/actors.mjs");
const items = await import("../module/data/items.mjs");

const MODELS = {
  Item: { skill: items.SkillData, weapon: items.WeaponData, armor: items.ArmorData, gear: items.GearData, psionic: items.PsionicData, drug: items.DrugData, shipWeapon: items.ShipWeaponData },
  Actor: { character: CharacterData, npc: NpcData, creature: CreatureData, vehicle: VehicleData, ship: ShipData }
};
const packs = buildAll();
const docsOf = name => packs[name].filter(d => !d._key.startsWith("!folders!"));

/** All totals a formula like "2d6", "1d6*10+1d6", "1d3+3" can produce. */
function totals(formula) {
  const terms = formula.replace(/\s+/g, "").match(/[+-]?[^+-]+/g);
  let sums = new Set([0]);
  for (const raw of terms) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const t = raw.replace(/^[+-]/, "").replace(/^\((.*)\)$/, "$1");
    const m = t.match(/^(\d*)d(\d+)(?:\*(\d+))?$/);
    let values;
    if (m) {
      const n = Number(m[1] || 1), sides = Number(m[2]), mult = Number(m[3] || 1);
      values = new Set([0]);
      for (let i = 0; i < n; i++) {
        const next = new Set();
        for (const v of values) for (let f = 1; f <= sides; f++) next.add(v + f);
        values = next;
      }
      values = new Set([...values].map(v => v * mult));
    } else if (/^\d+$/.test(t)) values = new Set([Number(t)]);
    else throw new Error(`unsupported formula term "${raw}" in "${formula}"`);
    const next = new Set();
    for (const s of sums) for (const v of values) next.add(s + sign * v);
    sums = next;
  }
  return [...sums].sort((a, b) => a - b);
}

test("roll tables: ranges do not overlap and every roll of the formula hits exactly one result", () => {
  const problems = [];
  for (const t of docsOf("tables")) {
    let rolls;
    try { rolls = totals(t.formula); } catch (err) { problems.push(`${t.name}: ${err.message}`); continue; }
    // Rows past the formula's span are fine: DMs reach them. Rows must still not overlap.
    const sorted = [...t.results].sort((a, b) => a.range[0] - b.range[0]);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].range[0] <= sorted[i - 1].range[1]) problems.push(`${t.name}: ranges ${sorted[i - 1].range} and ${sorted[i].range} overlap`);
    }
    for (const r of t.results) if (r.range[1] < r.range[0]) problems.push(`${t.name}: bad range ${r.range}`);
    for (const v of rolls) {
      const hits = t.results.filter(r => v >= r.range[0] && v <= r.range[1]).length;
      if (hits !== 1) problems.push(`${t.name}: roll ${v} hits ${hits} results`);
    }
    for (const r of t.results) {
      if (!String(r.description ?? "").trim() && !r.documentUuid) problems.push(`${t.name}: empty result ${r.range}`);
    }
  }
  assert.deepEqual(problems, []);
});

/** Check `data` against a schema field tree from the shim. Returns a list of problems. */
function checkAgainst(schema, data, path) {
  const out = [];
  for (const [key, value] of Object.entries(data ?? {})) {
    const field = schema[key];
    const p = `${path}.${key}`;
    if (!field) { out.push(`${p}: not in the data model`); continue; }
    if (field.kind === "schema") out.push(...checkAgainst(field.fields, value, p));
    else if (field.kind === "number" && typeof value !== "number") out.push(`${p}: expected a number, got ${JSON.stringify(value)}`);
    else if ((field.kind === "string" || field.kind === "html") && typeof value !== "string") out.push(`${p}: expected a string`);
    else if (field.kind === "boolean" && typeof value !== "boolean") out.push(`${p}: expected a boolean`);
    else if (field.kind === "array" && !Array.isArray(value)) out.push(`${p}: expected an array`);
    else if (field.kind === "number" && field.options.integer && !Number.isInteger(value)) out.push(`${p}: expected an integer, got ${value}`);
  }
  return out;
}

test("every item and actor matches its data model", () => {
  const problems = [];
  for (const [pack, docs] of Object.entries(packs)) {
    for (const d of docs) {
      const kind = d._key.startsWith("!items!") ? "Item" : d._key.startsWith("!actors!") ? "Actor" : null;
      if (!kind) continue;
      const model = MODELS[kind][d.type];
      if (!model) { problems.push(`${pack}/${d.name}: unknown ${kind} type ${d.type}`); continue; }
      problems.push(...checkAgainst(model.defineSchema(), d.system, `${pack}/${d.name}`));
      for (const it of d.items ?? []) {
        const im = MODELS.Item[it.type];
        if (!im) problems.push(`${pack}/${d.name}/${it.name}: unknown item type ${it.type}`);
        else problems.push(...checkAgainst(im.defineSchema(), it.system, `${pack}/${d.name}/${it.name}`));
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("weapons and vehicles use skills that exist in the skills pack", () => {
  const skills = new Map(docsOf("skills").map(s => [s.system.skill, s.system.specialties ?? []]));
  const problems = [];
  const check = (owner, skill, specialty) => {
    if (!skill) return;
    const m = String(skill).match(/^(.*?)\s*\((.*)\)$/);
    const base = m ? m[1] : skill;
    const spec = specialty || (m ? m[2] : "");
    if (!skills.has(base)) problems.push(`${owner}: skill "${base}" is not in the skills pack`);
    else if (spec && skills.get(base).length && !skills.get(base).includes(spec)) problems.push(`${owner}: "${base}" has no specialty "${spec}"`);
  };
  for (const w of docsOf("weapons")) check(`weapons/${w.name}`, w.system.skill, w.system.specialty);
  for (const v of docsOf("vehicles")) check(`vehicles/${v.name}`, v.system.skill);
  assert.deepEqual(problems, []);
});

test("content uses only Foundry core icons (no book art)", () => {
  const problems = [];
  const walk = (doc, where) => {
    if (doc.img && !/^icons\//.test(doc.img)) problems.push(`${where}: img ${doc.img}`);
    for (const it of doc.items ?? []) walk(it, `${where}/${it.name}`);
    for (const r of doc.results ?? []) if (r.img && !/^icons\//.test(r.img)) problems.push(`${where}: result img ${r.img}`);
    const html = JSON.stringify(doc.pages ?? doc.description ?? "");
    if (/<img/i.test(html)) problems.push(`${where}: <img> in text`);
  };
  for (const [pack, docs] of Object.entries(packs)) for (const d of docs) walk(d, `${pack}/${d.name}`);
  assert.deepEqual(problems, []);
});

test("every pack has content", () => {
  for (const [pack, docs] of Object.entries(packs)) assert.ok(docsOf(pack).length > 0, `${pack} is empty`);
});
