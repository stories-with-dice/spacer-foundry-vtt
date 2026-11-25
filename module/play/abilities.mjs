/** Psionics (p.114-119), drugs (p.120-121), combat counters, morale (p.44), training (p.122), falls (p.107). */

import { psiRangeCost, parsePsiCost, parseTarget, recoverPsi as recover, psiCap, drugEffect, trainingFor, fallDamage as fallDice, PSI_RANGE_BANDS } from "./rules/character.mjs";
import { moraleThreshold } from "./rules/combat.mjs";
import { L, render, postCard, signed, formValues } from "./util.mjs";
import { rollTask, skillRank, rollBookDice } from "./task.mjs";
import { applyDamage, naturalHealing } from "./damage.mjs";

const isPerson = a => a?.type === "character" || a?.type === "npc";

/* -------------------------------------------- */
/*  Psionics                                    */
/* -------------------------------------------- */

/**
 * Use a psionic talent: pay its PSI cost plus the range cost (p.115), optionally roll, post a card.
 * @param {Actor} actor
 * @param {Item} talent  psionic item
 * @param {object} [o]
 * @param {boolean} [o.dialog=true]
 * @param {string} [o.band="close"]  psionic range band
 * @param {number} [o.extra=0]       extra PSI spent (e.g. +1DM per 2 points, or more damage)
 * @param {boolean} [o.roll]         roll a task; default: when the talent has a difficulty
 * @param {string} [o.characteristic="int"]
 * @returns {Promise<{cost: number, psi: number, roll?: object}|null>}
 */
export async function usePsionic(actor, talent, { dialog = true, band = "close", extra = 0, roll, characteristic = "int", dm = 0 } = {}) {
  if (!actor || !talent) return null;
  const s = talent.system;
  const base = parsePsiCost(s.psiCost);
  const hasRange = s.discipline !== "awareness";
  roll ??= /\d/.test(s.difficulty ?? "");
  let v = { band, extra, roll, characteristic, dm, target: parseTarget(s.difficulty, 8) };
  if (dialog) {
    const bands = PSI_RANGE_BANDS.map(b => ({ value: b, cost: psiRangeCost(s.discipline, b) }))
      .filter(b => b.cost !== null)
      .map(b => ({ value: b.value, label: `${L(`PsiRange.${b.value}`)} (+${b.cost})`, selected: b.value === v.band }));
    const content = await render("dialogs/psionic", { talent, base, bands, hasRange, v, psi: actor.system.psi });
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("Psi.UseTitle", { talent: talent.name }), icon: "fa-solid fa-brain" },
      classes: ["spacer", "spacer-dialog"],
      position: { width: 380 },
      content,
      buttons: [{ action: "use", label: "SPACER.Psi.Use", icon: "fa-solid fa-brain", default: true, callback: (_e, b) => formValues(b.form) }],
      render: (_e, d) => {
        const form = d.element.querySelector("form") ?? d.element;
        const update = () => {
          const cur = formValues(form);
          const cost = base + (hasRange ? (psiRangeCost(s.discipline, cur.band) ?? 0) : 0) + (Number(cur.extra) || 0);
          const out = form.querySelector("[data-preview]");
          out.textContent = L("Psi.Preview", { cost, psi: actor.system.psi.value });
          out.classList.toggle("bad", cost > actor.system.psi.value);
        };
        form.addEventListener("change", update);
        form.addEventListener("input", update);
        update();
      },
      rejectClose: false
    });
    if (!res || typeof res !== "object") return null;
    v = { ...v, ...res };
  }
  const rangeCost = hasRange ? psiRangeCost(s.discipline, v.band) : 0;
  if (rangeCost === null) { ui.notifications.warn(L("Psi.OutOfRange")); return null; }
  const cost = base + rangeCost + Math.max(0, Number(v.extra) || 0);
  const psi = actor.system.psi.value;
  if (cost > psi) { ui.notifications.warn(L("Psi.NotEnough", { cost, psi })); return null; }
  await actor.update({ "system.psi.value": psi - cost });

  let r = null;
  if (v.roll) r = await rollTask({ actor, characteristic: v.characteristic, dm: Number(v.dm) || 0, target: Number(v.target) || 8, label: talent.name, chat: false });
  await postCard({
    actor,
    template: "chat/psionic",
    rolls: r ? [r.roll] : [],
    data: {
      name: actor.name, talent: talent.name, img: talent.img,
      discipline: L(`Psi.Discipline.${s.discipline}`), level: s.level, duration: s.duration,
      cost, base, rangeCost, extra: Number(v.extra) || 0, band: hasRange ? L(`PsiRange.${v.band}`) : "",
      before: psi, after: psi - cost,
      rollHTML: r ? await r.roll.render() : "", success: r?.success, effect: r ? signed(r.effect) : "", target: v.target,
      description: s.description
    },
    flags: { psionic: { talent: talent.uuid, cost } }
  });
  return { cost, psi: psi - cost, roll: r };
}

/** PSI recovery (p.114): 1 point per hour of rest, up to the maximum. */
export async function recoverPsi(actor, hours = 1, { chat = true } = {}) {
  if (!actor?.system?.psi) return null;
  const { value, max } = actor.system.psi;
  const after = recover(value, max, hours);
  if (after !== value) await actor.update({ "system.psi.value": after });
  if (chat) await postCard({ actor, template: "chat/note", data: { title: L("Psi.Recovered", { name: actor.name }), text: L("Psi.RecoveredText", { hours, before: value, after, max }) } });
  return after;
}

/** Highest PSI possible for an actor (p.114). */
export function psiLimit(actor) {
  const c = actor.system.characteristics;
  return psiCap({ str: c.str.value, dex: c.dex.value, end: c.end.value, int: c.int.value });
}

/* -------------------------------------------- */
/*  Drugs                                       */
/* -------------------------------------------- */

/**
 * Take one dose of a drug: spend a dose, apply the automated effect, post a card.
 * Automated: PSI-Boost (+3 PSI), PSI-Double (+6 PSI), Combat (+2 STR and END), Medical Slow
 * (30 days of natural healing). Others post their effect text.
 */
export async function useDrug(actor, drug, { chat = true } = {}) {
  if (!actor || !drug) return null;
  const s = drug.system;
  const doses = s.doses > 0 ? s.doses : s.quantity;
  if (doses <= 0) { ui.notifications.warn(L("Drug.Empty", { drug: drug.name })); return null; }
  const left = doses - 1;
  if (s.doses > 0) await drug.update({ "system.doses": left });
  else await drug.update({ "system.quantity": left });

  const eff = drugEffect(drug.name);
  const applied = [];
  if (eff && isPerson(actor)) {
    const up = {};
    if (eff.psi) {
      const cap = 15;
      const after = Math.min(cap, actor.system.psi.value + eff.psi);
      up["system.psi.value"] = after;
      applied.push(`PSI ${actor.system.psi.value} → ${after}`);
    }
    for (const k of ["str", "end"]) if (eff[k]) {
      const before = actor.system.characteristics[k].value;
      up[`system.characteristics.${k}.value`] = before + eff[k];
      applied.push(`${L(`Char.${k}`)} ${before} → ${before + eff[k]}`);
    }
    if (Object.keys(up).length) await actor.update(up);
    if (eff.healDays) await naturalHealing(actor, { days: eff.healDays });
  }
  if (chat) await postCard({
    actor,
    template: "chat/drug",
    data: { name: actor.name, drug: drug.name, img: drug.img, effect: s.effect, duration: s.duration, applied, left,
      note: eff ? L(`Drug.Note.${eff.key}`) : "", description: s.description },
    flags: { drug: { drug: drug.uuid, key: eff?.key ?? null } }
  });
  return { left, effect: eff };
}

/* -------------------------------------------- */
/*  Combat counters and morale                  */
/* -------------------------------------------- */

/** Reset the per-encounter counters (p.42-43): sprint, melee, overwatch, evade. */
export async function resetCombatCounters(actor) {
  if (!isPerson(actor)) return;
  const c = actor.system.combat;
  if (!c.sprintUsed && !c.meleeUsed && !c.overwatch && !c.evading) return;
  await actor.update({ "system.combat.sprintUsed": 0, "system.combat.meleeUsed": 0, "system.combat.overwatch": 0, "system.combat.evading": false });
}

/** Sprint extra metres past DEX (p.42), spending END budget for the encounter. */
export async function sprint(actor, metres = 1) {
  if (!isPerson(actor)) return null;
  const m = Math.max(0, Math.floor(metres));
  if (m > actor.system.sprintRemaining) { ui.notifications.warn(L("Combat.SprintTooFar", { n: actor.system.sprintRemaining })); return null; }
  await actor.update({ "system.combat.sprintUsed": actor.system.combat.sprintUsed + m });
  return actor.system.sprintRemaining;
}

/** True when an actor is out of the fight for morale (p.44). */
export function isOut(actor) {
  const s = actor?.system?.injury?.label ?? "healthy";
  return s !== "healthy";
}

/**
 * Morale check (p.44): 2D 8+. When a leader with Leadership is given (or found among `actors`),
 * they roll and add Leadership rank and SOC DM.
 * @param {object} o
 * @param {Actor[]} [o.actors]  the side; the best conscious leader rolls
 * @param {Actor} [o.leader]
 * @param {number} [o.dm=0]
 * @param {string} [o.label]
 */
export async function moraleCheck({ actors = [], leader = null, dm = 0, label = "" } = {}) {
  leader ??= actors.filter(a => isPerson(a) && !isOut(a) && skillRank(a, "Leadership") >= 0)
    .sort((a, b) => skillRank(b, "Leadership") - skillRank(a, "Leadership"))[0] ?? null;
  const title = label || L("Morale.Title");
  const r = leader
    ? await rollTask({ actor: leader, characteristic: "soc", skill: "Leadership", dm, label: title, chat: false })
    : await rollTask({ dm, label: title, chat: false });
  await postCard({
    actor: leader,
    template: "chat/note",
    rolls: [r.roll],
    data: { title, rollHTML: await r.roll.render(), text: L(r.success ? "Morale.Hold" : "Morale.Break"), good: r.success, bad: !r.success,
      sub: leader ? L("Morale.Leader", { name: leader.name }) : (dm ? L("Morale.DM", { dm: signed(dm) }) : "") }
  });
  return r;
}

/**
 * Automatic combat morale at the end of a round (p.44) for every NPC side: a check at 25%, 50%
 * (-2DM), and 75% (-4DM) of the side out of the fight. Each threshold is checked once per combat.
 */
export async function combatMorale(combat) {
  const sides = new Map();
  for (const c of combat.combatants) {
    const a = c.actor;
    if (!a || a.type === "character" || a.hasPlayerOwner) continue;
    const disp = c.token?.disposition ?? 0;
    if (!sides.has(disp)) sides.set(disp, []);
    sides.get(disp).push(a);
  }
  const done = foundry.utils.deepClone(combat.getFlag("spacer", "morale") ?? {});
  let changed = false;
  for (const [disp, actors] of sides) {
    const t = moraleThreshold(actors.filter(isOut).length, actors.length);
    if (!t || (done[disp] ?? 0) >= t.threshold) continue;
    done[disp] = t.threshold;
    changed = true;
    const side = L(`Morale.Side.${disp === 1 ? "friendly" : disp === 0 ? "neutral" : "hostile"}`);
    await moraleCheck({ actors, dm: t.dm, label: L("Morale.CombatTitle", { side, pct: t.threshold }) });
  }
  if (changed) await combat.setFlag("spacer", "morale", done);
}

/* -------------------------------------------- */
/*  Training and hazards                        */
/* -------------------------------------------- */

/**
 * Train a skill to its next rank (p.122): EDU roll against the training difficulty. On a success the
 * rank goes up by 1. Self-guided study needs INT DM 0+ and cannot pass the INT DM.
 */
export async function trainSkill(actor, skill, { instructor = false } = {}) {
  if (!actor || !skill) return null;
  const next = skill.system.rank + 1;
  if (next > 5) { ui.notifications.warn(L("Train.Max")); return null; }
  const t = trainingFor(next, { instructor });
  const intDM = actor.system.dm?.int ?? 0;
  if (!instructor && (intDM < 0 || next > intDM)) { ui.notifications.warn(L("Train.SelfLimit", { dm: signed(intDM) })); return null; }
  const r = await rollTask({ actor, characteristic: "edu", target: t.target, label: L("Train.Title", { skill: skill.system.fullName || skill.name, rank: next }),
    notes: L("Train.Notes", { weeks: t.weeks, cost: t.cost.toLocaleString() }) });
  if (r.success) await skill.update({ "system.rank": next });
  return r;
}

/** Falling damage (p.107) for `metres` at a planet size code; armour does not help. */
export async function fall(actor, metres, sizeCode = 8) {
  const dice = fallDice(sizeCode, metres);
  const roll = await rollBookDice(dice);
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: L("Hazard.Fall", { m: metres, dice }) });
  return applyDamage(actor, roll.total, { ignoreArmour: true, source: L("Hazard.FallSource") });
}

