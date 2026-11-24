// Smoke test: system loaded, data models registered, every actor and item type can be created.
if (game.system.id !== "spacer") throw new Error(`wrong system ${game.system.id}`);
const out = { system: game.system.version, actors: {}, items: {} };
for (const type of ["character", "npc", "creature", "vehicle", "ship"]) {
  const a = await Actor.create({ name: `Smoke ${type}`, type });
  out.actors[type] = { upp: a.system.upp ?? null, armor: a.system.armor?.total ?? null };
  await a.delete();
}
for (const type of ["skill", "weapon", "armor", "gear", "psionic", "drug", "shipWeapon"]) {
  const i = await Item.create({ name: `Smoke ${type}`, type });
  out.items[type] = i.id ? "ok" : "fail";
  await i.delete();
}
out.packs = game.packs.filter(p => p.metadata.packageName === "spacer").map(p => `${p.metadata.name}:${p.index.size}`);
return out;
