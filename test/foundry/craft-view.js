// Screenshot helper: opens a ship and a vehicle sheet side by side and leaves them open.
// Run test/foundry/craft-cleanup.js afterwards to delete the "craft-view" documents.
for (const a of game.actors.filter(a => a.name.startsWith("craft-view"))) await a.delete();
// Use the content source files (the packs may not be loaded by a running server).
const load = async p => { try { return await (await fetch(`systems/spacer/src/content/${p}`)).json(); } catch { return []; } };
const shipSrc = (await load("starships/sample-starships.json")).find(d => d.name.includes("Patrol"));
const vehSrc = (await load("vehicles/landcraft.json")).find(d => d.name.includes("AFV"));
const crew = await Actor.create({ name: "craft-view Crew", type: "npc" });
const shipData = foundry.utils.deepClone(shipSrc ?? { type: "ship", system: { tonnage: 400, mDrive: { rating: "H" } } });
delete shipData.folder;
shipData.name = "craft-view Patrol Cruiser";
shipData.system.crew = [{ role: "pilot", actor: crew.uuid }, { role: "gunner", actor: crew.uuid }];
shipData.system.mDrive.damage = 1;
const ship = await Actor.create(shipData);
const vData = foundry.utils.deepClone(vehSrc ?? { type: "vehicle", system: { speedBand: 3 } });
delete vData.folder;
vData.name = "craft-view AFV";
vData.system.crew = [crew.uuid];
vData.system.currentSpeed = vData.system.speedBand;
const veh = await Actor.create(vData);
await game.spacer.craft.damageVehicle(veh, 2, { location: "drive", chat: false });
await ship.sheet.render(true, { position: { left: 10, top: 10 } });
await veh.sheet.render(true, { position: { left: 790, top: 10 } });
await new Promise(r => setTimeout(r, 800));
return { ship: ship.name, vehicle: veh.name, fromPack: !!shipSrc && !!vehSrc };
