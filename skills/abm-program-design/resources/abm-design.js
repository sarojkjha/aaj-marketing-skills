#!/usr/bin/env node
/*
 * AAJ ABM Program Design — engine
 * Part of the "abm-program-design" Agent Skill.
 *
 * Answers the two questions that decide whether an ABM program survives its
 * first quarter:
 *
 *   Can the team actually run this list?     (capacity)
 *   Would it hit the number if they did?     (coverage)
 *
 * Most programs fail on the first while being planned entirely around the
 * second. The list gets sized to the pipeline target, the team gets sized by
 * whoever was available, and nobody multiplies the two together.
 *
 * USAGE
 *   node abm-design.js                   # demo
 *   node abm-design.js '<json-config>'   # your own numbers
 *   node abm-design.js --help
 *
 * CONFIG (JSON)
 *   {
 *     "targetPipeline": 3000000,        // over the whole program
 *     "acv": 45000,
 *     "programMonths": 6,
 *     "team": { "people": 2, "hoursPerWeek": 8 },   // hours on ABM, not total
 *     "tiers": [
 *       { "name": "Tier 1 (1:1)",    "accounts": 20,  "touchesPerMonth": 8,
 *         "minutesPerTouch": 35, "engagementRate": 0.45, "oppRate": 0.35, "winRate": 0.30 },
 *       { "name": "Tier 2 (1:few)",  "accounts": 60,  "touchesPerMonth": 4,
 *         "minutesPerTouch": 15, "engagementRate": 0.25, "oppRate": 0.22, "winRate": 0.25 },
 *       { "name": "Tier 3 (1:many)", "accounts": 300, "touchesPerMonth": 2,
 *         "minutesPerTouch": 3,  "engagementRate": 0.08, "oppRate": 0.12, "winRate": 0.20 }
 *     ]
 *   }
 *
 * Rates are proportions between 0 and 1. engagementRate is the share of
 * accounts that respond at all; oppRate is the share of THOSE that become an
 * opportunity; winRate is the share of those that close.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

const WEEKS_PER_MONTH = 4.33;

function die(msg, hint) {
  console.error('error: ' + msg);
  if (hint) console.error('       ' + hint);
  console.error('\nRun --help for the schema, or --demo for a worked example.');
  process.exit(1);
}

const money = (n) => '$' + Math.round(n).toLocaleString();
const pct = (x) => (x * 100).toFixed(1) + '%';
const one = (n) => (Math.round(n * 10) / 10).toLocaleString();

function validate(cfg) {
  const req = ['targetPipeline', 'acv', 'programMonths'];
  for (const k of req) {
    if (typeof cfg[k] !== 'number' || !isFinite(cfg[k]) || cfg[k] <= 0) {
      die(`"${k}" must be a positive number.`);
    }
  }
  if (!cfg.team || typeof cfg.team !== 'object') die('"team" must be an object with people and hoursPerWeek.');
  for (const k of ['people', 'hoursPerWeek']) {
    if (typeof cfg.team[k] !== 'number' || cfg.team[k] <= 0) die(`"team.${k}" must be a positive number.`);
  }
  if (!Array.isArray(cfg.tiers) || !cfg.tiers.length) die('"tiers" must be a non-empty array.');

  cfg.tiers.forEach((t, i) => {
    const where = t.name ? `"${t.name}"` : `tiers[${i}]`;
    for (const k of ['accounts', 'touchesPerMonth', 'minutesPerTouch']) {
      if (typeof t[k] !== 'number' || t[k] < 0) die(`${where}: "${k}" must be a number of at least 0.`);
    }
    for (const k of ['engagementRate', 'oppRate', 'winRate']) {
      const v = t[k];
      if (typeof v !== 'number' || !isFinite(v)) die(`${where}: "${k}" must be a number.`);
      if (v < 0 || v > 1) {
        die(`${where}: "${k}" must be a proportion between 0 and 1 (got ${v}).`,
            v > 1 && v <= 100 ? `Pass ${v / 100} for ${v}%, not ${v}.` : undefined);
      }
      // The silent-wrong-answer case: a rate given as a percentage under 1.
      if (v > 0 && v < 0.001) {
        die(`${where}: "${k}" of ${v} is under 0.1% - almost certainly a unit mistake.`);
      }
    }
  });
}

function design(cfg) {
  validate(cfg);

  const availableHoursPerMonth = cfg.team.people * cfg.team.hoursPerWeek * WEEKS_PER_MONTH;

  const tiers = cfg.tiers.map((t) => {
    const touchesPerMonth = t.accounts * t.touchesPerMonth;
    const hoursPerMonth = (touchesPerMonth * t.minutesPerTouch) / 60;
    const engaged = t.accounts * t.engagementRate;
    const opps = engaged * t.oppRate;
    const wins = opps * t.winRate;
    return {
      name: t.name || 'Tier',
      accounts: t.accounts,
      touchesPerMonth,
      hoursPerMonth,
      engaged,
      opps,
      wins,
      pipeline: opps * cfg.acv,
      revenue: wins * cfg.acv,
      hoursPerAccountPerMonth: t.accounts ? (t.touchesPerMonth * t.minutesPerTouch) / 60 : 0,
    };
  });

  const hoursNeeded = tiers.reduce((s, t) => s + t.hoursPerMonth, 0);
  const pipeline = tiers.reduce((s, t) => s + t.pipeline, 0);
  const revenue = tiers.reduce((s, t) => s + t.revenue, 0);
  const totalAccounts = tiers.reduce((s, t) => s + t.accounts, 0);

  const capacityRatio = availableHoursPerMonth > 0 ? hoursNeeded / availableHoursPerMonth : Infinity;
  const coverageRatio = cfg.targetPipeline > 0 ? pipeline / cfg.targetPipeline : 0;

  // What the team could actually run, holding the tier mix constant.
  const runnableFraction = capacityRatio > 0 ? Math.min(1, 1 / capacityRatio) : 1;
  const runnable = tiers.map((t) => ({ name: t.name, accounts: Math.floor(t.accounts * runnableFraction) }));

  // What the list would need to be to hit the target, holding rates constant.
  const neededFraction = coverageRatio > 0 ? 1 / coverageRatio : Infinity;
  const needed = isFinite(neededFraction)
    ? tiers.map((t) => ({ name: t.name, accounts: Math.ceil(t.accounts * neededFraction) }))
    : null;

  const overCommitted = capacityRatio > 1.05;
  const underSized = coverageRatio < 0.95;

  let verdict, note;
  if (overCommitted && underSized) {
    verdict = 'NOT VIABLE';
    note = 'The list is too big for the team and too small for the number at the same time. One of the three has to move: the target, the team, or the conversion rates.';
  } else if (overCommitted) {
    verdict = 'OVER-COMMITTED';
    note = 'The plan would hit the number if it were run, and it cannot be run. Cut the list to what the team can actually touch - a shorter list worked properly beats a long one touched once.';
  } else if (underSized) {
    verdict = 'UNDER-SIZED';
    note = 'The team can run this list comfortably, and it will not produce the pipeline. Widen the list or raise the target rates deliberately, not hopefully.';
  } else {
    verdict = 'VIABLE';
    note = 'Capacity and coverage both work at these rates. The risk now is rate drift, not arithmetic.';
  }

  // The binding constraint, stated plainly.
  const binding = overCommitted && capacityRatio - 1 >= (underSized ? 1 - coverageRatio : 0)
    ? 'capacity'
    : underSized ? 'coverage' : 'neither';

  return {
    availableHoursPerMonth, hoursNeeded, capacityRatio,
    pipeline, revenue, coverageRatio, totalAccounts,
    tiers, runnable, needed, verdict, note, binding,
    overCommitted, underSized,
    target: cfg.targetPipeline, acv: cfg.acv, months: cfg.programMonths,
  };
}

const bar = (v, width = 22) => {
  const filled = Math.max(0, Math.min(width, Math.round(Math.min(1.5, v) / 1.5 * width)));
  return '#'.repeat(filled) + '.'.repeat(width - filled);
};
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
const padL = (s, n) => ' '.repeat(Math.max(0, n - String(s).length)) + String(s);

function render(r) {
  const L = [];
  L.push('');
  L.push('AAJ - ABM PROGRAM DESIGN');
  L.push('='.repeat(72));
  L.push('');
  L.push(`  ${r.verdict}`);
  L.push(`  ${r.note}`);
  L.push('');
  L.push('CAPACITY');
  L.push('-'.repeat(72));
  L.push(`  Hours needed / month     ${one(r.hoursNeeded)}`);
  L.push(`  Hours available / month  ${one(r.availableHoursPerMonth)}`);
  L.push(`  Load                     ${bar(r.capacityRatio)}  ${pct(r.capacityRatio)} of capacity`);
  if (r.overCommitted) {
    L.push('');
    L.push('  At this list size the team is short by ' +
           one(r.hoursNeeded - r.availableHoursPerMonth) + ' hours a month.');
    L.push('  The list they could actually run, same mix:');
    r.runnable.forEach((t) => L.push(`    ${pad(t.name, 22)} ${padL(t.accounts, 5)} accounts`));
  }
  L.push('');
  L.push('COVERAGE');
  L.push('-'.repeat(72));
  L.push(`  Expected pipeline        ${money(r.pipeline)}`);
  L.push(`  Target                   ${money(r.target)}`);
  L.push(`  Coverage                 ${bar(r.coverageRatio)}  ${pct(r.coverageRatio)} of target`);
  L.push(`  Expected closed revenue  ${money(r.revenue)}`);
  if (r.underSized && r.needed) {
    L.push('');
    const mult = 1 / r.coverageRatio;
    if (mult > 5) {
      // Telling someone to find 2,000 more accounts is arithmetically correct
      // and useless. Past roughly 5x, the list is not the thing that is wrong.
      L.push(`  Closing this gap with list size alone would need ${one(mult)}x the accounts`);
      L.push('  you have. At that multiple the list is not the problem - the target,');
      L.push('  the ACV or the conversion rates are. Check those before recruiting more');
      L.push('  accounts you also cannot touch.');
      L.push('');
      L.push('  For reference, the arithmetic answer would be:');
    } else {
      L.push('  To hit the target at these rates, the list would need to be:');
    }
    r.needed.forEach((t) => L.push(`    ${pad(t.name, 22)} ${padL(t.accounts, 5)} accounts`));
  }
  L.push('');
  L.push('BY TIER');
  L.push('-'.repeat(72));
  L.push('  ' + pad('Tier', 22) + padL('Accts', 6) + padL('Hrs/mo', 9) + padL('Engaged', 9) + padL('Opps', 7) + padL('Pipeline', 13));
  r.tiers.forEach((t) => {
    L.push('  ' + pad(t.name, 22) + padL(t.accounts, 6) + padL(one(t.hoursPerMonth), 9) +
           padL(one(t.engaged), 9) + padL(one(t.opps), 7) + padL(money(t.pipeline), 13));
  });
  L.push('  ' + pad('TOTAL', 22) + padL(r.totalAccounts, 6) + padL(one(r.hoursNeeded), 9) +
         padL('', 9) + padL(one(r.tiers.reduce((s, t) => s + t.opps, 0)), 7) + padL(money(r.pipeline), 13));

  // The cost of a tier, per opportunity, is the comparison people skip.
  L.push('');
  L.push('HOURS PER OPPORTUNITY');
  L.push('-'.repeat(72));
  L.push('  Where the effort actually converts. A tier that costs many hours per');
  L.push('  opportunity is not necessarily wrong - it may be the only route into');
  L.push('  the accounts worth most - but it should be a decision, not a surprise.');
  r.tiers.forEach((t) => {
    const hrs = t.opps > 0 ? (t.hoursPerMonth * r.months) / t.opps : null;
    L.push(`    ${pad(t.name, 22)} ${hrs === null ? 'no opportunities' : one(hrs) + ' hours'}`);
  });

  L.push('');
  L.push('--- JSON ---');
  L.push(JSON.stringify({
    verdict: r.verdict,
    binding: r.binding,
    capacityRatio: Math.round(r.capacityRatio * 1000) / 1000,
    coverageRatio: Math.round(r.coverageRatio * 1000) / 1000,
    hoursNeededPerMonth: Math.round(r.hoursNeeded * 10) / 10,
    hoursAvailablePerMonth: Math.round(r.availableHoursPerMonth * 10) / 10,
    expectedPipeline: Math.round(r.pipeline),
    expectedRevenue: Math.round(r.revenue),
    runnableList: r.runnable,
    listNeededForTarget: r.needed,
  }, null, 2));
  return L.join('\n');
}

const DEMO = {
  targetPipeline: 3000000,
  acv: 45000,
  programMonths: 6,
  team: { people: 2, hoursPerWeek: 8 },
  tiers: [
    { name: 'Tier 1 (1:1)', accounts: 20, touchesPerMonth: 8, minutesPerTouch: 35,
      engagementRate: 0.45, oppRate: 0.35, winRate: 0.30 },
    { name: 'Tier 2 (1:few)', accounts: 60, touchesPerMonth: 4, minutesPerTouch: 15,
      engagementRate: 0.25, oppRate: 0.22, winRate: 0.25 },
    { name: 'Tier 3 (1:many)', accounts: 300, touchesPerMonth: 2, minutesPerTouch: 3,
      engagementRate: 0.08, oppRate: 0.12, winRate: 0.20 },
  ],
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
    catch (e) { die('Invalid JSON. Run --help for the schema.', e.message); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: 380 accounts across three tiers, two people at eight hours a week, $3M target)');
  }
  console.log(render(design(cfg)));
}

if (require.main === module) main();

module.exports = { design, validate, WEEKS_PER_MONTH };
