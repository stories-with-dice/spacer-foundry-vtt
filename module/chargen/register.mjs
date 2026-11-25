/** Entry point of the "chargen" area. Called from the init hook in module/spacer.mjs. */
import * as engine from "./rules/engine.mjs";
import * as careers from "./rules/careers.mjs";
import { ChargenWizard, openChargen } from "./wizard.mjs";
import { applyToActor, postSummary } from "./apply.mjs";

export function registerChargen() {
  game.spacer.chargen = {
    open: openChargen,
    engine: { ...engine, careers },
    ChargenWizard,
    applyToActor,
    postSummary,
    createSpacer
  };
  foundry.applications.handlebars.loadTemplates([
    "systems/spacer/templates/chargen/wizard.hbs",
    "systems/spacer/templates/chargen/chat-card.hbs"
  ]);
  Hooks.on("renderActorDirectory", addDirectoryButton);
}

/** Create a new character and open the wizard. */
async function createSpacer() {
  const actor = await Actor.create({ name: game.i18n.localize("SPACER.Chargen.NewName"), type: "character" });
  if (actor) openChargen(actor);
  return actor;
}

/** Add "Create Spacer" to the Actors directory header (v13 and v14: `html` is an HTMLElement). */
function addDirectoryButton(app, html) {
  if (!game.user?.can?.("ACTOR_CREATE")) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const actions = root?.querySelector(".directory-header .header-actions");
  if (!actions || actions.querySelector(".spacer-create-spacer")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spacer-create-spacer";
  button.innerHTML = `<i class="fa-solid fa-user-astronaut" inert></i><span>${game.i18n.localize("SPACER.Chargen.CreateSpacer")}</span>`;
  button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); createSpacer(); });
  actions.append(button);
}
