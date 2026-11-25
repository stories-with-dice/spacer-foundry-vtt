/**
 * Journal page HTML of a world and of a subsector overview (p.88-95). Pure. Styled by
 * styles/tools.css. Called by module/tools/worlds.mjs.
 */
import { toHex } from "../../config.mjs";
import { lawBans } from "../rules/world.mjs";
import { esc, signed } from "./common.mjs";
import { worldRows } from "./worlds.mjs";

/** Journal page HTML for a world (stored in the page). */
export function worldPageHtml(w) {
  const rows = worldRows(w).map(r => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}${r.note ? `<br><small>${esc(r.note)}</small>` : ""}</td></tr>`).join("");
  const bans = lawBans(w.law);
  const banRows = ["weapons", "armour", "other"].map(k => `<tr><th>${k[0].toUpperCase()}${k.slice(1)}</th><td>${bans[k].length ? esc(bans[k].join("; ")) : "None"}</td></tr>`).join("");
  const bases = w.baseRolls.map(b => `<li>${esc(b.label)} ${b.target}+: 2D ${b.roll} — ${b.present ? "<strong>present</strong>" : "absent"}</li>`).join("");
  const tech = Object.entries(w.techDMs).filter(([, v]) => v).map(([k, v]) => `${k} ${signed(v)}`).join(", ") || "none";
  const popNames = { capital: "within 1 parsec of the capital", route: "near a main route", dense: "dense subsector", capitalInSubsector: "capital in the subsector" };
  const popDMs = w.popDMs ? `<p><small>Population DMs (p.92): ${esc(Object.entries(w.popDMs).map(([k, v]) => `${popNames[k] ?? k} ${signed(v)}`).join(", ") || "none")}.</small></p>` : "";
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
${popDMs}
${system}
<p class="sw-source"><small>Generated with the Spacer world rules (p.88-95).</small></p>
</div>`;
}

/** Overview page of a subsector: hex grid and world list. `links` maps world names to journal UUIDs. */
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
