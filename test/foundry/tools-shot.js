// Screenshot helper: generates a world journal (named "ToolsTest Shot") and a subsector, and opens
// the world page next to the Toolkit with all sections open. Run test/foundry/tools-cleanup.js after.
const T = game.spacer.tools;
const wait = ms => new Promise(r => setTimeout(r, ms));
const { journal } = await T.generateWorld({ name: "ToolsTest Shot", hex: "0305", chat: false });
const view = new URLSearchParams(location.search).get("view") ?? "";
for (const k of Object.keys(T.Toolkit.state.open)) T.Toolkit.state.open[k] = true;
const app = T.open();
await wait(400);
app.setPosition({ left: 20, top: 40, height: 940 });
await journal.sheet.render(true);
await wait(800);
journal.sheet.setPosition({ left: 440, top: 40, width: 720, height: 940 });
await wait(400);
return { uwp: journal.flags.spacer.world.line };
