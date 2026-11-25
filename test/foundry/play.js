// Play area smoke test: documents, sheets, task roll, attack, damage, healing, psionics, drugs, combat hooks.
// Body of an async function run in the page by tools/foundry-run.mjs.
const play = game.spacer?.play;
if (!play) throw new Error("game.spacer.play missing");
const assert = (cond, msg) => { if (!cond) throw new Error(`assert failed: ${msg}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Fix every die: Foundry and the shared randomDie both map u to ceil((1 - u) * faces)
// (u = 0 -> 6, 0.5 -> 3, 0.99 -> 1).
async function withDice(u, fn) {
  const old = CONFIG.Dice.randomUniform;
  CONFIG.Dice.randomUniform = () => u;
  try { return await fn(); } finally { CONFIG.Dice.randomUniform = old; }
}
const started = Date.now();
const out = {};

for (const a of game.actors.filter(a => a.name.startsWith("Play Test"))) await a.delete();
assert(CONFIG.Actor.documentClass.name === "SpacerActor", "SpacerActor registered");
assert(CONFIG.Item.documentClass.name === "SpacerItem", "SpacerItem registered");

const chars = v => Object.fromEntries(["str", "dex", "end", "int", "edu", "soc"].map((k, i) => [k, { value: v[i], max: v[i] }]));
const pc = await Actor.create({ name: "Play Test PC", type: "character", system: { characteristics: chars([8, 9, 7, 8, 9, 7]), psi: { value: 6, max: 6 } } });
await pc.createEmbeddedDocuments("Item", [
  { name: "Ranged Combat", type: "skill", system: { skill: "Ranged Combat", rank: 0 } },
  { name: "Ranged Combat (Short)", type: "skill", system: { skill: "Ranged Combat", specialty: "Short", rank: 1 } },
  { name: "Melee Combat", type: "skill", system: { skill: "Melee Combat", rank: 0 } },
  { name: "Medic", type: "skill", system: { skill: "Medic", rank: 1 } },
  { name: "Auto Pistol", type: "weapon", system: { category: "short", skill: "Ranged Combat", specialty: "Short", damage: "2D", range: "medium", rounds: 12, traits: ["Auto 2"], equipped: true, weight: 0.75 } },
  { name: "Sword", type: "weapon", system: { category: "melee", skill: "Melee Combat", specialty: "Blade", damage: "2D", range: "short", traits: ["Bladed", "One-Handed"], weight: 1 } },
  { name: "Mesh", type: "armor", system: { difficulty: 10, weight: 3, wornWeight: 1.5, equipped: true } },
  { name: "Life Detection", type: "psionic", system: { discipline: "telepathy", level: 1, psiCost: "1+" } },
  { name: "PSI-Boost", type: "drug", system: { doses: 2, effect: "+3 PSI for one hour" } },
  { name: "Rope", type: "gear", system: { weight: 2, quantity: 1 } }
]);
const pistol = pc.items.getName("Auto Pistol");
const sword = pc.items.getName("Sword");
assert(pistol.system.ammo === 12, `weapon starts loaded (${pistol.system.ammo})`);
assert(play.skillRank(pc, "Ranged Combat", "Short") === 1, "specialty rank");
assert(play.skillRank(pc, "Ranged Combat", "Energy") === 0, "base rank covers specialties");
assert(play.skillRank(pc, "Pilot") === -3, "untrained");
assert(pc.system.armor.total === 10, `armour total ${pc.system.armor.total}`);
out.encumbrance = pc.system.encumbrance;

// Sheet: render every tab.
await pc.sheet.render({ force: true });
await wait(400);
for (const tab of ["skills", "gear", "combat", "psionics", "career", "bio", "main"]) { pc.sheet.changeTab(tab, "primary"); await wait(50); }
assert(pc.sheet.element.querySelectorAll(".sp-char").length >= 6, "characteristics rendered");
assert(pc.sheet.element.querySelector("[data-action='attack']"), "attack button rendered");

// Task roll through the API and through the dialog.
const task = await play.rollTask({ actor: pc, characteristic: "edu", skill: "Medic", label: "Play Test task" });
assert(typeof task.effect === "number" && task.message, "rollTask posts a card");
const pending = play.taskDialog(pc, { characteristic: "dex", skill: "Ranged Combat (Short)" });
await wait(400);
const rollBtn = document.querySelector(".spacer-dialog button[data-action='roll']");
assert(rollBtn, "task dialog rendered");
assert(/to succeed/.test(document.querySelector(".spacer-dialog [data-preview]").textContent), "task preview");
rollBtn.click();
const dlgResult = await pending;
assert(dlgResult && typeof dlgResult.total === "number", "task dialog rolls");

// Attack a token-less NPC with the pistol, through the dialog.
const npc = await Actor.create({ name: "Play Test NPC", type: "npc", system: { characteristics: chars([7, 7, 7, 7, 7, 7]), combat: { position: "kneeling", cover: "partial" } } });
const ctx = play.prepareAttack(pc, pistol, { target: npc, rangeBand: "medium" });
const calc = play.computeAttack(ctx, { characteristic: "dex", band: "medium", aimed: true, position: "kneeling", cover: "partial", autoMode: "single" });
// DEX 9 (+1), Short 1, medium pistol at medium +0, kneeling -1, partial behind kneeling = half -2.
assert(calc.total === 1 + 1 - 1 - 2, `attack DM ${calc.total}`);
assert(calc.difficulty === 8, "unarmoured NPC is 8+");
const atkPending = play.attack(pc, pistol, { target: npc, rangeBand: "medium" });
await wait(400);
const atkBtn = document.querySelector(".spacer-attack-dialog button[data-action='attack']");
assert(atkBtn, "attack dialog rendered");
assert(/to hit/.test(document.querySelector(".spacer-attack-dialog [data-preview]").textContent), "attack preview");
atkBtn.click();
const atk = await atkPending;
assert(atk && typeof atk.hit === "boolean", "attack resolves");
assert(pistol.system.ammo === 10 || pistol.system.jammed, `Auto 2 spends 2 rounds (${pistol.system.ammo})`);
out.attack = { hit: atk.hit, total: atk.total, difficulty: atk.difficulty, damage: atk.damage };

// Melee attack without a dialog spends a melee use.
await pistol.update({ "system.jammed": false });
const melee = await play.attack(pc, sword, { target: npc, rangeBand: "short", dialog: false });
assert(melee, "melee attack resolves");
assert(pc.system.combat.meleeUsed === 1 || sword.system.broken, "melee use spent");

// Damage: END first, then split, with a fixed 1D (odd -> extra point to STR).
const dmg = await play.applyDamage(npc, 10, { roll1d: () => 1, source: "Play Test" });
assert(npc.system.characteristics.end.value === 0, "END to 0");
assert(npc.system.characteristics.str.value === 5 && npc.system.characteristics.dex.value === 6, `split ${JSON.stringify(dmg.after)}`);
assert(npc.system.injury.label === "wounded", "wounded");
await wait(300);
assert(npc.statuses.has("wounded"), "wounded status set");
await play.applyDamage(npc, 3, { roll1d: () => 2 });
assert(npc.system.characteristics.dex.value === 3, "later hit to DEX on even");
out.npcAfter = npc.system.uppCurrent;

// Chat card button applies damage to the card's target.
const card = game.messages.contents.findLast(m => m.flags?.spacer?.attack);
if (card) out.card = { hit: card.flags.spacer.attack.hit, damage: card.flags.spacer.attack.damage };

// Ablat negates a 2D-6D hit and is destroyed.
const [ablat] = await npc.createEmbeddedDocuments("Item", [{ name: "Ablat", type: "armor", system: { difficulty: 9, traits: ["Absorbing"], equipped: true } }]);
const before = npc.system.characteristics.str.value;
const neg = await play.applyDamage(npc, 8, { dice: 3 });
assert(neg.negated && ablat.system.damaged && npc.system.characteristics.str.value === before, "Ablat negates");

// Fix 1 (p.49): a vehicle target is 8+, a personal weapon deals 1 damage, the card button goes to the craft area.
const car = await Actor.create({ name: "Play Test Car", type: "vehicle", system: { armor: 0, locations: {
  interior: { value: 6, max: 6 }, drive: { value: 3, max: 3 }, handling: { value: 8, max: 8 }, hull: { value: 8, max: 8 }, weapon: { value: 0, max: 0 } } } });
assert(play.targetDifficulty(car) === 8, `vehicle difficulty ${play.targetDifficulty(car)}`);
await pistol.update({ "system.jammed": false, "system.ammo": 12 });
const carAtk = await withDice(0.5, () => play.attack(pc, pistol, { target: car, rangeBand: "medium", dialog: false, options: { dm: 20 } }));
assert(carAtk.hit && carAtk.difficulty === 8 && carAtk.damage === 1, `vehicle attack ${JSON.stringify({ hit: carAtk.hit, d: carAtk.difficulty, dmg: carAtk.damage })}`);
assert(carAtk.message.flags.spacer.attack.craft === true, "card marks a craft target");
const locSum = a => Object.values(a.system.locations).reduce((t, l) => t + l.value, 0);
const carBefore = locSum(car);
const cardHtml = await carAtk.message.renderHTML();
Hooks.callAll("renderChatMessageHTML", carAtk.message, cardHtml, {});
const dmgBtn = cardHtml.querySelector("[data-action='play-damage']");
assert(dmgBtn, "apply damage button on the vehicle card");
await withDice(0.5, async () => { dmgBtn.click(); await wait(600); });
assert(locSum(car) === carBefore - 1 || car.system.destroyed, `vehicle took 1 damage (${carBefore} -> ${locSum(car)})`);
out.vehicle = { before: carBefore, after: locSum(car) };

// Fix 2 and 3 (p.33, p.42): a thrown Throw-trait dagger uses DEX + STR DM once; snake eyes breaks it.
const [dagger] = await pc.createEmbeddedDocuments("Item", [{ name: "Play Test Dagger", type: "weapon",
  system: { category: "melee", skill: "Melee Combat", specialty: "Blade", damage: "1D+2", range: "close", traits: ["Throw"], weight: 0.5 } }]);
const dctx = play.prepareAttack(pc, dagger, { target: npc, rangeBand: "short" });
const dcalc = play.computeAttack(dctx, { characteristic: "dex", band: "short", throw: true, aimed: true, position: "standing", cover: "none" });
assert(dcalc.thrown && dcalc.mods.filter(m => m.key === "thrown").length <= 1 && dcalc.rangeDM === 0, `thrown dagger ${JSON.stringify(dcalc.mods)}`);
const snake = await withDice(0.99, () => play.attack(pc, dagger, { target: npc, rangeBand: "short", dialog: false, options: { throw: true } }));
assert(snake.snakeEyes && !snake.hit, "snake eyes misses");
assert(dagger.system.broken && !dagger.system.jammed, `thrown blade breaks (broken ${dagger.system.broken}, jammed ${dagger.system.jammed})`);

// Fix 5 (p.14, p.42): boxcars hits with full damage even at -20 DM.
await sword.update({ "system.broken": false });
const box = await withDice(0, () => play.attack(pc, sword, { target: npc, rangeBand: "short", dialog: false, options: { dm: -20 } }));
assert(box.boxcars && box.hit && box.damageRoll && box.damageRoll.total >= 12, `boxcars full damage (${box.hit}, ${box.damageRoll?.total})`);
await sword.update({ "system.broken": false });

// Fix 8 (p.43): a short melee weapon at Close gets +1.
const sctx = play.prepareAttack(pc, sword, { target: npc, rangeBand: "close" });
assert(play.computeAttack(sctx, { characteristic: "dex", band: "close" }).rangeDM === 1, "melee +1 at Close");
assert(play.computeAttack(sctx, { characteristic: "dex", band: "medium" }).rangeDM === null, "melee blocked past its range");

// Fix 4 (p.41): an over-encumbered character cannot make melee attacks.
const [anvil] = await pc.createEmbeddedDocuments("Item", [{ name: "Play Test Anvil", type: "gear", system: { weight: 30, quantity: 1 } }]);
assert(["overEncumbered", "overloaded"].includes(pc.system.encumbrance.level), `encumbrance ${pc.system.encumbrance.level}`);
const usedBefore = pc.system.combat.meleeUsed;
const heavy = await play.attack(pc, sword, { target: npc, rangeBand: "short", dialog: false });
assert(heavy === null && pc.system.combat.meleeUsed === usedBefore, "over-encumbered melee is blocked");
await anvil.delete();

// Fix 7 (p.34): Reflec deflects energy hits of 2D-6D only.
await npc.items.getName("Ablat").update({ "system.equipped": false });
const [reflec] = await npc.createEmbeddedDocuments("Item", [{ name: "Reflec", type: "armor", system: { difficulty: 9, traits: ["Reflective"], equipped: true } }]);
const big = await play.applyDamage(npc, 0, { energy: true, dice: 8 });
assert(!big.negated && !reflec.system.damaged, "Reflec does not stop 8D");
const small = await play.applyDamage(npc, 0, { energy: true, dice: 3 });
assert(small.negated && reflec.system.damaged, "Reflec deflects 3D energy");

// Healing: first aid, natural healing.
await pc.update({ "system.characteristics.end.value": 0 });
await play.firstAid(pc, { healer: pc, dm: 20 });
assert(pc.system.characteristics.end.value === 1, "first aid restores 1 END");
await play.naturalHealing(pc, { days: 2 });
assert(pc.system.characteristics.end.value === 3, `natural healing (${pc.system.characteristics.end.value})`);

// Fix 6 (p.106, p.37): END and STR at 0 needs surgery; a Medical Kit gives D3 END.
await pc.update({ "system.characteristics.end.value": 0, "system.characteristics.str.value": 0 });
assert(await play.firstAid(pc, { healer: pc, dm: 20 }) === null, "first aid cannot help: surgery");
await pc.update({ "system.characteristics.str.value": 8 });
await pc.createEmbeddedDocuments("Item", [{ name: "Medical Kit", type: "gear", system: { weight: 1, quantity: 1 } }]);
assert(play.hasMedicalKit(pc), "healer carries a Medical Kit");
const aid = await withDice(0.5, () => play.firstAid(pc, { healer: pc, dm: 20 }));
assert(aid.success && aid.aid.roll === 2 && pc.system.characteristics.end.value === 2, `kit gives D3 END (${pc.system.characteristics.end.value})`);

// Creature: damage to hits, pinned status, attack.
const beast = await Actor.create({ name: "Play Test Beast", type: "creature", system: { hits: { value: 18, max: 18 }, damage: "2D+3", difficulty: 8 } });
await play.applyDamage(beast, 9);
assert(beast.system.hits.value === 9 && beast.system.injury.label === "pinned", "creature pinned");
const bite = await play.attack(beast, null, { target: pc, dialog: false });
assert(bite && bite.difficulty === pc.system.armor.total, "creature attacks against armour");

// Psionics and drugs.
const talent = pc.items.getName("Life Detection");
const use = await play.usePsionic(pc, talent, { dialog: false, band: "medium" });
assert(use.cost === 3 && pc.system.psi.value === 3, `psi cost ${use?.cost}`);
await play.recoverPsi(pc, 2);
assert(pc.system.psi.value === 5, "psi recovery");
await play.useDrug(pc, pc.items.getName("PSI-Boost"));
assert(pc.system.psi.value === 8 && pc.items.getName("PSI-Boost").system.doses === 1, "PSI-Boost");

// Morale and training.
const morale = await play.moraleCheck({ actors: [npc], dm: -2 });
assert(typeof morale.success === "boolean", "morale");

// Combat end resets counters.
const combat = await Combat.create({ scene: null });
await combat.createEmbeddedDocuments("Combatant", [{ actorId: pc.id }]);
await pc.update({ "system.combat.sprintUsed": 2, "system.combat.overwatch": 3 });
await combat.delete();
await wait(300);
assert(pc.system.combat.sprintUsed === 0 && pc.system.combat.meleeUsed === 0 && pc.system.combat.overwatch === 0, "counters reset on combat end");

// Other sheets and every item sheet.
for (const a of [npc, beast]) { await a.sheet.render({ force: true }); await wait(250); assert(a.sheet.rendered, `${a.type} sheet`); await a.sheet.close(); }
for (const type of ["skill", "weapon", "armor", "gear", "psionic", "drug", "shipWeapon"]) {
  const [it] = await pc.createEmbeddedDocuments("Item", [{ name: `Play Test ${type}`, type }]);
  await it.sheet.render({ force: true });
  await wait(150);
  assert(it.sheet.rendered, `${type} item sheet`);
  await it.sheet.close();
}
await pc.sheet.close();

// Clean up.
for (const a of [pc, npc, beast, car]) await a.delete();
const msgs = game.messages.filter(m => m.timestamp >= started && m.author?.id === game.user.id).map(m => m.id);
out.messages = msgs.length;
await ChatMessage.deleteDocuments(msgs);
out.ok = true;
return out;
