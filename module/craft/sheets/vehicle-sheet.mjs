/** Vehicle actor sheet (book p.46-49). */
import * as api from "../api.mjs";
import { SPEED_BAND_KMH, cargoForOccupants } from "../rules/vehicles.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = api.L;
const LOCATIONS = ["interior", "drive", "handling", "hull", "weapon"];

export class VehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["spacer", "craft", "vehicle-sheet"],
    position: { width: 700, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      hit: VehicleSheet.#onHit,
      stepLocation: VehicleSheet.#onStepLocation,
      fire: VehicleSheet.#onFire,
      editItem: VehicleSheet.#onEditItem,
      deleteItem: VehicleSheet.#onDeleteItem,
      toggleWeapon: VehicleSheet.#onToggleWeapon,
      removeOccupant: VehicleSheet.#onRemoveOccupant,
      openOccupant: VehicleSheet.#onOpenOccupant,
      driveCheck: VehicleSheet.#onDriveCheck,
      ram: VehicleSheet.#onRam,
      hitAndRun: VehicleSheet.#onHitAndRun,
      offensiveDriving: VehicleSheet.#onOffensiveDriving,
      repairAll: VehicleSheet.#onRepairAll
    }
  };

  static PARTS = {
    main: { template: "systems/spacer/templates/craft/vehicle-sheet.hbs", scrollable: [".scroll"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const v = actor.system;
    const op = api.operatorRank(actor);
    const locations = LOCATIONS.map(key => {
      const l = v.locations[key];
      return {
        key, label: L(`Loc.${key}`), value: l.value, max: l.max, armored: l.armored,
        pips: Array.from({ length: l.max }, (_, i) => ({ filled: i >= l.value })), out: l.max > 0 && l.value <= 0
      };
    });
    const weapons = actor.items.filter(i => i.type === "shipWeapon").map(i => ({
      id: i.id, name: i.name, img: i.img, damage: i.system.damage, destroyed: i.system.destroyed, disabled: !!i.flags?.spacer?.craft?.disabled
    }));
    const occupants = v.crew.map((uuid, index) => {
      const a = fromUuidSync(uuid);
      return { index, uuid, name: a?.name ?? L("Crew.missing"), img: a?.img ?? "icons/svg/mystery-man.svg", operator: index === 0 };
    });
    const targets = [...game.user.targets].map(t => t.actor).filter(Boolean);
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    return Object.assign(context, {
      actor, system: v, source: v._source, editable: this.isEditable,
      enriched: { description: await TextEditor.enrichHTML(v.description, { relativeTo: actor }) },
      locations, weapons, occupants,
      operator: { name: op.actor?.name ?? L("Vehicle.noOperator"), skill: op.skill, rank: op.rank },
      speedDM: api.vehicleSpeedDM(actor),
      speedOptions: Object.fromEntries(SPEED_BAND_KMH.map((k, i) => [i, `${i} (${k} km/h)`]).filter(([i]) => i <= v.speedBand)),
      categories: Object.fromEntries(CONFIG.SPACER.vehicleCategories.map(c => [c, L(`Vehicle.category.${c}`)])),
      traitsText: v.traits.join(", "),
      militaryLabel: L(v.isMilitary ? "Vehicle.military" : "Vehicle.civilian"),
      cargoAsOccupants: cargoForOccupants(v.occupants),
      targetNames: targets.map(t => t.name).join(", ") || L("Vehicle.noTarget"),
      hitLocations: Object.fromEntries(LOCATIONS.map(k => [k, L(`Loc.${k}`)])),
      sources: { vehicle: L("Source.vehicle"), personal: L("Source.personal"), starship: L("Source.starship") }
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const traits = this.element.querySelector("[data-field='traits']");
    traits?.addEventListener("change", async ev => {
      ev.stopPropagation();
      const list = ev.currentTarget.value.split(",").map(t => t.trim()).filter(Boolean);
      await this.actor.update({ "system.traits": list });
    });
  }

  /** Drop a person on the sheet: add them as an occupant (the first is the operator). */
  async _onDropActor(event, actor) {
    if (!this.isEditable || !["character", "npc"].includes(actor.type)) return null;
    const crew = [...this.actor.system._source.crew];
    if (crew.includes(actor.uuid)) return null;
    crew.push(actor.uuid);
    await this.actor.update({ "system.crew": crew });
    return actor;
  }

  #target(types = ["vehicle", "ship"]) {
    return [...game.user.targets].map(t => t.actor).find(a => types.includes(a?.type)) ?? null;
  }

  static async #onHit() {
    const amount = Number(this.element.querySelector("[data-field='hitAmount']")?.value) || 1;
    const location = this.element.querySelector("[data-field='hitLocation']")?.value ?? "";
    const source = this.element.querySelector("[data-field='hitSource']")?.value ?? "vehicle";
    await api.damageVehicle(this.actor, amount, { location, source });
  }

  static async #onStepLocation(event, target) {
    const key = target.dataset.location;
    const l = this.actor.system.locations[key];
    const value = Math.clamp(l.value - Number(target.dataset.delta), 0, l.max);
    await this.actor.update({ [`system.locations.${key}.value`]: value });
  }

  static async #onFire(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    await api.fireWeapon(this.actor, id, { target: this.#target() });
  }

  static #onEditItem(event, target) {
    this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    await this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.delete();
  }

  static async #onToggleWeapon(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) await item.update({ "system.destroyed": !item.system.destroyed });
  }

  static async #onRemoveOccupant(event, target) {
    const i = Number(target.closest("[data-index]").dataset.index);
    const crew = [...this.actor.system._source.crew];
    crew.splice(i, 1);
    await this.actor.update({ "system.crew": crew });
  }

  static async #onOpenOccupant(event, target) {
    (await fromUuid(target.closest("[data-uuid]").dataset.uuid))?.sheet.render(true);
  }

  static async #onDriveCheck() {
    await api.driveCheck(this.actor);
  }

  static async #onRam() {
    const t = this.#target(["vehicle"]);
    if (!t) return ui.notifications.warn(L("Warn.noTarget"));
    await api.ram(this.actor, t);
  }

  static async #onHitAndRun() {
    const t = this.#target(["character", "npc", "creature"]);
    if (!t) return ui.notifications.warn(L("Warn.noTarget"));
    await api.hitAndRun(this.actor, t);
  }

  static async #onOffensiveDriving() {
    const t = this.#target(["vehicle"]);
    if (!t) return ui.notifications.warn(L("Warn.noTarget"));
    await api.offensiveDriving(this.actor, t);
  }

  static async #onRepairAll() {
    const update = { "system.destroyed": false };
    for (const k of LOCATIONS) update[`system.locations.${k}.value`] = this.actor.system.locations[k].max;
    await this.actor.update(update);
  }
}
