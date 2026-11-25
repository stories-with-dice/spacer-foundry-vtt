/**
 * Damage routing: craft damage goes to damageShip or damageVehicle; hits on people go to the
 * play area (game.spacer.play.applyDamage) after the book's conversion (p.49).
 */
import { applyDamage } from "../play/api.mjs";
import { personDamage } from "./rules/vehicles.mjs";
import { L, PERSON_TYPES } from "./common.mjs";
import { damageShip } from "./ship-damage.mjs";
import { damageVehicle } from "./vehicle-damage.mjs";

/**
 * Damage any craft: ships use damageShip, vehicles damageVehicle. Throws "Not a craft" for
 * other actors (use applyHit for weapon hits that may land on a person).
 * Called by applyHit, ram, and macros.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [opts]  passed on (location, source, chat)
 * @returns {Promise<object>} the result of damageShip or damageVehicle
 */
export async function damageCraft(actor, amount, opts = {}) {
  if (actor?.type === "ship") return damageShip(actor, amount, opts);
  if (actor?.type === "vehicle") return damageVehicle(actor, amount, opts);
  throw new Error("Not a craft");
}

/**
 * Apply a mounted-weapon hit to any target (book p.49).
 * - ship or vehicle: damageCraft (a vehicle converts starship damage x6 itself).
 * - character, NPC, or creature: personDamage (vehicle weapon x6 per point, starship x36) and then
 *   game.spacer.play.applyDamage, which writes the actor and posts the play damage card.
 * Called by fireWeapon (`apply: true`), missileImpact, and the craft-hit chat button.
 * Example: a Medium Turret (vehicle weapon) hits an NPC for 2: the NPC takes 12.
 * @param {Actor} target
 * @param {number} amount  damage as the weapon rolled it
 * @param {{source?: "vehicle"|"personal"|"starship", location?: string}} [o]
 * @returns {Promise<object>} the craft damage result, or `{ person: true, amount, result }`
 */
export async function applyHit(target, amount, { source = "vehicle", location = "" } = {}) {
  if (["ship", "vehicle"].includes(target?.type)) return damageCraft(target, amount, { location, source });
  if (!PERSON_TYPES.includes(target?.type)) throw new Error("Not a craft or a person");
  const n = personDamage(amount, source);
  const result = await applyDamage(target, n, { source: L(`Source.${source}`) });
  return { person: true, amount: n, result };
}
