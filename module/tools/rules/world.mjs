/**
 * Star systems and worlds (book p.88-95): system details, primary star, other stellar objects,
 * secondary worlds, anomalies, unique observations, and main world generation (UWC). Also the
 * subsector generator (p.88). Pure.
 */
import { band, clamp } from "./dice.mjs";
import { toHex } from "../../config.mjs";

/* ---------------------------------------------------------------- star system (p.88-89) */

/** Sector density DM (p.88): to the world presence roll and to the star type roll. */
export const DENSITY = {
  rift: { label: "Rift or empty", dm: -2 },
  sparse: { label: "Sparse", dm: -1 },
  typical: { label: "Typical", dm: 0 },
  dense: { label: "Densely populated", dm: 1 }
};

/**
 * Primary Star table (p.88), 2D + density DM. The book skips a roll of 9; it is read as G
 * (the 6-8 row), the most common star class.
 */
export const STARS = [
  [null, 3, { cls: "M", color: "Red", mass: "0.01-0.4M", radius: "Less than 0.5R", objects: "D3", hz: "0.25 AU" }],
  [4, 5, { cls: "K", color: "Orange", mass: "0.5-0.7M", radius: "0.6-0.8R", objects: "1D", hz: "0.5 AU" }],
  [6, 9, { cls: "G", color: "Yellow", mass: "0.8-1M", radius: "0.9-1.1R", objects: "2D", hz: "1 AU" }],
  [10, 11, { cls: "F", color: "White", mass: "1.1-1.5M", radius: "1.2-1.5R", objects: "1D", hz: "1.5 AU" }],
  [12, null, { cls: "A", color: "Blue", mass: "1.6-2.5M", radius: "1.6-2R", objects: "D3", hz: "2.5 AU" }]
];

export const STRUCTURES = [
  "Belter base", "Communication or remote research station", "Remote starbase port station", "Scrap or salvage base",
  "Colony cluster", "Abandoned structure"
];

/** Secondary world distance (p.89), 2D. */
export const SECONDARY_DISTANCE = [
  [null, 2, { text: "10% closer than the Goldilocks Zone", tempDM: 4 }],
  [3, 4, { text: "5% closer than the Goldilocks Zone", tempDM: 2 }],
  [5, 9, { text: "Within the Goldilocks Zone", tempDM: 0 }],
  [10, 11, { text: "5% further than the Goldilocks Zone", tempDM: -2 }],
  [12, null, { text: "10% further than the Goldilocks Zone", tempDM: -4 }]
];

/** Anomalies table (p.89), 2D. */
export function rollAnomaly(dice) {
  const r = dice.twoD();
  if (r <= 2) return { roll: r, type: "Ancient Planet-Sized Megastructure Instead of a Planet", detail: ["Dyson sphere", "Ringworld", "Planetoid-sized geometric/polyhedral object"][dice.d3() - 1] };
  if (r <= 4) return { roll: r, type: "Orbital Structure Around Planet", detail: ["Abandoned orbital space colony", "Ring of derelict ships", "High density of space junk"][dice.d3() - 1] };
  if (r <= 9) return { roll: r, type: "Planetside Ancient Structure", detail: ["On surface", "Subterranean", "Floating/hovering"][dice.d3() - 1] };
  if (r <= 11) return { roll: r, type: "Strange Artifacts litter this planet", detail: "" };
  return { roll: r, type: "Reality-Bending Band of Spacetime Energy permeates a pocket of this system", detail: "" };
}

/** Unique Celestial Observation table (p.89), 2D. */
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

/** Other Stellar Objects (p.89), 2D for each object. */
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
 * e.g. "0205-G521". Object count includes the main world.
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

export const SIZE = [
  { diameter: "1,000km or less", example: "Asteroid", gravity: "Minimal to none" },
  { diameter: "1,600km", example: "Triton", gravity: "0.25G" },
  { diameter: "3,200km", example: "Luna, Europa", gravity: "0.25G" },
  { diameter: "4,800km", example: "Mercury", gravity: "0.25G" },
  { diameter: "6,400km", example: "Mars", gravity: "0.5G" },
  { diameter: "8,000km", example: "", gravity: "0.5G" },
  { diameter: "9,600km", example: "", gravity: "0.5G" },
  { diameter: "11,200km", example: "", gravity: "1G" },
  { diameter: "12,800km", example: "Earth", gravity: "1G" },
  { diameter: "14,400km", example: "", gravity: "1G" },
  { diameter: "16,000km", example: "", gravity: "1.5G" },
  { diameter: "17,600km", example: "", gravity: "1.5G" },
  { diameter: "19,200km", example: "", gravity: "2G" },
  { diameter: "20,800km", example: "", gravity: "2G" },
  { diameter: "22,400km", example: "", gravity: "2G" },
  { diameter: "24,000km", example: "", gravity: "2G" }
];

export const ATMOSPHERE = [
  { name: "None", example: "Moon", gear: "Vaccsuit" },
  { name: "Trace", example: "Mars", gear: "Vaccsuit" },
  { name: "Very Thin, Tainted", example: "", gear: "Respirator w/ filter" },
  { name: "Very Thin", example: "", gear: "Respirator" },
  { name: "Thin, Tainted", example: "", gear: "Filter mask" },
  { name: "Thin", example: "", gear: "" },
  { name: "Standard", example: "Earth", gear: "" },
  { name: "Standard, Tainted", example: "", gear: "Filter mask" },
  { name: "Dense", example: "", gear: "" },
  { name: "Dense, Tainted", example: "", gear: "Filter mask" },
  { name: "Exotic", example: "", gear: "Air supply" },
  { name: "Corrosive", example: "Venus", gear: "Vaccsuit" },
  { name: "Insidious", example: "", gear: "Vaccsuit" },
  { name: "Very Dense", example: "", gear: "" },
  { name: "Low", example: "", gear: "" },
  { name: "Unusual", example: "", gear: "Varies" }
];

export const HYDRO = [
  { percent: "0-5%", text: "Desert world" }, { percent: "6-15%", text: "Dry world" }, { percent: "16-25%", text: "A few small seas" },
  { percent: "26-35%", text: "Small seas and oceans" }, { percent: "36-45%", text: "Wet world" }, { percent: "46-55%", text: "A large ocean" },
  { percent: "56-65%", text: "A few large oceans" }, { percent: "66-75%", text: "Many large oceans (Earth-like)" },
  { percent: "76-85%", text: "Islands and archipelagos" }, { percent: "86-95%", text: "Nearly all water, with a few islands" },
  { percent: "96-100%", text: "Waterworld" }
];

export const POPULATION = [
  { inhabitants: "None", text: "" }, { inhabitants: "Few", text: "Single person or family" },
  { inhabitants: "Hundreds", text: "Tiny settlement or research colony" }, { inhabitants: "Thousands", text: "" },
  { inhabitants: "Tens of Thousands", text: "Small settlement or new colony" }, { inhabitants: "Hundreds of Thousands", text: "Medium settlement or developing colony" },
  { inhabitants: "Millions", text: "" }, { inhabitants: "Tens of Millions", text: "Large settlement or established colony" },
  { inhabitants: "Hundreds of Millions", text: "Many large settlements/colonies and small nations" },
  { inhabitants: "Billions", text: "Many large nations, present-day Earth" }, { inhabitants: "Tens of Billions", text: "" },
  { inhabitants: "Hundreds of Billions", text: "Overpopulated settlements" }, { inhabitants: "Trillions", text: "World-city" }
];

export const GOVERNMENT = [
  { name: "None", text: "No formal governing structure except for family and interpersonal relationships." },
  { name: "Company/Corporation", text: "For-profit organizations run by managerial elites who govern the citizenry with corporate organizational structures." },
  { name: "Participating Democracy", text: "The citizens have a direct voice in the ruling functions of government via direct democratic methods and assemblies." },
  { name: "Self-Perpetuating Oligarchy", text: "The government is led by an elite class who maintains power with minimal to no input from the general population." },
  { name: "Representative Democracy", text: "Laws and government are dictated by elected individuals from the general population." },
  { name: "Feudal Technocracy", text: "Government functions within a caste-based structure driven by technological implementation." },
  { name: "Captive Government", text: "Imposed leader or puppet government controlled by an outside government." },
  { name: "Balkanisation", text: "No central government. Small political governments in perpetual conflict; laws are set by the local government." },
  { name: "Civil Service Bureaucracy", text: "Government agencies led by groups and individuals with specific expertise maintain civil function and services." },
  { name: "Impersonal Bureaucracy", text: "Agencies govern without input from the population. Leaders are insulated from government stagnation." },
  { name: "Charismatic Dictator", text: "A single leader determines the rule of law and the direction of society." },
  { name: "Non-Charismatic Leader", text: "An impersonal leader who determines the government without popular enthusiasm." },
  { name: "Charismatic Oligarchy", text: "The population elevates an elite few to drive society in an ideal direction." },
  { name: "Religious Sovereignty", text: "A religious organisation determines the roles of government." },
  { name: "Religious Autocracy", text: "A single individual or small group has absolute power via “divine right” and religious authority." },
  { name: "Totalitarian Oligarchy", text: "The few force their will onto the many with oppressive and coercive methods." }
];

/** Law level bans (p.93). Each level also bans everything of the lower levels. */
export const LAW = [
  { weapons: "None", armour: "None", other: "" },
  { weapons: "", armour: "", other: "" },
  { weapons: "Poison gas, explosives, WMD, unregistered or undetectable weaponry", armour: "Battle dress", other: "" },
  { weapons: "Portable energy and laser weapons", armour: "Combat armour", other: "" },
  { weapons: "Military-grade weaponry", armour: "Flak", other: "" },
  { weapons: "Light assault weapons and SMG", armour: "Mesh", other: "" },
  { weapons: "All firearms except shotguns and stunners; carrying weapons discouraged", armour: "", other: "Off-world pets" },
  { weapons: "Shotguns", armour: "", other: "Recreational drugs" },
  { weapons: "Bladed weapons and stunners", armour: "All visible armour", other: "" },
  { weapons: "All carried weapons", armour: "All worn armour", other: "Subdermal weapons and armour" },
  { weapons: "", armour: "", other: "Exposed cybernetics; must cover up" },
  { weapons: "“Natural weaponry”", armour: "", other: "Cybernetics" },
  { weapons: "", armour: "", other: "Androids" },
  { weapons: "", armour: "", other: "Sophonts and other cultures" },
  { weapons: "", armour: "", other: "All robots" },
  { weapons: "", armour: "", other: "“Unnatural” life" }
];

/** Starport table (p.93). Bases: [code, label, target]. */
export const STARPORTS = {
  X: { quality: "No Starport", berthing: null, fuel: "None", facilities: "None", highport: null, bases: [["P", "Pirate", 10], ["S", "Scout", 12]] },
  E: { quality: "Frontier", berthing: null, fuel: "None", facilities: "None", highport: null, bases: [["P", "Pirate", 10], ["S", "Scout", 10]] },
  D: { quality: "Poor", berthing: ["1D", 10], fuel: "Unrefined", facilities: "Limited repair", highport: 12, bases: [["S", "Scout", 8], ["P", "Pirate", 12]] },
  C: { quality: "Serviceable", berthing: ["1D", 100], fuel: "Unrefined", facilities: "Shipyard (small craft), repair", highport: 10, bases: [["M", "Military", 10], ["S", "Scout", 9]] },
  B: { quality: "Good", berthing: ["1D", 500], fuel: "Refined", facilities: "Shipyard (spacecraft), repair", highport: 8, bases: [["M", "Military", 8], ["N", "Naval", 8], ["S", "Scout", 9]] },
  A: { quality: "Excellent", berthing: ["1D", 1000], fuel: "Refined", facilities: "Shipyard (all), repair", highport: 6, bases: [["M", "Military", 8], ["N", "Naval", 8], ["S", "Scout", 10]] }
};
export const STARPORT_ROLL = [[null, 2, "X"], [3, 4, "E"], [5, 6, "D"], [7, 8, "C"], [9, 10, "B"], [11, null, "A"]];

/** Starport DM by population (p.93). */
export function starportDM(pop) {
  if (pop >= 10) return 2;
  if (pop >= 8) return 1;
  if (pop >= 3 && pop <= 4) return -1;
  if (pop <= 2) return -2;
  return 0;
}

/** Tech Level DMs (p.94). */
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

/** Environmental limits on Tech Level (p.94): minimum TL by atmosphere. */
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

export const TECH_ERAS = [
  "Stone Age", "Metal Age / Ancient", "Post-Classical", "Early Modern", "Industrial Age", "Machine Age", "Nuclear Age",
  "Space Age", "Information Age", "Intrastellar Age", "Interstellar Age (J-1)", "Interstellar Age (J-2)", "Interstellar Age (J-3)",
  "Interstellar Age (J-4)", "Interstellar Age (J-5)", "Interstellar Age (J-6)", "Intergalactic Age"
];

/** Trade codes (p.95). Returns codes in the book's order. */
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
 * Travel zone (p.95). Amber: atmosphere 10+, or government 0, 7, or 10 with law level 0 or 9+.
 * Red: a low-tech world (TL 5 or less) without a starport. War and criminal control are left to
 * the referee.
 */
export function travelZone(w) {
  if (w.population > 0 && w.tl <= 5 && w.starport === "X") return "R";
  if (w.atmosphere >= 10) return "A";
  if ([0, 7, 10].includes(w.government) && (w.law === 0 || w.law >= 9)) return "A";
  return "";
}

/** Temperature DM by atmosphere (p.95). */
export function temperatureDM(atm) {
  if ([0, 1, 6, 7].includes(atm)) return 0;
  if (atm <= 3) return -2;
  if ([4, 5, 14].includes(atm)) return -1;
  if (atm === 8 || atm === 9) return 1;
  if ([10, 13, 15].includes(atm)) return 2;
  if (atm === 11 || atm === 12) return 6;
  return 0;
}
export const TEMPERATURE = [
  [null, 2, { type: "Frozen", temp: "-31C or less", text: "Frozen water, dry atmosphere" }],
  [3, 4, { type: "Cold", temp: "0C to -30C", text: "Some liquid water, large ice caps, some clouds" }],
  [5, 9, { type: "Temperate", temp: "0C to 30C", text: "Similar to Earth. Ice caps, liquid water and clouds are common." }],
  [10, 11, { type: "Hot", temp: "31C to 80C", text: "Minimal to no ice caps; dense clouds with uncommon liquid water" }],
  [12, null, { type: "Boiling", temp: "81C+", text: "Extremely dense clouds, minimal to no liquid water" }]
];

/** UWP string: "BA6A743-9". */
export function uwp(w) {
  return `${w.starport}${toHex(w.size)}${toHex(w.atmosphere)}${toHex(w.hydrographics)}${toHex(w.population)}${toHex(w.government)}${toHex(w.law)}-${toHex(w.tl)}`;
}

/** Full world line: "Name 0205 BA6A743-9 N Ri Wa A". */
export function worldLine(w) {
  return [w.name, w.hex, uwp(w), w.bases.join(""), w.tradeCodes.join(" "), w.zone].filter(Boolean).join(" ");
}

/**
 * Generate a main world (p.90-95), steps 1-10 and temperature.
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

  // A world with no population has no government or law (common convention; the book is silent).
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

/** Law bans up to a level (each level bans everything listed above it). */
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

/** A pronounceable random name. */
export function randomName(dice) {
  const n = dice.pick(SYL_A) + dice.pick(SYL_B) + dice.pick(SYL_C);
  return n[0].toUpperCase() + n.slice(1);
}

/* ---------------------------------------------------------------- full system + subsector */

/** A secondary world (p.89): the world generator with the distance's temperature DM. */
export function generateSecondaryWorld(dice, distance, { mainName = "", index = 1 } = {}) {
  const w = generateWorld(dice, { name: `${mainName}-${index + 1}`, tempDM: distance.tempDM });
  return { ...w, distance: distance.text, shielded: distance.tempDM !== 0 };
}

/**
 * Generate a main world and its star system together.
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

/** Hex label "0305" for column 3, row 5. */
export const hexLabel = (col, row) => `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;

/** Distance in parsecs between two hexes on an odd-q layout (columns down, odd columns high). */
export function hexDistance(a, b) {
  const toCube = ({ col, row }) => {
    const x = col;
    const z = row - Math.floor((col + (col & 1)) / 2);
    return { x, z, y: -x - z };
  };
  const p = toCube(a), q = toCube(b);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

/**
 * Subsector (p.88): 8 x 10 hexes. For each hex roll 1D + density DM: 4+ inhabited system,
 * 1-3 empty, 0 or less an uninhabited (red dwarf) star system. The capital is the world with the
 * highest population, then tech level. Courier routes link worlds of population 6+.
 */
export function generateSubsector(dice, { name = "", density = "typical", cols = 8, rows = 10, sizeMode = "standard" } = {}) {
  const dm = DENSITY[density]?.dm ?? 0;
  const hexes = [];
  const worlds = [];
  for (let col = 1; col <= cols; col++) {
    for (let row = 1; row <= rows; row++) {
      const hex = hexLabel(col, row);
      const roll = dice.d6() + dm;
      const kind = roll >= 4 ? "inhabited" : roll >= 1 ? "empty" : "uninhabited";
      const cell = { hex, col, row, roll, kind };
      if (kind === "inhabited") {
        const w = generateStarSystem(dice, { hex, density, sizeMode });
        w.col = col; w.row = row;
        cell.world = w.name;
        worlds.push(w);
      }
      hexes.push(cell);
    }
  }
  const capital = [...worlds].sort((a, b) => b.population - a.population || b.tl - a.tl)[0] ?? null;
  if (capital) capital.capital = true;
  const network = worlds.filter(w => w.population >= 6).map(w => w.name);
  return { kind: "subsector", name: name || `${randomName(dice)} Subsector`, density, cols, rows, hexes, worlds, capital: capital?.name ?? null, courierWorlds: network };
}
