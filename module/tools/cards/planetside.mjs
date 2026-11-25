/**
 * Chat cards of planetside exploration: weather (p.96-97), overland travel (p.98), planetside
 * encounters (p.100-104), survival (p.106-107), and food and water (p.106). Pure. Called by
 * module/tools/planetside.mjs.
 */
import { cr, row, reactionText, signed } from "./common.mjs";

/** Card data of a `rollWeather` result (rules/planetside.mjs). */
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

/** Card data of an `overlandTravel` result (rules/planetside.mjs). */
export function travelCard(r) {
  if (r.impossible) return { title: "Overland travel", subtitle: r.terrain, icon: "fa-solid fa-route", headline: r.text, sections: [] };
  if (r.mode === "walk" || r.mode === "swim") {
    return { title: "Overland travel", subtitle: `${r.mode === "swim" ? "Swimming" : "Walking"} · ${r.terrain}`, icon: "fa-solid fa-person-hiking", headline: `${r.km} km in ${r.hours} hours`, sections: [{ rows: [row("Speed", `${r.kmh} km/h`)] }] };
  }
  return {
    title: "Overland travel", subtitle: `Vehicle · ${r.terrain}`, icon: "fa-solid fa-truck-monster",
    headline: r.stopped ? "The vehicle is stopped (speed band 0)." : `Speed band ${r.speedBand} in ${r.gear}`,
    sections: [{
      rows: [row("Drive DM", signed(r.driveDM)), row("Failure", r.failure), row("Crash damage", r.crashDamage)],
      text: r.hazard ? "Terrain penalty -3 or worse: Speed Band 1 counts as Top Gear (p.98)." : ""
    }]
  };
}

/** Card data of a `planetsideEncounter` result (rules/planetside.mjs). */
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

/** Card data of a survival task: `task` is the rollTask result, `extra` more rows. */
export function survivalCard({ label, activity, task, extra = [] }) {
  return { title: label, subtitle: "Survival (p.106-107)", icon: "fa-solid fa-campground", headline: task ? `${task.success ? "Success" : "Failure"} (Effect ${signed(task.effect)})` : "",
    sections: [{ rows: extra }, { text: activity.text }] };
}

/** Card data of a `rations` result (rules/survival.mjs) for `people` people over `days` days. */
export function rationsCard(r, { people, days }) {
  return {
    title: "Food and water", subtitle: `${people} people x ${days} days (p.106)`, icon: "fa-solid fa-utensils",
    headline: cr(r.total),
    sections: [{ rows: [
      row("Food", `${r.foodKg} kg at ${cr(r.foodCost)} per day`),
      row("Water", `${r.waterL} L at ${cr(r.waterCost)} per day`)
    ], text: r.starvation }]
  };
}
