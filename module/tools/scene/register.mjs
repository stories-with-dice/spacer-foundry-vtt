/**
 * Entry points of the subsector scenes: the chat card button, the overview journal header
 * control, the canvasReady hook, and game.spacer.tools.createSubsectorScene.
 * `registerSubsectorScenes()` is called once by module/tools/register.mjs (init hook), after
 * game.spacer.tools exists.
 */
import { localizer } from "../../shared/foundry.mjs";
import { registerChatActions } from "../../shared/chat-actions.mjs";
import { createSubsectorScene, showSubsectorNotes, subsectorOf } from "./scene.mjs";

const L = localizer("SPACER.Tools.Scene");

/** Run `createSubsectorScene` from a button: errors become notifications. */
async function fromButton(input) {
  try { return await createSubsectorScene(input); }
  catch (err) { ui.notifications.error(err.message); return null; }
}

/**
 * Header control of the subsector overview journal (JournalEntrySheet, ApplicationV2 in v13 and
 * v14): "Create scene" in the window menu, for the GM, on entries with flags.spacer.subsector.
 */
function addHeaderControl(app, controls) {
  const doc = app.document;
  if (!game.user.isGM || !subsectorOf(doc)) return;
  if (controls.some(c => c.action === "spacerSubsectorScene")) return;
  controls.push({ action: "spacerSubsectorScene", icon: "fa-solid fa-map-location-dot", label: L("Create"), onClick: () => fromButton(doc) });
}

/** Register the subsector scene hooks, the chat action, and the API function. */
export function registerSubsectorScenes() {
  registerChatActions({
    "tools-subsector-scene": async (event, button) => fromButton(button.dataset.uuid)
  });
  Hooks.on("getHeaderControlsJournalEntrySheet", addHeaderControl);
  Hooks.on("canvasReady", showSubsectorNotes);
  if (game.spacer?.tools) game.spacer.tools.createSubsectorScene = createSubsectorScene;
}
