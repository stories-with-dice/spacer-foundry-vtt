/** Psionics (book p.114-119): use a talent, recover PSI. */
import { localizer, renderAreaTemplate, postCard, signed, formValues } from "../shared/foundry.mjs";
import { psiRangeCost, parsePsiCost, parseTarget, recoverPsi as recover, psiCap, PSI_RANGE_BANDS } from "./rules/character.mjs";
import { rollTask } from "./task.mjs";

const L = localizer("SPACER");

/**
 * Use a psionic talent: pay its PSI cost plus the range cost (p.115), optionally roll, post a card.
 * Writes `system.psi.value`. Called by the sheet and SpacerItem#use.
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
    const content = await renderAreaTemplate("play", "dialogs/psionic", { talent, base, bands, hasRange, v, psi: actor.system.psi });
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
    area: "play",
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

/**
 * PSI recovery (p.114): 1 point per hour of rest, up to the maximum. Writes `system.psi.value`
 * and posts a note card. Called by the sheet ("Recover PSI") and macros.
 * @returns {Promise<number|null>} the new PSI
 */
export async function recoverPsi(actor, hours = 1, { chat = true } = {}) {
  if (!actor?.system?.psi) return null;
  const { value, max } = actor.system.psi;
  const after = recover(value, max, hours);
  if (after !== value) await actor.update({ "system.psi.value": after });
  if (chat) await postCard({ area: "play", actor, template: "chat/note", data: { title: L("Psi.Recovered", { name: actor.name }), text: L("Psi.RecoveredText", { hours, before: value, after, max }) } });
  return after;
}

/** Highest PSI possible for an actor (p.114): reads the current STR, DEX, END, INT. Called by macros. */
export function psiLimit(actor) {
  const c = actor.system.characteristics;
  return psiCap({ str: c.str.value, dex: c.dex.value, end: c.end.value, int: c.int.value });
}
