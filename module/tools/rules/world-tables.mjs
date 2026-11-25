/**
 * Book data of star systems and worlds (p.88-95): density DMs, stars, stellar object details,
 * the main world tables (size to temperature), starports, and tech eras. Pure data, read by
 * rules/world.mjs.
 */

/** Sector density DM (p.88): to the world presence roll and to the star type roll. */
export const DENSITY = {
  rift: { label: "Rift or empty", dm: -2 },
  sparse: { label: "Sparse", dm: -1 },
  typical: { label: "Typical", dm: 0 },
  dense: { label: "Densely populated", dm: 1 }
};

/** Primary Star table (p.88), 2D + density DM. */
// BOOK: the table has rows 6-8 (G) and 10-11 (F) and no row for 9; we read 9 as G, the most
// common star class.
export const STARS = [
  [null, 3, { cls: "M", color: "Red", mass: "0.01-0.4M", radius: "Less than 0.5R", objects: "D3", hz: "0.25 AU" }],
  [4, 5, { cls: "K", color: "Orange", mass: "0.5-0.7M", radius: "0.6-0.8R", objects: "1D", hz: "0.5 AU" }],
  [6, 9, { cls: "G", color: "Yellow", mass: "0.8-1M", radius: "0.9-1.1R", objects: "2D", hz: "1 AU" }],
  [10, 11, { cls: "F", color: "White", mass: "1.1-1.5M", radius: "1.2-1.5R", objects: "1D", hz: "1.5 AU" }],
  [12, null, { cls: "A", color: "Blue", mass: "1.6-2.5M", radius: "1.6-2R", objects: "D3", hz: "2.5 AU" }]
];

/** Structure types of the Other Stellar Objects table (p.89), 1D. */
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

/** Size table (p.90-91): diameter, example, and surface gravity by size code. */
// BOOK: the size table on p.91 prints 17,700km (B) and 19,3000km (C); we use 17,600km and
// 19,200km from the chart on p.90, which follow the 1,600km steps.
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

/** Atmosphere table (p.91): composition, example, and required survival gear. */
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

/** Hydrographics table (p.91): percentage of water and description. */
export const HYDRO = [
  { percent: "0-5%", text: "Desert world" }, { percent: "6-15%", text: "Dry world" }, { percent: "16-25%", text: "A few small seas" },
  { percent: "26-35%", text: "Small seas and oceans" }, { percent: "36-45%", text: "Wet world" }, { percent: "46-55%", text: "A large ocean" },
  { percent: "56-65%", text: "A few large oceans" }, { percent: "66-75%", text: "Many large oceans (Earth-like)" },
  { percent: "76-85%", text: "Islands and archipelagos" }, { percent: "86-95%", text: "Nearly all water, with a few islands" },
  { percent: "96-100%", text: "Waterworld" }
];

/** Population table (p.92). */
export const POPULATION = [
  { inhabitants: "None", text: "" }, { inhabitants: "Few", text: "Single person or family" },
  { inhabitants: "Hundreds", text: "Tiny settlement or research colony" }, { inhabitants: "Thousands", text: "" },
  { inhabitants: "Tens of Thousands", text: "Small settlement or new colony" }, { inhabitants: "Hundreds of Thousands", text: "Medium settlement or developing colony" },
  { inhabitants: "Millions", text: "" }, { inhabitants: "Tens of Millions", text: "Large settlement or established colony" },
  { inhabitants: "Hundreds of Millions", text: "Many large settlements/colonies and small nations" },
  { inhabitants: "Billions", text: "Many large nations, present-day Earth" }, { inhabitants: "Tens of Billions", text: "" },
  { inhabitants: "Hundreds of Billions", text: "Overpopulated settlements" }, { inhabitants: "Trillions", text: "World-city" }
];

/** Government table (p.92). */
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

/**
 * Starport table (p.93). `bases` are [code, label, 2D target]; `highport` is the 2D target of a
 * highport; `berthing` is [dice, credits].
 */
// BOOK: "a roll is made for each type of facility or base listed"; we roll 2D for each listed
// base and for the highport, each against its own target.
export const STARPORTS = {
  X: { quality: "No Starport", berthing: null, fuel: "None", facilities: "None", highport: null, bases: [["P", "Pirate", 10], ["S", "Scout", 12]] },
  E: { quality: "Frontier", berthing: null, fuel: "None", facilities: "None", highport: null, bases: [["P", "Pirate", 10], ["S", "Scout", 10]] },
  D: { quality: "Poor", berthing: ["1D", 10], fuel: "Unrefined", facilities: "Limited repair", highport: 12, bases: [["S", "Scout", 8], ["P", "Pirate", 12]] },
  C: { quality: "Serviceable", berthing: ["1D", 100], fuel: "Unrefined", facilities: "Shipyard (small craft), repair", highport: 10, bases: [["M", "Military", 10], ["S", "Scout", 9]] },
  B: { quality: "Good", berthing: ["1D", 500], fuel: "Refined", facilities: "Shipyard (spacecraft), repair", highport: 8, bases: [["M", "Military", 8], ["N", "Naval", 8], ["S", "Scout", 9]] },
  A: { quality: "Excellent", berthing: ["1D", 1000], fuel: "Refined", facilities: "Shipyard (all), repair", highport: 6, bases: [["M", "Military", 8], ["N", "Naval", 8], ["S", "Scout", 10]] }
};
/** Starport class by the modified 2D roll (p.93). */
export const STARPORT_ROLL = [[null, 2, "X"], [3, 4, "E"], [5, 6, "D"], [7, 8, "C"], [9, 10, "B"], [11, null, "A"]];

/** Relative time period of each Tech Level (p.94). */
export const TECH_ERAS = [
  "Stone Age", "Metal Age / Ancient", "Post-Classical", "Early Modern", "Industrial Age", "Machine Age", "Nuclear Age",
  "Space Age", "Information Age", "Intrastellar Age", "Interstellar Age (J-1)", "Interstellar Age (J-2)", "Interstellar Age (J-3)",
  "Interstellar Age (J-4)", "Interstellar Age (J-5)", "Interstellar Age (J-6)", "Intergalactic Age"
];

/** Temperature table (p.95), 2D + temperature DM. */
export const TEMPERATURE = [
  [null, 2, { type: "Frozen", temp: "-31C or less", text: "Frozen water, dry atmosphere" }],
  [3, 4, { type: "Cold", temp: "0C to -30C", text: "Some liquid water, large ice caps, some clouds" }],
  [5, 9, { type: "Temperate", temp: "0C to 30C", text: "Similar to Earth. Ice caps, liquid water and clouds are common." }],
  [10, 11, { type: "Hot", temp: "31C to 80C", text: "Minimal to no ice caps; dense clouds with uncommon liquid water" }],
  [12, null, { type: "Boiling", temp: "81C+", text: "Extremely dense clouds, minimal to no liquid water" }]
];
