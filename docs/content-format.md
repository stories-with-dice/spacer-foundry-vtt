# Content source format

Game content lives in `src/content/<pack>/*.json`. `<pack>` is a pack `name` from `system.json`.
`npm run build` (`tools/build-packs.mjs`) gives every document a stable id and compiles the packs.
Each file holds one document or an array of documents. Use one file per book section.

Never set `_id` or `_key`; the build creates them from pack + type + name. Names must be unique
within a pack (the build fails on a duplicate). Never include book art. Leave `img` out to get the
default core icon, or use a core icon path such as `icons/svg/sword.svg`.

Every document should carry its book page in `system.source` (items) or in its text, e.g. `"p.30"`.

## Item (packs: skills, weapons, armor, gear, psionics, drugs, ship-weapons)

```json
{ "name": "Knife", "type": "weapon", "folder": "Melee Weapons",
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

## Macro (pack: macros)

```json
{ "name": "Generate World", "type": "script", "img": "icons/svg/sun.svg",
  "command": "game.spacer.tools.generateWorld();" }
```
