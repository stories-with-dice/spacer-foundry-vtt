/** Starship actor sheet (book p.68-87). */
import * as api from "../api.mjs";
import { CREW_POSITIONS, CREW_BY_KEY } from "../rules/operations.mjs";
import { SPACE_RANGES } from "../rules/space-combat.mjs";
import { INTERPLANETARY } from "../rules/travel.mjs";
import { DRIVE_LETTERS } from "../rules/drives.mjs";
import { skillRank } from "../../play/api.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = api.L;

const SYSTEMS = ["jDrive", "mDrive", "power"];

export class ShipSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["spacer", "craft", "ship-sheet"],
    position: { width: 760, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      hit: ShipSheet.#onHit,
      fire: ShipSheet.#onFire,
      stepDamage: ShipSheet.#onStepDamage,
      toggleDestroyed: ShipSheet.#onToggleDestroyed,
      repair: ShipSheet.#onRepair,
      editItem: ShipSheet.#onEditItem,
      deleteItem: ShipSheet.#onDeleteItem,
      toggleWeapon: ShipSheet.#onToggleWeapon,
      reloadWeapon: ShipSheet.#onReloadWeapon,
      addCrew: ShipSheet.#onAddCrew,
      removeCrew: ShipSheet.#onRemoveCrew,
      openCrew: ShipSheet.#onOpenCrew,
      payMonth: ShipSheet.#onPayMonth,
      calcFinances: ShipSheet.#onCalcFinances,
      toJumpPoint: ShipSheet.#onToJumpPoint,
      interplanetary: ShipSheet.#onInterplanetary,
      jump: ShipSheet.#onJump,
      refuel: ShipSheet.#onRefuel,
      procedure: ShipSheet.#onProcedure,
      encounter: ShipSheet.#onEncounter,
      construction: () => api.openConstruction(),
      combat: ShipSheet.#onCombat
    }
  };

  static PARTS = {
    header: { template: "systems/spacer/templates/craft/ship-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    ship: { template: "systems/spacer/templates/craft/ship-stats.hbs", scrollable: [""] },
    crew: { template: "systems/spacer/templates/craft/ship-crew.hbs", scrollable: [""] },
    finances: { template: "systems/spacer/templates/craft/ship-finances.hbs", scrollable: [""] },
    travel: { template: "systems/spacer/templates/craft/ship-travel.hbs", scrollable: [""] },
    notes: { template: "systems/spacer/templates/craft/ship-notes.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "ship" }, { id: "crew" }, { id: "finances" }, { id: "travel" }, { id: "notes" }],
      initial: "ship",
      labelPrefix: "SPACER.Craft.Tab"
    }
  };

  /** UI state kept between renders (not saved). */
  fireOptions = { range: "close", location: "", dm: 0 };
  travelOptions = { size: "8", parsecs: 1, destination: "", row: "station", refuelType: "refined", berthingDays: 0 };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;
    const eng = s.engineering;
    const systems = SYSTEMS.map(key => {
      const st = eng[key];
      return {
        key, label: L(`Loc.${key}`), built: s[key].rating, letter: st.letter ?? "-", effectiveLetter: st.effectiveLetter ?? "-",
        performance: st.effective, builtPerformance: st.builtPerformance, unit: L(`Unit.${key}`),
        damage: s[key].damage, critical: st.critical, destroyed: st.destroyed, limited: st.limited
      };
    });
    const weapons = actor.items.filter(i => i.type === "shipWeapon").map(i => ({
      id: i.id, name: i.name, img: i.img, damage: i.system.damage, mount: i.system.mount,
      ammo: i.system.ammo.max > 0 ? `${i.system.ammo.value}/${i.system.ammo.max}` : "",
      disabled: !!i.flags?.spacer?.craft?.disabled, destroyed: i.system.destroyed,
      gunner: fromUuidSync(i.system.gunner)?.name ?? ""
    }));
    const crew = s.crew.map((c, index) => {
      const a = c.actor ? fromUuidSync(c.actor) : null;
      const pos = CREW_BY_KEY[c.role];
      const rank = a && pos ? skillRank(a, pos.skill) : null;
      return { index, role: c.role, uuid: c.actor, name: a?.name ?? L("Crew.missing"), img: a?.img ?? "icons/svg/mystery-man.svg", rank, ok: rank !== null && rank >= (pos?.rank ?? 0), skill: pos?.skill ?? "" };
    });
    const filledRoles = new Set(s.crew.map(c => c.role));
    const book = api.bookFinances(actor);
    const f = s.finances;
    const monthTotal = f.mortgage + f.crewSalaries + f.lifeSupport + f.fuelCost;
    const hullPips = Array.from({ length: s.hull.max }, (_, i) => ({ filled: i >= s.hull.value }));
    const internalPips = Array.from({ length: s.internal.max }, (_, i) => ({ filled: i < s.internalHits }));
    const fuelPips = Array.from({ length: s.fuelState.hitsMax }, (_, i) => ({ filled: i < s.fuelState.hits }));
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const enriched = {
      description: await TextEditor.enrichHTML(s.description, { relativeTo: actor }),
      notes: await TextEditor.enrichHTML(s.notes, { relativeTo: actor })
    };
    return Object.assign(context, {
      actor, system: s, source: s._source, editable: this.isEditable, enriched,
      letters: Object.fromEntries(DRIVE_LETTERS.map(l => [l, l])),
      systems, weapons, crew, hullPips, internalPips, fuelPips,
      roleOptions: CREW_POSITIONS.map(p => ({ key: p.key, label: L(`Crew.${p.key}`), salary: api.credits(p.salary), skill: p.skill, rank: p.rank, filled: filledRoles.has(p.key) })),
      rangeOptions: SPACE_RANGES.map(r => ({ key: r.key, label: `${L(`Range.${r.key}`)} (${r.dm >= 0 ? "+" : ""}${r.dm})` })),
      locationOptions: (s.smallCraft ? ["cockpit", "weapon", "drive", "hull"] : ["hull", "mDrive", "jDrive", "power", "fuel", "weapon", "internal"]).map(k => ({ key: k, label: L(`Loc.${k}`) })),
      rowOptions: INTERPLANETARY.map(r => ({ key: r.key, label: `${L(`Travel.row.${r.key}`)} (${r.km.toLocaleString("en-US")} km)` })),
      sizeOptions: [...Array.from({ length: 11 }, (_, i) => ({ key: String(i), label: `${L("Travel.size")} ${i < 10 ? i : "A"}` })), { key: "gasGiant", label: L("Travel.row.gasGiant") }],
      fire: this.fireOptions, travel: this.travelOptions,
      book: Object.fromEntries(Object.entries(book).map(([k, v]) => [k, api.credits(v)])),
      fmt: { cost: api.credits(s.cost), bank: api.credits(f.bank), monthTotal: api.credits(monthTotal), maintenance: api.credits(f.maintenance), mortgagePaid: actor.flags?.spacer?.craft?.mortgagePaid ?? 0 },
      status: s.isDestroyed ? "destroyed" : s.critical ? "critical" : "ok"
    });
  }

  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Remember fire and travel options typed on the sheet (they are not document fields).
    for (const el of this.element.querySelectorAll("[data-opt]")) {
      el.addEventListener("change", ev => {
        const [group, key] = ev.currentTarget.dataset.opt.split(".");
        const val = ev.currentTarget.type === "number" ? Number(ev.currentTarget.value) : ev.currentTarget.value;
        this[`${group}Options`][key] = val;
        ev.stopPropagation();
      });
    }
    this._attachCrewListeners();
  }

  /** Role selects in the crew list update the crew array directly. */
  _attachCrewListeners() {
    for (const sel of this.element.querySelectorAll("select.crew-role")) {
      sel.addEventListener("change", async ev => {
        ev.stopPropagation();
        const crew = foundry.utils.deepClone(this.actor.system._source.crew);
        crew[Number(sel.dataset.index)].role = sel.value;
        await this.actor.update({ "system.crew": crew });
      });
    }
  }

  /** Drop an actor on the crew list: add it with the role of the drop zone (or the first unfilled mandatory role). */
  async _onDropActor(event, actor) {
    if (!this.isEditable || !["character", "npc"].includes(actor.type)) return null;
    const zone = event.target.closest("[data-role]");
    const crew = [...this.actor.system._source.crew];
    let role = zone?.dataset.role ?? "";
    if (!role) {
      const filled = new Set(crew.map(c => c.role));
      role = CREW_POSITIONS.find(p => p.mandatory && !filled.has(p.key))?.key ?? "gunner";
    }
    const existing = crew.findIndex(c => c.role === role && !c.actor);
    if (existing >= 0) crew[existing] = { role, actor: actor.uuid };
    else crew.push({ role, actor: actor.uuid });
    await this.actor.update({ "system.crew": crew });
    return actor;
  }

  /* Actions ------------------------------------------------------------ */

  static async #onHit(event, target) {
    const loc = this.element.querySelector("[data-field='hitLocation']")?.value ?? "";
    const amount = Number(this.element.querySelector("[data-field='hitAmount']")?.value) || 1;
    await api.damageShip(this.actor, amount, { location: loc });
  }

  static async #onFire(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    const tgt = [...game.user.targets].map(t => t.actor).find(a => ["ship", "vehicle"].includes(a?.type));
    await api.fireWeapon(this.actor, id, { range: this.fireOptions.range, location: this.fireOptions.location, dm: this.fireOptions.dm, target: tgt });
  }

  static async #onStepDamage(event, target) {
    const key = target.dataset.system;
    const delta = Number(target.dataset.delta);
    const s = this.actor.system;
    if (key === "hull") return this.actor.update({ "system.hull.value": Math.clamp(s.hull.value - delta, 0, s.hull.max) });
    if (key === "internal") return this.actor.update({ "system.internalHits": Math.clamp(s.internalHits + delta, 0, s.internal.max) });
    if (key === "fuel") return this.actor.setFlag("spacer", "craft.fuelHits", Math.clamp(s.fuelState.hits + delta, 0, s.fuelState.hitsMax));
    if (key === "cockpit") return this.actor.update({ "system.cockpitHits": Math.clamp(s.cockpitHits + delta, 0, 2) });
    const dmg = Math.max(0, s[key].damage + delta);
    const update = { [`system.${key}.damage`]: dmg };
    if (delta < 0) update[`system.${key}.destroyed`] = false;
    return this.actor.update(update);
  }

  static async #onToggleDestroyed(event, target) {
    const key = target.dataset.system;
    const path = key === "ship" ? "system.destroyed" : `system.${key}.destroyed`;
    return this.actor.update({ [path]: !foundry.utils.getProperty(this.actor, path) });
  }

  static async #onRepair(event, target) {
    await api.repairShip(this.actor, target.dataset.system);
  }

  static #onEditItem(event, target) {
    this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    await this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.delete();
  }

  static async #onToggleWeapon(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const disabled = !!item.flags?.spacer?.craft?.disabled;
    if (item.system.destroyed) return item.update({ "system.destroyed": false, "flags.spacer.craft.disabled": false });
    return item.update({ "flags.spacer.craft.disabled": !disabled });
  }

  static async #onReloadWeapon(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) await item.update({ "system.ammo.value": item.system.ammo.max });
  }

  static async #onAddCrew(event, target) {
    const role = this.element.querySelector("[data-field='newRole']")?.value || "pilot";
    await this.actor.update({ "system.crew": [...this.actor.system._source.crew, { role, actor: "" }] });
  }

  static async #onRemoveCrew(event, target) {
    const i = Number(target.closest("[data-index]").dataset.index);
    const crew = [...this.actor.system._source.crew];
    crew.splice(i, 1);
    await this.actor.update({ "system.crew": crew });
  }

  static async #onOpenCrew(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (uuid) (await fromUuid(uuid))?.sheet.render(true);
  }

  static async #onPayMonth() {
    const days = Number(this.element.querySelector("[data-field='berthingDays']")?.value) || 0;
    await api.payMonth(this.actor, { berthingDays: days });
  }

  static async #onCalcFinances() {
    await api.calculateFinances(this.actor);
  }

  static async #onToJumpPoint() {
    await api.travelToJumpPoint(this.actor, { size: this.travelOptions.size });
  }

  static async #onInterplanetary() {
    await api.travelInterplanetary(this.actor, { row: this.travelOptions.row });
  }

  static async #onJump() {
    await api.jump(this.actor, { parsecs: this.travelOptions.parsecs, destination: this.travelOptions.destination });
  }

  static async #onRefuel() {
    await api.refuel(this.actor, { type: this.travelOptions.refuelType });
  }

  static async #onProcedure(event, target) {
    await api.procedure(this.actor, target.dataset.step);
  }

  static async #onEncounter() {
    await api.encounterCheck(this.actor, { days: 1 });
  }

  static #onCombat() {
    api.openSpaceCombat({ ships: [this.actor] });
  }
}
