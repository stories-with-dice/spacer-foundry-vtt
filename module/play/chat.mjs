/** Chat card buttons of the play area, registered with registerChatActions (module/shared/chat-actions.mjs). */
import { SYSTEM_ID, localizer, pickActors, resolveActor } from "../shared/foundry.mjs";
import { applyDamage } from "./damage.mjs";
import { resistStun } from "./weapons.mjs";

const L = localizer("SPACER");

/** The attack data stored on an attack card (flags.spacer.attack), or {}. */
const attackFlags = message => message?.flags?.[SYSTEM_ID]?.attack ?? {};

/**
 * "Apply damage" on an attack card (templates/play/chat/attack.hbs). Applies the card's damage to
 * the targeted or controlled tokens, else to the card's target. Persons and creatures go through
 * applyDamage; vehicles and ships go to the craft area (game.spacer.craft.damageCraft).
 */
async function onDamage(_event, button, message) {
  const atk = attackFlags(message);
  const amount = Number(button.dataset.amount ?? atk.damage ?? 0);
  const actors = await pickActors(atk.target ? [atk.target] : []);
  if (!actors.length) return ui.notifications.warn(L("Chat.NoTarget"));
  for (const a of actors) {
    if (!a.isOwner) { ui.notifications.warn(L("Chat.NotOwner", { name: a.name })); continue; }
    await applyDamage(a, amount, { energy: !!atk.energy, dice: atk.dice ?? 0, source: button.dataset.source ?? "" });
  }
}

/** "Target resists stun" on an attack card: an END check for each target (p.33). */
async function onStun(_event, _button, message) {
  const atk = attackFlags(message);
  const actors = await pickActors(atk.target ? [atk.target] : []);
  for (const a of actors) await resistStun(a);
}

/** Open the sheet of the actor in `data-uuid`. */
async function onSheet(_event, button) {
  const a = await resolveActor(button.dataset.uuid);
  a?.sheet.render(true);
}

/**
 * The play chat actions, keyed by `data-action`. Passed to registerChatActions by registerPlay.
 * @type {Record<string, (event: Event, button: HTMLElement, message: ChatMessage) => Promise<void>>}
 */
export const PLAY_CHAT_ACTIONS = {
  "play-damage": onDamage,
  "play-stun": onStun,
  "play-sheet": onSheet
};
