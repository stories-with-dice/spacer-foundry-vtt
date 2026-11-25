/**
 * Starship construction (book p.74-78). Pure functions, no Foundry globals.
 * All costs are in credits, masses in displacement tonnes.
 */
import { DRIVE_LETTERS, letterIndex, drivePerformance, hullPoints, baseHardpoints, minimumFuel, recommendedFuel } from "./drives.mjs";

const MCR = 1_000_000;
const KCR = 1_000;

/** Standard hulls (book p.74). */
export const HULLS = [
  { tons: 100, main: 85, engines: 15, cost: 2 * MCR, months: 10 },
  { tons: 200, main: 185, engines: 15, cost: 8 * MCR, months: 12 },
  { tons: 400, main: 350, engines: 50, cost: 16 * MCR, months: 16 },
  { tons: 600, main: 520, engines: 80, cost: 48 * MCR, months: 24 },
  { tons: 800, main: 635, engines: 165, cost: 80 * MCR, months: 28 },
  { tons: 1000, main: 835, engines: 165, cost: 100 * MCR, months: 30 }
];

/**
 * Hull for a tonnage. Off-list sizes are "custom": the next standard hull below (or 100T) plus
 * 100Kcr per extra tonne, extra tonnes go to main space, and construction takes 36 months.
 */
export function hullFor(tons) {
  const t = Math.max(1, Math.floor(Number(tons) || 0));
  const std = HULLS.find(h => h.tons === t);
  if (std) return { ...std, custom: false };
  const base = [...HULLS].reverse().find(h => h.tons <= t) ?? HULLS[0];
  const extra = t - base.tons;
  const ratio = t / base.tons;
  return {
    tons: t,
    main: extra >= 0 ? base.main + extra : Math.floor(base.main * ratio),
    engines: extra >= 0 ? base.engines : Math.ceil(base.engines * ratio),
    cost: base.cost + Math.max(0, extra) * 100 * KCR,
    months: 36,
    custom: true
  };
}

/**
 * Engineering mass (T) and cost (credits) by letter (book p.74). The printed table has two
 * typos (power plant Y "154", M-Drive R "67"); the regular series is used instead.
 */
export function engineeringSpec(kind, letter) {
  const i = letterIndex(letter);
  if (i < 0) return { mass: 0, cost: 0 };
  switch (kind) {
    case "power": return { mass: 4 + 3 * i, cost: 8 * (i + 1) * MCR };
    case "mDrive": return { mass: 1 + 2 * i, cost: 4 * (i + 1) * MCR };
    case "jDrive": return { mass: 10 + 5 * i, cost: 10 * (i + 1) * MCR };
    default: return { mass: 0, cost: 0 };
  }
}

/** Bridge: 20T, 500Kcr per 100T of hull (book p.75). */
export function bridgeSpec(tons) {
  return { mass: 20, cost: Math.max(1, Math.ceil((Number(tons) || 0) / 100)) * 500 * KCR };
}

/** CPU models (book p.75). */
export const CPU_MODELS = {
  "1": { cost: 2 * MCR, mass: 1, slots: 2, bandwidth: 4 },
  "1bis": { cost: 5 * MCR, mass: 1, slots: 4, bandwidth: 4 },
  "2": { cost: 9 * MCR, mass: 2, slots: 3, bandwidth: 6 },
  "2bis": { cost: 12 * MCR, mass: 2, slots: 6, bandwidth: 6 },
  "3": { cost: 18 * MCR, mass: 3, slots: 5, bandwidth: 9 },
  "4": { cost: 30 * MCR, mass: 4, slots: 8, bandwidth: 15 },
  "5": { cost: 45 * MCR, mass: 5, slots: 12, bandwidth: 25 },
  "6": { cost: 55 * MCR, mass: 5, slots: 15, bandwidth: 35 },
  "7": { cost: 60 * MCR, mass: 5, slots: 20, bandwidth: 50 }
};
/** "Model/2bis" -> "2bis". */
export function cpuKey(cpu) {
  const m = String(cpu ?? "").match(/(\d+)\s*(bis)?/i);
  return m ? `${m[1]}${m[2] ? "bis" : ""}` : "1";
}

/** Life support (book p.75): stateroom 4T and 500Kcr; low berth 0.5T and 50Kcr. */
export const STATEROOM = { mass: 4, cost: 500 * KCR };
export const LOW_BERTH = { mass: 0.5, cost: 50 * KCR };

/**
 * Ship weapons (book p.76-77). Damage in book dice. The book gives no mass for turrets; we use
 * 1T per mount (fixed weapons on small craft take 2T).
 */
export const SHIP_WEAPONS = {
  turret: { cost: 100 * KCR, damage: "1", mass: 1, mount: "turret" },
  doubleTurret: { cost: 400 * KCR, damage: "2", mass: 1, mount: "turret" },
  tripleTurret: { cost: 800 * KCR, damage: "3", mass: 1, mount: "turret" },
  pulse: { cost: 500 * KCR, damage: "D3", mass: 1, mount: "turret", energy: true },
  beam: { cost: 1 * MCR, damage: "1", mass: 1, mount: "turret", energy: true, beam: true },
  missileRack: { cost: 750 * KCR, damage: "1", mass: 1, mount: "missileRack", ammo: 4, missileCost: 1000 },
  sandcaster: { cost: 250 * KCR, damage: "0", mass: 1, mount: "sandcaster", ammo: 4, canisterCost: 500 }
};

/** Extra hardpoints: 50,000cr each, up to twice the base (book p.76). */
export const EXTRA_HARDPOINT_COST = 50 * KCR;

/** Secondary craft (book p.76). */
export const SECONDARY_CRAFT = {
  escapeBoat: { tons: 20, cost: 14 * MCR, passengers: 3, fuel: 5, thrust: 1 },
  shipsBoat: { tons: 30, cost: 16 * MCR, passengers: 5, cargo: 12, fuel: 9, thrust: 6 },
  pinnace: { tons: 40, cost: 20 * MCR, passengers: 8, cargo: 12, fuel: 12, thrust: 5 },
  cutter: { tons: 50, cost: 28 * MCR, passengers: 12, cargo: 15, fuel: 12, thrust: 4 },
  shuttle: { tons: 95, cost: 33 * MCR, passengers: 30, cargo: 80, fuel: 12, thrust: 3 },
  fighter: { tons: 10, cost: 18 * MCR, passengers: 1, cargo: 1, fuel: 1, thrust: 6 }
};

/** Small craft fuel: 10kg per 10 minutes per G (book p.76). Returns hours of operation. */
export function smallCraftEndurance(fuelTons, g) {
  const perTenMin = 0.01 * Math.max(1, Number(g) || 1);
  return ((Number(fuelTons) || 0) / perTenMin) * 10 / 60;
}

/** Modifications (book p.77). */
export const MODIFICATIONS = {
  streamlining: { costPer100T: 1 * MCR },
  fuelScoops: { cost: 1 * MCR, mass: 0 },
  refinery: { cost: 2.5 * MCR, mass: 5 },
  armor: { cost: 100 * KCR }
};
/** Armour locations (book p.77). */
export const ARMOR_LOCATIONS = ["hull", "mDrive", "jDrive", "power", "fuel", "internal"];

/** Repair parts: 100,000cr per tonne, 10 uses (book p.77). */
export const REPAIR_PARTS_COST = 100 * KCR;

/** Default design: a 100T scout-like hull. */
export function defaultDesign() {
  return {
    name: "", tons: 100, jDrive: "A", mDrive: "A", power: "A", cpu: "1",
    staterooms: 4, lowBerths: 0, fuel: 0, streamlined: true, fuelScoops: false, refineries: 0,
    extraHardpoints: 0, weapons: [], secondary: [], vehicleTons: 0, repairParts: 0,
    armor: { hull: 0, mDrive: 0, jDrive: 0, power: 0, fuel: 0, internal: 0 },
    stock: false, architect: false
  };
}

/**
 * Compute a design: space, cost, time, and warnings (book p.74-77, steps 1-9).
 * @param {object} design see defaultDesign()
 */
export function computeDesign(design) {
  const d = { ...defaultDesign(), ...design, armor: { ...defaultDesign().armor, ...(design?.armor ?? {}) } };
  const hull = hullFor(d.tons);
  const warnings = [];
  const armorLayers = Object.values(d.armor).reduce((a, b) => a + (Number(b) || 0), 0);

  // 2) Engineering.
  const eng = {};
  for (const k of ["jDrive", "mDrive", "power"]) {
    const spec = engineeringSpec(k, d[k]);
    const perf = drivePerformance(d[k], d.tons, armorLayers);
    if (perf === null) warnings.push({ key: "letterTooSmall", system: k, letter: d[k] });
    eng[k] = { letter: d[k], performance: perf ?? 0, ...spec };
  }
  if (letterIndex(d.power) < Math.max(letterIndex(d.jDrive), letterIndex(d.mDrive))) warnings.push({ key: "powerLimits" });
  const engMass = eng.jDrive.mass + eng.mDrive.mass + eng.power.mass;
  const engOverflow = Math.max(0, engMass - hull.engines);

  // 3) Bridge and computer.
  const bridge = bridgeSpec(d.tons);
  const cpu = CPU_MODELS[cpuKey(d.cpu)] ?? CPU_MODELS["1"];

  // 4) Life support.
  const staterooms = Math.max(0, Math.floor(d.staterooms));
  const lowBerths = Math.max(0, Math.floor(d.lowBerths));

  // 5) Fuel.
  const fuelMin = minimumFuel(d.tons);
  const fuelRec = recommendedFuel(d.tons, eng.jDrive.performance, eng.mDrive.performance);
  const fuel = Math.max(fuelMin, Math.floor(Number(d.fuel) || 0) || fuelRec);
  if (fuel < fuelRec) warnings.push({ key: "fuelLow", need: fuelRec });

  // 6) Weapons.
  const baseHp = baseHardpoints(d.tons);
  const extraHp = Math.max(0, Math.min(baseHp, Math.floor(d.extraHardpoints)));
  const hardpoints = baseHp + extraHp;
  const weapons = (d.weapons ?? []).map(w => (typeof w === "string" ? w : w.type)).filter(w => SHIP_WEAPONS[w]);
  if (weapons.length > hardpoints) warnings.push({ key: "hardpoints", have: hardpoints, need: weapons.length });
  const weaponMass = weapons.reduce((a, w) => a + SHIP_WEAPONS[w].mass, 0);
  const weaponCost = weapons.reduce((a, w) => a + SHIP_WEAPONS[w].cost, 0);

  // 7) Secondary craft.
  const secondary = (d.secondary ?? []).filter(k => SECONDARY_CRAFT[k]);
  const secMass = secondary.reduce((a, k) => a + SECONDARY_CRAFT[k].tons, 0);
  const secCost = secondary.reduce((a, k) => a + SECONDARY_CRAFT[k].cost, 0);

  // Modifications.
  const refineries = Math.max(0, Math.floor(d.refineries));
  const modMass = refineries * MODIFICATIONS.refinery.mass;
  const modCost = (d.streamlined ? MODIFICATIONS.streamlining.costPer100T * Math.ceil(d.tons / 100) : 0)
    + (d.fuelScoops ? MODIFICATIONS.fuelScoops.cost : 0)
    + refineries * MODIFICATIONS.refinery.cost
    + armorLayers * MODIFICATIONS.armor.cost;
  if (armorLayers > Math.max(1, Math.floor(d.tons / 100))) warnings.push({ key: "armorHeavy" });

  // 8) Cargo: what main space is left.
  const used = bridge.mass + cpu.mass + staterooms * STATEROOM.mass + lowBerths * LOW_BERTH.mass + fuel
    + weaponMass + secMass + modMass + engOverflow + (Number(d.vehicleTons) || 0) + (Number(d.repairParts) || 0);
  const cargo = Math.round((hull.main - used) * 10) / 10;
  if (cargo < 0) warnings.push({ key: "overSpace", over: -cargo });

  // 9) Cost and time.
  const parts = {
    hull: hull.cost,
    engineering: eng.jDrive.cost + eng.mDrive.cost + eng.power.cost,
    bridge: bridge.cost,
    computer: cpu.cost,
    lifeSupport: staterooms * STATEROOM.cost + lowBerths * LOW_BERTH.cost,
    weapons: weaponCost + extraHp * EXTRA_HARDPOINT_COST,
    secondary: secCost,
    modifications: modCost,
    repairParts: (Number(d.repairParts) || 0) * REPAIR_PARTS_COST
  };
  const subtotal = Object.values(parts).reduce((a, b) => a + b, 0);
  const stockDiscount = d.stock ? Math.round(subtotal * 0.1) : 0;
  const architectFee = d.architect && !d.stock ? Math.round((subtotal - stockDiscount) * 0.01) : 0;
  const total = subtotal - stockDiscount + architectFee;
  const months = hull.months + (d.architect && !d.stock ? 1 : 0);

  return {
    design: d, hull, engineering: eng, engineeringMass: engMass, engineeringOverflow: engOverflow,
    bridge, cpu: { key: cpuKey(d.cpu), ...cpu }, staterooms, lowBerths,
    fuel, fuelMin, fuelRecommended: fuelRec,
    hardpoints, weapons, secondary, refineries, armorLayers,
    cargo, used, parts, subtotal, stockDiscount, architectFee, total, months,
    hullPoints: hullPoints(d.tons), downPayment: Math.round(total * 0.2), mortgage: Math.round(total / 240),
    maintenance: Math.round(total * 0.001),
    warnings, valid: !warnings.some(w => ["letterTooSmall", "overSpace", "hardpoints"].includes(w.key))
  };
}

/** Letters valid for a hull, for the wizard's selects. */
export function letterOptions(tons, armorLayers = 0) {
  return DRIVE_LETTERS.map(l => ({ letter: l, performance: drivePerformance(l, tons, armorLayers) })).filter(o => o.performance !== null);
}
