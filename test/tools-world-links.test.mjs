// World code links: every code on a generated world page links to an existing page and anchor of
// the "25a World Codes" journal entry, and the generated id module matches the pack build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAll } from "../tools/build-packs.mjs";
import { LINKS_FILE, WORLD_CODES_ENTRY, worldCodeLinksSource } from "../tools/gen-world-code-links.mjs";
import { makeDice, randomDie } from "../module/shared/dice.mjs";
import { toHex } from "../module/config.mjs";
import * as world from "../module/tools/rules/world.mjs";
import * as subsector from "../module/tools/rules/subsector.mjs";
import * as pages from "../module/tools/cards/world-pages.mjs";
import * as worldCards from "../module/tools/cards/worlds.mjs";
import { codeLink, uwpLinks } from "../module/tools/cards/world-links.mjs";

const packs = buildAll();
const entry = packs.rules.find(d => d.name === WORLD_CODES_ENTRY);
const anchors = new Map(entry.pages.map(p => [p._id, new Set([...p.text.content.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map(m => m[1]))]));
const headings = new Map(entry.pages.map(p => [p.name, new Map([...p.text.content.matchAll(/<h3 id="([^"]+)">([^<]*)<\/h3>/g)].map(m => [m[1], m[2]]))]));

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Every @UUID link to the World Codes entry in `text`, checked; returns the anchors. */
function checkLinks(text, where) {
  const found = [];
  for (const m of text.matchAll(/@UUID\[([^\]#]+)(?:#([^\]]+))?\]\{([^}]*)\}/g)) {
    const [, uuid, anchor, label] = m;
    if (!uuid.startsWith("Compendium.spacer.rules.")) continue;
    const parts = uuid.split(".");
    assert.equal(parts[4], entry._id, `${where}: link to another entry: ${m[0]}`);
    assert.equal(parts[5], "JournalEntryPage", `${where}: ${m[0]}`);
    assert.ok(anchors.has(parts[6]), `${where}: unknown page ${parts[6]}`);
    assert.ok(anchor && anchors.get(parts[6]).has(anchor), `${where}: page ${parts[6]} has no anchor "${anchor}"`);
    assert.ok(label, `${where}: empty label`);
    found.push(anchor);
  }
  return found;
}

test("world code links: the generated id module matches the pack build", () => {
  assert.equal(readFileSync(LINKS_FILE, "utf8"), worldCodeLinksSource(packs), "run: node tools/gen-world-code-links.mjs");
});

test("world code links: every code of generated worlds and subsectors links to an existing anchor", () => {
  const d = makeDice(randomDie(seeded(11)));
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const sizeMode = ["standard", "earthlike", "large"][i % 3];
    const w = world.generateStarSystem(d, { hex: "0101", sizeMode, popDM: i % 4 });
    const html = pages.worldPageHtml(w);
    const found = checkLinks(html, `world ${w.uwp}`);
    found.forEach(a => seen.add(a));
    // The world line and the profile link every UWP code, base, trade code, the zone, and the temperature.
    for (const a of [`starport-${w.starport}`, `size-${toHex(w.size)}`, `atmosphere-${toHex(w.atmosphere)}`, `hydrographics-${toHex(w.hydrographics)}`,
      `population-${toHex(w.population)}`, `government-${toHex(w.government)}`, `law-${toHex(w.law)}`, `tech-${toHex(w.tl)}`,
      `temperature-${w.temperature.type}`, `zone-${w.zone || "G"}`, ...w.bases.map(b => `base-${b}`), ...w.tradeCodes.map(c => `trade-${c}`)]) {
      assert.ok(found.includes(a), `world ${w.line}: no link to ${a}`);
    }
    if (w.highport) assert.ok(found.includes("base-H"), "highport link");
    const card = worldCards.worldCard(w);
    checkLinks(card.sections.flatMap(s => (s.rows ?? []).map(r => `${r.value} ${r.note ?? ""}`)).join(" "), `card ${w.uwp}`);
  }
  for (let i = 0; i < 6; i++) {
    const s = subsector.generateSubsector(d, { name: `S${i}`, density: ["sparse", "typical", "dense"][i % 3] });
    const links = Object.fromEntries(s.worlds.map(x => [x.name, `JournalEntry.${x.name}`]));
    const found = checkLinks(pages.subsectorPageHtml(s, links), `subsector ${s.name}`);
    for (const w of s.worlds) {
      assert.ok(found.includes(`government-${toHex(w.government)}`));
      checkLinks(pages.worldPageHtml(w), `subsector world ${w.line}`);
    }
  }
  // Scripted dice reach most values; at least these kinds were linked.
  for (const kind of ["starport", "size", "atmosphere", "hydrographics", "population", "government", "law", "tech", "base", "trade", "zone", "temperature"]) {
    assert.ok([...seen].some(a => a.startsWith(`${kind}-`)), `no ${kind} link seen`);
  }
});

test("world code links: links and fallbacks", () => {
  assert.match(codeLink("government", "7"), /^@UUID\[Compendium\.spacer\.rules\.JournalEntry\.[A-Za-z0-9]{16}\.JournalEntryPage\.[A-Za-z0-9]{16}#government-7\]\{7\}$/);
  assert.equal(codeLink("government", "Z"), "Z");
  assert.equal(codeLink("nothing", "1", "x"), "x");
  const u = uwpLinks({ starport: "B", size: 10, atmosphere: 6, hydrographics: 10, population: 7, government: 4, law: 3, tl: 9 });
  assert.equal(u.replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1"), "BA6A743-9");
});

test("world code links: World Codes content matches the world tables", () => {
  const h = name => headings.get(name);
  const norm = s => s.replace(/\s*-\s*/g, "-").replace(/&amp;/g, "&");
  world.ATMOSPHERE.forEach((a, i) => assert.equal(h("Atmosphere").get(`atmosphere-${toHex(i)}`), `${toHex(i)}: ${a.name}`));
  world.GOVERNMENT.forEach((g, i) => assert.equal(h("Government").get(`government-${toHex(i)}`), `${toHex(i)}: ${g.name}`));
  world.POPULATION.forEach((p, i) => assert.equal(h("Population").get(`population-${toHex(i)}`), `${toHex(i)}: ${p.inhabitants}`));
  world.HYDRO.forEach((x, i) => assert.equal(norm(h("Hydrographics").get(`hydrographics-${toHex(i)}`)), `${toHex(i)}: ${x.percent}`));
  world.SIZE.forEach((x, i) => assert.equal(h("Size").get(`size-${toHex(i)}`), `${toHex(i)}: ${x.diameter}`));
  for (const [c, sp] of Object.entries(world.STARPORTS)) assert.equal(h("Starport").get(`starport-${c}`), `${c}: ${sp.quality}`);
  for (const [, , t] of world.TEMPERATURE) assert.equal(h("Temperature").get(`temperature-${t.type}`), t.type);
  for (const sp of Object.values(world.STARPORTS)) for (const [code] of sp.bases) assert.ok(h("Bases").has(`base-${code}`), `base ${code}`);
  assert.equal(world.TECH_ERAS.length, h("Tech Level").size);
  for (let i = 0; i <= 15; i++) assert.ok(h("Law Level").has(`law-${toHex(i)}`));
});
