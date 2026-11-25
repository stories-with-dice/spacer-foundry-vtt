/** Personal attack workflow (book p.33, p.40-44, p.49, p.110-113): reads documents, rolls, posts the card. */
import { bookDice } from "../config.mjs";
import { localizer, postCard, signed, setting, resolveActor, tokenOf, tokenDistance } from "../shared/foundry.mjs";
import { rangeBandForDistance, normalizeRange, parseTraits, countDice, damageBonus } from "./rules/combat.mjs";
import {
  computeAttack as computeAttackRule, defaultAttackOptions, targetDifficulty, damageToTarget, absoluteFailure, isPerson, isCraft
} from "./rules/attack.mjs";
import { canMelee } from "./rules/character.mjs";
import { rollTask, skillRank, hasSpecialty } from "./task.mjs";
import { isMelee, isEnergy } from "./weapons.mjs";
import { attackDialog } from "./attack-dialog.mjs";

const L = localizer("SPACER");

export { targetDifficulty };

/** Best melee skill rank of a defender (p.44 "Defending"), or 0 when they cannot defend. */
function defendingRank(target) {
  if (!isPerson(target)) return 0;
  const c = target.system.combat;
  if (["kneeling", "prone", "wall"].includes(c.position) || target.system.characteristics.end.value <= 0) return 0;
  const weapons = target.items.filter(i => i.type === "weapon" && isMelee(i) && i.system.equipped);
  const ranks = weapons.map(w => skillRank(target, w.system.skill, w.system.specialty));
  if (!ranks.length) ranks.push(skillRank(target, "Melee Combat", "Hand-to-Hand"));
  return Math.max(0, ...ranks);
}

/** A creature's natural attack as a pseudo weapon (p.110). */
function creatureWeapon(actor) {
  return {
    id: null, name: L("Creature.Attack"), img: actor.img,
    system: { category: "melee", skill: "", specialty: "", damage: actor.system.damage, range: "short", rounds: 0, ammo: 0, traits: [] }
  };
}

/**
 * Gather every input of an attack: weapon traits, range band (token distance on the canvas, else
 * the given band, else the weapon's own band), skill rank, and the target's position, cover,
 * difficulty, and melee defence. No rolls, no writes. Called by attack() and by tests.
 * @param {Actor} actor
 * @param {Item|null} weapon  null for a creature's natural attack
 * @param {object} [o]  target (Actor), targetToken (Token), rangeBand
 * @returns {object} the context for the dialog and computeAttack
 */
export function prepareAttack(actor, weapon, { target = null, targetToken = null, rangeBand = null } = {}) {
  const creature = actor.type === "creature";
  weapon ??= creature ? creatureWeapon(actor) : null;
  const s = weapon.system;
  const traits = parseTraits(s.traits);
  const melee = isMelee(weapon);
  const thrownWeapon = !!traits.thrown || s.category === "thrown";
  const range = normalizeRange(s.range) || (melee ? "short" : "medium");

  const distance = tokenDistance(tokenOf(actor), targetToken);
  const band = rangeBand ?? (distance !== null ? rangeBandForDistance(distance) : (melee ? (range === "close" ? "close" : "short") : range));

  const skill = creature ? 0 : (s.skill ? skillRank(actor, s.skill, s.specialty) : 0);
  const targetCombat = isPerson(target) ? target.system.combat : null;
  return {
    actor, weapon, target, creature, traits, melee, thrownWeapon, range, band, distance,
    dm: actor.system.dm ?? {},
    canThrow: melee && !!traits.throw,
    ranged: !melee,
    skill,
    skillLabel: creature ? "" : (s.specialty ? `${s.skill} (${s.specialty})` : s.skill),
    lowTech: !!traits.lowTech && !hasSpecialty(actor, "Ranged Combat", "Archaic"),
    position: targetCombat?.position ?? "standing",
    cover: targetCombat?.cover ?? "none",
    baseDifficulty: targetDifficulty(target),
    defending: melee && target ? defendingRank(target) : 0,
    overwatch: actor.system.combat?.overwatch ?? 0,
    fatigued: (actor.system.fatigue ?? 0) > 0,
    heightened: creature && (s.traits ?? []).concat(actor.system.traits ?? []).some(t => /heightened/i.test(t)),
    flatDamage: creature ? actor.system.flatDamage : null
  };
}

/**
 * Modifiers, difficulty, and range DM from the prepared context and the dialog values.
 * Pure: see computeAttack in rules/attack.mjs. Kept here for the public API.
 */
export function computeAttack(ctx, v) {
  return computeAttackRule(ctx, v);
}

/** The target token and actor of an attack: explicit target, else the first targeted token. */
async function findTarget(target) {
  let token = null;
  if (!target) token = [...(game.user.targets ?? [])][0] ?? null;
  else if (target.document?.documentName === "Token") token = target;
  else if (target.documentName === "Token") token = target.object ?? null;
  const actor = target ? await resolveActor(target) : token?.actor ?? null;
  return { token, actor };
}

/** A warning when the actor cannot attack with this weapon now, else "". */
function blockReason(actor, weapon) {
  if (weapon?.system?.jammed) return L("Attack.Jammed", { weapon: weapon.name });
  if (weapon?.system?.broken) return L("Attack.Broken", { weapon: weapon.name });
  if (["unconscious", "dead"].includes(actor.system.injury?.label)) return L("Attack.CannotAct", { name: actor.name });
  return "";
}

/** True when a person is too heavily loaded for this melee attack (p.41). */
const meleeBlocked = (ctx, thrown) => ctx.melee && !thrown && isPerson(ctx.actor) && !canMelee(ctx.actor.system.encumbrance?.level);

/**
 * Attack with a weapon (or a creature's natural attack).
 * Opens a dialog prefilled from the targeted token, rolls, spends ammo or a melee use, handles
 * absolute results, rolls damage on a hit, and posts a card with an "Apply damage" button.
 * Writes: the weapon (`system.ammo`, `system.jammed`, `system.broken`) and the attacker
 * (`system.combat.meleeUsed`, `system.combat.overwatch`, `system.combat.evading`, `system.fatigue`).
 * Called by the actor sheets, SpacerActor#attack, SpacerItem#use, and macros.
 * @param {Actor} actor
 * @param {Item|null} weapon  null for a creature's natural attack
 * @param {object} [o]
 * @param {Actor|Token|string} [o.target]  default: the first targeted token
 * @param {string} [o.rangeBand]          override the measured band
 * @param {boolean} [o.dialog=true]
 * @param {object} [o.options]            dialog values to use without a dialog (aimed, characteristic, dm, position, cover, ...)
 * @returns {Promise<object|null>} { hit, effect, total, difficulty, damage, attackRoll, damageRoll, message }
 */
export async function attack(actor, weapon, { target, rangeBand = null, dialog = true, options = {} } = {}) {
  if (!actor) return null;
  const blocked = blockReason(actor, weapon);
  if (blocked) { ui.notifications.warn(blocked); return null; }

  const { token: targetToken, actor: targetActor } = await findTarget(target);
  const ctx = prepareAttack(actor, weapon, { target: targetActor, targetToken, rangeBand });
  if (meleeBlocked(ctx, ctx.thrownWeapon) && !ctx.canThrow) return warnOverEncumbered(actor);
  let v = { ...defaultAttackOptions(ctx), ...options };
  if (dialog) {
    v = await attackDialog(ctx, v);
    if (!v) return null;
  }
  const calc = computeAttack(ctx, v);
  if (meleeBlocked(ctx, calc.thrown)) return warnOverEncumbered(actor);
  if (calc.rangeDM === null) { ui.notifications.warn(L("Attack.OutOfRange", { weapon: ctx.weapon.name, band: L(`Range.${v.band}`) })); return null; }

  const s = ctx.weapon.system;
  const updates = {};
  const notes = [];
  const usesAmmo = !ctx.melee && weapon && s.rounds > 0;
  let ammoLeft = 0;
  if (usesAmmo) {
    // An Auto N weapon always fires N rounds (p.33).
    const need = calc.autoN || 1;
    if (s.ammo < need) { ui.notifications.warn(L("Attack.NoAmmo", { weapon: weapon.name })); return null; }
    ammoLeft = s.ammo - need;
    updates["system.ammo"] = ammoLeft;
  }
  const actorUpdate = attackerUpdate(ctx, v, calc, notes);

  // Attack roll: rollTask applies the absolute results (snake eyes fails, boxcars hits).
  const r = await rollTask({ actor, dm: calc.total, target: calc.difficulty, chat: false });
  const absolute = setting("absoluteResults", true);
  const hit = r.success;
  const effect = r.effect;

  // Absolute failure (p.42): guns jam (not Reliable), blades break, also a thrown blade.
  if (absolute && r.snakeEyes && weapon) {
    const broke = absoluteFailure({ melee: ctx.melee, thrownWeapon: ctx.thrownWeapon, reliable: !!ctx.traits.reliable });
    if (broke === "broken") { updates["system.broken"] = true; notes.push(L("Attack.BladeBroken")); }
    if (broke === "jammed") { updates["system.jammed"] = true; notes.push(L(ctx.traits.unreliable ? "Attack.JamUnreliable" : "Attack.JamNote")); }
  }

  const stun = !!ctx.traits.stun;
  const dmg = hit && !stun ? await rollDamage(ctx, v, calc, effect, absolute && r.boxcars) : { damage: 0, roll: null, terms: [] };
  if (dmg.full) notes.push(L("Attack.FullDamage"));
  const craft = isCraft(targetActor);
  const damage = damageToTarget(dmg.damage, targetActor);
  if (craft && hit && !stun) notes.push(L("Attack.CraftDamage", { rolled: dmg.damage }));
  if (calc.thrown && ctx.canThrow) notes.push(L("Attack.Thrown"));

  if (Object.keys(updates).length && weapon?.update) await weapon.update(updates);
  if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);

  const dice = countDice(s.damage);
  const energy = isEnergy(ctx.weapon);
  const message = await postCard({
    area: "play",
    actor,
    template: "chat/attack",
    rolls: [r.roll, ...(dmg.roll ? [dmg.roll] : [])],
    data: {
      actorName: actor.name, weaponName: ctx.weapon.name, img: ctx.weapon.img,
      targetName: targetActor?.name ?? "",
      band: L(`Range.${v.band}`), distance: ctx.distance !== null ? Math.round(ctx.distance) : null,
      difficulty: calc.difficulty,
      mods: calc.mods.map(m => ({ label: L(`Attack.Mod.${m.key}`), signed: signed(m.value) })),
      rollHTML: await r.roll.render(),
      hit, effect: signed(effect),
      absolute: absolute ? (r.boxcars ? "success" : r.snakeEyes ? "failure" : "") : "",
      damage, damageHTML: dmg.roll ? await dmg.roll.render() : "", dmgTerms: dmg.terms,
      stun: hit && stun,
      flat: ctx.creature && v.flat && hit,
      notes,
      targetUuid: targetActor?.uuid ?? "",
      energy: energy && !craft, dice,
      ammo: usesAmmo ? `${ammoLeft}/${s.rounds}` : ""
    },
    flags: { attack: { hit, effect, damage, energy, dice, craft, target: targetActor?.uuid ?? null, weapon: weapon?.uuid ?? null, stun: hit && stun } }
  });
  return { hit, effect, total: r.total, difficulty: calc.difficulty, damage, attackRoll: r.roll, damageRoll: dmg.roll, boxcars: r.boxcars, snakeEyes: r.snakeEyes, mods: calc.mods, message };
}

function warnOverEncumbered(actor) {
  ui.notifications.warn(L("Attack.OverEncumbered", { name: actor.name }));
  return null;
}

/** Attacker updates: a melee use of END (p.42; a controlled attack does not count, p.44), overwatch spent, Evade ends. */
function attackerUpdate(ctx, v, calc, notes) {
  const actor = ctx.actor;
  const out = {};
  if (!isPerson(actor)) return out;
  if (ctx.melee && !calc.thrown && !v.controlled) {
    out["system.combat.meleeUsed"] = actor.system.combat.meleeUsed + 1;
    if (actor.system.meleeRemaining <= 0) {
      out["system.fatigue"] = Math.max(1, actor.system.fatigue);
      notes.push(L("Attack.MeleeOverEnd"));
    }
  }
  if (v.useOverwatch && actor.system.combat.overwatch > 0) out["system.combat.overwatch"] = 0;
  if (actor.system.combat.evading) { out["system.combat.evading"] = false; notes.push(L("Attack.EvadeEnds")); }
  return out;
}

/** Damage of a hit (p.43): the weapon dice plus effect, STR DM, Auto, Overload; maximized on boxcars. */
async function rollDamage(ctx, v, calc, effect, full) {
  const bonus = damageBonus({
    effect, melee: ctx.melee && !calc.thrown && !ctx.creature, thrown: calc.thrown, strDM: calc.strDM,
    autoSingle: calc.autoN && v.autoMode !== "multi" ? calc.autoN : 0,
    overload: ctx.traits.overload ? Math.max(0, Number(v.overload) || 0) : 0
  });
  const terms = bonus.terms.map(t => ({ label: L(`Damage.Term.${t.key}`), signed: signed(t.value) }));
  if (ctx.creature && v.flat) return { damage: (ctx.flatDamage ?? 0) + bonus.total, roll: null, terms, full };
  const base = bookDice(ctx.weapon.system.damage);
  const formula = bonus.total ? `${base} + ${bonus.total}` : base;
  const roll = await new Roll(formula).evaluate(full ? { maximize: true } : {});
  return { damage: Math.max(0, roll.total), roll, terms, full };
}
