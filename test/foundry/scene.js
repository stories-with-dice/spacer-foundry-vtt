// Subsector scene test: generates a subsector, creates its scene through the API, the chat card
// button, and the overview journal header control, checks the scene, and deletes everything it
// created. Test documents are named "SceneTest ...". The uploaded background stays in
// worlds/<world>/spacer/subsector-scenetest-subsector.* (same file every run).
// For a screenshot of a kept scene use test/foundry/scene-shot.js, then test/foundry/scene-cleanup.js.
const T = game.spacer?.tools;
if (!T) throw new Error("game.spacer.tools missing");
const wait = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { throw new Error(msg); };
const NAME = "SceneTest Subsector";
const out = {};
const previousScene = canvas.scene?.id ?? null;
const created = { journals: [], folders: [] };
const scenesOf = () => game.scenes.filter(s => s.flags.spacer?.subsector?.name === NAME);
const until = async (test, ms = 8000) => { for (let t = 0; t < ms && !test(); t += 100) await wait(100); return test(); };

try {
  if (typeof T.createSubsectorScene !== "function") fail("tools.createSubsectorScene missing");
  const chatStart = Date.now();
  const sub = await T.generateSubsector({ name: NAME, density: "dense" });
  created.folders.push(sub.folder.id);
  created.journals.push(...sub.journals.map(j => j.id), sub.overview.id);
  const worlds = sub.subsector.worlds;

  // 1. API.
  const scene = await T.createSubsectorScene(sub.overview);
  if (scene.name !== `Subsector: ${NAME}`) fail(`scene name ${scene.name}`);
  if (scene.folder?.name !== "Spacer: Subsectors") fail("scene folder");
  if (scene.flags.spacer?.subsector?.worlds?.length !== worlds.length) fail("flags.spacer.subsector");
  if (scene.grid.type !== CONST.GRID_TYPES.HEXEVENQ || scene.grid.distance !== 1 || scene.grid.units !== "pc") fail(`grid ${JSON.stringify(scene.grid)}`);
  const worldNotes = scene.notes.filter(n => n.flags.spacer?.subsectorPart === "world");
  if (worldNotes.length !== worlds.length) fail(`world notes ${worldNotes.length} != ${worlds.length}`);
  for (const n of worldNotes) {
    const j = game.journal.get(n.entryId);
    if (!j || j.flags.spacer?.world?.name !== n.flags.spacer.world || j.folder?.id !== sub.folder.id) fail(`note ${n.flags.spacer.world} not linked to its journal`);
    if (!n.texture.src.startsWith("modules/game-icons-net/whitetransparent/")) fail(`note icon ${n.texture.src}`);
    // The note sits in the hex of its world (Foundry's own grid math).
    const w = worlds.find(x => x.name === n.flags.spacer.world);
    const off = scene.grid.getOffset({ x: n.x, y: n.y + 16 });
    if (off.j !== w.col || off.i !== w.row) fail(`note ${w.name} ${w.hex} in grid hex i${off.i} j${off.j}`);
  }
  const amber = worlds.filter(w => w.zone === "A").map(w => w.name);
  if (amber.length && !worldNotes.filter(n => amber.includes(n.flags.spacer.world)).every(n => n.texture.tint.css === "#ffb020")) fail("amber tint");
  const markers = scene.notes.filter(n => n.flags.spacer?.subsectorPart === "marker");
  const bases = worlds.reduce((t, w) => t + w.bases.length, 0);
  if (markers.filter(n => n.flags.spacer.marker === "base").length !== bases) fail("base markers");
  if (markers.filter(n => n.flags.spacer.marker === "capital").length !== 1) fail("capital marker");
  const part = k => scene.drawings.filter(d => d.flags.spacer?.subsectorPart === k);
  if (part("ring").length !== worlds.length || part("label").length !== worlds.length || part("starport").length !== worlds.length) fail("world drawings");
  const routes = part("route");
  const hubs = worlds.filter(w => w.population >= 6);
  if (hubs.length >= 2 && hubs.some(a => hubs.some(b => a !== b && Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1)) && !routes.length) fail("no routes between neighbouring population 6+ worlds");
  for (const r of routes) if (r.shape.type !== "p" || r.shape.points.length !== 4) fail("route shape");
  const src = (scene.levels ? scene.firstLevel?.background?.src : scene.background?.src) ?? null;
  if (!src?.includes("subsector-scenetest-subsector")) fail(`background ${src}`);
  const head = await fetch(src, { method: "HEAD" });
  if (!head.ok) fail(`background HEAD ${head.status}`);
  out.scene = { worlds: worldNotes.length, markers: markers.length, routes: routes.length, drawings: scene.drawings.size, background: src };

  // The scene is viewed, with the notes layer on.
  await until(() => canvas.ready && canvas.scene?.id === scene.id);
  if (canvas.scene?.id !== scene.id) fail("scene not viewed");
  await wait(500);
  if (!canvas.notes.active && !game.settings.get("core", "notesDisplayToggle")) fail("notes layer not shown");

  // 2. Chat card button: replaces the scene.
  const msg = game.messages.contents.filter(m => m.flags?.spacer?.tools?.kind === "subsector" && m.timestamp >= chatStart).at(-1);
  const btn = msg && document.querySelector(`#chat [data-message-id="${msg.id}"] [data-action="tools-subsector-scene"]`);
  if (!btn) fail("chat card button missing");
  if (!btn.textContent.includes(game.i18n.localize("SPACER.Tools.Scene.Create")) || btn.textContent.includes("SPACER.")) fail("chat card button label");
  btn.click();
  await until(() => scenesOf().length === 1 && scenesOf()[0].id !== scene.id);
  if (scenesOf().length !== 1 || scenesOf()[0].id === scene.id) fail("chat button did not replace the scene");

  // 3. Overview journal header control.
  await sub.overview.sheet.render(true);
  await until(() => sub.overview.sheet.rendered);
  const control = [...sub.overview.sheet._headerControlButtons()].find(c => c.action === "spacerSubsectorScene");
  if (!control) fail("journal header control missing");
  const before = scenesOf()[0].id;
  await control.onClick(new Event("click"));
  await until(() => scenesOf().length === 1 && scenesOf()[0].id !== before);
  if (scenesOf()[0]?.id === before) fail("header control did not replace the scene");
  await sub.overview.sheet.close();
  out.final = scenesOf()[0].id;

  // 4. Toolkit button (rendered for the GM; not clicked: it uses the current world's subsector).
  const kit = T.open();
  await until(() => kit.rendered);
  if (!kit.element.querySelector('[data-action="subsectorScene"]')) fail("toolkit button missing");
  await kit.close();
  await wait(1500);
} finally {
  {
    const ids = scenesOf().map(s => s.id);
    if (previousScene && game.scenes.get(previousScene)) await game.scenes.get(previousScene).view();
    if (ids.length) await Scene.deleteDocuments(ids);
    const folder = game.folders.find(f => f.type === "Scene" && f.name === "Spacer: Subsectors");
    if (folder && !folder.contents.length && !folder.children.length) await folder.delete();
    for (const app of foundry.applications.instances.values()) if (app.document && created.journals.includes(app.document.id)) await app.close();
    await JournalEntry.deleteDocuments(created.journals.filter(id => game.journal.get(id)));
    for (const id of created.folders) await game.folders.get(id)?.delete();
    const root = game.folders.find(f => f.name === "Spacer: Worlds" && f.type === "JournalEntry");
    if (root && !root.contents.length && !root.children.length) await root.delete();
  }
}
return out;
