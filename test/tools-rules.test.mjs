import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDice, scriptedDie, seededDie, randomDie, parseBookDice, band } from "../module/shared/dice.mjs";
import * as time from "../module/tools/rules/time.mjs";
import * as world from "../module/tools/rules/world.mjs";
import * as subsector from "../module/tools/rules/subsector.mjs";
import * as npc from "../module/tools/rules/npc.mjs";
import * as patron from "../module/tools/rules/patron.mjs";
import * as starport from "../module/tools/rules/starport.mjs";
import * as trade from "../module/tools/rules/trade.mjs";
import * as space from "../module/tools/rules/space.mjs";
import * as planet from "../module/tools/rules/planetside.mjs";
import * as animals from "../module/tools/rules/animals.mjs";
import * as survival from "../module/tools/rules/survival.mjs";
import * as oracle from "../module/tools/rules/oracle.mjs";

const scripted = faces => {
  const die = scriptedDie(faces);
  const d = makeDice(die);
  d.done = () => assert.equal(die.remaining(), 0, "all scripted faces used");
  return d;
};

/** A seeded random source so the smoke loops are reproducible. */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test("dice: book notation", () => {
  assert.deepEqual(parseBookDice("2D-7").map(t => t.kind), ["dice", "const"]);
  const d = scripted([3, 4, 2, 3, 5]);
  assert.equal(d.roll("2D-7"), 0);
  assert.equal(d.roll("D3+3"), 5);
  assert.equal(d.roll("1D3+3"), 6);
  assert.equal(d.roll("1D"), 5);
  d.done();
  assert.throws(() => parseBookDice("2X"));
});

test("dice: d66 tens DM and clamping", () => {
  assert.equal(scripted([6, 4]).d66(5, { minTens: 0, maxTens: 9 }), 94);
  assert.equal(scripted([1, 4]).d66(-5, { minTens: 0, maxTens: 9 }), 4);
  assert.equal(scripted([1, 2]).d66(-3), 12);
  assert.equal(scripted([2, 5]).d66Range(3, 5), 45);
  assert.equal(scripted([3, 6]).d36(), 36);
  assert.equal(band([[null, 2, "a"], [3, null, "b"]], -4), "a");
});

test("time: dates, intervals, month boundaries", () => {
  assert.equal(time.toDate(0).totalDays, 1);
  const d = time.toDate(time.MONTH * 13 + time.DAY * 2 + 3600 * 5, 1105);
  assert.deepEqual([d.year, d.month, d.day, d.hour], [1106, 2, 3, 5]);
  assert.deepEqual(time.monthsCrossed(time.MONTH - 10, time.MONTH * 3), [1, 2, 3]);
  assert.deepEqual(time.monthsCrossed(0, time.DAY), []);
  assert.equal(time.intervalSeconds("1Dd", scripted([3])).seconds, 3 * time.DAY);
  assert.equal(time.intervalSeconds("10s").seconds, 10);
  assert.equal(time.dayPart(time.HOUR * 13), "Afternoon");
  assert.match(time.monthlyReminders(12).items.at(-1), /Yearly maintenance/);
  assert.equal(time.monthlyReminders(1, [{ name: "Scout", finances: { mortgage: 100, crewSalaries: 50 } }]).ships[0].total, 150);
  assert.equal(time.formatDuration(time.DAY + 6 * time.HOUR), "1 day, 6 h");
});

test("world: full main world from scripted dice (p.90-95)", () => {
  const d = scripted([4, 4, 3, 4, 3, 4, 4, 5, 2, 2, 3, 3, 5, 5, 4, 4, 1, 1, 6, 3, 2, 2, 2, 5, 3, 4]);
  const w = world.generateWorld(d, { name: "Testa", hex: "0205" });
  d.done();
  assert.equal(w.uwp, "B666743-9");
  assert.deepEqual(w.bases, ["M", "S"]);
  assert.equal(w.highport, false);
  assert.equal(w.berthing, 1000);
  assert.deepEqual(w.tradeCodes, ["Ag", "Ri"]);
  assert.equal(w.zone, "");
  assert.equal(w.temperature.type, "Temperate");
  assert.equal(w.line, "Testa 0205 B666743-9 MS Ag Ri");
});

test("world: size 0-1 forces hydrographics 0 and the minimum TL (p.91, p.94)", () => {
  // size 2D-2 = 0, atm 2D-7+0 = 0, hydro rolled but forced 0, pop 2D-2 = 5, gov 2D-7+5 = 3,
  // law 2D-7+3 = 1, starport 2D = 7 (C), bases M 10 / S 9, highport 10, berthing 1D, TL 1D.
  const d = scripted([1, 1, 1, 1, 6, 6, 3, 4, 2, 3, 2, 3, 3, 4, 1, 1, 1, 1, 1, 1, 1, 1, 3, 4]);
  const w = world.generateWorld(d);
  d.done();
  assert.equal(w.size, 0);
  assert.equal(w.hydrographics, 0);
  // TL: 1D 1 + starport C 2 + size 2 + atm 1 + hydro 1 + pop 1 + gov 0 = 8, the minimum for atm 0.
  assert.equal(w.tl, 8);
  assert.ok(w.tradeCodes.includes("As") && w.tradeCodes.includes("Va"));
});

test("world: trade codes, zones, temperature and tech DMs", () => {
  const base = { size: 8, atmosphere: 6, hydrographics: 7, population: 9, government: 4, law: 3, tl: 12, starport: "A" };
  assert.deepEqual(world.tradeCodes(base), ["Ht"]);
  assert.deepEqual(world.tradeCodes({ ...base, atmosphere: 7, population: 9 }), ["In", "Ht"]);
  assert.deepEqual(world.tradeCodes({ ...base, atmosphere: 3, hydrographics: 10, population: 6, tl: 9 }), ["Ni", "Wa"]);
  assert.ok(world.tradeCodes({ ...base, atmosphere: 2, hydrographics: 0, population: 3, tl: 4 }).includes("De"));
  assert.ok(world.tradeCodes({ ...base, atmosphere: 2, hydrographics: 0, population: 3, tl: 4 }).includes("Lt"));
  assert.equal(world.travelZone({ ...base, atmosphere: 11 }), "A");
  assert.equal(world.travelZone({ ...base, government: 7, law: 9 }), "A");
  assert.equal(world.travelZone({ ...base, government: 7, law: 4 }), "");
  assert.equal(world.travelZone({ ...base, tl: 4, starport: "X" }), "R");
  assert.equal(world.temperatureDM(11), 6);
  assert.equal(world.temperatureDM(14), -1);
  assert.deepEqual(world.techDMs({ starport: "X", size: 1, atmosphere: 12, hydrographics: 10, population: 10, government: 13 }),
    { starport: -4, size: 2, atmosphere: 1, hydrographics: 2, population: 4, government: -2 });
  assert.equal(world.minimumTL(11), 9);
  assert.equal(world.starportDM(2), -2);
  assert.equal(world.lawBans(3).armour.join(", "), "Battle dress, Combat armour");
});

test("world: star system code and subsector presence (p.88)", () => {
  const d = makeDice(randomDie(seeded(7)));
  const w = world.generateStarSystem(d, { hex: "0305" });
  assert.match(w.system.code, /^0305-[MKGFA][0-9A-Z]{3}$/);
  assert.equal(w.system.count, w.system.objects.length + 1);
  const s = subsector.generateSubsector(makeDice(randomDie(seeded(3))), { name: "Testing" });
  assert.equal(s.hexes.length, 80);
  assert.equal(s.worlds.length, s.hexes.filter(h => h.kind === "inhabited").length);
  for (const h of s.hexes) assert.equal(h.kind, h.roll >= 4 ? "inhabited" : h.roll >= 1 ? "empty" : "uninhabited");
  assert.ok(s.worlds.some(w2 => w2.capital));
  assert.equal(subsector.hexDistance({ col: 1, row: 1 }, { col: 1, row: 4 }), 3);
});

test("npc: NPC table DMs, random NPC table, information (p.56-59)", () => {
  assert.equal(npc.npcPopulationDM(1) + npc.npcGovernmentDM(0), -5);
  const t = npc.rollNpcType(scripted([1, 4]), { pop: 1, gov: 0 });
  assert.equal(t.code, 4);
  assert.equal(t.type, "Scavenger");
  assert.equal(npc.rollNpcType(scripted([6, 1]), { pop: 10, gov: 14 }).type, "Military Officer");
  const r = npc.rollRandomNpc(scripted([2, 3, 3, 4, 6, 6]), { range: [3, 5] });
  assert.equal(r.code, 43);
  assert.equal(r.who, "Docked Pirates");
  assert.equal(r.count, 7);
  assert.equal(r.reaction.label, "Agreeable");
  assert.deepEqual(npc.parseRange("31-56"), [3, 5]);
  assert.equal(npc.parseRange("D36"), "D36");
  const info = npc.rollInformation(scripted([3, 4, 2, 4, 6, 3, 2]));
  assert.equal(info.count, 2);
  assert.equal(info.pieces[0].detail, "Secretive job rumour");
  assert.equal(info.pieces[1].type, "Job Information");
  assert.equal(info.pieces[1].detail, "Fact about a place");
  assert.equal(npc.rollDemeanour(scripted([1, 1])).label, "Hostile");
  assert.deepEqual(npc.rollCharacteristics(scripted([3, 3, 4, 4, 5, 5]), { hits: 6 }), { str: 6, dex: 6, end: 6, int: 6, edu: 8, soc: 10 });
});

test("patron: objectives, colonies, and the full result (p.50-55)", () => {
  const o = patron.rollObjective(scripted([1, 2, 2, 6]), "assault");
  assert.equal(o.text, "Break into secure location to: Collect intel");
  assert.equal(patron.rollObjective(scripted([6, 6]), "novelty").text, "Impersonate VIP to gather intel or spread rumors");
  const c = patron.rollColony(scripted([5, 5, 6, 6, 2, 1, 1, 4]));
  assert.equal(c.runner, "Political/Philosophical Ideology");
  assert.equal(c.age, "2 centuries");
  assert.equal(c.population, 200);
  const d = makeDice(randomDie(seeded(11)));
  for (let i = 0; i < 300; i++) {
    const r = patron.generatePatron(d, { location: "streets", starport: "A" });
    assert.ok(r.patron.code >= 11 && r.patron.code <= 26, `streets range ${r.patron.code}`);
    assert.ok(r.job.terms.weeks >= 1);
    if (r.job.payment.total !== null && r.job.payment.total !== undefined) assert.ok(r.job.payment.total > 0);
    const e = patron.generatePatron(d, { location: "elite" });
    assert.ok(e.patron.code >= 61);
  }
  const chase = patron.generatePatron(makeDice(randomDie(seeded(5))), { location: "criminal" });
  assert.ok(chase.job.complication.who);
});

test("starport and settlement encounters (p.60-61, p.102-103)", () => {
  const legal = starport.starportEncounter(scripted([1, 3, 3]), { world: { starport: "C", gov: 4, law: 4 }, lowestSoc: 7 });
  assert.equal(legal.legal, true);
  assert.equal(legal.avoid.avoided, true);
  const r = starport.starportEncounter(scripted([4, 6, 6, 1, 2, 3, 3, 4, 4]), { world: { starport: "A", gov: 13, law: 4 } });
  assert.equal(r.dm, 5);
  assert.equal(r.code, 96);
  assert.equal(r.range, "Oppressive");
  assert.equal(r.npc.who, "Police");
  assert.equal(r.npc.count, 6);
  assert.equal(starport.starportGovernmentDM(2), -1);
  assert.equal(starport.settlementLawDM(9), 4);
  const s = starport.settlementEncounter(scripted([2, 2, 3, 3]), { world: { pop: 6, law: 5 }, checkLegal: true });
  assert.equal(s.legal.encounter, true);
  const s2 = starport.settlementEncounter(scripted([1, 6]), { world: { pop: 2, law: 0 } });
  assert.equal(s2.code, 6);
  const d = makeDice(randomDie(seeded(2)));
  for (let i = 0; i < 300; i++) {
    const x = starport.starportEncounter(d, { world: { starport: "X", gov: 0, law: 0 } });
    assert.ok(x.text);
    const y = starport.settlementEncounter(d, { world: { pop: 12, law: 12 }, checkLegal: true });
    assert.ok(y.text);
  }
});

test("trade: tables, DMs, prices, negotiation (p.62-65)", () => {
  assert.equal(trade.normalizeCode("TE"), "Ht");
  assert.deepEqual(trade.parseCodes("ag ni, Ri"), ["Ag", "Ni", "Ri"]);
  assert.equal(trade.TRADE_GOODS.length, 42);
  const electronics = trade.goodByCode(11);
  assert.equal(trade.tradeDM(electronics, ["In", "Ht"]), 5);
  assert.equal(trade.tradeDM(electronics, ["Ni", "Po"], "sale"), 3);
  assert.equal(trade.priceFor(7).purchase, 100);
  assert.equal(trade.priceFor(-3).purchase, 300);
  assert.equal(trade.priceFor(20).sale, 300);
  const p = trade.rollPrice(scripted([3, 3]), { good: electronics, codes: ["In"], brokerDM: 1, sellerBroker: 2, tons: 10 });
  assert.equal(p.total, 7);
  assert.equal(p.cost, 20000);
  // Zolan's example (p.65): 120% offer (row 6), counter at 80% (row 9), Intrigued, Broker 1.
  const n = trade.negotiate(scripted([4, 6]), { good: electronics, currentRow: 6, targetRow: 9, brokerDM: 1, opinion: { label: "Intrigued", dm: 1 } });
  assert.equal(n.stepDM, -3);
  assert.equal(n.total, 9);
  assert.equal(n.success, true);
  assert.equal(n.percent, 80);
  assert.equal(trade.brokerFee(2, 10000), 1000);
  assert.ok(trade.isAvailable(trade.goodByCode(26), ["Wa"]));
  assert.ok(!trade.isAvailable(trade.goodByCode(26), ["In"]));
  const g = trade.goodsAvailable(makeDice(randomDie(seeded(4))), { codes: ["In", "Ri"], pop: 3 });
  assert.equal(g.local.length, 0);
  assert.ok(g.list.slice(0, 6).every((x, i) => x.code === 11 + i));
  const f = trade.rollFreight(scripted([1, 2, 3]), { destinationPop: 3 });
  assert.equal(f.totalTons, 30);
  assert.equal(f.totalPay, 30000);
  const pax = trade.rollPassengers(scripted([6, 6, 6, 6, 6, 2, 1, 1, 1, 1, 1, 1, 1]), { originPop: 10, destinationPop: 9, zone: "A" });
  assert.equal(pax.dm, 0);
  assert.equal(pax.high.count, 18);
  assert.equal(pax.middle.count, 15);
  assert.equal(pax.low.count, 6);
  assert.equal(trade.rollPassengers(makeDice(randomDie()), { originPop: 0 }).total, 0);
  assert.equal(trade.rollMail(scripted([3, 3]), { subsidised: true }).success, true);
  assert.equal(trade.supplierDM({ starport: "A", extraLeads: 2 }), 4);
  assert.equal(trade.terminalAllowed({ starport: "B", tl: 7 }), false);
});

test("space encounters (p.80-82)", () => {
  const none = space.spaceEncounter(scripted([6]), { location: "wild" });
  assert.equal(none.encounter, false);
  const r = space.spaceEncounter(scripted([1, 6, 6, 1, 1, 4, 1, 3, 3, 3, 5, 5]), { location: "highport", force: true });
  assert.equal(r.type.label, "Space ship, helpful");
  assert.equal(r.number, 2);
  assert.equal(r.result.code, 41);
  assert.equal(r.result.tons, 300);
  assert.equal(r.reaction.hail, "No Response");
  assert.equal(r.reaction.behaviour, "Evasive");
  const env = space.spaceEncounter(scripted([5]), { location: "border" });
  assert.equal(env.encounter, false);
  const s = space.shipReaction(scripted([6, 6, 1, 1, 2, 3, 1, 1, 3, 5]), { scanning: true, militarySensors: true });
  assert.equal(s.hail, "Interested");
  assert.equal(s.behaviour, "Aggressive");
  assert.equal(s.condition, "Has some hull damage");
  assert.equal(s.flags.length, 2);
  const d = makeDice(randomDie(seeded(9)));
  for (let i = 0; i < 300; i++) for (const loc of Object.keys(space.SPACE_LOCATIONS)) space.spaceEncounter(d, { location: loc, force: true });
});

test("planetside: weather, travel, encounters (p.96-104)", () => {
  const w = planet.rollWeather(scripted([3, 4, 4]), { temperature: "Temperate", zone: "temperate" });
  assert.equal(w.type, "Average");
  assert.equal(w.detail, "Fog");
  const hot = planet.rollWeather(scripted([1, 1, 5, 5, 6]), { temperature: "Hot", zone: "polar" });
  assert.equal(hot.rerolls, 1);
  assert.equal(hot.type, "Warm Weather");
  assert.equal(hot.detail, "Precipitation");
  assert.equal(planet.rollWeather(scripted([1, 1, 1]), { temperature: "Frozen", zone: "hotWorld" }).invalidZone, true);
  const walk = planet.overlandTravel({ terrain: "forest", weather: { walkPenalty: -1 } });
  assert.equal(walk.km, 12);
  const car = planet.overlandTravel({ terrain: "desert", mode: "vehicle", speedBand: 4, gear: "high", road: "paved" });
  assert.equal(car.speedBand, 0);
  assert.equal(car.stopped, true);
  assert.equal(car.driveDM, 2);
  assert.equal(planet.overlandTravel({ terrain: "forest", mode: "vehicle", vehicleType: "water" }).impossible, true);
  const env = planet.rollEnvironment(scripted([3]), { atmosphere: 0 });
  assert.equal(env.text, "Extreme weather imminent");
  const uniq = planet.rollEnvironment(scripted([1, 3, 6]), { atmosphere: 12 });
  assert.equal(uniq.text, "Volcano: erupting");
  const loc = planet.rollLocation(scripted([6, 4, 5]), { pop: 10 });
  assert.equal(loc.code, 64);
  assert.equal(loc.people, 5000);
  const d = makeDice(randomDie(seeded(12)));
  for (let i = 0; i < 300; i++) for (const t of Object.keys(planet.PLANET_LOCATIONS)) planet.planetsideEncounter(d, { terrain: t, force: true, world: { pop: i % 13, atmosphere: i % 16 } });
});

test("alien animals (p.110-113)", () => {
  const a = animals.generateAnimal(scripted([3, 4, 2, 4, 2, 3, 4, 2]), { terrain: "open" });
  assert.equal(a.sizeLabel, "Medium");
  assert.equal(a.hits, 18);
  assert.equal(a.behaviour, "omnivore");
  assert.equal(a.characteristic, "Hunter");
  assert.deepEqual(a.traits, ["Flyer", "Pheromone"]);
  assert.equal(a.count, 8);
  const sub = animals.generateAnimal(scripted([6, 6, 1, 1, 3, 1, 1, 1, 6, 2, 3]), { terrain: "subterranean" });
  assert.equal(sub.sizeLabel, "Very Large");
  assert.deepEqual(sub.traitRolls, [4, -2, 4, 3]);
  assert.deepEqual(sub.traits, ["Alarm", "Psionic", "Poison"]);
  assert.equal(sub.psi, 5);
  assert.equal(sub.count, 3);
  const ch = animals.CHARACTERISTICS.carnivore[5];
  assert.equal(animals.animalReaction(scripted([1, 1]), ch).result, "Flees");
  assert.equal(animals.animalReaction(scripted([3, 3]), ch).result, "Fights");
  const d = makeDice(randomDie(seeded(13)));
  for (let i = 0; i < 300; i++) for (const t of Object.keys(animals.ANIMAL_TERRAIN)) assert.ok(animals.generateAnimal(d, { terrain: t }).traits.length >= 1);
});

test("survival (p.106-107)", () => {
  assert.equal(survival.bestCharacteristic(["end", "str"], { end: 5, str: 9 }), "str");
  assert.equal(survival.bestCharacteristic(["end", "str"], { end: 9, str: 9 }), "end");
  assert.equal(survival.activityDM("hunting", { terrain: "forest", weatherDM: -1 }), 1);
  assert.equal(survival.terrainSurvivalDM("vacuum", { inadequate: true }), -6);
  assert.equal(survival.forageAmount(scripted([4, 5]), { rank: 2, terrain: "arctic" }).amount, 6);
  const r = survival.rations({ people: 2, days: 3, pop: 12, hydro: 1 });
  assert.equal(r.foodCost, 20);
  assert.equal(r.waterCost, 20);
  assert.equal(r.total, 240);
});

test("solo oracle (not from the book)", () => {
  assert.equal(oracle.askOracle(scripted([3, 4])).answer, "No, but…");
  assert.equal(oracle.askOracle(scripted([3, 4]), { likelihood: "likely" }).answer, "Yes");
  const ev = oracle.askOracle(makeDice(randomDie(seeded(1))));
  assert.ok(ev.answer);
  const d = makeDice(randomDie(seeded(21)));
  for (let i = 0; i < 200; i++) assert.ok(oracle.randomEvent(d).detail);
});

test("fix: goods on offer equal the population code (p.63)", () => {
  // Book example: population 9 Industrial = 11-16 plus 3 Industrial goods, plus one D66 good.
  // Faces: three picks from the pool (1 each), then the D66 extra good (1, 1 = 11, already listed),
  // then the tons of the 9 goods (amount dice vary, so a seeded die rolls them).
  const picks = scriptedDie([1, 1, 1, 1, 1]);
  let n = 0;
  const tons = randomDie(seeded(5));
  const d = makeDice(sides => (n++ < 5 ? picks(sides) : tons(sides)));
  const g = trade.goodsAvailable(d, { codes: ["In"], pop: 9 });
  assert.equal(g.local.length, 3);
  assert.ok(g.local.every(x => trade.isAvailable(x, ["In"])));
  assert.equal(g.list.length, 9);
  assert.equal(trade.extraGoodsCount(9), 3);
  assert.equal(trade.extraGoodsCount(6), 0);
  // BOOK: below population 6 the location still offers 11-16.
  assert.equal(trade.extraGoodsCount(2), 0);
  const low = trade.goodsAvailable(makeDice(randomDie(seeded(6))), { codes: ["Ag"], pop: 2 });
  assert.deepEqual(low.common.map(x => x.code), [11, 12, 13, 14, 15, 16]);
  assert.equal(low.local.length, 0);
});

test("fix: colony rows 8-9 and 10-11 (p.55, p.102)", () => {
  // 2D 9 = Government, 2D 10 = the 10-11 row on every column.
  const c = patron.rollColony(scripted([4, 5, 5, 5, 2, 5, 5, 2]));
  assert.equal(c.runner, "Government");
  assert.equal(c.age, "5 decades");
  assert.equal(c.population, 10000);
  assert.equal(band(patron.COLONY_RUNNER, 10), "Political/Philosophical Ideology");
  assert.equal(band(patron.COLONY_POP, 9), 1000);
});

test("fix: size table uses the p.90 diameters", () => {
  assert.equal(world.SIZE[11].diameter, "17,600km");
  assert.equal(world.SIZE[12].diameter, "19,200km");
});

test("fix: a terrain penalty of -3 makes Speed Band 1 count as Top Gear (p.98)", () => {
  // Speed Band 5, High Gear (-1), forest (-3): band 1, so Top Gear DM -2 and its failure result.
  const hazard = planet.overlandTravel({ terrain: "forest", mode: "vehicle", speedBand: 5, gear: "high" });
  assert.equal(hazard.speedBand, 1);
  assert.equal(hazard.hazard, true);
  assert.equal(hazard.driveDM, -2);
  assert.equal(hazard.failure, planet.GEARS.top.failure);
  assert.equal(hazard.gear, "High Gear");
  // Same band 1 in shrubland (-1): no hazard, High Gear DM +0.
  const easy = planet.overlandTravel({ terrain: "shrubland", mode: "vehicle", speedBand: 3, gear: "high" });
  assert.equal(easy.speedBand, 1);
  assert.equal(easy.hazard, false);
  assert.equal(easy.driveDM, 0);
  // Band 2 in forest: the rule applies only at Speed Band 1.
  assert.equal(planet.overlandTravel({ terrain: "forest", mode: "vehicle", speedBand: 6, gear: "high" }).driveDM, 0);
});

test("fix: patron search target and SOC DM on the terms only (p.50, p.54)", () => {
  assert.equal(patron.FIND_PATRON_TARGET, 8);
  // Same dice with and without SOC DM: the demeanour is the same, the terms roll moves by the DM.
  const a = patron.generatePatron(makeDice(seededDie(5)), { socDM: 0 });
  const b = patron.generatePatron(makeDice(seededDie(5)), { socDM: 2 });
  assert.deepEqual(a.patron.demeanour, b.patron.demeanour);
  assert.equal(b.job.terms.roll - a.job.terms.roll, 2);
});

test("fix: subsector population DMs from the capital and routes (p.92)", () => {
  assert.deepEqual(subsector.subsectorPopDMs({ col: 2, row: 2 }, { capital: { col: 2, row: 3 }, routeWorlds: [] }), { capital: 1, capitalInSubsector: 2 });
  assert.deepEqual(subsector.subsectorPopDMs({ col: 5, row: 5 }, { capital: { col: 1, row: 1 }, routeWorlds: [{ col: 5, row: 6 }] }), { route: 1, capitalInSubsector: 2 });
  assert.deepEqual(subsector.subsectorPopDMs({ col: 5, row: 5 }, { capital: { col: 1, row: 1 }, primaryCapital: false }), {});
  for (const seed of [3, 9, 21]) {
    const s = subsector.generateSubsector(makeDice(randomDie(seeded(seed))), { density: "dense" });
    const cap = s.worlds.find(w => w.capital);
    assert.equal(s.worlds.filter(w => w.capital).length, 1);
    assert.equal(s.capital, cap.name);
    for (const w of s.worlds) {
      assert.equal(w.popDMs.capitalInSubsector, 2);
      assert.equal(w.popDMs.dense, 1);
      assert.equal(w.popDMs.capital === 1, subsector.hexDistance(w, cap) <= 1, `${w.hex} capital DM`);
      // A world with the route DM is within 1 parsec of a population 6+ world.
      if (w.popDMs.route) assert.ok(s.worlds.some(o => o !== w && o.population >= 6 && subsector.hexDistance(w, o) <= 1), `${w.hex} route DM`);
    }
  }
});
