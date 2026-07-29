#!/usr/bin/env node
/**
 * price-packaging.js — AAJ · pricing-and-packaging
 *
 * Sanity-checks a tiered pricing structure. Each tier has a price and a number
 * of customers on it. Aligned with the web tool (Pricing & ARPU Modeler) — same
 * computation, same input model. The model returns:
 *   blended ARPU   = total revenue / total customers
 *   revenue mix    = each tier's (price × customers) as a share of the total
 *   price ladder   = each tier's price relative to the tier below it
 *   anchor check   = top tier vs the SECOND-highest tier (a real anchor needs a
 *                    meaningful jump — flagged weak below ~1.5x)
 *   concentration  = where revenue actually sits (entry vs middle/top)
 *
 * Usage:
 *   node price-packaging.js                 # built-in demo
 *   node price-packaging.js --input=tiers.json
 *
 * Input JSON shape:
 *   { "tiers": [ { "name": "Starter", "price": 29, "customers": 600 }, ... ] }
 *
 * Designing pricing for a product with no customers yet? Enter your estimated
 * mix as counts per 100 customers (e.g. 60 / 30 / 10) and treat it as an
 * assumption — the mix percentages come out identical either way.
 *
 * Deterministic. No external dependencies.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------


"use strict";

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }
function pct(part, whole) { return whole > 0 ? round((part / whole) * 100, 1) : 0; }
function money(n) { if (!isFinite(n)) n = 0; return "$" + Math.round(n).toLocaleString("en-US"); }

function analyzePricing(tiersInput) {
  const tiers = (tiersInput || []).map(t => ({
    name: (t.name && String(t.name).trim()) || "(tier)",
    price: Number(t.price) || 0,
    // counts are the model; fall back to mixPct as a weight for legacy inputs
    customers: Number(t.customers != null ? t.customers : t.mixPct) || 0
  }));

  tiers.forEach(t => { t.revenue = t.price * t.customers; });
  const totalCustomers = tiers.reduce((s, t) => s + t.customers, 0);
  const totalRevenue = tiers.reduce((s, t) => s + t.revenue, 0);
  const blendedARPU = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  const sorted = [...tiers].sort((a, b) => a.price - b.price);
  const entryPrice = sorted.length ? sorted[0].price : 0;
  const topPrice = sorted.length ? sorted[sorted.length - 1].price : 0;

  const enriched = sorted.map((t, i) => ({
    name: t.name, price: t.price, customers: t.customers, revenue: t.revenue,
    revenueShare: pct(t.revenue, totalRevenue),
    customerShare: pct(t.customers, totalCustomers),
    stepMultiple: (i > 0 && sorted[i - 1].price > 0) ? round(t.price / sorted[i - 1].price, 1) : null,
    multipleVsEntry: entryPrice > 0 ? round(t.price / entryPrice, 1) : null
  }));

  const steps = [];
  for (let i = 1; i < sorted.length; i++) {
    steps.push({
      from: sorted[i - 1].name, to: sorted[i].name,
      multiple: sorted[i - 1].price > 0 ? round(sorted[i].price / sorted[i - 1].price, 1) : null
    });
  }
  const secondTop = sorted.length >= 2 ? sorted[sorted.length - 2].price : 0;
  const anchorMultiple = secondTop > 0 ? round(topPrice / secondTop, 1) : null;
  const topVsEntry = entryPrice > 0 ? round(topPrice / entryPrice, 1) : null;

  const byRevenue = [...enriched].sort((a, b) => b.revenue - a.revenue);
  const byCustomers = [...enriched].sort((a, b) => b.customers - a.customers);
  const topRevenueDriver = byRevenue[0] ? { name: byRevenue[0].name, revenueShare: byRevenue[0].revenueShare } : null;
  const largestCustomerTier = byCustomers[0] ? { name: byCustomers[0].name, customerShare: byCustomers[0].customerShare } : null;
  const entryRevenueShare = enriched.length ? enriched[0].revenueShare : 0;
  const topRevenueShare = enriched.length ? enriched[enriched.length - 1].revenueShare : 0;

  const summary = {
    tierCount: tiers.length,
    totalCustomers, totalRevenue,
    blendedARPU: round(blendedARPU, 2),
    entryPrice, topPrice,
    arpuVsEntry: entryPrice > 0 ? round(blendedARPU / entryPrice, 1) : null
  };

  const insights = [];
  if (summary.arpuVsEntry) {
    insights.push(`Blended ARPU is $${round(blendedARPU, 2)} — ${summary.arpuVsEntry}x your entry price of $${entryPrice}. ` +
      (summary.arpuVsEntry >= 1.6 ? `Your mix lifts revenue well above the entry tier.` : `That's barely above entry — most customers aren't moving up the ladder.`));
  }
  if (topRevenueDriver) {
    insights.push(`Your revenue engine is the "${topRevenueDriver.name}" tier at ${topRevenueDriver.revenueShare}% of revenue.`);
  }
  if (enriched.length >= 2) {
    const entryIsDriver = topRevenueDriver && topRevenueDriver.name === enriched[0].name;
    if (entryIsDriver) {
      insights.push(`Most of your revenue comes from your cheapest tier (${entryRevenueShare}%) — your packaging is likely leaving money on the table. Look hard at the upgrade path and whether your value metric pushes customers up.`);
    } else if (largestCustomerTier && largestCustomerTier.name === enriched[0].name && entryRevenueShare < largestCustomerTier.customerShare) {
      insights.push(`${largestCustomerTier.customerShare}% of customers sit on your entry tier but it's only ${entryRevenueShare}% of revenue — that gap is your expansion opportunity.`);
    }
  }
  if (anchorMultiple !== null) {
    if (anchorMultiple < 1.5) {
      insights.push(`Your top tier is only ${anchorMultiple}x the tier below it — it isn't anchoring. A higher top tier makes your middle tiers look more reasonable and captures customers who'd happily pay more.`);
    } else {
      insights.push(`Your top tier anchors well at ${anchorMultiple}x the tier below — that reframes the middle tiers and lifts willingness to pay.`);
    }
  }
  if (summary.tierCount > 0 && summary.tierCount < 3) {
    insights.push(`You have ${summary.tierCount} tier${summary.tierCount !== 1 ? "s" : ""}; most SaaS converts best with 3-4 — a clear Good/Better/Best.`);
  } else if (summary.tierCount > 5) {
    insights.push(`You have ${summary.tierCount} tiers; more than four or five can create decision paralysis and lower conversion.`);
  }

  return {
    summary,
    tiers: enriched,
    ladder: { steps, anchorMultiple, topVsEntry },
    concentration: { topRevenueDriver, largestCustomerTier, entryRevenueShare, topRevenueShare },
    insights
  };
}

/* ----------------------------- CLI ----------------------------- */

const DEMO = {
  tiers: [
    { name: "Starter",    price: 29,  customers: 600 },
    { name: "Growth",     price: 99,  customers: 300 },
    { name: "Scale",      price: 299, customers: 80 },
    { name: "Enterprise", price: 999, customers: 20 }
  ]
};

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function pad(s, n) { s = "" + s; return s.length >= n ? s : s + " ".repeat(n - s.length); }
function padl(s, n) { s = "" + s; return s.length >= n ? s : " ".repeat(n - s.length) + s; }

function printResults(r, source) {
  console.log("AAJ — Pricing & Packaging model");
  console.log("Source: " + source);
  console.log("");
  console.log(pad("Tier", 12) + padl("Price", 8) + padl("Customers", 11) + padl("Revenue", 11) + padl("Rev %", 8) + padl("Cust %", 8) + padl("Step", 7));
  console.log("-".repeat(12) + "  " + "-".repeat(6) + "  " + "-".repeat(9) + "  " + "-".repeat(9) + "  " + "-".repeat(6) + "  " + "-".repeat(6) + "  " + "-".repeat(5));
  r.tiers.forEach(t => {
    console.log(
      pad(t.name.slice(0, 11), 12) +
      padl("$" + t.price.toLocaleString("en-US"), 8) +
      padl(t.customers.toLocaleString("en-US"), 11) +
      padl(money(t.revenue), 11) +
      padl(t.revenueShare + "%", 8) +
      padl(t.customerShare + "%", 8) +
      padl(t.stepMultiple ? t.stepMultiple + "x" : "—", 7)
    );
  });
  console.log("");
  console.log("Blended ARPU:   " + money(r.summary.blendedARPU) +
    (r.summary.arpuVsEntry ? "   (" + r.summary.arpuVsEntry + "x the $" + r.summary.entryPrice + " entry tier)" : ""));
  if (r.ladder.steps.length) {
    console.log("Price ladder:   " + r.tiers.map(t => "$" + t.price.toLocaleString("en-US")).join("  →  "));
  }
  if (r.ladder.anchorMultiple !== null) {
    const weak = r.ladder.anchorMultiple < 1.5;
    console.log("Anchor check:   " + (weak
      ? "WEAK — top tier is only " + r.ladder.anchorMultiple + "x the tier below (a real anchor needs a bigger jump)"
      : "OK — top tier anchors at " + r.ladder.anchorMultiple + "x the tier below"));
  }
  console.log("");
  console.log("Read-out:");
  r.insights.forEach(i => console.log("  • " + i));
  console.log("");
  console.log("Note: customer counts drive the mix. For a pre-revenue design, enter an");
  console.log("estimated mix (counts per 100) and treat the modeled revenue as an assumption.");
}

function main() {
  const args = parseArgs(process.argv);
  let cfg = DEMO;
  let source = "built-in demo data";
  if (args.input) {
    const fs = require("fs");
    cfg = JSON.parse(fs.readFileSync(args.input, "utf8"));
    source = args.input;
  }
  printResults(analyzePricing(cfg.tiers || []), source);
}

if (require.main === module) main();

module.exports = { analyzePricing };
