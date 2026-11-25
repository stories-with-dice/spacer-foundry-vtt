/**
 * Vehicle damage (book p.49): reads the vehicle actor, calls the pure rules in
 * rules/vehicle-damage.mjs, writes the actor, hurts the occupants, and posts a chat card.
 */
import * as VR from "./rules/vehicles.mjs";
import { L, esc, li, card, dice, crewActors, hurtPerson } from "./common.mjs";

/**
 * Card lines for the events of applyVehicleDamage; rolls occupant damage and explosion checks.
 * @returns {Promise<{notes: string[], exploded: boolean}>}
 */
async function eventNotes(actor, events) {
  const notes = [];
  const occupants = crewActors(actor);
  let exploded = false;
  for (const ev of events) {
    switch (ev.type) {
      case "armor": notes.push(L("Card.armorAbsorbs", { n: ev.absorbed })); break;
      case "occupants": {
        notes.push(L("Card.occupantsHit", { dice: ev.dice }));
        for (const o of occupants) notes.push(await hurtPerson(o, dice().roll(`${ev.dice}D`), "craft-interior"));
        break;
      }
      case "uncontrolled": notes.push(L("Status.uncontrolled")); break;
      case "immobile": notes.push(L("Status.immobile")); break;
      case "speedLoss": notes.push(L("Card.speedLoss", { n: ev.bands })); break;
      case "rangeLoss": notes.push(L("Card.rangeLoss", { n: ev.percent })); break;
      case "powerDestroyed": notes.push(L("Status.powerDestroyed")); break;
      case "hullCompromised": notes.push(L("Status.compromised")); break;
      case "weaponDisabled": {
        const w = actor.items.find(i => i.type === "shipWeapon" && !i.system.destroyed);
        if (w) await w.update({ "system.destroyed": true });
        notes.push(`${esc(w?.name ?? L("Loc.weapon"))}: ${L("Status.disabled")}`);
        break;
      }
      case "explosionCheck": {
        if (exploded) break;
        const r = dice().roll("1D");
        const boom = VR.explodes(r, ev.dm);
        notes.push(`${L("Card.explosionCheck", { roll: r, dm: ev.dm })}: ${boom ? `<strong>${L("Card.explodes")}</strong>` : L("Card.noExplosion")}`);
        if (boom) {
          exploded = true;
          for (const o of occupants) notes.push(await hurtPerson(o, dice().roll("6D"), "craft-explosion"));
        }
        break;
      }
    }
  }
  return { notes, exploded };
}

/**
 * Damage a vehicle (book p.49). Converts the damage by source (personal weapons deal 1, starship
 * weapons x6), rolls the 1D location (civilian or military table) unless `location` is given,
 * applies armour (flagged locations, or `system.armor` spread by VR.armoredLocations), transfers,
 * occupant damage, and explosion checks, writes `system.locations.*.value` and `system.destroyed`,
 * and posts a chat card. Called by damageCraft, applyHit, ram, and the vehicle sheet "Hit" button.
 * Example: an AFV (armour 3: hull, interior, drive) takes 2 on "drive": drive 3 -> 2.
 * @param {Actor} actor vehicle actor
 * @param {number} amount
 * @param {{location?: string, source?: "vehicle"|"personal"|"starship", chat?: boolean}} [opts]
 * @returns {Promise<{location: string, roll: number|null, points: number, log: object[], events: object[], exploded: boolean}>}
 */
export async function damageVehicle(actor, amount, { location = "", source = "vehicle", chat = true } = {}) {
  if (actor?.type !== "vehicle") throw new Error("damageVehicle needs a vehicle actor");
  const v = actor.system;
  const points = VR.toVehicleDamage(amount, source);
  let roll = null;
  if (!location) {
    roll = dice().roll("1D");
    location = VR.vehicleLocation(roll, v.isMilitary);
  }
  if (location === "weapon" && v.locations.weapon.max <= 0) location = "hull";
  const openRoll = v.isOpen && location === "interior" ? dice().roll("1D") : undefined;
  const before = { locations: foundry.utils.deepClone(v._source.locations), armor: v.armor, destroyed: v.destroyed };
  const { state, log, events } = VR.applyVehicleDamage(before, location, points, { open: v.isOpen, openRoll });

  const { notes, exploded } = await eventNotes(actor, events);
  const update = { "system.destroyed": !!state.destroyed || exploded };
  for (const [k, l] of Object.entries(state.locations)) update[`system.locations.${k}.value`] = l.value;
  await actor.update(update);
  if (chat) {
    const where = roll === null ? L("Card.calledShot") : `1D=${roll} (${L(v.isMilitary ? "Vehicle.military" : "Vehicle.civilian")})`;
    const conv = source !== "vehicle" ? ` ${L(`Source.${source}`)}: ${amount} → ${points}` : "";
    const body = `<p>${L("Card.hitFor", { amount: points, location: L(`Loc.${location}`) })} (${where})${conv}</p>${li(notes)}`;
    await card({ actor, title: L("Card.vehicleHit", { name: actor.name }), body });
  }
  return { location, roll, points, log, events, exploded };
}
