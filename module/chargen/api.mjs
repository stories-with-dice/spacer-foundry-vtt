/**
 * Chargen API: the public functions of the "chargen" area, exposed as game.spacer.chargen by
 * register.mjs. Re-exports the wizard and the actor glue; the pure engine is under `engine`.
 */
import * as engineApi from "./rules/engine.mjs";
import * as careers from "./rules/careers.mjs";
import { localizer } from "../shared/foundry.mjs";
import { openChargen } from "./apps/wizard.mjs";

export { ChargenWizard, openChargen } from "./apps/wizard.mjs";
export { applyToActor, postSummary } from "./apply.mjs";

/** The pure lifepath engine (Lifepath, seededDice, summary, ...) plus the career data as `careers`. */
export const engine = { ...engineApi, careers };

const L = localizer("SPACER.Chargen");

/**
 * Create a new character actor named "New Spacer" and open the wizard for it.
 * Called by the "Create Spacer" button of the Actors directory. Returns the actor (or null).
 */
export async function createSpacer() {
  const actor = await Actor.create({ name: L("NewName"), type: "character" });
  if (actor) openChargen(actor);
  return actor;
}
