/** Damage, healing, and injury status (book p.34, p.43, p.106, p.110). */
import { PHYSICAL } from "../config.mjs";
import { distributeDamage, injuryState, creatureState, armourReaction } from "./rules/combat.mjs";
import { naturalHealing as healDays, healPoints } from "./rules/character.mjs";
import { L, postCard, d6 } from "./util.mjs";
import { rollTask } from "./task.mjs";

const isPerson = a => a?.type === "character" || a?.type === "npc";
const physical = a => Object.fromEntries(PHYSICAL.map(k => [k, a.system.characteristics[k].value]));

/** Status ids this area manages on tokens. */
export const INJURY_STATUSES = ["wounded", "pinned", "unconscious", "dead"];

/**
 * Apply damage to an actor and post a summary card.
 * Characters and NPCs: END first, then STR/DEX (p.43); the equipped Ablat or Reflec armour may
 * negate the hit (p.34). Creatures: subtract from hits (p.110).
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [opts]
 * @param {boolean} [opts.energy=false]       the hit comes from an energy weapon (Reflec)
 * @param {number} [opts.dice=0]              number of damage dice (Ablat negates 2D-6D)
 * @param {boolean} [opts.ignoreArmour=false] falls, poison, vacuum, ...
 * @param {string} [opts.source]              what dealt the damage, for the card
 * @param {boolean} [opts.chat=true]
 * @param {() => number} [opts.roll1d]        1D roller for random STR/DEX (tests)
 * @returns {Promise<{amount: number, negated: boolean, trait: string|null, before: object, after: object, state: string}|null>}
 */
export async function applyDamage(actor, amount, { energy = false, dice = 0, ignoreArmour = false, source = "", chat = true, roll1d = d6 } = {}) {
  if (!actor) return null;
  amount = Math.max(0, Math.floor(Number(amount) || 0));
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
 * Heal a number of points: persons get END first, then the lower of STR and DEX; creatures get hits.
 * @returns {Promise<object|null>} the new values
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

/**
 * First aid (p.106): a Medic roll (EDU + Medic, 8+). On a success a patient at END 0 recovers
 * 1 END and can heal naturally again. Also stops animal poison (p.113).
 * @param {Actor} patient
 * @param {object} [o]
 * @param {Actor} [o.healer=patient]
 * @param {number} [o.dm=0]
 */
export async function firstAid(patient, { healer, dm = 0 } = {}) {
  if (!isPerson(patient)) return null;
  healer ??= patient;
  const r = await rollTask({ actor: healer, characteristic: "edu", skill: "Medic", dm, label: L("Heal.FirstAidOn", { name: patient.name }) });
  if (r.success) {
    const update = { "system.combat.firstAid": true };
    const end = patient.system.characteristics.end;
    if (end.value <= 0) update["system.characteristics.end.value"] = 1;
    await patient.update(update);
    await healCard(patient, L("Heal.FirstAidDone"), end.value <= 0 ? [{ label: L("Char.end"), before: 0, after: 1 }] : [], healer.name);
  }
  return r;
}

function updateLines(actor, after) {
  return PHYSICAL.map(k => ({ label: L(`Char.${k}`), before: actor.system.characteristics[k].value, after: after[k] }))
    .filter(l => l.before !== l.after);
}

async function healCard(actor, title, lines, source) {
  return postCard({ actor, template: "chat/heal", data: { name: actor.name, title, lines, source } });
}

/** One status sync at a time per actor, so fast updates do not toggle the same effect twice. */
const statusQueue = new WeakMap();

/**
 * Show the injury state on the actor's tokens (p.43, p.110): wounded (persons at END 0), pinned
 * (creatures at 1/2 hits), unconscious, dead (overlay). Only the most severe status is set.
 */
export function syncInjuryStatus(actor) {
  if (!actor || typeof actor.toggleStatusEffect !== "function") return Promise.resolve();
  const next = (statusQueue.get(actor) ?? Promise.resolve()).then(() => doSyncInjuryStatus(actor));
  statusQueue.set(actor, next.catch(() => {}));
  return next;
}

async function doSyncInjuryStatus(actor) {
  if (!actor.isOwner || (actor.collection && !actor.collection.has(actor.id) && !actor.isToken)) return;
  let state;
  if (isPerson(actor) || actor.type === "creature") state = actor.system.injury?.label ?? "healthy";
  else return;
  for (const id of INJURY_STATUSES) {
    if (!CONFIG.statusEffects.some(s => s.id === id)) continue;
    const active = state === id;
    if (actor.statuses.has(id) !== active) await actor.toggleStatusEffect(id, { active, overlay: id === "dead" });
  }
}
