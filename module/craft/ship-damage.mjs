/**
 * Starship damage and repair (book p.85-87): reads the ship actor, calls the pure rules in
 * rules/ship-damage.mjs, writes the actor and its weapons, and posts a chat card.
 */
import { rollTask } from "../play/api.mjs";
import { resolveActor } from "../shared/foundry.mjs";
import * as SC from "./rules/space-combat.mjs";
import { L, esc, li, card, dice, crewFor, crewActors, hurtPerson } from "./common.mjs";

/**
 * The plain state applyShipDamage works on, read from a ship actor.
 * @param {Actor} actor
 * @returns {object}
 */
function shipState(actor) {
  const s = actor.system;
  return {
    tonnage: s.tonnage, smallCraft: s.smallCraft, destroyed: s.destroyed,
    hull: { value: s.hull.value, max: s.hull.max },
    jDrive: { ...s._source.jDrive }, mDrive: { ...s._source.mDrive }, power: { ...s._source.power },
    fuel: { value: s.fuel.value, max: s.fuel.max },
    fuelHits: s.fuelHits, internalHits: s.internalHits, cockpitHits: s.cockpitHits,
    weapons: actor.items.filter(i => i.type === "shipWeapon").map(i => ({ id: i.id, disabled: i.system.disabled, destroyed: i.system.destroyed })),
    armor: { ...s._source.armor }
  };
}

/** Card lines for the log entries of applyShipDamage. */
function logNotes(log) {
  const notes = [];
  for (const l of log) {
    if (/^[A-Z]>[A-Z]$/.test(l.text)) notes.push(`${L(`Loc.${l.location}`)}: ${l.text.replace(">", " → ")}`);
    else if (l.text.startsWith("leak:")) notes.push(L("Card.fuelLeak", { n: l.text.slice(5) }));
    else if (l.text.startsWith("transfer:")) notes.push(L("Card.transfer", { from: L(`Loc.${l.text.split(":")[1]}`) }));
    else if (l.location === "hull" && l.text === "hit") notes.push(`${L("Loc.hull")} -1`);
  }
  return notes;
}

/** Resolve one internal hit (book p.87): computer, crew injury, or cargo. Returns card lines. */
async function internalHit(actor, ev) {
  const notes = [`${L("Loc.internal")}: ${L(`Internal.${ev.effect}`)}`];
  if (ev.effect === "crew") {
    for (const c of crewActors(actor)) {
      const r = await rollTask({ actor: c, characteristic: "end", dm: -ev.internalHits, label: L("Card.crewInjuryRoll"), chat: false });
      notes.push(r.success ? `${esc(c.name)}: ${L("Card.avoided")}` : await hurtPerson(c, dice().roll("D3"), "craft-internal"));
    }
  } else if (ev.effect === "cargo") {
    const r = dice().roll("2D");
    notes.push(L("Card.cargoDamaged", { roll: r, pct: SC.cargoDamagePercent(r) }));
  } else if (ev.effect === "computer") {
    const hits = actor.system.computerHits + 1;
    await actor.update({ "system.computerHits": hits });
    notes.push(L("Card.computerHit", { n: hits }));
  }
  return notes;
}

/** Card lines for the events of applyShipDamage; rolls the follow-ups (pilot, internal, explosion). */
async function eventNotes(actor, events) {
  const notes = [];
  for (const ev of events) {
    switch (ev.type) {
      case "armor": notes.push(L("Card.armorAbsorbs", { n: ev.absorbed })); break;
      case "critical": notes.push(`<strong>${L(`Loc.${ev.location}`)}</strong>: ${L("Status.critical")}`); break;
      case "systemDestroyed": notes.push(`<strong>${L(`Loc.${ev.location}`)}</strong>: ${L("Status.destroyed")}`); break;
      case "weaponDisabled": notes.push(`${esc(actor.items.get(ev.id)?.name)}: ${L("Status.disabled")}`); break;
      case "weaponDestroyed": notes.push(`${esc(actor.items.get(ev.id)?.name)}: ${L("Status.destroyed")}`); break;
      case "depressurized": notes.push(L("Card.depressurized")); break;
      case "pilotDamage": notes.push(`${L("Card.pilotHurt")} ${await hurtPerson(crewFor(actor, "pilot"), dice().roll("2D"), "craft-cockpit")}`); break;
      case "internal": notes.push(...await internalHit(actor, ev)); break;
      case "destroyed": {
        const r = dice().roll("1D");
        notes.push(`<strong>${L("Status.shipDestroyed")}</strong> 1D=${r}: ${SC.destroyedShipExplodes(r) ? L("Card.explodes") : L("Card.breaksApart")}`);
        break;
      }
      case "explode": notes.push(`<strong>${L("Card.explodes")}</strong>`); break;
    }
  }
  return notes;
}

/**
 * Damage a starship (book p.86-87). Rolls the location (2D, or 1D for small craft) unless
 * `location` is given, applies armour and step-downs (rules applyShipDamage), writes the actor
 * and its shipWeapon items (`system.disabled`, `system.destroyed`), resolves follow-up rolls
 * (internal D3, crew injury, cargo, pilot damage, explosion), and posts a chat card.
 * Called by damageCraft, the ship sheet "Hit" button, and the craft-hit chat button.
 * Example: a 100T ship with M-Drive B takes 1 on "mDrive": system.mDrive.damage 0 -> 1 (B -> A, critical).
 * @param {Actor} actor  ship actor
 * @param {number} amount
 * @param {{location?: string, chat?: boolean}} [opts]
 * @returns {Promise<{location:string, roll:number|null, log:object[], events:object[]}>}
 */
export async function damageShip(actor, amount, { location = "", chat = true } = {}) {
  if (actor?.type !== "ship") throw new Error("damageShip needs a ship actor");
  const small = actor.system.smallCraft;
  let roll = null;
  if (!location) {
    roll = dice().roll(small ? "1D" : "2D");
    location = SC.shipLocation(roll, small);
  }
  const internalRolls = Array.from({ length: amount }, () => dice().roll("D3"));
  const { state, log, events } = SC.applyShipDamage(shipState(actor), location, amount, { internalRolls });

  await actor.update({
    "system.hull.value": state.hull.value,
    "system.jDrive.damage": state.jDrive.damage, "system.jDrive.destroyed": !!state.jDrive.destroyed,
    "system.mDrive.damage": state.mDrive.damage, "system.mDrive.destroyed": !!state.mDrive.destroyed,
    "system.power.damage": state.power.damage, "system.power.destroyed": !!state.power.destroyed,
    "system.fuel.value": state.fuel.value, "system.fuelHits": state.fuelHits,
    "system.internalHits": state.internalHits, "system.cockpitHits": state.cockpitHits,
    "system.destroyed": !!state.destroyed
  });
  const itemUpdates = state.weapons.map(w => ({ _id: w.id, "system.destroyed": !!w.destroyed, "system.disabled": !!w.disabled }));
  if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates);

  const notes = [...logNotes(log), ...await eventNotes(actor, events)];
  if (chat) {
    const where = roll === null ? L("Card.calledShot") : `${small ? "1D" : "2D"}=${roll}`;
    const body = `<p>${L("Card.hitFor", { amount, location: L(`Loc.${location}`) })} (${where})</p>${li(notes)}`;
    await card({ actor, title: L("Card.shipHit", { name: actor.name }), body });
  }
  return { location, roll, log, events };
}

/** Damage on each repairable ship location, read from the actor. */
function repairDamage(s) {
  return { hull: s.hull.max - s.hull.value, jDrive: s.jDrive.damage, mDrive: s.mDrive.damage, power: s.power.damage, fuel: s.fuelHits, internal: s.internalHits, cockpit: s.cockpitHits };
}

/** The update path for each repairable ship location. */
const REPAIR_PATH = {
  jDrive: "system.jDrive.damage", mDrive: "system.mDrive.damage", power: "system.power.damage",
  fuel: "system.fuelHits", internal: "system.internalHits", cockpit: "system.cockpitHits"
};

/**
 * Restore one hit to a ship location (Mechanic repair, book p.85; repair parts p.77). Rolls
 * Mechanic 8+ with -1 DM per damage on the area unless `roll: false`. Writes the actor.
 * Called by the ship sheet "Repair" buttons.
 * Example: fuel with system.fuelHits 2 -> 1.
 * @param {Actor} actor  ship
 * @param {"hull"|"jDrive"|"mDrive"|"power"|"fuel"|"internal"|"cockpit"} location
 * @param {{roll?: boolean, mechanic?: Actor|string|null}} [o]
 * @returns {Promise<{repaired: boolean, roll?: object}>}
 */
export async function repairShip(actor, location, { roll = true, mechanic = null } = {}) {
  const s = actor.system;
  const dmg = repairDamage(s)[location] ?? 0;
  if (dmg <= 0) return { repaired: false };
  if (["jDrive", "mDrive", "power"].includes(location) && s[location].destroyed) { ui.notifications.warn(L("Warn.destroyed")); return { repaired: false }; }
  if (roll) {
    const who = (await resolveActor(mechanic)) ?? crewFor(actor, "mechanic");
    const r = await rollTask({ actor: who, skill: "Mechanic", dm: -dmg, label: `${L("Action.repair")}: ${L(`Loc.${location}`)}` });
    if (!r.success) return { repaired: false, roll: r };
  }
  await actor.update(location === "hull" ? { "system.hull.value": s.hull.value + 1 } : { [REPAIR_PATH[location]]: dmg - 1 });
  return { repaired: true };
}
