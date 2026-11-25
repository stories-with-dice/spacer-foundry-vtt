/**
 * Entry point of the tools area: settings, templates, hooks, chat card actions, and
 * game.spacer.tools. `registerTools()` is called from the init hook in module/spacer.mjs.
 */
import { SYSTEM_ID, addDirectoryButton, localizer, preloadTemplates, templatePath } from "../shared/foundry.mjs";
import { registerChatActions } from "../shared/chat-actions.mjs";
import * as api from "./api.mjs";
import { registerClockSetting } from "./clock.mjs";
import { npcChatActions } from "./npcs.mjs";
import { campaignChatActions } from "./campaign.mjs";
import { animalChatActions } from "./animals.mjs";
import { worldChatActions } from "./worlds.mjs";

const L = localizer("SPACER.Tools");

/** Re-render the open tools windows (after a setting change). */
function rerender() {
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof api.Toolkit || app instanceof api.TradeCalculator) app.render();
  }
}

/** Open the Toolkit (one instance) and return it. */
export function open() {
  const existing = foundry.applications.instances.get("spacer-toolkit");
  if (existing) { existing.render({ force: true }); existing.bringToFront?.(); return existing; }
  const app = new api.Toolkit();
  app.render({ force: true });
  return app;
}

/** Add the Toolkit button to the Actors and Journal directory headers. */
function addToolkitButton(app, html) {
  addDirectoryButton(html, { id: "tools-open", label: L("Open"), icon: "fa-solid fa-toolbox", onClick: open, classes: ["spacer", "spacer-tools-open"] });
}

/** Register the tools area (init hook). */
export function registerTools() {
  registerClockSetting(rerender);
  game.settings.register(SYSTEM_ID, api.CURRENT_WORLD_SETTING, { scope: "world", config: false, type: String, default: "", onChange: rerender });
  game.settings.register(SYSTEM_ID, api.PLANETSIDE_SETTING, { scope: "world", config: false, type: Object, default: {}, onChange: rerender });

  preloadTemplates(["card", "toolkit", "trade"].map(n => templatePath("tools", n)));

  Hooks.on("renderActorDirectory", addToolkitButton);
  Hooks.on("renderJournalDirectory", addToolkitButton);
  Hooks.on("controlToken", () => foundry.applications.instances.get("spacer-toolkit")?.render());

  registerChatActions({ ...npcChatActions, ...campaignChatActions, ...animalChatActions, ...worldChatActions });

  game.spacer.tools = {
    open,
    Toolkit: api.Toolkit,
    TradeCalculator: api.TradeCalculator,
    trade: () => new api.TradeCalculator().render({ force: true }),
    generateWorld: api.generateWorld,
    generateSubsector: api.generateSubsector,
    generatePatron: api.generatePatron,
    generateNpc: api.generateNpc,
    randomNpc: api.randomNpc,
    rumours: api.rumours,
    demeanour: api.demeanour,
    generateAnimal: api.generateAnimal,
    starportEncounter: api.starportEncounter,
    settlementEncounter: api.settlementEncounter,
    spaceEncounter: api.spaceEncounter,
    shipReaction: api.shipReaction,
    planetsideEncounter: api.planetsideEncounter,
    weather: api.weather,
    travel: api.travel,
    survival: api.survival,
    rations: api.rations,
    freight: api.freight,
    passengers: api.passengers,
    mail: api.mail,
    oracle: api.oracle,
    randomEvent: api.randomEvent,
    createNpcActor: api.createNpcActor,
    createCreatureActor: api.createCreatureActor,
    createWorldJournal: api.createWorldJournal,
    worldJournals: api.worldJournals,
    currentWorld: api.currentWorld,
    setCurrentWorld: api.setCurrentWorld,
    clock: {
      get: api.getClock,
      view: api.clockView,
      advance: api.advanceClock,
      set: api.setClock,
      format: api.formatClock
    }
  };
}
