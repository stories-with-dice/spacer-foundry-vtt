/**
 * Shared play API. Other areas (craft, chargen, tools) import from here.
 * The "play" area owns this file and may extend it, but must keep these signatures.
 */
import { TASK_TARGET, UNTRAINED_DM, bookDice } from "../config.mjs";

/**
 * Effective rank of a skill on an actor (book p.28): the specialty item's rank, else the base
 * skill's rank (a rank-0 base skill covers all its specialties), else UNTRAINED_DM (-3).
 * @param {Actor} actor
 * @param {string} skill      base name, e.g. "Melee"; also accepts "Melee (Blade)"
 * @param {string} [specialty]
 * @returns {number}
 */
export function skillRank(actor, skill, specialty = "") {
  if (!skill) return 0;
  const m = String(skill).match(/^(.*?)\s*\((.*)\)\s*$/);
  if (m) { skill = m[1]; specialty = specialty || m[2]; }
  const norm = s => String(s ?? "").trim().toLowerCase();
  const skills = actor?.items?.filter(i => i.type === "skill" && norm(i.system.skill || i.name) === norm(skill)) ?? [];
  if (specialty) {
    const spec = skills.find(i => norm(i.system.specialty) === norm(specialty));
    if (spec) return spec.system.rank;
  }
  const base = skills.find(i => !i.system.specialty);
  if (base) return base.system.rank;
  if (!specialty && skills.length) return Math.max(...skills.map(i => i.system.rank));
  return UNTRAINED_DM;
}

/**
 * Roll a 2D task (book p.14) and post a chat card.
 * @param {object} o
 * @param {Actor} [o.actor]
 * @param {string} [o.characteristic]  "str" | "dex" | ... | "psi" | ""
 * @param {string} [o.skill]           base or full skill name; "" = no skill
 * @param {string} [o.specialty]
 * @param {number} [o.dm=0]            other DMs
 * @param {number} [o.target=8]
 * @param {string} [o.label]           card title
 * @param {string} [o.formula="2d6"]   dice part, e.g. "3d6kh2" for boon
 * @param {boolean} [o.chat=true]
 * @returns {Promise<{roll: Roll, total: number, natural: number, effect: number, success: boolean, boxcars: boolean, snakeEyes: boolean, message?: ChatMessage}>}
 */
export async function rollTask({ actor, characteristic = "", skill = "", specialty = "", dm = 0, target = TASK_TARGET, label = "", formula = "2d6", chat = true } = {}) {
  const parts = [formula];
  const data = {};
  if (characteristic && actor?.system?.dm) { parts.push("@char"); data.char = actor.system.dm[characteristic] ?? 0; }
  if (skill) { parts.push("@skill"); data.skill = skillRank(actor, skill, specialty); }
  if (dm) { parts.push("@dm"); data.dm = dm; }
  const roll = await new Roll(parts.join(" + "), data).evaluate();
  const natural = roll.dice[0]?.total ?? roll.total;
  const faces = roll.dice[0]?.results?.filter(r => r.active).map(r => r.result) ?? [];
  const boxcars = faces.length === 2 && faces.every(f => f === 6);
  const snakeEyes = faces.length === 2 && faces.every(f => f === 1);
  const effect = roll.total - target;
  const result = { roll, total: roll.total, natural, effect, success: effect >= 0, boxcars, snakeEyes };
  if (chat) {
    const title = label || [skill && (specialty ? `${skill} (${specialty})` : skill), characteristic.toUpperCase()].filter(Boolean).join(" / ") || "Task";
    const flavor = `<strong>${title}</strong> — ${target}+ · ${result.success ? "Success" : "Failure"} (Effect ${effect >= 0 ? "+" : ""}${effect})${boxcars ? " · Absolute success" : ""}${snakeEyes ? " · Absolute failure" : ""}`;
    result.message = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor, flags: { spacer: { task: { target, effect, success: result.success, characteristic, skill, specialty } } } });
  }
  return result;
}

/** Roll book dice ("2D+3", "D3", "D66") and return the Roll. */
export async function rollBookDice(formula, data = {}) {
  return new Roll(bookDice(formula), data).evaluate();
}
