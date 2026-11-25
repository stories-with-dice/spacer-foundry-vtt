/** Entry point of the "tools" area. Called from the init hook in module/spacer.mjs. */
import * as api from "./api.mjs";
import { registerClockSetting, advanceClock, setClock, getClock, clockView } from "./clock.mjs";
import { Toolkit } from "./toolkit.mjs";
import { TradeCalculator } from "./trade-app.mjs";
import { formatDate } from "./rules/time.mjs";

const TEMPLATES = ["card", "toolkit", "trade"].map(n => `systems/spacer/templates/tools/${n}.hbs`);

/** Re-render open tools apps (after a setting change). */
function rerender() {
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof Toolkit || app instanceof TradeCalculator) app.render();
  }
}

/** Open the Toolkit (one instance). */
export function open() {
  const existing = foundry.applications.instances.get("spacer-toolkit");
  if (existing) { existing.render({ force: true }); existing.bringToFront?.(); return existing; }
  const app = new Toolkit();
  app.render({ force: true });
  return app;
}

/** Add the Toolkit button to a sidebar directory header. */
function addHeaderButton(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".spacer-tools-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "spacer spacer-tools-open";
  btn.innerHTML = `<i class="fa-solid fa-toolbox" inert></i> <span>${game.i18n.localize("SPACER.Tools.Open")}</span>`;
  btn.addEventListener("click", ev => { ev.preventDefault(); open(); });
  actions.append(btn);
}

export function registerTools() {
  registerClockSetting(rerender);
  game.settings.register("spacer", api.CURRENT_WORLD_SETTING, { scope: "world", config: false, type: String, default: "", onChange: rerender });
  game.settings.register("spacer", api.PLANETSIDE_SETTING, { scope: "world", config: false, type: Object, default: {}, onChange: rerender });

  foundry.applications.handlebars.loadTemplates(TEMPLATES);

  Hooks.on("renderActorDirectory", addHeaderButton);
  Hooks.on("renderJournalDirectory", addHeaderButton);
  Hooks.on("controlToken", () => foundry.applications.instances.get("spacer-toolkit")?.render());

  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll(".spacer-tools-card [data-action^='tools-']").forEach(button => {
      button.addEventListener("click", async ev => {
        ev.preventDefault();
        button.disabled = true;
        try { await api.onCardAction(message, button.dataset.action, button); }
        catch (err) { console.error(err); ui.notifications.error(err.message); }
        finally { button.disabled = false; }
      });
    });
  });

  game.spacer.tools = {
    open,
    Toolkit,
    TradeCalculator,
    trade: () => new TradeCalculator().render({ force: true }),
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
    setCurrentWorld: id => game.settings.set("spacer", api.CURRENT_WORLD_SETTING, id?.id ?? id ?? ""),
    clock: {
      get: getClock,
      view: clockView,
      advance: (by, opts = {}) => advanceClock(by, { dice: api.dice(), ...opts }),
      set: setClock,
      format: s => formatDate(s ?? getClock().seconds, getClock().startYear)
    }
  };
}
