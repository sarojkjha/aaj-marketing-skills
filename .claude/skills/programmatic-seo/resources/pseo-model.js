#!/usr/bin/env node
/**
 * AAJ — pseo-model
 * Projects whether a programmatic SEO build is worth doing, using an
 * indexation/ranking funnel rather than the usual pages x volume fantasy.
 * No dependencies. Node 14+.
 *
 *   node resources/pseo-model.js                          # demo
 *   node resources/pseo-model.js --pages 500 --volume 40 --conv 2 --value 400
 *   node resources/pseo-model.js --help
 */

// Approximate organic CTR by position. Published studies vary widely by
// vertical and SERP layout — treat as directional and override with your
// own Search Console data when you have it (--ctr).
const CTR = { 1: 0.27, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.045, 7: 0.035, 8: 0.03, 9: 0.025, 10: 0.022 };

const DEFAULTS = {
  pages: 500,          // pages the template would generate
  volume: 40,          // avg monthly searches per page's target query
  indexRate: 0.60,     // share of pages Google actually indexes
  rankRate: 0.30,      // share of indexed pages that reach page 1
  position: 7,         // avg position for pages that do rank
  ctr: null,           // override CTR directly (0-1)
  aiDrag: 0.85,        // click retention where AI Overviews appear (1 = no effect)
  conv: 2.0,           // visitor -> conversion, %
  value: 200,          // value per conversion, $
  costPerPage: 8,      // marginal cost per page (content, data, QA), $
  fixedCost: 5000,     // template build + data acquisition, $
  uniqueData: "some"   // none | some | strong
};

const num = v => (typeof v === "number" ? v : parseFloat(v));

function ctrFor(o) {
  if (o.ctr !== null && !Number.isNaN(num(o.ctr))) return num(o.ctr);
  const p = Math.max(1, Math.min(10, Math.round(o.position)));
  return CTR[p];
}

function model(o) {
  const pages = num(o.pages);
  const indexed = pages * num(o.indexRate);
  const ranking = indexed * num(o.rankRate);
  const ctr = ctrFor(o);
  const sessions = ranking * num(o.volume) * ctr * num(o.aiDrag);
  const conversions = sessions * (num(o.conv) / 100);
  const monthlyValue = conversions * num(o.value);

  const investment = num(o.fixedCost) + pages * num(o.costPerPage);
  const paybackMonths = monthlyValue > 0 ? investment / monthlyValue : Infinity;
  const year1 = monthlyValue * 12 - investment;

  // Effective yield: share of built pages that produce any traffic at all.
  const yieldRate = pages > 0 ? ranking / pages : 0;
  const valuePerPage = pages > 0 ? (monthlyValue * 12) / pages : 0;
  const costPerRankingPage = ranking > 0 ? investment / ranking : Infinity;

  return {
    pages, indexed, ranking, ctr, yieldRate,
    sessions, conversions, monthlyValue,
    investment, paybackMonths, year1,
    valuePerPage, costPerRankingPage
  };
}

function risks(o, r) {
  const out = [];
  const vol = num(o.volume);

  if (vol < 10) {
    out.push(["HIGH", `Average query volume is ${vol}/month. Below ~10 there usually isn't enough demand to justify a page, even if it ranks.`]);
  } else if (vol < 25) {
    out.push(["MEDIUM", `Average query volume is ${vol}/month — thin. Confirm the volume data is real and not a rounded-up estimate.`]);
  }

  if (o.uniqueData === "none") {
    out.push(["HIGH", "No unique data per page. Pages assembled only from a template and public facts are what Google's scaled-content-abuse policy targets. This is the single biggest failure mode."]);
  } else if (o.uniqueData === "some") {
    out.push(["MEDIUM", "Only partial unique data per page. Each page needs something a competitor can't regenerate — proprietary numbers, real reviews, computed results."]);
  }

  if (r.pages > 5000 && o.uniqueData !== "strong") {
    out.push(["HIGH", `${fmtInt(r.pages)} pages without strong per-page data is the classic doorway-page pattern. Ship 50, measure, then scale.`]);
  }

  if (r.paybackMonths > 18) {
    out.push(["MEDIUM", `Payback of ${r.paybackMonths === Infinity ? "never" : Math.round(r.paybackMonths) + " months"} is long for a channel that can be reset by a single core update.`]);
  }

  if (num(o.indexRate) > 0.8) {
    out.push(["MEDIUM", `Assuming ${Math.round(num(o.indexRate) * 100)}% indexation is optimistic for programmatic pages. Large template-generated sets are routinely indexed at well under half.`]);
  }

  if (r.ranking < 20) {
    out.push(["MEDIUM", `Only ~${Math.round(r.ranking)} pages are projected to rank. Below about 20, this isn't a programme — it's a handful of pages you could write by hand, better.`]);
  }

  return out;
}

function verdict(r, rk) {
  const high = rk.filter(x => x[0] === "HIGH").length;
  if (high >= 2) return ["DON'T BUILD", "Multiple high risks. The economics or the content model don't hold."];
  if (high === 1) return ["FIX FIRST", "One high risk must be resolved before building."];
  if (r.paybackMonths === Infinity) return ["DON'T BUILD", "No projected value — nothing pays this back."];
  if (r.paybackMonths <= 6) return ["BUILD", `Payback in ${Math.round(r.paybackMonths)} months. Strong case — pilot 50 pages first.`];
  if (r.paybackMonths <= 12) return ["BUILD (pilot)", `Payback in ${Math.round(r.paybackMonths)} months. Reasonable — validate with 50 pages before full build.`];
  if (r.paybackMonths <= 24) return ["MARGINAL", `Payback in ${Math.round(r.paybackMonths)} months. Only worth it if the pages have value beyond search.`];
  return ["DON'T BUILD", `Payback in ${Math.round(r.paybackMonths)} months. The maths doesn't work.`];
}

const fmtInt = n => Math.round(n).toLocaleString("en-US");
const fmtMoney = n => "$" + Math.round(n).toLocaleString("en-US");

function report(o, r) {
  const rk = risks(o, r);
  const [v, vnote] = verdict(r, rk);
  const L = [];
  L.push("");
  L.push("AAJ · PROGRAMMATIC SEO VIABILITY");
  L.push("─".repeat(62));
  L.push(`  ${v} — ${vnote}`);
  L.push("");
  L.push("THE FUNNEL  (this is where most projections go wrong)");
  L.push(`  Pages built                 ${fmtInt(r.pages)}`);
  L.push(`  Indexed          × ${(num(o.indexRate) * 100).toFixed(0)}%      ${fmtInt(r.indexed)}`);
  L.push(`  Reaching page 1  × ${(num(o.rankRate) * 100).toFixed(0)}%      ${fmtInt(r.ranking)}`);
  L.push(`  Effective yield             ${(r.yieldRate * 100).toFixed(1)}% of pages built`);
  L.push("");
  L.push("PROJECTION  (monthly, at maturity)");
  L.push(`  Sessions                    ${fmtInt(r.sessions)}`);
  L.push(`  Conversions                 ${fmtInt(r.conversions)}`);
  L.push(`  Value                       ${fmtMoney(r.monthlyValue)}`);
  L.push("");
  L.push("ECONOMICS");
  L.push(`  Investment                  ${fmtMoney(r.investment)}   (${fmtMoney(num(o.fixedCost))} build + ${fmtInt(r.pages)} × ${fmtMoney(num(o.costPerPage))})`);
  L.push(`  Payback                     ${r.paybackMonths === Infinity ? "never" : Math.round(r.paybackMonths) + " months"}`);
  L.push(`  Year 1 net                  ${fmtMoney(r.year1)}`);
  L.push(`  Annual value per page       ${fmtMoney(r.valuePerPage)}`);
  L.push(`  Cost per ranking page       ${r.costPerRankingPage === Infinity ? "n/a" : fmtMoney(r.costPerRankingPage)}`);
  L.push("");
  if (rk.length) {
    L.push("RISKS");
    rk.forEach(([lvl, msg]) => L.push(`  [${lvl}] ${msg}`));
    L.push("");
  }
  L.push("─".repeat(62));
  L.push("ASSUMPTIONS — change these before trusting the output");
  L.push(`  Indexation ${(num(o.indexRate) * 100).toFixed(0)}% · page-1 rate ${(num(o.rankRate) * 100).toFixed(0)}% · avg position ${o.position} (CTR ${(r.ctr * 100).toFixed(1)}%)`);
  L.push(`  AI-Overview click retention ${(num(o.aiDrag) * 100).toFixed(0)}% · conversion ${o.conv}% · value ${fmtMoney(num(o.value))}`);
  L.push("  CTR curve is approximate and varies by vertical. Use your own Search");
  L.push("  Console data via --ctr as soon as you have it.");
  L.push("");
  L.push("JSON");
  L.push(JSON.stringify({
    verdict: v,
    funnel: { pages: r.pages, indexed: Math.round(r.indexed), ranking: Math.round(r.ranking), yieldRate: +(r.yieldRate * 100).toFixed(1) },
    monthly: { sessions: Math.round(r.sessions), conversions: Math.round(r.conversions), value: Math.round(r.monthlyValue) },
    economics: { investment: Math.round(r.investment), paybackMonths: r.paybackMonths === Infinity ? null : +r.paybackMonths.toFixed(1), year1Net: Math.round(r.year1), annualValuePerPage: +r.valuePerPage.toFixed(2) },
    risks: rk.map(([level, note]) => ({ level, note }))
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ pseo-model — is this programmatic SEO build worth doing?

Usage
  node resources/pseo-model.js                    Demo with defaults
  node resources/pseo-model.js [options]
  node resources/pseo-model.js --json [options]   JSON only

Options            Default   Meaning
  --pages          500       Pages the template would generate
  --volume         40        Avg monthly searches per target query
  --index-rate     0.60      Share of pages Google actually indexes
  --rank-rate      0.30      Share of indexed pages reaching page 1
  --position       7         Avg position for pages that rank
  --ctr            (auto)    Override CTR directly, e.g. 0.04
  --ai-drag        0.85      Click retention where AI Overviews appear
  --conv           2.0       Visitor to conversion, %
  --value          200       Value per conversion, $
  --cost-per-page  8         Marginal cost per page, $
  --fixed-cost     5000      Template build + data acquisition, $
  --unique-data    some      none | some | strong

Why the funnel matters
  Most pSEO projections multiply pages by search volume and produce a
  fantasy. In practice a large share of template-generated pages are never
  indexed, and most of those that are never reach page 1. Defaults here
  imply ~18% of built pages produce any traffic. Adjust with your own data.

The model cannot tell you whether your pages deserve to rank. That is what
--unique-data is asking about, and it is the factor that decides most
programmatic builds.
`;

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  const map = {
    "--pages": "pages", "--volume": "volume", "--index-rate": "indexRate",
    "--rank-rate": "rankRate", "--position": "position", "--ctr": "ctr",
    "--ai-drag": "aiDrag", "--conv": "conv", "--value": "value",
    "--cost-per-page": "costPerPage", "--fixed-cost": "fixedCost",
    "--unique-data": "uniqueData"
  };
  for (let i = 0; i < argv.length; i++) {
    const k = map[argv[i]];
    if (k && argv[i + 1] !== undefined) {
      o[k] = k === "uniqueData" ? String(argv[i + 1]) : num(argv[i + 1]);
      i++;
    }
  }
  return o;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const o = parseArgs(argv);

  // Validate — a silent NaN produces a confident wrong answer.
  const bad = [];
  ["pages", "volume", "indexRate", "rankRate", "position", "aiDrag", "conv", "value", "costPerPage", "fixedCost"]
    .forEach(k => { if (Number.isNaN(num(o[k]))) bad.push(k); });
  if (!["none", "some", "strong"].includes(o.uniqueData)) bad.push("uniqueData (none|some|strong)");
  if (bad.length) { console.error(`Invalid values for: ${bad.join(", ")}\nRun --help for usage.`); process.exit(1); }
  if (num(o.indexRate) > 1 || num(o.rankRate) > 1 || num(o.aiDrag) > 1) {
    console.error("index-rate, rank-rate and ai-drag are fractions between 0 and 1 (e.g. 0.6, not 60).");
    process.exit(1);
  }

  const r = model(o);

  if (argv.includes("--json")) {
    const rk = risks(o, r);
    const [v] = verdict(r, rk);
    console.log(JSON.stringify({
      verdict: v,
      funnel: { pages: r.pages, indexed: Math.round(r.indexed), ranking: Math.round(r.ranking), yieldRate: +(r.yieldRate * 100).toFixed(1) },
      monthly: { sessions: Math.round(r.sessions), conversions: Math.round(r.conversions), value: Math.round(r.monthlyValue) },
      economics: { investment: Math.round(r.investment), paybackMonths: r.paybackMonths === Infinity ? null : +r.paybackMonths.toFixed(1), year1Net: Math.round(r.year1) },
      risks: rk.map(([level, note]) => ({ level, note }))
    }, null, 2));
    return;
  }

  if (argv.length === 0) console.log("\n(demo — pass options or --help to model your own)");
  console.log(report(o, r));
}

if (require.main === module) main();
module.exports = { model, risks, verdict, DEFAULTS };
