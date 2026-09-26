#!/usr/bin/env node
/*
 * AAJ Product Launch — engine
 * Part of the "product-launch" Agent Skill.
 *
 * Three questions, in the order they should be asked:
 *
 *   tier(launch)       how big a launch does this deserve?
 *   readiness(gate)    is it ready to set a date?
 *   plan(date, tier)   what has to happen on which day?
 *
 * The readiness gate, its 85 / 60 thresholds, the work-back tasks and the
 * launch-day go/no-go gates are the same ones the AAJ Launch Readiness Planner
 * (aajconsult.com/tools/launch-readiness-planner) and the Launch Plan Checklist
 * use. If one changes, change all three - a tool that disagrees with its own
 * method is worse than no tool.
 *
 * USAGE
 *   node launch.js                    # demo
 *   node launch.js '<json-config>'    # your own
 *   node launch.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "launch": {
 *       "what":            "new-product" | "new-market" | "major-feature" | "minor-feature" | "improvement",
 *       "revenue":         "new-revenue-line" | "expansion" | "retention" | "none",
 *       "audience":        "market" | "all-customers" | "segment" | "few",
 *       "pricingChange":   false,
 *       "behaviourChange": false,        // existing customers must change how they work
 *       "plannedScale":    "big" | "standard" | "quiet"     // optional: what the team intends
 *     },
 *     "gate": { "positioning-story": 2, "positioning-hook": 1, ... },   // 0 no, 1 partly, 2 yes
 *                                      // or an array of 12 scores in the order below
 *     "launchDate": "2026-11-03",      // optional: builds the work-back plan
 *     "today":      "2026-09-25"       // optional: defaults to today
 *   }
 *
 * Gate item ids: positioning-story, positioning-hook, product-stable,
 * product-first-run, audience-list, audience-supporters, assets-page,
 * assets-creative, team-owner, team-runbook, measurement-goal,
 * measurement-tracking. A missing item scores 0: not started.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

/* ───────────── shared with /tools/launch-readiness-planner ───────────── */

const ITEMS = [
  { id: "positioning-story", dim: "Positioning", text: "Positioning is locked - you can say what it is, who it is for and why it is different in one breath.", why: "A fuzzy story fragments the launch. Every asset inherits this." },
  { id: "positioning-hook", dim: "Positioning", text: "You have a single, sticky launch hook you are confident in.", why: "The hook does more for reach than any channel tactic." },
  { id: "product-stable", dim: "Product", text: "The thing you are launching is stable - the core flow works without hand-holding.", why: "A launch spike onto a broken flow burns the audience you worked to earn." },
  { id: "product-first-run", dim: "Product", text: "The first-run experience is smooth for a brand-new user.", why: "Launch traffic is mostly first-timers. Activation happens here or not at all." },
  { id: "audience-list", dim: "Audience", text: "You have a warm list or audience to activate on day one.", why: "Launching to nobody is the most common launch failure. Attention must be pre-built." },
  { id: "audience-supporters", dim: "Audience", text: "You have named supporters lined up to amplify early.", why: "Early momentum compounds; a flat first hour is hard to recover." },
  { id: "assets-page", dim: "Assets", text: "A launch landing page is built and QA'd.", why: "The click has to land somewhere that converts, with working links and tracking." },
  { id: "assets-creative", dim: "Assets", text: "Core creative is ready: demo, screenshots, graphics, copy.", why: "Making assets on launch day guarantees a rushed, weaker launch." },
  { id: "team-owner", dim: "Team", text: "One person owns the launch, and every channel has a named owner.", why: "Diffuse ownership means dropped balls exactly when timing matters most." },
  { id: "team-runbook", dim: "Team", text: "The team knows the launch-day runbook and their role in it.", why: "Launch day is execution, not planning. Rehearse the sequence." },
  { id: "measurement-goal", dim: "Measurement", text: "You have defined the launch goal and two to four target metrics.", why: "Without a target you cannot tell a win from noise, or learn anything." },
  { id: "measurement-tracking", dim: "Measurement", text: "Tracking, UTMs and a dashboard are live.", why: "You cannot optimise or report what you never instrumented." }
];
const DIMS = ["Positioning", "Product", "Audience", "Assets", "Team", "Measurement"];

// [offset in days from launch, phase, task, priority]
const TASKS = [
  [-30, "Foundation", "Lock positioning and the one-line hook", "Must"],
  [-30, "Foundation", "Define the launch goal and 2-4 target metrics", "Must"],
  [-30, "Foundation", "Set the launch date and work-back timeline", "Must"],
  [-28, "Foundation", "Confirm the thing being launched is stable and demo-ready", "Must"],
  [-28, "Foundation", "Assign the launch owner and channel owners", "Must"],
  [-25, "Foundation", "Build and clean the launch email list", "Should"],
  [-24, "Foundation", "Draft the launch narrative and story angle", "Should"],
  [-20, "Assets", "Build or refresh the launch landing page", "Must"],
  [-18, "Assets", "Record the product demo or launch video", "Should"],
  [-16, "Assets", "Design launch graphics", "Must"],
  [-15, "Assets", "Write launch-day copy for every channel", "Must"],
  [-13, "Assets", "Build the launch email sequence: teaser, launch, recap", "Must"],
  [-12, "Assets", "Write the FAQ and objection handling", "Should"],
  [-11, "Assets", "QA the landing page: links, tracking, forms, mobile", "Must"],
  [-10, "Pre-launch", "Warm up the audience: teaser, waitlist, countdown", "Should"],
  [-9, "Pre-launch", "Line up supporters and early amplifiers", "Must"],
  [-8, "Pre-launch", "Seed early users for testimonials and quotes", "Should"],
  [-7, "Pre-launch", "Schedule social posts, founder and company", "Should"],
  [-6, "Pre-launch", "Pre-write community and forum posts", "Should"],
  [-5, "Pre-launch", "Brief the team on launch-day roles and the runbook", "Must"],
  [-4, "Pre-launch", "Confirm tracking, UTMs and dashboards are live", "Must"],
  [-2, "Pre-launch", "Final QA and go/no-go dry run", "Must"],
  [0, "Launch day", "Go live, post on the anchor channel early, email the list", "Must"],
  [0, "Launch day", "Notify supporters and communities; be present all day", "Must"],
  [0, "Launch day", "Monitor metrics, errors and sentiment", "Must"],
  [1, "Amplify", "Send the day-after recap and thank supporters publicly", "Should"],
  [2, "Amplify", "Outreach to press, newsletters and creators", "Nice"],
  [3, "Amplify", "Retarget visitors who did not convert", "Should"],
  [4, "Amplify", "Repurpose the launch into content", "Should"],
  [5, "Amplify", "Collect and publish testimonials", "Should"],
  [7, "Learn", "Run the retro: metrics against goals", "Must"],
  [10, "Learn", "Capture learnings and update the playbook", "Should"],
  [14, "Learn", "Nurture new signups into activation", "Must"],
  [21, "Learn", "Report results to the team and investors", "Should"]
];

// Launch-day go/no-go: every one must be true on the morning.
const GATES = [
  ["Product", "The feature is live, stable, and the core flow works end to end"],
  ["Tracking", "Analytics, UTMs and conversion events are firing"],
  ["Landing", "The landing page loads and all links and CTAs work on desktop and mobile"],
  ["Team", "Owners are online and know the runbook"]
];

const READY = 85, CLOSE = 60;

/* ─────────────────────────── tiering ─────────────────────────── */

const WHAT = ['new-product', 'new-market', 'major-feature', 'minor-feature', 'improvement'];
const REVENUE = ['new-revenue-line', 'expansion', 'retention', 'none'];
const AUDIENCE = ['market', 'all-customers', 'segment', 'few'];

const TIERS = {
  1: { name: 'Tier 1 - full launch',
       gets: 'An external announcement with a date: the full work-back plan, sales and support enablement, press and partner outreach, and the go/no-go gates on the day.',
       priorities: ['Must', 'Should', 'Nice'] },
  2: { name: 'Tier 2 - customer launch',
       gets: 'Customers and the relevant segment hear about it properly - email, in-app, a post, a sales brief - without a market-wide campaign. The Must and Should tasks, and the go/no-go gates.',
       priorities: ['Must', 'Should'] },
  3: { name: 'Tier 3 - release note',
       gets: 'A changelog entry, an in-app note where it is used, and one adoption metric. No launch date and no readiness gate - holding it back for a moment wastes the team and trains the audience to ignore announcements.',
       priorities: [] },
};

function tier(l) {
  if (!l || typeof l !== 'object') die('"launch" must be an object describing what is being launched.');
  if (!WHAT.includes(l.what)) die(`"launch.what" must be one of: ${WHAT.join(', ')}.`);
  const revenue = l.revenue === undefined ? 'none' : l.revenue;
  const audience = l.audience === undefined ? 'segment' : l.audience;
  if (!REVENUE.includes(revenue)) die(`"launch.revenue" must be one of: ${REVENUE.join(', ')}.`);
  if (!AUDIENCE.includes(audience)) die(`"launch.audience" must be one of: ${AUDIENCE.join(', ')}.`);

  const reasons = [];
  let t;
  if (l.what === 'new-product' || l.what === 'new-market') {
    t = 1; reasons.push(l.what === 'new-product' ? 'It is a new product.' : 'It takes the product into a new market.');
  } else if (l.what === 'major-feature' && audience === 'market' && (revenue === 'new-revenue-line' || l.pricingChange)) {
    t = 1; reasons.push('A major feature for the whole market that ' + (revenue === 'new-revenue-line' ? 'opens a new revenue line.' : 'changes pricing.'));
  } else if (l.what === 'major-feature' || l.pricingChange || (l.behaviourChange && (audience === 'all-customers' || audience === 'market'))) {
    t = 2;
    if (l.what === 'major-feature') reasons.push('A major feature, but not a new product or market.');
    if (l.pricingChange) reasons.push('It changes pricing, which every affected customer has to hear from you first.');
    if (l.behaviourChange) reasons.push('Existing customers have to change how they work.');
  } else {
    t = 3; reasons.push('A ' + l.what.replace('-', ' ') + ' that changes nothing a customer has to learn or pay for.');
  }

  let mismatch = null;
  if (l.plannedScale === 'big' && t === 3) mismatch = 'The team plans a big launch for a Tier 3 change. Spending a launch on a release note trains your audience to ignore the next announcement, including the one that matters.';
  else if (l.plannedScale === 'quiet' && t === 1) mismatch = 'The team plans to launch a Tier 1 change quietly. A new product or market launched without a date and an announcement rarely gets a second first impression.';
  else if (l.plannedScale === 'big' && t === 2) mismatch = 'The team plans a market-wide launch for a Tier 2 change. Check that the market, not just customers, has a reason to care.';

  return { tier: t, ...TIERS[t], reasons, mismatch };
}

/* ─────────────────────────── readiness ─────────────────────────── */

function readScores(gate) {
  if (gate === undefined) return null;
  if (Array.isArray(gate)) {
    if (gate.length !== ITEMS.length) die(`"gate" as an array needs ${ITEMS.length} scores, in the order of the item ids in --help.`);
    return gate.map((v, i) => check(v, ITEMS[i].id));
  }
  if (typeof gate !== 'object') die('"gate" must be an object of item id to score, or an array of 12 scores.');
  for (const k of Object.keys(gate)) {
    if (!ITEMS.some((it) => it.id === k)) die(`"gate" has an unknown item "${k}".`, 'Run --help for the twelve item ids.');
  }
  return ITEMS.map((it) => (gate[it.id] === undefined ? 0 : check(gate[it.id], it.id)));
}
function check(v, id) {
  if (v !== 0 && v !== 1 && v !== 2) die(`Gate item "${id}" must be 0 (no), 1 (partly) or 2 (yes).`);
  return v;
}

function readiness(scores) {
  const total = scores.reduce((a, b) => a + b, 0);
  const max = ITEMS.length * 2;
  const pct = Math.round((total / max) * 100);
  let verdict, why;
  if (pct >= READY) { verdict = 'Ready to set a date'; why = 'The gate is clear. Lock the date and work the plan below.'; }
  else if (pct >= CLOSE) { verdict = 'Close'; why = 'Close the zeros and ones below before you commit to a date.'; }
  else { verdict = 'Building phase'; why = 'This is not a launch-planning problem yet. Setting a date now would move work you have not done into a week you do not have.'; }
  const byDim = DIMS.map((d) => {
    const idx = ITEMS.map((it, i) => (it.dim === d ? i : -1)).filter((i) => i >= 0);
    return { dim: d, got: idx.reduce((a, i) => a + scores[i], 0), max: idx.length * 2 };
  });
  const gaps = ITEMS.map((it, i) => ({ ...it, score: scores[i] }))
    .filter((g) => g.score < 2)
    .sort((a, b) => a.score - b.score);
  return { total, max, pct, verdict, why, byDim, gaps };
}

/* ─────────────────────────── plan ─────────────────────────── */

function parseDate(v, field) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) die(`"${field}" must be a date as YYYY-MM-DD.`);
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) die(`"${field}" is not a real date.`);
  return dt;
}
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function plan(launchDate, today, t) {
  const pr = TIERS[t].priorities;
  return TASKS.filter((x) => pr.includes(x[3])).map(([off, phase, task, priority]) => {
    const due = addDays(launchDate, off);
    return { offset: off, due: iso(due), phase, task, priority, overdue: due < today };
  });
}

/* ─────────────────────────── run ─────────────────────────── */

function run(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  const tr = tier(cfg.launch);
  const out = { tier: tr, readiness: null, plan: null, days: null, gates: null, findings: [] };

  if (tr.tier === 3) {
    out.findings.push('Tier 3: skip the gate and the date. Ship it, write the note, and name the one adoption metric you will check in two weeks.');
    return out;
  }

  const scores = readScores(cfg.gate);
  if (scores === null) {
    out.findings.push('No gate scores given, so readiness was not assessed. Score the twelve items before choosing a date.');
  } else {
    out.readiness = readiness(scores);
  }

  if (cfg.launchDate !== undefined) {
    const launchDate = parseDate(cfg.launchDate, 'launchDate');
    const now = new Date();
    const today = cfg.today !== undefined ? parseDate(cfg.today, 'today') : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    out.days = Math.round((launchDate - today) / 86400000);
    out.plan = plan(launchDate, today, tr.tier);
    out.gates = GATES.map(([k, v]) => ({ gate: k, check: v }));
    const overdueMust = out.plan.filter((p) => p.overdue && p.priority === 'Must');
    if (out.days < 0) out.findings.push('The launch date has passed.');
    else if (overdueMust.length) out.findings.push(`${overdueMust.length} Must task${overdueMust.length > 1 ? 's are' : ' is'} already past due for this date. Either do them this week or move the date - a launch date with overdue foundations is the Building phase with a deadline attached.`);
    if (out.readiness && out.readiness.pct < CLOSE) out.findings.push('A date is set while readiness is in the Building phase. Most launches that slip were dated before the gate was clear.');
  }
  return out;
}

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  L.push('');
  L.push('AAJ - PRODUCT LAUNCH');
  L.push('-'.repeat(66));
  L.push(`  ${r.tier.name.toUpperCase()}`);
  r.tier.reasons.forEach((x) => L.push(`  ${x}`));
  L.push(`  What it gets: ${r.tier.gets}`);
  if (r.tier.mismatch) { L.push(''); L.push(`  !  ${r.tier.mismatch}`); }

  if (r.readiness) {
    const x = r.readiness;
    L.push('');
    L.push('READINESS');
    L.push(`  ${x.pct}%  (${x.total} of ${x.max})  ${x.verdict.toUpperCase()} - ${x.why}`);
    x.byDim.forEach((d) => L.push(`    ${d.dim.padEnd(12)} ${d.got}/${d.max}`));
    if (x.gaps.length) {
      L.push('');
      L.push('  CLOSE THESE FIRST');
      x.gaps.forEach((g) => {
        L.push(`  [${g.score === 0 ? ' ' : '~'}] ${g.dim}: ${g.text}`);
        L.push(`      ${g.why}`);
      });
    }
  }

  if (r.plan) {
    L.push('');
    L.push(`WORK-BACK PLAN  (${r.days} days to launch)`);
    r.plan.forEach((p) => {
      const off = p.offset === 0 ? 'T-0' : p.offset < 0 ? 'T' + p.offset : 'T+' + p.offset;
      L.push(`  ${off.padEnd(5)} ${p.due}  ${p.priority.padEnd(6)} ${p.task}${p.overdue ? '  [overdue]' : ''}`);
    });
    L.push('');
    L.push('GO / NO-GO ON THE DAY');
    r.gates.forEach((g) => L.push(`  [ ] ${g.gate}: ${g.check}`));
  }

  if (r.findings.length) {
    L.push('');
    L.push('FINDINGS');
    r.findings.forEach((f) => L.push(`  -  ${f}`));
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

const DEMO = {
  launch: { what: 'major-feature', revenue: 'expansion', audience: 'all-customers', pricingChange: true, plannedScale: 'big' },
  gate: {
    'positioning-story': 2, 'positioning-hook': 1, 'product-stable': 2, 'product-first-run': 1,
    'audience-list': 2, 'audience-supporters': 0, 'assets-page': 1, 'assets-creative': 1,
    'team-owner': 2, 'team-runbook': 0, 'measurement-goal': 1, 'measurement-tracking': 0,
  },
  launchDate: '2026-11-03',
  today: '2026-09-25',
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: a major feature with a pricing change for all customers, planned as a big launch)');
  }
  try {
    console.log(render(run(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, tier, readiness, plan, ITEMS, TASKS, GATES, DIMS, READY, CLOSE };
