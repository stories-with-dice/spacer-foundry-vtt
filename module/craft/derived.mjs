/**
 * Derived data for ShipData and VehicleData. Called from their prepareDerivedData()
 * (module/data/actors.mjs). Reads only the system fields and the parent's items; no Foundry globals.
 */
import { engineering, hullPoints, internalPoints, fuelHitsMax, jumpFuel, armorLayers as sumArmor } from "./rules/drives.mjs";
import { effectiveSpeedBand, effectiveRange, cruiseBand, speedKmh, armoredLocations } from "./rules/vehicles.mjs";
import { annualMaintenance, maintenanceDM, minimumCrew } from "./rules/operations.mjs";

/**
 * Ship derived data (book p.74-87): effective drives after damage, armour layers, hull and
 * internal points, fuel state, weapons state, critical systems, minimum crew, and maintenance.
 * Writes `engineering`, `effective`, `armorLayers`, `internal`, `fuelState`, `weaponsState`,
 * `critical`, `criticalSystems`, `isDestroyed`, `minimumCrew`, `maintenance`, ... on the instance.
 * @param {object} s ShipData instance
 */
export function deriveShip(s) {
  const armorLayers = sumArmor(s.armor);
  let eng;
  if (s.smallCraft) {
    const thrust = Math.max(0, s.mDrive.value - s.mDrive.damage);
    const st = { letter: s.mDrive.rating || "-", performance: thrust, effective: thrust, effectiveLetter: s.mDrive.rating, builtPerformance: s.mDrive.value, critical: thrust === 0 && !s.mDrive.destroyed, destroyed: s.mDrive.destroyed, limited: false, steps: s.mDrive.damage };
    const none = { letter: null, performance: 0, effective: 0, builtPerformance: 0, critical: false, destroyed: false, limited: false, steps: 0 };
    eng = { jDrive: none, mDrive: st, power: { ...none, performance: 1, effective: 1 } };
  } else {
    eng = engineering(s, s.tonnage, armorLayers);
  }
  const fuelHits = Math.max(0, Number(s.fuelHits) || 0);
  const fuelCapacity = Math.max(0, s.fuel.max - 10 * fuelHits);
  const weapons = (s.parent?.items ?? []).filter(i => i.type === "shipWeapon");
  const disabledWeapons = weapons.filter(i => i.system.disabled || i.system.destroyed).length;

  s.engineering = eng;
  s.effective = { jump: eng.jDrive.effective, thrust: eng.mDrive.effective, power: eng.power.effective };
  s.armorLayers = armorLayers;
  s.hullPointsRule = s.smallCraft ? 1 : hullPoints(s.tonnage);
  s.internal = { max: s.smallCraft ? 0 : internalPoints(s.tonnage), hits: s.internalHits };
  s.internal.value = Math.max(0, s.internal.max - s.internalHits);
  s.fuelState = {
    hits: fuelHits, hitsMax: fuelHitsMax(s.fuel.max), capacity: fuelCapacity,
    jumpNeed: jumpFuel(Math.max(1, eng.jDrive.effective)), unrefined: !!s.unrefined
  };
  s.cargoFree = Math.max(0, s.cargo.max - s.cargo.value);
  s.weaponsState = { total: weapons.length, disabled: disabledWeapons };
  s.critical = !s.smallCraft && s.hull.value === 1;
  s.criticalSystems = {
    hull: s.critical,
    jDrive: eng.jDrive.critical, mDrive: eng.mDrive.critical, power: eng.power.critical,
    fuel: s.fuel.max > 0 && fuelCapacity <= 0,
    internal: !s.smallCraft && s.internalHits >= s.internal.max
  };
  s.isDestroyed = s.destroyed || (!s.smallCraft && s.hull.max > 0 && s.hull.value <= 0);
  s.minimumCrew = minimumCrew(s.tonnage);
  s.maintenance = {
    annual: annualMaintenance(s.cost, s.finances.maintenanceSurcharge),
    months: s.finances.monthsSinceMaintenance
  };
  s.maintenance.dm = maintenanceDM(s.maintenance.months);
  s.hullLabel = `${s.hull.value}/${s.hull.max}`;
}

/**
 * Vehicle derived data (book p.46-49): speed and range after damage, armoured locations (flagged,
 * or the armour rating spread by armoredLocations), and location status.
 * @param {object} v VehicleData instance
 */
export function deriveVehicle(v) {
  const L = v.locations;
  const traits = (v.traits ?? []).map(t => String(t).toLowerCase());
  v.isMilitary = v.military || traits.includes("military");
  v.isOpen = traits.includes("open");
  v.cruiseBand = cruiseBand(v.speedBand);
  v.effectiveSpeedBand = effectiveSpeedBand(v.speedBand, L.drive);
  v.effectiveCruiseBand = cruiseBand(v.effectiveSpeedBand);
  v.topKmh = speedKmh(v.effectiveSpeedBand);
  v.currentKmh = speedKmh(Math.min(v.currentSpeed, v.effectiveSpeedBand));
  v.effectiveRangeKm = effectiveRange(v.rangeKm, L.handling);
  v.armoredLocations = armoredLocations(L, v.armor);
  v.status = {
    uncontrolled: L.interior.max > 0 && L.interior.value <= 0,
    immobile: L.drive.max > 0 && L.drive.value <= 0,
    powerDestroyed: L.handling.max > 0 && L.handling.value <= 0,
    compromised: L.hull.max > 0 && L.hull.value <= 0,
    weaponsOut: L.weapon.max > 0 && L.weapon.value <= 0,
    destroyed: v.destroyed
  };
}
