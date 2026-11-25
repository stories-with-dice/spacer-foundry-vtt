// Tools smoke test: opens the Toolkit, runs every generator once, checks the created documents,
// and deletes everything it created. Test documents are named "ToolsTest ...".
const T = game.spacer?.tools;
if (!T) throw new Error("game.spacer.tools missing");
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = {};
const start = Date.now();
const created = { actors: [], journals: [], folders: [] };
const foldersBefore = new Set(game.folders.map(f => f.id));
const savedSettings = {
  toolsClock: foundry.utils.deepClone(game.settings.get("spacer", "toolsClock")),
  toolsWorld: game.settings.get("spacer", "toolsWorld"),
  toolsPlanetside: foundry.utils.deepClone(game.settings.get("spacer", "toolsPlanetside"))
};
const fail = msg => { throw new Error(msg); };

try {
  // API surface.
  const fns = ["open", "generateWorld", "generateSubsector", "generatePatron", "generateNpc", "randomNpc", "rumours", "demeanour",
    "generateAnimal", "starportEncounter", "settlementEncounter", "spaceEncounter", "shipReaction", "planetsideEncounter", "weather",
    "travel", "survival", "rations", "trade", "freight", "passengers", "mail", "oracle", "randomEvent"];
  for (const f of fns) if (typeof T[f] !== "function") fail(`tools.${f} is not a function`);
  for (const f of ["get", "advance", "set", "format"]) if (typeof T.clock[f] !== "function") fail(`tools.clock.${f} missing`);

  // Sidebar buttons.
  out.sidebar = {
    actors: !!document.querySelector("#actors .spacer-tools-open"),
    journal: !!document.querySelector("#journal .spacer-tools-open")
  };
  if (!out.sidebar.actors || !out.sidebar.journal) fail(`sidebar buttons missing ${JSON.stringify(out.sidebar)}`);

  // Toolkit.
  const app = T.open();
  await wait(500);
  if (!app.rendered || !app.element.classList.contains("spacer")) fail("toolkit not rendered with class spacer");

  // World + journal.
  const { world, journal } = await T.generateWorld({ name: "ToolsTest World", hex: "0204" });
  created.journals.push(journal.id);
  if (journal.folder?.name !== "Spacer: Worlds") fail("world journal not in Spacer: Worlds");
  const flag = journal.flags.spacer?.world;
  if (!flag || flag.uwp !== world.uwp || !/^[ABCDEX][0-9A-G]{6}-[0-9A-G]$/.test(flag.uwp)) fail(`bad world flag ${flag?.uwp}`);
  if (!journal.pages.contents[0].text.content.includes(world.uwp)) fail("world page has no UWP");
  out.world = flag.line;
  await T.setCurrentWorld(journal.id);
  await wait(200);

  // Subsector.
  const sub = await T.generateSubsector({ name: "ToolsTest Subsector", density: "dense" });
  created.folders.push(sub.folder.id);
  created.journals.push(...sub.journals.map(j => j.id), sub.overview.id);
  if (sub.folder.folder?.name !== "Spacer: Worlds") fail("subsector folder not under Spacer: Worlds");
  if (sub.journals.length !== sub.subsector.worlds.length) fail("one journal per world expected");
  if (!sub.journals.every(j => j.flags.spacer.world?.subsector === "ToolsTest Subsector")) fail("subsector flag missing");
  if (!sub.journals.every(j => j.flags.spacer.world?.popDMs?.capitalInSubsector === 2 && j.flags.spacer.world.popDMs.dense === 1)) fail("subsector population DMs missing (p.92)");
  if (sub.journals.filter(j => j.flags.spacer.world.capital).length !== 1) fail("subsector needs exactly one capital");
  out.subsector = { worlds: sub.journals.length, capital: sub.subsector.capital };

  // Patron, NPCs, animal.
  const p = await T.generatePatron({ location: "elite" });
  if (!p.patron.name || p.patron.code < 61) fail("elite patron out of range");
  const n = await T.generateNpc({ create: true });
  created.actors.push(n.actor.id);
  if (n.actor.type !== "npc" || n.actor.system.characteristics.str.max !== n.characteristics.str) fail("npc actor characteristics");
  if (n.actor.folder?.name !== "Spacer: NPCs") fail("npc folder");
  const rn = await T.randomNpc({ range: "61-66", create: true });
  created.actors.push(rn.actor.id);
  if (rn.actor.system.characteristics.end.max !== rn.hits) fail("random npc hits");
  await T.rumours();
  await T.demeanour();
  const a = await T.generateAnimal({ terrain: "forest", create: true });
  created.actors.push(a.actor.id);
  if (a.actor.type !== "creature" || a.actor.system.hits.max !== a.hits) fail("creature actor");
  out.animal = `${a.actor.name} (${a.sizeLabel}, ${a.hits} hits)`;
  out.npc = `${n.actor.name} ${n.actor.system.upp}`;

  // Encounters.
  out.starport = (await T.starportEncounter()).text;
  out.settlement = (await T.settlementEncounter({ checkLegal: true })).text;
  out.space = (await T.spaceEncounter({ location: "highport", force: true })).result?.text;
  await T.shipReaction({ scanning: true, militarySensors: true });
  const wx = await T.weather({ zone: "temperate" });
  out.weather = `${wx.type}: ${wx.detail}`;
  await T.travel({ terrain: "forest" });
  out.planetside = (await T.planetsideEncounter({ terrain: "forest", force: true })).type?.label;
  await T.freight();
  await T.passengers();
  await T.mail();
  await T.rations({ people: 2, days: 3 });
  out.oracle = (await T.oracle({ question: "Is the dock guarded?", likelihood: "likely" })).answer;
  await T.randomEvent();

  // Survival with an actor (task roll through rollTask).
  const before = T.clock.get().seconds;
  const s = await T.survival("hunting", { actor: n.actor, terrain: "forest" });
  if (typeof s.task.total !== "number") fail("survival task");
  if (T.clock.get().seconds - before !== 6 * 3600) fail("survival did not advance the clock 6 h");

  // Clock: month boundary posts reminders.
  await T.clock.set({ seconds: 29 * 86400 });
  const adv = await T.clock.advance("1w");
  if (!adv.months.length) fail("month boundary not detected");
  await T.clock.advance("1Dd");
  out.clock = T.clock.format();

  // Chat card button: create an NPC actor from a card.
  const npcStart = Date.now();
  await T.generateNpc();
  await wait(500);
  const msg = game.messages.contents.filter(m => m.flags?.spacer?.tools?.kind === "npc" && m.timestamp >= npcStart && m.author?.id === game.user.id).at(-1);
  if (!msg) fail("npc card message missing");
  const btn = document.querySelector(`#chat [data-message-id="${msg.id}"] [data-action="tools-create-npc"]`);
  if (!btn) fail("card button not rendered");
  const actorsBefore = new Set(game.actors.map(x => x.id));
  btn.click();
  for (let i = 0; i < 20 && game.actors.size === actorsBefore.size; i++) await wait(100);
  const fromCard = game.actors.find(x => !actorsBefore.has(x.id));
  if (!fromCard) fail("card button created no actor");
  created.actors.push(fromCard.id);
  await wait(300);
  fromCard.sheet?.close();

  // World card button: "Open journal" (tools-open) through the shared chat actions.
  const worldStart = Date.now();
  await T.generateWorld({ name: "ToolsTest Button", hex: "0101", create: false });
  await wait(500);
  const wmsg = game.messages.contents.filter(m => m.flags?.spacer?.tools?.kind === "world" && m.timestamp >= worldStart && m.author?.id === game.user.id).at(-1);
  const wbtn = wmsg && document.querySelector(`#chat [data-message-id="${wmsg.id}"] [data-action="tools-create-world"]`);
  if (!wbtn) fail("world card button not rendered");
  wbtn.click();
  let wj = null;
  for (let i = 0; i < 20 && !wj; i++) { await wait(100); wj = game.journal.find(j => j.name === "ToolsTest Button"); }
  if (!wj?.flags.spacer?.world) fail("world card button created no journal");
  created.journals.push(wj.id);
  await wait(300);
  wj.sheet?.close();

  // Toolkit buttons.
  app.render({ force: true });
  await wait(300);
  for (const action of ["patron", "space", "animal", "oracle", "weather"]) {
    app.element.querySelector(`[data-action="${action}"]`).click();
    await wait(300);
  }
  app.element.querySelector('[data-action="advance"][data-interval="10m"]').click();
  await wait(300);

  // Trade calculator.
  T.trade();
  await wait(500);
  const tc = foundry.applications.instances.get("spacer-trade");
  if (!tc?.rendered) fail("trade calculator not rendered");
  tc.state.origin = journal.id;
  tc.state.destination = sub.journals[0].id;
  await tc.render({ force: true });
  await wait(200);
  tc.element.querySelector('[data-action="rollGoods"]').click();
  await wait(500);
  const originPop = journal.flags.spacer.world.population;
  const expectedGoods = 6 + Math.max(0, originPop - 6);
  if (tc.goods.length < expectedGoods || tc.goods.length > expectedGoods + 1) fail(`goods on offer ${tc.goods.length}, expected ${expectedGoods} (+1 extra) for population ${originPop} (p.63)`);
  out.goods = tc.goods.length;
  const buy = tc.element.querySelector('[data-action="buy"]');
  if (!buy) fail("no goods listed");
  buy.click();
  await wait(400);
  tc.element.querySelector('[data-action="sell"]').click();
  await wait(400);
  tc.element.querySelector('[data-action="negotiate"]').click();
  await wait(400);
  tc.element.querySelector('[data-action="findSupplier"]').click();
  await wait(400);
  out.trade = tc.last ? `${tc.last.name} ${tc.last.percent}%` : "none";
  await tc.close();

  out.messages = game.messages.filter(m => m.flags?.spacer?.tools && m.timestamp >= start).length;
} finally {
  // Cleanup: messages from this run, documents, folders, settings.
  const msgs = game.messages.filter(m => m.timestamp >= start && m.author?.id === game.user.id && (m.flags?.spacer?.tools || (m.flags?.spacer?.task && /Hunting \(|Supplier/.test(m.flavor ?? "")))).map(m => m.id);
  if (msgs.length) await ChatMessage.deleteDocuments(msgs);
  for (const app of foundry.applications.instances.values()) {
    if (app.document && (created.actors.includes(app.document.id) || created.journals.includes(app.document.id))) await app.close();
  }
  const extraActors = game.actors.filter(x => created.actors.includes(x.id)).map(x => x.id);
  if (extraActors.length) await Actor.deleteDocuments(extraActors);
  const js = game.journal.filter(j => created.journals.includes(j.id)).map(j => j.id);
  if (js.length) await JournalEntry.deleteDocuments(js);
  for (const id of created.folders) await game.folders.get(id)?.delete();
  for (const name of ["Spacer: NPCs", "Spacer: Animals", "Spacer: Patrons", "Spacer: Worlds"]) {
    for (const f of game.folders.filter(x => x.name === name && !foldersBefore.has(x.id))) {
      if (!f.contents.length && !f.children.length) await f.delete();
    }
  }
  for (const [k, v] of Object.entries(savedSettings)) await game.settings.set("spacer", k, v);
  out.cleanup = { messages: msgs.length, actors: extraActors.length, journals: js.length };
}
// Leave the Toolkit open for the screenshot.
T.open();
await wait(500);
return out;
