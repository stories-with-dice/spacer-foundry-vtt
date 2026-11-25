/**
 * Vehicle actions (book p.46-49): driving checks with the top-speed DM, ramming, hit-and-run,
 * and offensive driving. Reads and writes vehicle actors and posts cards.
 */
import { rollTask, skillRank, rollBookDice } from "../play/api.mjs";
import { resolveActor } from "../shared/foundry.mjs";
import * as VR from "./rules/vehicles.mjs";
import { L, esc, li, card, crewFor, actorSync, hurtPerson } from "./common.mjs";
import { damageCraft } from "./damage.mjs";

/**
 * The operator of a vehicle and their rank in its skill (`system.skill`, e.g. "Drive (Civilian)",
 * else the skill from the traits, p.48). Untrained is -3. Synchronous, so the sheet can call it.
 * Called by vehicleSpeedDM, driveCheck, hitAndRun, and the vehicle sheet.
 * @param {Actor} vehicle
 * @param {Actor|string|null} [operator]  defaults to the first occupant
 * @returns {{actor: Actor|null, skill: string, rank: number}}
 */
export function operatorRank(vehicle, operator = null) {
  const op = actorSync(operator) ?? crewFor(vehicle);
  const fallback = VR.vehicleSkill(vehicle.system.traits, vehicle.system.category);
  const skill = vehicle.system.skill || `${fallback.skill} (${fallback.specialty})`;
  return { actor: op, skill, rank: op ? skillRank(op, skill) : -3 };
}

/**
 * Top-speed DM for the vehicle's current speed and its operator (book p.46). Untrained operators
 * count as rank 0 here; the roll applies the -3 once (see VR.topSpeedDM).
 * Called by driveCheck, hitAndRun, and the vehicle sheet.
 * @param {Actor} vehicle
 * @param {Actor|string|null} [operator]
 * @returns {number}
 */
export function vehicleSpeedDM(vehicle, operator = null) {
  const { rank } = operatorRank(vehicle, operator);
  const v = vehicle.system;
  return VR.topSpeedDM(Math.min(v.currentSpeed, v.effectiveSpeedBand), v.effectiveSpeedBand, rank);
}

/**
 * The operator's driving roll (DEX + skill) with the top-speed DM. Posts the task card unless
 * `chat: false`. Called by offensiveDriving, the vehicle sheet, and macros.
 * @param {Actor} vehicle
 * @param {{dm?: number, label?: string, operator?: Actor|string|null, chat?: boolean}} [o]
 * @returns {Promise<object>} the rollTask result
 */
export async function driveCheck(vehicle, { dm = 0, label = "", operator = null, chat = true } = {}) {
  const op = operatorRank(vehicle, operator);
  return rollTask({ actor: op.actor, characteristic: "dex", skill: op.skill, dm: (Number(dm) || 0) + vehicleSpeedDM(vehicle, operator), label: label || `${vehicle.name}: ${op.skill}`, chat });
}

/**
 * Ram (book p.49): the defender takes the speed band difference, the rammer half (rounded up).
 * With `apply`, both take the damage on a rolled location through damageCraft.
 * Called by the vehicle sheet.
 * @param {Actor} attacker  vehicle
 * @param {Actor} defender  vehicle
 * @param {{apply?: boolean}} [o]
 * @returns {Promise<{defender: number, attacker: number}>}
 */
export async function ram(attacker, defender, { apply = true } = {}) {
  const dmg = VR.ramDamage(attacker.system.currentSpeed, defender.system.currentSpeed);
  await card({ actor: attacker, title: L("Vehicle.ram"), body: li([`${esc(defender.name)}: ${dmg.defender}`, `${esc(attacker.name)}: ${dmg.attacker}`]) });
  if (apply) {
    if (dmg.defender) await damageCraft(defender, dmg.defender);
    if (dmg.attacker) await damageCraft(attacker, dmg.attacker);
  }
  return dmg;
}

/**
 * Hit-and-run (book p.49): the target makes a contested DEX check against the operator's Drive;
 * a pinned target (END 0) cannot dodge. On a hit the target takes 1D per speed band + 1 per tonne
 * (through the play area's applyDamage when `apply`). Ties go to the target.
 * Called by the vehicle sheet.
 * @param {Actor} vehicle
 * @param {Actor|string} target  character, NPC, or creature
 * @param {{apply?: boolean}} [o]
 * @returns {Promise<{hit: boolean, damage: number, dice: string}>}
 */
export async function hitAndRun(vehicle, target, { apply = true } = {}) {
  const t = await resolveActor(target);
  const op = operatorRank(vehicle);
  const drv = await rollTask({ actor: op.actor, characteristic: "dex", skill: op.skill, dm: vehicleSpeedDM(vehicle), label: `${L("Vehicle.hitAndRun")}: ${vehicle.name}` });
  const pinned = (t?.system?.characteristics?.end?.value ?? 1) <= 0;
  const dodge = pinned ? null : await rollTask({ actor: t, characteristic: "dex", label: `${L("Vehicle.dodge")}: ${t?.name ?? "?"}` });
  const hit = pinned || dodge.total < drv.total;
  const dice = VR.hitAndRunDice(vehicle.system.currentSpeed, vehicle.system.weightTons);
  let damage = 0;
  const notes = [pinned ? L("Vehicle.pinned") : `${drv.total} vs ${dodge.total}`];
  if (hit) {
    damage = (await rollBookDice(dice)).total;
    notes.push(L("Vehicle.runDown", { name: esc(t?.name), dice, damage }));
    if (apply && t && t.type !== "vehicle") notes.push(await hurtPerson(t, damage, "craft-hit-and-run"));
  } else notes.push(L("Vehicle.dodged", { name: esc(t?.name) }));
  await card({ actor: vehicle, title: L("Vehicle.hitAndRun"), body: li(notes) });
  return { hit, damage, dice };
}

/**
 * Offensive driving (book p.49): contested Drive checks, the attacker +1 DM per 2 tonnes heavier.
 * If the attacker loses, it drops speed bands equal to the difference. If the defender loses, it
 * makes a control check at -DM equal to the difference: failure spins out, natural 2 or less flips.
 * With `apply`, writes `system.currentSpeed` of the loser. Called by the vehicle sheet.
 * @param {Actor} attacker  vehicle
 * @param {Actor} defender  vehicle
 * @param {{apply?: boolean}} [o]
 * @returns {Promise<object>} the offensiveDrivingResult plus `outcome`
 */
export async function offensiveDriving(attacker, defender, { apply = true } = {}) {
  const weightDM = VR.offensiveDrivingDM(attacker.system.weightTons, defender.system.weightTons);
  const a = await driveCheck(attacker, { dm: weightDM, label: `${L("Vehicle.offensiveDriving")}: ${attacker.name}` });
  const b = await driveCheck(defender, { label: `${L("Vehicle.offensiveDriving")}: ${defender.name}` });
  const res = VR.offensiveDrivingResult(a.total, b.total);
  const notes = [`${a.total} vs ${b.total}`];
  let outcome = null;
  if (res.winner === "defender") {
    notes.push(L("Vehicle.attackerSlows", { name: esc(attacker.name), n: res.attackerSpeedLoss }));
    if (apply && res.attackerSpeedLoss) await attacker.update({ "system.currentSpeed": Math.max(0, attacker.system.currentSpeed - res.attackerSpeedLoss) });
  } else {
    const c = await driveCheck(defender, { dm: res.controlDM, label: `${L("Vehicle.keepControl")}: ${defender.name}` });
    outcome = VR.controlCheckOutcome(c.natural, c.total);
    notes.push(L(`Vehicle.outcome.${outcome}`, { name: esc(defender.name) }));
    if (apply && outcome !== "control") await defender.update({ "system.currentSpeed": 0 });
  }
  await card({ actor: attacker, title: L("Vehicle.offensiveDriving"), body: li(notes) });
  return { ...res, outcome };
}
