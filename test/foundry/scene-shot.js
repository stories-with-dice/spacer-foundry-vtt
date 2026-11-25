// Screenshot helper: generates "SceneShot Subsector" and views its scene, fitted to the window.
// Run test/foundry/scene-cleanup.js after.
const T = game.spacer.tools;
const wait = ms => new Promise(r => setTimeout(r, ms));
const sub = await T.generateSubsector({ name: "SceneShot Subsector", density: "dense", chat: false });
const scene = await T.createSubsectorScene(sub.overview);
for (let t = 0; t < 8000 && !(canvas.ready && canvas.scene?.id === scene.id); t += 100) await wait(100);
await wait(1500);
const fit = Math.min((window.innerWidth - 320) / scene.dimensions.width, window.innerHeight / scene.dimensions.height);
await canvas.animatePan({ x: scene.dimensions.width / 2, y: scene.dimensions.height / 2, scale: fit, duration: 0 });
// Hide the pause banner and the notifications in the screenshot (page only, no world change).
document.getElementById("pause")?.style.setProperty("display", "none");
ui.notifications.clear?.();
document.querySelectorAll("#notifications > *").forEach(e => e.remove());
await wait(1500);
const w = sub.subsector.worlds;
return { worlds: w.length, lines: w.map(x => x.line), routes: scene.drawings.filter(d => d.flags.spacer?.subsectorPart === "route").length };
