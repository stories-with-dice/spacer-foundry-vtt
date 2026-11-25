/** One item sheet for all seven item types; the body template shows the fields of each type. */
import { RANGE_BANDS } from "../rules/combat.mjs";
import { localizer, templatePath } from "../../shared/foundry.mjs";

const L = localizer("SPACER");

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** The item sheet of every play item type (skill, weapon, armor, gear, psionic, drug, shipWeapon). Registered by registerPlay. */
export class SpacerItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["spacer", "spacer-sheet", "item"],
    position: { width: 520, height: 560 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      use: SpacerItemSheet.#onUse
    }
  };

  static PARTS = {
    header: { template: templatePath("play", "item/header") },
    body: { template: templatePath("play", "item/body"), scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const item = this.item;
    const s = item.system;
    const opt = (keys, prefix, sel) => keys.map(k => ({ value: k, label: k ? L(`${prefix}.${k}`) : "—", selected: k === sel }));
    Object.assign(ctx, {
      item, system: s, type: item.type,
      typeLabel: game.i18n.localize(CONFIG.Item.typeLabels?.[item.type] ?? item.type),
      [`is_${item.type}`]: true,
      physical: "weight" in s,
      traitsText: Array.isArray(s.traits) ? s.traits.join(", ") : "",
      specialtiesText: Array.isArray(s.specialties) ? s.specialties.join(", ") : "",
      ranges: opt(RANGE_BANDS, "Range", s.range),
      weaponCategories: opt(["melee", "short", "stock", "energy", "archaic", "heavy", "thrown"], "Weapon.Category", s.category),
      gearCategories: opt(["general", "survival", "device", "tool", "comms", "shelter", "weaponMod", "cargo"], "Gear.Category", s.category),
      disciplines: opt(["telepathy", "clairvoyance", "telekinesis", "awareness", "teleportation", "special"], "Psi.Discipline", s.discipline),
      characteristics: opt(["", "str", "dex", "end", "int", "edu", "soc", "psi"], "Char", s.characteristic),
      usable: !!item.actor && ["weapon", "psionic", "drug", "skill"].includes(item.type),
      description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description ?? "", { secrets: item.isOwner, relativeTo: item })
    });
    return ctx;
  }

  /** @override Lists typed as comma-separated text. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    for (const key of ["traits", "specialties"]) {
      const v = data.system?.[key];
      if (typeof v === "string") data.system[key] = v.split(",").map(t => t.trim()).filter(Boolean);
    }
    return data;
  }

  static #onUse() {
    return this.item.use?.();
  }
}
