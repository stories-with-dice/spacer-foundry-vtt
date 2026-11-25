# Spacer for Foundry VTT

An unofficial Foundry VTT game system for *Spacer: Interstellar Roleplaying in the Far Future*
(v1.03) by Bryan Larkin, published by Arcane Sword Press. It runs on Foundry v13 and v14.

The system automates most of the book: task rolls, combat and damage, the lifepath character
creation, starships and vehicles (damage, travel, finances, construction, space combat), and the
referee procedures (worlds, subsectors, patrons, NPCs, encounters, trade, weather, survival,
alien animals). A Toolkit and macros make solo play easy. The compendiums hold the full written
text of the book, every rollable table, and all the items, vehicles, and sample starships.

## Install

In Foundry VTT (v13 or v14): Setup → Game Systems → **Install System**, and paste this manifest URL:

```
https://github.com/stories-with-dice/spacer-foundry-vtt/releases/latest/download/system.json
```

Foundry also installs the required **Game-icons.net** module (`game-icons-net`), which holds the item
icons ([game-icons.net](https://game-icons.net), CC BY 3.0, Lorc, Delapouite, and contributors).
The release zip has everything else, compendiums included: there is nothing to build or run.

To work on the code instead, clone the repo into `Data/systems/spacer` and run
`npm install && npm run build` to compile the compendium packs (`npm run link` links the repo into
the local v13 and v14 data folders).

## Licenses

- Program code: MIT, see `LICENSE`.
- Game content (`src/content/`, `packs/`): CC BY-SA 4.0, adapted from the book. See
  `LICENSE-CONTENT.md`. No book artwork is included.
- Item icons: game-icons.net, CC BY 3.0, through the required `game-icons-net` module.

This project is not affiliated with Arcane Sword Press.

## Development

- `npm test` runs the rules tests (`node:test`).
- `npm run build` compiles `src/content/` into `packs/` (format: `docs/content-format.md`).
- `node tools/foundry-server.mjs start --v 13` and
  `node tools/foundry-run.mjs --v 13 --script test/foundry/smoke.js` run the browser tests.
  Run one server at a time: both link to the same `packs/` folder.
- Code layout and rules for contributors: `AGENTS.md`; how the parts connect: `docs/architecture.md`.
- Releases: push a tag `vX.Y.Z` (or run the "Release" workflow in the Actions tab). The workflow
  lints, tests, builds the packs, and publishes `system.json` and `spacer.zip`.
