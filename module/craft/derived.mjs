/**
 * Derived data for ShipData and VehicleData. Called from their prepareDerivedData().
 * No Foundry globals except the parent document's flags, read defensively.
 */
import { engineering, hullPoints, internalPoints, fuelHitsMax } from "./rules/drives.mjs";
import { effectiveSpeedBand, effectiveRange, cruiseBand, speedKmh } from "./rules/vehicles.mjs";
import { annualMaintenance, maintenanceDM, minimumCrew } from "./rules/operations.mjs";
import { jumpFuel } from "./rules/drives.mjs";

/** Craft flags on the parent actor (state the core schema has no field for). */
export function craftFlags(system) {
  return system?.parent?.flags?.spacer?.craft ?? {};
}

/** @param {object} s ShipData instance */
export function deriveShip(s) {
  const f = craftFlags(s);
  const armor = { hull: 0, mDrive: 0, jDrive: 0, power: 0, fuel: 0, internal: 0, ...(f.armor ?? {}) };
  const armorLayers = Object.values(armor).reduce((a, b) => a + (Number(b) || 0), 0);
  let eng;
  if (s.smallCraft) {
    const thrust = Math.max(0, s.mDrive.value - s.mDrive.damage);
    const st = { letter: s.mDrive.rating || "-", performance: thrust, effective: thrust, effectiveLetter: s.mDrive.rating, builtPerformance: s.mDrive.value, critical: thrust === 0 && !s.mDrive.destroyed, destroyed: s.mDrive.destroyed, limited: false, steps: s.mDrive.damage };
    const none = { letter: null, performance: 0, effective: 0, builtPerformance: 0, critical: false, destroyed: false, limited: false, steps: 0 };
    eng = { jDrive: none, mDrive: st, power: { ...none, performance: 1, effective: 1 } };
  } else {
    eng = engineering(s, s.tonnage, armorLayers);
  }
  const fuelHits = Math.max(0, Number(f.fuelHits) || 0);
  const fuelCapacity = Math.max(0, s.fuel.max - 10 * fuelHits);
  const weapons = (s.parent?.items ?? []).filter(i => i.type === "shipWeapon");
  const disabledWeapons = weapons.filter(i => i.flags?.spacer?.craft?.disabled || i.system.destroyed).length;

  s.engineering = eng;
  s.effective = { jump: eng.jDrive.effective, thrust: eng.mDrive.effective, power: eng.power.effective };
  s.armor = armor;
  s.armorLayers = armorLayers;
  s.hullPointsRule = s.smallCraft ? 1 : hullPoints(s.tonnage);
  s.internal = { max: s.smallCraft ? 0 : internalPoints(s.tonnage), hits: s.internalHits };
  s.internal.value = Math.max(0, s.internal.max - s.internalHits);
  s.fuelState = {
    hits: fuelHits, hitsMax: fuelHitsMax(s.fuel.max), capacity: fuelCapacity,
    jumpNeed: jumpFuel(Math.max(1, eng.jDrive.effective)), unrefined: !!f.unrefined
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
    annual: annualMaintenance(s.cost, f.maintenanceSurcharge ?? 0),
    months: Number(f.monthsSinceMaintenance) || 0
  };
  s.maintenance.dm = maintenanceDM(s.maintenance.months);
  s.hullLabel = `${s.hull.value}/${s.hull.max}`;
}

/** @param {object} v VehicleData instance */
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
  v.armoredLocations = Object.entries(L).filter(([, l]) => l.armored).map(([k]) => k);
  v.status = {
    uncontrolled: L.interior.max > 0 && L.interior.value <= 0,
    immobile: L.drive.max > 0 && L.drive.value <= 0,
    powerDestroyed: L.handling.max > 0 && L.handling.value <= 0,
    compromised: L.hull.max > 0 && L.hull.value <= 0,
    weaponsOut: L.weapon.max > 0 && L.weapon.value <= 0,
    destroyed: v.destroyed
  };
}
