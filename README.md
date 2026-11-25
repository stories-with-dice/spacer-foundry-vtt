# Spacer for Foundry VTT

An unofficial Foundry VTT game system for *Spacer: Interstellar Roleplaying in the Far Future*
(v1.03) by Bryan Larkin, published by Arcane Sword Press. It runs on Foundry v13 and v14.

The system automates most of the book: task rolls, combat and damage, the lifepath character
creation, starships and vehicles (damage, travel, finances, construction, space combat), and the
referee procedures (worlds, subsectors, patrons, NPCs, encounters, trade, weather, survival,
alien animals). A Toolkit and macros make solo play easy. The compendiums hold the full written
text of the book, every rollable table, and all the items, vehicles, and sample starships.

## Install

Copy or link this folder into your Foundry `Data/systems/spacer` folder, then run
`npm install && npm run build` to compile the compendium packs. `npm run link` links the repo
into the local v13 and v14 data folders.

## Licenses

- Program code: MIT, see `LICENSE`.
- Game content (`src/content/`, `packs/`): CC BY-SA 4.0, adapted from the book. See
  `LICENSE-CONTENT.md`. No book artwork is included.

This project is not affiliated with Arcane Sword Press.

## Development

- `npm test` runs the rules tests (`node:test`).
- `npm run build` compiles `src/content/` into `packs/` (format: `docs/content-format.md`).
- `node tools/foundry-server.mjs start --v 13` and
  `node tools/foundry-run.mjs --v 13 --script test/foundry/smoke.js` run the browser tests.
  Run one server at a time: both link to the same `packs/` folder.
- Code layout and rules for contributors: `AGENTS.md`.
