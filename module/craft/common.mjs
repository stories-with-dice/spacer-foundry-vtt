/**
 * Small helpers for the craft glue files: i18n, chat cards, dice, credits, and crew lookup.
 * Built on module/shared; nothing here duplicates a shared helper.
 */
import { localizer, postCard } from "../shared/foundry.mjs";
import { makeDice } from "../shared/dice.mjs";
import { applyDamage } from "../play/api.mjs";

/** Localize a key under SPACER.Craft: L("Card.fire", { name }). */
export const L = localizer("SPACER.Craft");

/**
 * Credits as text: 125000 -> "125,000cr". Used by the sheets, the wizard, and the cards.
 * @param {number} n
 * @returns {string}
 */
export const credits = n => `${Math.round(Number(n) || 0).toLocaleString("en-US")}cr`;

/**
 * Escape text for card HTML.
 * @param {*} v
 * @returns {string}
 */
export const esc = v => foundry.utils.escapeHTML(String(v ?? ""));

/**
 * An HTML list of the non-empty entries.
 * @param {string[]} items  HTML strings
 * @returns {string}
 */
export const li = items => `<ul>${items.filter(Boolean).map(i => `<li>${i}</li>`).join("")}</ul>`;

/**
 * The dice object for craft rolls (shared makeDice over the default random source).
 * Use `dice().roll("2D")`. A function, so each call reads the current CONFIG.Dice source.
 * @returns {ReturnType<typeof makeDice>}
 */
export const dice = () => makeDice();

/**
 * Post a craft chat card (templates/craft/chat/card.hbs) through the shared postCard.
 * Every craft card carries `flags.spacer.craft`, so tests and cleanup scripts can find them.
 * @param {object} o
 * @param {Actor} [o.actor]  speaker
 * @param {string} o.title   plain text
 * @param {string} [o.body]  HTML
 * @param {object} [o.flags] extra data under flags.spacer.craft
 * @returns {Promise<ChatMessage>}
 */
export function card({ actor, title, body = "", flags = {} }) {
  return postCard({ area: "craft", template: "chat/card", data: { title, body }, actor, flags: { craft: { card: true, ...flags } } });
}

/**
 * An actor from a UUID or id, synchronously (sheets and app contexts cannot await).
 * Async code uses the shared resolveActor instead.
 * @param {Actor|string|null} ref
 * @returns {Actor|null}
 */
export function actorSync(ref) {
  if (!ref) return null;
  if (ref.documentName === "Actor") return ref;
  if (typeof ref !== "string") return ref.actor ?? null;
  const doc = fromUuidSync(ref) ?? game.actors.get(ref) ?? null;
  return doc?.documentName === "Actor" ? doc : (doc?.actor ?? null);
}

/**
 * The crew actor for a role on a ship, or the operator (first occupant) of a vehicle.
 * Reads `system.crew`. Called by the damage, weapons, travel, and crew action glue and the sheets.
 * @param {Actor} craft  ship or vehicle
 * @param {string} [role]
 * @returns {Actor|null}
 */
export function crewFor(craft, role) {
  if (craft.type === "vehicle") return actorSync(craft.system.crew[0]);
  const entry = craft.system.crew.find(c => c.role === role && c.actor);
  return actorSync(entry?.actor);
}

/**
 * Every crew member or occupant aboard a craft, without repeats. Reads `system.crew`.
 * @param {Actor} craft
 * @returns {Actor[]}
 */
export function crewActors(craft) {
  const refs = craft.type === "vehicle" ? craft.system.crew : craft.system.crew.map(c => c.actor);
  return [...new Set(refs.filter(Boolean))].map(actorSync).filter(Boolean);
}

/** Actor types that take personal damage through game.spacer.play (play/api.mjs applyDamage). */
export const PERSON_TYPES = ["character", "npc", "creature"];

/**
 * Damage a person aboard or near a craft through the play area's applyDamage (END first, then
 * STR/DEX, p.43; creatures lose hits, p.110). Writes the actor; posts no card of its own.
 * Called by the ship and vehicle damage glue (crew injury, occupants, explosions).
 * @param {Actor|null} actor
 * @param {number} amount  personal damage
 * @param {string} source  short source text for the play area
 * @returns {Promise<string>} an HTML line for the craft card
 */
export async function hurtPerson(actor, amount, source) {
  if (!actor || amount <= 0) return `${esc(actor?.name ?? "?")}: ${amount}`;
  if (!PERSON_TYPES.includes(actor.type)) return `${esc(actor.name)}: ${amount} ${L("Card.damageToApply")}`;
  try { await applyDamage(actor, amount, { source, chat: false }); } catch (err) { console.error(err); }
  return `${esc(actor.name)}: ${amount} ${L("Card.damageApplied")}`;
}
