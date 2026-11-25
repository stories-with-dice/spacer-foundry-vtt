import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDice, seededDie } from "../module/shared/dice.mjs";
import { generateSubsector, hexDistance } from "../module/tools/rules/subsector.mjs";
import * as layout from "../module/tools/scene/rules/layout.mjs";
import { worldType, worldMarkers, worldIcon, WORLD_ICONS, MARKER_ICONS } from "../module/tools/scene/rules/icons.mjs";
import { selectRoutes, trimSegment, ROUTE_MAX } from "../module/tools/scene/rules/routes.mjs";
import { normalizeWorld, planScene, hexNumbers, worldLabel } from "../module/tools/scene/rules/plan.mjs";
import { starfield } from "../module/tools/scene/rules/starfield.mjs";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const S = 200;
const W = layout.hexWidth(S);

test("scene layout: hex centers follow the book's numbering (odd columns high)", () => {
  // 0101: grid column 1 (margin column 0), row index 1, not shifted.
  assert.deepEqual(layout.hexCenter(1, 1), { x: Math.round(W * 1.25), y: 200 });
  // 0201 sits half a hex lower than 0101 and 0301.
  assert.equal(layout.hexCenter(2, 1).y, 300);
  assert.equal(layout.hexCenter(3, 1).y, 200);
  assert.equal(layout.hexCenter(2, 1).x - layout.hexCenter(1, 1).x, Math.round(W * 2) - Math.round(W * 1.25));
  // 0810: column 8 is low, row 10.
  assert.deepEqual(layout.hexCenter(8, 10), { x: Math.round(W * (0.75 * 8 + 0.5)), y: 2100 });
  assert.deepEqual(layout.hexOffset(3, 4), { i: 4, j: 3 });
  // Neighbours in pixels are neighbours in parsecs: 0101-0201 and 0201-0102 are 1 parsec apart.
  for (const [a, b] of [[[1, 1], [2, 1]], [[2, 1], [1, 2]], [[2, 1], [3, 2]], [[4, 5], [5, 5]], [[5, 5], [4, 5]]]) {
    const pa = layout.hexCenter(...a), pb = layout.hexCenter(...b);
    assert.equal(hexDistance({ col: a[0], row: a[1] }, { col: b[0], row: b[1] }), 1);
    assert.ok(Math.abs(Math.hypot(pa.x - pb.x, pa.y - pb.y) - S) < 2, `${a} -> ${b} is one hex`);
  }
});

test("scene layout: size, corners, slots, and helpers", () => {
  const { width, height } = layout.sceneSize();
  assert.equal(width, Math.ceil(W * 7.75));
  assert.equal(height, 2400);
  const last = layout.hexCorners(8, 10);
  assert.ok(Math.max(...last.map(p => p[1])) <= height && Math.max(...last.map(p => p[0])) <= width);
  assert.equal(layout.GRID.type, 5);
  assert.deepEqual(layout.parseHex("0310"), { col: 3, row: 10 });
  assert.deepEqual(layout.parseUwp("BA6A743-9"), { starport: "B", size: 10, atmosphere: 6, hydrographics: 10, population: 7, government: 4, law: 3, tl: 9 });
  assert.equal(layout.parseUwp("bad"), null);
  assert.equal(layout.slugify("Tharsis Subsector!"), "tharsis-subsector");
  assert.equal(layout.slugify(""), "subsector");
  assert.equal(layout.seedOf("a"), layout.seedOf("a"));
  assert.notEqual(layout.seedOf("a"), layout.seedOf("b"));
  const slots = layout.hexSlots();
  // Every slot stays inside the hex (flat-topped: half width shrinks toward the top and bottom).
  const inside = ({ dx, dy }, pad = 0) => Math.abs(dy) + pad <= S / 2 && Math.abs(dx) + pad <= W / 2 - (W / 4) * (Math.abs(dy) / (S / 2));
  for (const s of [slots.icon, slots.capital, slots.starport, slots.gasGiant, ...slots.bases]) assert.ok(inside(s, 16), JSON.stringify(s));
  const nums = hexNumbers();
  assert.equal(nums.length, 80);
  assert.equal(nums[0].label, "0101");
  assert.equal(nums.at(-1).label, "0810");
});

test("scene icons: world type by UWP", () => {
  const w = (o) => ({ size: 6, atmosphere: 6, hydrographics: 6, population: 5, tradeCodes: [], ...o });
  assert.equal(worldType(w({ size: 0, atmosphere: 0, hydrographics: 0 })), "asteroid");
  assert.equal(worldType(w({ population: 9, tradeCodes: ["In"] })), "industrial");
  assert.equal(worldType(w({ population: 10 })), "highPop");
  assert.equal(worldType(w({ atmosphere: 11 })), "insidious");
  assert.equal(worldType(w({ atmosphere: 12 })), "insidious");
  assert.equal(worldType(w({ atmosphere: 10 })), "exotic");
  assert.equal(worldType(w({ atmosphere: 0, hydrographics: 0 })), "vacuum");
  assert.equal(worldType(w({ hydrographics: 10 })), "water");
  assert.equal(worldType(w({ atmosphere: 4, hydrographics: 0 })), "desert");
  assert.equal(worldType(w({ atmosphere: 3, hydrographics: 3, temperature: { type: "Frozen" } })), "ice");
  assert.equal(worldType(w({ atmosphere: 5, hydrographics: 4 })), "garden");
  assert.equal(worldType(w({ atmosphere: 9, hydrographics: 3 })), "world");
  assert.equal(worldIcon(w({ hydrographics: 10 })), "modules/game-icons-net/whitetransparent/waves.svg");
  const m = worldMarkers({ capital: true, system: { gasGiants: 2 }, bases: ["N", "S", "X"] });
  assert.deepEqual(m.map(x => x.kind), ["capital", "gasGiant", "base", "base"]);
  assert.deepEqual(m.filter(x => x.code).map(x => x.file), ["anchor", "telescope"]);
});

test("scene icons: every icon file exists in game-icons-net (when installed)", t => {
  const roots = [14, ""].map(v => `${homedir()}/Library/Application Support/FoundryVTT${v ? `-${v}` : ""}/Data/modules/game-icons-net/whitetransparent`);
  const root = roots.find(existsSync);
  if (!root) return t.skip("game-icons-net not installed here");
  for (const { file } of [...Object.values(WORLD_ICONS), ...Object.values(MARKER_ICONS)]) {
    assert.ok(readFileSync(`${root}/${file}.svg`, "utf8").includes("<svg"), file);
  }
});

test("scene routes: a spanning network of population 6+ worlds within 2 parsecs", () => {
  const w = (name, col, row, population) => ({ name, col, row, population });
  const worlds = [w("A", 1, 1, 7), w("B", 2, 1, 6), w("C", 3, 2, 8), w("D", 1, 5, 9), w("E", 5, 5, 5), w("F", 3, 1, 6), w("G", 1, 7, 6)];
  const routes = selectRoutes(worlds);
  const pairs = routes.map(r => `${r.from}-${r.to}`);
  // A, B, C, F are linked through 1-parsec links (A-B, B-F, B-C or C-F); one tree: 3 links.
  assert.ok(pairs.includes("A-B"));
  assert.ok(pairs.includes("B-F"));
  assert.equal(routes.filter(r => "ABCF".includes(r.from) && "ABCF".includes(r.to)).length, 3);
  // A-F is 2 parsecs, but A and F are already linked through B.
  assert.ok(!pairs.includes("A-F"));
  // D-G are 2 parsecs apart: linked. E has population 5.
  assert.ok(pairs.includes("D-G"));
  assert.ok(!pairs.some(p => p.includes("E")));
  assert.ok(routes.every(r => r.distance <= ROUTE_MAX));
  assert.deepEqual(trimSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10), [10, 0, 90, 0]);
  assert.equal(trimSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 10), null);
});

test("scene plan: a generated subsector gives one world per note slot, routes, and labels", () => {
  const s = generateSubsector(makeDice(seededDie(42)), { name: "Plan Test", density: "dense" });
  const worlds = s.worlds.map(w => normalizeWorld({ name: w.name, hex: w.hex, uwp: w.uwp, zone: w.zone, capital: !!w.capital }, w));
  const plan = planScene({ ...s, worlds });
  assert.equal(plan.worlds.length, s.worlds.length);
  assert.equal(plan.grid.type, 5);
  assert.equal(plan.grid.units, "pc");
  for (const pw of plan.worlds) {
    const w = s.worlds.find(x => x.name === pw.name);
    const c = layout.hexCenter(w.col, w.row);
    assert.deepEqual(pw.center, c);
    assert.ok(pw.label.startsWith(`${w.name}\n${w.uwp}`));
    assert.equal(pw.starport.letter, w.starport);
    assert.equal(pw.markers.filter(m => m.kind === "base").length, w.bases.length);
    assert.equal(pw.tint, w.zone === "A" ? "#ffb020" : w.zone === "R" ? "#ff4040" : "#ffffff");
  }
  assert.equal(plan.worlds.filter(w => w.markers.some(m => m.kind === "capital")).length, 1);
  const expected = selectRoutes(worlds).length;
  assert.equal(plan.routes.length, expected);
  for (const r of plan.routes) assert.equal(r.points.length, 4);
  // From the overview summary alone (no full data), the UWP still gives the type.
  const n = normalizeWorld({ name: "X", hex: "0304", uwp: "C000000-0", zone: "" });
  assert.deepEqual([n.col, n.row, n.size], [3, 4, 0]);
  assert.equal(worldType(n), "asteroid");
  assert.equal(worldLabel({ name: "X", uwp: "C000000-0", tradeCodes: ["As"] }), "X\nC000000-0\nAs");
});

test("scene starfield: seeded and inside the picture", () => {
  const a = starfield(7, 400, 300);
  const b = starfield(7, 400, 300);
  assert.deepEqual(a, b);
  assert.equal(a.stars.length, Math.round(400 * 300 / 2500));
  assert.ok(a.stars.every(s => s.x >= 0 && s.x <= 400 && s.y >= 0 && s.y <= 300));
  assert.notDeepEqual(starfield(8, 400, 300).stars[0], a.stars[0]);
});
