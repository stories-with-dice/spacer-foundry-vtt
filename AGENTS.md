# AGENTS.md

Rules for AI agents and contributors working on the Spacer Foundry VTT system.

## What this is

A Foundry VTT game system (id `spacer`) for *Spacer: Interstellar Roleplaying in the Far Future*
v1.03 (Bryan Larkin, Arcane Sword Press), a Classic-Traveller-style 2D game. Goals: automate as much
of the rules as possible and make solo play easy.

- **Compatibility: Foundry v13 and v14.** Use only APIs present in both: `TypeDataModel`,
  `foundry.applications.api.ApplicationV2` / `HandlebarsApplicationMixin`,
  `foundry.applications.sheets.ActorSheetV2` / `ItemSheetV2`, `DialogV2`, the
  `renderChatMessageHTML` hook, `foundry.applications.handlebars.renderTemplate` /
  `loadTemplates`, `foundry.documents.collections.Actors.registerSheet` (via
  `foundry.documents.collections.Actors` / `Items`), `foundry.utils.*`. No jQuery. Do not use the
  deprecated globals (`renderTemplate`, `loadTemplates`, `Actors`, `Items`, `ActorSheet`,
  `mergeObject`): they log deprecation warnings that fail the smoke test. Use `foundry.utils.*`.
  When in doubt, read the Foundry source on disk: `~/bin/FoundryVTT-Node-13.351/` and
  `~/bin/FoundryVTT-Node-14.370/` (`client/`, `common/`).
- **Plain ES modules, no build step for code.** Foundry loads `module/spacer.mjs`.
- **Licenses.** Code is MIT (`LICENSE`). Game content in `src/content/` is CC BY-SA 4.0
  (`LICENSE-CONTENT.md`). Never add book artwork or any image from the PDF. Item images come from
  game-icons.net (CC BY 3.0) through the required `game-icons-net` module:
  `modules/game-icons-net/blackbackground/<name>.svg` (check the picture, not only the file name:
  some names are misleading). Other images: Foundry core icons (`icons/svg/*.svg`). Never use the
  word "Traveller" in names or UI labels.
- **Book source text:** `sources/pages/pNNN.txt` (reading order) and `sources/pages/pNNN.layout.txt`
  (columns kept; best for tables), one file per PDF page (`p016` = book page 16). Git ignores
  `sources/`.

## Areas and file ownership

Agents work in parallel in the same folder. Only edit files in your own area. If you need a
change in another area, write it down in your final report instead.

| Area | Owns | Exposes |
|---|---|---|
| core (lead) | `system.json`, `module/spacer.mjs`, `module/config.mjs`, `module/data/*`, `module/shared/*`, `tools/*`, `test/content.test.mjs`, `test/helpers/*`, `AGENTS.md`, `docs/*`, licenses | data models, constants, shared helpers |
| play | `module/play/**`, `templates/play/**`, `styles/spacer.css`, `lang/en/core.json`, `test/play*.test.mjs` | `module/play/api.mjs` (`rollTask`, `skillRank`, `rollBookDice`, `applyDamage`, ...), `game.spacer.play` |
| craft | `module/craft/**`, `templates/craft/**`, `styles/craft.css`, `lang/en/craft.json`, `test/craft*.test.mjs` | `game.spacer.craft` |
| chargen | `module/chargen/**`, `templates/chargen/**`, `styles/chargen.css`, `lang/en/chargen.json`, `test/chargen*.test.mjs` | `game.spacer.chargen.open(actor)` |
| tools | `module/tools/**`, `templates/tools/**`, `styles/tools.css`, `lang/en/tools.json`, `test/tools*.test.mjs`, `src/content/macros/**` | `game.spacer.tools.*` |
| content | `src/content/<pack>/**` for the packs assigned to you | compendium documents |

Each code area has one entry point, `module/<area>/register.mjs`, exporting `register<Area>()`,
called from the `init` hook. Register sheets, settings, hooks, and template preloads there. Set
your namespace with `game.spacer.<area> = {...}` inside `register<Area>()` (`game.spacer` exists).
Put pure rules logic (no Foundry globals) in `module/<area>/rules/*.mjs` so `node --test` can test it.

The `module/data/*` models belong to core. The craft area may change `prepareDerivedData` of
`VehicleData` and `ShipData` only. Any other schema change: report it, do not make it.

## Shared contracts

- Characteristics: `system.characteristics.<str|dex|end|int|edu|soc>.{value,max}`. `max` is the
  rolled score, `value` the current score. Derived: `system.dm.<key>`, `system.upp`,
  `system.injury`, `system.armor.total`, `system.encumbrance`, `system.movement`.
- Skills are items of type `skill` with `system.skill` (base name), `system.specialty` ("" for the
  base), and `system.rank`. Rank lookup: `skillRank(actor, "Melee Combat", "Blade")` in
  `module/play/api.mjs`. Untrained is -3. Skill names must match the skills compendium
  (`src/content/skills/`), spelled as in the book (p.28-29).
- Task rolls: `rollTask({ actor, characteristic, skill, specialty, dm, target, label })` returns
  `{ roll, total, effect, success, boxcars, snakeEyes }` and posts a chat card.
- Book dice: `bookDice("2D+3")` in `config.mjs` converts to a Foundry formula.
- Chat card buttons: put `data-action="<area>-<name>"` on the button and register the handler
  with `registerChatActions` (module/shared/chat-actions.mjs). Do not add a
  `renderChatMessageHTML` hook for buttons.
- i18n: keys under `SPACER.` in core, `SPACER.Craft.` in craft, `SPACER.Chargen.` in chargen,
  `SPACER.Tools.` in tools. Foundry deep-merges the four files. A key is a string or a group,
  never both.
- CSS: scope every rule under `.spacer` (add the class `spacer` to every app/sheet you make).
- Generated world content (worlds, patrons, NPCs) goes into world documents in folders named
  "Spacer: <Kind>" and carries `flags.spacer.<kind>` with the structured data.

## Code conventions

Every area follows the same layout, so a person or an agent can find things the same way:

```
module/<area>/
  register.mjs     entry point: settings, sheets, hooks, templates, chat actions, game.spacer.<area>
  api.mjs          the public API (game.spacer.<area>); re-exports from the files below
  rules/*.mjs      pure rules: book tables and calculations, no Foundry globals, tested with node:test
  <feature>.mjs    Foundry glue per feature: reads documents, calls rules, writes updates, posts cards
  sheets/*.mjs     ActorSheetV2 / ItemSheetV2 classes
  apps/*.mjs       other ApplicationV2 windows
```

- **Shared helpers live in `module/shared/`. Do not copy them into an area.**
  - `dice.mjs` (pure): `randomDie`, `seededDie`, `scriptedDie`, `makeDice`, `d6`, `band`, `clamp`,
    `parseBookDice`. Rules functions take a die or a `dice` object as a parameter; never call
    `Math.random` directly.
  - `foundry.mjs`: `localizer(prefix)`, `templatePath`, `renderAreaTemplate`, `preloadTemplates`,
    `setting`, `postCard`, `applyMessageMode`, `resolveActor`, `tokenOf`, `tokenDistance`,
    `pickActors`, `formValues`, `addDirectoryButton`, `signed`.
  - `chat-actions.mjs`: `registerChatActions({ "<area>-<name>": (event, button, message) => {} })`.
    Do not add your own `renderChatMessageHTML` hook for buttons.
- **Book data** (tables, targets, DMs) lives in `rules/*.mjs` as plain data with a comment that
  gives the book page (`// p.43`). One table = one exported constant. When the book is wrong or
  unclear, add a comment `// BOOK: <what the book says>; we use <what and why>`.
- **Files stay small**: aim under 300 lines; split by feature, not by type.
- **JSDoc** on every exported function: what it reads, what it returns or writes, and who calls it.
- **Tests**: every rules fix gets a node test with scripted dice. Every feature that writes
  documents gets a check in its `test/foundry/<area>.js` script.
- **Lint**: `npm run lint` must report no errors and no warnings.
- **Data model fields over flags**: state that the rules need belongs in `system`, not in flags.
  Ask the core owner for new fields.

## Testing

1. `npm run check` runs lint, the node tests (`npm test`), and the pack build.
   `npm run test:foundry` runs every browser test (see below).
2. `npm run build` compiles content into `packs/`. Run it after content changes.
3. Browser tests on a local server. v13: `~/bin/FoundryVTT-Node-13.351`, port 30000. v14:
   `~/bin/FoundryVTT-Node-14.370`, port 30001. Both data folders link `systems/spacer` to this repo
   and have the world `spacer-test`.
   - Start: `node tools/foundry-server.mjs start --v 13` (or `--v 14`).
   - Run: `node tools/foundry-run.mjs --v 13 --script test/foundry/<area>.js --shot test-results/<name>.png`.
     The script is the body of an async function run in the page. The run fails on any page error
     or deprecation warning.
   - **Never close the user's game.** When another world is open, the tools stop. `--switch-world`
     closes that world: pass it only when the user allowed it in the current conversation.
   - **One server at a time.** Both servers share `packs/`, and LevelDB lets one process open a pack.
     The world that opened the packs first keeps them; the other world sees empty compendiums
     (`test/foundry/smoke.js` fails on that).
   - **Rebuilding packs:** a running world keeps `packs/` open, and replacing the files under it
     leaves the server with dead handles until it restarts. So: `node tools/foundry-run.mjs --v 13 --close`,
     then `npm run build` (it refuses while a Foundry process holds the packs), then run the tests
     (the tool launches the world again).
   - Name test documents with your area prefix and delete them at the end.
   - Headless Chromium from Playwright is too old for v14, so the tool uses the installed Google
     Chrome (`channel: "chrome"`).
4. Look at your screenshots with the Read tool to check layout.

## Git

The lead commits. Agents do not run git commands that change state (no add, commit, stash,
checkout, reset).
