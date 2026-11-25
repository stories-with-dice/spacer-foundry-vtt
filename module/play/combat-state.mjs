/** Combat counters, sprint, and morale (book p.42-44). */
import { localizer, postCard, signed } from "../shared/foundry.mjs";
import { moraleThreshold } from "./rules/combat.mjs";
import { isPerson } from "./rules/attack.mjs";
import { rollTask, skillRank } from "./task.mjs";

const L = localizer("SPACER");

/**
 * Reset the per-encounter counters (p.42-43): writes `system.combat.sprintUsed`, `meleeUsed`,
 * `overwatch` to 0 and `evading` to false. Called at combat start and end (register.mjs) and by the sheet.
 */
export async function resetCombatCounters(actor) {
  if (!isPerson(actor)) return;
  const c = actor.system.combat;
  if (!c.sprintUsed && !c.meleeUsed && !c.overwatch && !c.evading) return;
  await actor.update({ "system.combat.sprintUsed": 0, "system.combat.meleeUsed": 0, "system.combat.overwatch": 0, "system.combat.evading": false });
}

/**
 * Sprint extra metres past DEX (p.42): adds to `system.combat.sprintUsed` (the END budget of the
 * encounter). Called by the sheet. Example: sprintUsed 1, sprint 2 -> 3.
 * @returns {Promise<number|null>} the metres left, or null when the actor cannot sprint that far
 */
export async function sprint(actor, metres = 1) {
  if (!isPerson(actor)) return null;
  const m = Math.max(0, Math.floor(metres));
  if (m > actor.system.sprintRemaining) { ui.notifications.warn(L("Combat.SprintTooFar", { n: actor.system.sprintRemaining })); return null; }
  await actor.update({ "system.combat.sprintUsed": actor.system.combat.sprintUsed + m });
  return actor.system.sprintRemaining;
}

/** True when an actor is out of the fight for morale (p.44): any injury state but healthy. Called by the morale checks. */
export function isOut(actor) {
  const s = actor?.system?.injury?.label ?? "healthy";
  return s !== "healthy";
}

/**
 * Morale check (p.44): 2D 8+. When a leader with Leadership is given (or found among `actors`),
 * they roll and add Leadership rank and SOC DM. Posts a note card. Called by the sheet and combatMorale.
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
    area: "play",
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
