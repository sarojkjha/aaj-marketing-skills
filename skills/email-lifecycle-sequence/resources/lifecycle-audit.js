#!/usr/bin/env node
/**
 * AAJ — lifecycle-audit
 * Maps which lifecycle email sequences exist, checks send load for fatigue,
 * and computes what each missing sequence must produce to pay for itself.
 * No dependencies. Node 14+.
 *
 *   node resources/lifecycle-audit.js                                  # demo
 *   node resources/lifecycle-audit.js --have welcome,onboarding --signups 500 --value 400
 *   node resources/lifecycle-audit.js --help
 */

// Default shape of each sequence. Email counts and day windows are typical
// starting points, not prescriptions — override with --emails if yours differ.
const STAGES = [
  { id: "welcome",    name: "Welcome",              emails: 3, from: 0,  to: 7,
    job: "Confirm the decision, set expectations, drive first meaningful action",
    base: "new signups",
    missCost: "Highest-intent moment of the whole relationship, unused." },
  { id: "onboarding", name: "Onboarding / activation", emails: 5, from: 1, to: 21,
    job: "Get the user to first value, then to habit",
    base: "new signups",
    missCost: "Signups that never activate churn silently and are rarely recoverable." },
  { id: "engagement", name: "Engagement / nurture",  emails: 4, from: 22, to: 52,
    job: "Stay useful between purchases; deepen usage",
    base: "active users",
    missCost: "The list goes cold, so every later send underperforms." },
  { id: "expansion",  name: "Expansion / upgrade",   emails: 3, from: 30, to: 90,
    job: "Move users to higher value when usage justifies it",
    base: "active users at a threshold",
    missCost: "NRR depends on expansion. Without it, growth needs new logos." },
  { id: "winback",    name: "Win-back",              emails: 3, from: 30, to: 60,
    job: "Recover lapsed users before the account is gone",
    base: "lapsed / inactive users",
    missCost: "Recovering a lapsed user is usually far cheaper than acquiring one." },
  { id: "sunset",     name: "Sunset / re-permission", emails: 2, from: 90, to: 120,
    job: "Cleanly exit the disengaged so deliverability holds",
    base: "long-inactive users",
    missCost: "Sending to dead addresses degrades deliverability for everyone else." }
];

const DEFAULTS = {
  have: [],
  signups: 500,      // new users per month
  value: 400,        // value of one conversion, $
  buildHours: 10,    // hours to build one sequence (copy, design, QA, automation)
  rate: 120,         // $ per hour
  payback: 6,        // target payback, months
  emails: null       // override: comma list matching STAGES order
};

const num = v => (typeof v === "number" ? v : parseFloat(v));

function analyse(o) {
  const have = new Set(o.have);
  const emailOverride = o.emails ? String(o.emails).split(",").map(n => parseInt(n, 10)) : null;

  const stages = STAGES.map((s, i) => ({
    ...s,
    emails: emailOverride && !Number.isNaN(emailOverride[i]) ? emailOverride[i] : s.emails,
    present: have.has(s.id)
  }));

  const covered = stages.filter(s => s.present);
  const missing = stages.filter(s => !s.present);

  // Fatigue — how many emails a brand-new user receives in their first 14
  // and 30 days, counting every sequence that overlaps that window.
  const sendsInWindow = (limit) => stages
    .filter(s => s.present && s.from <= limit)
    .reduce((total, s) => {
      const span = Math.max(1, s.to - s.from);
      const overlap = Math.max(0, Math.min(s.to, limit) - s.from);
      return total + s.emails * (overlap / span);
    }, 0);

  const day14 = sendsInWindow(14);
  const day30 = sendsInWindow(30);

  // Breakeven — no fabricated lift benchmarks. Given build cost and the value
  // of a conversion, how many extra conversions per month does a sequence need
  // to pay back in the target window?
  const buildCost = num(o.buildHours) * num(o.rate);
  const convNeeded = buildCost / (num(o.payback) * num(o.value));
  const asShareOfSignups = num(o.signups) > 0 ? (convNeeded / num(o.signups)) * 100 : Infinity;

  return {
    stages, covered, missing,
    coveragePct: (covered.length / stages.length) * 100,
    day14, day30,
    buildCost, convNeeded, asShareOfSignups
  };
}

function fatigueVerdict(day14, day30) {
  if (day14 > 10) return ["HIGH", `${day14.toFixed(1)} emails in the first 14 days. Well past the point where unsubscribes and spam complaints rise faster than engagement.`];
  if (day14 > 7)  return ["WATCH", `${day14.toFixed(1)} emails in the first 14 days. Overlapping sequences are stacking — check the combined calendar, not each sequence alone.`];
  if (day30 < 3 && day30 > 0) return ["LOW", `Only ${day30.toFixed(1)} emails in the first 30 days. Under-communicating during the highest-intent window.`];
  if (day30 === 0) return ["NONE", "No sequences reach a new user in their first 30 days."];
  return ["OK", `${day14.toFixed(1)} emails in the first 14 days, ${day30.toFixed(1)} in 30. Reasonable load.`];
}

function priority(missing) {
  // Order reflects where the money usually is: activation first, then the
  // moment of highest intent, then revenue, then recovery, then hygiene.
  const order = ["onboarding", "welcome", "expansion", "winback", "engagement", "sunset"];
  return [...missing].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

const f1 = n => n.toFixed(1);
const money = n => "$" + Math.round(n).toLocaleString("en-US");

function report(o, r) {
  const [fLevel, fNote] = fatigueVerdict(r.day14, r.day30);
  const L = [];
  L.push("");
  L.push("AAJ · LIFECYCLE COVERAGE AUDIT");
  L.push("─".repeat(64));
  L.push(`  Coverage    ${r.covered.length}/${r.stages.length} sequences  (${f1(r.coveragePct)}%)`);
  L.push(`  Send load   ${fLevel} — ${fNote}`);
  L.push("");
  L.push("SEQUENCES");
  r.stages.forEach(s => {
    const mark = s.present ? "✓" : "—";
    L.push(`  ${mark} ${s.name.padEnd(26)} ${s.present ? `${s.emails} emails, day ${s.from}-${s.to}` : "not built"}`);
  });
  L.push("");

  if (r.missing.length) {
    L.push("─".repeat(64));
    L.push("MISSING — in build order");
    L.push("");
    priority(r.missing).forEach((s, i) => {
      L.push(`  ${i + 1}. ${s.name}`);
      L.push(`     Job:     ${s.job}`);
      L.push(`     Audience: ${s.base}`);
      L.push(`     Cost of not having it: ${s.missCost}`);
      L.push("");
    });
  }

  L.push("─".repeat(64));
  L.push("BREAKEVEN  (per sequence)");
  L.push(`  Build cost                  ${money(r.buildCost)}   (${o.buildHours}h × ${money(num(o.rate))})`);
  L.push(`  Conversions needed / month  ${f1(r.convNeeded)}   to pay back in ${o.payback} months at ${money(num(o.value))} each`);
  L.push(`  As a share of ${String(o.signups).padEnd(5)} signups  ${f1(r.asShareOfSignups)}%`);
  L.push("");
  if (r.asShareOfSignups < 1) {
    L.push("  Under 1% of monthly signups. That bar is low enough that almost any");
    L.push("  working sequence clears it — build them.");
  } else if (r.asShareOfSignups < 5) {
    L.push("  A few percent of signups. Achievable for welcome and onboarding,");
    L.push("  harder for win-back where the audience is smaller.");
  } else {
    L.push("  A high share of signups. Either volume is too low to justify the build,");
    L.push("  or conversion value is understated. Check the value input first.");
  }
  L.push("");
  L.push("  Note: win-back and sunset run against lapsed users, not signups —");
  L.push("  judge those against that (usually smaller) base.");
  L.push("");
  L.push("─".repeat(64));
  L.push("JSON");
  L.push(JSON.stringify({
    coverage: { built: r.covered.length, total: r.stages.length, pct: +r.coveragePct.toFixed(1) },
    present: r.covered.map(s => s.id),
    missing: priority(r.missing).map(s => ({ id: s.id, name: s.name, audience: s.base })),
    fatigue: { level: fLevel, day14: +r.day14.toFixed(1), day30: +r.day30.toFixed(1) },
    breakeven: {
      buildCost: Math.round(r.buildCost),
      conversionsPerMonth: +r.convNeeded.toFixed(2),
      shareOfMonthlySignupsPct: +r.asShareOfSignups.toFixed(2)
    }
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ lifecycle-audit — which lifecycle sequences you have, and what the gaps cost.

Usage
  node resources/lifecycle-audit.js                       Demo
  node resources/lifecycle-audit.js [options]
  node resources/lifecycle-audit.js --json [options]

Options          Default   Meaning
  --have         (none)    Comma list of sequences you already run:
                           welcome,onboarding,engagement,expansion,winback,sunset
  --signups      500       New users per month
  --value        400       Value of one conversion, $
  --build-hours  10        Hours to build one sequence
  --rate         120       Cost per hour, $
  --payback      6         Target payback, months
  --emails       (auto)    Override email counts, comma list in stage order

What it does NOT do
  It does not estimate how much lift a sequence will produce — published
  benchmarks vary so widely that any such number would be decoration.
  Instead it computes the breakeven: how many extra conversions a month a
  sequence must generate to pay for itself. You judge whether that is
  plausible for your audience. That is a question you can actually answer.
`;

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  const map = {
    "--have": "have", "--signups": "signups", "--value": "value",
    "--build-hours": "buildHours", "--rate": "rate", "--payback": "payback",
    "--emails": "emails"
  };
  for (let i = 0; i < argv.length; i++) {
    const k = map[argv[i]];
    if (k && argv[i + 1] !== undefined) {
      if (k === "have") o.have = String(argv[i + 1]).split(",").map(s => s.trim()).filter(Boolean);
      else if (k === "emails") o.emails = String(argv[i + 1]);
      else o[k] = num(argv[i + 1]);
      i++;
    }
  }
  return o;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const o = parseArgs(argv);

  const known = STAGES.map(s => s.id);
  const unknown = o.have.filter(h => !known.includes(h));
  if (unknown.length) {
    console.error(`Unknown sequence(s): ${unknown.join(", ")}\nValid: ${known.join(", ")}`);
    process.exit(1);
  }
  const bad = ["signups", "value", "buildHours", "rate", "payback"].filter(k => Number.isNaN(num(o[k])));
  if (bad.length) { console.error(`Invalid numeric values for: ${bad.join(", ")}`); process.exit(1); }
  if (num(o.payback) <= 0 || num(o.value) <= 0) { console.error("--payback and --value must be greater than zero."); process.exit(1); }

  const r = analyse(o);

  if (argv.includes("--json")) {
    const [lvl] = fatigueVerdict(r.day14, r.day30);
    console.log(JSON.stringify({
      coverage: { built: r.covered.length, total: r.stages.length, pct: +r.coveragePct.toFixed(1) },
      present: r.covered.map(s => s.id),
      missing: priority(r.missing).map(s => ({ id: s.id, name: s.name, audience: s.base })),
      fatigue: { level: lvl, day14: +r.day14.toFixed(1), day30: +r.day30.toFixed(1) },
      breakeven: { buildCost: Math.round(r.buildCost), conversionsPerMonth: +r.convNeeded.toFixed(2), shareOfMonthlySignupsPct: +r.asShareOfSignups.toFixed(2) }
    }, null, 2));
    return;
  }

  if (argv.length === 0) console.log("\n(demo: no sequences built — pass --have or --help)");
  console.log(report(o, r));
}

if (require.main === module) main();
module.exports = { analyse, STAGES, fatigueVerdict, priority };
