/**
 * Ship travel (book p.66-67, p.70-72): to the jump point, between worlds, jumps, refuelling,
 * spacing procedures, and encounter checks. Reads and writes the ship actor and posts cards.
 */
import { rollTask } from "../play/api.mjs";
import { resolveActor } from "../shared/foundry.mjs";
import { DRIVE_LETTERS, lowestLetter } from "./rules/drives.mjs";
import * as OPS from "./rules/operations.mjs";
import * as TR from "./rules/travel.mjs";
import { L, li, card, credits, dice, crewFor } from "./common.mjs";

/** M-Drive fuel for `hours` at `thrust`: the thrust rating in tonnes per week, prorated (p.76). */
const mDriveFuel = (thrust, hours) => Math.round(thrust * hours / 168 * 100) / 100;

/** Advance the world clock when asked and the user is the GM. */
async function advance(advanceTime, hours) {
  if (advanceTime && game.user.isGM) await game.time.advance(Math.round(hours * 3600));
}

/**
 * Travel from orbit to the jump point (book p.67). Uses the effective thrust; spends M-Drive fuel
 * (`system.fuel.value`) and sets `system.position.range` to "jumpPoint". Called by the ship sheet.
 * Example: 100T scout at 4G from a size 8 world: 3.25 hours, fuel 40 -> 39.92.
 * @param {Actor} actor  ship
 * @param {{size?: number|string, advanceTime?: boolean, chat?: boolean}} [o] world size code or "gasGiant"
 * @returns {Promise<{hours: number, fuel: number}|null>} null when the ship has no thrust
 */
export async function travelToJumpPoint(actor, { size = 8, advanceTime = false, chat = true } = {}) {
  const thrust = actor.system.effective.thrust;
  const hours = TR.jumpPointHours(size, thrust);
  if (hours === null) { ui.notifications.warn(L("Warn.noThrust")); return null; }
  const fuel = mDriveFuel(thrust, hours);
  await actor.update({ "system.fuel.value": Math.max(0, actor.system.fuel.value - fuel), "system.position.range": "jumpPoint" });
  await advance(advanceTime, hours);
  const km = TR.jumpPointDistanceKm(size === "gasGiant" ? "gasGiant" : Math.min(10, Number(size) || 0)).toLocaleString("en-US");
  if (chat) await card({ actor, title: L("Travel.toJumpPoint"), body: li([L("Travel.timeIs", { time: TR.formatHours(hours) }), L("Travel.fuelUsed", { n: fuel }), L("Travel.distance", { km })]) });
  return { hours, fuel };
}

/**
 * Interplanetary travel (book p.67) for a row of the Interplanetary Travel Table. Spends M-Drive
 * fuel and clears `system.position.range`. Called by the ship sheet.
 * @param {Actor} actor  ship
 * @param {{row?: string, advanceTime?: boolean, chat?: boolean}} [o]
 * @returns {Promise<{hours: number, fuel: number}|null>}
 */
export async function travelInterplanetary(actor, { row = "station", advanceTime = false, chat = true } = {}) {
  const thrust = actor.system.effective.thrust;
  const hours = TR.interplanetaryHours(row, thrust);
  if (hours === null) { ui.notifications.warn(L("Warn.noThrust")); return null; }
  const fuel = mDriveFuel(thrust, hours);
  await actor.update({ "system.fuel.value": Math.max(0, actor.system.fuel.value - fuel), "system.position.range": "" });
  await advance(advanceTime, hours);
  if (chat) await card({ actor, title: L("Travel.interplanetary"), body: li([L(`Travel.row.${row}`), L("Travel.timeIs", { time: TR.formatHours(hours) }), L("Travel.fuelUsed", { n: fuel })]) });
  return { hours, fuel };
}

/** Unrefined fuel after a failed jump roll (p.72): step the J-Drive down, or misjump. Returns card lines. */
async function contaminatedJump(actor, r) {
  const s = actor.system;
  const res = OPS.contaminatedFuelResult(r.natural, r.total, 8);
  if (res.critical) {
    const misjumped = OPS.misjump(dice().roll("1D"), dice().roll("1D"));
    // The J-Drive drops to its lowest letter: critical, cannot jump until repaired (book p.72).
    const toLowest = Math.max(0, DRIVE_LETTERS.indexOf(s.jDrive.rating) - DRIVE_LETTERS.indexOf(lowestLetter(s.tonnage, s.armorLayers)));
    await actor.update({ "system.jDrive.damage": Math.max(s.jDrive.damage, toLowest) });
    return { made: true, misjumped, notes: [L("Travel.misjump", { dir: L(`Misjump.${misjumped.direction}`), n: misjumped.parsecs })] };
  }
  if (res.steps) {
    await actor.update({ "system.jDrive.damage": s.jDrive.damage + res.steps });
    return { made: false, misjumped: null, notes: [L("Travel.driveStepDown", { n: res.steps })] };
  }
  return { made: false, misjumped: null, notes: [] };
}

/**
 * Jump (book p.66-67, p.72, p.85): checks the effective jump rating and fuel (10T per parsec),
 * rolls the astrogator's Astrogation 8+ (-2 with unrefined fuel, lack-of-maintenance DM), spends
 * fuel, and takes one week. With unrefined fuel (`system.unrefined`) a failed roll steps the
 * J-Drive down by the failure margin, and a natural 2 or less misjumps (1D direction, 1D parsecs).
 * A failed roll with refined fuel means the jump is not made; the fuel is kept.
 * Writes `system.fuel.value`, `system.position.*`, and `system.jDrive.damage`. Called by the ship sheet.
 * @param {Actor} actor  ship
 * @param {{parsecs?: number, destination?: string, dm?: number, advanceTime?: boolean, astrogator?: Actor|string, chat?: boolean}} [o]
 * @returns {Promise<object>} the jump plan plus `{ made, roll, misjump }`
 */
export async function jump(actor, { parsecs = 1, destination = "", dm = 0, advanceTime = false, astrogator = null, chat = true } = {}) {
  const s = actor.system;
  const plan = TR.planJump({ parsecs, jumpRating: s.effective.jump, fuel: s.fuel.value });
  if (!plan.possible) {
    ui.notifications.warn(L(`Warn.jump.${plan.reason}`, { need: plan.fuel }));
    return { ...plan, made: false };
  }
  const nav = (await resolveActor(astrogator)) ?? crewFor(actor, "astrogator");
  const unrefined = !!s.fuelState.unrefined;
  const totalDM = (Number(dm) || 0) + (unrefined ? -2 : 0) + s.maintenance.dm;
  const r = await rollTask({ actor: nav, characteristic: "edu", skill: "Astrogation", dm: totalDM, label: L("Travel.jumpRoll", { n: parsecs }) });
  let made = r.success;
  let misjumped = null;
  let notes = [];
  if (!r.success && unrefined) ({ made, misjumped, notes } = await contaminatedJump(actor, r));
  if (made) {
    await actor.update({ "system.fuel.value": Math.max(0, actor.system.fuel.value - plan.fuel), "system.position.range": "", "system.position.system": destination || actor.system.position.system });
    notes.unshift(L("Travel.jumped", { n: parsecs, fuel: plan.fuel, time: TR.formatHours(plan.hours) }));
    await advance(advanceTime, plan.hours);
  } else if (!notes.length) notes.push(L("Travel.jumpFailed"));
  if (chat) await card({ actor, title: L("Travel.jump"), body: li(notes) });
  return { ...plan, made, roll: r, misjump: misjumped };
}

/**
 * Buy fuel (book p.66, p.70): refined 500cr/T, unrefined 100cr/T. Unrefined fuel sets
 * `system.unrefined`; a full tank of refined fuel clears it. Pays from `system.finances.bank`.
 * `tons` defaults to filling the usable tank. Called by the ship sheet.
 * Example: 10T refined into a 40T tank holding 30T: fuel 30 -> 40, bank -5,000cr.
 * @param {Actor} actor  ship
 * @param {{tons?: number|null, type?: "refined"|"unrefined", pay?: boolean, chat?: boolean}} [o]
 * @returns {Promise<{tons: number, cost: number}>}
 */
export async function refuel(actor, { tons = null, type = "refined", pay = true, chat = true } = {}) {
  const s = actor.system;
  const space = Math.max(0, s.fuelState.capacity - s.fuel.value);
  const t = Math.min(space, tons === null ? space : Math.max(0, Number(tons) || 0));
  const cost = t * (OPS.FUEL_PRICE[type] ?? 500);
  const update = { "system.fuel.value": s.fuel.value + t, "system.unrefined": type === "unrefined" || (s.fuelState.unrefined && type !== "refined") };
  if (pay) update["system.finances.bank"] = s.finances.bank - cost;
  await actor.update(update);
  if (chat) await card({ actor, title: L("Travel.refuel"), body: li([L("Travel.refuelled", { n: t, type: L(`Fuel.${type}`), cost: credits(cost) })]) });
  return { tons: t, cost };
}

/**
 * Roll a spacing procedure time (book p.66) and post it. Does not write. Called by the ship sheet.
 * @param {Actor} actor  ship
 * @param {"prepare"|"departure"|"arrival"} [step]
 * @returns {Promise<number>} hours, or minutes for departure
 */
export async function procedure(actor, step = "prepare") {
  // PROCEDURE holds "1D" or "1D*10" (p.66); the shared dice parser has no "*", so split it here.
  const [expr, mult = 1] = String(TR.PROCEDURE[step] ?? TR.PROCEDURE.prepare).split("*");
  const n = dice().roll(expr) * Number(mult);
  const unit = step === "departure" ? L("Unit.minutes") : L("Unit.hours");
  await card({ actor, title: L(`Procedure.${step}`), body: `<p>${n} ${unit}</p><p>${L(`Procedure.${step}Hint`)}</p>` });
  return n;
}

/**
 * Encounter check per day of travel (book p.66): 1D, 6+ is an encounter. Posts the rolls.
 * Called by the ship sheet.
 * @param {Actor} actor  ship
 * @param {{days?: number}} [o]
 * @returns {Promise<{results: number[], encounters: number}>}
 */
export async function encounterCheck(actor, { days = 1 } = {}) {
  const results = Array.from({ length: days }, () => dice().roll("1D"));
  const hits = results.filter(r => r >= TR.PROCEDURE.encounterTarget).length;
  await card({ actor, title: L("Procedure.encounter"), body: `<p>${results.join(", ")}</p><p>${hits ? L("Procedure.encounters", { n: hits }) : L("Procedure.noEncounter")}</p>` });
  return { results, encounters: hits };
}
