#!/usr/bin/env node
/**
 * AAJ — friction-score
 * Scores a signup or checkout flow on the friction that actually costs
 * conversion, and models what removing each item is worth.
 * No dependencies. Node 14+.
 *
 *   node resources/friction-score.js                                   # demo
 *   node resources/friction-score.js --fields 7 --steps 3 --card-upfront
 *   node resources/friction-score.js --help
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


const DEFAULTS = {
  fields: 6,            // form fields the user must complete
  optional: 0,          // of those, how many are optional
  steps: 2,             // screens before the account exists
  visitors: 5000,       // monthly visitors reaching the first step
  convRate: 3.0,        // current visitor -> account, %
  value: 400,           // value of one signup, $
  addressable: 0.15,    // share of non-converters who are friction-blocked, not uninterested
  // Flags (presence = true)
  cardUpfront: false,   // credit card required before any value
  emailVerify: false,   // must verify email before entering the product
  noSso: false,         // no Google/SSO option
  passwordRules: false, // restrictive password requirements shown as rules
  noProgress: false,    // multi-step with no progress indicator
  demoGate: false,      // must book a demo / talk to sales to try it
  reentry: false,       // asks for data the user already gave
  noGuest: false        // no way to try before committing
};

// Each item carries an estimated share of drop it contributes at this step.
// These are directional priors for B2B SaaS signup flows, not measurements —
// they exist to rank fixes, and every one is overridable by your own test data.
const FRICTION = [
  { id: "cardUpfront",   label: "Card required before value",      weight: 0.28,
    fix: "Move the card behind the first value moment, or offer a card-free trial." },
  { id: "demoGate",      label: "Demo/sales gate before trying",   weight: 0.25,
    fix: "Offer a self-serve path alongside the demo. Most buyers now prefer to evaluate before talking." },
  { id: "emailVerify",   label: "Email verification blocks entry", weight: 0.14,
    fix: "Let the user in immediately; verify in the background before a consequential action." },
  { id: "noSso",         label: "No Google / SSO option",          weight: 0.12,
    fix: "Add SSO. It removes the password decision entirely." },
  { id: "reentry",       label: "Asks for data already given",     weight: 0.10,
    fix: "Pre-fill from what you already hold. Re-asking signals nobody is paying attention." },
  { id: "noGuest",       label: "No way to try before committing", weight: 0.09,
    fix: "Offer a sandbox, sample data, or an interactive demo before the account wall." },
  { id: "passwordRules", label: "Restrictive password rules",      weight: 0.06,
    fix: "Accept any reasonable password; enforce length only. Rules shown upfront read as bureaucracy." },
  { id: "noProgress",    label: "Multi-step with no progress",     weight: 0.05,
    fix: "Show step N of M. Uncertainty about length is itself a reason to abandon." }
];

const num = v => (typeof v === "number" ? v : parseFloat(v));

function score(o) {
  const required = Math.max(0, num(o.fields) - num(o.optional));

  // Field cost: the first two or three fields are cheap; each one after that
  // compounds. Curve is deliberately gentle up to 3, steeper beyond.
  const fieldPenalty = required <= 3
    ? required * 2.5
    : 7.5 + (required - 3) * 6;

  // Step cost: one step is free, each additional screen is a chance to leave.
  const stepPenalty = Math.max(0, num(o.steps) - 1) * 8;

  const flagged = FRICTION.filter(f => o[f.id]);
  const flagPenalty = flagged.reduce((s, f) => s + f.weight * 100, 0);

  const raw = 100 - fieldPenalty - stepPenalty - flagPenalty;
  const total = Math.max(0, Math.min(100, raw));

  // Opportunity model. Most non-converters are not friction-blocked — they are
  // the wrong fit, just browsing, or not ready. Only an addressable slice can be
  // recovered by fixing the flow at all. Weights are then normalised against the
  // full friction set, so the total recoverable can never exceed that slice.
  const visitors = num(o.visitors);
  const cr = num(o.convRate) / 100;
  const converting = visitors * cr;
  const notConverting = visitors - converting;
  const addressablePool = notConverting * num(o.addressable);
  const weightSum = FRICTION.reduce((s, f) => s + f.weight, 0);

  const opportunities = flagged.map(f => {
    const recovered = addressablePool * (f.weight / weightSum);
    return {
      id: f.id, label: f.label, fix: f.fix,
      extraSignups: recovered,
      monthlyValue: recovered * num(o.value)
    };
  }).sort((a, b) => b.monthlyValue - a.monthlyValue);

  return {
    total, required, optional: num(o.optional),
    fieldPenalty, stepPenalty, flagPenalty,
    flagged, opportunities,
    converting, notConverting, addressablePool,
    totalOpportunity: opportunities.reduce((s, x) => s + x.monthlyValue, 0)
  };
}

function verdict(n) {
  if (n >= 85) return "LEAN — little standing between the visitor and an account";
  if (n >= 70) return "OK — a few items worth removing";
  if (n >= 50) return "HEAVY — friction is materially costing signups";
  return "BLOCKING — the flow is the reason conversion is low";
}

const bar = n => "█".repeat(Math.round(n / 10)) + "░".repeat(10 - Math.round(n / 10));
const money = n => "$" + Math.round(n).toLocaleString("en-US");

function report(o, r) {
  const L = [];
  L.push("");
  L.push("AAJ · SIGNUP FRICTION SCORE");
  L.push("─".repeat(62));
  L.push(`  Friction score     ${bar(r.total)}  ${Math.round(r.total)}/100`);
  L.push(`  ${verdict(r.total)}`);
  L.push("");
  L.push("WHERE THE SCORE WENT");
  L.push(`  Required fields    ${r.required}${r.optional ? ` (+${r.optional} optional)` : ""}  −${r.fieldPenalty.toFixed(0)}`);
  L.push(`  Steps              ${o.steps}  −${r.stepPenalty.toFixed(0)}`);
  L.push(`  Friction items     ${r.flagged.length}  −${r.flagPenalty.toFixed(0)}`);
  L.push("");

  if (r.flagged.length) {
    L.push("─".repeat(62));
    L.push("FIX IN THIS ORDER");
    L.push("");
    r.opportunities.forEach((x, i) => {
      L.push(`  ${i + 1}. ${x.label}`);
      L.push(`     Fix:   ${x.fix}`);
      L.push(`     Worth: ~${x.extraSignups.toFixed(0)} signups/mo  ≈ ${money(x.monthlyValue)}/mo`);
      L.push("");
    });
  } else {
    L.push("  No friction flags set. Score is driven by field and step count alone.");
    L.push("");
  }

  L.push("─".repeat(62));
  L.push("CURRENT STATE");
  L.push(`  Visitors            ${Math.round(num(o.visitors)).toLocaleString("en-US")}/mo`);
  L.push(`  Converting          ${r.converting.toFixed(0)} (${o.convRate}%)`);
  L.push(`  Not converting      ${r.notConverting.toFixed(0)}`);
  L.push(`  Friction-blocked    ${r.addressablePool.toFixed(0)}  (${(num(o.addressable) * 100).toFixed(0)}% of non-converters — the rest are wrong-fit or not ready)`);
  L.push(`  Total opportunity   ${money(r.totalOpportunity)}/mo if every flagged item is removed`);
  L.push("");
  L.push("  Recoverable signups are capped at the friction-blocked slice above and");
  L.push("  split by directional priors. These rank fixes; they do not forecast.");
  L.push("  Tune --addressable to your own data, and replace the ranking with A/B results.");
  L.push("");
  L.push("─".repeat(62));
  L.push("JSON");
  L.push(JSON.stringify({
    score: Math.round(r.total),
    verdict: verdict(r.total),
    breakdown: { requiredFields: r.required, steps: num(o.steps), frictionItems: r.flagged.length },
    fixes: r.opportunities.map(x => ({
      item: x.id, label: x.label, fix: x.fix,
      extraSignupsPerMonth: +x.extraSignups.toFixed(1),
      monthlyValue: Math.round(x.monthlyValue)
    })),
    totalMonthlyOpportunity: Math.round(r.totalOpportunity)
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ friction-score — what your signup flow costs you, and what to remove first.

Usage
  node resources/friction-score.js                      Demo
  node resources/friction-score.js [options]
  node resources/friction-score.js --json [options]

Numbers            Default   Meaning
  --fields         6         Form fields the user must complete
  --optional       0         How many of those are optional
  --steps          2         Screens before the account exists
  --visitors       5000      Monthly visitors reaching step one
  --conv-rate      3.0       Current visitor to account, %
  --value          400       Value of one signup, $
  --addressable    0.15      Share of non-converters who are friction-blocked

Flags (add if true)
  --card-upfront      Card required before any value
  --demo-gate         Must book a demo / talk to sales to try it
  --email-verify      Email verification blocks entry
  --no-sso            No Google / SSO option
  --reentry           Asks for data the user already gave
  --no-guest          No way to try before committing
  --password-rules    Restrictive password requirements
  --no-progress       Multi-step with no progress indicator

The score ranks friction; it does not forecast conversion. The weights are
directional priors for B2B SaaS, not measurements from your funnel. Use it
to decide what to test first, then replace the priors with your own results.
`;

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  const nums = {
    "--fields": "fields", "--optional": "optional", "--steps": "steps",
    "--visitors": "visitors", "--conv-rate": "convRate", "--value": "value",
    "--addressable": "addressable"
  };
  const flags = {
    "--card-upfront": "cardUpfront", "--demo-gate": "demoGate",
    "--email-verify": "emailVerify", "--no-sso": "noSso",
    "--reentry": "reentry", "--no-guest": "noGuest",
    "--password-rules": "passwordRules", "--no-progress": "noProgress"
  };
  for (let i = 0; i < argv.length; i++) {
    if (nums[argv[i]] && argv[i + 1] !== undefined) { o[nums[argv[i]]] = num(argv[i + 1]); i++; }
    else if (flags[argv[i]]) o[flags[argv[i]]] = true;
  }
  return o;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const o = parseArgs(argv);
  const bad = ["fields", "optional", "steps", "visitors", "convRate", "value", "addressable"]
    .filter(k => Number.isNaN(num(o[k])));
  if (bad.length) { console.error(`Invalid numeric values for: ${bad.join(", ")}`); process.exit(1); }
  if (num(o.optional) > num(o.fields)) { console.error("--optional cannot exceed --fields."); process.exit(1); }
  if (num(o.convRate) < 0 || num(o.convRate) > 100) { console.error("--conv-rate is a percentage between 0 and 100."); process.exit(1); }
  if (num(o.steps) < 1) { console.error("--steps must be at least 1."); process.exit(1); }
  if (num(o.addressable) <= 0 || num(o.addressable) > 1) { console.error("--addressable is a fraction between 0 and 1 (e.g. 0.15)."); process.exit(1); }

  const r = score(o);

  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      score: Math.round(r.total),
      verdict: verdict(r.total),
      breakdown: { requiredFields: r.required, steps: num(o.steps), frictionItems: r.flagged.length },
      fixes: r.opportunities.map(x => ({ item: x.id, label: x.label, fix: x.fix, extraSignupsPerMonth: +x.extraSignups.toFixed(1), monthlyValue: Math.round(x.monthlyValue) })),
      totalMonthlyOpportunity: Math.round(r.totalOpportunity)
    }, null, 2));
    return;
  }

  if (argv.length === 0) console.log("\n(demo — pass options or --help to score your own flow)");
  console.log(report(o, r));
}

if (require.main === module) main();
module.exports = { score, verdict, FRICTION };
