/**
 * The Toolkit: a compact panel with one button per referee procedure. Results go to chat cards
 * and the campaign clock. Opened by game.spacer.tools.open() and the sidebar button.
 */
import { formValues, localizer, setting, signed, templatePath } from "../../shared/foundry.mjs";
import { CURRENT_WORLD_SETTING, selectedActor, setCurrentWorld, worldJournals } from "../context.mjs";
import { clockView, advanceClock, setClock } from "../clock.mjs";
import { generatePatron } from "../campaign.mjs";
import { generateNpc, randomNpc, rumours, demeanour } from "../npcs.mjs";
import { starportEncounter, settlementEncounter, spaceEncounter, shipReaction } from "../encounters.mjs";
import { weather, lastWeather, travel, planetsideEncounter, survival, rations } from "../planetside.mjs";
import { generateAnimal } from "../animals.mjs";
import { generateWorld, generateSubsector } from "../worlds.mjs";
import { freight, passengers } from "../trade.mjs";
import { oracle, randomEvent } from "../oracle.mjs";
import { TradeCalculator } from "./trade.mjs";
import { PATRON_LOCATIONS } from "../rules/patron.mjs";
import { SPACE_LOCATIONS } from "../rules/space.mjs";
import { ZONES, TERRAIN } from "../rules/planetside.mjs";
import { ANIMAL_TERRAIN } from "../rules/animals.mjs";
import { DENSITY } from "../rules/world.mjs";
import { ACTIVITIES } from "../rules/survival.mjs";
import { LIKELIHOOD } from "../rules/oracle.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = localizer("SPACER.Tools");

/** { key: label } of a table keyed by id with a `label` (or a custom label function). */
const choices = (table, label = v => v.label) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, label(v)]));

/** The Toolkit window (ApplicationV2, id "spacer-toolkit"). */
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
      patron: () => generatePatron({ location: Toolkit.state.patronLocation }),
      npc: () => generateNpc(),
      randomNpc: () => randomNpc(),
      rumours: () => rumours(),
      demeanour: () => demeanour(),
      starport: () => starportEncounter(),
      settlement: () => settlementEncounter({ checkLegal: Toolkit.state.legal }),
      space: () => spaceEncounter({ location: Toolkit.state.spaceLocation, jump: Toolkit.state.jump, force: Toolkit.state.force }),
      hail: () => shipReaction({ scanning: false }),
      scan: () => shipReaction({ scanning: true, militarySensors: Toolkit.state.military }),
      weather: Toolkit.#weather,
      travel: () => travel({ terrain: Toolkit.state.terrain, mode: Toolkit.state.travelMode }),
      planetside: () => planetsideEncounter({ terrain: Toolkit.state.terrain, force: Toolkit.state.force }),
      survival: (event, target) => survival(target.dataset.activity, { terrain: Toolkit.state.terrain, advance: Toolkit.state.advance }),
      rations: () => rations(),
      animal: () => generateAnimal({ terrain: Toolkit.state.animalTerrain }),
      world: Toolkit.#world,
      subsector: Toolkit.#subsector,
      trade: () => new TradeCalculator().render(true),
      freight: () => freight(),
      passengers: () => passengers(),
      oracle: () => oracle({ question: Toolkit.state.question, likelihood: Toolkit.state.likelihood }),
      event: () => randomEvent(),
      openWorld: Toolkit.#openWorld
    }
  };

  static PARTS = { main: { template: templatePath("tools", "toolkit"), scrollable: [".stk-body"] } };

  /** Form choices, shared by every Toolkit render in this client. */
  static state = {
    patronLocation: "carouse", spaceLocation: "settled", jump: false, force: false, military: false, legal: false,
    terrain: "open", zone: "temperate", travelMode: "walk", animalTerrain: "open", advance: true,
    density: "typical", sizeMode: "standard", worldName: "", subsectorName: "", question: "", likelihood: "even",
    open: { time: true, campaign: true, encounters: false, planetside: false, worlds: false, trade: false, animals: false, oracle: false }
  };

  /** Template data: the form state, the clock, the world list, and the choices of each select. */
  async _prepareContext() {
    const w = lastWeather();
    return {
      s: Toolkit.state,
      isGM: game.user.isGM,
      clock: clockView(),
      currentWorld: setting(CURRENT_WORLD_SETTING, ""),
      worlds: { "": L("NoWorld"), ...Object.fromEntries(worldJournals().map(j => [j.id, `${j.name} ${j.flags.spacer.world.uwp ?? ""}`])) },
      actorName: (await selectedActor())?.name ?? L("NoActor"),
      patronLocations: choices(PATRON_LOCATIONS, v => `${v.label} (${v.range}, x${v.multiplier})`),
      spaceLocations: choices(SPACE_LOCATIONS),
      terrains: choices(TERRAIN),
      zones: ZONES,
      animalTerrains: choices(ANIMAL_TERRAIN),
      densities: choices(DENSITY, v => `${v.label} (${signed(v.dm)})`),
      sizeModes: { standard: "2D-2", earthlike: "2D+1 (Earth-sized)", large: "2D+3 (large)" },
      travelModes: { walk: "Walk", swim: "Swim", vehicle: "Vehicle (ground car)" },
      activities: Object.entries(ACTIVITIES).map(([k, v]) => ({ key: k, label: v.label })),
      likelihoods: choices(LIKELIHOOD, v => `${v.label} (${signed(v.dm)})`),
      weather: w ? `${w.type}: ${w.detail} (survival ${signed(w.survivalDM)}, next ${signed(w.nextDM)})` : ""
    };
  }

  /** Keep the form state on change (shared `formValues`) and the open sections on toggle. */
  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    for (const input of el.querySelectorAll("[name]")) {
      input.addEventListener("change", async () => {
        if (input.name === "currentWorld") {
          if (game.user.isGM) await setCurrentWorld(input.value);
          return;
        }
        const { currentWorld: _ignored, ...values } = formValues(el);
        Object.assign(Toolkit.state, values);
      });
    }
    for (const d of el.querySelectorAll("details[data-section]")) {
      d.addEventListener("toggle", () => { Toolkit.state.open[d.dataset.section] = d.open; });
    }
  }

  static async #advance(event, target) {
    await advanceClock(target.dataset.interval, { chat: false });
  }

  static async #resetClock() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("Clock.Reset") },
      content: `<p>${L("Clock.ResetConfirm")}</p>`
    });
    if (ok) await setClock({ seconds: 0 });
  }

  static async #weather() {
    await weather({ zone: Toolkit.state.zone });
    this.render();
  }

  static async #world() {
    const s = Toolkit.state;
    const { journal } = await generateWorld({ name: s.worldName.trim(), density: s.density, sizeMode: s.sizeMode });
    if (journal && game.user.isGM && !setting(CURRENT_WORLD_SETTING, "")) await setCurrentWorld(journal.id);
    journal?.sheet?.render(true);
    this.render();
  }

  static async #subsector() {
    const s = Toolkit.state;
    const { overview } = await generateSubsector({ name: s.subsectorName.trim(), density: s.density, sizeMode: s.sizeMode });
    overview?.sheet?.render(true);
    this.render();
  }

  static #openWorld() {
    game.journal.get(setting(CURRENT_WORLD_SETTING, ""))?.sheet?.render(true);
  }
}

