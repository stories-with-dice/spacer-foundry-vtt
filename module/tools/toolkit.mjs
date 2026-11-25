/**
 * The Toolkit: a compact panel with one button per referee procedure. Results go to chat cards
 * and the campaign clock.
 */
import * as api from "./api.mjs";
import { clockView, advanceClock, setClock } from "./clock.mjs";
import { TradeCalculator } from "./trade-app.mjs";
import { PATRON_LOCATIONS } from "./rules/patron.mjs";
import { SPACE_LOCATIONS } from "./rules/space.mjs";
import { ZONES, TERRAIN } from "./rules/planetside.mjs";
import { ANIMAL_TERRAIN } from "./rules/animals.mjs";
import { DENSITY } from "./rules/world.mjs";
import { ACTIVITIES } from "./rules/survival.mjs";
import { LIKELIHOOD } from "./rules/oracle.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Toolkit extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "spacer-toolkit",
    classes: ["spacer", "spacer-tools", "spacer-toolkit"],
    tag: "div",
    window: { title: "SPACER.Tools.Title", icon: "fa-solid fa-toolbox", resizable: true },
    position: { width: 400, height: 760 },
    actions: {
      advance: Toolkit.#advance,
      resetClock: Toolkit.#resetClock,
      patron: () => api.generatePatron({ location: Toolkit.state.patronLocation }),
      npc: () => api.generateNpc(),
      randomNpc: () => api.randomNpc(),
      rumours: () => api.rumours(),
      demeanour: () => api.demeanour(),
      starport: () => api.starportEncounter(),
      settlement: () => api.settlementEncounter({ checkLegal: Toolkit.state.legal }),
      space: () => api.spaceEncounter({ location: Toolkit.state.spaceLocation, jump: Toolkit.state.jump, force: Toolkit.state.force }),
      hail: () => api.shipReaction({ scanning: false }),
      scan: () => api.shipReaction({ scanning: true, militarySensors: Toolkit.state.military }),
      weather: Toolkit.#weather,
      travel: () => api.travel({ terrain: Toolkit.state.terrain, mode: Toolkit.state.travelMode }),
      planetside: () => api.planetsideEncounter({ terrain: Toolkit.state.terrain, force: Toolkit.state.force }),
      survival: (event, target) => api.survival(target.dataset.activity, { terrain: Toolkit.state.terrain, advance: Toolkit.state.advance }),
      rations: () => api.rations(),
      animal: () => api.generateAnimal({ terrain: Toolkit.state.animalTerrain }),
      world: Toolkit.#world,
      subsector: Toolkit.#subsector,
      trade: () => new TradeCalculator().render(true),
      freight: () => api.freight(),
      passengers: () => api.passengers(),
      oracle: () => api.oracle({ question: Toolkit.state.question, likelihood: Toolkit.state.likelihood }),
      event: () => api.randomEvent(),
      openWorld: Toolkit.#openWorld
    }
  };

  static PARTS = { main: { template: "systems/spacer/templates/tools/toolkit.hbs", scrollable: [".stk-body"] } };

  /** Form choices, shared by every Toolkit render in this client. */
  static state = {
    patronLocation: "carouse", spaceLocation: "settled", jump: false, force: false, military: false, legal: false,
    terrain: "open", zone: "temperate", travelMode: "walk", animalTerrain: "open", advance: true,
    density: "typical", sizeMode: "standard", worldName: "", subsectorName: "", question: "", likelihood: "even",
    open: { time: true, campaign: true, encounters: false, planetside: false, worlds: false, trade: false, animals: false, oracle: false }
  };

  async _prepareContext() {
    const s = Toolkit.state;
    const cur = game.settings.get("spacer", api.CURRENT_WORLD_SETTING);
    const worlds = Object.fromEntries(api.worldJournals().map(j => [j.id, `${j.name} ${j.flags.spacer.world.uwp ?? ""}`]));
    const weather = api.lastWeather();
    return {
      s,
      isGM: game.user.isGM,
      clock: clockView(),
      currentWorld: cur,
      worlds: { "": game.i18n.localize("SPACER.Tools.NoWorld"), ...worlds },
      actorName: api.selectedActor()?.name ?? game.i18n.localize("SPACER.Tools.NoActor"),
      patronLocations: Object.fromEntries(Object.entries(PATRON_LOCATIONS).map(([k, v]) => [k, `${v.label} (${v.range}, x${v.multiplier})`])),
      spaceLocations: Object.fromEntries(Object.entries(SPACE_LOCATIONS).map(([k, v]) => [k, v.label])),
      terrains: Object.fromEntries(Object.entries(TERRAIN).map(([k, v]) => [k, v.label])),
      zones: ZONES,
      animalTerrains: Object.fromEntries(Object.entries(ANIMAL_TERRAIN).map(([k, v]) => [k, v.label])),
      densities: Object.fromEntries(Object.entries(DENSITY).map(([k, v]) => [k, `${v.label} (${v.dm >= 0 ? "+" : ""}${v.dm})`])),
      sizeModes: { standard: "2D-2", earthlike: "2D+1 (Earth-sized)", large: "2D+3 (large)" },
      travelModes: { walk: "Walk", swim: "Swim", vehicle: "Vehicle (ground car)" },
      activities: Object.entries(ACTIVITIES).map(([k, v]) => ({ key: k, label: v.label })),
      likelihoods: Object.fromEntries(Object.entries(LIKELIHOOD).map(([k, v]) => [k, `${v.label} (${v.dm >= 0 ? "+" : ""}${v.dm})`])),
      weather: weather ? `${weather.type}: ${weather.detail} (survival ${weather.survivalDM >= 0 ? "+" : ""}${weather.survivalDM}, next ${weather.nextDM >= 0 ? "+" : ""}${weather.nextDM})` : ""
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    el.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", async () => {
        const k = input.dataset.field;
        const v = input.type === "checkbox" ? input.checked : input.value;
        if (k === "currentWorld") {
          if (game.user.isGM) await game.settings.set("spacer", api.CURRENT_WORLD_SETTING, v);
          return;
        }
        Toolkit.state[k] = v;
      });
    });
    el.querySelectorAll("details[data-section]").forEach(d => {
      d.addEventListener("toggle", () => { Toolkit.state.open[d.dataset.section] = d.open; });
    });
  }

  static async #advance(event, target) {
    await advanceClock(target.dataset.interval, { dice: api.dice(), chat: false });
  }

  static async #resetClock() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SPACER.Tools.Clock.Reset") },
      content: `<p>${game.i18n.localize("SPACER.Tools.Clock.ResetConfirm")}</p>`
    });
    if (ok) await setClock({ seconds: 0 });
  }

  static async #weather() {
    await api.weather({ zone: Toolkit.state.zone });
    this.render();
  }

  static async #world() {
    const s = Toolkit.state;
    const { journal } = await api.generateWorld({ name: s.worldName.trim(), density: s.density, sizeMode: s.sizeMode });
    if (journal && game.user.isGM && !game.settings.get("spacer", api.CURRENT_WORLD_SETTING)) await game.settings.set("spacer", api.CURRENT_WORLD_SETTING, journal.id);
    journal?.sheet?.render(true);
    this.render();
  }

  static async #subsector() {
    const s = Toolkit.state;
    const { overview } = await api.generateSubsector({ name: s.subsectorName.trim(), density: s.density, sizeMode: s.sizeMode });
    overview?.sheet?.render(true);
    this.render();
  }

  static #openWorld() {
    const id = game.settings.get("spacer", api.CURRENT_WORLD_SETTING);
    game.journal.get(id)?.sheet?.render(true);
  }
}
