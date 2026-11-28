#!/usr/bin/env node
/**
 * price-packaging.js - AAJ pricing-and-packaging
 *
 * Models a tiered price list. Each tier has a monthly price and the number of
 * customers on it. The free Pricing and ARPU Modeler on aajconsult.com runs this
 * same code, so the agent and the web tool give the same numbers.
 *
 * It returns:
 *   MRR and ARR     monthly recurring revenue across the tiers, and 12 times it
 *   blended ARPU    MRR / customers; with a free tier, ARPU across paying customers too
 *   revenue mix     each tier's share of MRR, beside its share of customers
 *   price ladder    each tier's price against the tier below it
 *   anchor check    the top tier against the second-highest (called weak under
 *                   1.5x: this engine's rule of thumb, not a published benchmark)
 *   gross margin    per tier and blended, when you give a cost to serve
 *   what if         MRR, ARR and ARPU before and after a change you describe, and for
 *                   each price change how many customers the tier can lose (or must
 *                   gain) to earn what it earns today
 *
 * Usage:
 *   node price-packaging.js --demo                 # worked example (Example Co. is fictional)
 *   node price-packaging.js '<json>'               # your input as one JSON argument
 *   node price-packaging.js --input=tiers.json     # or from a file
 *   add --json for the result as JSON; --help prints this text
 *
 * Input JSON:
 *   {
 *     "tiers": [                       required, 1 to 20 tiers, each with its own name
 *       { "name": "Starter",           required
 *         "price": 29,                 required, 0 or more: the list price for one month,
 *                                      per customer, or per seat when "seats" is given
 *         "customers": 600,            required, a whole number, 0 or more
 *         "seats": 4,                  optional, above 0: average seats a customer on this
 *                                      tier pays for. Giving it makes "price" a per-seat price
 *         "usage": 12,                 optional, 0 or more: average usage revenue per customer
 *                                      per month, on top of the plan price
 *         "annualShare": 40,           optional, 0 to 100: percent of this tier's customers
 *                                      who pay yearly
 *         "annualDiscount": 20,        optional, 0 to 100: this tier's discount for paying
 *                                      yearly, in place of the top-level one
 *         "cost": 6 }                  optional, 0 or more: cost to serve one customer for a month
 *     ],
 *     "annualDiscount": 17,            optional, 0 to 100: percent off the list price for paying yearly
 *     "targetMargin": 80,              optional, 0 to under 100: your gross margin target. A tier
 *                                      with a cost then gets a price floor: cost / (1 - target)
 *     "scenario": {                    optional: a change to test against today
 *       "tiers": [ { "name": "Growth", "price": 119, "customerChange": -20 } ],
 *                                      a new price, a change in customers (minus for customers
 *                                      who leave, plus for customers who join), or both
 *       "moves": [ { "from": "Starter", "to": "Growth", "customers": 30 } ]
 *                                      customers who change tier
 *     }
 *   }
 *
 * How each tier is read:
 *   list price per customer = price x seats (seats is 1 when not given)
 *   plan revenue per customer = list price x (1 - annual share x annual discount)
 *   revenue per customer = plan revenue + usage
 *   tier MRR = customers x revenue per customer
 * Percentages are given as percentages: 20 for 20%, not 0.2.
 *
 * No customers yet? Enter your estimated mix as counts per 100 customers (60, 30, 10)
 * and treat the result as an assumption: MRR then reads per 100 customers.
 *
 * Deterministic. No network calls, no AI calls, nothing written. No dependencies.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// Windows shells (PowerShell, cmd) can pass a JSON payload with its quotes
// backslash-escaped, i.e. {\"a\":1}. Undo that only when the payload opens that
// way, so JSON with legitimately escaped quotes inside strings is left alone.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^\s*[\[{]\s*\\"/.test(a) ? a.replace(/\\"/g, '"') : a
);
// -----------------------------------------------------------------------------


"use strict";

/* aaj:core:begin - the pricing model and input checks. The free Pricing and ARPU Modeler on
   aajconsult.com embeds this block verbatim; the site's verify script checks it byte for byte. */

// Where this engine draws its lines. The two ratios are AAJ's rules of thumb, not benchmarks.
const ANCHOR_MIN = 1.5;   // top tier against the tier below: under this the anchor is called weak
const ARPU_LIFT = 1.6;    // ARPU against the entry tier: at or over this the mix is said to lift revenue
const FEW_TIERS = 3;      // fewer tiers than this: no middle tier to compare against
const MANY_TIERS = 5;     // more tiers than this: flagged as harder to read
const MAX_TIERS = 20;
const TIER_FIELDS = ["name", "price", "customers", "seats", "usage", "annualShare", "annualDiscount", "cost"];
const TOP_FIELDS = ["tiers", "annualDiscount", "targetMargin", "scenario"];
const EPS = 1e-9;         // slack for a count that should land exactly on a whole number

// Half a cent rounds up, as a person would round it, even when the binary value sits a hair under.
function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f + (n >= 0 ? 1e-7 : -1e-7)) / f; }
function pct(part, whole) { return whole > 0 ? round((part / whole) * 100, 1) : 0; }
function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function fmtNum(n) {
  const r = round(Math.abs(n), 2), whole = Math.floor(r + EPS), cents = Math.round((r - whole) * 100);
  return (n < 0 && r > 0 ? "-" : "") + fmtInt(whole) + (cents ? "." + (cents < 10 ? "0" : "") + cents : "");
}
// Whole dollars, for totals.
function money(n) { if (!isFinite(n)) n = 0; return (n < 0 && Math.round(n) !== 0 ? "-$" : "$") + fmtInt(Math.abs(n)); }
// Dollars with cents only when there are any: $91, $72.47, $1,234.50.
function usd(n) { if (!isFinite(n)) n = 0; const s = fmtNum(n); return s.charAt(0) === "-" ? "-$" + s.slice(1) : "$" + s; }
function plural(n, one, many) { return fmtInt(n) + " " + (n === 1 ? one : many); }
function isNum(v) { return typeof v === "number" && isFinite(v); }
function nameKey(v) { return String(v == null ? "" : v).trim().toLowerCase(); }

// One tier, as the model reads it. Old inputs are still read: a missing number is 0.
function readTier(t, cfg) {
  t = t || {};
  const price = Number(t.price) || 0;
  const customers = Number(t.customers != null ? t.customers : t.mixPct) || 0;
  const seats = isNum(t.seats) && t.seats > 0 ? t.seats : null;
  const usage = isNum(t.usage) && t.usage > 0 ? t.usage : 0;
  const annualShare = isNum(t.annualShare) ? t.annualShare : 0;
  const annualDiscount = isNum(t.annualDiscount) ? t.annualDiscount : (cfg && isNum(cfg.annualDiscount) ? cfg.annualDiscount : 0);
  const cost = isNum(t.cost) ? t.cost : null;
  const list = price * (seats === null ? 1 : seats);
  const off = (annualShare / 100) * (annualDiscount / 100);
  const perCustomer = list * (1 - off) + usage;
  return {
    name: (t.name && String(t.name).trim()) || "(tier)",
    price: price, customers: customers, seats: seats, unit: seats === null ? "account" : "seat",
    usage: usage, annualShare: annualShare, annualDiscount: annualDiscount, cost: cost,
    list: list, perCustomer: perCustomer, revenue: customers * perCustomer,
    discountCost: customers * list * off, usageRevenue: customers * usage,
    annualCustomers: customers * annualShare / 100
  };
}

function analyze(cfg) {
  cfg = cfg || {};
  const tiers = (cfg.tiers || []).map((t) => readTier(t, cfg));
  const target = isNum(cfg.targetMargin) ? cfg.targetMargin : null;

  // The ladder compares the prices as listed when every tier is priced the same way. When some
  // are per seat and some per account, it compares what one customer pays at list.
  // (A tier with no price has no unit to speak of, so it does not make the list mixed.)
  const units = tiers.reduce((u, t) => (t.price > 0 && u.indexOf(t.unit) < 0 ? u.concat(t.unit) : u), []);
  const basis = units.length > 1 ? "customer" : (units[0] === "seat" ? "seat" : "price");
  tiers.forEach((t) => { t.step = basis === "customer" ? t.list : t.price; });
  const sorted = tiers.map((t, i) => ({ t: t, i: i })).sort((a, b) => (a.t.step - b.t.step) || (a.i - b.i)).map((x) => x.t);

  const totalCustomers = tiers.reduce((s, t) => s + t.customers, 0);
  const totalRevenue = tiers.reduce((s, t) => s + t.revenue, 0);
  const payingCustomers = tiers.reduce((s, t) => s + (t.perCustomer > 0 ? t.customers : 0), 0);
  const freeCustomers = totalCustomers - payingCustomers;
  const blendedARPU = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const paidARPU = payingCustomers > 0 ? totalRevenue / payingCustomers : 0;
  const discountCost = tiers.reduce((s, t) => s + t.discountCost, 0);
  const usageRevenue = tiers.reduce((s, t) => s + t.usageRevenue, 0);
  const annualCustomers = tiers.reduce((s, t) => s + t.annualCustomers, 0);
  const listPlanRevenue = tiers.reduce((s, t) => s + t.customers * t.list, 0);

  // The entry tier is the cheapest one with a price. A free tier sits below the ladder.
  const priced = sorted.filter((t) => t.step > 0);
  const entry = priced.length ? priced[0] : null;
  const top = sorted.length && sorted[sorted.length - 1].step > 0 ? sorted[sorted.length - 1] : null;
  const second = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const enriched = sorted.map((t, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const hasCost = t.cost !== null;
    const floor = hasCost && target !== null && t.perCustomer > 0 ? t.cost / (1 - target / 100) : null;
    return {
      name: t.name, price: t.price, customers: t.customers, revenue: round(t.revenue, 2),
      revenueShare: pct(t.revenue, totalRevenue),
      customerShare: pct(t.customers, totalCustomers),
      stepMultiple: (prev && prev.step > 0) ? round(t.step / prev.step, 1) : null,
      multipleVsEntry: (entry && t.step > 0) ? round(t.step / entry.step, 1) : null,
      unit: t.unit, seats: t.seats, usage: t.usage,
      annualShare: t.annualShare, annualDiscount: t.annualShare > 0 ? t.annualDiscount : 0,
      listPerCustomer: round(t.list, 2), revenuePerCustomer: round(t.perCustomer, 2),
      cost: t.cost,
      grossProfit: hasCost ? round(t.revenue - t.customers * t.cost, 2) : null,
      marginPct: hasCost && t.perCustomer > 0 ? round((1 - t.cost / t.perCustomer) * 100, 1) : null,
      floor: floor === null ? null : round(floor, 2),
      belowFloor: floor === null ? null : t.perCustomer < floor - EPS
    };
  });

  const steps = [];
  for (let i = 1; i < sorted.length; i++) {
    steps.push({
      from: sorted[i - 1].name, to: sorted[i].name,
      multiple: sorted[i - 1].step > 0 ? round(sorted[i].step / sorted[i - 1].step, 1) : null
    });
  }
  const anchorMultiple = top && second && second.step > 0 ? round(top.step / second.step, 1) : null;
  const topVsEntry = top && entry ? round(top.step / entry.step, 1) : null;

  const order = (key) => enriched.map((t, i) => ({ t: t, i: i })).sort((a, b) => (b.t[key] - a.t[key]) || (a.i - b.i)).map((x) => x.t);
  const byRevenue = order("revenue"), byCustomers = order("customers");
  const topRevenueDriver = byRevenue[0] ? { name: byRevenue[0].name, revenueShare: byRevenue[0].revenueShare } : null;
  const largestCustomerTier = byCustomers[0] ? { name: byCustomers[0].name, customerShare: byCustomers[0].customerShare } : null;
  const entryRow = entry ? enriched[sorted.indexOf(entry)] : null;
  const entryRevenueShare = entryRow ? entryRow.revenueShare : 0;
  const topRevenueShare = enriched.length ? enriched[enriched.length - 1].revenueShare : 0;

  const arpuForEntry = freeCustomers > 0 ? paidARPU : blendedARPU;
  const summary = {
    tierCount: tiers.length,
    totalCustomers: totalCustomers, totalRevenue: round(totalRevenue, 2),
    blendedARPU: round(blendedARPU, 2),
    entryPrice: entry ? entry.price : 0, topPrice: top ? top.price : 0,
    arpuVsEntry: entry ? round(arpuForEntry / entry.list, 1) : null,
    mrr: round(totalRevenue, 2), arr: round(totalRevenue * 12, 2),
    payingCustomers: payingCustomers, freeCustomers: freeCustomers, paidARPU: round(paidARPU, 2),
    annualCustomers: round(annualCustomers, 0), discountCost: round(discountCost, 2),
    discountShare: pct(discountCost, listPlanRevenue),
    usageRevenue: round(usageRevenue, 2), usageShare: pct(usageRevenue, totalRevenue)
  };

  // Gross margin, from the costs given. The blended figure needs a cost on every tier with customers.
  const costed = tiers.filter((t) => t.cost !== null);
  let margin = null;
  if (costed.length) {
    const complete = tiers.every((t) => t.cost !== null || t.customers === 0);
    const cost = costed.reduce((s, t) => s + t.customers * t.cost, 0);
    margin = {
      complete: complete, target: target, cost: round(cost, 2),
      grossProfit: complete ? round(totalRevenue - cost, 2) : null,
      marginPct: complete && totalRevenue > 0 ? round((1 - cost / totalRevenue) * 100, 1) : null
    };
  }

  // No customers on any tier means no mix to read: no advice at all for an empty model.
  const insights = [], flags = [];
  const has = totalCustomers > 0;
  if (has && summary.arpuVsEntry) {
    const entryText = entry.unit === "seat"
      ? "the " + usd(entry.list) + " a customer on your entry tier pays at list (" + fmtNum(entry.seats) + (entry.seats === 1 ? " seat" : " seats") + " at " + usd(entry.price) + ")"
      : "your entry price of " + usd(entry.price);
    insights.push((freeCustomers > 0 ? "ARPU across paying customers is " + usd(paidARPU) : "Blended ARPU is " + usd(blendedARPU)) +
      ", " + summary.arpuVsEntry + "x " + entryText + ". " +
      (summary.arpuVsEntry >= ARPU_LIFT ? "Your mix lifts revenue well above the entry tier." : "That is barely above entry: most customers are not moving up the ladder.") +
      " (" + ARPU_LIFT + "x is AAJ's rule of thumb, not a benchmark.)");
  }
  if (has && freeCustomers > 0) {
    insights.push(fmtInt(freeCustomers) + " of " + plural(totalCustomers, "account", "accounts") + " " + (freeCustomers === 1 ? "pays" : "pay") + " nothing (" +
      pct(freeCustomers, totalCustomers) + "%). Across every account, ARPU is " + usd(blendedARPU) + ".");
  }
  if (has && totalRevenue > 0 && topRevenueDriver) {
    insights.push('Your revenue engine is the "' + topRevenueDriver.name + '" tier at ' + topRevenueDriver.revenueShare + "% of revenue.");
  }
  if (has && totalRevenue > 0 && priced.length >= 2) {
    if (topRevenueDriver.name === entry.name) {
      flags.push("entry-heavy");
      insights.push("Most of your revenue comes from your cheapest " + (sorted[0] !== entry ? "paid " : "") + "tier (" + entryRevenueShare + "%), so few customers are moving up. In AAJ's view, look at the upgrade path and whether your value metric gives customers a reason to move up.");
    } else if (largestCustomerTier.name === entry.name && entryRevenueShare < largestCustomerTier.customerShare) {
      insights.push(largestCustomerTier.customerShare + "% of customers sit on your entry tier, but it brings in only " + entryRevenueShare + "% of revenue. In AAJ's view, that gap is where to look for expansion.");
    }
  }
  if (has && anchorMultiple !== null) {
    const how = basis === "customer" ? " The two are compared on what one customer pays at list, because some tiers are priced per seat and some per account." : "";
    if (anchorMultiple < ANCHOR_MIN) {
      flags.push("weak-anchor");
      insights.push("Your top tier is only " + anchorMultiple + "x the tier below it, under the " + ANCHOR_MIN + "x this engine uses as its rule of thumb for an anchor. In AAJ's view, a higher top tier makes the middle tiers look more reasonable; test it rather than assume it." + how);
    } else {
      insights.push("Your top tier is " + anchorMultiple + "x the tier below, at or above the " + ANCHOR_MIN + "x this engine uses as its rule of thumb for an anchor." + how);
    }
  }
  if (has && summary.tierCount > 0 && summary.tierCount < FEW_TIERS) {
    flags.push("few-tiers");
    insights.push("You have " + summary.tierCount + " tier" + (summary.tierCount !== 1 ? "s" : "") + "; with fewer than three, buyers have no middle tier to compare against.");
  } else if (has && summary.tierCount > MANY_TIERS) {
    flags.push("many-tiers");
    insights.push("You have " + summary.tierCount + " tiers. In AAJ's view, more than four or five makes the choice harder to read; check where buyers stall before adding another.");
  }
  if (has && discountCost > 0) {
    insights.push("About " + plural(summary.annualCustomers, "customer pays", "customers pay") + " yearly. The annual discount gives up " + money(discountCost) +
      " a month against list prices, " + summary.discountShare + "% of plan revenue at list.");
  }
  if (has && usageRevenue > 0) {
    insights.push("Usage brings in " + money(usageRevenue) + " a month, " + summary.usageShare + "% of revenue.");
  }
  if (has && margin) {
    sorted.forEach((t) => {
      if (t.cost === null || t.customers === 0) return;
      if (t.perCustomer <= 0) {
        if (t.cost > 0) insights.push('"' + t.name + '" earns nothing and costs ' + money(t.customers * t.cost) + " a month to serve (" + plural(t.customers, "customer", "customers") + " at " + usd(t.cost) + ").");
      } else if (t.perCustomer < t.cost - EPS) {
        flags.push("loses-money");
        insights.push('"' + t.name + '" costs more to serve than it earns: ' + usd(t.cost) + " a customer against " + usd(t.perCustomer) + ".");
      } else if (target !== null && t.perCustomer < t.cost / (1 - target / 100) - EPS) {
        flags.push("below-floor");
        insights.push('"' + t.name + '" is under your ' + target + "% margin target: it earns " + usd(t.perCustomer) + " a customer and the target needs " + usd(t.cost / (1 - target / 100)) + " at a cost of " + usd(t.cost) + ".");
      }
    });
    if (margin.complete && margin.marginPct !== null) {
      insights.push("Gross margin across the tiers is " + margin.marginPct + "%: " + money(totalRevenue - margin.cost) + " a month after " + money(margin.cost) + " to serve.");
    } else if (!margin.complete) {
      insights.push("Give a cost for every tier with customers to see the gross margin across the tiers.");
    }
  }

  const result = {
    summary: summary,
    tiers: enriched,
    ladder: { basis: basis, steps: steps, anchorMultiple: anchorMultiple, topVsEntry: topVsEntry },
    concentration: { topRevenueDriver: topRevenueDriver, largestCustomerTier: largestCustomerTier, entryRevenueShare: entryRevenueShare, topRevenueShare: topRevenueShare },
    margin: margin,
    flags: flags.filter((f, i) => flags.indexOf(f) === i),
    insights: insights,
    scenario: null
  };
  if (cfg.scenario) result.scenario = whatIf(cfg, result);
  return result;
}

// The tiers after the scenario: its price changes, its customers who leave or join, then its moves.
function scenarioTiers(cfg) {
  const sc = cfg.scenario || {}, by = {};
  const next = cfg.tiers.map((t) => { const c = Object.assign({}, t); by[nameKey(t.name)] = c; return c; });
  const log = {};
  cfg.tiers.forEach((t) => { log[nameKey(t.name)] = { change: 0, out: 0, into: 0, price: null }; });
  (sc.tiers || []).forEach((s) => {
    const k = nameKey(s.name);
    if (isNum(s.price)) { log[k].price = s.price; by[k].price = s.price; }
    if (isNum(s.customerChange)) { log[k].change = s.customerChange; by[k].customers += s.customerChange; }
  });
  (sc.moves || []).forEach((m) => {
    const f = nameKey(m.from), t = nameKey(m.to);
    by[f].customers -= m.customers; log[f].out += m.customers;
    by[t].customers += m.customers; log[t].into += m.customers;
  });
  return { tiers: next, log: log };
}

function whatIf(cfg, before) {
  const sc = scenarioTiers(cfg);
  const rest = {};
  TOP_FIELDS.forEach((k) => { if (k !== "scenario" && k !== "tiers" && cfg[k] !== undefined) rest[k] = cfg[k]; });
  const after = analyze(Object.assign({}, rest, { tiers: sc.tiers }));
  const b = before.summary, a = after.summary;
  const side = (r) => ({
    mrr: r.summary.mrr, arr: r.summary.arr, arpu: r.summary.blendedARPU, customers: r.summary.totalCustomers,
    grossProfit: r.margin && r.margin.complete ? r.margin.grossProfit : null
  });
  const rows = cfg.tiers.map((t, i) => {
    const t0 = readTier(t, cfg), t1 = readTier(sc.tiers[i], cfg), l = sc.log[nameKey(t.name)];
    return {
      name: t0.name, priceBefore: t0.price, priceAfter: t1.price,
      customersBefore: t0.customers, customersAfter: t1.customers,
      perCustomerBefore: round(t0.perCustomer, 2), perCustomerAfter: round(t1.perCustomer, 2),
      mrrBefore: round(t0.revenue, 2), mrrAfter: round(t1.revenue, 2),
      customerChange: l.change, movedOut: l.out, movedIn: l.into, unit: t0.unit, _0: t0, _1: t1, _priced: l.price !== null
    };
  });

  // For each new price: how many customers the tier can lose, or must gain, to earn what it earns today.
  const priceChanges = [];
  rows.forEach((r) => {
    if (!r._priced || r.priceAfter === r.priceBefore) return;
    const r0 = r._0.perCustomer, r1 = r._1.perCustomer, n = r.customersBefore, up = r1 > r0;
    const c = { name: r.name, from: r.priceBefore, to: r.priceAfter, direction: up ? "increase" : "decrease",
      changePct: r.priceBefore > 0 ? round(Math.abs(r.priceAfter / r.priceBefore - 1) * 100, 1) : null,
      customers: n, breakEvenCustomers: null, breakEvenPct: null };
    if (up) {
      c.breakEvenCustomers = Math.floor(n * (1 - r0 / r1) + EPS);
      c.breakEvenPct = round((1 - r0 / r1) * 100, 1);
    } else if (r1 > 0) {
      c.breakEvenCustomers = Math.ceil(n * (r0 / r1 - 1) - EPS);
      c.breakEvenPct = round((r0 / r1 - 1) * 100, 1);
    }
    priceChanges.push(c);
  });

  const moved = (cfg.scenario.moves || []).reduce((s, m) => s + m.customers, 0);
  const readout = [];
  const dm = a.mrr - b.mrr;
  if (Math.abs(dm) < 0.005) readout.push("MRR stays at " + money(b.mrr) + ", and ARR at " + money(b.arr) + ".");
  else readout.push("MRR goes from " + money(b.mrr) + " to " + money(a.mrr) + " (" + (dm > 0 ? "up " : "down ") + money(Math.abs(dm)) + (b.mrr > 0 ? ", " + round(Math.abs(dm) / b.mrr * 100, 1) + "%" : "") + "). ARR goes from " + money(b.arr) + " to " + money(a.arr) + ".");
  readout.push("Blended ARPU " + (a.blendedARPU === b.blendedARPU ? "stays at " + usd(b.blendedARPU) : "goes from " + usd(b.blendedARPU) + " to " + usd(a.blendedARPU)) + ", with " +
    (a.totalCustomers === b.totalCustomers ? "the same " + plural(b.totalCustomers, "customer", "customers") : plural(a.totalCustomers, "customer", "customers") + " against " + fmtInt(b.totalCustomers) + " today") + ".");
  priceChanges.forEach((c) => {
    const row = rows.filter((r) => r.name === c.name)[0];
    const per = row.unit === "seat" ? " a seat" : "";
    const head = '"' + c.name + '" at ' + usd(c.to) + per + ", " + (c.direction === "increase" ? "up" : "down") + " from " + usd(c.from) + (c.changePct !== null ? " (" + c.changePct + "%)" : "") + ": ";
    const ends = " In this scenario it ends with " + plural(row.customersAfter, "customer", "customers") + " and " + money(row.mrrAfter) + " a month, against " + money(row.mrrBefore) + " today.";
    if (c.customers === 0) readout.push(head + "no customers are on this tier today, so there is nothing to lose or win back." + ends);
    else if (c.direction === "increase") readout.push(head + "the tier earns at least what it earns today if no more than " + fmtInt(c.breakEvenCustomers) + " of its " + plural(c.customers, "customer leaves", "customers leave") + " (" + c.breakEvenPct + "%)." + ends);
    else if (c.breakEvenCustomers === null) readout.push(head + "at this price no number of customers earns what the tier earns today." + ends);
    else readout.push(head + "the tier needs " + plural(c.breakEvenCustomers, "more customer", "more customers") + " than its " + fmtInt(c.customers) + " (" + c.breakEvenPct + "%) to earn what it earns today." + ends);
  });
  if (moved > 0) readout.push(plural(moved, "customer changes", "customers change") + " tier. Each is counted as an average customer of the tier they move to.");
  const gb = side(before).grossProfit, ga = side(after).grossProfit;
  if (gb !== null && ga !== null) readout.push("Gross profit " + (ga === gb ? "stays at " + money(gb) : "goes from " + money(gb) + " to " + money(ga)) + " a month.");

  return {
    before: side(before), after: side(after),
    change: { mrr: round(dm, 2), mrrPct: b.mrr > 0 ? round(dm / b.mrr * 100, 1) : null, arpu: round(a.blendedARPU - b.blendedARPU, 2), customers: a.totalCustomers - b.totalCustomers },
    tiers: rows.map((r) => { const o = Object.assign({}, r); delete o._0; delete o._1; delete o._priced; return o; }),
    priceChanges: priceChanges,
    afterTiers: after.tiers, afterLadder: after.ladder, afterFlags: after.flags,
    readout: readout
  };
}

// The older entry point: a list of tiers, and optionally the rest of the input.
function analyzePricing(tiersInput, rest) { return analyze(Object.assign({}, rest || {}, { tiers: tiersInput || [] })); }

// Every problem with the input, in words. An empty list means the input can be modelled.
function validate(cfg) {
  const errs = [];
  const q = (s) => '"' + s + '"';
  const list = (a) => a.map(q).join(", ");
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return ['Give {"tiers": [{ "name": "Starter", "price": 29, "customers": 600 }, ...]}.'];
  const unknown = Object.keys(cfg).filter((k) => TOP_FIELDS.indexOf(k) < 0);
  if (unknown.length) errs.push("Unrecognised field" + (unknown.length > 1 ? "s" : "") + ": " + list(unknown) + ". Expected: " + TOP_FIELDS.join(", ") + ".");
  const percent = (v, where, max, upTo) => {
    if (!isNum(v) || v < 0 || (upTo ? v > max : v >= max)) errs.push(where + " must be a percentage from 0 to " + (upTo ? "" : "under ") + max + ".");
    else if (v > 0 && v < 1) errs.push(where + " is " + v + ". Give a percentage: 20 for 20%, not 0.2.");
  };
  if (cfg.annualDiscount !== undefined) percent(cfg.annualDiscount, '"annualDiscount"', 100, true);
  if (cfg.targetMargin !== undefined) percent(cfg.targetMargin, '"targetMargin"', 100, false);
  if (!Array.isArray(cfg.tiers) || !cfg.tiers.length) {
    errs.push('"tiers" must be a list with at least one tier: [{ "name": "Starter", "price": 29, "customers": 600 }, ...].');
    return errs;
  }
  if (cfg.tiers.length > MAX_TIERS) errs.push('"tiers" has ' + cfg.tiers.length + " tiers. This engine reads up to " + MAX_TIERS + ".");
  const seen = {}, known = {};
  cfg.tiers.forEach((t, i) => {
    const label = t && typeof t.name === "string" && t.name.trim() ? q(t.name.trim()) : "tier " + (i + 1);
    if (!t || typeof t !== "object" || Array.isArray(t)) { errs.push(label + ' must be {"name", "price", "customers"}.'); return; }
    const bad = Object.keys(t).filter((k) => TIER_FIELDS.indexOf(k) < 0);
    if (bad.length) errs.push(label + ": unrecognised field " + list(bad) + ". Expected: " + TIER_FIELDS.join(", ") + ".");
    if (typeof t.name !== "string" || !t.name.trim()) errs.push(label + ': "name" is required.');
    else if (seen.hasOwnProperty("$" + nameKey(t.name))) errs.push("Two tiers are named " + q(t.name.trim()) + ". Give each tier its own name.");
    else { seen["$" + nameKey(t.name)] = true; known["$" + nameKey(t.name)] = t; }
    ["price", "customers"].forEach((k) => {
      if (!isNum(t[k]) || t[k] < 0) errs.push(label + ': "' + k + '" must be a number, 0 or more.');
      else if (k === "customers" && Math.floor(t[k]) !== t[k]) errs.push(label + ': "customers" must be a whole number.');
    });
    ["usage", "cost"].forEach((k) => { if (t[k] !== undefined && (!isNum(t[k]) || t[k] < 0)) errs.push(label + ': "' + k + '" must be a number, 0 or more.'); });
    if (t.seats !== undefined && (!isNum(t.seats) || t.seats <= 0)) errs.push(label + ': "seats" must be a number above 0: the average seats a customer on this tier pays for.');
    if (t.annualShare !== undefined && (!isNum(t.annualShare) || t.annualShare < 0 || t.annualShare > 100)) errs.push(label + ': "annualShare" must be a percentage from 0 to 100.');
    if (t.annualDiscount !== undefined) percent(t.annualDiscount, label + ': "annualDiscount"', 100, true);
  });

  const sc = cfg.scenario;
  if (sc !== undefined) {
    if (!sc || typeof sc !== "object" || Array.isArray(sc)) { errs.push('"scenario" must be {"tiers": [...], "moves": [...]}.'); return errs; }
    const extra = Object.keys(sc).filter((k) => k !== "tiers" && k !== "moves");
    if (extra.length) errs.push("scenario: unrecognised field " + list(extra) + ". Expected: tiers, moves.");
    const sT = sc.tiers === undefined ? [] : sc.tiers, sM = sc.moves === undefined ? [] : sc.moves;
    if (!Array.isArray(sT)) errs.push('scenario: "tiers" must be a list such as [{ "name": "Growth", "price": 119, "customerChange": -20 }].');
    if (!Array.isArray(sM)) errs.push('scenario: "moves" must be a list such as [{ "from": "Starter", "to": "Growth", "customers": 30 }].');
    if (Array.isArray(sT) && Array.isArray(sM) && !sT.length && !sM.length) errs.push('scenario: give at least one change in "tiers" or "moves".');
    const has = (n) => typeof n === "string" && known.hasOwnProperty("$" + nameKey(n));
    const pool = {}, taken = {}, listed = {};
    Object.keys(known).forEach((k) => { pool[k] = isNum(known[k].customers) ? known[k].customers : 0; taken[k] = 0; });
    let sound = errs.length === 0;
    (Array.isArray(sT) ? sT : []).forEach((s, i) => {
      const at = "scenario tier " + (i + 1);
      if (!s || typeof s !== "object" || Array.isArray(s)) { errs.push(at + ' must be {"name", "price", "customerChange"}.'); sound = false; return; }
      const bad = Object.keys(s).filter((k) => ["name", "price", "customerChange"].indexOf(k) < 0);
      if (bad.length) { errs.push(at + ": unrecognised field " + list(bad) + ". Expected: name, price, customerChange."); sound = false; }
      if (!has(s.name)) { errs.push("scenario: no tier is named " + q(String(s.name === undefined ? "" : s.name)) + "."); sound = false; return; }
      const k = "$" + nameKey(s.name), label = q(String(s.name).trim());
      if (listed[k]) { errs.push("scenario: " + label + " is listed twice."); sound = false; return; }
      listed[k] = true;
      if (s.price === undefined && s.customerChange === undefined) { errs.push("scenario: " + label + ' needs a "price" or a "customerChange".'); sound = false; }
      if (s.price !== undefined && (!isNum(s.price) || s.price < 0)) { errs.push("scenario: " + label + ': "price" must be a number, 0 or more.'); sound = false; }
      if (s.customerChange !== undefined) {
        if (!isNum(s.customerChange) || Math.floor(s.customerChange) !== s.customerChange) { errs.push("scenario: " + label + ': "customerChange" must be a whole number: minus for customers who leave, plus for customers who join.'); sound = false; }
        else pool[k] += s.customerChange;
      }
    });
    (Array.isArray(sM) ? sM : []).forEach((m, i) => {
      const at = "scenario move " + (i + 1);
      if (!m || typeof m !== "object" || Array.isArray(m)) { errs.push(at + ' must be {"from", "to", "customers"}.'); sound = false; return; }
      const bad = Object.keys(m).filter((k) => ["from", "to", "customers"].indexOf(k) < 0);
      if (bad.length) { errs.push(at + ": unrecognised field " + list(bad) + ". Expected: from, to, customers."); sound = false; }
      let ok = true;
      ["from", "to"].forEach((k) => { if (!has(m[k])) { errs.push("scenario: no tier is named " + q(String(m[k] === undefined ? "" : m[k])) + "."); ok = false; } });
      if (ok && nameKey(m.from) === nameKey(m.to)) { errs.push("scenario: a move needs two different tiers, and this one goes from " + q(String(m.from).trim()) + " to itself."); ok = false; }
      if (!isNum(m.customers) || m.customers <= 0 || Math.floor(m.customers) !== m.customers) { errs.push(at + ': "customers" must be a whole number above 0.'); ok = false; }
      if (!ok) { sound = false; return; }
      taken["$" + nameKey(m.from)] += m.customers;
    });
    // Only when everything else is sound: does any tier end up with fewer than no customers?
    if (sound) {
      Object.keys(known).forEach((k) => {
        const name = q(String(known[k].name).trim()), start = known[k].customers;
        if (pool[k] < 0) errs.push("scenario: " + name + " has " + plural(start, "customer", "customers") + ", and the scenario takes away " + fmtInt(start - pool[k]) + ".");
        else if (taken[k] > pool[k]) errs.push("scenario: " + name + " has " + plural(pool[k], "customer", "customers") + (pool[k] !== start ? " after its own change" : "") + ", and the scenario moves out " + fmtInt(taken[k]) + ".");
      });
    }
  }
  return errs;
}
// The name the web tool has always called.
function validateTiers(cfg) { return validate(cfg); }
/* aaj:core:end */

/* ----------------------------- CLI ----------------------------- */

// Example Co. is fictional. Its tiers, mix and scenario are invented to show the model at work.
const DEMO = {
  tiers: [
    { name: "Starter",    price: 29,  customers: 600, annualShare: 20 },
    { name: "Growth",     price: 99,  customers: 300, annualShare: 40 },
    { name: "Scale",      price: 299, customers: 80,  annualShare: 50 },
    { name: "Enterprise", price: 999, customers: 20,  annualShare: 100 }
  ],
  annualDiscount: 17,
  scenario: {
    tiers: [{ name: "Growth", price: 119, customerChange: -20 }],
    moves: [{ from: "Starter", to: "Growth", customers: 30 }]
  }
};

function pad(s, n) { s = "" + s; return s.length >= n ? s : s + " ".repeat(n - s.length); }
function padl(s, n) { s = "" + s; return s.length >= n ? s : " ".repeat(n - s.length) + s; }

function render(r, source) {
  const L = [];
  const s = r.summary;
  L.push("Pricing and ARPU model");
  L.push("Source: " + source);
  L.push("");
  L.push(pad("Tier", 14) + padl("Price", 9) + padl("Customers", 11) + padl("Per customer", 14) + padl("MRR", 12) + padl("Rev %", 8) + padl("Cust %", 8) + padl("Step", 7));
  L.push("-".repeat(14) + " " + "-".repeat(8) + "  " + "-".repeat(9) + "  " + "-".repeat(12) + "  " + "-".repeat(10) + "  " + "-".repeat(6) + "  " + "-".repeat(6) + "  " + "-".repeat(5));
  r.tiers.forEach((t) => {
    L.push(
      pad(t.name.slice(0, 13), 14) +
      padl(usd(t.price) + (t.unit === "seat" ? "/seat" : ""), 9) +
      padl(fmtInt(t.customers), 11) +
      padl(usd(t.revenuePerCustomer), 14) +
      padl(money(t.revenue), 12) +
      padl(t.revenueShare + "%", 8) +
      padl(t.customerShare + "%", 8) +
      padl(t.stepMultiple ? t.stepMultiple + "x" : "-", 7)
    );
  });
  const details = r.tiers.map((t) => {
    const parts = [];
    if (t.unit === "seat") parts.push(fmtNum(t.seats) + (t.seats === 1 ? " seat" : " seats") + " a customer, " + usd(t.listPerCustomer) + " at list");
    if (t.annualShare > 0) parts.push(t.annualShare + "% pay yearly at " + t.annualDiscount + "% off");
    if (t.usage > 0) parts.push("usage " + usd(t.usage) + " a customer");
    if (t.cost !== null) parts.push("costs " + usd(t.cost) + " a customer to serve" + (t.marginPct !== null ? " (margin " + t.marginPct + "%)" : "") + (t.floor !== null ? ", floor " + usd(t.floor) : ""));
    return parts.length ? "  " + t.name + ": " + parts.join("; ") : null;
  }).filter(Boolean);
  if (details.length) { L.push(""); L.push("How each tier is charged"); details.forEach((d) => L.push(d)); }
  L.push("");
  L.push("MRR:            " + money(s.mrr));
  L.push("ARR:            " + money(s.arr));
  L.push("Blended ARPU:   " + usd(s.blendedARPU) + (s.freeCustomers > 0 ? "   (" + usd(s.paidARPU) + " across paying customers)" : "") +
    (s.arpuVsEntry ? "   (" + s.arpuVsEntry + "x the entry tier)" : ""));
  if (r.ladder.steps.length) {
    L.push("Price ladder:   " + r.tiers.map((t) => usd(r.ladder.basis === "customer" ? t.listPerCustomer : t.price)).join(" -> ") +
      (r.ladder.basis === "seat" ? "   (per seat)" : r.ladder.basis === "customer" ? "   (what one customer pays at list)" : ""));
  }
  if (r.ladder.anchorMultiple !== null) {
    L.push("Anchor check:   " + (r.ladder.anchorMultiple < ANCHOR_MIN
      ? "Weak: the top tier is only " + r.ladder.anchorMultiple + "x the tier below"
      : "OK: the top tier is " + r.ladder.anchorMultiple + "x the tier below"));
  }
  if (r.margin && r.margin.complete && r.margin.marginPct !== null) L.push("Gross margin:   " + r.margin.marginPct + "%   (" + money(r.margin.grossProfit) + " a month)");
  L.push("");
  L.push("Read-out:");
  if (!r.insights.length) L.push("  - No customers on any tier yet, so there is no mix to read.");
  r.insights.forEach((i) => L.push("  - " + i));
  if (r.scenario) {
    const sc = r.scenario, b = sc.before, a = sc.after;
    const delta = (n, f) => (n > 0 ? "+" : n < 0 ? "-" : "") + f(Math.abs(n));
    L.push("");
    L.push("What if");
    L.push(pad("", 14) + padl("Today", 14) + padl("Scenario", 14) + padl("Change", 14));
    L.push(pad("MRR", 14) + padl(money(b.mrr), 14) + padl(money(a.mrr), 14) + padl(delta(sc.change.mrr, money), 14) + (sc.change.mrrPct !== null ? "  (" + delta(sc.change.mrrPct, String) + "%)" : ""));
    L.push(pad("ARR", 14) + padl(money(b.arr), 14) + padl(money(a.arr), 14) + padl(delta(a.arr - b.arr, money), 14));
    L.push(pad("Blended ARPU", 14) + padl(usd(b.arpu), 14) + padl(usd(a.arpu), 14) + padl(delta(sc.change.arpu, usd), 14));
    L.push(pad("Customers", 14) + padl(fmtInt(b.customers), 14) + padl(fmtInt(a.customers), 14) + padl(delta(sc.change.customers, fmtInt), 14));
    const moved = sc.tiers.filter((t) => t.priceBefore !== t.priceAfter || t.customersBefore !== t.customersAfter);
    if (moved.length) {
      const span = (x, y, f) => (x === y ? f(x) : f(x) + " to " + f(y));
      L.push("");
      L.push("  " + pad("Tier", 14) + pad("Price", 16) + pad("Customers", 18) + "MRR");
      moved.forEach((t) => L.push("  " + pad(t.name.slice(0, 13), 14) + pad(span(t.priceBefore, t.priceAfter, usd), 16) + pad(span(t.customersBefore, t.customersAfter, fmtInt), 18) + span(t.mrrBefore, t.mrrAfter, money)));
    }
    L.push("");
    sc.readout.forEach((i) => L.push("  - " + i));
  }
  L.push("");
  L.push("Note: customer counts drive the mix. For a product with no customers yet, enter an");
  L.push("estimated mix (counts per 100) and treat every figure here as an assumption.");
  return L.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const jsonOut = argv.indexOf("--json") >= 0;
  const rest = argv.filter((a) => a !== "--json");
  if (rest.indexOf("--help") >= 0 || rest.indexOf("-h") >= 0) {
    console.log(require("fs").readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?/, ""));
    process.exit(0);
  }
  const isJson = (a) => a.trim().charAt(0) === "{" || a.trim().charAt(0) === "[";
  // A mistyped argument stops the run. It never falls back to the worked example.
  const stray = rest.filter((a) => a !== "--demo" && !/^--input=/.test(a) && !isJson(a));
  if (stray.length) {
    console.error("Unrecognised argument: " + stray[0] + "\nGive your input as one JSON argument or with --input=file.json. Run --help for the input, or --demo for a worked example.");
    process.exit(1);
  }
  let cfg = DEMO;
  let source = "built-in demo data (Example Co., a fictional company)";
  const file = rest.map((a) => a.match(/^--input=(.*)$/)).filter(Boolean)[0];
  if (file) {
    let text;
    try { text = require("fs").readFileSync(file[1], "utf8"); }
    catch (e) { console.error("Could not read the file " + file[1] + "."); process.exit(1); }
    try { cfg = JSON.parse(text); }
    catch (e) { console.error(file[1] + " is not valid JSON. Run --help for the input."); process.exit(1); }
    source = file[1];
  }
  // A JSON argument works too (agents and the MCP server pass input this way).
  const inline = rest.filter(isJson)[0];
  if (inline) {
    try { cfg = JSON.parse(inline); }
    catch (e) { console.error("Invalid JSON. Run --help for the input, or --demo for a worked example."); process.exit(1); }
    source = "your input";
  }
  const problems = validate(cfg);
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error("\nRun --help for the input, or --demo for a worked example.");
    process.exit(1);
  }
  const result = analyze(cfg);
  console.log(jsonOut ? JSON.stringify(result, null, 2) : render(result, source));
}

if (require.main === module) main();

module.exports = { analyze, analyzePricing, validate, validateTiers, readTier, scenarioTiers, usd, money, fmtInt, fmtNum, round,
  ANCHOR_MIN, ARPU_LIFT, FEW_TIERS, MANY_TIERS, MAX_TIERS, TIER_FIELDS, TOP_FIELDS };
