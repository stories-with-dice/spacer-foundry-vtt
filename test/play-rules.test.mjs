import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rangeBandForDistance, rangeDM, normalizeRange, defenceDM, parseTraits, countDice, hasDamage, pierceArmour,
  attackModifiers, damageBonus, moraleThreshold
} from "../module/play/rules/combat.mjs";
import { distributeDamage, injuryState, creatureState, armourReaction } from "../module/play/rules/injury.mjs";
import {
  encumbrance, naturalHealing, healPoints, psiCap, recoverPsi, psiRangeCost, parsePsiCost, parseTarget,
  drugEffect, fallDamage, trainingFor
} from "../module/play/rules/character.mjs";

/** A 1D roller that returns the given faces in turn. */
const dice = (...faces) => () => faces.shift();

test("range band from distance (p.43)", () => {
  assert.equal(rangeBandForDistance(0.5), "close");
  assert.equal(rangeBandForDistance(1), "short");
  assert.equal(rangeBandForDistance(5), "short");
  assert.equal(rangeBandForDistance(6), "medium");
  assert.equal(rangeBandForDistance(50), "medium");
  assert.equal(rangeBandForDistance(250), "long");
  assert.equal(rangeBandForDistance(400), "veryLong");
  assert.equal(rangeBandForDistance(900), "distant");
  assert.equal(rangeBandForDistance(5000), "beyond");
});

test("weapon range table (p.43)", () => {
  assert.equal(rangeDM("close", "close"), 1);
  assert.equal(rangeDM("close", "medium"), null);
  assert.equal(rangeDM("short", "medium"), -1);
  assert.equal(rangeDM("medium", "short"), 1);
  assert.equal(rangeDM("medium", "distant"), -4);
  assert.equal(rangeDM("long", "medium"), 1);
  assert.equal(rangeDM("VL", "long"), 1);
  assert.equal(rangeDM("veryLong", "distant"), -1);
  assert.equal(rangeDM("medium", "beyond"), null);
  assert.equal(normalizeRange("Very Long"), "veryLong");
  assert.equal(normalizeRange("M"), "medium");
});

test("position and cover stack, kneeling improves cover (p.42)", () => {
  assert.equal(defenceDM({ position: "standing", cover: "partial" }).total, -1);
  // The book example: kneeling behind partial cover -> -1 kneeling, cover counts as half (-2).
  assert.deepEqual(defenceDM({ position: "kneeling", cover: "partial" }), { position: -1, cover: -2, coverStep: "half", total: -3 });
  assert.equal(defenceDM({ position: "prone", cover: "none" }).total, -2);
  assert.equal(defenceDM({ position: "prone", cover: "absolute" }).cover, -4);
  assert.equal(defenceDM({ position: "standing", cover: "half", arching: true }).total, -1);
});

test("traits and dice", () => {
  assert.deepEqual(parseTraits(["Auto 2", "Piercing 1", "Two-Handed", "Slow-Reload", "Low-Tech"]),
    { auto: 2, piercing: 1, twoHanded: true, slowReload: true, lowTech: true });
  assert.equal(countDice("3D+3"), 3);
  assert.equal(countDice("D3+3"), 1);
  assert.equal(countDice("2D3"), 2);
  assert.equal(countDice("Special"), 0);
  assert.equal(hasDamage("Special"), false);
  assert.equal(hasDamage("2D"), true);
  assert.equal(pierceArmour(12, 2), 10);
  assert.equal(pierceArmour(9, 2), 8);
  assert.equal(pierceArmour(8, 2), 8);
});

test("attack modifiers (p.42-44)", () => {
  const { mods, total } = attackModifiers({ charDM: 1, skill: 1, ranged: true, aimed: false, range: -1, position: -1, cover: -2, overwatch: 7 });
  assert.equal(total, 1 + 1 - 2 - 1 - 1 - 2 + 5);
  assert.ok(mods.find(m => m.key === "hip"));
  assert.equal(attackModifiers({ skill: -3 }).mods[0].key, "untrained");
  assert.equal(attackModifiers({ thrown: true, strDM: 1, defending: 2, fatigued: true }).total, 1 - 2 - 2);
  assert.equal(attackModifiers({ ranged: false, aimed: false }).total, 0);
});

test("damage bonus: effect, STR DM for melee, auto single target", () => {
  assert.equal(damageBonus({ effect: 1, melee: true, strDM: 0 }).total, 1);
  assert.equal(damageBonus({ effect: 2, melee: true, strDM: 1 }).total, 3);
  assert.equal(damageBonus({ effect: 0, autoSingle: 2 }).total, 2);
  assert.equal(damageBonus({ effect: 3, strDM: 2 }).total, 3);
});

test("damage: END first, overflow split DEX/STR (p.43)", () => {
  const r = distributeDamage({ str: 7, dex: 8, end: 6 }, 10, dice(1));
  assert.deepEqual(r.after, { str: 5, dex: 6, end: 0 });
  // Odd overflow: 1D odd gives the extra point to STR.
  const odd = distributeDamage({ str: 7, dex: 8, end: 6 }, 9, dice(3));
  assert.deepEqual(odd.after, { str: 5, dex: 7, end: 0 });
  const even = distributeDamage({ str: 7, dex: 8, end: 6 }, 9, dice(4));
  assert.deepEqual(even.after, { str: 6, dex: 6, end: 0 });
  assert.deepEqual(distributeDamage({ str: 7, dex: 8, end: 6 }, 4).after, { str: 7, dex: 8, end: 2 });
});

test("damage: later hits go to STR on odd, DEX on even, and spill over", () => {
  assert.deepEqual(distributeDamage({ str: 7, dex: 8, end: 0 }, 3, dice(5)).after, { str: 4, dex: 8, end: 0 });
  assert.deepEqual(distributeDamage({ str: 7, dex: 8, end: 0 }, 3, dice(2)).after, { str: 7, dex: 5, end: 0 });
  const r = distributeDamage({ str: 2, dex: 8, end: 0 }, 5, dice(1));
  assert.deepEqual(r.after, { str: 0, dex: 5, end: 0 });
  assert.equal(r.randomTo, "str");
  const dead = distributeDamage({ str: 1, dex: 1, end: 0 }, 10, dice(1));
  assert.deepEqual(dead.after, { str: 0, dex: 0, end: 0 });
  assert.equal(dead.wasted, 8);
});

test("injury states", () => {
  assert.equal(injuryState({ str: 5, dex: 5, end: 0 }), "wounded");
  assert.equal(injuryState({ str: 0, dex: 5, end: 0 }), "unconscious");
  assert.equal(injuryState({ str: 0, dex: 0, end: 0 }), "dead");
  assert.equal(creatureState(18, 18), "healthy");
  assert.equal(creatureState(9, 18), "pinned");
  assert.equal(creatureState(4, 18), "unconscious");
  assert.equal(creatureState(0, 18), "dead");
});

test("Ablat and Reflec (p.34)", () => {
  assert.deepEqual(armourReaction({ traits: ["Absorbing"] }, { dice: 3 }), { negated: true, damageArmour: true, trait: "Absorbing" });
  assert.equal(armourReaction({ traits: ["Absorbing"] }, { dice: 1 }).negated, false);
  assert.equal(armourReaction({ traits: ["Absorbing"], damaged: true }, { dice: 3 }).negated, false);
  assert.equal(armourReaction({ traits: ["Reflective"] }, { energy: true, dice: 5 }).negated, true);
  assert.equal(armourReaction({ traits: ["Reflective"] }, { energy: false, dice: 3 }).negated, false);
  assert.equal(armourReaction(null, { dice: 3 }).negated, false);
});

test("morale thresholds (p.44)", () => {
  assert.equal(moraleThreshold(1, 8), null);
  assert.deepEqual(moraleThreshold(2, 8), { threshold: 25, dm: 0 });
  assert.deepEqual(moraleThreshold(4, 8), { threshold: 50, dm: -2 });
  assert.deepEqual(moraleThreshold(6, 8), { threshold: 75, dm: -4 });
});

test("encumbrance (p.41): Dmitri STR 8", () => {
  assert.equal(encumbrance(16, 8).level, "minimal");
  assert.equal(encumbrance(20, 8).level, "encumbered");
  assert.equal(encumbrance(30, 8).level, "overEncumbered");
  assert.equal(encumbrance(30, 8).canMelee, false);
  assert.equal(encumbrance(40, 8).level, "overloaded");
  assert.equal(encumbrance(20, 8).moveMult, 0.5);
});

test("healing (p.106)", () => {
  const c = { str: { value: 5, max: 7 }, dex: { value: 8, max: 8 }, end: { value: 2, max: 9 } };
  assert.deepEqual(naturalHealing(c, 1).after, { str: 6, dex: 8, end: 3 });
  assert.deepEqual(naturalHealing(c, 3, { medical: true }).after, { str: 7, dex: 8, end: 8 });
  assert.equal(naturalHealing({ ...c, end: { value: 0, max: 9 } }, 1).blocked, true);
  assert.deepEqual(healPoints(c, 9), { str: 7, dex: 8, end: 9 });
  assert.deepEqual(healPoints({ str: { value: 2, max: 7 }, dex: { value: 3, max: 8 }, end: { value: 8, max: 9 } }, 4), { str: 4, dex: 4, end: 9 });
});

test("PSI (p.114-115)", () => {
  assert.equal(psiCap({ str: 2, dex: 3, end: 2, int: 3 }), 10);
  assert.equal(psiCap({ str: 9, dex: 9, end: 9, int: 9 }), 15);
  assert.equal(recoverPsi(3, 8, 2), 5);
  assert.equal(recoverPsi(7, 8, 5), 8);
  assert.equal(recoverPsi(10, 8, 1), 10);
  assert.equal(psiRangeCost("telepathy", "medium"), 2);
  assert.equal(psiRangeCost("telekinesis", "veryLong"), 9);
  assert.equal(psiRangeCost("telekinesis", "distant"), null);
  assert.equal(psiRangeCost("teleportation", "close"), 1);
  assert.equal(psiRangeCost("awareness", "long"), 0);
  assert.equal(parsePsiCost("1+"), 1);
  assert.equal(parsePsiCost(""), 0);
  assert.equal(parseTarget("10+"), 10);
  assert.equal(parseTarget("-"), 8);
});

test("drugs, falling, training", () => {
  assert.equal(drugEffect("PSI-Double").psi, 6);
  assert.equal(drugEffect("PSI-Boost").psi, 3);
  assert.deepEqual(drugEffect("Combat"), { key: "combat", str: 2, end: 2 });
  assert.equal(drugEffect("Medical Slow").key, "medicalSlow");
  assert.equal(drugEffect("Slow Antidote").key, "antidote");
  assert.equal(drugEffect("Aspirin"), null);
  assert.equal(fallDamage(8, 3), "3D");
  assert.equal(fallDamage(2, 4), "2");
  assert.equal(fallDamage(5, 4), "2D3");
  assert.equal(fallDamage(12, 4), "6D");
  assert.deepEqual(trainingFor(0), { weeks: 8, target: 8, cost: 2500 });
  assert.deepEqual(trainingFor(2, { instructor: true }), { weeks: 12, target: 8, cost: 15000 });
});
