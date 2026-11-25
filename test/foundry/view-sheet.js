// Visual check: a character made by the lifepath engine, its sheet on the Skills tab, and the Toolkit.
for (const a of game.actors.filter(a => a.name === "View Test")) await a.delete();
const pc = await Actor.create({ name: "View Test", type: "character" });
const app = await game.spacer.chargen.open(pc);
await new Promise(r => setTimeout(r, 800));
const fast = app.element.querySelector('[data-action="fast"]');
fast?.click();
await new Promise(r => setTimeout(r, 1500));
app.element.querySelector('[data-action="save"]')?.click();
await new Promise(r => setTimeout(r, 2000));
await app.close();
const weapon = (await game.packs.get("spacer.weapons").getDocuments()).find(w => w.name === "Auto Pistol");
const armor = (await game.packs.get("spacer.armor").getDocuments()).find(w => w.name === "Mesh");
await pc.createEmbeddedDocuments("Item", [weapon.toObject(), { ...armor.toObject(), system: { ...armor.toObject().system, equipped: true } }]);
await pc.sheet.render({ force: true });
await new Promise(r => setTimeout(r, 800));
game.spacer.tools.open();
await new Promise(r => setTimeout(r, 800));
return { upp: pc.system.upp, skills: pc.items.filter(i => i.type === "skill").length, armor: pc.system.armor.total };
