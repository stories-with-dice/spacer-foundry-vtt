/**
 * Space combat helper (book p.84-87): ships, initiative, range bands between each pair,
 * movement with thrust, dogfighting, and crew action buttons per position.
 * State is kept in the world setting "spacer.craftCombat" (GM writes it).
 */
import * as api from "../api.mjs";
import * as SC from "../rules/space-combat.mjs";
import { skillRank } from "../../play/api.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = api.L;
export const COMBAT_SETTING = "craftCombat";

const pairKey = (a, b) => [a, b].sort().join("|");
const emptyState = () => ({ round: 1, ships: [], ranges: {} });

export class SpaceCombatApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  constructor(options = {}) {
    super(options);
    SpaceCombatApp.instance = this;
    let saved = null;
    try { saved = game.settings.get("spacer", COMBAT_SETTING); } catch { saved = null; }
    this.combat = foundry.utils.mergeObject(emptyState(), saved ?? {}, { inplace: false });
  }

  static DEFAULT_OPTIONS = {
    id: "spacer-craft-space-combat",
    classes: ["spacer", "craft", "space-combat"],
    window: { title: "SPACER.Craft.Combat.title", resizable: true, icon: "fa-solid fa-crosshairs" },
    position: { width: 860, height: 720 },
    actions: {
      addTargets: SpaceCombatApp.#onAddTargets,
      addSelected: SpaceCombatApp.#onAddSelected,
      removeShip: SpaceCombatApp.#onRemoveShip,
      initiative: SpaceCombatApp.#onInitiative,
      move: SpaceCombatApp.#onMove,
      setRange: SpaceCombatApp.#onSetRange,
      crewAction: SpaceCombatApp.#onCrewAction,
      nextRound: SpaceCombatApp.#onNextRound,
      reset: SpaceCombatApp.#onReset,
      openShip: SpaceCombatApp.#onOpenShip,
      fire: SpaceCombatApp.#onFire
    }
  };

  static PARTS = { main: { template: "systems/spacer/templates/craft/space-combat.hbs", scrollable: [".scroll"] } };

  async _onClose(options) {
    await super._onClose(options);
    if (SpaceCombatApp.instance === this) SpaceCombatApp.instance = null;
  }

  async save() {
    if (game.user.isGM) await game.settings.set("spacer", COMBAT_SETTING, this.combat);
  }

  shipEntry(uuid) {
    return this.combat.ships.find(s => s.uuid === uuid);
  }

  /** Add a ship actor (or its uuid). New pairs start at Close range. */
  async addShip(ref) {
    const actor = typeof ref === "string" ? fromUuidSync(ref) : ref;
    if (actor?.type !== "ship" || this.shipEntry(actor.uuid)) return false;
    for (const other of this.combat.ships) this.combat.ranges[pairKey(actor.uuid, other.uuid)] ??= 1;
    this.combat.ships.push({ uuid: actor.uuid, initiative: null, thrustUsed: 0 });
    await this.save();
    return true;
  }

  /** Range band index between two ships. */
  range(a, b) {
    return this.combat.ranges[pairKey(a, b)] ?? 1;
  }

  /**
   * Move `mover` one band toward (-1) or away (+1) from `other` (book p.84): uses 1 thrust this round.
   * Returns false when the ship has no thrust left.
   */
  async move(moverUuid, otherUuid, delta) {
    const entry = this.shipEntry(moverUuid);
    const actor = fromUuidSync(moverUuid);
    if (!entry || !actor) return false;
    const thrust = actor.system.effective.thrust;
    if (entry.thrustUsed + 1 > thrust) {
      ui.notifications.warn(L("Combat.noThrust", { name: actor.name }));
      return false;
    }
    entry.thrustUsed += 1;
    const res = SC.shiftRange(this.range(moverUuid, otherUuid), delta);
    this.combat.ranges[pairKey(moverUuid, otherUuid)] = res.index;
    await this.save();
    if (res.dogfight) await ChatMessage.create({ content: `<div class="spacer craft-card"><p>${L("Combat.dogfightStart", { a: actor.name, b: fromUuidSync(otherUuid)?.name ?? "?" })}</p></div>` });
    this.render();
    return true;
  }

  /** Roll initiative for every ship: 1D + thrust + pilot's Pilot rank (book p.84). */
  async rollInitiative() {
    for (const entry of this.combat.ships) {
      const ship = fromUuidSync(entry.uuid);
      if (!ship) continue;
      const pilot = api.crewFor(ship, "pilot");
      const rank = pilot ? skillRank(pilot, "Pilot", "Starship") : -3;
      const d6 = (await new Roll("1d6").evaluate()).total;
      entry.initiative = SC.initiative(d6, ship.system.effective.thrust, rank);
    }
    this.combat.ships.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
    await this.save();
    const lines = this.combat.ships.map(e => `<li>${foundry.utils.escapeHTML(fromUuidSync(e.uuid)?.name ?? "?")}: ${e.initiative}</li>`).join("");
    await ChatMessage.create({ content: `<div class="spacer craft-card"><h3>${L("Combat.initiative")}</h3><ul>${lines}</ul></div>` });
    this.render();
  }

  /** End the round: dogfights drift to Close (book p.84), thrust resets, round +1. */
  async nextRound() {
    const ended = [];
    for (const [k, v] of Object.entries(this.combat.ranges)) if (v === 0) { this.combat.ranges[k] = 1; ended.push(k); }
    for (const e of this.combat.ships) e.thrustUsed = 0;
    this.combat.round += 1;
    await this.save();
    if (ended.length) await ChatMessage.create({ content: `<div class="spacer craft-card"><p>${L("Combat.dogfightEnd")}</p></div>` });
    this.render();
  }

  async _prepareContext() {
    const ships = this.combat.ships.map(e => {
      const a = fromUuidSync(e.uuid);
      if (!a) return null;
      const s = a.system;
      const crew = Object.keys(SC.CREW_ACTIONS).filter(p => p !== "any").map(pos => {
        const who = api.crewFor(a, pos);
        return {
          pos, label: L(`Crew.${pos}`), who: who?.name ?? "—",
          actions: SC.CREW_ACTIONS[pos].map(act => ({ key: act.key, label: L(`Action.${act.key}`), hint: L(`ActionHint.${act.key}`), target: act.target }))
        };
      });
      const others = this.combat.ships.filter(o => o.uuid !== e.uuid).map(o => {
        const idx = this.range(e.uuid, o.uuid);
        const band = SC.SPACE_RANGES[idx];
        return { uuid: o.uuid, name: fromUuidSync(o.uuid)?.name ?? "?", index: idx, label: L(`Range.${band.key}`), dm: band.dm, dogfight: idx === 0 };
      });
      const weapons = a.items.filter(i => i.type === "shipWeapon").map(i => ({ id: i.id, name: i.name, out: i.system.destroyed || !!i.flags?.spacer?.craft?.disabled }));
      return {
        uuid: e.uuid, name: a.name, img: a.img, initiative: e.initiative ?? "-",
        thrust: s.effective.thrust, thrustLeft: Math.max(0, s.effective.thrust - e.thrustUsed),
        hull: `${s.hull.value}/${s.hull.max}`, destroyed: s.isDestroyed, critical: s.critical,
        morale: SC.needsMorale(s.hull), crew, others, weapons
      };
    }).filter(Boolean);
    const available = game.actors.filter(a => a.type === "ship" && !this.shipEntry(a.uuid)).map(a => ({ uuid: a.uuid, name: a.name }));
    return {
      round: this.combat.round, ships, available,
      ranges: SC.SPACE_RANGES.map((r, i) => ({ index: i, label: `${L(`Range.${r.key}`)} (${r.distance}, ${r.dm >= 0 ? "+" : ""}${r.dm})` }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("select.add-ship")?.addEventListener("change", async ev => {
      if (ev.currentTarget.value) { await this.addShip(ev.currentTarget.value); this.render(); }
    });
  }

  static async #onAddTargets() {
    for (const t of game.user.targets) if (t.actor) await this.addShip(t.actor);
    this.render();
  }

  static async #onAddSelected() {
    for (const t of canvas?.tokens?.controlled ?? []) if (t.actor) await this.addShip(t.actor);
    this.render();
  }

  static async #onRemoveShip(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    this.combat.ships = this.combat.ships.filter(s => s.uuid !== uuid);
    for (const k of Object.keys(this.combat.ranges)) if (k.includes(uuid)) delete this.combat.ranges[k];
    await this.save();
    this.render();
  }

  static async #onInitiative() { await this.rollInitiative(); }

  static async #onMove(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    await this.move(uuid, target.dataset.other, Number(target.dataset.delta));
  }

  static async #onSetRange(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    const sel = target.parentElement.querySelector("select");
    this.combat.ranges[pairKey(uuid, target.dataset.other)] = Number(sel?.value ?? 1);
    await this.save();
    this.render();
  }

  static async #onCrewAction(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    const ship = fromUuidSync(uuid);
    const entry = this.shipEntry(uuid);
    const { pos, act } = target.dataset;
    let thrust = 0;
    if (act === "evade" && entry) {
      // Evade spends all remaining thrust as +DM (book p.85).
      thrust = Math.max(0, ship.system.effective.thrust - entry.thrustUsed);
      entry.thrustUsed += thrust;
      await this.save();
    }
    await api.crewAction(ship, pos, act, { thrust });
    this.render();
  }

  static async #onFire(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    const ship = fromUuidSync(uuid);
    const targetUuid = target.closest("[data-uuid]").querySelector("select.fire-target")?.value;
    const range = targetUuid ? SC.SPACE_RANGES[this.range(uuid, targetUuid)].key : "close";
    await api.fireWeapon(ship, target.dataset.item, { range, target: targetUuid || null });
  }

  static async #onNextRound() { await this.nextRound(); }

  static async #onReset() {
    this.combat = emptyState();
    await this.save();
    this.render();
  }

  static #onOpenShip(event, target) {
    fromUuidSync(target.closest("[data-uuid]").dataset.uuid)?.sheet.render(true);
  }
}
