/** Small helpers shared by the play area. */

export const SYSTEM = "spacer";
export const templatePath = p => `systems/${SYSTEM}/templates/play/${p}.hbs`;

/** Render a play template ("chat/attack") with data. */
export function render(p, data) {
  return foundry.applications.handlebars.renderTemplate(templatePath(p), data);
}

/** Localize a key under SPACER. ("Attack.Title"), with optional format data. */
export function L(key, data) {
  const k = `SPACER.${key}`;
  return data ? game.i18n.format(k, data) : game.i18n.localize(k);
}

export const signed = n => (Number(n) >= 0 ? `+${Number(n)}` : `${Number(n)}`);

/** Read a play setting, with a default when the setting is missing. */
export function setting(key, fallback = true) {
  try { return game.settings.get(SYSTEM, key); } catch { return fallback; }
}

/** 1D from Foundry's random generator (so seeded or replaced RNGs apply). */
export const d6 = () => Math.ceil((CONFIG.Dice.randomUniform?.() ?? Math.random()) * 6) || 1;

/**
 * Post a play chat card.
 * @param {object} o
 * @param {Actor} [o.actor]  speaker
 * @param {string} o.template  template under templates/play
 * @param {object} o.data
 * @param {Roll[]} [o.rolls]
 * @param {object} [o.flags]  stored under flags.spacer
 */
export async function postCard({ actor, template, data, rolls = [], flags = {} }) {
  const content = await render(template, data);
  const msg = {
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content,
    rolls,
    flags: { [SYSTEM]: flags }
  };
  if (rolls.length) msg.sound = CONFIG.sounds.dice;
  applyMessageMode(msg);
  return ChatMessage.implementation.create(msg);
}

/** Apply the user's current roll/message mode: v14 `applyMode`, v13 `applyRollMode`. */
export function applyMessageMode(msg) {
  const CM = ChatMessage.implementation;
  if (typeof CM.applyMode === "function") CM.applyMode(msg, game.settings.get("core", "messageMode"));
  else CM.applyRollMode(msg, game.settings.get("core", "rollMode"));
  return msg;
}

/** Resolve an Actor from an Actor, a Token, a TokenDocument, or a UUID string. */
export async function resolveActor(x) {
  if (!x) return null;
  if (typeof x === "string") {
    const doc = await fromUuid(x);
    return doc?.actor ?? (doc?.documentName === "Actor" ? doc : null);
  }
  if (x.documentName === "Actor") return x;
  return x.actor ?? null;
}

/** The token of an actor on the current scene, or null. */
export function tokenOf(actor) {
  if (!actor || !canvas?.ready) return null;
  if (actor.token?.object) return actor.token.object;
  const controlled = canvas.tokens.controlled.find(t => t.actor === actor);
  return controlled ?? actor.getActiveTokens(true)[0] ?? null;
}

/** Distance in grid units (metres in this system) between two tokens on the canvas, or null. */
export function tokenDistance(a, b) {
  if (!a || !b || !canvas?.ready || a.scene !== b.scene) return null;
  try {
    return canvas.grid.measurePath([a.center, b.center]).distance;
  } catch {
    return null;
  }
}

/** Actors to act on: targeted tokens, else controlled tokens, else the fallback list. */
export async function pickActors(fallback = []) {
  const targets = [...(game.user.targets ?? [])].map(t => t.actor).filter(Boolean);
  if (targets.length) return targets;
  const controlled = (canvas?.ready ? canvas.tokens.controlled : []).map(t => t.actor).filter(Boolean);
  if (controlled.length) return controlled;
  const out = [];
  for (const f of fallback) { const a = await resolveActor(f); if (a) out.push(a); }
  return out;
}

/** The value of each named form element as an object (checkbox -> boolean, number -> number). */
export function formValues(form) {
  const out = {};
  const els = form.elements ? [...form.elements] : [...form.querySelectorAll("input, select, textarea")];
  for (const el of els) {
    if (!el.name) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
    else if (el.type === "number" || el.dataset.dtype === "Number") out[el.name] = el.value === "" ? 0 : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

/** Chance (0-100) that 2D + dm >= target. */
export function chance2D(dm, target) {
  let hits = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + dm >= target) hits++;
  return Math.round((hits / 36) * 100);
}
