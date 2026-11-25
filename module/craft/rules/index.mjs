/**
 * The pure craft rules, grouped by book chapter. Exposed as `game.spacer.craft.rules` (api.mjs).
 * No Foundry globals: node tests import the files directly.
 */
import * as drives from "./drives.mjs";
import * as spaceCombat from "./space-combat.mjs";
import * as vehicles from "./vehicles.mjs";
import * as operations from "./operations.mjs";
import * as travel from "./travel.mjs";
import * as construction from "./construction.mjs";

/** Rules namespaces: drives (p.74-76), spaceCombat (p.84-87), vehicles (p.46-49), operations (p.66-72), travel (p.66-67), construction (p.74-78). */
export const rules = { drives, spaceCombat, vehicles, operations, travel, construction };
