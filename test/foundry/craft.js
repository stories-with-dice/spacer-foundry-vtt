// Craft smoke test: ship and vehicle sheets, weapons, hits, step-downs, travel, jump, month of costs,
// construction, space combat. Creates documents named "craft-..." and deletes them at the end.
const start = Date.now();
const out = { checks: [] };
const check = (name, ok, info = "") => { out.checks.push(`${ok ? "ok" : "FAIL"} ${name}${info !== "" ? ` (${info})` : ""}`); if (!ok) throw new Error(`${name} ${info}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const C = game.spacer.craft;
check("api", !!C && typeof C.damageShip === "function" && typeof C.openConstruction === "function");

for (const a of game.actors.filter(a => a.name.startsWith("craft-"))) await a.delete();
const created = [];
try {
  const gunner = await Actor.create({ name: "craft-Gunner", type: "npc", items: [
    { name: "Gunner", type: "skill", system: { skill: "Gunner", specialty: "", rank: 2 } },
    { name: "Astrogation", type: "skill", system: { skill: "Astrogation", specialty: "", rank: 3 } },
    { name: "Drive (Military)", type: "skill", system: { skill: "Drive", specialty: "Military", rank: 1 } }
  ] });
  created.push(gunner);

  const ship = await Actor.create({
    name: "craft-Scout", type: "ship",
    system: {
      shipClass: "100T Scout", tonnage: 100, hull: { value: 2, max: 2 },
      jDrive: { rating: "A", value: 2 }, mDrive: { rating: "B", value: 4 }, power: { rating: "B", value: 4 },
      fuel: { value: 40, max: 40 }, cargo: { value: 0, max: 3 }, staterooms: 4, hardpoints: 1, cost: 30_000_000,
      finances: { bank: 1_000_000 },
      crew: [{ role: "pilot", actor: gunner.uuid }, { role: "astrogator", actor: gunner.uuid }, { role: "gunner", actor: gunner.uuid }]
    },
    items: [{ name: "Double Turret", type: "shipWeapon", system: { mount: "turret", damage: "2", range: "long" } }]
  });
  created.push(ship);
  check("ship derived", ship.system.effective.thrust === 4 && ship.system.effective.jump === 2, `${ship.system.effective.thrust}/${ship.system.effective.jump}`);

  const atv = await Actor.create({
    name: "craft-AFV", type: "vehicle",
    system: {
      category: "landcraft", traits: ["Military", "Tracked"], military: true, skill: "Drive (Military)",
      speedBand: 3, currentSpeed: 3, occupants: 6, weightTons: 10, armor: 3,
      locations: { interior: { value: 6, max: 6, armored: true }, drive: { value: 3, max: 3, armored: true }, handling: { value: 8, max: 8 }, hull: { value: 8, max: 8, armored: true }, weapon: { value: 1, max: 1 } },
      crew: [gunner.uuid]
    },
    items: [{ name: "Medium Turret", type: "shipWeapon", system: { mount: "vehicle", forVehicle: true, damage: "D3", range: "long" } }]
  });
  created.push(atv);
  check("vehicle derived", atv.system.cruiseBand === 2 && atv.system.effectiveSpeedBand === 3);
  check("top speed DM", C.vehicleSpeedDM(atv) === -2, C.vehicleSpeedDM(atv));

  // Sheets: render, then visit every ship tab.
  await ship.sheet.render(true); await atv.sheet.render(true);
  await wait(400);
  check("ship sheet", !!ship.sheet.element?.querySelector(".stat-block"));
  check("vehicle sheet", !!atv.sheet.element?.querySelector(".locations"));
  for (const tab of ["crew", "finances", "travel", "notes", "ship"]) { ship.sheet.changeTab(tab, "primary"); await wait(50); }

  // Weapons.
  const turret = ship.items.find(i => i.type === "shipWeapon");
  const fired = await C.fireWeapon(ship, turret, { range: "close", target: atv });
  check("fire weapon", typeof fired.result.total === "number", `total ${fired.result.total}, dmg ${fired.damage}`);
  const vfired = await C.fireWeapon(atv, atv.items.contents[0], { target: atv });
  check("fire vehicle weapon", typeof vfired.result.total === "number");

  // Travel before damage: jump point, interplanetary, jump.
  const tj = await C.travelToJumpPoint(ship, { size: 8 });
  check("to jump point", tj.hours === 3.25, tj.hours);
  const ip = await C.travelInterplanetary(ship, { row: "moon" });
  check("interplanetary", ip.hours === 3, ip.hours);
  const fuelBefore = ship.system.fuel.value;
  let j = null;
  for (let i = 0; i < 6 && !j?.made; i++) j = await C.jump(ship, { parsecs: 2, destination: "craft-Test" });
  check("jump", j.made && Math.abs(ship.system.fuel.value - (fuelBefore - 20)) < 0.01, `${fuelBefore} -> ${ship.system.fuel.value}`);
  const tooFar = await C.jump(ship, { parsecs: 3 });
  check("jump too far refused", tooFar.made === false && tooFar.reason === "tooFar");
  const rf = await C.refuel(ship, { type: "refined" });
  check("refuel", ship.system.fuel.value === 40 && rf.cost === rf.tons * 500);

  // Month of costs.
  const fin = await C.calculateFinances(ship);
  check("book finances", fin.mortgage === 125_000 && fin.lifeSupport === 8000 && fin.crewSalaries === 12_000, JSON.stringify(fin));
  const bank = ship.system.finances.bank;
  const bill = await C.payMonth(ship, { berthingDays: 7 });
  check("pay month", ship.system.finances.bank === bank - bill.total && bill.total === 125_000 + 12_000 + 8000 + 100, `${bill.total}`);
  check("maintenance months", ship.system.finances.monthsSinceMaintenance === 1 && ship.system.finances.mortgagePaid === 1);

  // Ship hits and step-downs (100T: M-Drive B=4G -> A=2G critical -> destroyed).
  await C.damageShip(ship, 1, { location: "mDrive" });
  check("m-drive step down", ship.system.engineering.mDrive.letter === "A" && ship.system.effective.thrust === 2 && ship.system.engineering.mDrive.critical, ship.system.engineering.mDrive.letter);
  await C.damageShip(ship, 1, { location: "mDrive" });
  check("m-drive destroyed", ship.system.mDrive.destroyed && ship.system.effective.thrust === 0);
  await C.damageShip(ship, 1, { location: "power" });
  check("power step down", ship.system.engineering.power.letter === "A" && ship.system.engineering.power.critical);
  await C.damageShip(ship, 1, { location: "fuel" });
  check("fuel leak", ship.system.fuel.value === 30 && ship.system.fuelState.hits === 1);
  await C.damageShip(ship, 1, { location: "weapon" });
  check("weapon disabled", ship.items.get(turret.id).system.disabled === true && ship.system.weaponsState.disabled === 1);
  await C.damageShip(ship, 1);
  check("random hit", true, `hull ${ship.system.hull.value}`);
  const leaks = ship.system.fuelState.hits;
  await C.repairShip(ship, "fuel", { roll: false });
  check("repair", ship.system.fuelState.hits === leaks - 1, `${leaks}`);

  // Vehicle hits.
  await C.damageVehicle(atv, 2, { location: "drive" });
  check("vehicle drive hit (armour -1)", atv.system.locations.drive.value === 2 && atv.system.effectiveSpeedBand === 2);
  await C.damageVehicle(atv, 1, { location: "interior" });
  check("vehicle interior armour", atv.system.locations.interior.value === 6);
  const sv = await C.damageVehicle(atv, 1, { source: "starship" });
  check("starship weapon x6", sv.points === 6, sv.location);
  const pv = await C.damageVehicle(atv, 7, { source: "personal", location: "handling" });
  check("personal weapon = 1", pv.points === 1);

  // Fix: vehicle armour from the rating when no location is flagged (p.49): hull first.
  const tank = await Actor.create({ name: "craft-Tank", type: "vehicle", system: { armor: 3, military: true, locations: { interior: { value: 4, max: 4 }, drive: { value: 3, max: 3 }, handling: { value: 4, max: 4 }, hull: { value: 6, max: 6 }, weapon: { value: 0, max: 0 } } } });
  created.push(tank);
  check("vehicle armour from rating", tank.system.armoredLocations.join() === "hull,interior,drive", tank.system.armoredLocations.join());
  await C.damageVehicle(tank, 2, { location: "hull" });
  check("vehicle hull armour -1", tank.system.locations.hull.value === 5, tank.system.locations.hull.value);

  // Fix: vehicle weapon hits on a person: x6 per point through game.spacer.play.applyDamage (p.49).
  const victim = await Actor.create({ name: "craft-Victim", type: "npc" });
  created.push(victim);
  const ph = await C.applyHit(victim, 1, { source: "vehicle" });
  check("person hit x6", ph.amount === 6 && victim.system.characteristics.end.value === 1, `${ph.amount} END ${victim.system.characteristics.end.value}`);
  // The craft-hit chat button routes a person target to the play area too.
  const btnMsg = await ChatMessage.create({ content: `<div class="spacer craft-card"><button type="button" data-action="craft-hit" data-amount="1" data-source="vehicle" data-target="${victim.uuid}">hit</button></div>`, flags: { spacer: { craft: { test: true } } } });
  await wait(300);
  const btn = document.querySelector(`[data-message-id="${btnMsg.id}"] [data-action="craft-hit"]`);
  check("craft-hit button rendered", !!btn);
  btn.click();
  await wait(600);
  check("craft-hit button on a person", victim.system.characteristics.end.value === 0 && victim.system.characteristics.str.value + victim.system.characteristics.dex.value === 9, `END ${victim.system.characteristics.end.value}`);
  // fireWeapon with apply on a person no longer throws "Not a craft".
  // Every die rolls 6 (Foundry maps u = 0 to the highest face), so the shot hits.
  const oldUniform = CONFIG.Dice.randomUniform;
  CONFIG.Dice.randomUniform = () => 0;
  let personFire;
  try { personFire = await C.fireWeapon(atv, atv.items.contents[0], { target: victim, apply: true }); }
  finally { CONFIG.Dice.randomUniform = oldUniform; }
  check("fire at a person", personFire?.applied?.person === true, JSON.stringify({ total: personFire?.result?.total, damage: personFire?.damage }));

  // Fix: missiles hit automatically (no Gunner roll) unless the target evades (p.84).
  const rack = (await ship.createEmbeddedDocuments("Item", [{ name: "Missile Rack", type: "shipWeapon", system: { mount: "missileRack", damage: "1", range: "long", ammo: { value: 4, max: 4 } } }]))[0];
  const salvo = await C.fireWeapon(ship, rack, { missiles: 2, range: "medium", target: tank, apply: true });
  check("missiles: no roll, ammo spent", salvo.result === null && salvo.shots === 2 && salvo.delay === 2 && rack.system.ammo.value === 2);
  check("missiles hit a vehicle x6", salvo.applied.hit && salvo.applied.damage === 2 && salvo.applied.applied.points === 12, JSON.stringify(salvo.applied.damage));

  // Fix: untrained operator: top-speed DM without the double -3 (p.46).
  const runabout = await Actor.create({ name: "craft-Runabout", type: "vehicle", system: { speedBand: 4, currentSpeed: 4 } });
  created.push(runabout);
  check("untrained top speed DM", C.vehicleSpeedDM(runabout) === -4, C.vehicleSpeedDM(runabout));

  // Fix: flags -> fields migration (register.mjs runs it once at ready).
  const old = await Actor.create({ name: "craft-Old", type: "ship", system: { tonnage: 100 },
    flags: { spacer: { craft: { fuelHits: 1, unrefined: true, monthsSinceMaintenance: 3, armor: { hull: 1 }, design: { tons: 100 } } } },
    items: [{ name: "Turret", type: "shipWeapon", system: { mount: "turret" }, flags: { spacer: { craft: { disabled: true } } } }] });
  created.push(old);
  const { migrateCraft } = await import("/systems/spacer/module/craft/migration.mjs");
  await migrateCraft({ force: true });
  const of = old.flags.spacer?.craft ?? {};
  check("migration fields", old.system.fuelHits === 1 && old.system.unrefined && old.system.finances.monthsSinceMaintenance === 3 && old.system.armor.hull === 1 && old.items.contents[0].system.disabled);
  check("migration flags unset", !("fuelHits" in of) && !("armor" in of) && !!of.design && !("disabled" in (old.items.contents[0].flags.spacer?.craft ?? {})), JSON.stringify(of));
  check("migration setting", game.settings.get("spacer", "craftMigration") >= 1);

  // Vehicle actions.
  const atv2 = await Actor.create({ name: "craft-Car", type: "vehicle", system: { speedBand: 4, currentSpeed: 1, weightTons: 2 } });
  created.push(atv2);
  const ramRes = await C.ram(atv, atv2, { apply: false });
  check("ram", ramRes.defender === Math.abs(atv.system.currentSpeed - 1));
  const od = await C.offensiveDriving(atv, atv2, { apply: false });
  check("offensive driving", ["attacker", "defender"].includes(od.winner));
  const hr = await C.hitAndRun(atv, gunner, { apply: false });
  check("hit and run", typeof hr.hit === "boolean" && hr.dice.includes("+10"), hr.dice);

  // Construction wizard and build.
  const wiz = await C.openConstruction();
  await wait(300);
  check("construction wizard", !!wiz.element?.querySelector(".summary"));
  const built = await C.buildShip({ name: "craft-Built", tons: 200, jDrive: "B", mDrive: "A", power: "B", staterooms: 6, weapons: ["turret", "pulse"], secondary: ["shipsBoat"] });
  created.push(built);
  check("built ship", built.system.tonnage === 200 && built.system.effective.jump === 2 && built.items.size === 2 && built.system.hull.max === 3, `${built.system.cost}`);
  await wiz.close();

  // Space combat helper.
  const sc = await C.openSpaceCombat({ ships: [ship, built] });
  await wait(300);
  check("space combat", sc.combat.ships.length === 2 && !!sc.element?.querySelector(".combat-ship"));
  await sc.rollInitiative();
  const moved = await sc.move(built.uuid, ship.uuid, -1);
  check("move to adjacent", moved && sc.range(built.uuid, ship.uuid) === 0);
  await sc.nextRound();
  check("dogfight ends at close", sc.range(built.uuid, ship.uuid) === 1);
  // Missiles at a ship: its pilot rolls to evade (Pilot 8+); the salvo hits or misses as a whole.
  const impact = await C.missileImpact(built, { shots: 1, source: "starship" });
  check("missile evade roll", !!impact.roll && impact.evaded === impact.roll.total >= 8 && impact.hit === !impact.evaded, `${impact.roll?.total}`);
  await C.crewAction(ship, "astrogator", "emergencyJump", { roundsSpent: 2 });
  await C.crewAction(ship, "pilot", "firingPosition");
  await sc.render(true); await wait(200);
  await sc.close();
  await game.settings.set("spacer", "craftCombat", {});

  out.ship = { hull: ship.system.hull.value, thrust: ship.system.effective.thrust, jump: ship.system.effective.jump, bank: ship.system.finances.bank };
  out.vehicle = { locations: Object.fromEntries(Object.entries(atv.system.locations).map(([k, l]) => [k, l.value])), destroyed: atv.system.destroyed };
} finally {
  for (const a of created) { try { await a.sheet?.close(); } catch {} }
  for (const a of game.actors.filter(a => a.name.startsWith("craft-"))) await a.delete();
  const msgs = game.messages.filter(m => m.timestamp >= start && (m.flags?.spacer?.craft || /^craft-/.test(m.speaker?.alias ?? "") || /craft-/.test(m.flavor ?? "")));
  if (msgs.length) await ChatMessage.deleteDocuments(msgs.map(m => m.id));
}
return out;
