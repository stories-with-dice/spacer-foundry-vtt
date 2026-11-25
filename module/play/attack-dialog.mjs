/** The attack dialog (DialogV2) with a live preview of the total DM and the chance to hit. */
import { localizer, renderAreaTemplate, signed, setting, formValues } from "../shared/foundry.mjs";
import { RANGE_BANDS } from "./rules/combat.mjs";
import { computeAttack, isPerson } from "./rules/attack.mjs";
import { chance2D } from "./rules/task.mjs";

const L = localizer("SPACER");

/**
 * Open the attack dialog and wait for the player's choices.
 * Reads the context from prepareAttack and the default values; renders
 * templates/play/dialogs/attack.hbs. Called by attack() in module/play/attack.mjs.
 * @param {object} ctx  from prepareAttack
 * @param {object} v    default values (defaultAttackOptions)
 * @returns {Promise<object|null>} the chosen values, or null when the dialog is closed
 */
export async function attackDialog(ctx, v) {
  const opt = (keys, prefix, sel) => keys.map(k => ({ value: k, label: L(`${prefix}.${k}`), selected: k === sel }));
  const content = await renderAreaTemplate("play", "dialogs/attack", {
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
  const absolute = setting("absoluteResults", true);
  const values = await foundry.applications.api.DialogV2.wait({
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
        if (calc.rangeDM === null) {
          out.textContent = L("Attack.OutOfRange", { weapon: ctx.weapon.name, band: L(`Range.${cur.band}`) });
          out.classList.add("bad");
          return;
        }
        out.classList.remove("bad");
        out.textContent = L("Attack.Preview", { dm: signed(calc.total), target: calc.difficulty, chance: chance2D(calc.total, calc.difficulty, { absolute }) });
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
