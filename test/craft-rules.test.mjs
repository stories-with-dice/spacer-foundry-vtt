import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../module/craft/rules/drives.mjs";
import * as S from "../module/craft/rules/space-combat.mjs";
import * as V from "../module/craft/rules/vehicles.mjs";
import * as O from "../module/craft/rules/operations.mjs";
import * as T from "../module/craft/rules/travel.mjs";
import * as C from "../module/craft/rules/construction.mjs";

const sys = (rating, damage = 0, destroyed = false) => ({ rating, value: 0, damage, destroyed });

test("drive performance by hull size matches the sample ships (p.69, p.75)", () => {
  assert.equal(D.drivePerformance("A", 100), 2);      // Scout J-Drive A (Jump 2)
  assert.equal(D.drivePerformance("A", 200), 1);      // Trader A (Jump 1)
  assert.equal(D.drivePerformance("F", 400), 3);      // Patrol cruiser F (Jump 3)
  assert.equal(D.drivePerformance("H", 400), 4);      // Patrol cruiser H (4G)
  assert.equal(D.drivePerformance("J", 600), 3);      // Liner J (Jump 3)
  assert.equal(D.drivePerformance("D", 600), 1);      // Liner D (1G)
  assert.equal(D.drivePerformance("A", 400), null);   // "-" in the table
  assert.equal(D.drivePerformance("Z", 5000), 2);
  assert.equal(D.lowestLetter(100), "A");
  assert.equal(D.lowestLetter(400), "C");
  assert.equal(D.hullColumn(150), 1);
  assert.equal(D.hullColumn(9000), 9);
});

test("extra armour makes the ship perform as the next hull size (p.77)", () => {
  assert.equal(D.hullColumn(100, 1), 0);
  assert.equal(D.hullColumn(100, 2), 1);
  assert.equal(D.drivePerformance("B", 100, 2), 2);
});

test("damage steps a drive down one letter, lowest letter is critical, then destroyed (p.75, p.86)", () => {
  // 100T B M-Drive: hit -> A (2G), critical; hit again -> destroyed.
  let st = D.systemState(sys("B", 1), 100);
  assert.equal(st.letter, "A"); assert.equal(st.performance, 2); assert.equal(st.critical, true); assert.equal(st.destroyed, false);
  st = D.systemState(sys("B", 2), 100);
  assert.equal(st.destroyed, true); assert.equal(st.performance, 0);
  // Built at the lowest letter: the first hit destroys it, no critical step.
  st = D.systemState(sys("A", 1), 100);
  assert.equal(st.destroyed, true); assert.equal(st.critical, false);
  // C on 400T is the lowest letter.
  st = D.systemState(sys("D", 1), 400);
  assert.equal(st.letter, "C"); assert.equal(st.critical, true);
});

test("power plant limits drives to its letter (p.86)", () => {
  const e = D.engineering({ jDrive: sys("B"), mDrive: sys("B"), power: sys("B", 1) }, 100);
  assert.equal(e.power.letter, "A");
  assert.equal(e.mDrive.effectiveLetter, "A"); assert.equal(e.mDrive.effective, 2); assert.equal(e.mDrive.limited, true);
  const dead = D.engineering({ jDrive: sys("B"), mDrive: sys("B"), power: sys("A", 1) }, 100);
  assert.equal(dead.power.destroyed, true);
  assert.equal(dead.jDrive.effective, 0);
});

test("hull, internal, fuel, hardpoints (p.76, p.86-87)", () => {
  assert.equal(D.hullPoints(100), 2);
  assert.equal(D.hullPoints(400), 5);
  assert.equal(D.hullPoints(600), 7);
  assert.equal(D.internalPoints(200), 2);
  assert.equal(D.baseHardpoints(200), 2);
  assert.equal(D.jumpFuel(2), 20);
  assert.equal(D.recommendedFuel(200, 2, 2), 30);  // book example: 20 + 8 + 2
  assert.equal(D.minimumFuel(200), 20);
});

test("ship damage locations (p.86)", () => {
  assert.equal(S.shipLocation(7), "hull");
  assert.equal(S.shipLocation(2), "internal");
  assert.equal(S.shipLocation(10), "jDrive");
  assert.equal(S.shipLocation(1, true), "cockpit");
  assert.equal(S.shipLocation(4, true), "drive");
});

const scout = () => ({
  tonnage: 100, smallCraft: false, destroyed: false,
  hull: { value: 2, max: 2 }, jDrive: sys("A"), mDrive: sys("B"), power: sys("B"),
  fuel: { value: 40, max: 40 }, fuelHits: 0, internalHits: 0, cockpitHits: 0,
  weapons: [{ id: "w1" }], armor: {}
});

test("applyShipDamage: drives step down and get destroyed", () => {
  let r = S.applyShipDamage(scout(), "mDrive", 1);
  assert.equal(r.state.mDrive.damage, 1);
  assert.ok(r.events.some(e => e.type === "critical" && e.location === "mDrive"));
  r = S.applyShipDamage(r.state, "mDrive", 1);
  assert.equal(r.state.mDrive.destroyed, true);
  r = S.applyShipDamage(r.state, "mDrive", 1);   // more hits go to the hull
  assert.equal(r.state.hull.value, 1);
});

test("applyShipDamage: power plant destroyed blows up the ship", () => {
  const r = S.applyShipDamage(scout(), "power", 2);
  assert.equal(r.state.power.destroyed, true);
  assert.equal(r.state.destroyed, true);
  assert.ok(r.events.some(e => e.type === "explode"));
});

test("applyShipDamage: hull critical at 1 and destroyed at 0; armour absorbs", () => {
  let r = S.applyShipDamage(scout(), "hull", 1);
  assert.ok(r.events.some(e => e.type === "critical" && e.location === "hull"));
  r = S.applyShipDamage(r.state, "hull", 1);
  assert.equal(r.state.destroyed, true);
  const armored = { ...scout(), armor: { hull: 1 } };
  r = S.applyShipDamage(armored, "hull", 1);
  assert.equal(r.state.hull.value, 2);
});

test("applyShipDamage: fuel leaks 10T per hit, then hull", () => {
  const s = { ...scout(), fuel: { value: 15, max: 20 } };
  let r = S.applyShipDamage(s, "fuel", 1);
  assert.equal(r.state.fuel.value, 10);
  r = S.applyShipDamage(r.state, "fuel", 2);
  assert.equal(r.state.fuel.value, 0);
  assert.equal(r.state.fuelHits, 2);
  assert.equal(r.state.hull.value, 1);
});

test("applyShipDamage: weapons disable, then destroy and hit hull; internal uses D3", () => {
  let r = S.applyShipDamage(scout(), "weapon", 1);
  assert.equal(r.state.weapons[0].disabled, true);
  r = S.applyShipDamage(r.state, "weapon", 1);
  assert.equal(r.state.weapons[0].destroyed, true);
  assert.equal(r.state.hull.value, 1);
  r = S.applyShipDamage(scout(), "internal", 1, { internalRolls: [3] });
  assert.equal(r.events[0].effect, "cargo");
  assert.ok(r.events.some(e => e.type === "depressurized"));
});

test("applyShipDamage: small craft", () => {
  const sc = { tonnage: 30, smallCraft: true, hull: { value: 1, max: 1 }, mDrive: { rating: "", value: 2, damage: 0 }, jDrive: sys("A"), power: sys("A"), fuel: { value: 9, max: 9 }, weapons: [] };
  let r = S.applyShipDamage(sc, "cockpit", 1);
  assert.ok(r.events.some(e => e.type === "pilotDamage"));
  r = S.applyShipDamage(sc, "drive", 3);
  assert.equal(r.state.destroyed, true);
  r = S.applyShipDamage(sc, "hull", 1);
  assert.equal(r.state.destroyed, false);
  r = S.applyShipDamage(r.state, "hull", 1);
  assert.equal(r.state.destroyed, true);
});

test("space combat DMs, movement, overload (p.84-85)", () => {
  assert.equal(S.rangeDM("adjacent"), 1);
  assert.equal(S.rangeDM("beyond", 2), -12);
  assert.equal(S.attackDM({ range: "medium", energy: true, called: true }).total, -2);
  assert.equal(S.movementPlan(2, 2).possible, true);
  assert.equal(S.movementPlan(1, 2).possible, false);
  assert.equal(S.shiftRange(1, -1).dogfight, true);
  assert.deepEqual(S.overloadResult(10), { success: true, steps: 2, damage: 0 });
  assert.equal(S.overloadResult(6).damage, 2);
  assert.equal(S.emergencyJumpTarget(3), 9);
  assert.equal(S.multiplePositionsDM(3), -4);
  assert.equal(S.missileDelay("long"), 3);
});

test("vehicle speed and top-speed DM (p.46)", () => {
  assert.equal(V.speedKmh(4), 200);
  assert.equal(V.cruiseBand(4), 3);
  assert.equal(V.cruiseBand(2), null);
  assert.equal(V.topSpeedDM(3, 4, 2), 0);   // book example: cruising
  assert.equal(V.topSpeedDM(4, 4, 2), -2);  // book example: top speed
  assert.equal(V.speedAttackDM(4, 1), -3);
});

test("vehicle locations and damage conversion (p.49)", () => {
  assert.equal(V.vehicleLocation(4, false), "hull");
  assert.equal(V.vehicleLocation(4, true), "weapon");
  assert.equal(V.toVehicleDamage(5, "personal"), 1);
  assert.equal(V.toVehicleDamage(1, "starship"), 6);
  assert.equal(V.vehicleDamageToPerson(2), 12);
});

const car = () => ({ destroyed: false, locations: {
  interior: { value: 4, max: 4, armored: false }, drive: { value: 4, max: 4, armored: true },
  handling: { value: 1, max: 1, armored: false }, hull: { value: 4, max: 4, armored: false }, weapon: { value: 0, max: 0, armored: false }
} });

test("applyVehicleDamage: armour, transfers, explosion checks (p.49)", () => {
  let r = V.applyVehicleDamage(car(), "drive", 2);
  assert.equal(r.state.locations.drive.value, 3);   // armour -1
  r = V.applyVehicleDamage(car(), "handling", 3);
  assert.equal(r.state.locations.handling.value, 0);
  assert.equal(r.state.locations.hull.value, 2);    // excess 2 to hull
  assert.ok(r.events.some(e => e.type === "explosionCheck" && e.cause === "handling"));
  r = V.applyVehicleDamage(car(), "hull", 6);
  assert.ok(r.events.some(e => e.type === "explosionCheck" && e.dm === 2));
  r = V.applyVehicleDamage(car(), "interior", 2);
  assert.ok(r.events.some(e => e.type === "occupants" && e.dice === 2));
  r = V.applyVehicleDamage(car(), "interior", 2, { open: true, openRoll: 4 });
  assert.equal(r.state.locations.interior.value, 4);
  r = V.applyVehicleDamage(car(), "weapon", 1);      // no weapon: hull
  assert.equal(r.state.locations.hull.value, 3);
});

test("ramming, hit-and-run, offensive driving (p.49)", () => {
  assert.deepEqual(V.ramDamage(5, 2), { defender: 3, attacker: 2 });
  assert.equal(V.hitAndRunDice(2, 2), "2D+2");    // book example
  assert.equal(V.offensiveDrivingDM(10, 5), 2);
  assert.equal(V.offensiveDrivingResult(10, 7).controlDM, -3);
  assert.equal(V.offensiveDrivingResult(7, 9).attackerSpeedLoss, 2);
  assert.equal(V.controlCheckOutcome(2, 10), "flip");
  assert.equal(V.effectiveSpeedBand(4, { value: 3, max: 4 }), 3);
  assert.equal(V.effectiveRange(1000, { value: 1, max: 3 }), 600);
});

test("costs and purchases (p.68-70)", () => {
  assert.equal(O.monthlyMortgage(30_000_000), 125_000);
  assert.equal(O.lifeSupportCost(4), 8000);
  assert.equal(O.annualMaintenance(30_000_000), 30_000);
  assert.equal(O.annualMaintenance(30_000_000, 20), 36_000);
  assert.equal(O.berthingCost(7), 100);
  assert.equal(O.berthingCost(9), 300);
  assert.equal(O.crewSalaries(["pilot", "engineer"]), 10_000);
  assert.deepEqual(O.mandatoryPositions(400), ["pilot", "astrogator", "sensors", "engineer"]);
  assert.equal(O.purchase(10_000_000, "used", { d6: 4 }).maintenanceSurcharge, 20);
  assert.equal(O.purchase(10_000_000, "used", { d6: 1 }).maintenanceSurcharge, 10);
  assert.equal(O.purchase(10_000_000, "junked", { d3: 2 }).discount, 60);
  const bill = O.monthlyBill({ mortgage: 100, crewSalaries: 50, maintenance: 1000, maintenanceDue: false });
  assert.equal(bill.total, 150);
  assert.equal(O.maintenanceDM(14), -2);
  assert.equal(O.skippingCaught(7, "A", 0), true);
  assert.equal(O.skippingCaught(12, "X", -6), true);
  assert.deepEqual(O.contaminatedFuelResult(6, 6), { failed: true, steps: 2, critical: false });
});

test("travel times (p.67)", () => {
  assert.equal(T.interplanetaryHours("moon", 2), 9);
  assert.equal(T.interplanetaryHours("remoteGasGiant", 1), 720);
  assert.equal(T.interplanetaryHours("orbit", 9), 1 / 60);
  assert.equal(T.interplanetaryHours("orbit", 0), null);
  assert.equal(T.jumpPointHours(8, 2), 4.5);
  assert.equal(T.jumpPointHours("A", 1), 7);
  assert.equal(T.jumpPointHours("gasGiant", 6), 8);
  assert.equal(T.planJump({ parsecs: 2, jumpRating: 2, fuel: 40 }).possible, true);
  assert.equal(T.planJump({ parsecs: 3, jumpRating: 2, fuel: 40 }).reason, "tooFar");
  assert.equal(T.planJump({ parsecs: 2, jumpRating: 2, fuel: 10 }).reason, "fuel");
  assert.equal(T.formatHours(26.5), "1d 2h 30m");
  assert.equal(T.slingshotBonus("B"), 2);
});

test("construction matches the 100T Scout (p.69, p.74-77)", () => {
  const r = C.computeDesign({ tons: 100, jDrive: "A", mDrive: "A", power: "A", cpu: "1", staterooms: 4, fuel: 40, weapons: ["doubleTurret"], vehicleTons: 4, streamlined: true });
  assert.equal(r.cargo, 3);
  assert.equal(r.total, 29_900_000);
  assert.equal(r.hullPoints, 2);
  assert.equal(r.valid, true);
  assert.equal(r.months, 10);
  const bad = C.computeDesign({ tons: 400, jDrive: "A" });
  assert.equal(bad.valid, false);
  const stock = C.computeDesign({ tons: 100, stock: true });
  assert.equal(stock.stockDiscount, Math.round(stock.subtotal * 0.1));
  assert.equal(C.hullFor(150).custom, true);
  assert.equal(C.hullFor(150).months, 36);
  assert.equal(C.engineeringSpec("power", "Y").cost, 184_000_000);
});
