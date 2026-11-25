/** Context of the actor sheets: the data each template needs, computed from the actor. */
import { CHARACTERISTICS } from "../../config.mjs";
import { localizer, signed } from "../../shared/foundry.mjs";
import { normalizeRange, COVER_STEPS } from "../rules/combat.mjs";
import { psiCap } from "../rules/character.mjs";
import { skillRank } from "../task.mjs";
import { isMelee } from "../weapons.mjs";

const L = localizer("SPACER");

/**
 * Add the person data (characteristics, skills, items, encumbrance, combat state) to a sheet
 * context. Reads the actor and its items; writes only `ctx`. Called by SpacerActorSheet#_prepareContext.
 * @param {Actor} actor  character or NPC
 * @param {object} ctx   the sheet context
 */
export function preparePerson(actor, ctx) {
  const s = actor.system;
  ctx.characteristics = CHARACTERISTICS.map(k => {
    const c = s.characteristics[k];
    return { key: k, label: L(`Char.${k}`), long: L(`CharLong.${k}`), value: c.value, max: c.max, dm: signed(c.dm),
      hurt: c.value < c.max, zero: c.value <= 0, boosted: c.value > c.max };
  });
  ctx.psi = { value: s.psi.value, max: s.psi.max, dm: signed(s.dm.psi), has: s.psi.max > 0 || s.psi.value > 0, cap: psiCap({
    str: s.characteristics.str.value, dex: s.characteristics.dex.value, end: s.characteristics.end.value, int: s.characteristics.int.value }) };

  // Skills grouped by base skill, specialties under it.
  const groups = new Map();
  for (const i of actor.items.filter(i => i.type === "skill")) {
    const base = i.system.skill || i.name;
    if (!groups.has(base)) groups.set(base, { name: base, base: null, specialties: [] });
    const g = groups.get(base);
    if (i.system.specialty) g.specialties.push({ id: i.id, name: i.system.specialty, rank: i.system.rank, item: i });
    else g.base = { id: i.id, rank: i.system.rank, item: i, characteristic: i.system.characteristic };
  }
  ctx.skillGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    .map(g => ({ ...g, specialties: g.specialties.sort((a, b) => a.name.localeCompare(b.name)) }));

  // Weapons, armour, gear, drugs, psionics.
  const byType = t => actor.items.filter(i => i.type === t).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  ctx.weapons = byType("weapon").map(w => {
    const ws = w.system;
    const rank = ws.skill ? skillRank(actor, ws.skill, ws.specialty) : 0;
    return {
      id: w.id, name: w.name, img: w.img, damage: ws.damage, equipped: ws.equipped, jammed: ws.jammed, broken: ws.broken,
      range: L(`Range.${normalizeRange(ws.range) || "short"}`), melee: isMelee(w),
      usesAmmo: !isMelee(w) && ws.rounds > 0, ammo: ws.ammo, rounds: ws.rounds, empty: ws.rounds > 0 && ws.ammo <= 0,
      traits: (ws.traits ?? []).join(", "),
      skill: ws.specialty ? `${ws.skill} (${ws.specialty})` : ws.skill, rank: signed(rank), untrained: rank === -3
    };
  });
  ctx.armour = byType("armor").map(a => ({ id: a.id, name: a.name, img: a.img, difficulty: a.system.effectiveDifficulty ?? a.system.difficulty,
    equipped: a.system.equipped, damaged: a.system.damaged, traits: (a.system.traits ?? []).join(", "), weight: a.system.equipped ? a.system.wornWeight : a.system.weight }));
  ctx.gear = byType("gear").map(g => ({ id: g.id, name: g.name, img: g.img, quantity: g.system.quantity, weight: g.system.weight,
    carried: g.system.carried, uses: g.system.uses.max ? `${g.system.uses.value}/${g.system.uses.max}` : "" }));
  ctx.drugs = byType("drug").map(d => ({ id: d.id, name: d.name, img: d.img, doses: d.system.doses > 0 ? d.system.doses : d.system.quantity, effect: d.system.effect }));
  const disciplines = new Map();
  for (const p of byType("psionic")) {
    const d = p.system.discipline || "special";
    if (!disciplines.has(d)) disciplines.set(d, { key: d, label: L(`Psi.Discipline.${d}`), talents: [] });
    disciplines.get(d).talents.push({ id: p.id, name: p.name, img: p.img, level: p.system.level, cost: p.system.psiCost, duration: p.system.duration, range: p.system.range });
  }
  ctx.disciplines = [...disciplines.values()];

  // Encumbrance bar (p.41): the bar is full at 4x STR.
  const e = s.encumbrance;
  const scale = Math.max(1, e.overEncumbered);
  ctx.enc = {
    carried: e.carried, level: L(`Enc.${e.level}`), css: { minimal: "ok", encumbered: "warn", overEncumbered: "bad", overloaded: "dead" }[e.level],
    pct: Math.min(100, Math.round((e.carried / scale) * 100)),
    m1: Math.round((e.minimal / scale) * 100), m2: Math.round((e.encumbered / scale) * 100),
    minimal: e.minimal, encumbered: e.encumbered, overEncumbered: e.overEncumbered
  };

  // Combat state.
  const opt = (keys, prefix, sel) => keys.map(k => ({ value: k, label: L(`${prefix}.${k}`), selected: k === sel }));
  ctx.positions = opt(["standing", "kneeling", "prone", "wall"], "Position", s.combat.position);
  ctx.covers = opt(COVER_STEPS, "Cover", s.combat.cover);
  const endBudget = s.combat.sprintUsed + s.sprintRemaining;
  ctx.sprint = { used: s.combat.sprintUsed, remaining: s.sprintRemaining, total: endBudget };
  ctx.melee = { used: s.combat.meleeUsed, remaining: s.meleeRemaining === Infinity ? "∞" : s.meleeRemaining };
  ctx.armorTotal = s.armor.total;
  ctx.armorName = s.armor.name || L("Armour.None");
  ctx.fatigued = s.fatigue > 0;
  if (ctx.isCharacter) {
    ctx.careers = s.careers.map((c, i) => ({ ...c, index: i }));
  }
}

/**
 * Add the creature data (size, behaviour, traits, hits bar) to a sheet context.
 * Called by SpacerActorSheet#_prepareContext.
 * @param {Actor} actor  creature
 * @param {object} ctx   the sheet context
 */
export function prepareCreature(actor, ctx) {
  const s = actor.system;
  ctx.sizes = ["tiny", "small", "medium", "large", "veryLarge"].map(k => ({ value: k, label: L(`Creature.Size.${k}`), selected: k === s.size }));
  ctx.behaviours = ["", "herbivore", "carnivore", "omnivore", "scavenger"].map(k => ({ value: k, label: k ? L(`Creature.Behaviour.${k}`) : "—", selected: k === s.behaviour }));
  ctx.traitsText = (s.traits ?? []).join(", ");
  ctx.hitsPct = s.hits.max ? Math.round((s.hits.value / s.hits.max) * 100) : 0;
  ctx.thresholds = { pinned: Math.ceil(s.hits.max / 2), unconscious: Math.ceil(s.hits.max * 0.75) };
}
