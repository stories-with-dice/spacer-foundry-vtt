// Tests for the play rules fixes: vehicles as targets, thrown weapons, absolute results,
// encumbrance and melee, first aid, Reflec, and the melee range DM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scriptedDie } from "../module/shared/dice.mjs";
import { meleeRangeDM } from "../module/play/rules/combat.mjs";
import {
  targetDifficulty, damageToTarget, attackRangeDM, defaultAttackOptions, computeAttack, absoluteFailure
} from "../module/play/rules/attack.mjs";
import { armourReaction } from "../module/play/rules/injury.mjs";
import { canMelee, firstAidResult, needsSurgery } from "../module/play/rules/character.mjs";
import { taskOutcome, chance2D } from "../module/play/rules/task.mjs";

/** Roll 2D with a die and return the faces. */
const roll2D = die => [die(6), die(6)];

/** A person's attack context, as prepareAttack builds it (no Foundry documents). */
const personCtx = (over = {}) => ({
  dm: { str: 1, dex: 2 }, creature: false, skill: 1, melee: false, ranged: true, thrownWeapon: false, canThrow: false,
  range: "medium", band: "short", traits: {}, overwatch: 0, defending: 0, lowTech: false, heightened: false,
  baseDifficulty: 8, position: "standing", cover: "none", fatigued: false, ...over
});

test("vehicle target: 8+ to hit, 1 damage per personal weapon hit (p.49); starships take none", () => {
  assert.equal(targetDifficulty({ type: "vehicle", system: { armor: 3 } }), 8);
  assert.equal(targetDifficulty({ type: "ship", system: { armor: { hull: 2 } } }), 8);
  assert.equal(targetDifficulty({ type: "npc", system: { armor: { total: 10 } } }), 10);
  assert.equal(targetDifficulty({ type: "creature", system: { difficulty: 9 } }), 9);
  assert.equal(damageToTarget(11, { type: "vehicle" }), 1);
  assert.equal(damageToTarget(0, { type: "vehicle" }), 0);
  assert.equal(damageToTarget(11, { type: "ship" }), 0);
  assert.equal(damageToTarget(11, { type: "npc" }), 11);
  assert.equal(damageToTarget(11, null), 11);
});

test("thrown attacks use DEX and add the STR DM once, for Thrown and Throw (p.33)", () => {
  // A grenade-like item with the Thrown trait.
  const thrownCtx = personCtx({ thrownWeapon: true, range: "short", traits: { thrown: true } });
  const v1 = { ...defaultAttackOptions(thrownCtx), band: "short" };
  assert.equal(v1.characteristic, "dex");
  const c1 = computeAttack(thrownCtx, v1);
  assert.equal(c1.thrown, true);
  // DEX +2, skill +1, Thrown STR +1, short weapon at short +0.
  assert.equal(c1.total, 2 + 1 + 1);
  assert.equal(c1.mods.filter(m => m.value === 1 && m.key === "thrown").length, 1);

  // A dagger with the Throw trait, thrown.
  const daggerCtx = personCtx({ melee: true, ranged: false, canThrow: true, range: "short", traits: { throw: true } });
  const v2 = { ...defaultAttackOptions(daggerCtx), band: "short", throw: true };
  assert.equal(v2.characteristic, "dex");
  const c2 = computeAttack(daggerCtx, v2);
  assert.equal(c2.thrown, true);
  assert.equal(c2.total, c1.total);
});

test("snake eyes breaks a thrown blade, jams a gun (p.42)", () => {
  assert.equal(absoluteFailure({ melee: true }), "broken");
  assert.equal(absoluteFailure({ melee: true, thrownWeapon: false, reliable: false }), "broken");
  assert.equal(absoluteFailure({ melee: false }), "jammed");
  assert.equal(absoluteFailure({ melee: false, reliable: true }), null);
  assert.equal(absoluteFailure({ melee: false, thrownWeapon: true }), null);
});

test("over-encumbered characters cannot make melee attacks (p.41)", () => {
  assert.equal(canMelee("minimal"), true);
  assert.equal(canMelee("encumbered"), true);
  assert.equal(canMelee("overEncumbered"), false);
  assert.equal(canMelee("overloaded"), false);
});

test("absolute results: 2 always fails, 12 always succeeds (p.14, p.42)", () => {
  const die = scriptedDie([1, 1, 6, 6, 1, 1, 6, 6]);
  // Snake eyes with +10 DM against 8+.
  let faces = roll2D(die);
  assert.equal(taskOutcome({ faces, total: 2 + 10, target: 8, absolute: true }).success, false);
  // Boxcars with -10 DM against 12+.
  faces = roll2D(die);
  const box = taskOutcome({ faces, total: 12 - 10, target: 12, absolute: true });
  assert.equal(box.success, true);
  assert.equal(box.boxcars, true);
  // Setting off: the totals decide.
  faces = roll2D(die);
  assert.equal(taskOutcome({ faces, total: 12, target: 8, absolute: false }).success, true);
  faces = roll2D(die);
  assert.equal(taskOutcome({ faces, total: 2, target: 8, absolute: false }).success, false);
  assert.equal(die.remaining(), 0);
  assert.equal(chance2D(20, 8, { absolute: true }), 97);
  assert.equal(chance2D(-20, 8, { absolute: true }), 3);
  assert.equal(chance2D(20, 8), 100);
});

test("first aid: surgery when END and STR or DEX are 0; Medical Kit gives D3 END (p.106, p.37)", () => {
  const chars = (str, dex, end) => ({ str: { value: str, max: 8 }, dex: { value: dex, max: 8 }, end: { value: end, max: 7 } });
  assert.equal(needsSurgery(chars(0, 5, 0)), true);
  assert.equal(needsSurgery(chars(5, 0, 0)), true);
  assert.equal(needsSurgery(chars(5, 5, 0)), false);
  assert.equal(firstAidResult(chars(0, 5, 0)).surgery, true);
  assert.equal(firstAidResult(chars(0, 5, 0)).after, 0);
  assert.deepEqual(firstAidResult(chars(5, 5, 0)), { surgery: false, before: 0, after: 1, gained: 1, roll: null });
  const die = scriptedDie([3]);
  assert.deepEqual(firstAidResult(chars(5, 5, 0), { kit: true, die }), { surgery: false, before: 0, after: 3, gained: 3, roll: 3 });
  assert.equal(firstAidResult(chars(5, 5, 4), { kit: true, die: scriptedDie([2]) }).gained, 0);
});

test("Reflec deflects only energy hits of 2D-6D (p.34)", () => {
  const reflec = { traits: ["Reflective"] };
  assert.equal(armourReaction(reflec, { energy: true, dice: 2 }).negated, true);
  assert.equal(armourReaction(reflec, { energy: true, dice: 6 }).negated, true);
  assert.equal(armourReaction(reflec, { energy: true, dice: 1 }).negated, false);
  assert.equal(armourReaction(reflec, { energy: true, dice: 8 }).negated, false);
  assert.equal(armourReaction(reflec, { energy: false, dice: 3 }).negated, false);
});

test("melee range DM: +1 at Close for Close and Short weapons, blocked past reach (p.43)", () => {
  assert.equal(meleeRangeDM("short", "close"), 1);
  assert.equal(meleeRangeDM("short", "short"), 0);
  assert.equal(meleeRangeDM("close", "close"), 1);
  assert.equal(meleeRangeDM("close", "short"), null);
  assert.equal(meleeRangeDM("short", "medium"), null);
  assert.equal(attackRangeDM({ melee: true, range: "short", band: "close" }), 1);
  // A thrown melee weapon uses the Short row.
  assert.equal(attackRangeDM({ melee: true, thrown: true, range: "close", band: "medium" }), -1);
  const sword = personCtx({ melee: true, ranged: false, range: "short" });
  const atClose = computeAttack(sword, { ...defaultAttackOptions(sword), band: "close" });
  assert.equal(atClose.rangeDM, 1);
  assert.equal(computeAttack(sword, { ...defaultAttackOptions(sword), band: "medium" }).rangeDM, null);
});

test("starship target: a personal weapon deals no damage (book silent; ships have few hull points)", () => {
  assert.equal(damageToTarget(12, { type: "ship" }), 0);
  assert.equal(damageToTarget(12, { type: "vehicle" }), 1);
  assert.equal(damageToTarget(12, { type: "character" }), 12);
});
