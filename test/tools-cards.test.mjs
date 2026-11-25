import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDice, randomDie } from "../module/shared/dice.mjs";
import * as campaignCards from "../module/tools/cards/campaign.mjs";
import * as npcCards from "../module/tools/cards/npcs.mjs";
import * as encounterCards from "../module/tools/cards/encounters.mjs";
import * as planetCards from "../module/tools/cards/planetside.mjs";
import * as animalCards from "../module/tools/cards/animals.mjs";
import * as worldCards from "../module/tools/cards/worlds.mjs";
import * as pages from "../module/tools/cards/world-pages.mjs";
import * as tradeCards from "../module/tools/cards/trade.mjs";
import * as oracleCards from "../module/tools/cards/oracle.mjs";
import { clockCard } from "../module/tools/cards/clock.mjs";
import { cr } from "../module/tools/cards/common.mjs";
import * as subsector from "../module/tools/rules/subsector.mjs";
import * as survival from "../module/tools/rules/survival.mjs";
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
    check(campaignCards.patronCard(patron.generatePatron(d, { location: Object.keys(patron.PATRON_LOCATIONS)[i % 6] })));
    check(npcCards.npcCard(npc.generateNpc(d, { world: { pop: i % 13, gov: i % 16 } })));
    check(npcCards.randomNpcCard(npc.rollRandomNpc(d)));
    check(npcCards.informationCard(npc.rollInformation(d)));
    check(encounterCards.starportCard(starport.starportEncounter(d, { world: { starport: "B", gov: i % 16, law: i % 10 } })));
    check(encounterCards.settlementCard(starport.settlementEncounter(d, { world: { pop: i % 13, law: i % 10 }, checkLegal: i % 2 === 0 })));
    check(encounterCards.spaceCard(space.spaceEncounter(d, { location: Object.keys(space.SPACE_LOCATIONS)[i % 6] })));
    check(encounterCards.shipReactionCard(space.shipReaction(d, { scanning: true, militarySensors: true }), { scanning: true }));
    check(planetCards.planetsideCard(planet.planetsideEncounter(d, { terrain: Object.keys(planet.PLANET_LOCATIONS)[i % 9], world: { pop: i % 13, atmosphere: i % 16 } })));
    check(planetCards.weatherCard(planet.rollWeather(d, { temperature: ["Frozen", "Cold", "Temperate", "Hot", "Boiling"][i % 5], zone: Object.keys(planet.ZONES)[i % 5] })));
    check(planetCards.travelCard(planet.overlandTravel({ terrain: Object.keys(planet.TERRAIN)[i % 9], mode: i % 2 ? "vehicle" : "walk" })));
    check(animalCards.animalCard(animals.generateAnimal(d, { terrain: Object.keys(animals.ANIMAL_TERRAIN)[i % 10] })));
    check(tradeCards.freightCard(trade.rollFreight(d, { destinationPop: i % 10 })));
    check(tradeCards.passengersCard(trade.rollPassengers(d, { originPop: i % 11 })));
    check(tradeCards.mailCard(trade.rollMail(d)));
    check(oracleCards.oracleCard(oracle.askOracle(d, { likelihood: "even" })));
    check(oracleCards.eventCard(oracle.randomEvent(d)));
    const w = world.generateStarSystem(d, { hex: "0101" });
    check(worldCards.worldCard(w));
    check(planetCards.rationsCard(survival.rations({ people: 2, days: i + 1 }), { people: 2, days: i + 1 }));
    const goods = trade.goodsAvailable(d, { codes: ["In"], pop: i % 13 });
    check(tradeCards.goodsCard(goods, { name: "X", codes: ["In"] }));
    const price = { mode: "purchase", code: 11, name: "Electronics", world: "X", ...trade.rollPrice(d, { good: trade.goodByCode(11) }), fee: 0, perTonText: "1cr", costText: "1cr" };
    check(tradeCards.priceCard(price, { broker: 1, sellerBroker: 2, hired: 0 }));
    check(tradeCards.negotiationCard(trade.negotiate(d, { good: trade.goodByCode(11), currentRow: 6, targetRow: 8 }), price, 1));
  }
  check(clockCard({ date: "x", label: "1 day", delta: "1 day", reminders: monthlyReminders(12, [{ name: "Ship", finances: { mortgage: 1 } }]) }));
});

test("cards: world and subsector journal HTML", () => {
  const d = makeDice(randomDie(seeded(8)));
  const w = world.generateStarSystem(d, { name: "Ka<b>", hex: "0402" });
  const html = pages.worldPageHtml(w);
  // The UWP characters are content links (cards/world-links.mjs); their labels spell the UWP.
  assert.ok(html.replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1").includes(w.uwp));
  assert.ok(html.includes("Ka&lt;b&gt;"));
  assert.ok(html.startsWith('<div class="spacer spacer-world">'));
  const s = subsector.generateSubsector(d, { name: "Test Subsector" });
  const links = Object.fromEntries(s.worlds.map(x => [x.name, `JournalEntry.${x.name}`]));
  const sub = pages.subsectorPageHtml(s, links);
  check(worldCards.subsectorCard(s, { uuid: "JournalEntry.x" }));
  assert.ok(pages.worldPageHtml(s.worlds[0]).includes("Population DMs (p.92)"));
  assert.equal((sub.match(/<td class=/g) ?? []).length, 80);
  for (const x of s.worlds) assert.ok(sub.includes(`@UUID[JournalEntry.${x.name}]`));
  assert.equal(cr(1234567), "1,234,567cr");
});
