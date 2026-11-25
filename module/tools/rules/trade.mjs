/**
 * Trade and transport (book p.62-65): freight, mail, passengers, and speculative trade. Pure.
 */
import { band } from "./dice.mjs";
import { rollDemeanour } from "./npc.mjs";

/** Trade codes used by the trade table (p.65) and the world generator (p.95). */
export const TRADE_CODES = {
  Ag: "Agricultural", As: "Asteroid", De: "Desert World", Ge: "Garden World", Ic: "Ice-Capped", In: "Industrial",
  Lt: "Low Tech", Na: "Non-Agricultural", Ni: "Non-Industrial", Po: "Poor", Ri: "Rich", Ht: "High Tech",
  Va: "Vacuum", Wa: "Water World"
};

/**
 * Normalize a trade code. The book uses "Te" for High Tech on p.95 and "Ht" on p.64-65,
 * "Ga" and "Ge" for Garden, and "Ww" next to "Wa" (read as Water World).
 */
export function normalizeCode(code) {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const k = c[0].toUpperCase() + c.slice(1).toLowerCase();
  return { Te: "Ht", Ga: "Ge", Ww: "Wa" }[k] ?? k;
}

/** Parse "Ag Ni Ri" or ["AG", "ni"] into normalized codes. */
export function parseCodes(input) {
  const arr = Array.isArray(input) ? input : String(input ?? "").split(/[\s,;]+/);
  return [...new Set(arr.map(normalizeCode).filter(Boolean))];
}

/** Parse a DM list from the book ("In +2, Ht +3, Ri +1") into { In: 2, Ht: 3, Ri: 1 }. */
function dms(text) {
  const out = {};
  for (const m of String(text).matchAll(/([A-Za-z]{2})\s*([+-]\s*\d+)/g)) out[normalizeCode(m[1])] = Number(m[2].replace(/\s/g, ""));
  return out;
}

const g = (code, name, availability, price, amount, purchase, resale, example) => ({
  code, name, availability: availability === "All" ? "All" : parseCodes(availability), price, amount,
  purchaseDM: dms(purchase), resaleDM: dms(resale), example
});

/**
 * Trade Goods table (p.64). Cybernetics (32) has no availability in the book; it is read as
 * "All". The Ic resale DM of Foodstuffs and Ag resale of Radioactives are split across lines in
 * the book and are read as Ic +1 and Ag -3.
 */
export const TRADE_GOODS = [
  g(11, "Electronics", "All", 2000, "2Dx10", "In +2, Ht +3, Ri +1", "Ni +2, Po +1", "Commercial or industrial use circuitry, transistors, cabling, power supplies, computers TL 10 or less"),
  g(12, "Industrial supplies", "All", 1000, "2Dx10", "Na +2, In +5", "Ni +3, Ag +2", "Parts and equipment for industrial use"),
  g(13, "Manufactured goods", "All", 2000, "2Dx10", "Na +2, In +3", "Ni +3", "Common refined material used as components for fabrication and construction"),
  g(14, "Basic organic materials", "All", 5000, "2Dx10", "Ag +3, Ge +2", "In +2, Po +2", "Common material harvested or processed from plants and other grown matter"),
  g(15, "Foodstuffs", "All", 500, "2Dx10", "Ag +3, Wa +2, As -4", "As +1, De +1, Ic +1, Va +2", "Food and drink, along with common consumables"),
  g(16, "Basic metal ore", "All", 1000, "2Dx10", "As +4", "In +3, Ni +1", "Tin, iron, copper"),
  g(21, "High-end electronics", "In", 10000, "1Dx5", "In +2, Ht +3", "Ni +1, Ri +2, As +3", "Sensors, advanced circuitry, power supplies, advanced computers TL11-15"),
  g(22, "Machinery", "All", 7500, "1Dx5", "In +2", "As +2, Ni +1", "Machines for fabrication, construction, and other labour uses"),
  g(23, "Recreational consumables", "All", 20000, "1Dx5", "In +1", "Ri +2", "Delicacies, non-essential foodstuffs, alcohol"),
  g(24, "Firearms and ammunition", "In", 150000, "1Dx5", "In +2", "Po +1", "Projectile weapons for military and personal use"),
  g(25, "Vehicles", "In", 15000, "1Dx10", "In +2", "Ni +2", "TL 10 or lower terrestrial vehicles and/or replacement parts"),
  g(26, "Fuel and biochemicals", "Ag, Wa", 50000, "1Dx10", "Ag +1, Wa +2", "In +2", "Extracts, biofuels, organic compounds"),
  g(31, "Rare minerals and crystals", "As, De, Ic", 20000, "1Dx5", "As +2, De +1, Ic +1", "In +3, Ri +2", "Gemstones, rare stones, and related material of either material value or spiritual value"),
  g(32, "Cybernetics", "All", 250000, "1Dx5", "In +1", "As +1, Ic +1, Ri +2", "Artificial human parts and repair components for them"),
  g(33, "Livestock", "Ag", 10000, "1Dx10", "Ag +2", "", "Herd animals, farm animals, pets"),
  g(34, "Expensive consumer goods", "Ag, Wa", 20000, "1Dx10", "Ag +2, Wa +1", "Ri +2", "High quality and fine foods, drinks, cosmetics, high fashion, niche interest items"),
  g(35, "High-end consumer goods", "In", 10000, "1Dx10", "In +1", "Ri +4", "Designer fashion, expensive furniture"),
  g(36, "Medical supplies", "In, Va", 50000, "1Dx5", "In +2", "In +2, Po +1, Ri +1", "Consumable medical supplies, medical equipment, etc."),
  g(41, "Pharmaceuticals", "As, De, Wa", 100000, "1Dx5", "As +2", "Ri +2", "Medical-grade drugs"),
  g(42, "Polymers", "In", 7000, "1Dx10", "In +1", "Ri +2, Ni +1", "Synthetic and other artificial material used for industrial and personal fabrication"),
  g(43, "Rare metals", "As, Ic", 50000, "1Dx5", "As +3, De +1, Ic +2", "Ri +3, In +2", "Silver, gold, platinum"),
  g(44, "Radioactives", "As, De", 1000000, "1Dx5", "As +2", "In +3, Ni -2, Ag -3", "Extremely rare and volatile heavy metals, treated elements, and material used for fusion/nuclear power"),
  g(45, "Robots", "In, Ri", 400000, "1Dx5", "In +1, Ri +1", "Ag +2", "Robots for industrial, professional, and personal use"),
  g(46, "Spices", "De, Wa", 6000, "1Dx10", "De +2", "Ri +3, Po +3", "Natural drugs, additives, and process consumable minerals"),
  g(51, "Textiles", "Ag, Ni", 3000, "1Dx20", "Ag +7", "Na +2", "Fabric material such as clothing, fabric, processed and/or treated woven products"),
  g(52, "Manufactured metals", "In", 100000, "1Dx10", "In +3", "As +1, Ni +2, Va +3", "Steel, aluminum, other alloys"),
  g(53, "Uncommon organic material", "Ag, Ic", 20000, "1Dx5", "Ag +2, Wa +1", "In +2", "Hard-to-acquire fibres, fabrics, plant matter, and compounds"),
  g(54, "Media and culture goods", "Ri, In", 10000, "1Dx5", "Ri -2, In +1", "Ag +1, As +1, Po +2, Ni +3", "Musical instruments, art supplies, decor, analog and digital entertainment, literature, music, games"),
  g(55, "Vehicles", "Ag, In, De, Wa", 15000, "1Dx10", "In +2", "Ni +2", "Manufactured vehicles for planetside use"),
  g(56, "Petrochemicals", "De, Ic, Wa", 10000, "1Dx10", "De +2", "In +2, Ag +1", "Refined oil, crude oil, fossil fuels"),
  g(61, "Electronic spare parts", "In, Ri, Ic, Va", 100000, "1Dx5", "In -4, Ri -3", "Ni +2, Po +1", "Consumer-grade electronic components for crafting or repairs"),
  g(62, "Mechanical spare parts", "In, Ri, As", 70000, "1Dx5", "In -5, Ri -2", "Ni +3, Ag +2", "Consumer-grade mechanical components for crafting or repairs"),
  g(63, "Cybernetic spare parts", "In, Ri, Ic", 250000, "1Dx5", "In -4, Ri -1", "Ni +4, Ag +1, Na +2", "Consumer-grade robotic and cybernetic components for crafting or repairs"),
  g(64, "Computer spare parts", "In, Ri, Ic, Va", 150000, "1Dx5", "In -5, Ri -3", "Ni +3, Ag +1, Na +2", "Consumer-grade computer components for crafting or repairs"),
  g(65, "Vehicle spare parts", "In, Ri, De, Wa", 25000, "1Dx5", "In -5, Ri -4", "Ni +3, Ag +1, Na +2", "Consumer-grade vehicle components for crafting or repairs"),
  g(66, "Starship spare parts", "As, Na, In, Ri, Va", 100000, "1Dx5", "Na -5, In -3, Ri -1, Va -2", "Na -1, Ni +2, Po +1", "Consumer grade starship parts for construction or repairs"),
  g(71, "Illegal drugs and consumables", "As, De", 100000, "1D", "As +1, De +1, Wa +1", "Ri +6", "Controlled substances, experimental chemical enhancements"),
  g(72, "Illegal organic material", "Ag, Ni, Wa", 100000, "1D", "Ge +2, Wa +2", "In +6", "Stolen organs, poached aliens, pests from red zones, banned foods and drinks"),
  g(73, "Illegal weapons", "In, Ri", 150000, "1Dx5", "Ri +2", "Po +6", "Stolen military hardware, WMD, chemical and bio-weapons"),
  g(74, "Illegal chemicals and manufactured items", "In, Ri", 50000, "1Dx5", "Ri +1", "As +4, Ic +4, Ri +8", "Illegally modified vehicle parts, espionage tools, banned cybernetics, lab-grown viruses"),
  g(75, "Illegal art and literature", "Ag, Ni", 150000, "1Dx5", "Ag +2, Wa +1", "Ri +6", "Controversial art, propaganda, banned media"),
  g(76, "Exotic items", "Ag, Ni", 200000, "1D", "As +3, De +2, Ic +2, Ag +5", "Ri +6", "Alien relics, ancient artifacts, protected animal or alien life")
];

export const goodByCode = code => TRADE_GOODS.find(x => x.code === Number(code));

/** Tons available: "2Dx10" -> 2D x 10. */
export function rollAmount(dice, amount) {
  const [d, mult] = amount.split("x");
  return dice.roll(d) * Number(mult || 1);
}

/** Purchase / Sale price table (p.63), indexed by the modified 2D. */
export const PRICE_TABLE = [
  [null, 0, { purchase: 300, sale: 20 }], [1, 1, { purchase: 250, sale: 40 }], [2, 2, { purchase: 200, sale: 50 }],
  [3, 3, { purchase: 180, sale: 60 }], [4, 4, { purchase: 160, sale: 70 }], [5, 5, { purchase: 140, sale: 80 }],
  [6, 6, { purchase: 120, sale: 90 }], [7, 7, { purchase: 100, sale: 100 }], [8, 8, { purchase: 90, sale: 110 }],
  [9, 9, { purchase: 80, sale: 120 }], [10, 10, { purchase: 70, sale: 130 }], [11, 11, { purchase: 60, sale: 150 }],
  [12, 12, { purchase: 50, sale: 180 }], [13, 13, { purchase: 40, sale: 200 }], [14, 14, { purchase: 30, sale: 250 }],
  [15, null, { purchase: 20, sale: 300 }]
];
export const priceFor = total => band(PRICE_TABLE, total);

/**
 * Trade DM of a good on a world: the sum of every DM whose trade code the world has.
 * The book does not say whether to add or pick one; we add them.
 */
export function tradeDM(good, codes, which = "purchase") {
  const table = which === "purchase" ? good.purchaseDM : good.resaleDM;
  return parseCodes(codes).reduce((t, c) => t + (table[c] ?? 0), 0);
}

/** Is a good available on a world with these codes (p.63)? */
export function isAvailable(good, codes) {
  if (good.availability === "All") return true;
  const set = new Set(parseCodes(codes));
  return good.availability.some(c => set.has(c));
}

/** Supplier types (p.63). */
export const SUPPLIERS = {
  legitimate: { label: "Legitimate supplier", time: "1D days", skill: "Broker", characteristics: ["soc", "edu"], tableDM: 0 },
  illicit: { label: "Illicit supplier", time: "1D days", skill: "Streetwise", characteristics: ["soc", "edu"], tableDM: 1 },
  terminal: { label: "Trade terminal", time: "1D hours", skill: "Admin", characteristics: ["edu"], tableDM: 0, requires: "Starport A, B, or C and TL 8+" }
};
/** Starport modifier to find a supplier (p.63). */
export const SUPPLIER_STARPORT_DM = { A: 6, B: 4, C: 3 };

/**
 * DM to find a supplier: starport modifier and -1 per extra lead (p.63). Returns the parts so the
 * caller can add skill and characteristic DMs through rollTask.
 */
export function supplierDM({ starport = "C", extraLeads = 0 } = {}) {
  return (SUPPLIER_STARPORT_DM[starport] ?? 0) - Math.max(0, extraLeads);
}

/** Can the trade terminal be used (p.63)? */
export function terminalAllowed(world) {
  return ["A", "B", "C"].includes(world?.starport) && (world?.tl ?? 0) >= 8;
}

/**
 * Goods on offer from one supplier (p.63): the common goods 11-16, other goods available to the
 * world's trade codes (the "All" rows count) limited to the population code, and
 * one random d66 good (illicit suppliers add +1 to the tens die).
 */
export function goodsAvailable(dice, { codes = [], pop = 6, illicit = false } = {}) {
  const common = TRADE_GOODS.filter(x => x.code <= 16);
  const coded = TRADE_GOODS.filter(x => x.code > 16 && isAvailable(x, codes));
  // "if the planet's population number allows it": at most `pop` coded goods.
  const local = [];
  const pool = [...coded];
  while (pool.length && local.length < Math.max(0, pop)) {
    const i = dice.die(pool.length) - 1;
    local.push(pool.splice(i, 1)[0]);
  }
  local.sort((a, b) => a.code - b.code);
  const code = dice.d66(illicit ? 1 : 0, { minTens: 1, maxTens: 7 });
  const extra = goodByCode(code);
  const list = [...common, ...local];
  if (!list.includes(extra)) list.push(extra);
  return { common, local, extra, list: list.map(x => ({ ...x, tons: rollAmount(dice, x.amount) })) };
}

/**
 * Purchase or sale price (p.63). `brokerDM` is the spacer's (or hired NPC's) Broker rank,
 * `sellerBroker` the opposing broker's rank (applied as a negative DM, default 2 for
 * professionals), `hiredDM` a hired broker's +1 to +4 (p.65), `opinionDM` the NPC reaction DM.
 */
export function rollPrice(dice, { good, codes = [], mode = "purchase", brokerDM = 0, sellerBroker = 0, hiredDM = 0, opinionDM = 0, tons = 1 } = {}) {
  const goodDM = tradeDM(good, codes, mode === "purchase" ? "purchase" : "sale");
  const natural = dice.twoD();
  const total = natural + brokerDM + goodDM - sellerBroker + hiredDM + opinionDM;
  const row = priceFor(total);
  const percent = mode === "purchase" ? row.purchase : row.sale;
  const perTon = Math.round(good.price * percent / 100);
  return { mode, natural, total, goodDM, percent, perTon, tons, cost: perTon * tons };
}

/** Steps between two table rows (for negotiation, p.65). */
export function priceSteps(fromTotal, toTotal) {
  const clampRow = t => Math.max(0, Math.min(15, t));
  return clampRow(toTotal) - clampRow(fromTotal);
}

/**
 * Price negotiation (p.65): the trader's opinion (2D + SOC DM on the demeanour table), then
 * 2D + Broker + opinion DM - steps (or + steps when moving the price against the spacer) 8+.
 * `currentRow` and `targetRow` are rows on the price table (the modified 2D).
 * For a purchase, a lower price means a higher row: each row up is -1 DM.
 * For a sale, a higher price means a higher row: each row up is -1 DM.
 */
export function negotiate(dice, { good, mode = "purchase", currentRow, targetRow, brokerDM = 0, socDM = 0, opinion = null, tons = 1 }) {
  const op = opinion ?? rollDemeanour(dice, socDM);
  const steps = priceSteps(currentRow, targetRow);
  const stepDM = -steps;
  const natural = dice.twoD();
  const total = natural + brokerDM + op.dm + stepDM;
  const success = total >= 8;
  const row = priceFor(success ? targetRow : currentRow);
  const percent = mode === "purchase" ? row.purchase : row.sale;
  const perTon = Math.round(good.price * percent / 100);
  return { opinion: op, steps, stepDM, natural, total, success, percent, perTon, cost: perTon * tons };
}

/** Hired broker fee (p.65): 5% of the purchase cost (or sale profit) per +1 DM, up to +4. */
export function brokerFee(dm, amount) {
  const d = Math.max(0, Math.min(4, dm));
  return Math.round(amount * 0.05 * d);
}

/** Freight (p.62): `pop` shipments of 1D x 5 tonnes at 1000cr per ton. */
export function rollFreight(dice, { destinationPop = 5 } = {}) {
  const lots = [];
  for (let i = 0; i < Math.max(0, destinationPop); i++) {
    const tons = dice.d6() * 5;
    lots.push({ tons, pay: tons * 1000 });
  }
  return { lots, totalTons: lots.reduce((t, l) => t + l.tons, 0), totalPay: lots.reduce((t, l) => t + l.pay, 0) };
}

/** Passengers table (p.62) by originating world population. "x" = none. */
export const PASSENGER_TABLE = {
  0: ["x", "x", "x"],
  1: ["D3-1", "1D-3", "2D-6"],
  2: ["1D-3", "1D", "2D"],
  3: ["1D-3", "2D-6", "2D"],
  4: ["2D-6", "2D-6", "2D"],
  5: ["2D-6", "2D-6", "3D-6"],
  6: ["2D-6", "2D-6", "3D-6"],
  7: ["2D-6", "2D-3", "3D"],
  8: ["2D-3", "2D-3", "4D"],
  9: ["2D-3", "3D", "5D"],
  10: ["3D", "4D", "6D"]
};
export const PASSAGE = { high: 10000, middle: 8000, low: 1000 };

/** Destination factors (p.62): amber -3, red -6, population 0-4 -3, population 8+ +3. */
export function passengerDM({ zone = "", destinationPop = 6 } = {}) {
  let dm = 0;
  if (zone === "A" || zone === "amber") dm -= 3;
  if (zone === "R" || zone === "red") dm -= 6;
  if (destinationPop <= 4) dm -= 3;
  if (destinationPop >= 8) dm += 3;
  return dm;
}

/** Passengers available (p.62). */
export function rollPassengers(dice, { originPop = 6, destinationPop = 6, zone = "" } = {}) {
  const row = PASSENGER_TABLE[Math.min(10, Math.max(0, originPop))];
  const dm = passengerDM({ zone, destinationPop });
  const out = { dm };
  ["high", "middle", "low"].forEach((k, i) => {
    const f = row[i];
    const n = f === "x" ? 0 : Math.max(0, dice.roll(f) + dm);
    out[k] = { formula: f, count: n, fare: PASSAGE[k], income: n * PASSAGE[k] };
  });
  out.total = out.high.income + out.middle.income + out.low.income;
  return out;
}

/** Mail contract negotiation (p.62): 10+, or 6+ for a subsidised ship. Pays 25,000cr per delivery. */
export function rollMail(dice, { subsidised = false, dm = 0 } = {}) {
  const natural = dice.twoD();
  const target = subsidised ? 6 : 10;
  const total = natural + dm;
  return { natural, total, target, success: total >= target, pay: 25000, note: "Needs 5 tonnes of reserved cargo space, an armed ship with a fully trained crew, and a Merchant or Scout background. The contract lasts one year." };
}
