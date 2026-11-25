/**
 * Space combat crew actions (book p.84-85): one roll per crew position per round.
 */
import { rollTask } from "../play/api.mjs";
import { resolveActor } from "../shared/foundry.mjs";
import * as SC from "./rules/space-combat.mjs";
import { L, card, crewFor } from "./common.mjs";

/**
 * Roll a space combat crew action (book p.84-85) for the crew member in `position`.
 * Automatic actions post a card without a roll. Engineer overload and astrogator emergency
 * calculation use their special targets; a failed overload adds the effect to
 * `system.power.damage`. Every roll takes the ship's lack-of-maintenance DM (p.72).
 * Called by the space combat helper and macros.
 * @param {Actor} ship
 * @param {string} position   key of SC.CREW_ACTIONS (pilot, engineer, ...)
 * @param {string} actionKey
 * @param {{actor?: Actor|string|null, dm?: number, roundsSpent?: number, thrust?: number}} [o]
 * @returns {Promise<{auto: true}|{roll: object}>}
 */
export async function crewAction(ship, position, actionKey, { actor = null, dm = 0, roundsSpent = 0, thrust = 0 } = {}) {
  const action = (SC.CREW_ACTIONS[position] ?? []).find(a => a.key === actionKey) ?? SC.CREW_ACTIONS.any.find(a => a.key === actionKey);
  if (!action) throw new Error(`Unknown crew action ${position}.${actionKey}`);
  const who = (await resolveActor(actor)) ?? crewFor(ship, position);
  const label = `${ship.name}: ${L(`Crew.${position}`)} — ${L(`Action.${actionKey}`)}`;
  if (action.auto || !action.skill) {
    await card({ actor: ship, title: label, body: `<p>${L(`ActionHint.${actionKey}`)}</p>` });
    return { auto: true };
  }
  const target = actionKey === "emergencyJump" ? SC.emergencyJumpTarget(roundsSpent) : action.target;
  const extra = action.thrust ? Math.max(0, Number(thrust) || 0) : 0;
  const r = await rollTask({ actor: who, skill: action.skill, specialty: action.specialty ?? "", dm: (Number(dm) || 0) + extra + ship.system.maintenance.dm, target, label });
  let note = L(`ActionHint.${actionKey}`);
  if (actionKey === "overload") {
    const o = SC.overloadResult(r.total);
    note = o.success ? L("Action.overloadOk", { n: o.steps }) : L("Action.overloadFail", { n: o.damage });
    if (!o.success) await ship.update({ "system.power.damage": ship.system.power.damage + o.damage });
  } else if (actionKey === "evade" && r.success) note = L("Action.evadeOk", { n: r.effect });
  await card({ actor: ship, title: label, body: `<p>${note}</p>` });
  return { roll: r };
}
