/** Skill training (book p.122) and falls (p.107). */
import { localizer, signed } from "../shared/foundry.mjs";
import { trainingFor, fallDamage as fallDice } from "./rules/character.mjs";
import { rollTask, rollBookDice } from "./task.mjs";
import { applyDamage } from "./damage.mjs";

const L = localizer("SPACER");

/**
 * Train a skill to its next rank (p.122): EDU roll against the training difficulty. On a success the
 * rank goes up by 1 (writes the skill's `system.rank`). Self-guided study needs INT DM 0+ and cannot
 * pass the INT DM. Called by the sheet (skills tab).
 * @returns {Promise<object|null>} the rollTask result
 */
export async function trainSkill(actor, skill, { instructor = false } = {}) {
  if (!actor || !skill) return null;
  const next = skill.system.rank + 1;
  if (next > 5) { ui.notifications.warn(L("Train.Max")); return null; }
  const t = trainingFor(next, { instructor });
  const intDM = actor.system.dm?.int ?? 0;
  if (!instructor && (intDM < 0 || next > intDM)) { ui.notifications.warn(L("Train.SelfLimit", { dm: signed(intDM) })); return null; }
  const r = await rollTask({ actor, characteristic: "edu", target: t.target, label: L("Train.Title", { skill: skill.system.fullName || skill.name, rank: next }),
    notes: L("Train.Notes", { weeks: t.weeks, cost: t.cost.toLocaleString() }) });
  if (r.success) await skill.update({ "system.rank": next });
  return r;
}

/**
 * Falling damage (p.107) for `metres` at a planet size code: rolls the dice, posts the roll, and
 * calls applyDamage without armour. Called by macros and the tools area.
 * @returns {Promise<object|null>} the applyDamage result
 */
export async function fall(actor, metres, sizeCode = 8) {
  const dice = fallDice(sizeCode, metres);
  const roll = await rollBookDice(dice);
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: L("Hazard.Fall", { m: metres, dice }) });
  return applyDamage(actor, roll.total, { ignoreArmour: true, source: L("Hazard.FallSource") });
}
