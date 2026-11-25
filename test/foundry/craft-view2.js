// Screenshot helper: ship sheet on a chosen tab, the construction wizard, and the space combat helper.
// Needs test/foundry/craft-view.js first; run test/foundry/craft-cleanup.js afterwards.
const ship = game.actors.find(a => a.name === "craft-view Patrol Cruiser");
const tab = window.CRAFT_TAB ?? "finances";
await ship.sheet.render(true, { position: { left: 10, top: 10 } });
await new Promise(r => setTimeout(r, 300));
ship.sheet.changeTab(tab, "primary");
const built = await game.spacer.craft.buildShip({ name: "craft-view Built", tons: 200, jDrive: "B", mDrive: "A", power: "B", staterooms: 6, weapons: ["turret"] });
const crew = game.actors.find(a => a.name === "craft-view Crew");
await ship.update({ "system.crew": [{ role: "pilot", actor: crew.uuid }, { role: "gunner", actor: crew.uuid }, { role: "engineer", actor: "" }] });
const wiz = await game.spacer.craft.openConstruction();
wiz.setPosition({ left: 780, top: 10, width: 800, height: 470 });
const sc = await game.spacer.craft.openSpaceCombat({ ships: [ship, built] });
sc.setPosition({ left: 780, top: 490, width: 800, height: 420 });
await new Promise(r => setTimeout(r, 800));
return { tab };
