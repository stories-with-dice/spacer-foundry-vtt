/**
 * Pure task roll rules (book p.14, p.42). No Foundry globals: tested with node:test.
 */

/**
 * Outcome of a 2D task roll (p.14). With the optional absolute results (p.14, p.42), snake eyes
 * always fails and boxcars always succeeds. Called by rollTask in module/play/task.mjs and by the
 * attack workflow (module/play/attack.mjs).
 * @param {object} o
 * @param {number[]} o.faces       the two kept dice faces
 * @param {number} o.total         2D + every DM
 * @param {number} o.target        target number (8 for most tasks, armour difficulty for attacks)
 * @param {boolean} [o.absolute]   the absoluteResults world setting
 * @returns {{effect: number, success: boolean, boxcars: boolean, snakeEyes: boolean}}
 */
export function taskOutcome({ faces = [], total, target, absolute = false }) {
  const boxcars = faces.length === 2 && faces.every(f => f === 6);
  const snakeEyes = faces.length === 2 && faces.every(f => f === 1);
  const effect = total - target;
  let success = effect >= 0;
  // BOOK: p.14 says snake eyes brings a drawback "in addition to failure" and boxcars brings a
  // benefit; p.42 gives boxcars full damage. We read that as an automatic failure and success.
  if (absolute && snakeEyes) success = false;
  if (absolute && boxcars) success = true;
  return { effect, success, boxcars, snakeEyes };
}

/**
 * Chance in percent (0-100) that 2D + dm reaches the target. With absolute results, 2 always
 * fails and 12 always succeeds. Called by the task and attack dialogs for their preview line.
 */
export function chance2D(dm, target, { absolute = false } = {}) {
  let hits = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      if (taskOutcome({ faces: [a, b], total: a + b + dm, target, absolute }).success) hits++;
    }
  }
  return Math.round((hits / 36) * 100);
}
