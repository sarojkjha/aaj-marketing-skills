#!/usr/bin/env node
/**
 * price-packaging.js — AAJ · pricing-and-packaging
 *
 * Sanity-checks a tiered pricing structure. Each tier has a price and an
 * estimated share of customers (mixPct). The model returns:
 *   blended ARPU    = Σ price × (mixPct / 100)
 *   revenue mix     = each tier's price × mixPct as a share of the total
 *   price ladder    = each tier's price relative to the cheapest paid tier
 *   sanity flags    = does mix sum to 100? does the top tier anchor (highest price)?
 *
 * Usage:
 *   node price-packaging.js                 # built-in demo
 *   node price-packaging.js --input=tiers.json
 *
 * Input JSON shape:
 *   { "tiers": [ { "name": "Starter", "price": 29, "mixPct": 60 }, ... ] }
 *
 * Deterministic. No external dependencies. mixPct is an estimate — treat the
 * ARPU and revenue mix as a model to pressure-test, not a forecast.
 */

"use strict";

const DEMO = {
  tiers: [
    { name: "Starter",  price: 29,  mixPct: 60 },
    { name: "Pro",      price: 99,  mixPct: 30 },
    { name: "Business", price: 299, mixPct: 10 },
  ],
};

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function money(n) {
  return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US");
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

  const tiers = cfg.tiers || [];
  const paid = tiers.filter((t) => t.price > 0);
  const minPaid = paid.length ? Math.min(...paid.map((t) => t.price)) : 0;

  const mixSum = tiers.reduce((s, t) => s + (t.mixPct || 0), 0);
  const blendedArpu = tiers.reduce((s, t) => s + t.price * ((t.mixPct || 0) / 100), 0);
  const totalWeight = tiers.reduce((s, t) => s + t.price * (t.mixPct || 0), 0);
  const maxPrice = Math.max(...tiers.map((t) => t.price));
  const topTier = tiers.find((t) => t.price === maxPrice);

  console.log("AAJ — Pricing & Packaging model");
  console.log("Source: " + source);
  console.log("");
  console.log("Tier        Price     Mix     Rev share   Ladder");
  console.log("----------  --------  ------  ----------  ------");
  tiers.forEach((t) => {
    const name = t.name.padEnd(10).slice(0, 10);
    const price = money(t.price).padStart(8);
    const mix = ((t.mixPct || 0) + "%").padStart(6);
    const share = totalWeight > 0 ? Math.round((t.price * (t.mixPct || 0)) / totalWeight * 100) : 0;
    const shareStr = (share + "%").padStart(10);
    const ladder = minPaid > 0 && t.price > 0 ? (t.price / minPaid).toFixed(1) + "x" : "—";
    console.log(`${name}  ${price}  ${mix}  ${shareStr}  ${ladder.padStart(6)}`);
  });
  console.log("");
  console.log("Blended ARPU:   " + money(blendedArpu));
  console.log("Price ladder:   " + paid.map((t) => (t.price / minPaid).toFixed(1) + "x").join("  ·  ") + "  (relative to cheapest paid tier)");
  console.log("");
  console.log("Sanity checks:");
  console.log("  Mix sums to 100%:  " + (mixSum === 100 ? "yes" : `NO — sums to ${mixSum}% (estimates won't be exact; revisit)`));
  console.log("  Top tier anchors:  " + (topTier ? `yes — ${topTier.name} at ${money(maxPrice)} is the highest price` : "n/a"));
  console.log("");
  console.log("Read it: the top tier should anchor (make the middle look reasonable), and most");
  console.log("revenue usually comes from the middle/top, not the entry tier. If the entry tier");
  console.log("dominates revenue, the packaging may be leaving money on the table.");
}

main();
