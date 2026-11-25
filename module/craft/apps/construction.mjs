/** Starship construction wizard (book p.74-78): steps 1-9, live summary, builds a ship actor. */
import { L, credits } from "../api.mjs";
import * as C from "../rules/construction.mjs";
import { annualMaintenance, lifeSupportCost, mandatoryPositions, crewSalaries } from "../rules/operations.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const WEAPON_NAMES = {
  turret: "Turret", doubleTurret: "Double Turret", tripleTurret: "Triple Turret", pulse: "Pulse Laser",
  beam: "Beam Laser", missileRack: "Missile Rack", sandcaster: "Sandcaster"
};

export class ConstructionWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.design = { ...C.defaultDesign(), name: "", weaponCounts: {}, secondaryCounts: {}, ...(options.design ?? {}) };
  }

  static DEFAULT_OPTIONS = {
    id: "spacer-craft-construction",
    tag: "form",
    classes: ["spacer", "craft", "construction"],
    window: { title: "SPACER.Craft.Build.title", resizable: true, icon: "fa-solid fa-screwdriver-wrench" },
    position: { width: 820, height: 760 },
    form: { handler: ConstructionWizard.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
    actions: { build: ConstructionWizard.#onBuild, reset: ConstructionWizard.#onReset }
  };

  static PARTS = {
    form: { template: "systems/spacer/templates/craft/construction.hbs", scrollable: [".steps"] }
  };

  /** Design with weapons and secondary craft expanded from the count inputs. */
  get fullDesign() {
    const d = this.design;
    const weapons = Object.entries(d.weaponCounts ?? {}).flatMap(([k, n]) => Array(Math.max(0, Number(n) || 0)).fill(k));
    const secondary = Object.entries(d.secondaryCounts ?? {}).flatMap(([k, n]) => Array(Math.max(0, Number(n) || 0)).fill(k));
    return { ...d, weapons, secondary };
  }

  async _prepareContext(options) {
    const d = this.design;
    const r = C.computeDesign(this.fullDesign);
    const letters = C.letterOptions(d.tons, r.armorLayers);
    const letterChoices = Object.fromEntries(letters.map(o => [o.letter, `${o.letter} (${o.performance})`]));
    const eng = ["jDrive", "mDrive", "power"].map(k => ({
      key: k, label: L(`Loc.${k}`), letter: d[k], performance: r.engineering[k].performance, unit: L(`Unit.${k}`),
      mass: r.engineering[k].mass, cost: credits(r.engineering[k].cost), invalid: !letterChoices[d[k]]
    }));
    return {
      d, r, eng, letterChoices,
      hulls: Object.fromEntries(C.HULLS.map(h => [h.tons, `${h.tons}T — ${credits(h.cost)}, ${h.months} ${L("Unit.months")}`])),
      cpus: Object.fromEntries(Object.entries(C.CPU_MODELS).map(([k, v]) => [k, `Model/${k} — ${credits(v.cost)}, ${v.mass}T, ${v.slots} ${L("Build.slots")}, ${v.bandwidth} ${L("Build.bandwidth")}`])),
      weapons: Object.entries(C.SHIP_WEAPONS).map(([k, v]) => ({ key: k, label: L(`Weapon.${k}`), cost: credits(v.cost), damage: v.damage, count: d.weaponCounts?.[k] ?? 0 })),
      secondary: Object.entries(C.SECONDARY_CRAFT).map(([k, v]) => ({ key: k, label: L(`Secondary.${k}`), tons: v.tons, cost: credits(v.cost), count: d.secondaryCounts?.[k] ?? 0 })),
      armor: C.ARMOR_LOCATIONS.map(k => ({ key: k, label: L(`Loc.${k}`), value: d.armor?.[k] ?? 0 })),
      parts: Object.entries(r.parts).filter(([, v]) => v).map(([k, v]) => ({ label: L(`Build.part.${k}`), value: credits(v) })),
      warnings: r.warnings.map(w => L(`Build.warn.${w.key}`, { system: w.system ? L(`Loc.${w.system}`) : "", letter: w.letter ?? "", need: w.need ?? "", have: w.have ?? "", over: w.over ?? "" })),
      fmt: {
        total: credits(r.total), down: credits(r.downPayment), mortgage: credits(r.mortgage), maintenance: credits(r.maintenance),
        stock: credits(r.stockDiscount), architect: credits(r.architectFee), subtotal: credits(r.subtotal)
      },
      maxHardpoints: Math.floor(d.tons / 100)
    };
  }

  static async #onChangeForm(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const num = (v, def = 0) => (v === undefined || v === "" || v === null ? def : Number(v));
    const d = this.design;
    d.name = data.name ?? d.name;
    d.tons = Math.max(10, num(data.tons, d.tons));
    for (const k of ["jDrive", "mDrive", "power"]) d[k] = data[k] ?? d[k];
    d.cpu = data.cpu ?? d.cpu;
    d.staterooms = num(data.staterooms, d.staterooms);
    d.lowBerths = num(data.lowBerths, d.lowBerths);
    d.fuel = num(data.fuel, 0);
    d.streamlined = !!data.streamlined;
    d.fuelScoops = !!data.fuelScoops;
    d.refineries = num(data.refineries, 0);
    d.extraHardpoints = num(data.extraHardpoints, 0);
    d.vehicleTons = num(data.vehicleTons, 0);
    d.repairParts = num(data.repairParts, 0);
    d.stock = !!data.stock;
    d.architect = !!data.architect;
    d.weaponCounts = Object.fromEntries(Object.entries(data.weapon ?? {}).map(([k, v]) => [k, num(v)]));
    d.secondaryCounts = Object.fromEntries(Object.entries(data.secondary ?? {}).map(([k, v]) => [k, num(v)]));
    d.armor = Object.fromEntries(Object.entries(data.armor ?? {}).map(([k, v]) => [k, num(v)]));
    // Keep drive letters valid when the hull changes.
    const valid = C.letterOptions(d.tons).map(o => o.letter);
    for (const k of ["jDrive", "mDrive", "power"]) if (!valid.includes(d[k])) d[k] = valid[0] ?? "A";
    this.render();
  }

  static #onReset() {
    this.design = { ...C.defaultDesign(), name: "", weaponCounts: {}, secondaryCounts: {} };
    this.render();
  }

  static async #onBuild() {
    const actor = await ConstructionWizard.build(this.fullDesign);
    if (actor) { actor.sheet.render(true); this.close(); }
  }

  /**
   * Create a ship actor from a design. Usable without the UI: game.spacer.craft.buildShip(design).
   * @returns {Promise<Actor|null>}
   */
  static async build(design, { folder = null } = {}) {
    const r = C.computeDesign(design);
    if (!r.valid) {
      ui.notifications.warn(L("Build.invalid"));
      return null;
    }
    const d = r.design;
    const name = d.name || `${d.tons}T ${L("Build.newShip")}`;
    const roles = mandatoryPositions(d.tons);
    const misc = [...r.secondary.map(k => L(`Secondary.${k}`)), d.fuelScoops ? L("Build.fuelScoops") : "", r.refineries ? `${r.refineries}x ${L("Build.refinery")}` : ""].filter(Boolean).join(", ");
    const items = r.weapons.map(k => {
      const w = C.SHIP_WEAPONS[k];
      return {
        name: WEAPON_NAMES[k], type: "shipWeapon",
        system: { mount: w.mount, damage: w.damage, range: "long", cost: w.cost, hardpoints: 1, tonnage: w.mass, ammo: { value: w.ammo ?? 0, max: w.ammo ?? 0 }, traits: w.energy ? ["Energy"] : [], source: "p.76" }
      };
    });
    const data = {
      name, type: "ship", folder,
      system: {
        shipClass: `${d.tons}T ${d.name || L("Build.custom")}`, tonnage: d.tons, streamlined: d.streamlined,
        hull: { value: r.hullPoints, max: r.hullPoints },
        jDrive: { rating: d.jDrive, value: r.engineering.jDrive.performance, damage: 0, destroyed: false },
        mDrive: { rating: d.mDrive, value: r.engineering.mDrive.performance, damage: 0, destroyed: false },
        power: { rating: d.power, value: r.engineering.power.performance, damage: 0, destroyed: false },
        cpu: `Model/${r.cpu.key}`,
        fuel: { value: r.fuel, max: r.fuel },
        cargo: { value: 0, max: Math.max(0, r.cargo) },
        staterooms: r.staterooms, lowBerths: r.lowBerths, hardpoints: r.hardpoints,
        crewRequired: roles.length, crewRoles: roles.map(k => L(`Crew.${k}`)).join(", "),
        misc, cost: r.total,
        finances: {
          mortgage: r.mortgage, maintenance: annualMaintenance(r.total), crewSalaries: crewSalaries(roles),
          lifeSupport: lifeSupportCost(r.staterooms), fuelCost: 0, bank: 0
        },
        crew: roles.map(role => ({ role, actor: "" })),
        description: `<p>${L("Build.summary", { cost: credits(r.total), months: r.months, down: credits(r.downPayment) })}</p>`
      },
      flags: { spacer: { craft: { armor: d.armor, design: d } } },
      items
    };
    return Actor.create(data);
  }
}
