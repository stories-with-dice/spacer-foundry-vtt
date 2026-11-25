/**
 * Space encounters (book p.80-82): frequency, the encounter procedure, encounter types, the
 * space encounter and space environment tables, communication, scanning, and reaction. Pure.
 */
import { band } from "../../shared/dice.mjs";

/** Space Encounter Frequency table (p.80). */
export const SPACE_LOCATIONS = {
  highport: { label: "Highport Space", frequency: "6 hours", chanceDM: 3, typeDM: 3, table: "D66", number: "2D" },
  highTraffic: { label: "High-Traffic Space", frequency: "12 hours", chanceDM: 2, typeDM: 2, table: "D66", number: "1D+3" },
  settled: { label: "Settled Space", frequency: "1 day", chanceDM: 1, typeDM: 1, table: "D66", number: "1D" },
  border: { label: "Border System", frequency: "1 day", chanceDM: 0, typeDM: 0, table: "D66", number: "D3" },
  wild: { label: "Wild Space", frequency: "1 day", chanceDM: -1, typeDM: -1, table: "D36", number: "D3" },
  empty: { label: "Empty Space", frequency: "2 days", chanceDM: -2, typeDM: -2, table: "D36", number: "1" }
};

/** Encounter Type table (p.80), 2D + type DM. */
export const SPACE_TYPES = [
  [null, 2, { type: "ship", label: "Space ship, hostile", dm: -2, distance: "Close (1km or less)" }],
  [3, 5, { type: "environment", label: "Space environment", dm: 0, distance: "Short (1km-1250km)" }],
  [6, 9, { type: "ship", label: "Space ship", dm: 0, distance: "Medium (1251km-10,000km)" }],
  [10, 11, { type: "environment", label: "Space environment", dm: 0, distance: "Long (10,001km-25,000km)" }],
  [12, null, { type: "ship", label: "Space ship, helpful", dm: 2, distance: "Very long (25,001km-50,000km)" }]
];

/** Space Encounter table (p.81), D66. Row 31 uses "Spacer" for the book term (AGENTS.md naming rule). */
export const SPACE_SHIPS = {
  11: { text: "Possible outlaws, 1D ships", outlaws: true, count: "1D" },
  12: { text: "Possible outlaws, D3 ships", outlaws: true, count: "D3" },
  13: { text: "Possible outlaws, single ship", outlaws: true },
  14: { text: "Possible outlaws, occupied space station", outlaws: true },
  15: { text: "Religious pilgrims" },
  16: { text: "Scout ship" },
  21: { text: "Mayday! Automated pinging beacon, no response" },
  22: { text: "Mayday! Recording of issue, no response" },
  23: { text: "Mayday! Currently broadcasting, will respond" },
  24: { text: "Communication satellite" },
  25: { text: "Courier post/depot station" },
  26: { text: "Scavenger ship" },
  31: { text: "Traveller on an odd-job" },
  32: { text: "Mercenary company" },
  33: { text: "Refugees" },
  34: { text: "Belter company ship" },
  35: { text: "Towing shuttle" },
  36: { text: "Bounty Hunter" },
  41: { text: "Space trucker, 1D x 100T ship", tons: ["1D", 100] },
  42: { text: "Space trucker 1D x 500T ship", tons: ["1D", 500] },
  43: { text: "Space trucker 1D x 1000T ship", tons: ["1D", 1000] },
  44: { text: "Armed trader" },
  45: { text: "Passenger liner" },
  46: { text: "Space station", station: true },
  51: { text: "Highport space station" },
  52: { text: "Intrasystem transport vessel" },
  53: { text: "Intrasystem supply ship (fuel, water, food)" },
  54: { text: "Intrasystem construction vessel" },
  55: { text: "Construction craft hauler" },
  56: { text: "Research station" },
  61: { text: "Emergency services ship" },
  62: { text: "Local security/ law enforcement patrol craft" },
  63: { text: "Noble escort" },
  64: { text: "Starship dry dock/construction dock" },
  65: { text: "Naval ship" },
  66: { text: "Naval fleet" }
};
/** Station types of the space encounter table (p.81), 1D. */
export const STATIONS = ["Courier depot", "Refinery platform", "Military checkpoint", "Research station", "Communication relay", "Isolated starport"];
/** Outlaw spacer types (p.81), 1D. */
export const OUTLAWS = ["Pirates", "Pirates", "Pirates", "Smugglers", "Smugglers", "Organized crime affiliates"];

/** Space Environment table (p.81), D66. `collision` marks a collision chance; `pilot` its target. */
export const SPACE_ENVIRONMENT = {
  11: { text: "Asteroid field, collision chance but Pilot check 6+ to avoid damage", collision: 6 },
  12: { text: "Meteorite storm, collision chance", collision: 8 },
  13: { text: "Adrift and stranded colony/generation ship, D3 x100 years old", years: ["D3", 100] },
  14: { text: "Research satellite, non-operational" },
  15: { text: "Adrift escape pod" },
  16: { text: "Abandoned belter asteroid" },
  21: { text: "Deep space beacon relay" },
  22: { text: "Space coffin jettisoned 2D decades ago", decades: "2D" },
  23: { text: "Solar flare, critical damage to a ship system" },
  24: { text: "Small asteroid cluster" },
  25: { text: "Small asteroid cluster with a belter base" },
  26: { text: "Unfinished space station" },
  31: { text: "Derelict, 1D x 100T", tons: ["1D", 100] },
  32: { text: "Derelict, 2D x 100T", tons: ["2D", 100] },
  33: { text: "Derelict, 3D x 100T", tons: ["3D", 100] },
  34: { text: "Derelict, 1D x 1000T", tons: ["1D", 1000] },
  35: { text: "Derelict, 1D x 5000T", tons: ["1D", 5000] },
  36: { text: "Derelict, 1D x 10000T", tons: ["1D", 10000] },
  41: { text: "Abandoned space station" },
  42: { text: "Destroyed space station" },
  43: { text: "Scrap and debris, collision chance", collision: 8 },
  44: { text: "Destroyed 1D x1000T ship", tons: ["1D", 1000] },
  45: { text: "Ship wreckage from a collision, collision chance", collision: 8 },
  46: { text: "Remains of an attack, ship wreckage + scrap and debris everywhere, collision chance", collision: 8 },
  51: { text: "Jettisoned cargo, 1D x 20 tonnes", tons: ["1D", 20] },
  52: { text: "Navigation buoy" },
  53: { text: "Space junkyard, collision chance", collision: 8 },
  54: { text: "Comms satellite, adrift" },
  55: { text: "Hollowed-out asteroids" },
  56: { text: "Scrap-built station" },
  61: { text: "Courier or freight hub" },
  62: { text: "Independent shipyard" },
  63: { text: "Small space station, general purpose" },
  64: { text: "Comms satellite" },
  65: { text: "Research satellite" },
  66: { text: "Other", other: true }
};
/** "Other" results of the space environment table (p.81), 1D. */
export const SPACE_OTHER = ["Wormhole", "Spacetime anomaly", "Psychic wave", "Massive craft/station/structure", "Cryptic radio chatter", "Ancient structure"];

/** Ship Encounter Reaction table (p.82), 2D for each column. */
export const SHIP_REACTION = [
  [null, 2, { hail: "Rude", behaviour: "Aggressive", scan: "Ship is flagged, 2 complications", flags: 2, condition: "Has critical damage and needs repairs" }],
  [3, 5, { hail: "Dismissive", behaviour: "Defensive", scan: "Ship is flagged, 1 complication", flags: 1, condition: "Has some hull damage" }],
  [6, 8, { hail: "No Response", behaviour: "Passive", scan: "Behind on small payments", flags: 0, condition: "Needs maintenance" }],
  [9, 11, { hail: "Interested", behaviour: "Assertive", scan: "No issues", flags: 0, condition: "In good condition, no damage" }],
  [12, null, { hail: "Helpful", behaviour: "Evasive", scan: "No issue, and no record of any delinquency", flags: 0, condition: "Appears new or recently upgraded" }]
];
/** Ship scan flags (p.82). */
export const SHIP_FLAGS = [
  "Unregistered or false registration; escort to closest starport for a reward",
  "Ship is registered to someone else",
  "Skipped on ship loan payments; reward available if detained",
  "Sensors picked up mysterious cargo",
  "Owner is affiliated with an enemy government, faction, or criminal enterprise; reward available",
  "Ship is legendary or notorious; proceed with caution"
];

/** Roll a row of the ship table and its sub-rolls. */
function shipRow(dice, code) {
  const row = SPACE_SHIPS[code];
  const out = { code, text: row.text };
  if (row.count) out.ships = dice.roll(row.count);
  if (row.tons) out.tons = dice.roll(row.tons[0]) * row.tons[1];
  if (row.station) out.station = STATIONS[dice.d6() - 1];
  if (row.outlaws) {
    const r = dice.d6();
    out.outlaws = r >= 4 ? { spacers: true, roll: r, kind: OUTLAWS[dice.d6() - 1] } : { spacers: false, roll: r, kind: "Not outlaws: ordinary spacers" };
  }
  return out;
}

function environmentRow(dice, code) {
  const row = SPACE_ENVIRONMENT[code];
  const out = { code, text: row.text };
  if (row.tons) out.tons = dice.roll(row.tons[0]) * row.tons[1];
  if (row.years) out.years = dice.roll(row.years[0]) * row.years[1];
  if (row.decades) out.decades = dice.roll(row.decades);
  if (row.other) out.other = SPACE_OTHER[dice.d6() - 1];
  if (row.collision) out.collision = { target: row.collision, note: `Pilot ${row.collision}+ to avoid hitting debris; failure deals D3 damage to the starship.` };
  return out;
}

/**
 * Ship communication and scanning (p.82). `scanning` gives -3 to the reaction and behaviour
 * columns; `dm` is the encounter's interaction DM (hostile -2, helpful +2).
 */
export function shipReaction(dice, { dm = 0, scanning = false, militarySensors = false } = {}) {
  const mod = dm + (scanning ? -3 : 0);
  const hailRoll = dice.twoD() + mod;
  const behaviourRoll = dice.twoD() + mod;
  const out = { hailRoll, hail: band(SHIP_REACTION, hailRoll).hail, behaviourRoll, behaviour: band(SHIP_REACTION, behaviourRoll).behaviour };
  if (scanning) {
    const conditionRoll = dice.twoD();
    out.conditionRoll = conditionRoll;
    out.condition = band(SHIP_REACTION, conditionRoll).condition;
    if (militarySensors) {
      const scanRoll = dice.twoD();
      const s = band(SHIP_REACTION, scanRoll);
      out.scanRoll = scanRoll;
      out.scan = s.scan;
      out.flags = [];
      for (let i = 0; i < s.flags; i++) out.flags.push(SHIP_FLAGS[dice.d6() - 1]);
    }
  }
  return out;
}

/**
 * One space encounter check (p.80). `jump` marks entering space or leaving jump (an encounter
 * check is always rolled then). `force` skips the check and always makes an encounter.
 */
export function spaceEncounter(dice, { location = "settled", jump = false, force = false, react = true } = {}) {
  const loc = SPACE_LOCATIONS[location] ?? SPACE_LOCATIONS.settled;
  const check = dice.d6();
  const checkTotal = check + loc.chanceDM;
  const encounter = force || checkTotal >= 6;
  const out = { kind: "space", location: { key: location, ...loc }, jump, check: { natural: check, total: checkTotal, dm: loc.chanceDM }, encounter, forced: force };
  if (!encounter) return out;
  const typeRoll = dice.twoD() + loc.typeDM;
  const type = band(SPACE_TYPES, typeRoll);
  out.typeRoll = typeRoll;
  out.type = type;
  const number = Math.max(1, dice.roll(loc.number));
  out.number = number;
  const code = loc.table === "D36" ? dice.d36() : dice.d66();
  out.result = type.type === "ship" ? shipRow(dice, code) : environmentRow(dice, code);
  if (react && type.type === "ship") out.reaction = shipReaction(dice, { dm: type.dm });
  return out;
}
