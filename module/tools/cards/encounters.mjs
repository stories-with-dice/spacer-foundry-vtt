/**
 * Chat cards of the encounter procedures: starport (p.60-61), settlement (p.102-103), space
 * (p.80-81), and ship reactions (p.82). Pure. Called by module/tools/encounters.mjs.
 */
import { row, reactionText, signed, code2, CREATE_RANDOM_NPC } from "./common.mjs";
import { randomNpcRows } from "./npcs.mjs";

/** Rows of the patron, count, and chance sub-rolls of an encounter row. */
function subRows(r) {
  const rows = [];
  if (r.patron) rows.push(row("Patron", `${r.patron.name} (${r.patron.code})`), row("Patron reaction", reactionText(r.patron.reaction)));
  if (r.count) rows.push(row("Number", r.count));
  if (r.chance) rows.push(row("Chance", `1D ${r.chance.roll}: ${r.chance.happens ? "yes" : "no"}`, `${r.chance.target}+`));
  return rows;
}

/** Card data of a `starportEncounter` result (rules/starport.mjs). */
export function starportCard(r) {
  if (r.legal) {
    return {
      title: "Starport encounter",
      subtitle: "Legal encounter (p.60)",
      icon: "fa-solid fa-building-shield",
      headline: r.text,
      sections: [{ rows: [
        row("Avoid", `2D ${r.avoid.natural} ${signed(r.avoid.dm)} = ${r.avoid.roll} vs law level ${r.avoid.target}`, r.avoid.avoided ? "avoided" : "not avoided"),
        ...(r.reaction ? [row("Reaction", reactionText(r.reaction))] : [])
      ] }]
    };
  }
  const sections = [{ rows: [row("Roll", `D66 ${code2(r.code)}`, `DM ${signed(r.dm)} to tens`), row("Starport feel", r.range), ...subRows(r)] }];
  if (r.npc) sections.push({ heading: "Random NPC (p.59)", rows: randomNpcRows(r.npc) });
  return { title: "Starport encounter", subtitle: "p.60-61", icon: "fa-solid fa-plane-arrival", headline: r.text, sections, buttons: r.npc ? [CREATE_RANDOM_NPC] : [] };
}

/** Card data of a `settlementEncounter` result (rules/starport.mjs). */
export function settlementCard(r) {
  if (r.legal?.encounter) {
    return { title: "Settlement encounter", subtitle: "Legal encounter (p.102)", icon: "fa-solid fa-scale-balanced", headline: r.text,
      sections: [{ rows: [row("Legal check", `2D ${r.legal.roll} under law level ${r.legal.law}`), row("Reaction", reactionText(r.legal.reaction))] }] };
  }
  const sections = [{ rows: [
    ...(r.legal ? [row("Legal check", `2D ${r.legal.roll} vs law level ${r.legal.law}: no legal encounter`)] : []),
    row("Roll", `D66 ${code2(r.code)}`, `DM ${signed(r.dm)} to tens`), row("Settlement feel", r.range), ...subRows(r)
  ] }];
  if (r.npc) sections.push({ heading: "Random NPC (p.59)", rows: randomNpcRows(r.npc) });
  return { title: "Settlement encounter", subtitle: "p.102-103", icon: "fa-solid fa-city", headline: r.text, sections, buttons: r.npc ? [CREATE_RANDOM_NPC] : [] };
}

/** Card data of a `spaceEncounter` result (rules/space.mjs). */
export function spaceCard(r) {
  const head = [
    row("Location", `${r.location.label} (check every ${r.location.frequency})`),
    row("Encounter check", `1D ${r.check.natural} ${signed(r.check.dm)} = ${r.check.total}${r.forced ? " (forced)" : ""}`, "6+")
  ];
  if (!r.encounter) return { title: "Space encounter", subtitle: r.jump ? "Entering space / leaving jump" : "p.80", icon: "fa-solid fa-satellite", headline: "No encounter.", sections: [{ rows: head }] };
  const res = r.result;
  const rows = [
    row("Type", `${r.type.label} (2D ${r.typeRoll})`),
    row("Distance", r.type.distance),
    row("Number encountered", r.number),
    row("Table", `${r.location.table} ${res.code}`)
  ];
  if (res.ships) rows.push(row("Ships", res.ships));
  if (res.tons) rows.push(row("Tonnage", `${res.tons.toLocaleString("en-US")}T`));
  if (res.station) rows.push(row("Station", res.station));
  if (res.outlaws) rows.push(row("Outlaws?", `1D ${res.outlaws.roll}: ${res.outlaws.kind}`, "4+ = spacers"));
  if (res.other) rows.push(row("Other", res.other));
  if (res.years) rows.push(row("Age", `${res.years} years`));
  if (res.decades) rows.push(row("Jettisoned", `${res.decades} decades ago`));
  if (res.collision) rows.push(row("Collision", res.collision.note));
  const sections = [{ rows: head }, { heading: "Encounter (p.80-81)", rows }];
  if (r.reaction) sections.push({ heading: "Ship reaction (p.82)", rows: [row("Reaction when hailing", `${r.reaction.hail} (2D ${r.reaction.hailRoll})`), row("Behaviour", `${r.reaction.behaviour} (2D ${r.reaction.behaviourRoll})`)] });
  return { title: "Space encounter", subtitle: r.jump ? "Entering space / leaving jump" : r.location.label, icon: "fa-solid fa-satellite", headline: res.text, sections };
}

/** Card data of a `shipReaction` result (rules/space.mjs). `scanning` picks the title. */
export function shipReactionCard(r, { scanning }) {
  const rows = [row("Reaction when hailing", `${r.hail} (2D ${r.hailRoll})`), row("Behaviour if interacted with", `${r.behaviour} (2D ${r.behaviourRoll})`)];
  if (r.condition) rows.push(row("Ship condition", `${r.condition} (2D ${r.conditionRoll})`));
  if (r.scan) rows.push(row("Ship scan result", `${r.scan} (2D ${r.scanRoll})`));
  const sections = [{ rows }];
  if (r.flags?.length) sections.push({ heading: "Flags", list: r.flags });
  return { title: scanning ? "Ship scan" : "Ship communication", subtitle: "p.82", icon: "fa-solid fa-tower-broadcast", sections };
}
