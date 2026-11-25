/**
 * Craft API: Foundry-side actions for starships and vehicles. Exposed as game.spacer.craft.
 * Pure rules live in ./rules/*.mjs; this file reads and writes documents, rolls dice, and posts chat.
 */
import * as play from "../play/api.mjs";
import { rollTask, skillRank, rollBookDice } from "../play/api.mjs";
import { DRIVE_LETTERS, lowestLetter } from "./rules/drives.mjs";
import * as SC from "./rules/space-combat.mjs";
import * as VR from "./rules/vehicles.mjs";
import * as OPS from "./rules/operations.mjs";
import * as TR from "./rules/travel.mjs";

const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
export const L = (key, data) => (data ? game.i18n.format(`SPACER.Craft.${key}`, data) : game.i18n.localize(`SPACER.Craft.${key}`));
export const credits = n => `${Math.round(Number(n) || 0).toLocaleString("en-US")}cr`;

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

async function d(formula) {
  return (await new Roll(formula).evaluate()).total;
}

function resolveActor(ref) {
  if (!ref) return null;
  if (ref instanceof Actor) return ref;
  if (typeof ref === "string") return fromUuidSync(ref) ?? game.actors.get(ref) ?? null;
  return null;
}

/** Crew actor for a role on a ship, or the operator (first crew) of a vehicle. */
export function crewFor(craft, role) {
  if (craft.type === "vehicle") return resolveActor(craft.system.crew[0]);
  const entry = craft.system.crew.find(c => c.role === role && c.actor);
  return resolveActor(entry?.actor);
}

/** All crew/occupant actors aboard a craft. */
export function crewActors(craft) {
  const refs = craft.type === "vehicle" ? craft.system.crew : craft.system.crew.map(c => c.actor);
  return [...new Set(refs.filter(Boolean))].map(resolveActor).filter(Boolean);
}

async function postCard({ actor, title, body, flags = {} }) {
  const content = `<div class="spacer craft-card"><h3>${esc(title)}</h3>${body}</div>`;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { spacer: { craft: flags } } });
}

const li = items => `<ul>${items.filter(Boolean).map(i => `<li>${i}</li>`).join("")}</ul>`;

/** Damage a person through the play area when it is there; otherwise only report it. */
async function hurtPerson(actor, amount, source) {
  if (!actor || amount <= 0) return `${esc(actor?.name ?? "?")}: ${amount}`;
  if (typeof play.applyDamage === "function" && ["character", "npc"].includes(actor.type)) {
    try { await play.applyDamage(actor, amount, { source, chat: false }); } catch (err) { console.error(err); }
    return `${esc(actor.name)}: ${amount} ${L("Card.damageApplied")}`;
  }
  return `${esc(actor.name)}: ${amount} ${L("Card.damageToApply")}`;
}

function shipState(actor) {
  const s = actor.system;
  const f = actor.flags?.spacer?.craft ?? {};
  return {
    tonnage: s.tonnage, smallCraft: s.smallCraft, destroyed: s.destroyed,
    hull: { value: s.hull.value, max: s.hull.max },
    jDrive: { ...s._source.jDrive }, mDrive: { ...s._source.mDrive }, power: { ...s._source.power },
    fuel: { value: s.fuel.value, max: s.fuel.max },
    fuelHits: f.fuelHits ?? 0, internalHits: s.internalHits, cockpitHits: s.cockpitHits,
    weapons: actor.items.filter(i => i.type === "shipWeapon").map(i => ({ id: i.id, disabled: !!i.flags?.spacer?.craft?.disabled, destroyed: i.system.destroyed })),
    armor: { ...(f.armor ?? {}) }
  };
}

/* -------------------------------------------- */
/*  Starship damage                             */
/* -------------------------------------------- */

/**
 * Damage a starship (book p.86-87). Rolls the location (2D, or 1D for small craft) unless
 * `location` is given, applies armour and step-downs, writes the actor, resolves follow-up
 * rolls (internal D3, crew injury, cargo, pilot damage, explosion), and posts a chat card.
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
    roll = await d(small ? "1d6" : "2d6");
    location = SC.shipLocation(roll, small);
  }
  const internalRolls = [];
  for (let i = 0; i < amount; i++) internalRolls.push(await d("1d3"));
  const before = shipState(actor);
  const { state, log, events } = SC.applyShipDamage(before, location, amount, { internalRolls });

  const update = {
    "system.hull.value": state.hull.value,
    "system.jDrive.damage": state.jDrive.damage, "system.jDrive.destroyed": !!state.jDrive.destroyed,
    "system.mDrive.damage": state.mDrive.damage, "system.mDrive.destroyed": !!state.mDrive.destroyed,
    "system.power.damage": state.power.damage, "system.power.destroyed": !!state.power.destroyed,
    "system.fuel.value": state.fuel.value,
    "system.internalHits": state.internalHits, "system.cockpitHits": state.cockpitHits,
    "system.destroyed": !!state.destroyed,
    "flags.spacer.craft.fuelHits": state.fuelHits
  };
  await actor.update(update);
  const itemUpdates = state.weapons.map(w => ({ _id: w.id, "system.destroyed": !!w.destroyed, "flags.spacer.craft.disabled": !!w.disabled }));
  if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates);

  // Follow-up rolls.
  const notes = [];
  for (const l of log) {
    if (/^[A-Z]>[A-Z]$/.test(l.text)) notes.push(`${L(`Loc.${l.location}`)}: ${l.text.replace(">", " → ")}`);
    else if (l.text.startsWith("leak:")) notes.push(L("Card.fuelLeak", { n: l.text.slice(5) }));
    else if (l.text.startsWith("transfer:")) notes.push(L("Card.transfer", { from: L(`Loc.${l.text.split(":")[1]}`) }));
    else if (l.location === "hull" && l.text === "hit") notes.push(`${L("Loc.hull")} -1`);
  }
  for (const ev of events) {
    switch (ev.type) {
      case "armor": notes.push(L("Card.armorAbsorbs", { n: ev.absorbed })); break;
      case "critical": notes.push(`<strong>${L(`Loc.${ev.location}`)}</strong>: ${L("Status.critical")}`); break;
      case "systemDestroyed": notes.push(`<strong>${L(`Loc.${ev.location}`)}</strong>: ${L("Status.destroyed")}`); break;
      case "weaponDisabled": notes.push(`${esc(actor.items.get(ev.id)?.name)}: ${L("Status.disabled")}`); break;
      case "weaponDestroyed": notes.push(`${esc(actor.items.get(ev.id)?.name)}: ${L("Status.destroyed")}`); break;
      case "depressurized": notes.push(L("Card.depressurized")); break;
      case "pilotDamage": {
        const pilot = crewFor(actor, "pilot");
        const dmg = await d("2d6");
        notes.push(`${L("Card.pilotHurt")} ${await hurtPerson(pilot, dmg, "craft-cockpit")}`);
        break;
      }
      case "internal": {
        notes.push(`${L("Loc.internal")}: ${L(`Internal.${ev.effect}`)}`);
        if (ev.effect === "crew") {
          for (const c of crewActors(actor)) {
            const r = await rollTask({ actor: c, characteristic: "end", dm: -ev.internalHits, label: L("Card.crewInjuryRoll"), chat: false });
            if (!r.success) notes.push(await hurtPerson(c, await d("1d3"), "craft-internal"));
            else notes.push(`${esc(c.name)}: ${L("Card.avoided")}`);
          }
        } else if (ev.effect === "cargo") {
          const r = await d("2d6");
          const pct = SC.cargoDamagePercent(r);
          notes.push(L("Card.cargoDamaged", { roll: r, pct }));
        } else if (ev.effect === "computer") {
          const hits = (actor.flags?.spacer?.craft?.computerHits ?? 0) + 1;
          await actor.setFlag("spacer", "craft.computerHits", hits);
          notes.push(L("Card.computerHit", { n: hits }));
        }
        break;
      }
      case "destroyed": {
        const r = await d("1d6");
        notes.push(`<strong>${L("Status.shipDestroyed")}</strong> 1D=${r}: ${SC.destroyedShipExplodes(r) ? L("Card.explodes") : L("Card.breaksApart")}`);
        break;
      }
      case "explode": notes.push(`<strong>${L("Card.explodes")}</strong>`); break;
    }
  }
  if (chat) {
    const where = roll === null ? L("Card.calledShot") : `${small ? "1D" : "2D"}=${roll}`;
    const body = `<p>${L("Card.hitFor", { amount, location: L(`Loc.${location}`) })} (${where})</p>${li(notes)}`;
    await postCard({ actor, title: L("Card.shipHit", { name: actor.name }), body });
  }
  return { location, roll, log, events };
}

/* -------------------------------------------- */
/*  Vehicle damage                              */
/* -------------------------------------------- */

/**
 * Damage a vehicle (book p.49). Converts the damage by source (personal weapons deal 1, starship
 * weapons x6), rolls the 1D location (civilian or military table) unless `location` is given,
 * applies armour, transfers, occupant damage, and explosion checks, and posts a chat card.
 * @param {Actor} actor vehicle actor
 * @param {number} amount
 * @param {{location?: string, source?: "vehicle"|"personal"|"starship", chat?: boolean}} [opts]
 */
export async function damageVehicle(actor, amount, { location = "", source = "vehicle", chat = true } = {}) {
  if (actor?.type !== "vehicle") throw new Error("damageVehicle needs a vehicle actor");
  const v = actor.system;
  const points = VR.toVehicleDamage(amount, source);
  let roll = null;
  if (!location) {
    roll = await d("1d6");
    location = VR.vehicleLocation(roll, v.isMilitary);
  }
  if (location === "weapon" && v.locations.weapon.max <= 0) location = "hull";
  const openRoll = v.isOpen && location === "interior" ? await d("1d6") : undefined;
  const { state, log, events } = VR.applyVehicleDamage({ locations: foundry.utils.deepClone(v._source.locations), destroyed: v.destroyed }, location, points, { open: v.isOpen, openRoll });

  const update = { "system.destroyed": !!state.destroyed };
  for (const [k, l] of Object.entries(state.locations)) update[`system.locations.${k}.value`] = l.value;
  const notes = [];
  const occupants = crewActors(actor);
  let exploded = false;
  for (const ev of events) {
    switch (ev.type) {
      case "armor": notes.push(L("Card.armorAbsorbs", { n: ev.absorbed })); break;
      case "occupants": {
        notes.push(L("Card.occupantsHit", { dice: ev.dice }));
        for (const o of occupants) notes.push(await hurtPerson(o, await d(`${ev.dice}d6`), "craft-interior"));
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
        const r = await d("1d6");
        const boom = VR.explodes(r, ev.dm);
        notes.push(L("Card.explosionCheck", { roll: r, dm: ev.dm }) + ": " + (boom ? `<strong>${L("Card.explodes")}</strong>` : L("Card.noExplosion")));
        if (boom) {
          exploded = true;
          update["system.destroyed"] = true;
          for (const o of occupants) notes.push(await hurtPerson(o, await d("6d6"), "craft-explosion"));
        }
        break;
      }
    }
  }
  await actor.update(update);
  if (chat) {
    const where = roll === null ? L("Card.calledShot") : `1D=${roll} (${L(v.isMilitary ? "Vehicle.military" : "Vehicle.civilian")})`;
    const conv = source !== "vehicle" ? ` ${L(`Source.${source}`)}: ${amount} → ${points}` : "";
    const body = `<p>${L("Card.hitFor", { amount: points, location: L(`Loc.${location}`) })} (${where})${conv}</p>${li(notes)}`;
    await postCard({ actor, title: L("Card.vehicleHit", { name: actor.name }), body });
  }
  return { location, roll, points, log, events, exploded };
}

/** Damage any craft: ships use damageShip, vehicles damageVehicle. */
export async function damageCraft(actor, amount, opts = {}) {
  if (actor?.type === "ship") return damageShip(actor, amount, opts);
  if (actor?.type === "vehicle") return damageVehicle(actor, amount, opts);
  throw new Error("Not a craft");
}

/* -------------------------------------------- */
/*  Weapons                                     */
/* -------------------------------------------- */

/**
 * Fire a mounted weapon (book p.49, p.76, p.84-86): the gunner's Gunner roll (8+) with range,
 * energy, called-shot, and speed DMs; on a hit, roll damage and post a card with an
 * "Apply" button. With `target` and `apply: true` the damage is applied at once.
 * @param {Actor} actor  ship or vehicle
 * @param {Item|string} itemRef  shipWeapon item or id
 * @param {object} [o]
 * @param {string} [o.range="close"]   space range band (ships)
 * @param {string} [o.location]        called shot location (-2 DM)
 * @param {number} [o.dm=0]
 * @param {number} [o.evade=0]         target pilot's evade effect
 * @param {Actor|string} [o.target]
 * @param {Actor|string} [o.gunner]
 * @param {number} [o.missiles=1]      missiles fired from a rack (1-4)
 * @param {number} [o.beamRounds=1]    rounds a beam has held contact
 * @param {boolean} [o.apply=false]
 */
export async function fireWeapon(actor, itemRef, { range = "close", location = "", dm = 0, evade = 0, target = null, gunner = null, missiles = 1, beamRounds = 1, apply = false } = {}) {
  const item = typeof itemRef === "string" ? actor.items.get(itemRef) : itemRef;
  if (!item) throw new Error("No weapon");
  if (item.system.destroyed || item.flags?.spacer?.craft?.disabled) {
    ui.notifications.warn(L("Warn.weaponOut", { name: item.name }));
    return null;
  }
  const w = { name: item.name, mount: item.system.mount, traits: item.system.traits };
  const missile = SC.isMissile(w);
  let shots = 1;
  if (missile && item.system.ammo.max > 0) {
    shots = Math.max(1, Math.min(4, missiles, item.system.ammo.value));
    if (item.system.ammo.value <= 0) { ui.notifications.warn(L("Warn.noAmmo", { name: item.name })); return null; }
    await item.update({ "system.ammo.value": item.system.ammo.value - shots });
  }
  const shooter = resolveActor(gunner) ?? resolveActor(item.system.gunner) ?? crewFor(actor, "gunner") ?? (actor.type === "vehicle" ? crewFor(actor) : null);
  const targetActor = resolveActor(target);
  let parts;
  if (actor.type === "ship") {
    parts = SC.attackDM({ range, energy: SC.isEnergyWeapon(w), called: !!location, evade, other: dm });
  } else {
    const speedDM = targetActor?.type === "vehicle" ? VR.speedAttackDM(actor.system.currentSpeed, targetActor.system.currentSpeed) : 0;
    parts = { total: speedDM + (location ? SC.CALLED_SHOT_DM : 0) + (Number(dm) || 0), parts: { speed: speedDM, called: location ? SC.CALLED_SHOT_DM : 0, other: Number(dm) || 0 } };
  }
  const result = await rollTask({ actor: shooter, skill: "Gunner", dm: parts.total, label: `${actor.name}: ${item.name}${shooter ? "" : ` (${L("Card.noGunner")})`}` });
  let damage = 0;
  let damageRoll = null;
  if (result.success) {
    if (missile) damage = shots * (Number(item.system.damage) || 1);
    else if (SC.isBeam(w)) damage = Math.max(1, beamRounds);
    else { damageRoll = await rollBookDice(item.system.damage || "1"); damage = damageRoll.total; }
  }
  const dmText = Object.entries(parts.parts).filter(([, v]) => v).map(([k, v]) => `${L(`DM.${k}`)} ${v > 0 ? "+" : ""}${v}`).join(", ");
  let body = `<p>${dmText || L("DM.none")}</p>`;
  if (result.success) {
    body += `<p>${L("Card.weaponHit", { damage })}${missile ? ` · ${L("Card.missileDelay", { n: SC.missileDelay(range) })}` : ""}</p>`;
    const kind = targetActor?.type === "vehicle" && actor.type === "ship" ? "starship" : "vehicle";
    body += `<button type="button" data-action="craft-hit" data-amount="${damage}" data-location="${esc(location)}" data-source="${kind}" data-target="${esc(targetActor?.uuid ?? "")}">${L("Card.applyHit")}${targetActor ? `: ${esc(targetActor.name)}` : ""}</button>`;
  } else body += `<p>${L("Card.miss")}</p>`;
  await postCard({ actor, title: L("Card.fire", { name: item.name }), body });
  let applied = null;
  if (result.success && apply && targetActor) {
    const source = targetActor.type === "vehicle" && actor.type === "ship" ? "starship" : "vehicle";
    applied = await damageCraft(targetActor, damage, { location, source });
  }
  return { result, damage, damageRoll, shots, gunner: shooter, applied };
}

/* -------------------------------------------- */
/*  Travel                                      */
/* -------------------------------------------- */

/**
 * Travel from orbit to the jump point (book p.67). Uses the effective thrust. M-Drive fuel is
 * the thrust rating in tonnes per week, prorated by the hours spent.
 * @param {Actor} actor
 * @param {{size?: number|string, advanceTime?: boolean}} [o] world size code or "gasGiant"
 */
export async function travelToJumpPoint(actor, { size = 8, advanceTime = false, chat = true } = {}) {
  const thrust = actor.system.effective.thrust;
  const hours = TR.jumpPointHours(size, thrust);
  if (hours === null) { ui.notifications.warn(L("Warn.noThrust")); return null; }
  const fuel = Math.round(thrust * hours / 168 * 100) / 100;
  await actor.update({ "system.fuel.value": Math.max(0, actor.system.fuel.value - fuel), "system.position.range": "jumpPoint" });
  if (advanceTime && game.user.isGM) await game.time.advance(Math.round(hours * 3600));
  if (chat) await postCard({ actor, title: L("Travel.toJumpPoint"), body: li([L("Travel.timeIs", { time: TR.formatHours(hours) }), L("Travel.fuelUsed", { n: fuel }), L("Travel.distance", { km: TR.jumpPointDistanceKm(size === "gasGiant" ? "gasGiant" : Math.min(10, Number(size) || 0)).toLocaleString("en-US") })]) });
  return { hours, fuel };
}

/** Interplanetary travel time (book p.67) for a table row key. */
export async function travelInterplanetary(actor, { row = "station", advanceTime = false, chat = true } = {}) {
  const thrust = actor.system.effective.thrust;
  const hours = TR.interplanetaryHours(row, thrust);
  if (hours === null) { ui.notifications.warn(L("Warn.noThrust")); return null; }
  const fuel = Math.round(thrust * hours / 168 * 100) / 100;
  await actor.update({ "system.fuel.value": Math.max(0, actor.system.fuel.value - fuel), "system.position.range": "" });
  if (advanceTime && game.user.isGM) await game.time.advance(Math.round(hours * 3600));
  if (chat) await postCard({ actor, title: L("Travel.interplanetary"), body: li([L(`Travel.row.${row}`), L("Travel.timeIs", { time: TR.formatHours(hours) }), L("Travel.fuelUsed", { n: fuel })]) });
  return { hours, fuel };
}

/**
 * Jump (book p.66-67, p.72, p.85): checks the effective jump rating and fuel (10T per parsec),
 * rolls the astrogator's Astrogation 8+ (-2 with unrefined fuel, lack-of-maintenance DM), spends
 * fuel, and takes one week. With unrefined fuel a failed roll steps the J-Drive down by the
 * failure margin, and a natural 2 or less misjumps (1D direction, 1D parsecs).
 * A failed roll with refined fuel means the jump is not made; the fuel is kept.
 * @param {Actor} actor
 * @param {{parsecs?: number, destination?: string, dm?: number, advanceTime?: boolean, astrogator?: Actor|string}} [o]
 */
export async function jump(actor, { parsecs = 1, destination = "", dm = 0, advanceTime = false, astrogator = null, chat = true } = {}) {
  const s = actor.system;
  const plan = TR.planJump({ parsecs, jumpRating: s.effective.jump, fuel: s.fuel.value });
  if (!plan.possible) {
    ui.notifications.warn(L(`Warn.jump.${plan.reason}`, { need: plan.fuel }));
    return { ...plan, made: false };
  }
  const nav = resolveActor(astrogator) ?? crewFor(actor, "astrogator");
  const unrefined = !!s.fuelState.unrefined;
  const totalDM = (Number(dm) || 0) + (unrefined ? -2 : 0) + s.maintenance.dm;
  const r = await rollTask({ actor: nav, characteristic: "edu", skill: "Astrogation", dm: totalDM, label: L("Travel.jumpRoll", { n: parsecs }) });
  const notes = [];
  let made = r.success;
  let misjumped = null;
  if (!r.success && unrefined) {
    const res = OPS.contaminatedFuelResult(r.natural, r.total, 8);
    if (res.critical) {
      const dir = await d("1d6"), dist = await d("1d6");
      misjumped = OPS.misjump(dir, dist);
      made = true;
      // The J-Drive drops to its lowest letter: critical, cannot jump until repaired (book p.72).
      const toLowest = Math.max(0, DRIVE_LETTERS.indexOf(s.jDrive.rating) - DRIVE_LETTERS.indexOf(lowestLetter(s.tonnage, s.armorLayers)));
      await actor.update({ "system.jDrive.damage": Math.max(s.jDrive.damage, toLowest) });
      notes.push(L("Travel.misjump", { dir: L(`Misjump.${misjumped.direction}`), n: misjumped.parsecs }));
    } else if (res.steps) {
      await actor.update({ "system.jDrive.damage": s.jDrive.damage + res.steps });
      notes.push(L("Travel.driveStepDown", { n: res.steps }));
    }
  }
  if (made) {
    await actor.update({ "system.fuel.value": Math.max(0, actor.system.fuel.value - plan.fuel), "system.position.range": "", "system.position.system": destination || actor.system.position.system });
    notes.unshift(L("Travel.jumped", { n: parsecs, fuel: plan.fuel, time: TR.formatHours(plan.hours) }));
    if (advanceTime && game.user.isGM) await game.time.advance(plan.hours * 3600);
  } else if (!notes.length) notes.push(L("Travel.jumpFailed"));
  if (chat) await postCard({ actor, title: L("Travel.jump"), body: li(notes) });
  return { ...plan, made, roll: r, misjump: misjumped };
}

/**
 * Buy fuel (book p.66, p.70): refined 500cr/T, unrefined 100cr/T (sets the contaminated-fuel flag).
 * Pays from the ship's bank. `tons` defaults to filling the usable tank.
 */
export async function refuel(actor, { tons = null, type = "refined", pay = true, chat = true } = {}) {
  const s = actor.system;
  const space = Math.max(0, s.fuelState.capacity - s.fuel.value);
  const t = Math.min(space, tons === null ? space : Math.max(0, Number(tons) || 0));
  const cost = t * (OPS.FUEL_PRICE[type] ?? 500);
  const update = { "system.fuel.value": s.fuel.value + t, "flags.spacer.craft.unrefined": type === "unrefined" || (s.fuelState.unrefined && type !== "refined") };
  if (pay) update["system.finances.bank"] = s.finances.bank - cost;
  await actor.update(update);
  if (chat) await postCard({ actor, title: L("Travel.refuel"), body: li([L("Travel.refuelled", { n: t, type: L(`Fuel.${type}`), cost: credits(cost) })]) });
  return { tons: t, cost };
}

/** Spacing procedure times (book p.66): preparation 1D hours, departure 1Dx10 minutes, arrival 1D hours. */
export async function procedure(actor, step = "prepare") {
  const formula = { prepare: "1d6", departure: "1d6*10", arrival: "1d6" }[step] ?? "1d6";
  const n = await d(formula);
  const unit = step === "departure" ? L("Unit.minutes") : L("Unit.hours");
  await postCard({ actor, title: L(`Procedure.${step}`), body: `<p>${n} ${unit}</p><p>${L(`Procedure.${step}Hint`)}</p>` });
  return n;
}

/** Encounter check per day of travel (book p.66): 1D, 6+ is an encounter. */
export async function encounterCheck(actor, { days = 1 } = {}) {
  const results = [];
  for (let i = 0; i < days; i++) results.push(await d("1d6"));
  const hits = results.filter(r => r >= TR.PROCEDURE.encounterTarget).length;
  await postCard({ actor, title: L("Procedure.encounter"), body: `<p>${results.join(", ")}</p><p>${hits ? L("Procedure.encounters", { n: hits }) : L("Procedure.noEncounter")}</p>` });
  return { results, encounters: hits };
}

/* -------------------------------------------- */
/*  Finances                                    */
/* -------------------------------------------- */

/** Book values for the monthly costs of a ship (book p.68-70). Does not write. */
export function bookFinances(actor) {
  const s = actor.system;
  const roles = s.crew.map(c => c.role).filter(Boolean);
  const salaryRoles = roles.length ? roles : OPS.mandatoryPositions(s.tonnage);
  return {
    mortgage: OPS.monthlyMortgage(s.cost),
    maintenance: s.maintenance.annual,
    crewSalaries: OPS.crewSalaries(salaryRoles),
    lifeSupport: OPS.lifeSupportCost(s.staterooms)
  };
}

/** Write the book values into system.finances (keeps the bank and fuel budget). */
export async function calculateFinances(actor) {
  const f = bookFinances(actor);
  await actor.update(Object.fromEntries(Object.entries(f).map(([k, v]) => [`system.finances.${k}`, v])));
  return f;
}

/**
 * Pay one month of costs from the ship's bank (book p.70): mortgage, crew salaries, life support,
 * fuel budget, berthing, and the annual maintenance when it is due (every 12 months, or when
 * `maintenance: true`). Tracks months since maintenance (lack of maintenance: -1 DM per month late).
 * `system.finances.maintenance` holds the annual maintenance amount.
 */
export async function payMonth(actor, { berthingDays = 0, maintenance = "auto", other = 0, chat = true } = {}) {
  const s = actor.system;
  // A ship whose finances were never filled in pays the book values (p.68-70).
  const keys = ["mortgage", "crewSalaries", "lifeSupport", "maintenance"];
  const f = keys.every(k => !s.finances[k]) ? { ...s.finances, ...bookFinances(actor) } : s.finances;
  const months = s.maintenance.months;
  const due = maintenance === "auto" ? months + 1 >= 12 : !!maintenance;
  const bill = OPS.monthlyBill({ mortgage: f.mortgage, crewSalaries: f.crewSalaries, lifeSupport: f.lifeSupport, fuelCost: f.fuelCost, maintenance: f.maintenance, maintenanceDue: due, berthingDays, other });
  const bank = f.bank - bill.total;
  const paid = (actor.flags?.spacer?.craft?.mortgagePaid ?? 0) + (f.mortgage > 0 ? 1 : 0);
  await actor.update({
    "system.finances.bank": bank,
    "flags.spacer.craft.monthsSinceMaintenance": due ? 0 : months + 1,
    "flags.spacer.craft.mortgagePaid": paid
  });
  if (chat) {
    const rows = bill.lines.map(l => `<tr><td>${L(`Finance.${l.key}`)}</td><td class="num">${credits(l.amount)}</td></tr>`).join("");
    const body = `<table>${rows}<tr class="total"><td>${L("Finance.total")}</td><td class="num">${credits(bill.total)}</td></tr></table>`
      + `<p>${L("Finance.bankNow", { bank: credits(bank) })}</p>${bank < 0 ? `<p class="warn">${L("Finance.overdrawn")}</p>` : ""}`
      + (!due && months + 1 >= 12 ? `<p class="warn">${L("Finance.maintenanceLate")}</p>` : "");
    await postCard({ actor, title: L("Finance.payMonthTitle", { name: actor.name }), body });
  }
  return { ...bill, bank, maintenanceDue: due };
}

/* -------------------------------------------- */
/*  Repairs                                     */
/* -------------------------------------------- */

/**
 * Restore one hit to a ship location (Mechanic repair, book p.85; repair parts p.77). Rolls
 * Mechanic 8+ with -1 DM per damage on the area unless `roll: false`.
 */
export async function repairShip(actor, location, { roll = true, mechanic = null } = {}) {
  const s = actor.system;
  const dmg = { hull: s.hull.max - s.hull.value, jDrive: s.jDrive.damage, mDrive: s.mDrive.damage, power: s.power.damage, fuel: s.fuelState.hits, internal: s.internalHits, cockpit: s.cockpitHits }[location] ?? 0;
  if (dmg <= 0) return { repaired: false };
  if (["jDrive", "mDrive", "power"].includes(location) && s[location].destroyed) { ui.notifications.warn(L("Warn.destroyed")); return { repaired: false }; }
  if (roll) {
    const r = await rollTask({ actor: resolveActor(mechanic) ?? crewFor(actor, "mechanic"), skill: "Mechanic", dm: -dmg, label: L("Action.repair") + `: ${L(`Loc.${location}`)}` });
    if (!r.success) return { repaired: false, roll: r };
  }
  const update = {
    hull: { "system.hull.value": s.hull.value + 1 },
    jDrive: { "system.jDrive.damage": dmg - 1 }, mDrive: { "system.mDrive.damage": dmg - 1 }, power: { "system.power.damage": dmg - 1 },
    fuel: { "flags.spacer.craft.fuelHits": dmg - 1 }, internal: { "system.internalHits": dmg - 1 }, cockpit: { "system.cockpitHits": dmg - 1 }
  }[location];
  await actor.update(update);
  return { repaired: true };
}

/* -------------------------------------------- */
/*  Vehicle actions                             */
/* -------------------------------------------- */

/** Operator's Drive/Pilot rank for a vehicle, from system.skill ("Drive (Civilian)"). */
export function operatorRank(vehicle, operator = null) {
  const op = resolveActor(operator) ?? crewFor(vehicle);
  const fallback = VR.vehicleSkill(vehicle.system.traits, vehicle.system.category);
  const skill = vehicle.system.skill || `${fallback.skill} (${fallback.specialty})`;
  return { actor: op, skill, rank: op ? skillRank(op, skill) : -3 };
}

/** Top-speed DM for the vehicle's current speed and its operator (book p.46). */
export function vehicleSpeedDM(vehicle, operator = null) {
  const { rank } = operatorRank(vehicle, operator);
  const v = vehicle.system;
  return VR.topSpeedDM(Math.min(v.currentSpeed, v.effectiveSpeedBand), v.effectiveSpeedBand, rank);
}

/** Operator's driving roll with the top-speed DM. */
export async function driveCheck(vehicle, { dm = 0, label = "", operator = null, chat = true } = {}) {
  const op = operatorRank(vehicle, operator);
  return rollTask({ actor: op.actor, characteristic: "dex", skill: op.skill, dm: (Number(dm) || 0) + vehicleSpeedDM(vehicle, operator), label: label || `${vehicle.name}: ${op.skill}`, chat });
}

/**
 * Ram (book p.49): the defender takes the speed band difference, the rammer half (rounded up).
 * Both take the damage on a rolled location.
 */
export async function ram(attacker, defender, { apply = true } = {}) {
  const dmg = VR.ramDamage(attacker.system.currentSpeed, defender.system.currentSpeed);
  await postCard({ actor: attacker, title: L("Vehicle.ram"), body: li([`${esc(defender.name)}: ${dmg.defender}`, `${esc(attacker.name)}: ${dmg.attacker}`]) });
  if (apply) {
    if (dmg.defender) await damageCraft(defender, dmg.defender);
    if (dmg.attacker) await damageCraft(attacker, dmg.attacker);
  }
  return dmg;
}

/**
 * Hit-and-run (book p.49): the target makes a contested DEX check against the operator's Drive;
 * a pinned target (END 0) cannot dodge. On a hit the target takes 1D per speed band + 1 per tonne.
 * Ties go to the target.
 */
export async function hitAndRun(vehicle, target, { apply = true } = {}) {
  const t = resolveActor(target);
  const op = operatorRank(vehicle);
  const drv = await rollTask({ actor: op.actor, characteristic: "dex", skill: op.skill, dm: vehicleSpeedDM(vehicle), label: L("Vehicle.hitAndRun") + `: ${vehicle.name}` });
  const pinned = (t?.system?.characteristics?.end?.value ?? 1) <= 0;
  const dodge = pinned ? null : await rollTask({ actor: t, characteristic: "dex", label: L("Vehicle.dodge") + `: ${t?.name ?? "?"}` });
  const hit = pinned || dodge.total < drv.total;
  const dice = VR.hitAndRunDice(vehicle.system.currentSpeed, vehicle.system.weightTons);
  let damage = 0;
  const notes = [pinned ? L("Vehicle.pinned") : `${drv.total} vs ${dodge.total}`];
  if (hit) {
    damage = (await rollBookDice(dice)).total;
    notes.push(L("Vehicle.runDown", { name: esc(t?.name), dice, damage }));
    if (apply && t) notes.push(t.type === "vehicle" ? "" : await hurtPerson(t, damage, "craft-hit-and-run"));
  } else notes.push(L("Vehicle.dodged", { name: esc(t?.name) }));
  await postCard({ actor: vehicle, title: L("Vehicle.hitAndRun"), body: li(notes) });
  return { hit, damage, dice };
}

/**
 * Offensive driving (book p.49): contested Drive checks, the attacker +1 DM per 2 tonnes heavier.
 * If the attacker loses, it drops speed bands equal to the difference. If the defender loses, it
 * makes a control check at -DM equal to the difference: failure spins out, natural 2 or less flips.
 */
export async function offensiveDriving(attacker, defender, { apply = true } = {}) {
  const weightDM = VR.offensiveDrivingDM(attacker.system.weightTons, defender.system.weightTons);
  const a = await driveCheck(attacker, { dm: weightDM, label: L("Vehicle.offensiveDriving") + `: ${attacker.name}` });
  const b = await driveCheck(defender, { label: L("Vehicle.offensiveDriving") + `: ${defender.name}` });
  const res = VR.offensiveDrivingResult(a.total, b.total);
  const notes = [`${a.total} vs ${b.total}`];
  let outcome = null;
  if (res.winner === "defender") {
    notes.push(L("Vehicle.attackerSlows", { name: esc(attacker.name), n: res.attackerSpeedLoss }));
    if (apply && res.attackerSpeedLoss) await attacker.update({ "system.currentSpeed": Math.max(0, attacker.system.currentSpeed - res.attackerSpeedLoss) });
  } else {
    const c = await driveCheck(defender, { dm: res.controlDM, label: L("Vehicle.keepControl") + `: ${defender.name}` });
    outcome = VR.controlCheckOutcome(c.natural, c.total);
    notes.push(L(`Vehicle.outcome.${outcome}`, { name: esc(defender.name) }));
    if (apply && outcome !== "control") await defender.update({ "system.currentSpeed": 0 });
  }
  await postCard({ actor: attacker, title: L("Vehicle.offensiveDriving"), body: li(notes) });
  return { ...res, outcome };
}

/* -------------------------------------------- */
/*  Crew actions in space combat                */
/* -------------------------------------------- */

/**
 * Roll a space combat crew action (book p.84-85) for the crew member in `position`.
 * Automatic actions post a card without a roll. Engineer overload and astrogator emergency
 * calculation use their special targets.
 */
export async function crewAction(ship, position, actionKey, { actor = null, dm = 0, roundsSpent = 0, thrust = 0 } = {}) {
  const action = (SC.CREW_ACTIONS[position] ?? []).find(a => a.key === actionKey) ?? SC.CREW_ACTIONS.any.find(a => a.key === actionKey);
  if (!action) throw new Error(`Unknown crew action ${position}.${actionKey}`);
  const who = resolveActor(actor) ?? crewFor(ship, position);
  const label = `${ship.name}: ${L(`Crew.${position}`)} — ${L(`Action.${actionKey}`)}`;
  if (action.auto || !action.skill) {
    await postCard({ actor: ship, title: label, body: `<p>${L(`ActionHint.${actionKey}`)}</p>` });
    return { auto: true };
  }
  let target = action.target;
  if (actionKey === "emergencyJump") target = SC.emergencyJumpTarget(roundsSpent);
  const extra = action.thrust ? Math.max(0, Number(thrust) || 0) : 0;
  const r = await rollTask({ actor: who, skill: action.skill, specialty: action.specialty ?? "", dm: (Number(dm) || 0) + extra + ship.system.maintenance.dm, target, label });
  let note = L(`ActionHint.${actionKey}`);
  if (actionKey === "overload") {
    const o = SC.overloadResult(r.total);
    note = o.success ? L("Action.overloadOk", { n: o.steps }) : L("Action.overloadFail", { n: o.damage });
    if (!o.success) await ship.update({ "system.power.damage": ship.system.power.damage + o.damage });
  } else if (actionKey === "evade" && r.success) note = L("Action.evadeOk", { n: r.effect });
  await postCard({ actor: ship, title: label, body: `<p>${note}</p>` });
  return { roll: r };
}

/* -------------------------------------------- */
/*  Chat buttons                                */
/* -------------------------------------------- */

/** renderChatMessageHTML handler for craft buttons. */
export function onRenderChatMessage(message, html) {
  for (const btn of html.querySelectorAll("[data-action^='craft-']")) {
    btn.addEventListener("click", async ev => {
      ev.preventDefault();
      const ds = btn.dataset;
      if (ds.action === "craft-hit") {
        const target = resolveActor(ds.target) ?? [...game.user.targets].map(t => t.actor).find(a => ["ship", "vehicle"].includes(a?.type));
        if (!target) return ui.notifications.warn(L("Warn.noTarget"));
        if (!target.isOwner) return ui.notifications.warn(L("Warn.notOwner"));
        await damageCraft(target, Number(ds.amount) || 0, { location: ds.location || "", source: ds.source || "vehicle" });
      }
    });
  }
}

/* -------------------------------------------- */
/*  Applications                                */
/* -------------------------------------------- */

/** Open the starship construction wizard (book p.74-78). Resolves to the app. */
export async function openConstruction(options = {}) {
  const { ConstructionWizard } = await import("./apps/construction.mjs");
  const app = new ConstructionWizard(options);
  await app.render(true);
  return app;
}

/** Open the space combat helper (book p.84-87). `ships`: actors to add. Resolves to the app. */
export async function openSpaceCombat({ ships = [] } = {}) {
  const { SpaceCombatApp } = await import("./apps/space-combat.mjs");
  const app = SpaceCombatApp.instance ?? new SpaceCombatApp();
  for (const s of ships) await app.addShip(s);
  await app.render(true);
  return app;
}
