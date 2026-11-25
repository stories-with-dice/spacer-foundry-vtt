// Craft fixes: person damage, vehicle armour, missiles, armour layers in ship hits,
// untrained top-speed DM, and the flag migration. Pure rules, scripted dice.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../module/craft/rules/drives.mjs";
import * as S from "../module/craft/rules/space-combat.mjs";
import * as V from "../module/craft/rules/vehicles.mjs";
import { makeDice, scriptedDie } from "../module/shared/dice.mjs";
import { shipMigration, weaponMigration } from "../module/craft/migration.mjs";

const sys = (rating, damage = 0, destroyed = false) => ({ rating, value: 0, damage, destroyed });

test("vehicle weapon damage to a person is x6 per point; starship weapons chain to x36 (p.49)", () => {
  assert.equal(V.personDamage(2, "vehicle"), 12);
  assert.equal(V.personDamage(1, "starship"), 36);
  assert.equal(V.personDamage(5, "personal"), 5);
  assert.equal(V.toVehicleDamage(2, "starship"), 12);   // starship weapon vs vehicle (p.49)
});

test("vehicle armour: one point per location, hull first; rating used when no location is flagged (p.49)", () => {
  const afv = { interior: { value: 6, max: 6 }, drive: { value: 3, max: 3 }, handling: { value: 8, max: 8 }, hull: { value: 8, max: 8 }, weapon: { value: 1, max: 1 } };
  assert.deepEqual(V.armoredLocations(afv, 3), ["hull", "interior", "drive"]);
  assert.deepEqual(V.armoredLocations(afv, 0), []);
  // A vehicle without a weapon location does not spend armour on it.
  const car2 = { ...afv, weapon: { value: 0, max: 0 } };
  assert.deepEqual(V.armoredLocations(car2, 5), ["hull", "interior", "drive", "handling"]);
  // Flagged locations win over the rating.
  assert.deepEqual(V.armoredLocations({ ...afv, handling: { value: 8, max: 8, armored: true } }, 3), ["handling"]);
  // Hand-made vehicle: armour 3, nothing flagged -> a hull hit of 2 does 1.
  const r = V.applyVehicleDamage({ locations: structuredClone(afv), armor: 3, destroyed: false }, "hull", 2);
  assert.equal(r.state.locations.hull.value, 7);
  assert.ok(r.events.some(e => e.type === "armor" && e.absorbed === 1));
  // Handling is not armoured with armour 3: full damage.
  const h = V.applyVehicleDamage({ locations: structuredClone(afv), armor: 3, destroyed: false }, "handling", 2);
  assert.equal(h.state.locations.handling.value, 6);
});

test("missiles hit automatically unless the target evades; no Gunner roll (p.76, p.84-85)", () => {
  assert.equal(S.missileSalvo(6, 4), 4);
  assert.equal(S.missileSalvo(3, 2), 2);
  assert.equal(S.missileSalvo(2, 0), 0);
  assert.equal(S.missileEvadeDM({ thrust: 2, sandcaster: true }), 4);
  // No evade roll: every missile hits.
  assert.deepEqual(S.resolveMissiles({ shots: 3 }), { hit: true, evaded: false, jammed: false, damage: 3 });
  // Pilot rank 1 with 2 unused thrust rolls 3+2: 5 + 1 + 2 = 8, evaded.
  const dice = makeDice(scriptedDie([3, 2, 2, 2]));
  const evade = dice.twoD() + 1 + S.missileEvadeDM({ thrust: 2 });
  assert.equal(S.resolveMissiles({ shots: 3, evadeTotal: evade }).evaded, true);
  // Next roll 2+2: 4 + 1 + 2 = 7, the missiles hit.
  const fail = dice.twoD() + 1 + S.missileEvadeDM({ thrust: 2 });
  assert.deepEqual(S.resolveMissiles({ shots: 3, evadeTotal: fail }), { hit: true, evaded: false, jammed: false, damage: 3 });
  assert.equal(S.resolveMissiles({ shots: 2, jammed: true }).damage, 0);
});

test("ship hits step drives with the same armour layers as the derived data (p.77, p.86)", () => {
  // 100T with 3 armour layers performs as a 400T hull: lowest letter C, so a C drive is destroyed by one hit.
  const armor = { hull: 3 };
  const state = { tonnage: 100, hull: { value: 2, max: 2 }, jDrive: sys("A"), mDrive: sys("C"), power: sys("C"), fuel: { value: 0, max: 0 }, armor };
  const r = S.applyShipDamage(state, "mDrive", 1);
  assert.equal(r.state.mDrive.destroyed, true);
  assert.equal(D.engineering(r.state, 100, D.armorLayers(armor)).mDrive.destroyed, true);
  assert.equal(D.armorLayers({ hull: 1, mDrive: 2, bogus: 5 }), 3);
});

test("untrained operator: the top-speed DM floors the rank at 0 (p.46)", () => {
  assert.equal(V.topSpeedDM(4, 4, -3), -4);   // not -7: the roll adds the untrained -3 once
  assert.equal(V.topSpeedDM(4, 4, 0), -4);
  assert.equal(V.topSpeedDM(4, 4, 2), -2);
});

test("craft migration moves flags into system fields", () => {
  const ship = { flags: { spacer: { craft: { fuelHits: 2, unrefined: 1, mortgagePaid: 5, armor: { hull: 1, fuel: 2 }, design: {} } } } };
  const m = shipMigration(ship);
  assert.deepEqual(m.update, { "system.fuelHits": 2, "system.unrefined": true, "system.finances.mortgagePaid": 5, "system.armor.hull": 1, "system.armor.fuel": 2 });
  assert.deepEqual(m.unset.sort(), ["armor", "fuelHits", "mortgagePaid", "unrefined"]);
  assert.deepEqual(shipMigration({ flags: {} }).unset, []);
  assert.deepEqual(weaponMigration({ type: "shipWeapon", flags: { spacer: { craft: { disabled: true } } } }), { update: { "system.disabled": true }, unset: ["disabled"] });
  assert.deepEqual(weaponMigration({ type: "shipWeapon", flags: {} }).unset, []);
});
