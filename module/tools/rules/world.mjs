/**
 * Star systems and worlds (book p.88-95): system details, other stellar objects, secondary worlds,
 * anomalies, unique observations, and main world generation (UWC). Pure. The book tables live in
 * rules/world-tables.mjs and are re-exported here; the subsector generator is in
 * rules/subsector.mjs.
 */
import { band, clamp } from "../../shared/dice.mjs";
import { toHex } from "../../config.mjs";
import {
  DENSITY, STARS, STRUCTURES, SECONDARY_DISTANCE, SIZE, ATMOSPHERE, HYDRO, POPULATION, GOVERNMENT, LAW, STARPORTS,
  STARPORT_ROLL, TECH_ERAS, TEMPERATURE
} from "./world-tables.mjs";

export * from "./world-tables.mjs";

/* ---------------------------------------------------------------- star system (p.88-89) */

/** Anomalies table (p.89), 2D. Called by `rollUniqueObservation`. Returns `{ roll, type, detail }`. */
export function rollAnomaly(dice) {
  const r = dice.twoD();
  if (r <= 2) return { roll: r, type: "Ancient Planet-Sized Megastructure Instead of a Planet", detail: ["Dyson sphere", "Ringworld", "Planetoid-sized geometric/polyhedral object"][dice.d3() - 1] };
  if (r <= 4) return { roll: r, type: "Orbital Structure Around Planet", detail: ["Abandoned orbital space colony", "Ring of derelict ships", "High density of space junk"][dice.d3() - 1] };
  if (r <= 9) return { roll: r, type: "Planetside Ancient Structure", detail: ["On surface", "Subterranean", "Floating/hovering"][dice.d3() - 1] };
  if (r <= 11) return { roll: r, type: "Strange Artifacts litter this planet", detail: "" };
  return { roll: r, type: "Reality-Bending Band of Spacetime Energy permeates a pocket of this system", detail: "" };
}

/** Unique Celestial Observation table (p.89), 2D. Called by `rollStellarObject`. Returns `{ roll, type, text, anomaly? }`. */
export function rollUniqueObservation(dice) {
  const r = dice.twoD();
  if (r <= 2) return { roll: r, type: "Anomaly", text: "A strange artificial celestial body exists within the system.", anomaly: rollAnomaly(dice) };
  if (r <= 4) return { roll: r, type: "Shattered World", text: "A planet shattered into large pieces by another body. Pilot checks incur -1 DM in this system." };
  if (r <= 9) return { roll: r, type: "Cluster", text: `A massive cloud of asteroids or planetoids (${["torus", "spherical", "asymmetrical"][dice.d3() - 1]}). -2 DM to Pilot checks and -1 DM to Astrogation.` };
  if (r <= 11) return { roll: r, type: "Secondary Star", text: "A secondary star twice as weak as the primary. Jumping is -2 DM." };
  return { roll: r, type: "Black Hole", text: "A black hole is the primary gravitational body; the star and planets orbit outside its Schwarzschild radius. Jumping in and out is -3 DM." };
}

/** Moon sizes (p.89): D3-1 per moon on Step 1 of the world generator. */
function rollMoons(dice, n) {
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(Math.max(0, dice.roll("D3-1")));
  return sizes;
}

/**
 * Other Stellar Objects (p.89), 2D for each object. Called by `generateSystem`; `secondaryWorld`
 * builds the world of a "Secondary World" result. Returns `{ roll, type, text, ... }`.
 */
export function rollStellarObject(dice, { secondaryWorld = null } = {}) {
  const r = dice.twoD();
  if (r <= 2) return { roll: r, type: "Unique Celestial Observation", observation: rollUniqueObservation(dice) };
  if (r <= 5) { const moons = dice.d3(); return { roll: r, type: "Barren", text: "Rock ball, devoid of atmosphere. May have industrial facilities or small colonies.", moons: rollMoons(dice, moons) }; }
  if (r <= 8) { const moons = dice.d6(); return { roll: r, type: "Gas Giant", text: "Its moons may be bases for pirates, corporations, or other groups.", moons: rollMoons(dice, moons), gasGiant: true }; }
  if (r <= 11) {
    const s = dice.d6();
    let detail = STRUCTURES[s - 1];
    if (s === 5) detail = `Colony cluster: ${dice.d6()} colonies`;
    if (s === 6) {
      const occupied = dice.d6() >= 4;
      detail = `Abandoned ${STRUCTURES[dice.d3() - 1].toLowerCase()}${occupied ? ", occupied by squatters, pirates, or other spacers" : ", empty"}`;
    }
    return { roll: r, type: "Structure", text: detail };
  }
  const distance = band(SECONDARY_DISTANCE, dice.twoD());
  const world = secondaryWorld ? secondaryWorld(distance) : null;
  return { roll: r, type: "Secondary World", text: "An inhabited minor planet of the system.", distance, world, inhabited: true };
}

/**
 * Star system details (p.88-89). Code: hex-StarClass + objects + inhabited + gas giants,
 * e.g. "0205-G521". Object count includes the main world. Called by `generateStarSystem`.
 */
export function generateSystem(dice, { hex = "0101", density = "typical", main = null, secondaryWorld = null } = {}) {
  const dm = DENSITY[density]?.dm ?? 0;
  const starRoll = dice.twoD() + dm;
  const star = band(STARS, starRoll);
  const others = Math.max(0, dice.roll(star.objects));
  const objects = [];
  for (let i = 0; i < others; i++) objects.push(rollStellarObject(dice, { secondaryWorld }));
  const gasGiants = objects.filter(o => o.gasGiant).length;
  const inhabited = 1 + objects.filter(o => o.inhabited).length;
  const code = `${hex}-${star.cls}${toHex(others + 1)}${toHex(inhabited)}${toHex(gasGiants)}`;
  return { starRoll, star, objects, gasGiants, inhabited, count: others + 1, code, main };
}

/* ---------------------------------------------------------------- main world (p.90-95) */

/** Starport DM by population (p.93). Called by `generateWorld`. */
export function starportDM(pop) {
  if (pop >= 10) return 2;
  if (pop >= 8) return 1;
  if (pop >= 3 && pop <= 4) return -1;
  if (pop <= 2) return -2;
  return 0;
}

/** Tech Level DMs (p.94) of a partial world. Called by `generateWorld`. Returns `{ starport, size, ... }`. */
// BOOK: the population column of the TL table stops at 10 (A) +4; we give +4 to population 11-12
// too, since larger populations do not lower the tech level.
export function techDMs(w) {
  const parts = {};
  parts.starport = { A: 6, B: 4, C: 2, X: -4 }[w.starport] ?? 0;
  parts.size = w.size <= 1 ? 2 : w.size <= 4 ? 1 : 0;
  parts.atmosphere = w.atmosphere <= 3 || w.atmosphere >= 10 ? 1 : 0;
  parts.hydrographics = w.hydrographics === 0 || w.hydrographics === 9 ? 1 : w.hydrographics >= 10 ? 2 : 0;
  parts.population = w.population >= 1 && w.population <= 5 ? 1 : w.population === 8 ? 1 : w.population === 9 ? 2 : w.population >= 10 ? 4 : 0;
  parts.government = w.government === 0 || w.government === 5 ? 1 : w.government === 7 ? 2 : w.government === 13 || w.government === 14 ? -2 : 0;
  return parts;
}

/** Environmental limits on Tech Level (p.94): minimum TL by atmosphere. Called by `generateWorld`. */
export function minimumTL(atm) {
  if (atm <= 1) return 8;
  if (atm <= 3) return 5;
  if ([4, 7, 9].includes(atm)) return 3;
  if (atm === 10) return 8;
  if (atm === 11) return 9;
  if (atm === 12) return 10;
  if (atm === 13 || atm === 14) return 5;
  if (atm === 15) return 8;
  return 0;
}

/** Trade codes (p.95) of a world. Called by `generateWorld`. Returns codes in the book's order. */
// BOOK: p.95 uses "Te" for High Tech; we use "Ht" as the trade table does (p.64-65).
// BOOK: Ice-Capped (Ic) needs atmosphere 0-1 and hydrographics 1+, but Step 3 makes every
// atmosphere 0-1 world hydrographics 0, so the generator never gives Ic. We keep the rule for
// worlds typed by hand.
export function tradeCodes(w) {
  const { size, atmosphere: a, hydrographics: h, population: p, government: g, tl } = w;
  const in_ = (v, lo, hi) => v >= lo && v <= hi;
  const codes = [];
  if (in_(a, 4, 9) && in_(h, 4, 8) && in_(p, 5, 7)) codes.push("Ag");
  if (size === 0 && a === 0 && h === 0) codes.push("As");
  if (in_(a, 2, 9) && h === 0) codes.push("De");
  if (in_(a, 0, 1) && h >= 1) codes.push("Ic");
  if (([0, 1, 2, 4, 7].includes(a) || in_(a, 9, 12)) && p >= 8) codes.push("In");
  if (tl <= 5 && p > 0) codes.push("Lt");
  if (in_(a, 0, 3) && in_(h, 0, 3) && p >= 6) codes.push("Na");
  if (in_(p, 4, 6)) codes.push("Ni");
  if (in_(a, 2, 5) && in_(h, 0, 3)) codes.push("Po");
  if ([6, 8].includes(a) && in_(p, 6, 8) && in_(g, 4, 9)) codes.push("Ri");
  if (tl >= 12) codes.push("Ht");
  if (a === 0) codes.push("Va");
  if ((in_(a, 3, 9) || a >= 13) && h >= 10) codes.push("Wa");
  return codes;
}

/**
 * Travel zone (p.95): "A", "R", or "". Called by `generateWorld`. War and criminal control
 * (also Red) are left to the referee.
 */
// BOOK: "Atmosphere 10+ and Government Codes 0, 7, or 10 with Law Level 0 or 9+" can be read as
// one rule or two; we read two: atmosphere 10+ is Amber, and government 0, 7, or 10 with law
// level 0 or 9+ is Amber. Red is "a Low Tech world (5 or less) without a starport": TL 5 or less
// with starport X, for populated worlds only.
export function travelZone(w) {
  if (w.population > 0 && w.tl <= 5 && w.starport === "X") return "R";
  if (w.atmosphere >= 10) return "A";
  if ([0, 7, 10].includes(w.government) && (w.law === 0 || w.law >= 9)) return "A";
  return "";
}

/** Temperature DM by atmosphere (p.95). Called by `generateWorld`. */
// BOOK: atmosphere 0-1 (no air to hold heat) gets +0 while the thin atmospheres 2-3 get -2; this
// looks odd, but we follow the list as printed.
export function temperatureDM(atm) {
  if ([0, 1, 6, 7].includes(atm)) return 0;
  if (atm <= 3) return -2;
  if ([4, 5, 14].includes(atm)) return -1;
  if (atm === 8 || atm === 9) return 1;
  if ([10, 13, 15].includes(atm)) return 2;
  if (atm === 11 || atm === 12) return 6;
  return 0;
}

/** UWP string of a world: "BA6A743-9". Called by `generateWorld` and `worldLine`. */
export function uwp(w) {
  return `${w.starport}${toHex(w.size)}${toHex(w.atmosphere)}${toHex(w.hydrographics)}${toHex(w.population)}${toHex(w.government)}${toHex(w.law)}-${toHex(w.tl)}`;
}

/** Full world line: "Name 0205 BA6A743-9 N Ri Wa A". Called by `generateWorld`. */
export function worldLine(w) {
  return [w.name, w.hex, uwp(w), w.bases.join(""), w.tradeCodes.join(" "), w.zone].filter(Boolean).join(" ");
}

/**
 * Generate a main world (p.90-95), steps 1-10 and temperature. Called by `generateStarSystem`
 * and `generateSecondaryWorld`. Returns the world: codes, `uwp`, `line`, `bases`, `tradeCodes`,
 * `zone`, `temperature`, the raw `rolls`, and the table `details`.
 * @param {object} o
 * @param {string} o.sizeMode   "standard" (2D-2), "earthlike" (2D+1), or "large" (2D+3) (p.91)
 * @param {number} o.popDM      population DMs (p.92): capital, dense subsector, travel route
 * @param {number} o.tempDM     extra temperature DM (secondary worlds, p.89)
 */
export function generateWorld(dice, { name = "", hex = "", sizeMode = "standard", popDM = 0, tempDM = 0 } = {}) {
  const rolls = {};
  const sizeDice = { standard: "2D-2", earthlike: "2D+1", large: "2D+3" }[sizeMode] ?? "2D-2";
  rolls.size = dice.roll(sizeDice);
  const size = clamp(rolls.size, 0, 15);

  rolls.atmosphere = dice.roll("2D-7") + size;
  const atmosphere = clamp(rolls.atmosphere, 0, 15);

  rolls.hydrographics = dice.roll("2D-7") + size + (atmosphere <= 1 || atmosphere >= 10 ? -4 : 0);
  const hydrographics = size <= 1 || atmosphere <= 1 ? 0 : clamp(rolls.hydrographics, 0, 10);

  rolls.population = dice.roll("2D-2") + popDM;
  const population = clamp(rolls.population, 0, 12);

  // BOOK: the book does not say what government and law a population 0 world has; we set both
  // to 0, and the TL to 0 below (no one lives there to make anything).
  rolls.government = dice.roll("2D-7") + population;
  const government = population === 0 ? 0 : clamp(rolls.government, 0, 15);
  rolls.law = dice.roll("2D-7") + government;
  const law = population === 0 ? 0 : clamp(rolls.law, 0, 15);

  rolls.starport = dice.twoD() + starportDM(population);
  const starport = band(STARPORT_ROLL, rolls.starport);
  const sp = STARPORTS[starport];
  const bases = [];
  const baseRolls = [];
  for (const [code, label, target] of sp.bases) {
    const r = dice.twoD();
    baseRolls.push({ code, label, target, roll: r, present: r >= target });
    if (r >= target) bases.push(code);
  }
  let highport = false;
  if (sp.highport) { const r = dice.twoD(); highport = r >= sp.highport; baseRolls.push({ code: "H", label: "Highport", target: sp.highport, roll: r, present: highport }); }
  const berthing = sp.berthing ? dice.roll(sp.berthing[0]) * sp.berthing[1] : 0;

  const partial = { starport, size, atmosphere, hydrographics, population, government, law };
  const dms = techDMs(partial);
  rolls.tl = dice.d6() + Object.values(dms).reduce((t, v) => t + v, 0);
  let tl = population === 0 ? 0 : clamp(rolls.tl, 0, 16);
  const minTL = minimumTL(atmosphere);
  let tlNote = "";
  if (population > 0 && tl < minTL) { tlNote = `Raised from ${tl} to the environmental minimum ${minTL} (p.94).`; tl = minTL; }

  const w = { name, hex, ...partial, tl, bases };
  w.tradeCodes = tradeCodes(w);
  w.zone = travelZone(w);
  rolls.temperature = dice.twoD() + temperatureDM(atmosphere) + tempDM;
  const temperature = band(TEMPERATURE, rolls.temperature);

  return {
    ...w,
    uwp: uwp(w),
    line: worldLine(w),
    highport,
    berthing,
    baseRolls,
    techDMs: dms,
    tlNote,
    temperature,
    rolls,
    details: {
      size: SIZE[size], atmosphere: ATMOSPHERE[atmosphere], hydrographics: HYDRO[hydrographics],
      population: POPULATION[population], government: GOVERNMENT[government], law: LAW[law],
      starport: { cls: starport, ...sp, berthing }, tech: TECH_ERAS[Math.min(16, tl)]
    }
  };
}

/** Law bans up to a level (p.93; each level bans everything listed above it). Called by the world journal page. */
export function lawBans(level) {
  const out = { weapons: [], armour: [], other: [] };
  for (let i = 0; i <= Math.min(15, level); i++) {
    for (const k of ["weapons", "armour", "other"]) if (LAW[i][k] && LAW[i][k] !== "None") out[k].push(LAW[i][k]);
  }
  return out;
}

/* ---------------------------------------------------------------- names */

const SYL_A = ["ka", "ve", "lo", "ar", "zen", "mi", "tor", "sa", "rin", "dra", "ce", "ul", "no", "phe", "qua", "bel", "ty", "or", "es", "gal", "hy", "io", "jun", "kor"];
const SYL_B = ["ra", "lis", "dor", "na", "mar", "vi", "ton", "rus", "ga", "nis", "la", "ber", "tis", "mon", "ka", "ris", "do", "via", "nor", "sel"];
const SYL_C = ["", "", "", "a", "on", "is", "ar", "en", "ia", "ux", "ae", "or"];

/** A pronounceable random name (not from the book). Called by the world and subsector generators. */
export function randomName(dice) {
  const n = dice.pick(SYL_A) + dice.pick(SYL_B) + dice.pick(SYL_C);
  return n[0].toUpperCase() + n.slice(1);
}

/* ---------------------------------------------------------------- full system + subsector */

/** A secondary world (p.89): the world generator with the distance's temperature DM. Called by `generateStarSystem`. */
export function generateSecondaryWorld(dice, distance, { mainName = "", index = 1 } = {}) {
  const w = generateWorld(dice, { name: `${mainName}-${index + 1}`, tempDM: distance.tempDM });
  return { ...w, distance: distance.text, shielded: distance.tempDM !== 0 };
}

/**
 * Generate a main world and its star system together. Called by `generateWorld` in
 * module/tools/worlds.mjs and by `generateSubsector`. `popDM` holds the DMs of p.92 other than
 * the dense subsector DM, which this function adds. Returns the main world with `system`.
 */
export function generateStarSystem(dice, { name = "", hex = "0101", density = "typical", sizeMode = "standard", popDM = 0 } = {}) {
  const worldName = name || randomName(dice);
  const main = generateWorld(dice, { name: worldName, hex, sizeMode, popDM: popDM + (density === "dense" ? 1 : 0) });
  let idx = 0;
  const system = generateSystem(dice, {
    hex, density, main: null,
    secondaryWorld: distance => generateSecondaryWorld(dice, distance, { mainName: worldName, index: ++idx })
  });
  main.system = system;
  return main;
}
