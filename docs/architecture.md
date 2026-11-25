# Architecture

How the Spacer system is put together, for people and agents who change it. Rules for working on
the code (ownership, conventions, testing) are in [AGENTS.md](../AGENTS.md).

## The big picture

```
system.json ──> module/spacer.mjs (init hook)
                  ├─ registers the data models   module/data/actors.mjs, items.mjs
                  ├─ installs the chat dispatcher module/shared/chat-actions.mjs
                  └─ calls each area's register   module/{play,craft,chargen,tools}/register.mjs

src/content/<pack>/*.json ──npm run build──> packs/<pack>/ (LevelDB compendiums)
```

- **Data models** (`module/data/`) define what an actor or item stores (`system.*`) and compute
  derived values in `prepareDerivedData` (characteristic DMs, UPP, injury state, encumbrance,
  armour difficulty, ship performance after damage).
- **Areas** add behaviour. Each area is a folder under `module/` with the same layout
  (see AGENTS.md "Code conventions"):

| Area | What it does | Book pages |
|---|---|---|
| `play` | Character, NPC, creature and item sheets; task rolls; attacks; damage and healing; psionics; drugs; morale | 14-15, 28-45, 106-107, 114-122 |
| `craft` | Ship and vehicle sheets; vehicle and space combat; hit locations; travel and jumps; monthly costs; ship construction | 46-49, 66-87 |
| `chargen` | The lifepath character creation engine and its wizard | 16-27, 114 |
| `tools` | Referee procedures: worlds, subsectors, patrons, NPCs, encounters, trade, weather, survival, animals; the campaign clock; the solo oracle; the Toolkit window | 15, 50-65, 80-82, 88-113 |

- **Shared code** (`module/shared/`) holds what every area needs: dice, Foundry helpers, and the
  chat button dispatcher.
- **Content** (`src/content/`) is the book's text as JSON documents. The build turns it into the
  compendium packs. Format: [content-format.md](content-format.md).

## Layers inside an area

```
sheets/, apps/      user interface (ApplicationV2). Calls the feature files.
<feature>.mjs       Foundry glue: reads documents, calls rules, updates documents, posts chat cards.
rules/*.mjs         pure book logic and tables. No Foundry. Takes dice as a parameter.
```

The rules layer is where the book lives. It is plain JavaScript, so `node --test` checks it with
scripted dice (`scriptedDie([3, 4])` makes the next two dice roll 3 and 4). The glue layer is
checked in a real Foundry by the browser tests in `test/foundry/`.

Example, an attack (play area):

1. The character sheet's Attack button calls `attack(actor, weapon)` in `module/play/`.
2. `attack` reads the weapon, the target's armour and cover, and the token distance, and calls the
   pure `computeAttack` in `module/play/rules/` for the DMs.
3. It rolls the dice, updates ammunition, and posts a chat card with an "Apply damage" button
   (`data-action="play-damage"`).
4. The click goes through the dispatcher in `module/shared/chat-actions.mjs` to the play handler,
   which calls `applyDamage(target, amount)`: END first, then STR and DEX (book p.43).

## Cross-area calls

Areas talk through their public API objects, never through each other's internal files:

- `game.spacer.play` (and `module/play/api.mjs`): `rollTask`, `skillRank`, `rollBookDice`,
  `applyDamage`, `heal`, ... Craft, chargen and tools import these.
- `game.spacer.craft`: `damageCraft`, `damageShip`, `damageVehicle`, ... Play calls these when a
  personal weapon hits a vehicle.
- `game.spacer.chargen.open(actor)`: the character sheet's "Create character" button.
- `game.spacer.tools`: the Toolkit and every generator; the macros pack calls these.

## Where state lives

| State | Where |
|---|---|
| Characters, NPCs, creatures, vehicles, ships | Actor `system` (data models) |
| Skills, weapons, armour, gear, psionics, drugs, ship weapons | Item `system` |
| Generated worlds, patrons, NPCs, animals | World documents in folders "Spacer: <Kind>", structured data in `flags.spacer.<kind>` |
| Campaign clock, current world | World settings of the tools area |
| Lifepath log | `system.history` (HTML) and `flags.spacer.chargen` |

## How to change things

- **Fix a number from the book**: find the constant in the area's `rules/*.mjs` (each table has a
  `// p.NN` comment), change it, add or update a node test, run `npm test`.
- **Add a roll table**: add it to a file in `src/content/tables/`, run `npm run build` and
  `npm test` (the content test checks that every roll hits exactly one row).
- **Add an item**: add it to `src/content/<pack>/`; the content test checks its fields against the
  data model.
- **Add a field**: add it to the data model in `module/data/`, use it in the area, and when existing
  worlds need it filled, add a migration in the area's `register.mjs` (see craft's migration).
- **Add a chat button**: put `data-action="<area>-<name>"` on the button in the card template and
  register the handler with `registerChatActions` in the area's `register.mjs`.
- **Before you commit**: `npm run check` (lint, node tests, build) and `npm run test:foundry`.

## Book choices

Where the book is wrong, silent, or contradicts itself, the code keeps a comment
`// BOOK: <what the book says>; we use <what and why>`. Search for `BOOK:` to list them all.
