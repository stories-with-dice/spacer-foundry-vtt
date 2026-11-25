/** Personal attack workflow (book p.33, p.40-44, p.110-113). */
import { UNARMORED_DIFFICULTY, bookDice } from "../config.mjs";
import {
  RANGE_BANDS, rangeBandForDistance, rangeDM, normalizeRange, defenceDM, parseTraits, countDice, pierceArmour,
  attackModifiers, damageBonus
} from "./rules/combat.mjs";
import { L, render, postCard, signed, setting, formValues, chance2D, resolveActor, tokenOf, tokenDistance } from "./util.mjs";
import { rollTask, skillRank, hasSpecialty } from "./task.mjs";

const isPerson = a => a?.type === "character" || a?.type === "npc";

/** True for melee weapons. Uses the category, then the skill name ("Melee Combat"). */
export function isMelee(weapon) {
  const s = weapon?.system ?? {};
  if (s.category) return s.category === "melee";
  return /melee/i.test(s.skill ?? "");
}

/** True for weapons that fire energy beams (Reflec deflects them, p.34). */
export function isEnergy(weapon) {
  const s = weapon?.system ?? {};
  return s.category === "energy" || /energy/i.test(s.specialty ?? "");
}

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

/** Difficulty to hit a target before Piercing: armour total incl. evade, or creature size. */
export function targetDifficulty(target) {
  if (!target) return UNARMORED_DIFFICULTY;
  if (target.type === "creature") return target.system.difficulty ?? UNARMORED_DIFFICULTY;
  return target.system.armor?.total ?? UNARMORED_DIFFICULTY;
}

/** A creature's natural attack as a pseudo weapon (p.110). */
function creatureWeapon(actor) {
  return {
    id: null, name: L("Creature.Attack"), img: actor.img,
    system: { category: "melee", skill: "", specialty: "", damage: actor.system.damage, range: "short", rounds: 0, ammo: 0, traits: [] }
  };
}

/**
 * Gather every input of an attack. Pure lookups, no rolls.
 * @returns {object} context for the dialog and the roll
 */
export function prepareAttack(actor, weapon, { target = null, targetToken = null, rangeBand = null } = {}) {
  const creature = actor.type === "creature";
  weapon ??= creature ? creatureWeapon(actor) : null;
  const s = weapon.system;
  const traits = parseTraits(s.traits);
  const melee = isMelee(weapon);
  const thrownWeapon = !!traits.thrown || s.category === "thrown";
  const range = normalizeRange(s.range) || (melee ? "short" : "medium");

  // Range band: token distance on the canvas, else the given band, else the weapon's own band.
  const attackerToken = tokenOf(actor);
  const distance = tokenDistance(attackerToken, targetToken);
  const band = rangeBand ?? (distance !== null ? rangeBandForDistance(distance) : (melee ? (range === "close" ? "close" : "short") : range));

  const skill = creature ? 0 : (s.skill ? skillRank(actor, s.skill, s.specialty) : 0);
  const targetCombat = isPerson(target) ? target.system.combat : null;
  const baseDifficulty = targetDifficulty(target);
  return {
    actor, weapon, target, creature, traits, melee, thrownWeapon, range, band, distance,
    canThrow: melee && !!traits.throw,
    ranged: !melee,
    skill,
    skillLabel: creature ? "" : (s.specialty ? `${s.skill} (${s.specialty})` : s.skill),
    lowTech: !!traits.lowTech && !hasSpecialty(actor, "Ranged Combat", "Archaic"),
    position: targetCombat?.position ?? "standing",
    cover: targetCombat?.cover ?? "none",
    baseDifficulty,
    defending: melee && target ? defendingRank(target) : 0,
    overwatch: actor.system.combat?.overwatch ?? 0,
    fatigued: (actor.system.fatigue ?? 0) > 0,
    heightened: creature && (s.traits ?? []).concat(actor.system.traits ?? []).some(t => /heightened/i.test(t)),
    flatDamage: creature ? actor.system.flatDamage : null
  };
}

/** Compute modifiers, difficulty, and the range DM from the prepared context and the dialog choices. */
export function computeAttack(ctx, v) {
  const a = ctx.actor;
  const thrown = ctx.thrownWeapon || (ctx.canThrow && v.throw);
  const weaponRange = thrown && ctx.melee ? "short" : ctx.range;
  const rdm = ctx.melee && !thrown
    ? (RANGE_BANDS.indexOf(v.band) <= RANGE_BANDS.indexOf(ctx.range) ? 0 : null)   // melee cannot reach past its range (p.30)
    : rangeDM(weaponRange, v.band);
  const def = defenceDM({ position: v.position, cover: v.cover, arching: !!ctx.traits.arching });
  const charDM = v.characteristic ? (a.system.dm?.[v.characteristic] ?? 0) : 0;
  const strDM = a.system.dm?.str ?? 0;
  const autoN = ctx.traits.auto || 0;
  const { mods, total } = attackModifiers({
    charDM, skill: ctx.creature ? 0 : ctx.skill, ranged: ctx.ranged || thrown, thrown, strDM,
    aimed: v.aimed, range: rdm ?? 0, position: def.position, cover: def.cover,
    overwatch: v.useOverwatch ? ctx.overwatch : 0,
    oneHanded: !!ctx.traits.twoHanded && v.oneHanded, cramped: !!ctx.traits.large && v.cramped,
    darkness: Number(v.darkness) || 0, higherGround: v.higherGround,
    multiTarget: autoN && v.autoMode === "multi" ? autoN : 0,
    defending: ctx.melee && !thrown ? ctx.defending : 0,
    lowTech: ctx.lowTech, fatigued: v.fatigue, controlled: ctx.melee && !thrown && v.controlled,
    speedBand: Number(v.speedBand) || 0,
    extra: (Number(v.dm) || 0) + (ctx.heightened ? 1 : 0)
  });
  const difficulty = pierceArmour(ctx.baseDifficulty, ctx.traits.piercing || 0);
  return { mods, total, difficulty, rangeDM: rdm, thrown, coverStep: def.coverStep, charDM, strDM, autoN };
}

/**
 * Attack with a weapon (or a creature's natural attack).
 * Opens a dialog prefilled from the targeted token, rolls, spends ammo or a melee use, handles
 * absolute results, rolls damage on a hit, and posts a card with an "Apply damage" button.
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
  if (weapon?.system?.jammed) { ui.notifications.warn(L("Attack.Jammed", { weapon: weapon.name })); return null; }
  if (weapon?.system?.broken) { ui.notifications.warn(L("Attack.Broken", { weapon: weapon.name })); return null; }
  if (actor.system.injury?.label === "unconscious" || actor.system.injury?.label === "dead") {
    ui.notifications.warn(L("Attack.CannotAct", { name: actor.name })); return null;
  }

  // Target: explicit, else the first targeted token.
  let targetToken = null;
  if (!target) targetToken = [...(game.user.targets ?? [])][0] ?? null;
  else if (target.document?.documentName === "Token") targetToken = target;          // Token placeable
  else if (target.documentName === "Token") targetToken = target.object ?? null;      // TokenDocument
  const targetActor = target ? await resolveActor(target) : targetToken?.actor ?? null;

  const ctx = prepareAttack(actor, weapon, { target: targetActor, targetToken, rangeBand });
  const defaults = {
    characteristic: ctx.creature ? "" : (ctx.thrownWeapon ? "str" : "dex"),
    band: ctx.band, aimed: true, position: ctx.position, cover: ctx.cover,
    useOverwatch: ctx.overwatch > 0, oneHanded: false, cramped: false, darkness: 0, higherGround: false,
    autoMode: "single", controlled: false, throw: false, fatigue: ctx.fatigued, speedBand: 0, dm: 0,
    flat: false, overload: 0
  };
  let v = { ...defaults, ...options };
  if (dialog) {
    v = await attackDialog(ctx, v);
    if (!v) return null;
  }
  const calc = computeAttack(ctx, v);
  if (calc.rangeDM === null) { ui.notifications.warn(L("Attack.OutOfRange", { weapon: ctx.weapon.name, band: L(`Range.${v.band}`) })); return null; }

  // Ammo: an Auto N weapon always fires N rounds (p.33).
  const s = ctx.weapon.system;
  const updates = {};
  const actorUpdate = {};
  const notes = [];
  const usesAmmo = !ctx.melee && weapon && s.rounds > 0;
  let ammoLeft = 0;
  if (usesAmmo) {
    const need = calc.autoN || 1;
    if (s.ammo < need) { ui.notifications.warn(L("Attack.NoAmmo", { weapon: weapon.name })); return null; }
    ammoLeft = s.ammo - need;
    updates["system.ammo"] = ammoLeft;
  }

  // Melee uses END (p.42); a controlled attack (-2) does not count (p.44).
  if (ctx.melee && !calc.thrown && isPerson(actor) && !v.controlled) {
    const remaining = actor.system.meleeRemaining;
    actorUpdate["system.combat.meleeUsed"] = actor.system.combat.meleeUsed + 1;
    if (remaining <= 0) {
      actorUpdate["system.fatigue"] = Math.max(1, actor.system.fatigue);
      notes.push(L("Attack.MeleeOverEnd"));
    }
  }
  if (isPerson(actor) && v.useOverwatch && actor.system.combat.overwatch > 0) actorUpdate["system.combat.overwatch"] = 0;
  if (isPerson(actor) && actor.system.combat.evading) { actorUpdate["system.combat.evading"] = false; notes.push(L("Attack.EvadeEnds")); }

  // Attack roll.
  const r = await rollTask({ actor, dm: calc.total, target: calc.difficulty, chat: false });
  const absolute = setting("absoluteResults", true);
  const hit = r.total >= calc.difficulty;
  const effect = r.total - calc.difficulty;

  // Absolute failure (p.42): guns jam (not Reliable), blades break.
  if (absolute && r.snakeEyes && weapon) {
    if (ctx.melee && !calc.thrown) { updates["system.broken"] = true; notes.push(L("Attack.BladeBroken")); }
    else if (!ctx.traits.reliable && !ctx.thrownWeapon) {
      updates["system.jammed"] = true;
      notes.push(L(ctx.traits.unreliable ? "Attack.JamUnreliable" : "Attack.JamNote"));
    }
  }

  // Damage on a hit (p.43). Boxcars = full damage.
  let damageRoll = null;
  let damage = 0;
  let dmgTerms = [];
  const stun = !!ctx.traits.stun;
  const full = absolute && r.boxcars;
  if (hit && !stun) {
    const bonus = damageBonus({
      effect, melee: ctx.melee && !calc.thrown && !ctx.creature, thrown: calc.thrown, strDM: calc.strDM,
      autoSingle: calc.autoN && v.autoMode !== "multi" ? calc.autoN : 0,
      overload: ctx.traits.overload ? Math.max(0, Number(v.overload) || 0) : 0
    });
    dmgTerms = bonus.terms.map(t => ({ label: L(`Damage.Term.${t.key}`), signed: signed(t.value) }));
    if (ctx.creature && v.flat) {
      damage = (ctx.flatDamage ?? 0) + bonus.total;
    } else {
      const base = bookDice(s.damage);
      const formula = bonus.total ? `${base} + ${bonus.total}` : base;
      damageRoll = await new Roll(formula).evaluate(full ? { maximize: true } : {});
      damage = Math.max(0, damageRoll.total);
    }
    if (full) notes.push(L("Attack.FullDamage"));
  }
  if (calc.thrown && ctx.canThrow) notes.push(L("Attack.Thrown"));

  if (Object.keys(updates).length && weapon?.update) await weapon.update(updates);
  if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);

  const dice = countDice(s.damage);
  const energy = isEnergy(ctx.weapon);
  const rolls = [r.roll, ...(damageRoll ? [damageRoll] : [])];
  const message = await postCard({
    actor,
    template: "chat/attack",
    rolls,
    data: {
      actorName: actor.name, weaponName: ctx.weapon.name, img: ctx.weapon.img,
      targetName: targetActor?.name ?? "",
      band: L(`Range.${v.band}`), distance: ctx.distance !== null ? Math.round(ctx.distance) : null,
      difficulty: calc.difficulty,
      mods: calc.mods.map(m => ({ label: L(`Attack.Mod.${m.key}`), signed: signed(m.value) })),
      rollHTML: await r.roll.render(),
      hit, effect: signed(effect),
      absolute: absolute ? (r.boxcars ? "success" : r.snakeEyes ? "failure" : "") : "",
      damage, damageHTML: damageRoll ? await damageRoll.render() : "", dmgTerms,
      stun: hit && stun,
      flat: ctx.creature && v.flat && hit,
      notes,
      targetUuid: targetActor?.uuid ?? "",
      energy, dice,
      ammo: usesAmmo ? `${ammoLeft}/${s.rounds}` : ""
    },
    flags: { attack: { hit, effect, damage, energy, dice, target: targetActor?.uuid ?? null, weapon: weapon?.uuid ?? null, stun: hit && stun } }
  });
  return { hit, effect, total: r.total, difficulty: calc.difficulty, damage, attackRoll: r.roll, damageRoll, boxcars: r.boxcars, snakeEyes: r.snakeEyes, mods: calc.mods, message };
}

/** The attack dialog with a live preview of the total DM and the chance to hit. */
async function attackDialog(ctx, v) {
  const opt = (keys, prefix, sel) => keys.map(k => ({ value: k, label: L(`${prefix}.${k}`), selected: k === sel }));
  const content = await render("dialogs/attack", {
    ctx, v,
    targetName: ctx.target?.name ?? L("Attack.NoTarget"),
    characteristics: ["", "str", "dex", "end", "int"].map(k => ({ value: k, label: k ? `${L(`Char.${k}`)} (${signed(ctx.actor.system.dm?.[k] ?? 0)})` : "—", selected: k === v.characteristic })),
    bands: RANGE_BANDS.map(k => ({ value: k, label: L(`Range.${k}`), selected: k === v.band })),
    positions: opt(["standing", "kneeling", "prone", "wall"], "Position", v.position),
    covers: opt(["none", "partial", "half", "most", "absolute"], "Cover", v.cover),
    darkness: [{ value: 0, label: L("Attack.Light.normal") }, { value: -2, label: L("Attack.Light.low") }, { value: -4, label: L("Attack.Light.dark") }],
    distance: ctx.distance !== null ? Math.round(ctx.distance) : null,
    skillText: ctx.creature ? "" : `${ctx.skillLabel || "—"} ${signed(ctx.skill)}`,
    isPerson: isPerson(ctx.actor)
  });
  const DialogV2 = foundry.applications.api.DialogV2;
  const values = await DialogV2.wait({
    window: { title: L("Attack.Title", { weapon: ctx.weapon.name }), icon: "fa-solid fa-crosshairs" },
    classes: ["spacer", "spacer-dialog", "spacer-attack-dialog"],
    position: { width: 460 },
    content,
    buttons: [
      { action: "attack", label: "SPACER.Attack.Roll", icon: "fa-solid fa-crosshairs", default: true, callback: (_e, b) => formValues(b.form) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    render: (_e, dialog) => {
      const form = dialog.element.querySelector("form") ?? dialog.element;
      const update = () => {
        const cur = { ...v, ...formValues(form) };
        const calc = computeAttack(ctx, cur);
        const out = form.querySelector("[data-preview]");
        if (!out) return;
        if (calc.rangeDM === null) { out.textContent = L("Attack.OutOfRange", { weapon: ctx.weapon.name, band: L(`Range.${cur.band}`) }); out.classList.add("bad"); return; }
        out.classList.remove("bad");
        out.textContent = L("Attack.Preview", { dm: signed(calc.total), target: calc.difficulty, chance: chance2D(calc.total, calc.difficulty) });
        const list = form.querySelector("[data-mods]");
        if (list) list.textContent = calc.mods.map(m => `${L(`Attack.Mod.${m.key}`)} ${signed(m.value)}`).join(" · ");
      };
      form.addEventListener("change", update);
      form.addEventListener("input", update);
      update();
    },
    rejectClose: false
  });
  if (!values || typeof values !== "object") return null;
  return { ...v, ...values };
}

/** Reload a weapon to full (p.44): takes a round and grants Evade. */
export async function reloadWeapon(actor, weapon) {
  if (!weapon || weapon.system.rounds <= 0) return null;
  await weapon.update({ "system.ammo": weapon.system.rounds });
  if (isPerson(actor)) await actor.update({ "system.combat.evading": true });
  const traits = parseTraits(weapon.system.traits);
  await postCard({ actor, template: "chat/note", data: { title: L("Weapon.Reloaded", { weapon: weapon.name }), text: L(traits.slowReload ? "Weapon.SlowReload" : "Weapon.ReloadNote") } });
  return weapon.system.ammo;
}

/** Clear a jam (p.42): a Ranged Combat roll with the weapon's skill instead of an attack. */
export async function unjamWeapon(actor, weapon) {
  if (!weapon?.system.jammed) return null;
  const r = await rollTask({ actor, characteristic: "dex", skill: weapon.system.skill, specialty: weapon.system.specialty, label: L("Weapon.Unjam", { weapon: weapon.name }) });
  if (r.success) await weapon.update({ "system.jammed": false });
  return r;
}

/** A stunned target's END check (p.33): 8+ or helpless for 1 + effect 10-minute intervals. */
export async function resistStun(actor) {
  const r = await rollTask({ actor, characteristic: "end", label: L("Attack.StunCheck", { name: actor.name }) });
  if (!r.success) await postCard({ actor, template: "chat/note", data: { title: L("Attack.Stunned", { name: actor.name }), text: L("Attack.StunnedFor", { n: 1 + Math.abs(r.effect) }) } });
  return r;
}
