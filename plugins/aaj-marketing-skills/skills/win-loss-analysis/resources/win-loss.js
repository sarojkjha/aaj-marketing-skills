/**
 * win-loss.js — AAJ win-loss analysis engine (quantitative layer)
 *
 * Analyzes a set of CLOSED deals and surfaces where you win, where you lose,
 * which loss reasons cost the most, your competitive head-to-head records, and
 * the single biggest fixable leak.
 *
 * Scope note: this engine computes the QUANTITATIVE layer only (rates, revenue
 * concentration, competitive records). The qualitative "why" behind losses —
 * interview themes, narrative patterns — is the job of the win-loss skill and
 * playbook, not a calculator. The tool computes what is computable and does not
 * pretend to do judgment.
 *
 * Deal shape:
 *   { name, outcome: "won" | "lost", amount: Number, segment: String,
 *     lossReason?: String,   // lost deals only
 *     competitor?: String,   // optional, won or lost
 *     winReason?: String,    // won deals only: why they chose you
 *     lostAtStage?: String } // lost deals only: the stage the deal died in
 *
 * Command line:
 *   node win-loss.js                         # demo, labelled as a demo
 *   node win-loss.js --help
 *   node win-loss.js '{"deals":[{...}, ...]}'  # your closed deals
 *     Prints the report. Unknown fields, an outcome that is not "won" or "lost", or an
 *     amount that is not a number stop the run with an error that names the deal.
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


function round1(n) { return Math.round(n * 10) / 10; }
function pct(part, whole) { return whole > 0 ? round1((part / whole) * 100) : 0; }
function sum(arr, f) { return arr.reduce((t, x) => t + f(x), 0); }

function analyzeWinLoss(deals) {
  const clean = (deals || []).map(d => ({
    name: d.name || "(unnamed)",
    outcome: (d.outcome === "won") ? "won" : "lost",
    amount: Number(d.amount) || 0,
    segment: (d.segment && String(d.segment).trim()) || "Unspecified",
    lossReason: (d.lossReason && String(d.lossReason).trim()) || null,
    competitor: (d.competitor && String(d.competitor).trim()) || null,
    winReason: (d.winReason && String(d.winReason).trim()) || null,
    lostAtStage: (d.lostAtStage && String(d.lostAtStage).trim()) || null
  }));

  const won = clean.filter(d => d.outcome === "won");
  const lost = clean.filter(d => d.outcome === "lost");
  const total = clean.length;

  const wonRevenue = sum(won, d => d.amount);
  const lostRevenue = sum(lost, d => d.amount);
  const totalRevenue = wonRevenue + lostRevenue;

  const summary = {
    totalDeals: total,
    won: won.length,
    lost: lost.length,
    winRateCount: pct(won.length, total),
    winRateRevenue: pct(wonRevenue, totalRevenue),
    wonRevenue, lostRevenue, totalRevenue
  };

  // --- by segment ---
  const segMap = {};
  clean.forEach(d => {
    const s = (segMap[d.segment] ||= { segment: d.segment, won: 0, lost: 0, wonRevenue: 0, lostRevenue: 0 });
    if (d.outcome === "won") { s.won++; s.wonRevenue += d.amount; }
    else { s.lost++; s.lostRevenue += d.amount; }
  });
  const bySegment = Object.values(segMap).map(s => {
    const tot = s.won + s.lost;
    const totRev = s.wonRevenue + s.lostRevenue;
    return {
      ...s, total: tot, totalRevenue: totRev,
      winRateCount: pct(s.won, tot),
      winRateRevenue: pct(s.wonRevenue, totRev)
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // --- loss reasons (Pareto by lost revenue) ---
  const reasonMap = {};
  lost.forEach(d => {
    const r = d.lossReason || "Unspecified";
    const e = (reasonMap[r] ||= { reason: r, count: 0, lostRevenue: 0 });
    e.count++; e.lostRevenue += d.amount;
  });
  const sortedReasons = Object.values(reasonMap).sort((a, b) => b.lostRevenue - a.lostRevenue);
  let cum = 0;
  const lossReasons = sortedReasons.map(e => {
    cum += e.lostRevenue;
    return {
      ...e,
      pctOfLostRevenue: pct(e.lostRevenue, lostRevenue),
      cumulativePct: pct(cum, lostRevenue)
    };
  });
  const topReasonByRevenue = lossReasons[0] ? lossReasons[0].reason : null;
  const topReasonByCount = [...sortedReasons].sort((a, b) => b.count - a.count)[0]?.reason || null;

  // --- competitive head-to-head (deals with a named competitor) ---
  const compMap = {};
  clean.filter(d => d.competitor).forEach(d => {
    const c = (compMap[d.competitor] ||= { competitor: d.competitor, won: 0, lost: 0, wonRevenue: 0, lostRevenue: 0 });
    if (d.outcome === "won") { c.won++; c.wonRevenue += d.amount; }
    else { c.lost++; c.lostRevenue += d.amount; }
  });
  const competitors = Object.values(compMap).map(c => ({
    ...c, total: c.won + c.lost, winRate: pct(c.won, c.won + c.lost)
  })).sort((a, b) => (b.total - a.total) || (b.lostRevenue - a.lostRevenue));

  // --- biggest fixable leak: segment × reason cell with the most lost revenue ---
  const cellMap = {};
  lost.forEach(d => {
    const key = d.segment + " ||| " + (d.lossReason || "Unspecified");
    const e = (cellMap[key] ||= { segment: d.segment, reason: d.lossReason || "Unspecified", lostRevenue: 0, count: 0 });
    e.lostRevenue += d.amount; e.count++;
  });
  // "No decision" and a missing reason say nothing about what to fix, so they can't be the
  // "fixable" leak; they are reported separately below.
  const NOT_A_REASON = new Set(["no decision", "unspecified", "unknown", "other"]);
  const cells = Object.values(cellMap).sort((a, b) => b.lostRevenue - a.lostRevenue);
  const biggestLeak = cells.find(c => !NOT_A_REASON.has(c.reason.toLowerCase())) || null;
  const noReasonRevenue = sum(lost.filter(d => NOT_A_REASON.has((d.lossReason || "Unspecified").toLowerCase())), d => d.amount);

  // --- why you win, and where deals die (optional fields) ---
  const tally = (list, key) => {
    const m = {};
    list.forEach(d => { if (d[key]) { const e = (m[d[key]] ||= { label: d[key], count: 0, revenue: 0 }); e.count++; e.revenue += d.amount; } });
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  };
  const winReasons = tally(won, "winReason");
  const lostAtStage = tally(lost, "lostAtStage");

  // Thin sample: this engine's rule of thumb, not a published threshold.
  const thinSample = total < 20 || lost.length < 8;

  // --- plain-language insights ---
  const insights = [];
  if (topReasonByRevenue) {
    const r = lossReasons[0];
    insights.push(`Your biggest loss reason by revenue is "${r.reason}" — ${money(r.lostRevenue)} (${r.pctOfLostRevenue}% of all lost revenue across ${r.count} deal${r.count !== 1 ? "s" : ""}).`);
  }
  if (topReasonByCount && topReasonByCount !== topReasonByRevenue) {
    insights.push(`By count, your most frequent loss reason is "${topReasonByCount}" — which means small deals are lost for a different reason than your big ones. Treat the revenue view as the priority.`);
  }
  const worstComp = competitors.filter(c => c.lost > 0).sort((a, b) => a.winRate - b.winRate || b.lostRevenue - a.lostRevenue)[0];
  if (worstComp && worstComp.winRate < 50) {
    insights.push(`You're losing to ${worstComp.competitor}: ${worstComp.won}-${worstComp.lost} head-to-head (${worstComp.winRate}% win rate), ${money(worstComp.lostRevenue)} lost. That's a competitive-positioning gap worth closing.`);
  }
  if (biggestLeak) {
    insights.push(`Single biggest fixable leak: ${biggestLeak.segment} deals lost to "${biggestLeak.reason}" — ${money(biggestLeak.lostRevenue)}. Start here.`);
  }
  if (noReasonRevenue > 0 && lostRevenue > 0) {
    insights.push(`${pct(noReasonRevenue, lostRevenue)}% of lost revenue (${money(noReasonRevenue)}) has no usable reason ("No decision" or blank). That is a qualification or urgency question, not a fix list; interview these buyers before acting on the reasons above.`);
  }
  if (lostAtStage[0]) {
    insights.push(`Most lost revenue dies at "${lostAtStage[0].label}" (${money(lostAtStage[0].revenue)} across ${lostAtStage[0].count} deal${lostAtStage[0].count !== 1 ? "s" : ""}).`);
  }
  if (winReasons[0]) {
    insights.push(`Your most valuable stated win reason is "${winReasons[0].label}" (${money(winReasons[0].revenue)} across ${winReasons[0].count} win${winReasons[0].count !== 1 ? "s" : ""}). Say it in your positioning if the buyers' own words match.`);
  }
  if (thinSample) {
    insights.push(`Thin sample: ${total} closed deals (${lost.length} lost). One deal moves every rate here; treat these as questions to check with interviews, not findings. (Rule of thumb in this engine: under 20 closed deals or under 8 losses.)`);
  }

  return { summary, bySegment, lossReasons, topReasonByCount, topReasonByRevenue, competitors, biggestLeak, winReasons, lostAtStage, thinSample, insights };
}

function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

/* ------------------------- validation ------------------------- */
const DEAL_FIELDS = ["name", "outcome", "amount", "segment", "lossReason", "competitor", "winReason", "lostAtStage"];
function validateDeals(input) {
  const errs = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ['The input must be a JSON object: {"deals": [...]}.'];
  const extra = Object.keys(input).filter(k => k !== "deals");
  if (extra.length) errs.push("Unrecognised field" + (extra.length > 1 ? "s" : "") + ": " + extra.map(k => '"' + k + '"').join(", ") + '. Expected: "deals".');
  if (!Array.isArray(input.deals) || !input.deals.length) { errs.push('"deals" is required: a list of closed deals {name, outcome, amount, segment, ...}.'); return errs; }
  input.deals.forEach((d, i) => {
    const label = d && typeof d.name === "string" && d.name ? '"' + d.name + '"' : "deal " + (i + 1);
    if (!d || typeof d !== "object" || Array.isArray(d)) { errs.push(label + " must be an object."); return; }
    const bad = Object.keys(d).filter(k => !DEAL_FIELDS.includes(k));
    if (bad.length) errs.push(label + ": unrecognised field " + bad.map(k => '"' + k + '"').join(", ") + ". Expected: " + DEAL_FIELDS.join(", ") + ".");
    if (d.outcome !== "won" && d.outcome !== "lost") errs.push(label + ': "outcome" must be "won" or "lost" (got ' + JSON.stringify(d.outcome) + ").");
    if (typeof d.amount !== "number" || !Number.isFinite(d.amount) || d.amount < 0) errs.push(label + ': "amount" must be a number, 0 or more.');
    if (d.outcome === "won" && d.lossReason) errs.push(label + ': a won deal has a "lossReason"; fix the outcome or remove it.');
    if (d.outcome === "lost" && d.winReason) errs.push(label + ': a lost deal has a "winReason"; fix the outcome or remove it.');
  });
  return errs;
}

function printReport(r) {
  const P = (...a) => console.log(...a);
  P("=== SUMMARY ===");
  P(`deals ${r.summary.totalDeals} | won ${r.summary.won} | lost ${r.summary.lost}`);
  P(`win rate (count)   ${r.summary.winRateCount}%`);
  P(`win rate (revenue) ${r.summary.winRateRevenue}%`);
  P(`won ${money(r.summary.wonRevenue)} | lost ${money(r.summary.lostRevenue)} | total ${money(r.summary.totalRevenue)}`);

  P("\n=== BY SEGMENT (count WR / revenue WR) ===");
  r.bySegment.forEach(s => P(`${s.segment.padEnd(12)} ${s.won}-${s.lost}  ${String(s.winRateCount + "%").padStart(5)} / ${String(s.winRateRevenue + "%").padStart(5)}   (rev at stake ${money(s.totalRevenue)})`));

  P("\n=== LOSS REASONS (Pareto by lost revenue) ===");
  r.lossReasons.forEach(x => P(`${x.reason.padEnd(20)} ${money(x.lostRevenue).padStart(9)}  ${String(x.pctOfLostRevenue + "%").padStart(6)}  cum ${x.cumulativePct}%  (n=${x.count})`));
  P(`top by revenue: ${r.topReasonByRevenue} | top by count: ${r.topReasonByCount}`);

  if (r.winReasons.length) {
    P("\n=== WIN REASONS (by won revenue) ===");
    r.winReasons.forEach(x => P(`${x.label.padEnd(20)} ${money(x.revenue).padStart(9)}  (n=${x.count})`));
  }
  if (r.lostAtStage.length) {
    P("\n=== WHERE LOST DEALS DIED (by lost revenue) ===");
    r.lostAtStage.forEach(x => P(`${x.label.padEnd(20)} ${money(x.revenue).padStart(9)}  (n=${x.count})`));
  }

  P("\n=== COMPETITIVE HEAD-TO-HEAD ===");
  r.competitors.forEach(c => P(`${c.competitor.padEnd(14)} ${c.won}-${c.lost}  ${c.winRate}% win   (lost ${money(c.lostRevenue)})`));

  P("\n=== BIGGEST FIXABLE LEAK ===");
  P(r.biggestLeak ? `${r.biggestLeak.segment} × "${r.biggestLeak.reason}" — ${money(r.biggestLeak.lostRevenue)}` : "None: no lost deal has a usable reason.");

  P("\n=== INSIGHTS ===");
  r.insights.forEach(i => P("• " + i));
}

/* ----------------------------- demo ----------------------------- */
if (require.main === module && process.argv[2] === "--help") {
  console.log(require("fs").readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*+/, ""));
  process.exit(0);
}
if (require.main === module && process.argv.length > 2 && process.argv[2] !== "--demo") {
  let input;
  try { input = JSON.parse(process.argv[2]); } catch (e) { console.error("Invalid JSON: " + e.message + "\nRun --help for the input shape."); process.exit(1); }
  const problems = validateDeals(input);
  if (problems.length) { console.error(problems.join("\n") + "\nRun --help for the input shape."); process.exit(1); }
  console.log("AAJ — Win/Loss analysis\nSource: your input\n");
  printReport(analyzeWinLoss(input.deals));
  process.exit(0);
}
if (require.main === module) {
  console.log("(no input, so this is the built-in demo. Run --help to see how to pass your own deals.)\n");
  const demo = [
    { name: "Acme",        outcome: "won",  amount: 10000,  segment: "SMB" },
    { name: "Bravo",       outcome: "won",  amount: 12000,  segment: "SMB" },
    { name: "Cosmo",       outcome: "won",  amount: 40000,  segment: "Mid-Market", competitor: "Competitor A" },
    { name: "Delta",       outcome: "won",  amount: 50000,  segment: "Mid-Market" },
    { name: "Echo",        outcome: "won",  amount: 120000, segment: "Enterprise", competitor: "Competitor A" },
    { name: "Foxtrot",     outcome: "won",  amount: 150000, segment: "Enterprise" },
    { name: "Golf",        outcome: "lost", amount: 8000,   segment: "SMB",        lossReason: "Price" },
    { name: "Hotel",       outcome: "lost", amount: 9000,   segment: "SMB",        lossReason: "Price" },
    { name: "India",       outcome: "lost", amount: 11000,  segment: "SMB",        lossReason: "No decision" },
    { name: "Juliet",      outcome: "lost", amount: 45000,  segment: "Mid-Market", lossReason: "Missing feature", competitor: "Competitor A" },
    { name: "Kilo",        outcome: "lost", amount: 55000,  segment: "Mid-Market", lossReason: "Price",           competitor: "Competitor B" },
    { name: "Lima",        outcome: "lost", amount: 200000, segment: "Enterprise", lossReason: "Lost to competitor", competitor: "Competitor B" },
    { name: "Mike",        outcome: "lost", amount: 180000, segment: "Enterprise", lossReason: "Missing feature", competitor: "Competitor B" },
    { name: "November",    outcome: "lost", amount: 100000, segment: "Enterprise", lossReason: "No decision" }
  ];

  printReport(analyzeWinLoss(demo));
}

module.exports = { analyzeWinLoss };
