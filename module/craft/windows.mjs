/**
 * Openers for the craft windows. The apps load on first use (dynamic import), so the sheets do
 * not pull them in at init.
 */

/**
 * Open the starship construction wizard (book p.74-78). Called by the ship sheet and macros.
 * @param {object} [options]  ApplicationV2 options; `design` pre-fills the wizard
 * @returns {Promise<Application>} the rendered wizard
 */
export async function openConstruction(options = {}) {
  const { ConstructionWizard } = await import("./apps/construction.mjs");
  const app = new ConstructionWizard(options);
  await app.render(true);
  return app;
}

/**
 * Open the space combat helper (book p.84-87) and add ships to it. There is one helper window.
 * Called by the ship sheet and macros.
 * @param {{ships?: Array<Actor|string>}} [o]
 * @returns {Promise<Application>} the rendered helper
 */
export async function openSpaceCombat({ ships = [] } = {}) {
  const { SpaceCombatApp } = await import("./apps/space-combat.mjs");
  const app = SpaceCombatApp.instance ?? new SpaceCombatApp();
  for (const s of ships) await app.addShip(s);
  await app.render(true);
  return app;
}

/**
 * Create a ship actor from a construction design, without the UI (book p.74-78).
 * @param {object} design  see rules/construction.mjs computeDesign
 * @param {{folder?: string|null}} [opts]
 * @returns {Promise<Actor|null>} null when the design is not valid
 */
export async function buildShip(design, opts) {
  const { ConstructionWizard } = await import("./apps/construction.mjs");
  return ConstructionWizard.build(design, opts);
}
