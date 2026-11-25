/** Damage to persons, creatures, and craft (book p.34, p.43, p.49, p.110). */
import { PHYSICAL } from "../config.mjs";
import { localizer, postCard } from "../shared/foundry.mjs";
import { d6 } from "../shared/dice.mjs";
import { distributeDamage, injuryState, creatureState, armourReaction } from "./rules/injury.mjs";
import { isPerson, isCraft } from "./rules/attack.mjs";

const L = localizer("SPACER");
const physical = a => Object.fromEntries(PHYSICAL.map(k => [k, a.system.characteristics[k].value]));

/**
 * Apply damage to an actor and post a summary card (templates/play/chat/damage.hbs).
 * - Characters and NPCs: END first, then STR/DEX (p.43); the equipped Ablat or Reflec armour may
 *   negate the hit (p.34). Writes `system.characteristics.<str|dex|end>.value`, or the armour's
 *   `system.damaged`.
 *   Example: END 7, STR 8, DEX 9 takes 10 -> END 0, then 3 split: STR 6, DEX 8 (odd point by 1D).
 * - Creatures: writes `system.hits.value` (p.110). Example: hits 18 takes 9 -> 9 (pinned).
 * - Vehicles and ships: hands the damage to the craft area (game.spacer.craft.damageCraft), which posts its own card.
 * Called by the "play-damage" chat button, the sheets, fall(), the craft area, and macros.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [opts]
 * @param {boolean} [opts.energy=false]       the hit comes from an energy weapon (Reflec)
 * @param {number} [opts.dice=0]              number of damage dice (Ablat and Reflec negate 2D-6D)
 * @param {boolean} [opts.ignoreArmour=false] falls, poison, vacuum, ...
 * @param {string} [opts.source]              what dealt the damage, for the card
 * @param {boolean} [opts.chat=true]
 * @param {() => number} [opts.roll1d]        1D roller for random STR/DEX (tests)
 * @returns {Promise<object|null>} persons and creatures: {amount, negated, trait, before, after, state};
 *          craft: the craft area's result
 */
export async function applyDamage(actor, amount, { energy = false, dice = 0, ignoreArmour = false, source = "", chat = true, roll1d = d6 } = {}) {
  if (!actor) return null;
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if (isCraft(actor)) return applyCraftDamage(actor, amount, { chat });
  const lines = [];
  let result;

  if (actor.type === "creature") {
    const before = { hits: actor.system.hits.value };
    const after = { hits: Math.max(0, before.hits - amount) };
    await actor.update({ "system.hits.value": after.hits });
    lines.push({ label: L("Creature.Hits"), before: before.hits, after: after.hits });
    result = { amount, negated: false, trait: null, before, after, state: creatureState(after.hits, actor.system.hits.max) };
  } else if (isPerson(actor)) {
    const armour = actor.items.get(actor.system.armor?.itemId ?? "");
    const reaction = ignoreArmour ? { negated: false } : armourReaction(armour ? { traits: armour.system.traits, damaged: armour.system.damaged } : null, { energy, dice });
    const before = physical(actor);
    if (reaction.negated) {
      await armour.update({ "system.damaged": true });
      result = { amount, negated: true, trait: reaction.trait, before, after: before, state: injuryState(before) };
    } else {
      const dist = distributeDamage(before, amount, roll1d);
      const update = {};
      for (const k of PHYSICAL) {
        if (dist.after[k] !== before[k]) update[`system.characteristics.${k}.value`] = dist.after[k];
        lines.push({ label: L(`Char.${k}`), before: before[k], after: dist.after[k], changed: dist.after[k] !== before[k] });
      }
      if (Object.keys(update).length) await actor.update(update);
      result = { amount, negated: false, trait: null, before, after: dist.after, state: injuryState(dist.after), randomTo: dist.randomTo };
    }
  } else {
    ui.notifications.warn(L("Damage.Unsupported", { name: actor.name }));
    return null;
  }

  if (chat) {
    await postCard({
      area: "play",
      actor,
      template: "chat/damage",
      data: {
        name: actor.name, amount, source,
        negated: result.negated,
        negatedText: result.negated ? L(`Damage.Negated${result.trait}`, { armour: actor.items.get(actor.system.armor?.itemId ?? "")?.name ?? "" }) : "",
        lines: lines.filter(l => l.changed !== false),
        randomTo: result.randomTo ? L(`Char.${result.randomTo}`) : "",
        state: result.state,
        stateLabel: L(`Injury.${result.state}`)
      },
      flags: { damage: { amount, state: result.state } }
    });
  }
  return result;
}

/**
 * Damage from a personal weapon to a vehicle or ship, through the craft area
 * (`game.spacer.craft.damageCraft`, else `damageVehicle` / `damageShip`). The amount is already
 * converted to vehicle damage by the attack (1 per hit, p.49); `source: "personal"` tells the craft
 * area so. Called by applyDamage.
 * @returns {Promise<object|null>} the craft area's result, or null when the craft area is missing
 */
async function applyCraftDamage(actor, amount, { chat = true } = {}) {
  const craft = game.spacer?.craft ?? {};
  const fn = craft.damageCraft ?? (actor.type === "ship" ? craft.damageShip : craft.damageVehicle);
  if (typeof fn !== "function") {
    ui.notifications.warn(L("Damage.Unsupported", { name: actor.name }));
    return null;
  }
  return fn(actor, amount, { source: "personal", chat });
}
