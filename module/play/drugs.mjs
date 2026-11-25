/** Drugs (book p.120-121). */
import { localizer, postCard } from "../shared/foundry.mjs";
import { drugEffect } from "./rules/character.mjs";
import { isPerson } from "./rules/attack.mjs";
import { naturalHealing } from "./healing.mjs";

const L = localizer("SPACER");

/**
 * Take one dose of a drug: spend a dose, apply the automated effect, post a card.
 * Automated: PSI-Boost (+3 PSI), PSI-Double (+6 PSI), Combat (+2 STR and END), Medical Slow
 * (30 days of natural healing). Others post their effect text.
 * Writes the drug (`system.doses` or `system.quantity`) and the actor (PSI, STR, END).
 * Called by the sheet and SpacerItem#use.
 * @returns {Promise<{left: number, effect: object|null}|null>}
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
    area: "play",
    actor,
    template: "chat/drug",
    data: { name: actor.name, drug: drug.name, img: drug.img, effect: s.effect, duration: s.duration, applied, left,
      note: eff ? L(`Drug.Note.${eff.key}`) : "", description: s.description },
    flags: { drug: { drug: drug.uuid, key: eff?.key ?? null } }
  });
  return { left, effect: eff };
}
