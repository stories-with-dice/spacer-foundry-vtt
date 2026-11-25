/** Healing: points, natural rest, and first aid (book p.37, p.106). */
import { PHYSICAL } from "../config.mjs";
import { localizer, postCard } from "../shared/foundry.mjs";
import { randomDie } from "../shared/dice.mjs";
import { naturalHealing as healDays, healPoints, firstAidResult, needsSurgery } from "./rules/character.mjs";
import { isPerson } from "./rules/attack.mjs";
import { rollTask } from "./task.mjs";

const L = localizer("SPACER");

/**
 * Heal a number of points. Persons get END first, then the lower of STR and DEX; creatures get
 * hits. Writes `system.characteristics.<str|dex|end>.value` or `system.hits.value`.
 * Example: END 0/7, STR 5/8, DEX 8/9, heal 9 -> END 7, STR 7, DEX 8.
 * Called by the sheets, drugs, and macros.
 * @returns {Promise<object[]|null>} the changed lines ({label, before, after})
 */
export async function heal(actor, amount, { chat = true, source = "" } = {}) {
  if (!actor) return null;
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  let lines = [];
  if (actor.type === "creature") {
    const v = Math.min(actor.system.hits.max, actor.system.hits.value + amount);
    lines.push({ label: L("Creature.Hits"), before: actor.system.hits.value, after: v });
    await actor.update({ "system.hits.value": v });
  } else if (isPerson(actor)) {
    const after = healPoints(actor.system.characteristics, amount);
    lines = updateLines(actor, after);
    await actor.update(Object.fromEntries(PHYSICAL.map(k => [`system.characteristics.${k}.value`, after[k]])));
  } else return null;
  if (chat) await healCard(actor, L("Heal.Healed", { amount }), lines, source);
  return lines;
}

/**
 * Natural healing (p.106): 1 point of STR, DEX, and END per day of rest while END is above 0.
 * Medical care doubles the rate. Creatures recover the same number of hits.
 * Writes the characteristics and posts a card. Called by the sheet, useDrug, and macros.
 * @returns {Promise<object|null>} the rules result ({after, healed, blocked})
 */
export async function naturalHealing(actor, { days = 1, medical = false, chat = true } = {}) {
  if (!actor) return null;
  if (actor.type === "creature") return heal(actor, days * (medical ? 2 : 1), { chat });
  if (!isPerson(actor)) return null;
  const r = healDays(actor.system.characteristics, days, { medical });
  if (r.blocked) {
    if (chat) await healCard(actor, L("Heal.Blocked"), [], "");
    return r;
  }
  const lines = updateLines(actor, r.after);
  await actor.update(Object.fromEntries(PHYSICAL.map(k => [`system.characteristics.${k}.value`, r.after[k]])));
  if (chat) await healCard(actor, L(medical ? "Heal.RestMedical" : "Heal.Rest", { days }), lines, "");
  return r;
}

/** True when the healer carries a Medical Kit (gear named "Medical Kit", p.37). */
export function hasMedicalKit(healer) {
  return !!healer?.items?.some(i => i.type === "gear" && /medical kit/i.test(i.name) && i.system.carried !== false && (i.system.quantity ?? 1) > 0);
}

/**
 * First aid (p.106): a Medic roll (EDU + Medic, 8+). On a success a patient at END 0 recovers
 * 1 END, or D3 END with a Medical Kit (p.37), and can heal naturally again. Writes
 * `system.combat.firstAid` and `system.characteristics.end.value`.
 * A patient with END and STR or DEX at 0 needs surgery: first aid cannot help, so there is a warning
 * and no roll. Example: END 0/7 with a kit and a D3 of 2 -> END 2.
 * Called by the sheet ("First aid" button) and macros.
 * @param {Actor} patient
 * @param {object} [o]
 * @param {Actor} [o.healer=patient]
 * @param {number} [o.dm=0]
 * @param {boolean} [o.kit]     the healer uses a Medical Kit; default: the healer carries one
 * @param {(sides: number) => number} [o.die]  die for the D3 (tests)
 * @returns {Promise<object|null>} the rollTask result plus `aid` (rules result), or null
 */
export async function firstAid(patient, { healer, dm = 0, kit, die = randomDie() } = {}) {
  if (!isPerson(patient)) return null;
  healer ??= patient;
  if (needsSurgery(patient.system.characteristics)) {
    ui.notifications.warn(L("Heal.Surgery", { name: patient.name }));
    return null;
  }
  kit ??= hasMedicalKit(healer);
  const r = await rollTask({ actor: healer, characteristic: "edu", skill: "Medic", dm, label: L("Heal.FirstAidOn", { name: patient.name }) });
  if (!r.success) return r;
  const aid = firstAidResult(patient.system.characteristics, { kit, die });
  const update = { "system.combat.firstAid": true };
  if (aid.gained) update["system.characteristics.end.value"] = aid.after;
  await patient.update(update);
  const lines = aid.gained ? [{ label: L("Char.end"), before: aid.before, after: aid.after }] : [];
  const source = aid.roll !== null ? `${healer.name} · ${L("Heal.KitRoll", { n: aid.roll })}` : healer.name;
  await healCard(patient, L("Heal.FirstAidDone"), lines, source);
  return { ...r, aid };
}

function updateLines(actor, after) {
  return PHYSICAL.map(k => ({ label: L(`Char.${k}`), before: actor.system.characteristics[k].value, after: after[k] }))
    .filter(l => l.before !== l.after);
}

function healCard(actor, title, lines, source) {
  return postCard({ area: "play", actor, template: "chat/heal", data: { name: actor.name, title, lines, source } });
}
