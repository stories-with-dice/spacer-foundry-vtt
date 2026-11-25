// Deletes the "SceneShot" / "SceneTest" scenes and journals left by test/foundry/scene-shot.js.
const names = s => s?.name?.startsWith("SceneShot") || s?.name?.startsWith("SceneTest");
const scenes = game.scenes.filter(s => names(s.flags.spacer?.subsector)).map(s => s.id);
const other = game.scenes.find(s => !scenes.includes(s.id));
if (scenes.includes(canvas.scene?.id) && other) await other.view();
if (scenes.length) await Scene.deleteDocuments(scenes);
const sf = game.folders.find(f => f.type === "Scene" && f.name === "Spacer: Subsectors");
if (sf && !sf.contents.length && !sf.children.length) await sf.delete();
const ids = game.journal.filter(j => j.name.startsWith("SceneShot") || j.name.startsWith("SceneTest") || j.folder?.name?.startsWith("SceneShot") || j.folder?.name?.startsWith("SceneTest")).map(j => j.id);
for (const app of foundry.applications.instances.values()) if (app.document && ids.includes(app.document.id)) await app.close();
if (ids.length) await JournalEntry.deleteDocuments(ids);
for (const f of game.folders.filter(f => f.name.startsWith("SceneShot") || f.name.startsWith("SceneTest"))) await f.delete();
const root = game.folders.find(f => f.name === "Spacer: Worlds" && f.type === "JournalEntry");
if (root && !root.contents.length && !root.children.length) await root.delete();
return { scenes: scenes.length, journals: ids.length };
