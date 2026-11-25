/** Weapon state outside the attack roll: weapon kind, reload, unjam (book p.33, p.42, p.44). */
import { localizer, postCard } from "../shared/foundry.mjs";
import { parseTraits } from "./rules/combat.mjs";
import { isPerson } from "./rules/attack.mjs";
import { rollTask } from "./task.mjs";

const L = localizer("SPACER");

/**
 * True for melee weapons. Reads `system.category`, else the skill name ("Melee Combat").
 * Called by prepareAttack, the defender's melee rank, and the actor sheets.
 * @param {Item|{system: object}} weapon
 */
export function isMelee(weapon) {
  const s = weapon?.system ?? {};
  if (s.category) return s.category === "melee";
  return /melee/i.test(s.skill ?? "");
}

/**
 * True for weapons that fire energy beams (Reflec deflects them, p.34). Reads `system.category`
 * and `system.specialty`. Called by attack() to flag the hit for applyDamage.
 * @param {Item|{system: object}} weapon
 */
export function isEnergy(weapon) {
  const s = weapon?.system ?? {};
  return s.category === "energy" || /energy/i.test(s.specialty ?? "");
}

/**
 * Reload a weapon to full (p.44): writes `system.ammo` = `system.rounds`, gives the person Evade
 * (`system.combat.evading`), and posts a note card. Called by the sheet and SpacerItem#reload.
 * @returns {Promise<number|null>} the new ammo, or null when the weapon has no magazine
 */
export async function reloadWeapon(actor, weapon) {
  if (!weapon || weapon.system.rounds <= 0) return null;
  await weapon.update({ "system.ammo": weapon.system.rounds });
  if (isPerson(actor)) await actor.update({ "system.combat.evading": true });
  const traits = parseTraits(weapon.system.traits);
  await postCard({
    area: "play", actor, template: "chat/note",
    data: { title: L("Weapon.Reloaded", { weapon: weapon.name }), text: L(traits.slowReload ? "Weapon.SlowReload" : "Weapon.ReloadNote") }
  });
  return weapon.system.ammo;
}

/**
 * Clear a jam (p.42): a DEX + weapon skill roll instead of an attack. On a success it writes
 * `system.jammed` = false. Called by the sheet.
 * @returns {Promise<object|null>} the rollTask result, or null when the weapon is not jammed
 */
export async function unjamWeapon(actor, weapon) {
  if (!weapon?.system.jammed) return null;
  const r = await rollTask({ actor, characteristic: "dex", skill: weapon.system.skill, specialty: weapon.system.specialty, label: L("Weapon.Unjam", { weapon: weapon.name }) });
  if (r.success) await weapon.update({ "system.jammed": false });
  return r;
}

/**
 * A stunned target's END check (p.33): 8+, else helpless for 1 + |effect| 10-minute intervals
 * (posted as a note card). Called by the "play-stun" chat button.
 * @returns {Promise<object>} the rollTask result
 */
export async function resistStun(actor) {
  const r = await rollTask({ actor, characteristic: "end", label: L("Attack.StunCheck", { name: actor.name }) });
  if (!r.success) {
    await postCard({
      area: "play", actor, template: "chat/note",
      data: { title: L("Attack.Stunned", { name: actor.name }), text: L("Attack.StunnedFor", { n: 1 + Math.abs(r.effect) }) }
    });
  }
  return r;
}
