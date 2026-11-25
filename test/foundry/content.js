// Content in Foundry: every compendium document loads and validates, every roll table draws,
// and one sheet per document type renders.
const out = { packs: {}, invalid: [], tables: 0, emptyDraws: [], sheets: [] };
for (const pack of game.packs.filter(p => p.metadata.packageName === "spacer")) {
  const docs = await pack.getDocuments();
  out.packs[pack.metadata.name] = docs.length;
  for (const id of pack.invalidDocumentIds ?? []) out.invalid.push(`${pack.metadata.name}/${id}`);
  if (pack.documentName === "RollTable") {
    for (const table of docs) {
      const { results } = await table.roll();
      out.tables++;
      if (!results.length) out.emptyDraws.push(table.name);
    }
  }
}
const seen = new Set();
for (const name of ["skills", "weapons", "armor", "gear", "psionics", "drugs", "ship-weapons", "vehicles", "starships", "rules"]) {
  for (const doc of await game.packs.get(`spacer.${name}`).getDocuments()) {
    const key = `${doc.documentName}:${doc.type ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await doc.sheet.render({ force: true });
    await new Promise(r => setTimeout(r, 300));
    if (!doc.sheet.rendered) throw new Error(`sheet did not render: ${key} ${doc.name}`);
    out.sheets.push(key);
    await doc.sheet.close();
  }
}
if (out.invalid.length) throw new Error(`invalid documents: ${out.invalid.join(", ")}`);
// A draw can come up empty only when a DM-only table has no row for the bare formula.
if (out.emptyDraws.length) throw new Error(`tables that drew nothing: ${out.emptyDraws.join(", ")}`);
return out;
