/**
 * Book data of the Spacer campaign (p.50-55): patrons, patron locations and searches, personality
 * and features, job types and objectives, negotiation tables, destinations, colonies, and
 * complications. Pure data, read by rules/patron.mjs.
 */

/** Patron table (p.50), D66. */
export const PATRONS = {
  11: "Assassin", 12: "Smuggler", 13: "Hacker", 14: "Drifter", 15: "Gambler", 16: "Rogue",
  21: "Belter", 22: "Citizen, Worker", 23: "Courier Ship Captain", 24: "Ship Captain", 25: "Spy", 26: "Revolutionary",
  31: "Entertainer", 32: "Citizen, Corporate", 33: "Citizen, Colonist", 34: "Administrator", 35: "Dilettante", 36: "Scholar",
  41: "Merchant", 42: "Scout", 43: "Broker", 44: "Courier", 45: "Freighter Captain", 46: "Merchant Marine",
  51: "Military (Army)", 52: "Military (Navy)", 53: "Military (Marine)", 54: "Agent", 55: "Legal/Court Official", 56: "Mob Boss",
  61: "Governor", 62: "Diplomat", 63: "Ambassador", 64: "Faction Leader", 65: "Noble", 66: "Government Official"
};

/**
 * Patron Location table (p.50). `tens` is the inclusive range of the tens die on the patron table.
 */
// BOOK: the dice notes "D3-1, 1D" (Streets, 11-26) and "1D-2, 1D" (Recreation, 11-46) do not give
// the listed ranges (D3-1 can be 0; 1D-2 can be -1 or 4); we roll the tens die uniformly across
// the listed range.
export const PATRON_LOCATIONS = {
  criminal: { label: "Criminal", examples: "Iniquitous establishments (Streetwise 0+ to find and enter)", range: "11-36", tens: [1, 3], multiplier: 2 },
  streets: { label: "Streets", examples: "Street corners, alleys, postings, holoscreens", range: "11-26", tens: [1, 2], multiplier: 0.5 },
  shipyards: { label: "Shipyards", examples: "Docks, warehouses, etc.", range: "41-46", tens: [4, 4], multiplier: 1 },
  carouse: { label: "Carouse", examples: "Bars, clubs, markets", range: "11-66", tens: [1, 6], multiplier: 1 },
  recreation: { label: "Recreation", examples: "Casinos, entertainment centers, etc.", range: "11-46", tens: [1, 4], multiplier: 1 },
  elite: { label: "Elite", examples: "Fundraisers, balls/parties, Noble court (SOC 10+)", range: "61-66", tens: [6, 6], multiplier: 3 }
};

/** Days searching and DM to find a patron by starport class (p.50). */
export const PATRON_SEARCH = {
  A: { settlement: "2D x 1,000,000", days: "D3", dm: 2 },
  B: { settlement: "2D x 100,000", days: "1D", dm: 1 },
  C: { settlement: "2D x 10,000", days: "1D+3", dm: 0 },
  D: { settlement: "2D x 1000", days: "2D", dm: -1 },
  E: { settlement: "2D x 100", days: "2D+3", dm: -2 },
  X: { settlement: "2D x 10", days: "3D", dm: -4 }
};

/** Patron personality and feature tables (p.51), D66. */
export const PERSONALITY = {
  11: "Demanding", 12: "Off-Putting", 13: "Angry", 14: "Nervous", 15: "Overly Charismatic", 16: "Terse",
  21: "Very Proper", 22: "Intense", 23: "Cautious", 24: "Secretive", 25: "Arrogant", 26: "Rude",
  31: "Pleasant", 32: "Desperate", 33: "Upset", 34: "Confident", 35: "Stubborn", 36: "Cunning",
  41: "Calm", 42: "Charming", 43: "Kind", 44: "Dour", 45: "Energetic", 46: "Aloof",
  51: "Eccentric", 52: "Relaxed", 53: "Brash", 54: "Logical", 55: "Considerate", 56: "All-Business",
  61: "Disturbed", 62: "Indifferent", 63: "Worry-Free", 64: "Open-Minded", 65: "Unfriendly", 66: "Stressed"
};
/** Patron feature table (p.51), D66. */
export const FEATURES = {
  11: "Bad Hair Style", 12: "Missing Facial Feature", 13: "Scruffy", 14: "Ugly", 15: "Odd Smell", 16: "Tall",
  21: "Overweight", 22: "Hunched", 23: "Tired", 24: "Bad Hygiene", 25: "Fidgety", 26: "Tattooed",
  31: "Unsettling", 32: "Elegant", 33: "Weathered", 34: "Scarred", 35: "Sturdy", 36: "Physically Impaired",
  41: "Nice Hair", 42: "Glasses", 43: "Well-Groomed", 44: "Good-Looking", 45: "Perfumed", 46: "Short",
  51: "Skeletal", 52: "Unkempt", 53: "Gaudily-Dressed", 54: "Well-Built", 55: "Old", 56: "Young",
  61: "Large Features", 62: "Sickly", 63: "Immaculately Dressed", 64: "Outdated Style", 65: "Slight", 66: "Physically Modified"
};

/** Job types (p.52-53). `pay` is the weekly payment dice and multiplier; enrichment uses its own table. */
export const JOB_TYPES = [
  { key: "chase", label: "Chase / Pursuit", pay: { dice: "1D", per: 500 }, note: "The spacers must find the objective; roles may flip if a complication occurs." },
  { key: "assault", label: "Assault / Rescue", pay: { dice: "1D", per: 1000 }, note: "Assumes the spacers will use violence. A complication means the target is not what it seems." },
  { key: "discovery", label: "Discovery / Exploration", pay: { dice: "1D+6", per: 1000 }, note: "Find accurate information and survive. A complication reveals an unexpected outcome." },
  { key: "enrichment", label: "Enrichment", pay: null, note: "Short-term, possibly high-risk payouts. A complication means the subject is not what it seems." },
  { key: "enigma", label: "Enigma / Mystery", pay: { dice: "2D", per: 2000 }, note: "Help solve a mystery. A complication shows why it was not answered before." },
  { key: "novelty", label: "Novelty / Unique", pay: { dice: "2D+3", per: 2000 }, note: "An unusual opportunity. Complications bring role reversals and unexpected dangers." }
];

/** Job objectives (p.52): JOB_OBJECTIVES[type][2D - 2]. */
export const JOB_OBJECTIVES = {
  chase: [
    "Track down a major criminal / bail skipper / VIP. They are dangerous.",
    "Track down a minor criminal / bail skipper / VIP. May be dangerous.",
    "Repo vehicle / starship",
    "Steal data from a starship",
    "Intercept courier and collect or destroy data",
    "Recover valuable data from a database located in a hard-to-reach location",
    "Collect intel",
    "Track NPC and report",
    "Recruit NPC",
    "Capture NPC",
    "Hijack starship"
  ],
  assault: [
    "Assault military starship",
    "Break into secure location to: roll again on Chase / Pursuit column",
    "Clandestine operation",
    "Sabotage",
    "Repress or support rebels",
    "Escort and protect",
    "Recover item, data, or ship",
    "Rescue NPC",
    "Security detail",
    "Privateering job",
    "Assassinate VIP"
  ],
  discovery: [
    "Find an ancient / alien artifact or explore ancient / alien structure",
    "Find a lost base",
    "Find survivors of a crash or outpost",
    "Gather samples from a planet",
    "Locate mineable asteroids",
    "Search abandoned ship",
    "Locate crash site",
    "Re-chart a star system",
    "Navigate a new route across a rift or unexplored area",
    "Explore an uncharted star system",
    "Investigate anomaly"
  ],
  enrichment: [
    "Facilitate illegal deal",
    "Mining Operation",
    "Ransom",
    "Scavenge",
    "Haul freight",
    "Courier",
    "Transport patron",
    "Tow starship",
    "Smuggle items in or out",
    "Smuggle people in or out",
    "Blockade running"
  ],
  enigma: [
    "Locate a psionic institute",
    "Investigate conspiracy",
    "Shut off a location communication beacon",
    "Transport VIP in low passage to unknown location",
    "Explore an abandoned ship or location",
    "Find missing person",
    "Investigate mysterious beacon",
    "Locate sleeper agent / cell",
    "Colony went silent",
    "Recover rumored artifact",
    "Investigate ancient structure"
  ],
  novelty: [
    "Represent the patron and establish a good relationship with an outsider",
    "Go undercover to infiltrate faction",
    "Train new recruits for a special mission",
    "Frame NPC",
    "Participate in a noble's tournament",
    "Manage outpost, starship, or satellite",
    "Sneak passengers into or out of a system or planet",
    "Be a test subject for prototype technology",
    "Help robot seeking its creator",
    "Return an alien to its homeworld",
    "Impersonate VIP to gather intel or spread rumors"
  ]
};

/** Negotiate Terms (p.54): 2D + SOC DM gives both columns. `weeks` is rolled from `time`. */
export const TERMS = [
  [null, 2, { time: "D3 weeks", timeDice: "D3", unit: "weeks", location: "Local: Within star system", parsecs: "0" }],
  [3, 5, { time: "1D weeks", timeDice: "1D", unit: "weeks", location: "Close: Within D3 parsecs", parsecs: "D3" }],
  [6, 8, { time: "1D+3 weeks", timeDice: "1D+3", unit: "weeks", location: "Average: Within 1D parsecs", parsecs: "1D" }],
  [9, 11, { time: "2D+3 weeks", timeDice: "2D+3", unit: "weeks", location: "Far: 2D parsecs", parsecs: "2D" }],
  [12, null, { time: "1D3+3 months", timeDice: "1D3+3", unit: "months", location: "Distant: 2D+6 parsecs", parsecs: "2D+6" }]
];

/** Negotiate Payment (p.54): 2D + Broker (+ Reputation). */
export const PAYMENT_TERMS = [
  [null, 2, { text: "Full payment on arrival", upFront: 0 }],
  [3, 5, { text: "25% now, 75% on completion", upFront: 0.25 }],
  [6, 8, { text: "50% now, 50% on completion", upFront: 0.5 }],
  [9, 11, { text: "75% up front, 25% on completion", upFront: 0.75 }],
  [12, null, { text: "100% up front", upFront: 1 }]
];

/** Negotiate Start of the Job (p.54), 2D. */
export const JOB_START = [
  [null, 2, { text: "Immediately", dice: null }],
  [3, 5, { text: "2D hours", dice: "2D", unit: "hours" }],
  [6, 8, { text: "D3 days", dice: "D3", unit: "days" }],
  [9, 11, { text: "1D days", dice: "1D", unit: "days" }],
  [12, null, { text: "2D days", dice: "2D", unit: "days" }]
];

/** Job destinations (p.54), D66. Rows marked `settlement` roll the settlement type and distance. */
export const DESTINATIONS = {
  11: "Coordinates without known location", 12: "Rockball with WayStation", 13: "Habitable World Starport (TL 1D+6)",
  14: "Habitable World Starport (TL 2D+6)", 15: "Rockball Starport", 16: "Orbital Space Station",
  21: "Moon Starport", 22: "Spaceship in Orbit", 23: "Rockball with Starport", 24: "Asteroid Starport", 25: "Belter Base", 26: "Scrapyard",
  31: "Settlement (TL D3+6)", 32: "Settlement (TL 1D+6)", 33: "Settlement (TL 2D+3)", 34: "Established Mining Colony",
  35: "Established Manufacturing Colony", 36: "Scavenger Base",
  41: "Remote Scout Base", 42: "Remote Independent Frontier Settlement", 43: "Remote Colony, Agriculture", 44: "Remote Waystation",
  45: "Remote Colony, Manufacturing", 46: "Remote Colony, Mining",
  51: "Warzone", 52: "Planetside Military Base", 53: "Battle Wreckage", 54: "Naval Fleet / Base", 55: "Pirate Base", 56: "Military Ship in Transit",
  61: "Controversial Colony", 62: "Red Zone Planet", 63: "Prison Colony", 64: "Pirate Base", 65: "Remote Coordinates", 66: "Anomaly"
};
/** TL dice of the destinations that list one (p.54). */
export const DESTINATION_TL = { 13: "1D+6", 14: "2D+6", 31: "D3+6", 32: "1D+6", 33: "2D+3" };

/** Colonies (p.55 and p.102): 2D on each column. */
// BOOK: both colony tables list the rows "8-10" and "10-11", so 10 is in two rows; we use 8-9
// and 10-11, as the roll tables in the compendium do.
export const COLONY_RUNNER = [
  [null, 2, "Criminal"], [3, 4, "Military"], [5, 7, "Corporation"], [8, 9, "Government"],
  [10, 11, "Political/Philosophical Ideology"], [12, null, "Religious"]
];
/** Colony age column (p.55, p.102): dice and unit. */
export const COLONY_AGE = [
  [null, 2, { dice: "D3+3", unit: "years" }], [3, 4, { dice: "2D", unit: "years" }], [5, 7, { dice: "2D+6", unit: "years" }],
  [8, 9, { dice: "D3", unit: "decades" }], [10, 11, { dice: "1D+3", unit: "decades" }], [12, null, { dice: "D3", unit: "centuries" }]
];
/** Colony population column (p.55, p.102): 1D x this number. */
export const COLONY_POP = [
  [null, 2, 50], [3, 4, 100], [5, 7, 500], [8, 9, 1000], [10, 11, 5000], [12, null, 10000]
];

/** Job complications (p.55), 1D per column. */
export const COMPLICATIONS = {
  who: ["Ally", "Friend", "Connection", "Different Patron", "Rival", "Enemy"],
  what: ["Role Reversal", "Contract Change / Rival Offer", "Betrayed", "Pursuing / Pursued", "Misinformed / Cover-up", "Restriction / Obstacle"],
  why: ["No Reason / Chance", "Political", "Cultural", "Professional", "Economical", "Ideological"],
  how: ["Money", "Favor", "Benefit", "Threat", "Sabotage", "Violence"]
};
