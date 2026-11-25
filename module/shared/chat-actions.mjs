/**
 * One dispatcher for every chat card button in the system.
 *
 * A card button has `data-action="<area>-<name>"` (for example `play-damage`, `craft-hit`).
 * Each area registers its handlers once, in its register function:
 *
 *   registerChatActions({ "play-damage": (event, button, message) => ... });
 *
 * `installChatActions()` (called once from module/spacer.mjs) adds a single
 * `renderChatMessageHTML` hook that binds the click of every `[data-action]` button to the
 * registered handler. Handlers get the click event, the button element, and the ChatMessage.
 */
const HANDLERS = new Map();

/** Register chat button handlers: { "area-action": async (event, button, message) => {} }. */
export function registerChatActions(handlers) {
  for (const [action, fn] of Object.entries(handlers)) {
    if (HANDLERS.has(action)) throw new Error(`Chat action "${action}" is registered twice`);
    HANDLERS.set(action, fn);
  }
}

/** The registered action names (for tests and debugging). */
export const chatActions = () => [...HANDLERS.keys()];

/** Install the one renderChatMessageHTML hook. Called once from the init hook. */
export function installChatActions() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll("[data-action]")) {
      const fn = HANDLERS.get(button.dataset.action);
      if (!fn || button.dataset.spacerBound) continue;
      button.dataset.spacerBound = "1";
      button.addEventListener("click", async event => {
        event.preventDefault();
        button.disabled = true;
        try { await fn(event, button, message); }
        catch (err) { console.error(err); ui.notifications.error(err.message); }
        finally { button.disabled = false; }
      });
    }
  });
}
