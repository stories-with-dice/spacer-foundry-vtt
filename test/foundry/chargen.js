// Chargen smoke test: the directory button, the wizard fast path, and the data written to the actor.
if (!game.spacer?.chargen?.open) throw new Error("game.spacer.chargen.open missing");
const out = {};
await ui.actors.render({ force: true });
await new Promise(r => setTimeout(r, 300));
out.directoryButton = !!document.querySelector(`#actors [data-spacer-button="chargen-create"]`);
if (!out.directoryButton) throw new Error("Create Spacer button missing in the Actors directory");

for (const a of game.actors.filter(a => a.name === "chargen-test")) await a.delete();
const actor = await Actor.create({ name: "chargen-test", type: "character" });
const app = game.spacer.chargen.open(actor);
await new Promise(r => setTimeout(r, 500));
if (!app.rendered) throw new Error("wizard did not render");
out.firstStep = app.lifepath.pending.id;
// Turn on events and psionics, roll characteristics by hand, then the fast path.
app.element.querySelector('[data-action="choose"][data-value="yes"]').click();
await new Promise(r => setTimeout(r, 200));
app.element.querySelector('[data-action="choose"][data-value="yes"]').click();
await new Promise(r => setTimeout(r, 200));
app.element.querySelector('[data-action="roll"]').click();
await new Promise(r => setTimeout(r, 200));
out.upp = app.lifepath.state.rolled && Object.values(app.lifepath.state.rolled).join(",");
app.element.querySelector('[data-action="fast"]').click();
await new Promise(r => setTimeout(r, 500));
if (!app.lifepath.done) throw new Error(`fast path did not finish: ${app.lifepath.pending.type}`);
const state = app.lifepath.state;
const messagesBefore = game.messages.size;
await app.save({ confirm: false });
await new Promise(r => setTimeout(r, 300));

const sys = actor.system;
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
check(sys.chargenComplete === true, "chargenComplete not set");
for (const k of ["str", "dex", "end", "int", "edu", "soc"]) {
  check(sys.characteristics[k].max === state.chars[k] && sys.characteristics[k].value === state.chars[k], `characteristic ${k}`);
}
check(sys.age === state.age, "age");
check(sys.terms === state.terms, "terms");
check(sys.careers.length === state.careers.length, "careers");
check(sys.credits === state.credits, "credits");
check(sys.history.includes("Lifepath"), "history");
const skills = actor.items.filter(i => i.type === "skill");
check(skills.length === Object.keys(state.skills).length, `skills ${skills.length} vs ${Object.keys(state.skills).length}`);
for (const i of skills) check(state.skills[i.system.specialty ? `${i.system.skill} (${i.system.specialty})` : i.system.skill] === i.system.rank, `skill rank ${i.name}`);
const fromPack = skills.filter(i => i._stats?.compendiumSource).length;
check(game.messages.size === messagesBefore + 1, "chat card");
const msg = game.messages.contents.at(-1);
out.chat = msg.content.includes("chargen-test");

// A scripted run writes items for benefits (Merchant Ship, passages, weapons).
const lp = new game.spacer.chargen.engine.Lifepath({ dice: game.spacer.chargen.engine.seededDice(3) });
lp.autoRun();
await game.spacer.chargen.applyToActor(actor, lp.state);
const benefitItems = actor.items.filter(i => i.type !== "skill").map(i => `${i.type}:${i.name}`);

out.actor = {
  upp: sys.upp, age: sys.age, terms: sys.terms, credits: sys.credits, pension: sys.pension,
  careers: sys.careers.map(c => `${c.career} ${c.terms}${c.rankTitle ? ` ${c.rankTitle}` : ""}`),
  skills: skills.map(i => `${i.name} ${i.system.rank}`), skillsFromPack: fromPack, benefitItems
};
await msg.delete();
await app.render();
await actor.delete();
return out;
