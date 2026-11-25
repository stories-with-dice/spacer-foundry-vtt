// Delete documents left by test/foundry/craft-view*.js: "craft-" actors and their chat messages.
const actors = game.actors.filter(a => a.name.startsWith("craft-"));
for (const a of actors) await a.delete();
const msgs = game.messages.filter(m => m.flags?.spacer?.craft || /^craft-/.test(m.speaker?.alias ?? ""));
if (msgs.length) await ChatMessage.deleteDocuments(msgs.map(m => m.id));
await game.settings.set("spacer", "craftCombat", {});
return { actors: actors.length, messages: msgs.length };
