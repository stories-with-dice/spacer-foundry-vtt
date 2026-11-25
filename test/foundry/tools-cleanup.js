// Deletes "ToolsTest" documents left by test/foundry/tools-shot.js.
const ids = game.journal.filter(j => j.name.startsWith("ToolsTest")).map(j => j.id);
for (const app of foundry.applications.instances.values()) if (app.document && ids.includes(app.document.id)) await app.close();
if (ids.length) await JournalEntry.deleteDocuments(ids);
for (const f of game.folders.filter(f => f.name.startsWith("ToolsTest"))) await f.delete();
const root = game.folders.find(f => f.name === "Spacer: Worlds" && f.type === "JournalEntry");
if (root && !root.contents.length && !root.children.length) await root.delete();
return { deleted: ids.length };
