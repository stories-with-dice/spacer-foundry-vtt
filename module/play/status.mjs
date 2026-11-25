/** Token status icons that show the injury state (book p.43, p.110). */

/** Status ids this area manages on tokens. */
export const INJURY_STATUSES = ["wounded", "pinned", "unconscious", "dead"];

/** One status sync at a time per actor, so fast updates do not toggle the same effect twice. */
const statusQueue = new WeakMap();

/**
 * Show the injury state on the actor's tokens (p.43, p.110): wounded (persons at END 0), pinned
 * (creatures at 1/2 hits), unconscious, dead (overlay). Reads `system.injury.label` and toggles the
 * matching status effect; only the most severe status is set. Called by SpacerActor#_onUpdate.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export function syncInjuryStatus(actor) {
  if (!actor || typeof actor.toggleStatusEffect !== "function") return Promise.resolve();
  const next = (statusQueue.get(actor) ?? Promise.resolve()).then(() => doSyncInjuryStatus(actor));
  statusQueue.set(actor, next.catch(() => {}));
  return next;
}

async function doSyncInjuryStatus(actor) {
  if (!actor.isOwner || (actor.collection && !actor.collection.has(actor.id) && !actor.isToken)) return;
  if (!["character", "npc", "creature"].includes(actor.type)) return;
  const state = actor.system.injury?.label ?? "healthy";
  for (const id of INJURY_STATUSES) {
    if (!CONFIG.statusEffects.some(s => s.id === id)) continue;
    const active = state === id;
    if (actor.statuses.has(id) !== active) await actor.toggleStatusEffect(id, { active, overlay: id === "dead" });
  }
}
