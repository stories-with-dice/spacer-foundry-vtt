# Content source format

Game content lives in `src/content/<pack>/*.json`. `<pack>` is a pack `name` from `system.json`.
`npm run build` (`tools/build-packs.mjs`) gives every document a stable id and compiles the packs.
Each file holds one document or an array of documents. Use one file per book section.

Never set `_id` or `_key`; the build creates them from pack + type + name. Names must be unique
within a pack (the build fails on a duplicate). Never include book art. Give every item an icon from
the required game-icons.net module, `"img": "modules/game-icons-net/blackbackground/<name>.svg"`; an
item without `img` gets its type's default from `ITEM_ICONS` in `module/config.mjs`. Other documents
may use Foundry core icons such as `icons/svg/sword.svg`. `npm test` checks that every icon file
exists when the module is installed locally.

Every document should carry its book page in `system.source` (items) or in its text, e.g. `"p.30"`.

## Item (packs: skills, weapons, armor, gear, psionics, drugs, ship-weapons)

```json
{ "name": "Knife", "type": "weapon", "img": "modules/game-icons-net/blackbackground/bowie-knife.svg", "folder": "Melee Weapons",
  "system": { "category": "melee", "skill": "Melee Combat", "specialty": "Blade", "damage": "1D+3", "range": "close",
              "cost": 150, "weight": 0.1, "tl": 1, "traits": ["Bladed", "Conceal", "Throw"],
              "description": "<p>Can be thrown within short range.</p>", "source": "p.30" } }
```

`system` fields are those of the matching data model in `module/data/items.mjs`. Costs are numbers in
credits, weights numbers in kilograms (`config.mjs` has `parseCredits` and `parseWeightKg`). Damage
stays in book dice notation ("2D+3", "D3", "2D3").

## Actor (packs: vehicles, starships)

```json
{ "name": "Ground Car", "type": "vehicle", "folder": "Landcraft",
  "system": { ... fields of module/data/actors.mjs ... },
  "items": [ { "name": "Light Turret", "type": "shipWeapon", "system": { ... } } ] }
```

## RollTable (pack: tables)

```json
{ "name": "Starport Encounters", "folder": "Starport", "formula": "1d6*10+1d6",
  "description": "<p>p.61. Roll D66.</p>",
  "results": [ { "range": [11, 11], "text": "Disgruntled dock workers on a smoke break" } ] }
```

`range` is inclusive. For D66 tables use the formula `1d6*10+1d6` and ranges like `[11, 11]`.
`text` is HTML. For 2D tables use `2d6`. Foundry draws nothing for a total outside every range, so
for tables that take DMs give the open-ended first and last rows wide ranges, e.g. `[-10, 2]` for
"2 or less" and `[13, 30]` for "13+".

## JournalEntry (pack: rules)

```json
{ "name": "Combat", "folder": "Core Rules",
  "pages": [ { "name": "The Combat Procedure", "html": "<p>...</p><table>...</table>" } ] }
```

Pages are HTML. Keep tables as `<table>` with `<thead>`. Cross-references may use
`@UUID[Compendium.spacer.tables.RollTable.<id>]{Name}` only if you compute the id with
`stableId("tables", "RollTable", name)` from `tools/build-packs.mjs`; plain text is fine otherwise.

### World Codes anchors

`src/content/rules/part2-25a-world-codes.json` ("25a World Codes") defines every world code, one
page per kind. Each value has a heading with the id `<kind>-<code>`, the code as the world profile
shows it: `starport-B`, `size-A`, `atmosphere-6`, `hydrographics-A`, `population-7`,
`government-4`, `law-3`, `tech-9` (hex digits as in the UWP, up to G), `base-N` (N, M, S, P, and H
for a highport), `trade-Ri`, `zone-A` (G, A, R), `temperature-Frozen`. Foundry uses a heading's
id as its anchor, so `@UUID[Compendium.spacer.rules.JournalEntry.<id>.JournalEntryPage.<id>#government-4]{4}`
opens the page at that heading. Generated world pages link their codes this way.

The browser cannot compute `stableId`, so `node tools/gen-world-code-links.mjs` writes the entry
and page ids and the anchors to `module/tools/rules/world-code-links.mjs`. Run it after you change
the World Codes file (rename a page, add a value); `npm test` fails while the file is out of date.

## Macro (pack: macros)

```json
{ "name": "Generate World", "type": "script", "img": "icons/svg/sun.svg",
  "command": "game.spacer.tools.generateWorld();" }
```
