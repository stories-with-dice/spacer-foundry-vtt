/**
 * Foundry-side helpers shared by every area (play, craft, chargen, tools).
 * Uses only APIs that exist in Foundry v13 and v14. Pure rules code must not import this file.
 */
import { SYSTEM_ID } from "../config.mjs";

export { SYSTEM_ID };

/** Signed number as text: +2, -1, +0. */
export const signed = n => (Number(n) >= 0 ? `+${Number(n)}` : `${Number(n)}`);

/**
 * A localize function for one i18n prefix.
 * `const L = localizer("SPACER.Craft"); L("Hit.Title"); L("Hit.Damage", { n: 3 })`.
 */
export function localizer(prefix) {
  return (key, data) => {
    const k = `${prefix}.${key}`;
    return data ? game.i18n.format(k, data) : game.i18n.localize(k);
  };
}

/** Path of a template of an area: templatePath("play", "chat/attack") -> systems/spacer/templates/play/chat/attack.hbs */
export const templatePath = (area, p) => `systems/${SYSTEM_ID}/templates/${area}/${p}.hbs`;

/** Render a template of an area with data. */
export function renderAreaTemplate(area, p, data) {
  return foundry.applications.handlebars.renderTemplate(templatePath(area, p), data);
}

/** Preload templates (array of full paths, or an object of { id: path }). */
export function preloadTemplates(paths) {
  return foundry.applications.handlebars.loadTemplates(paths);
}

/** Read a system setting, with a default when the setting is not registered. */
export function setting(key, fallback = undefined) {
  try { return game.settings.get(SYSTEM_ID, key); } catch { return fallback; }
}

/** Apply the user's current message mode: v14 `applyMode`, v13 `applyRollMode`. */
export function applyMessageMode(msg) {
  const CM = ChatMessage.implementation;
  if (typeof CM.applyMode === "function") CM.applyMode(msg, game.settings.get("core", "messageMode"));
  else CM.applyRollMode(msg, game.settings.get("core", "rollMode"));
  return msg;
}

/**
 * Post a chat card rendered from an area template.
 * @param {object} o
 * @param {string} o.area       "play" | "craft" | "chargen" | "tools"
 * @param {string} o.template   template under templates/<area>, without .hbs
 * @param {object} o.data
 * @param {Actor}  [o.actor]    speaker
 * @param {Roll[]} [o.rolls]
 * @param {object} [o.flags]    stored under flags.spacer
 * @param {string} [o.content]  pre-rendered HTML instead of a template
 */
export async function postCard({ area, template, data = {}, actor, rolls = [], flags = {}, content } = {}) {
  const html = content ?? await renderAreaTemplate(area, template, data);
  const msg = {
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: html,
    rolls,
    flags: { [SYSTEM_ID]: flags }
  };
  if (rolls.length) msg.sound = CONFIG.sounds.dice;
  applyMessageMode(msg);
  return ChatMessage.implementation.create(msg);
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

/**
 * Add a button to a sidebar directory header (Actors, Journal, ...). Safe to call on every render:
 * it does nothing when the button is already there. `html` is the app element (HTMLElement in v13+).
 */
export function addDirectoryButton(html, { id, label, icon, onClick, classes = [] }) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(`[data-spacer-button="${id}"]`)) return;
  const header = root.querySelector(".directory-header .header-actions") ?? root.querySelector(".directory-header") ?? root;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.spacerButton = id;
  button.classList.add(...classes);
  button.innerHTML = `<i class="${icon}"></i> ${label}`;
  button.addEventListener("click", ev => { ev.preventDefault(); onClick(ev); });
  header.append(button);
}
