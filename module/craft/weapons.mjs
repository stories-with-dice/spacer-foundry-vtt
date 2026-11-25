/**
 * Mounted weapons on ships and vehicles (book p.49, p.76, p.84-86): gunner rolls, missiles,
 * damage rolls, and the chat buttons that apply the hits.
 */
import { rollTask, rollBookDice } from "../play/api.mjs";
import { resolveActor, pickActors, setting, signed } from "../shared/foundry.mjs";
import * as SC from "./rules/space-combat.mjs";
import * as VR from "./rules/vehicles.mjs";
import { L, esc, card, crewFor, PERSON_TYPES } from "./common.mjs";
import { applyHit } from "./damage.mjs";

/** Actor types a mounted weapon can hit. */
const TARGET_TYPES = ["ship", "vehicle", ...PERSON_TYPES];

/** Damage source of a weapon by the actor that carries it: ship -> "starship", vehicle -> "vehicle" (p.49). */
const sourceOf = actor => (actor.type === "ship" ? "starship" : "vehicle");

/** A chat button that applies a hit (craft-hit) or resolves a missile impact (craft-missile). */
function hitButton(action, label, target, data) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
  return `<button type="button" data-action="${action}" ${attrs} data-target="${esc(target?.uuid ?? "")}">${label}${target ? `: ${esc(target.name)}` : ""}</button>`;
}

/** The gunner's attack DMs: space range and weapon DMs for ships, speed difference for vehicles. */
function attackParts(actor, w, target, { range, location, evade, dm }) {
  if (actor.type === "ship") return SC.attackDM({ range, energy: SC.isEnergyWeapon(w), called: !!location, evade, other: dm });
  const speed = target?.type === "vehicle" ? VR.speedAttackDM(actor.system.currentSpeed, target.system.currentSpeed) : 0;
  const called = location ? SC.CALLED_SHOT_DM : 0;
  const other = Number(dm) || 0;
  return { total: speed + called + other, parts: { speed, called, other } };
}

/**
 * Fire a mounted weapon (book p.49, p.76, p.84-86). Turrets, beams, and vehicle weapons: the
 * gunner's Gunner roll (8+) with range, energy, called-shot, and speed DMs; on a hit, roll damage.
 * Missile racks do not roll: see fireMissiles. Posts a card with an "Apply hit" button
 * (craft-hit). With `target` and `apply: true` the hit is applied at once through applyHit, so a
 * person target takes x6 damage per vehicle damage point (p.49).
 * Called by the ship and vehicle sheets, the space combat helper, and macros.
 * @param {Actor} actor  ship or vehicle
 * @param {Item|string} itemRef  shipWeapon item or id
 * @param {object} [o]
 * @param {string} [o.range="close"]   space range band (ships)
 * @param {string} [o.location]        called shot location (-2 DM)
 * @param {number} [o.dm=0]
 * @param {number} [o.evade=0]         target pilot's evade effect (gunner DM)
 * @param {Actor|string} [o.target]    ship, vehicle, character, NPC, or creature
 * @param {Actor|string} [o.gunner]
 * @param {number} [o.missiles=1]      missiles fired from a rack (1-4)
 * @param {number} [o.beamRounds=1]    rounds a beam has held contact
 * @param {boolean} [o.apply=false]
 * @param {boolean} [o.evadeMissiles=true]  with `apply`, the target's pilot tries to evade missiles
 * @param {number} [o.thrust=0]        target's unused thrust for the missile evade roll
 * @param {boolean} [o.sandcaster=false]    target uses sandcasters against missiles
 * @returns {Promise<object|null>} `{ result, damage, damageRoll, shots, gunner, applied }`, null when the weapon cannot fire
 */
export async function fireWeapon(actor, itemRef, o = {}) {
  const { range = "close", location = "", dm = 0, evade = 0, target = null, gunner = null, beamRounds = 1, apply = false } = o;
  const item = typeof itemRef === "string" ? actor.items.get(itemRef) : itemRef;
  if (!item) throw new Error("No weapon");
  if (item.system.destroyed || item.system.disabled) {
    ui.notifications.warn(L("Warn.weaponOut", { name: item.name }));
    return null;
  }
  const w = { name: item.name, mount: item.system.mount, traits: item.system.traits };
  const targetActor = await resolveActor(target);
  if (SC.isMissile(w)) return fireMissiles(actor, item, targetActor, o);

  const shooter = (await resolveActor(gunner)) ?? (await resolveActor(item.system.gunner)) ?? crewFor(actor, "gunner") ?? (actor.type === "vehicle" ? crewFor(actor) : null);
  const parts = attackParts(actor, w, targetActor, { range, location, evade, dm });
  const result = await rollTask({ actor: shooter, skill: "Gunner", dm: parts.total, label: `${actor.name}: ${item.name}${shooter ? "" : ` (${L("Card.noGunner")})`}` });
  let damage = 0;
  let damageRoll = null;
  if (result.success) {
    if (SC.isBeam(w)) damage = Math.max(1, beamRounds);
    else { damageRoll = await rollBookDice(item.system.damage || "1"); damage = damageRoll.total; }
  }
  const source = sourceOf(actor);
  const dmText = Object.entries(parts.parts).filter(([, v]) => v).map(([k, v]) => `${L(`DM.${k}`)} ${signed(v)}`).join(", ");
  let body = `<p>${dmText || L("DM.none")}</p>`;
  if (result.success) {
    body += `<p>${L("Card.weaponHit", { damage })}</p>`;
    body += hitButton("craft-hit", L("Card.applyHit"), targetActor, { amount: damage, location, source });
  } else body += `<p>${L("Card.miss")}</p>`;
  await card({ actor, title: L("Card.fire", { name: item.name }), body });
  let applied = null;
  if (result.success && apply && targetActor) applied = await applyHit(targetActor, damage, { location, source });
  return { result, damage, damageRoll, shots: 1, gunner: shooter, applied };
}

/**
 * Fire a missile rack (book p.76, p.84): 1-4 missiles, 1 damage each (or the item damage), no
 * Gunner roll. Spends ammunition (`system.ammo.value`) and posts a card with the impact delay and
 * two buttons: "Resolve impact" (craft-missile: the target may evade) and "Apply hit" (craft-hit).
 * With `apply: true` and a target, resolves the impact at once through missileImpact.
 * @returns {Promise<object|null>} `{ result: null, missile: true, damage, shots, delay, gunner: null, applied }`
 */
async function fireMissiles(actor, item, targetActor, { range = "close", missiles = 1, apply = false, evadeMissiles = true, thrust = 0, sandcaster = false } = {}) {
  const tracked = item.system.ammo.max > 0;
  if (tracked && item.system.ammo.value <= 0) { ui.notifications.warn(L("Warn.noAmmo", { name: item.name })); return null; }
  const shots = SC.missileSalvo(missiles, tracked ? item.system.ammo.value : SC.MISSILES_PER_SALVO.max);
  if (tracked) await item.update({ "system.ammo.value": item.system.ammo.value - shots });
  const perMissile = Number(item.system.damage) || SC.MISSILE_DAMAGE;
  const damage = shots * perMissile;
  const delay = SC.missileDelay(range);
  const source = sourceOf(actor);
  const data = { amount: damage, shots, per: perMissile, source };
  const body = `<p>${L("Card.missileLaunched", { n: shots, damage })} ${L("Card.missileDelay", { n: delay })}.</p>`
    + `<p>${L("Card.missileAuto")}</p>`
    + hitButton("craft-missile", L("Card.resolveMissiles"), targetActor, data)
    + hitButton("craft-hit", L("Card.applyHit"), targetActor, { amount: damage, location: "", source });
  await card({ actor, title: L("Card.fire", { name: item.name }), body });
  let applied = null;
  if (apply && targetActor) applied = await missileImpact(targetActor, { shots, damagePerMissile: perMissile, source, evade: evadeMissiles, thrust, sandcaster });
  return { result: null, missile: true, damage, damageRoll: null, shots, delay, gunner: null, applied };
}

/**
 * Resolve missiles reaching their target (book p.84 step 4): a ship target with thrust may evade
 * with its pilot's Pilot (Starship) 8+, adding its unused thrust (and +2 for sandcasters, see
 * SANDCASTER_MISSILE_DM). If it fails or cannot evade, the hit goes through applyHit.
 * Posts a card. Called by fireMissiles and the craft-missile chat button.
 * @param {Actor} target
 * @param {object} o
 * @param {number} o.shots
 * @param {number} [o.damagePerMissile=1]
 * @param {"starship"|"vehicle"} [o.source="starship"]
 * @param {boolean} [o.evade=true]     let the target's pilot try to evade
 * @param {number} [o.thrust=0]        the target's unused thrust this round
 * @param {boolean} [o.sandcaster=false]
 * @param {boolean} [o.jammed=false]   the target's sensor operator jammed the missiles (p.85)
 * @returns {Promise<{hit: boolean, evaded: boolean, jammed: boolean, damage: number, roll: object|null, applied: object|null}>}
 */
export async function missileImpact(target, { shots, damagePerMissile = SC.MISSILE_DAMAGE, source = "starship", evade = true, thrust = 0, sandcaster = false, jammed = false } = {}) {
  let roll = null;
  if (evade && !jammed && target.type === "ship" && target.system.effective.thrust > 0) {
    roll = await rollTask({
      actor: crewFor(target, "pilot"), ...SC.EVADE_SKILL, dm: SC.missileEvadeDM({ thrust, sandcaster }),
      target: SC.MISSILE_EVADE_TARGET, label: L("Card.missileEvadeRoll", { name: target.name })
    });
  }
  const res = SC.resolveMissiles({ shots, damagePerMissile, evadeTotal: roll?.total ?? null, jammed });
  const applied = res.hit ? await applyHit(target, res.damage, { source }) : null;
  const text = res.jammed ? L("Card.missileJammed") : res.evaded ? L("Card.missileEvaded", { name: target.name }) : L("Card.missileHit", { name: target.name, damage: res.damage });
  await card({ actor: target, title: L("Card.missileImpact"), body: `<p>${esc(text)}</p>` });
  return { ...res, roll, applied };
}

/** The target of a hit button: the stored UUID, else a targeted or controlled token's actor. */
async function buttonTarget(uuid) {
  const stored = await resolveActor(uuid || null);
  if (stored) return stored;
  return (await pickActors()).find(a => TARGET_TYPES.includes(a.type)) ?? null;
}

/** A ship's unused thrust this round, read from the space combat helper's world setting. */
function unusedThrust(ship) {
  const entry = (setting("craftCombat", {})?.ships ?? []).find(s => s.uuid === ship.uuid);
  return entry ? Math.max(0, ship.system.effective.thrust - (entry.thrustUsed ?? 0)) : 0;
}

/** Check a button target; warn and return null when there is none or the user does not own it. */
async function ownedTarget(uuid) {
  const target = await buttonTarget(uuid);
  if (!target) { ui.notifications.warn(L("Warn.noTarget")); return null; }
  if (!target.isOwner) { ui.notifications.warn(L("Warn.notOwner")); return null; }
  return target;
}

/**
 * Chat button handlers of the weapons cards, registered by register.mjs through
 * registerChatActions. `craft-hit` applies the damage; `craft-missile` resolves a missile impact.
 */
export const weaponChatActions = {
  "craft-hit": async (event, button) => {
    const ds = button.dataset;
    const target = await ownedTarget(ds.target);
    if (target) await applyHit(target, Number(ds.amount) || 0, { location: ds.location || "", source: ds.source || "vehicle" });
  },
  "craft-missile": async (event, button) => {
    const ds = button.dataset;
    const target = await ownedTarget(ds.target);
    if (!target) return;
    const thrust = target.type === "ship" ? unusedThrust(target) : 0;
    await missileImpact(target, { shots: Number(ds.shots) || 1, damagePerMissile: Number(ds.per) || 1, source: ds.source || "starship", thrust });
  }
};
