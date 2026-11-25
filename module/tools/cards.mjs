/**
 * Chat card data for every tools result. Pure: each function turns a rules result into the data
 * of templates/tools/card.hbs ({ title, subtitle, icon, headline, sections, buttons, footer }).
 */
import { signed } from "./rules/dice.mjs";
import { lawBans } from "./rules/world.mjs";
import { TRADE_CODES } from "./rules/trade.mjs";
import { DESCRIPTIONS } from "./rules/animals.mjs";
import { CHARACTERISTICS } from "../config.mjs";
import { toHex } from "../config.mjs";

export const cr = n => `${Math.round(Number(n) || 0).toLocaleString("en-US")}cr`;
const row = (label, value, note) => ({ label, value: value === undefined || value === null || value === "" ? "—" : String(value), note });
const reactionText = r => (r ? `${r.label} (${signed(r.dm)} DM; 2D ${r.roll})` : "—");

/* ---------------------------------------------------------------- campaign */

export function patronCard(r) {
  const j = r.job;
  const sections = [
    {
      heading: "Finding a patron (p.50)",
      rows: [
        row("Location", `${r.location.label} (patron table ${r.location.range}, pay x${r.location.multiplier})`),
        row("Days searching", `${r.search.days} (starport ${r.search.starport})`),
        row("Check", `2D ${r.search.natural} ${signed(r.search.dm)} = ${r.search.roll}: ${r.search.found ? "patron found" : "no patron yet"}`, "8+")
      ]
    },
    {
      heading: "Patron (p.50-51)",
      rows: [
        row("Patron", `${r.patron.name} (${r.patron.code})`),
        row("Personality", r.patron.personality),
        row("Feature", r.patron.feature),
        row("Demeanour", reactionText(r.patron.demeanour))
      ]
    },
    {
      heading: `Job: ${j.type} (p.52-53)`,
      list: j.objectives.map(o => `${o.text} (2D ${o.roll})`),
      text: j.note
    },
    {
      heading: "Negotiations (p.54)",
      rows: [
        row("Time to complete", `${j.terms.time} (${j.terms.weeks} weeks)`),
        row("Location", `${j.terms.location}${j.terms.parsecs ? `: ${j.terms.parsecs} parsecs` : ""}`),
        row("Payment terms", j.paymentTerms.text),
        row("Job begins", j.start),
        row("Payment", j.payment.total !== null && j.payment.total !== undefined ? cr(j.payment.total) : "See below", j.payment.text),
        ...(j.payment.upFront ? [row("Paid up front", cr(j.payment.upFront))] : [])
      ]
    },
    {
      heading: "Destination (p.54-55)",
      rows: [
        row("Destination", `${j.destination.name}${j.destination.tl ? ` (TL ${j.destination.tl})` : ""}`),
        ...(j.destination.settlement ? [row("Settlement", `${j.destination.settlement.type}; ${j.destination.settlement.distance}`)] : []),
        ...(j.destination.colony ? [row("Colony", `Run by ${j.destination.colony.runner}; ${j.destination.colony.age} old; population ${j.destination.colony.population.toLocaleString("en-US")}`)] : [])
      ]
    },
    {
      heading: "If a complication occurs (p.55)",
      rows: [row("Who", j.complication.who), row("What", j.complication.what), row("Why", j.complication.why), row("How", j.complication.how)]
    }
  ];
  return {
    title: "Patron & job",
    subtitle: `${r.patron.name} · ${j.type}`,
    icon: "fa-solid fa-handshake",
    headline: j.objectives[0]?.text,
    sections,
    buttons: [{ action: "tools-create-patron", label: "Create patron NPC", icon: "fa-solid fa-user-plus" }]
  };
}

export function npcCard(r) {
  return {
    title: "NPC",
    subtitle: `${r.type} · ${r.quality}`,
    icon: "fa-solid fa-user",
    sections: [{
      rows: [
        row("NPC table (p.56)", `${String(r.code).padStart(2, "0")} ${r.type}`, r.dm ? `DM ${signed(r.dm)} to tens` : ""),
        row("Demeanour", reactionText(r.demeanour)),
        row("UPP", CHARACTERISTICS.map(k => toHex(r.characteristics[k])).join("")),
        row("Weapon", r.weapon)
      ]
    }],
    buttons: [{ action: "tools-create-npc", label: "Create NPC actor", icon: "fa-solid fa-user-plus" }]
  };
}

export function randomNpcCard(r, { title = "Random NPC" } = {}) {
  return {
    title,
    subtitle: `${r.count} x ${r.who}`,
    icon: "fa-solid fa-users",
    sections: [{ heading: "Random NPC table (p.59)", rows: randomNpcRows(r) }],
    buttons: [{ action: "tools-create-randomnpc", label: "Create NPC actor", icon: "fa-solid fa-user-plus" }]
  };
}

function randomNpcRows(r) {
  return [
    row("Who", `${r.who}${r.vehicle ? " (vehicle nearby)" : ""} (${r.code})`),
    row("Number", `${r.count} (${r.number})`),
    row("Avoid", `${r.avoid}+`),
    row("Weapon", r.weapon || "None"),
    row("Attack", signed(r.attack)),
    row("Hits (STR/DEX/END)", r.hits),
    row("Armour", r.armour || "None"),
    row("Reaction", reactionText(r.reaction))
  ];
}

export function informationCard(r) {
  return {
    title: "Information & rumours",
    subtitle: `${r.count} piece${r.count === 1 ? "" : "s"} of information (p.57)`,
    icon: "fa-solid fa-comments",
    sections: [
      { rows: [row("NPC reaction", reactionText(r.reaction))] },
      ...r.pieces.map(p => ({ heading: `${p.type} (1D ${p.roll})`, rows: [row("Detail", p.detail)], text: p.note }))
    ]
  };
}

export function demeanourCard(r) {
  return { title: "NPC demeanour", subtitle: "p.56", icon: "fa-solid fa-face-meh", headline: reactionText(r), sections: [] };
}

/* ---------------------------------------------------------------- encounters */

function subRows(r) {
  const rows = [];
  if (r.patron) rows.push(row("Patron", `${r.patron.name} (${r.patron.code})`), row("Patron reaction", reactionText(r.patron.reaction)));
  if (r.count) rows.push(row("Number", r.count));
  if (r.chance) rows.push(row("Chance", `1D ${r.chance.roll}: ${r.chance.happens ? "yes" : "no"}`, `${r.chance.target}+`));
  return rows;
}

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
  const sections = [{ rows: [row("Roll", `D66 ${String(r.code).padStart(2, "0")}`, `DM ${signed(r.dm)} to tens`), row("Starport feel", r.range), ...subRows(r)] }];
  if (r.npc) sections.push({ heading: "Random NPC (p.59)", rows: randomNpcRows(r.npc) });
  return { title: "Starport encounter", subtitle: "p.60-61", icon: "fa-solid fa-plane-arrival", headline: r.text, sections, buttons: r.npc ? [{ action: "tools-create-randomnpc", label: "Create NPC actor", icon: "fa-solid fa-user-plus" }] : [] };
}

export function settlementCard(r) {
  if (r.legal?.encounter) {
    return { title: "Settlement encounter", subtitle: "Legal encounter (p.102)", icon: "fa-solid fa-scale-balanced", headline: r.text,
      sections: [{ rows: [row("Legal check", `2D ${r.legal.roll} under law level ${r.legal.law}`), row("Reaction", reactionText(r.legal.reaction))] }] };
  }
  const sections = [{ rows: [
    ...(r.legal ? [row("Legal check", `2D ${r.legal.roll} vs law level ${r.legal.law}: no legal encounter`)] : []),
    row("Roll", `D66 ${String(r.code).padStart(2, "0")}`, `DM ${signed(r.dm)} to tens`), row("Settlement feel", r.range), ...subRows(r)
  ] }];
  if (r.npc) sections.push({ heading: "Random NPC (p.59)", rows: randomNpcRows(r.npc) });
  return { title: "Settlement encounter", subtitle: "p.102-103", icon: "fa-solid fa-city", headline: r.text, sections, buttons: r.npc ? [{ action: "tools-create-randomnpc", label: "Create NPC actor", icon: "fa-solid fa-user-plus" }] : [] };
}

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

export function shipReactionCard(r, { scanning }) {
  const rows = [row("Reaction when hailing", `${r.hail} (2D ${r.hailRoll})`), row("Behaviour if interacted with", `${r.behaviour} (2D ${r.behaviourRoll})`)];
  if (r.condition) rows.push(row("Ship condition", `${r.condition} (2D ${r.conditionRoll})`));
  if (r.scan) rows.push(row("Ship scan result", `${r.scan} (2D ${r.scanRoll})`));
  const sections = [{ rows }];
  if (r.flags?.length) sections.push({ heading: "Flags", list: r.flags });
  return { title: scanning ? "Ship scan" : "Ship communication", subtitle: "p.82", icon: "fa-solid fa-tower-broadcast", sections };
}

export function weatherCard(r) {
  return {
    title: "Weather",
    subtitle: `${r.temperature} world · ${r.zoneLabel}`,
    icon: "fa-solid fa-cloud-bolt",
    headline: `${r.type}: ${r.detail}`,
    sections: [{ rows: [
      row("Roll", `2D ${signed(r.zoneDM)} zone ${signed(r.previousDM)} previous = ${r.total}`, r.rerolls ? `${r.rerolls} reroll(s)` : ""),
      row("Next weather check", signed(r.nextDM)),
      row("Survival / vehicle DM", `${signed(r.survivalDM)} / ${signed(r.vehicleDM)}`),
      row("Exposure harm", r.harm, "without shelter, split over STR, DEX, END"),
      row("Walking penalty", `${r.walkPenalty} km/h`),
      row("Vehicle speed band", signed(r.speedPenalty))
    ] }],
    footer: r.invalidZone ? "This zone is not possible on this kind of world (X on p.96); no zone DM applied." : "Next check in 6 hours (p.96)."
  };
}

export function travelCard(r) {
  if (r.impossible) return { title: "Overland travel", subtitle: r.terrain, icon: "fa-solid fa-route", headline: r.text, sections: [] };
  if (r.mode === "walk" || r.mode === "swim") {
    return { title: "Overland travel", subtitle: `${r.mode === "swim" ? "Swimming" : "Walking"} · ${r.terrain}`, icon: "fa-solid fa-person-hiking", headline: `${r.km} km in ${r.hours} hours`, sections: [{ rows: [row("Speed", `${r.kmh} km/h`)] }] };
  }
  return {
    title: "Overland travel", subtitle: `Vehicle · ${r.terrain}`, icon: "fa-solid fa-truck-monster",
    headline: r.stopped ? "The vehicle is stopped (speed band 0)." : `Speed band ${r.speedBand} in ${r.gear}`,
    sections: [{ rows: [row("Drive DM", signed(r.driveDM)), row("Failure", r.failure), row("Crash damage", r.crashDamage)] }]
  };
}

export function planetsideCard(r) {
  const head = [row("Terrain", `${r.location.label} (check every ${r.location.frequency})`), row("Encounter check", `1D ${r.check.natural} ${signed(r.check.dm)} = ${r.check.total}${r.forced ? " (forced)" : ""}`, "6+")];
  if (!r.encounter) return { title: "Planetside encounter", subtitle: "p.100", icon: "fa-solid fa-mountain-sun", headline: "No encounter.", sections: [{ rows: head }] };
  const sections = [{ rows: [...head, row("Type", `${r.type.label} (2D ${r.typeRoll})`), row("Distance", r.type.distance)] }];
  let headline = "";
  const buttons = [];
  if (r.npc) {
    headline = r.npc.text;
    sections.push({ heading: `NPC encounter, ${r.npc.column} column (p.100)`, rows: [
      row("Roll", `2D ${r.npc.roll}`),
      ...(r.npc.count ? [row("Number", r.npc.count)] : []),
      ...(r.npc.multiplier ? [row("Animals", `x${r.npc.multiplier} the number appearing`)] : []),
      ...(r.npc.npcType ? [row("NPC type", `${r.npc.npcType.type} (${r.npc.npcType.quality})`), row("Reaction", reactionText(r.npc.reaction))] : [])
    ], text: r.npc.column !== "human" ? "Use the animal generator for the animals (p.110)." : "" });
    if (r.npc.column !== "human") buttons.push({ action: "tools-animal-here", label: "Generate animal", icon: "fa-solid fa-paw" });
  }
  if (r.site) {
    const s = r.site;
    headline = s.text;
    const rows = [row("Roll", `${r.location.table} ${s.code}`, s.popDM ? `population DM ${signed(s.popDM)}` : "")];
    if (s.people) rows.push(row("People", s.people.toLocaleString("en-US")));
    if (s.condition) rows.push(row("Condition", s.condition));
    if (s.inUse) rows.push(row("In use?", `2D ${s.inUse.roll}: ${s.inUse.inUse ? "in use" : "not in use"}`, "8+"));
    if (s.labor) rows.push(row("Labour site", `2D ${s.labor.roll}: ${s.labor.state}`));
    if (s.habitat) rows.push(row("Habitat", `${s.habitat.occupied}; ${s.habitat.condition}`));
    if (s.lawNote) rows.push(row("Law", s.lawNote));
    sections.push({ heading: "Location encounter (p.101)", rows });
  }
  if (r.environment) {
    headline = r.environment.text;
    sections.push({ heading: "Environment encounter (p.104)", rows: [row("Roll", r.environment.code, r.environment.unique ? "unique atmosphere table" : "")], text: r.environment.note ?? "Avoiding it takes 6 hours on foot; dangerous weather passes in 1D days." });
  }
  return { title: "Planetside encounter", subtitle: r.location.label, icon: "fa-solid fa-mountain-sun", headline, sections, buttons };
}

/* ---------------------------------------------------------------- animals */

export function animalCard(a) {
  return {
    title: "Alien animal",
    subtitle: `${a.sizeLabel} ${a.behaviour} · ${a.terrainLabel}`,
    icon: "fa-solid fa-paw",
    headline: a.name,
    sections: [
      { rows: [
        row("Size (to hit)", `${a.sizeLabel} (${a.difficulty}+)`, a.swarm ? "swarm: 8+" : ""),
        row("Hits", a.hits, "pinned at 1/2, unconscious at 3/4"),
        row("Damage", `${a.damage} (flat ${a.flat})`),
        row("Behaviour", `${a.behaviour}: ${a.characteristic}`),
        row("Reaction (2D)", reactionRule(a.characteristicRow)),
        row("Number appearing", `${a.count} (${a.appearing})`),
        ...(a.armour ? [row("Armour", a.armour)] : []),
        ...(a.psi ? [row("PSI", a.psi)] : []),
        row("Earth example", a.example)
      ] },
      { heading: "Traits (p.113)", list: a.traitText },
      { text: DESCRIPTIONS[a.characteristic] ?? "" }
    ],
    buttons: [{ action: "tools-create-creature", label: "Create creature actor", icon: "fa-solid fa-paw" }]
  };
}

export function reactionRule(ch) {
  const flee = ch.flee !== null ? `flee ${ch.flee}-` : ch.fleeText;
  const fight = ch.fight !== null ? `fight ${ch.fight}+` : ch.fightText;
  return `${flee}; ignore ${ch.ignore}; ${fight}`;
}

/* ---------------------------------------------------------------- worlds */

export function worldRows(w) {
  const d = w.details;
  return [
    row("Starport", `${w.starport}: ${d.starport.quality}`, `fuel ${d.starport.fuel}; ${d.starport.facilities}${w.highport ? "; highport" : ""}${d.starport.berthing ? `; berthing ${cr(d.starport.berthing)}` : ""}`),
    row("Size", `${toHex(w.size)}: ${d.size.diameter}`, `${d.size.gravity}${d.size.example ? `; e.g. ${d.size.example}` : ""}`),
    row("Atmosphere", `${toHex(w.atmosphere)}: ${d.atmosphere.name}`, d.atmosphere.gear ? `needs ${d.atmosphere.gear}` : ""),
    row("Hydrographics", `${toHex(w.hydrographics)}: ${d.hydrographics.percent}`, d.hydrographics.text),
    row("Population", `${toHex(w.population)}: ${d.population.inhabitants}`, d.population.text),
    row("Government", `${toHex(w.government)}: ${d.government.name}`),
    row("Law level", toHex(w.law)),
    row("Tech level", `${toHex(w.tl)}: ${d.tech}`, w.tlNote),
    row("Bases", w.bases.length ? w.bases.join(" ") : "None"),
    row("Trade codes", w.tradeCodes.length ? w.tradeCodes.map(c => `${c} (${TRADE_CODES[c] ?? c})`).join(", ") : "None"),
    row("Travel zone", w.zone === "A" ? "Amber" : w.zone === "R" ? "Red" : "Green"),
    row("Temperature", `${w.temperature.type} (${w.temperature.temp})`, w.temperature.text)
  ];
}

export function worldCard(w, { uuid = null } = {}) {
  const sys = w.system;
  const sections = [{ rows: worldRows(w) }];
  if (sys) sections.push({ heading: "Star system (p.88-89)", rows: [row("System code", sys.code), row("Primary star", `${sys.star.cls} (${sys.star.color}); HZ ${sys.star.hz}`), row("Other objects", sys.objects.map(o => o.type).join(", ") || "None")] });
  return {
    title: "World",
    subtitle: w.line,
    icon: "fa-solid fa-earth-americas",
    headline: `${w.name} ${w.uwp}`,
    sections,
    buttons: uuid ? [{ action: "tools-open", uuid, label: "Open journal", icon: "fa-solid fa-book-open" }] : [{ action: "tools-create-world", label: "Create journal", icon: "fa-solid fa-book" }]
  };
}

/** HTML-escape for journal pages built as strings. */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Journal page HTML for a world (stored in the page; styled by styles/tools.css). */
export function worldPageHtml(w) {
  const rows = worldRows(w).map(r => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}${r.note ? `<br><small>${esc(r.note)}</small>` : ""}</td></tr>`).join("");
  const bans = lawBans(w.law);
  const banRows = ["weapons", "armour", "other"].map(k => `<tr><th>${k[0].toUpperCase()}${k.slice(1)}</th><td>${bans[k].length ? esc(bans[k].join("; ")) : "None"}</td></tr>`).join("");
  const bases = w.baseRolls.map(b => `<li>${esc(b.label)} ${b.target}+: 2D ${b.roll} — ${b.present ? "<strong>present</strong>" : "absent"}</li>`).join("");
  const tech = Object.entries(w.techDMs).filter(([, v]) => v).map(([k, v]) => `${k} ${signed(v)}`).join(", ") || "none";
  let system = "";
  const sys = w.system;
  if (sys) {
    const objects = sys.objects.map(o => {
      let t = `<strong>${esc(o.type)}</strong>`;
      if (o.text) t += `: ${esc(o.text)}`;
      if (o.moons) t += ` Moons: ${o.moons.length ? o.moons.map(toHex).join(", ") : "none"}.`;
      if (o.observation) t += `: ${esc(o.observation.type)}. ${esc(o.observation.text)}${o.observation.anomaly ? ` ${esc(o.observation.anomaly.type)}${o.observation.anomaly.detail ? ` (${esc(o.observation.anomaly.detail)})` : ""}.` : ""}`;
      if (o.world) t += ` <em>${esc(o.world.name)} ${esc(o.world.uwp)}</em> ${esc(o.world.tradeCodes.join(" "))}; ${esc(o.distance.text)}; ${esc(o.world.temperature.type)}${o.world.distance && o.distance.tempDM ? "; needs shielded settlements" : ""}.`;
      return `<li>${t}</li>`;
    }).join("");
    system = `<h2>Star system</h2>
<table class="sw-table"><tbody>
<tr><th>System code</th><td>${esc(sys.code)}</td></tr>
<tr><th>Primary star</th><td>${esc(sys.star.cls)} (${esc(sys.star.color)}), mass ${esc(sys.star.mass)}, radius ${esc(sys.star.radius)}</td></tr>
<tr><th>Habitable zone</th><td>${esc(sys.star.hz)}</td></tr>
<tr><th>Stellar objects</th><td>${sys.count} (${sys.inhabited} inhabited, ${sys.gasGiants} gas giants)</td></tr>
</tbody></table>
<ul class="sw-objects">${objects || "<li>No other objects.</li>"}</ul>`;
  }
  return `<div class="spacer spacer-world">
<p class="sw-uwp">${esc(w.line)}</p>
${w.capital ? "<p class=\"sw-capital\">Subsector capital</p>" : ""}
<h2>World profile</h2>
<table class="sw-table"><tbody>${rows}</tbody></table>
<h2>Law level ${toHex(w.law)} bans</h2>
<table class="sw-table"><tbody>${banRows}</tbody></table>
<h2>Bases and facilities</h2>
<ul>${bases}</ul>
<p><small>Tech level: 1D ${signed(w.rolls.tl - Object.values(w.techDMs).reduce((t, v) => t + v, 0))} with DMs ${esc(tech)}.</small></p>
${system}
<p class="sw-source"><small>Generated with the Spacer world rules (p.88-95).</small></p>
</div>`;
}

/** Overview page of a subsector: hex grid and world list. */
export function subsectorPageHtml(s, links = {}) {
  const byHex = Object.fromEntries(s.worlds.map(w => [w.hex, w]));
  let grid = "";
  for (let row = 1; row <= s.rows; row++) {
    grid += "<tr>";
    for (let col = 1; col <= s.cols; col++) {
      const cell = s.hexes.find(h => h.col === col && h.row === row);
      const w = byHex[cell.hex];
      const cls = w ? `ss-world${w.zone === "A" ? " ss-amber" : w.zone === "R" ? " ss-red" : ""}${w.capital ? " ss-capital" : ""}` : cell.kind === "uninhabited" ? "ss-star" : "ss-empty";
      const label = w ? (links[w.name] ? `@UUID[${links[w.name]}]{${esc(w.name)}}` : esc(w.name)) : cell.kind === "uninhabited" ? "red dwarf" : "";
      grid += `<td class="${cls}"><span class="ss-hex">${cell.hex}</span>${label ? `<span class="ss-name">${label}</span>` : ""}${w ? `<span class="ss-uwp">${esc(w.uwp)}</span>` : ""}</td>`;
    }
    grid += "</tr>";
  }
  const list = [...s.worlds].sort((a, b) => a.hex.localeCompare(b.hex)).map(w =>
    `<tr><td>${esc(w.hex)}</td><td>${links[w.name] ? `@UUID[${links[w.name]}]{${esc(w.name)}}` : esc(w.name)}${w.capital ? " (capital)" : ""}</td><td><code>${esc(w.uwp)}</code></td><td>${esc(w.bases.join(""))}</td><td>${esc(w.tradeCodes.join(" "))}</td><td>${esc(w.zone)}</td><td>${esc(w.system?.code ?? "")}</td></tr>`).join("");
  return `<div class="spacer spacer-subsector">
<p>${s.worlds.length} inhabited systems in ${s.cols} x ${s.rows} hexes; density ${esc(s.density)}. Capital: ${esc(s.capital ?? "none")}.</p>
<p><small>World presence: 1D + density DM per hex; 4+ inhabited, 1-3 empty, 0 or less an uninhabited red dwarf system (p.88).</small></p>
<table class="ss-grid"><tbody>${grid}</tbody></table>
<h2>Worlds</h2>
<table class="sw-table ss-list"><thead><tr><th>Hex</th><th>Name</th><th>UWP</th><th>Bases</th><th>Trade</th><th>Zone</th><th>System</th></tr></thead><tbody>${list}</tbody></table>
<h2>Courier routes</h2>
<p>Main courier routes link worlds of population 6+ (p.88): ${esc(s.courierWorlds.join(", ") || "none")}. Worlds of population 5 or less depend on freelance couriers.</p>
</div>`;
}

/* ---------------------------------------------------------------- trade, survival, oracle, clock */

export function freightCard(r, { destination = "" } = {}) {
  return { title: "Freight", subtitle: `${destination ? `To ${destination} · ` : ""}p.62`, icon: "fa-solid fa-boxes-stacked",
    headline: `${r.lots.length} shipments, ${r.totalTons} tons, ${cr(r.totalPay)}`,
    sections: [{ list: r.lots.map((l, i) => `Shipment ${i + 1}: ${l.tons} tons, ${cr(l.pay)} (cannot be split)`) }] };
}

export function passengersCard(r) {
  return { title: "Passengers", subtitle: `p.62 · DM ${signed(r.dm)}`, icon: "fa-solid fa-person-walking-luggage",
    headline: `Up to ${cr(r.total)}`,
    sections: [{ rows: ["high", "middle", "low"].map(k => row(`${k[0].toUpperCase()}${k.slice(1)} passage`, `${r[k].count} x ${cr(r[k].fare)}`, r[k].formula)) }] };
}

export function mailCard(r) {
  return { title: "Mail contract", subtitle: "p.62", icon: "fa-solid fa-envelope",
    headline: r.success ? `Contract won: ${cr(r.pay)} per delivery` : "No contract this year",
    sections: [{ rows: [row("Negotiation", `2D ${r.natural} = ${r.total}`, `${r.target}+`)], text: r.note }] };
}

export function survivalCard({ label, activity, task, extra = [] }) {
  return { title: label, subtitle: "Survival (p.106-107)", icon: "fa-solid fa-campground", headline: task ? `${task.success ? "Success" : "Failure"} (Effect ${signed(task.effect)})` : "",
    sections: [{ rows: extra }, { text: activity.text }] };
}

export function oracleCard(r) {
  const sections = [{ rows: [row("Likelihood", `${r.likelihood} (${signed(r.dm)})`), row("Roll", `2D ${r.dice.join("+")} ${signed(r.dm)} = ${r.total}`, "8+ yes; 12 yes-and; 2 no-and")] }];
  if (r.event) sections.push({ heading: "Random event (doubles)", rows: [row("Focus", r.event.focus), row("Detail", r.event.detail)] });
  return { title: "Solo oracle (not from the book)", subtitle: r.question || "Yes/no question", icon: "fa-solid fa-eye", headline: r.answer, sections };
}

export function eventCard(e) {
  return { title: "Random event (not from the book)", subtitle: "Details from the book's tables", icon: "fa-solid fa-bolt", headline: e.focus, sections: [{ rows: [row("Detail", e.detail)] }] };
}

export function clockCard({ date, label, delta, reminders = null }) {
  const sections = [];
  if (reminders) {
    sections.push({ heading: "Monthly reminders", list: reminders.items });
    if (reminders.ships.length) sections.push({ heading: "Ship costs per month", list: reminders.ships.map(s => `${s.name}: ${cr(s.total)}`) });
  }
  return { title: reminders ? "New month" : "Time passes", subtitle: label ? `${label} (+${delta})` : "", icon: "fa-solid fa-clock", headline: date, sections };
}
