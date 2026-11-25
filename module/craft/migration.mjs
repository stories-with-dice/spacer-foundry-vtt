/**
 * One-time migration of craft state from flags to data model fields.
 * Before: ships kept fuelHits, computerHits, unrefined, armour, and some finances in
 * `flags.spacer.craft`, and ship weapons kept `flags.spacer.craft.disabled`.
 * After: the same values live in `system.*` (ShipData, ShipWeaponData) and the flags are unset.
 * `flags.spacer.craft.design` (the construction wizard's record) stays.
 */
import { setting } from "../shared/foundry.mjs";
import { SHIP_ARMOR_LOCATIONS } from "./rules/drives.mjs";

/** World setting that stores the last craft migration version that ran. */
export const MIGRATION_SETTING = "craftMigration";
/** Bump this when a new migration step is added. */
export const MIGRATION_VERSION = 1;

/** Ship flags that move to a system path, as [flag key, system path]. */
const SHIP_FIELDS = [
  ["fuelHits", "system.fuelHits"],
  ["computerHits", "system.computerHits"],
  ["unrefined", "system.unrefined"],
  ["mortgagePaid", "system.finances.mortgagePaid"],
  ["monthsSinceMaintenance", "system.finances.monthsSinceMaintenance"],
  ["maintenanceSurcharge", "system.finances.maintenanceSurcharge"]
];

/**
 * The system update for one ship's craft flags, and the flag keys to unset afterwards.
 * Reads `actor.flags.spacer.craft`; writes nothing.
 * Example: flags.spacer.craft.fuelHits 2 -> `{ update: { "system.fuelHits": 2 }, unset: ["fuelHits"] }`.
 * @param {Actor} actor  ship
 * @returns {{update: object, unset: string[]}}
 */
export function shipMigration(actor) {
  const f = actor.flags?.spacer?.craft ?? {};
  const update = {};
  const unset = [];
  for (const [key, path] of SHIP_FIELDS) {
    if (!(key in f)) continue;
    update[path] = key === "unrefined" ? !!f[key] : Math.max(0, Number(f[key]) || 0);
    unset.push(key);
  }
  if (f.armor && typeof f.armor === "object") {
    for (const k of SHIP_ARMOR_LOCATIONS) if (k in f.armor) update[`system.armor.${k}`] = Math.max(0, Number(f.armor[k]) || 0);
    unset.push("armor");
  }
  return { update, unset };
}

/**
 * Move one document's craft flags: write the system update, then unset each flag with
 * Document#unsetFlag (it uses the deletion syntax of the running Foundry version, v13 or v14).
 * @param {foundry.abstract.Document} doc
 * @param {{update: object, unset: string[]}} m
 * @returns {Promise<boolean>} true when something moved
 */
async function apply(doc, { update, unset }) {
  if (!unset.length) return false;
  if (Object.keys(update).length) await doc.update(update);
  for (const key of unset) await doc.unsetFlag("spacer", `craft.${key}`);
  return true;
}

/**
 * The migration of a ship weapon: `flags.spacer.craft.disabled` -> `system.disabled`.
 * @param {Item} item
 * @returns {{update: object, unset: string[]}}
 */
export function weaponMigration(item) {
  const f = item.flags?.spacer?.craft ?? {};
  if (item.type !== "shipWeapon" || !("disabled" in f)) return { update: {}, unset: [] };
  return { update: { "system.disabled": !!f.disabled }, unset: ["disabled"] };
}

/**
 * Run the craft migration once per world (ready hook, GM only). Moves the flags of every world
 * actor (ships and the ship weapons of ships and vehicles) and of world shipWeapon items, then
 * stores MIGRATION_VERSION in the "craftMigration" world setting. Called by register.mjs;
 * test/foundry/craft.js calls it with `force: true`.
 * @param {{force?: boolean}} [o]  run even when the setting says it already ran
 * @returns {Promise<{actors: number, items: number}|null>} null when it did not run
 */
export async function migrateCraft({ force = false } = {}) {
  if (!game.user.isGM || (!force && setting(MIGRATION_SETTING, 0) >= MIGRATION_VERSION)) return null;
  let actors = 0;
  let items = 0;
  for (const actor of game.actors) {
    if (!["ship", "vehicle"].includes(actor.type)) continue;
    if (actor.type === "ship" && await apply(actor, shipMigration(actor))) actors++;
    for (const item of actor.items) if (await apply(item, weaponMigration(item))) items++;
  }
  for (const item of game.items) if (await apply(item, weaponMigration(item))) items++;
  await game.settings.set("spacer", MIGRATION_SETTING, MIGRATION_VERSION);
  if (actors || items) console.log(`Spacer | craft migration ${MIGRATION_VERSION}: ${actors} ships, ${items} weapons moved from flags to fields`);
  return { actors, items };
}
