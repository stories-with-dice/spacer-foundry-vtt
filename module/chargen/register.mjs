/** Entry point of the "chargen" area. Called from the init hook in module/spacer.mjs. */
import * as api from "./api.mjs";
import { localizer, preloadTemplates, templatePath, addDirectoryButton } from "../shared/foundry.mjs";

const L = localizer("SPACER.Chargen");

/**
 * Register the chargen area: set game.spacer.chargen, preload the templates, and add the
 * "Create Spacer" button to the Actors directory header.
 */
export function registerChargen() {
  game.spacer.chargen = {
    open: api.openChargen,
    engine: api.engine,
    ChargenWizard: api.ChargenWizard,
    applyToActor: api.applyToActor,
    postSummary: api.postSummary,
    createSpacer: api.createSpacer
  };
  preloadTemplates([templatePath("chargen", "wizard"), templatePath("chargen", "chat-card")]);
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user?.can?.("ACTOR_CREATE")) return;
    addDirectoryButton(html, {
      id: "chargen-create", label: L("CreateSpacer"), icon: "fa-solid fa-user-astronaut", onClick: () => api.createSpacer()
    });
  });
}
