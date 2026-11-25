/**
 * Entry point of the "craft" area (starships and vehicles). Called from the init hook in
 * module/spacer.mjs: registers the sheets, settings, chat buttons, template preloads, the
 * one-time flag migration, and game.spacer.craft.
 */
import * as api from "./api.mjs";
import { ShipSheet } from "./sheets/ship-sheet.mjs";
import { VehicleSheet } from "./sheets/vehicle-sheet.mjs";
import { COMBAT_SETTING } from "./apps/space-combat.mjs";
import { weaponChatActions } from "./weapons.mjs";
import { MIGRATION_SETTING, migrateCraft } from "./migration.mjs";
import { registerChatActions } from "../shared/chat-actions.mjs";
import { preloadTemplates, templatePath } from "../shared/foundry.mjs";

/** Templates preloaded at setup (sheet parts and the chat card). */
const TEMPLATES = [
  "ship-header", "ship-stats", "ship-crew", "ship-finances", "ship-travel", "ship-notes",
  "vehicle-sheet", "construction", "space-combat", "chat/card"
].map(t => templatePath("craft", t));

/**
 * Register the craft area. Writes game.spacer.craft (the public API in api.mjs).
 * Called once by the init hook in module/spacer.mjs.
 */
export function registerCraft() {
  const Actors = foundry.documents.collections.Actors;
  Actors.registerSheet("spacer", ShipSheet, { types: ["ship"], makeDefault: true, label: "SPACER.Craft.Sheet.ship" });
  Actors.registerSheet("spacer", VehicleSheet, { types: ["vehicle"], makeDefault: true, label: "SPACER.Craft.Sheet.vehicle" });

  game.settings.register("spacer", COMBAT_SETTING, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register("spacer", MIGRATION_SETTING, { scope: "world", config: false, type: Number, default: 0 });

  registerChatActions(weaponChatActions);
  Hooks.once("setup", () => preloadTemplates(TEMPLATES));
  Hooks.once("ready", () => migrateCraft().catch(err => console.error("Spacer | craft migration failed", err)));

  game.spacer.craft = { ...api };
}
