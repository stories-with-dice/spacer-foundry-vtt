// Screenshot helper: zooms the viewed subsector scene (from scene-shot.js) to its top-left quarter.
const wait = ms => new Promise(r => setTimeout(r, ms));
const scene = game.scenes.find(s => s.flags.spacer?.subsector?.name?.startsWith("SceneShot"));
if (!scene) throw new Error("run scene-shot.js first");
if (canvas.scene?.id !== scene.id) await scene.view();
for (let t = 0; t < 8000 && !(canvas.ready && canvas.scene?.id === scene.id); t += 100) await wait(100);
await wait(1000);
document.getElementById("pause")?.style.setProperty("display", "none");
document.querySelectorAll("#notifications > *").forEach(e => e.remove());
await canvas.animatePan({ x: 620, y: 700, scale: 1, duration: 0 });
await wait(1500);
return { notesActive: canvas.notes.active };
