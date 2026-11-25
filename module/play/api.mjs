/**
 * Shared play API. Other areas (craft, chargen, tools) import from here.
 * The "play" area owns this file and may extend it, but must keep these signatures:
 * skillRank(actor, skill, specialty), rollTask({...}), rollBookDice(formula, data).
 */
export { skillRank, rollTask, rollBookDice, taskDialog, hasSpecialty } from "./task.mjs";
export { applyDamage, heal, naturalHealing, firstAid, syncInjuryStatus } from "./damage.mjs";
export { attack, prepareAttack, computeAttack, targetDifficulty, reloadWeapon, unjamWeapon, resistStun, isMelee, isEnergy } from "./attack.mjs";
export {
  usePsionic, recoverPsi, psiLimit, useDrug, resetCombatCounters, sprint, moraleCheck, combatMorale, trainSkill, fall, isOut
} from "./abilities.mjs";

import { taskDialog, rollTask as roll } from "./task.mjs";

/** Roll a characteristic check (2D + DM, 8+). Opens the task dialog unless `dialog` is false. */
export async function rollCharacteristic(actor, key, { dialog = true, dm = 0, target = 8 } = {}) {
  if (!dialog) return roll({ actor, characteristic: key, dm, target });
  return taskDialog(actor, { characteristic: key, dm, target });
}
