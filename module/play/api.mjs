/**
 * Public API of the play area (`game.spacer.play`). Other areas (craft, chargen, tools) import from
 * here. Keep these signatures: skillRank(actor, skill, specialty), rollTask({...}),
 * rollBookDice(formula, data), applyDamage(actor, amount, opts), heal(actor, amount, opts).
 */
import { taskDialog, rollTask as roll } from "./task.mjs";

export { skillRank, rollTask, rollBookDice, taskDialog, hasSpecialty } from "./task.mjs";
export { applyDamage } from "./damage.mjs";
export { heal, naturalHealing, firstAid, hasMedicalKit } from "./healing.mjs";
export { syncInjuryStatus } from "./status.mjs";
export { attack, prepareAttack, computeAttack, targetDifficulty } from "./attack.mjs";
export { reloadWeapon, unjamWeapon, resistStun, isMelee, isEnergy } from "./weapons.mjs";
export { usePsionic, recoverPsi, psiLimit } from "./psionics.mjs";
export { useDrug } from "./drugs.mjs";
export { resetCombatCounters, sprint, moraleCheck, combatMorale, isOut } from "./combat-state.mjs";
export { trainSkill, fall } from "./training.mjs";

/**
 * Roll a characteristic check (2D + DM, 8+). Opens the task dialog unless `dialog` is false.
 * Called by macros and other areas.
 * @returns {Promise<object|null>} the rollTask result, or null when the dialog is closed
 */
export async function rollCharacteristic(actor, key, { dialog = true, dm = 0, target = 8 } = {}) {
  if (!dialog) return roll({ actor, characteristic: key, dm, target });
  return taskDialog(actor, { characteristic: key, dm, target });
}
