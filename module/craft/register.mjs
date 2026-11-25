/** Entry point of the "craft" area. Called from the init hook in module/spacer.mjs. */
import * as api from "./api.mjs";
import { ShipSheet } from "./sheets/ship-sheet.mjs";
import { VehicleSheet } from "./sheets/vehicle-sheet.mjs";
import { COMBAT_SETTING } from "./apps/space-combat.mjs";
import * as drives from "./rules/drives.mjs";
import * as spaceCombat from "./rules/space-combat.mjs";
import * as vehicles from "./rules/vehicles.mjs";
import * as operations from "./rules/operations.mjs";
import * as travel from "./rules/travel.mjs";
import * as construction from "./rules/construction.mjs";

const TEMPLATES = [
  "ship-header", "ship-stats", "ship-crew", "ship-finances", "ship-travel", "ship-notes",
  "vehicle-sheet", "construction", "space-combat"
].map(t => `systems/spacer/templates/craft/${t}.hbs`);

export function registerCraft() {
  const Actors = foundry.documents.collections.Actors;
  Actors.registerSheet("spacer", ShipSheet, { types: ["ship"], makeDefault: true, label: "SPACER.Craft.Sheet.ship" });
  Actors.registerSheet("spacer", VehicleSheet, { types: ["vehicle"], makeDefault: true, label: "SPACER.Craft.Sheet.vehicle" });

  game.settings.register("spacer", COMBAT_SETTING, { scope: "world", config: false, type: Object, default: {} });

  Hooks.on("renderChatMessageHTML", api.onRenderChatMessage);
  Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates(TEMPLATES));

  game.spacer.craft = {
    // Damage and combat
    damageShip: api.damageShip,
    damageVehicle: api.damageVehicle,
    damageCraft: api.damageCraft,
    fireWeapon: api.fireWeapon,
    repairShip: api.repairShip,
    crewAction: api.crewAction,
    // Travel
    travelToJumpPoint: api.travelToJumpPoint,
    travelInterplanetary: api.travelInterplanetary,
    jump: api.jump,
    refuel: api.refuel,
    procedure: api.procedure,
    encounterCheck: api.encounterCheck,
    // Finances
    payMonth: api.payMonth,
    calculateFinances: api.calculateFinances,
    bookFinances: api.bookFinances,
    // Vehicles
    driveCheck: api.driveCheck,
    vehicleSpeedDM: api.vehicleSpeedDM,
    ram: api.ram,
    hitAndRun: api.hitAndRun,
    offensiveDriving: api.offensiveDriving,
    // Apps
    openConstruction: api.openConstruction,
    openSpaceCombat: api.openSpaceCombat,
    buildShip: async (design, opts) => (await import("./apps/construction.mjs")).ConstructionWizard.build(design, opts),
    // Crew helpers
    crewFor: api.crewFor,
    crewActors: api.crewActors,
    // Pure rules
    rules: { drives, spaceCombat, vehicles, operations, travel, construction }
  };
}
