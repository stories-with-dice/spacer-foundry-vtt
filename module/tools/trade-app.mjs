/**
 * Trade calculator (book p.62-65): reads trade codes from world journals (flags.spacer.world) or
 * typed codes, finds suppliers, lists the goods on offer, rolls purchase and sale prices, and
 * negotiates. Freight, passengers, and mail use the same worlds.
 */
import { CHARACTERISTICS, characteristicDM } from "../config.mjs";
import { rollTask, skillRank } from "../play/api.mjs";
import * as trade from "./rules/trade.mjs";
import { signed } from "./rules/dice.mjs";
import { cr } from "./cards.mjs";
import { postCard } from "./chat.mjs";
import { dice, selectedActor, worldJournals, worldOf, currentWorld, freight, passengers, mail } from "./api.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TradeCalculator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "spacer-trade",
    classes: ["spacer", "spacer-tools", "spacer-trade"],
    tag: "div",
    window: { title: "SPACER.Tools.Trade.Title", icon: "fa-solid fa-scale-unbalanced", resizable: true },
    position: { width: 620, height: 720 },
    actions: {
      findSupplier: TradeCalculator.#findSupplier,
      rollGoods: TradeCalculator.#rollGoods,
      buy: TradeCalculator.#buy,
      sell: TradeCalculator.#sell,
      negotiate: TradeCalculator.#negotiate,
      freight: TradeCalculator.#freight,
      passengers: TradeCalculator.#passengers,
      mail: TradeCalculator.#mail
    }
  };

  static PARTS = { main: { template: "systems/spacer/templates/tools/trade.hbs", scrollable: [".st-body"] } };

  /** Form state kept between renders. */
  state = null;
  goods = [];
  last = null;

  #initState() {
    const actor = selectedActor();
    const cur = currentWorld();
    const curId = cur ? worldJournals().find(j => worldOf(j) === cur || j.flags.spacer.world.name === cur.name)?.id ?? "" : "";
    this.state = {
      origin: curId, originCodes: "", originPop: 6, originStarport: "C", originTl: 8,
      destination: "", destinationCodes: "", destinationPop: 6, destinationZone: "",
      broker: actor ? Math.max(0, skillRank(actor, "Broker")) : 0,
      socDM: actor ? characteristicDM(actor.system.characteristics?.soc?.value ?? 7) : 0,
      sellerBroker: 2, hired: 0, supplier: "legitimate", extraLeads: 0, tons: 10, target: 7, subsidised: false
    };
  }

  /** World data for origin or destination: from the journal, else from the typed fields. */
  world(which) {
    const s = this.state;
    const id = s[which];
    const w = id ? worldOf(game.journal.get(id)) : null;
    if (w) return { name: w.name, codes: w.tradeCodes ?? [], pop: w.population, starport: w.starport, tl: w.tl, zone: w.zone ?? "" };
    if (which === "origin") return { name: game.i18n.localize("SPACER.Tools.Trade.Manual"), codes: trade.parseCodes(s.originCodes), pop: Number(s.originPop) || 0, starport: s.originStarport, tl: Number(s.originTl) || 0, zone: "" };
    return { name: game.i18n.localize("SPACER.Tools.Trade.Manual"), codes: trade.parseCodes(s.destinationCodes), pop: Number(s.destinationPop) || 0, starport: "C", tl: 8, zone: s.destinationZone };
  }

  async _prepareContext() {
    if (!this.state) this.#initState();
    const s = this.state;
    const worlds = Object.fromEntries(worldJournals().map(j => [j.id, `${j.name} ${j.flags.spacer.world.uwp ?? ""} ${(j.flags.spacer.world.tradeCodes ?? []).join(" ")}`]));
    const origin = this.world("origin");
    const destination = this.world("destination");
    const goods = this.goods.map(g => ({
      ...g, priceText: cr(g.price),
      purchaseDM: signed(trade.tradeDM(g, origin.codes, "purchase")),
      resaleDM: signed(trade.tradeDM(g, destination.codes, "sale"))
    }));
    return {
      s,
      worlds: { "": game.i18n.localize("SPACER.Tools.Trade.Manual"), ...worlds },
      starports: { A: "A", B: "B", C: "C", D: "D", E: "E", X: "X" },
      zones: { "": "Green", A: "Amber", R: "Red" },
      suppliers: Object.fromEntries(Object.entries(trade.SUPPLIERS).map(([k, v]) => [k, v.label])),
      hiredChoices: { 0: "None", 1: "+1 (5%)", 2: "+2 (10%)", 3: "+3 (15%)", 4: "+4 (20%)" },
      targets: Object.fromEntries(trade.PRICE_TABLE.map(([lo, , v]) => [lo ?? 0, `${lo ?? "0-"}: buy ${v.purchase}% / sell ${v.sale}%`])),
      origin, destination,
      originCodesText: origin.codes.join(" ") || "—",
      destinationCodesText: destination.codes.join(" ") || "—",
      terminalOk: trade.terminalAllowed(origin),
      goods,
      last: this.last,
      actorName: selectedActor()?.name ?? game.i18n.localize("SPACER.Tools.NoActor")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("[data-field]").forEach(el => {
      el.addEventListener("change", () => {
        const k = el.dataset.field;
        this.state[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
        if (["origin", "destination", "originCodes", "destinationCodes", "originPop", "destinationPop", "destinationZone", "originStarport", "originTl"].includes(k)) this.render();
      });
    });
  }

  static async #findSupplier() {
    const s = this.state;
    const sup = trade.SUPPLIERS[s.supplier];
    const origin = this.world("origin");
    if (s.supplier === "terminal" && !trade.terminalAllowed(origin)) {
      ui.notifications.warn(game.i18n.localize("SPACER.Tools.Trade.TerminalNo"));
      return;
    }
    const actor = selectedActor();
    const scores = {};
    for (const k of CHARACTERISTICS) scores[k] = actor?.system?.characteristics?.[k]?.value ?? 7;
    const characteristic = sup.characteristics.reduce((best, k) => (characteristicDM(scores[k]) > characteristicDM(scores[best]) ? k : best), sup.characteristics[0]);
    const dm = trade.supplierDM({ starport: origin.starport, extraLeads: s.extraLeads });
    const time = dice().roll("1D");
    await rollTask({ actor, characteristic, skill: sup.skill, dm, label: `${sup.label} (${time} ${sup.time.endsWith("hours") ? "hours" : "days"})` });
  }

  static async #rollGoods() {
    const origin = this.world("origin");
    const r = trade.goodsAvailable(dice(), { codes: origin.codes, pop: origin.pop, illicit: this.state.supplier === "illicit" });
    this.goods = r.list;
    await postCard({
      title: game.i18n.localize("SPACER.Tools.Trade.Goods"), subtitle: `${origin.name} · ${origin.codes.join(" ") || "no trade codes"} (p.63-64)`,
      icon: "fa-solid fa-boxes-stacked",
      sections: [{ list: r.list.map(g => `${g.code} ${g.name}: ${g.tons} tons at ${cr(g.price)} base`) }],
      footer: `Extra stock from the d66 roll: ${r.extra.code} ${r.extra.name}`
    }, { kind: "goods" });
    this.render();
  }

  #price(mode, code) {
    const s = this.state;
    const good = trade.goodByCode(code);
    const w = mode === "purchase" ? this.world("origin") : this.world("destination");
    const tons = this.goods.find(g => g.code === good.code)?.tons ?? s.tons;
    const r = trade.rollPrice(dice(), { good, codes: w.codes, mode, brokerDM: s.broker, sellerBroker: mode === "purchase" ? s.sellerBroker : 0, hiredDM: Number(s.hired) || 0, tons: Math.min(tons, s.tons || tons) });
    const fee = trade.brokerFee(Number(s.hired) || 0, r.cost);
    this.last = { mode, code: good.code, name: good.name, world: w.name, ...r, fee, costText: cr(r.cost), perTonText: cr(r.perTon), feeText: cr(fee), row: Math.max(0, Math.min(15, r.total)) };
    this.state.target = this.last.row;
    return { good, w, r, fee };
  }

  async #postPrice() {
    const l = this.last;
    await postCard({
      title: l.mode === "purchase" ? "Purchase price" : "Sale price",
      subtitle: `${l.code} ${l.name} · ${l.world} (p.63)`,
      icon: "fa-solid fa-coins",
      headline: `${l.percent}% · ${l.perTonText} per ton · ${l.tons} tons = ${l.costText}`,
      sections: [{ rows: [
        { label: "Roll", value: `2D ${l.natural} + Broker ${this.state.broker} ${signed(l.goodDM)} trade DM${l.mode === "purchase" ? ` - seller ${this.state.sellerBroker}` : ""}${Number(this.state.hired) ? ` + hired ${this.state.hired}` : ""} = ${l.total}` },
        ...(l.fee ? [{ label: "Hired broker fee", value: l.feeText }] : [])
      ] }]
    }, { kind: "price" });
  }

  static async #buy(event, target) {
    this.#price("purchase", target.dataset.code);
    await this.#postPrice();
    this.render();
  }

  static async #sell(event, target) {
    this.#price("sale", target.dataset.code);
    await this.#postPrice();
    this.render();
  }

  static async #negotiate() {
    const l = this.last;
    if (!l) return;
    const s = this.state;
    const good = trade.goodByCode(l.code);
    const r = trade.negotiate(dice(), { good, mode: l.mode, currentRow: l.row, targetRow: Number(s.target), brokerDM: s.broker, socDM: s.socDM, tons: l.tons });
    await postCard({
      title: "Price negotiation", subtitle: `${l.code} ${l.name} (p.65)`, icon: "fa-solid fa-handshake-angle",
      headline: r.success ? `Deal at ${r.percent}%: ${cr(r.perTon)} per ton, ${cr(r.cost)}` : `No deal; the price stays at ${r.percent}%`,
      sections: [{ rows: [
        { label: "Trader's opinion", value: `${r.opinion.label} (${signed(r.opinion.dm)})` },
        { label: "Roll", value: `2D ${r.natural} + Broker ${s.broker} ${signed(r.opinion.dm)} opinion ${signed(r.stepDM)} steps = ${r.total}`, note: "8+" }
      ] }]
    }, { kind: "negotiate" });
    if (r.success) { this.last = { ...l, row: Number(s.target), percent: r.percent, perTon: r.perTon, cost: r.cost, perTonText: cr(r.perTon), costText: cr(r.cost) }; }
    this.render();
  }

  static async #freight() {
    const d = this.world("destination");
    await freight({ destination: { name: d.name, pop: d.pop } });
  }

  static async #passengers() {
    const o = this.world("origin");
    const d = this.world("destination");
    await passengers({ origin: { name: o.name, pop: o.pop }, destination: { name: d.name, pop: d.pop, zone: d.zone } });
  }

  static async #mail() {
    await mail({ subsidised: !!this.state.subsidised });
  }
}
