import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDice, randomDie } from "../module/tools/rules/dice.mjs";
import * as cards from "../module/tools/cards.mjs";
import * as world from "../module/tools/rules/world.mjs";
import * as npc from "../module/tools/rules/npc.mjs";
import * as patron from "../module/tools/rules/patron.mjs";
import * as starport from "../module/tools/rules/starport.mjs";
import * as space from "../module/tools/rules/space.mjs";
import * as planet from "../module/tools/rules/planetside.mjs";
import * as animals from "../module/tools/rules/animals.mjs";
import * as trade from "../module/tools/rules/trade.mjs";
import * as oracle from "../module/tools/rules/oracle.mjs";
import { monthlyReminders } from "../module/tools/rules/time.mjs";

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Every card has a title and only string values in its rows. */
function check(card) {
  assert.ok(card.title);
  for (const sec of card.sections ?? []) for (const r of sec.rows ?? []) {
    assert.equal(typeof r.value, "string", `${card.title}: ${r.label}`);
    assert.ok(!r.value.includes("undefined"), `${card.title}: ${r.label} = ${r.value}`);
  }
  return card;
}

test("cards: every result type renders card data", () => {
  const d = makeDice(randomDie(seeded(42)));
  for (let i = 0; i < 100; i++) {
    check(cards.patronCard(patron.generatePatron(d, { location: Object.keys(patron.PATRON_LOCATIONS)[i % 6] })));
    check(cards.npcCard(npc.generateNpc(d, { world: { pop: i % 13, gov: i % 16 } })));
    check(cards.randomNpcCard(npc.rollRandomNpc(d)));
    check(cards.informationCard(npc.rollInformation(d)));
    check(cards.starportCard(starport.starportEncounter(d, { world: { starport: "B", gov: i % 16, law: i % 10 } })));
    check(cards.settlementCard(starport.settlementEncounter(d, { world: { pop: i % 13, law: i % 10 }, checkLegal: i % 2 === 0 })));
    check(cards.spaceCard(space.spaceEncounter(d, { location: Object.keys(space.SPACE_LOCATIONS)[i % 6] })));
    check(cards.shipReactionCard(space.shipReaction(d, { scanning: true, militarySensors: true }), { scanning: true }));
    check(cards.planetsideCard(planet.planetsideEncounter(d, { terrain: Object.keys(planet.PLANET_LOCATIONS)[i % 9], world: { pop: i % 13, atmosphere: i % 16 } })));
    check(cards.weatherCard(planet.rollWeather(d, { temperature: ["Frozen", "Cold", "Temperate", "Hot", "Boiling"][i % 5], zone: Object.keys(planet.ZONES)[i % 5] })));
    check(cards.travelCard(planet.overlandTravel({ terrain: Object.keys(planet.TERRAIN)[i % 9], mode: i % 2 ? "vehicle" : "walk" })));
    check(cards.animalCard(animals.generateAnimal(d, { terrain: Object.keys(animals.ANIMAL_TERRAIN)[i % 10] })));
    check(cards.freightCard(trade.rollFreight(d, { destinationPop: i % 10 })));
    check(cards.passengersCard(trade.rollPassengers(d, { originPop: i % 11 })));
    check(cards.mailCard(trade.rollMail(d)));
    check(cards.oracleCard(oracle.askOracle(d, { likelihood: "even" })));
    check(cards.eventCard(oracle.randomEvent(d)));
    const w = world.generateStarSystem(d, { hex: "0101" });
    check(cards.worldCard(w));
  }
  check(cards.clockCard({ date: "x", label: "1 day", delta: "1 day", reminders: monthlyReminders(12, [{ name: "Ship", finances: { mortgage: 1 } }]) }));
});

test("cards: world and subsector journal HTML", () => {
  const d = makeDice(randomDie(seeded(8)));
  const w = world.generateStarSystem(d, { name: "Ka<b>", hex: "0402" });
  const html = cards.worldPageHtml(w);
  assert.ok(html.includes(w.uwp));
  assert.ok(html.includes("Ka&lt;b&gt;"));
  assert.ok(html.startsWith('<div class="spacer spacer-world">'));
  const s = world.generateSubsector(d, { name: "Test Subsector" });
  const links = Object.fromEntries(s.worlds.map(x => [x.name, `JournalEntry.${x.name}`]));
  const sub = cards.subsectorPageHtml(s, links);
  assert.equal((sub.match(/<td class=/g) ?? []).length, 80);
  for (const x of s.worlds) assert.ok(sub.includes(`@UUID[JournalEntry.${x.name}]`));
  assert.equal(cards.cr(1234567), "1,234,567cr");
});
