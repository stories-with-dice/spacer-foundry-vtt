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
  (`LICENSE-CONTENT.md`). Never add book artwork or any image from the PDF. Use Foundry core
  icons (`icons/svg/*.svg`, `icons/...`). Never use the word "Traveller" in names or UI labels.
- **Book source text:** `sources/pages/pNNN.txt` (reading order) and `sources/pages/pNNN.layout.txt`
  (columns kept; best for tables), one file per PDF page (`p016` = book page 16). Git ignores
  `sources/`.

## Areas and file ownership

Agents work in parallel in the same folder. Only edit files in your own area. If you need a
change in another area, write it down in your final report instead.

| Area | Owns | Exposes |
|---|---|---|
| core (lead) | `system.json`, `module/spacer.mjs`, `module/config.mjs`, `module/data/*`, `tools/*`, `AGENTS.md`, `docs/content-format.md`, licenses | data models, constants |
| play | `module/play/**`, `templates/play/**`, `styles/spacer.css`, `lang/en/core.json`, `test/play*.test.mjs` | `module/play/api.mjs` (`rollTask`, `skillRank`, `rollBookDice`, plus `applyDamage` etc.), `game.spacer.play` |
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
  base), and `system.rank`. Rank lookup: `skillRank(actor, "Melee", "Blade")` in
  `module/play/api.mjs`. Untrained is -3. Skill names must match the skills compendium
  (`src/content/skills/`), spelled as in the book (p.28-29).
- Task rolls: `rollTask({ actor, characteristic, skill, specialty, dm, target, label })` returns
  `{ roll, total, effect, success, boxcars, snakeEyes }` and posts a chat card.
- Book dice: `bookDice("2D+3")` in `config.mjs` converts to a Foundry formula.
- Chat card buttons: use `data-action` attributes and handle them in a `renderChatMessageHTML`
  hook registered by your area. Prefix your actions with your area (`play-damage`, `craft-hit`, ...).
- i18n: keys under `SPACER.` in core, `SPACER.Craft.` in craft, `SPACER.Chargen.` in chargen,
  `SPACER.Tools.` in tools. Foundry deep-merges the four files. A key is a string or a group,
  never both.
- CSS: scope every rule under `.spacer` (add the class `spacer` to every app/sheet you make).
- Generated world content (worlds, patrons, NPCs) goes into world documents in folders named
  "Spacer: <Kind>" and carries `flags.spacer.<kind>` with the structured data.

## Testing

1. `npm test` runs `node --test` (pure rules logic).
2. `npm run build` compiles content into `packs/`. Run it after content changes.
3. Foundry v13 smoke test (the server on port 30000 is normally running with world `spacer-test`):
   `node tools/foundry-server.mjs start --v 13` then
   `node tools/foundry-run.mjs --v 13 --script test/foundry/<your>.js --shot test-results/<name>.png`.
   The script file is the body of an async function run in the page. It fails on any page error or
   deprecation warning. Other agents use the same world at the same time: name your test documents
   with your area prefix and delete them at the end. Reloading the page picks up code changes.
   Do not stop the server, and never touch port 30001 (another session uses it).
4. Look at your screenshots with the Read tool to check layout.

## Git

The lead commits. Agents do not run git commands that change state (no add, commit, stash,
checkout, reset).
