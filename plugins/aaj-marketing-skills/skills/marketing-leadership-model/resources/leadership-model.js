#!/usr/bin/env node
/*
 * AAJ Marketing Leadership Model — engine
 * Part of the "marketing-leadership-model" Agent Skill.
 *
 * AAJ's position: in-house, fractional or agency is decided on three
 * things a spreadsheet usually leaves out - ramp, search time and the
 * founder's own hours - and on whether the company needs judgement,
 * hands, or both. The engine prices all three options on your own numbers
 * (nothing here is a benchmark), divides by productive months rather than
 * calendar months, finds the month the lines cross, prices the exit, and
 * checks which shape of help fits the work you actually have.
 *
 * USAGE
 *   node leadership-model.js                    # demo
 *   node leadership-model.js '<json-config>'    # your own
 *   node leadership-model.js --help
 *
 * CONFIG (JSON) - "compare", "fit": either or both
 *
 *   {
 *     "compare": {
 *       "horizonMonths": 12, "ownHourly": 150, "toolsMonthly": 400,
 *       "inHouse":    { "salary": 180000, "loadPct": 30, "recruitPct": 20, "searchMonths": 2, "rampMonths": 3, "mgmtHoursPerWeek": 2 },
 *       "fractional": { "retainer": 10000, "executionMonthly": 3000, "rampMonths": 1, "mgmtHoursPerWeek": 2, "noticeMonths": 1 },
 *       "agency":     { "retainer": 12000, "setupFee": 5000, "rampMonths": 2, "mgmtHoursPerWeek": 4, "minTermMonths": 6 }
 *     },
 *     "fit": {
 *       "leadershipHoursPerWeek": 10,       // strategy, planning, reviewing, deciding
 *       "executionHoursPerWeek": 25,        // writing, building, running campaigns
 *       "executionInHouse": false,          // is there someone on staff to do the execution
 *       "channelSpecialism": ["paid search"],// channels needing a specialist you do not have
 *       "founderHoursPerWeek": 3,           // hours the founder can give to managing marketing
 *       "monthsToDecide": 12                // how long the arrangement has to hold
 *     }
 *   }
 *
 * Any of inHouse, fractional or agency may be omitted; the comparison runs on
 * the options given. Percentages are whole numbers (30 = 30%).
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var WEEKS_PER_MONTH = 4.33;
var RAMP_OUTPUT = 0.5;            // a month in ramp counts as half a productive month (engine rule)
var EXIT_MONTH = 6;               // the exit table prices stopping at this month, or the horizon if shorter (engine rule)
var CROSSOVER_LIMIT_MIN = 60;     // months searched for a crossover, at least (engine rule)
var LEADERSHIP_FULL_TIME = 30;    // leadership hours a week at or above this justify a full-time leader (AAJ's rule)
var EXECUTION_HEAVY = 20;         // execution hours a week at or above this need hands, not only judgement (AAJ's rule)

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function n0(v) { return isNum(v) && v >= 0 ? v : 0; }

// Productive months: a month counts fully once ramp is done, and half during ramp.
// Months before anyone starts count for nothing.
function productiveMonths(horizon, startDelay, ramp) {
  var working = Math.max(0, horizon - startDelay);
  var ramping = Math.min(ramp, working);
  return (working - ramping) + ramping * RAMP_OUTPUT;
}

function buildOptions(c) {
  var H = Math.max(1, n0(c.horizonMonths) || 12);
  var own = n0(c.ownHourly), tools = n0(c.toolsMonthly);
  var mgmtCost = function (hpw, months) { return hpw * WEEKS_PER_MONTH * own * months; };
  var opts = [];
  if (c.inHouse) {
    var a = c.inHouse;
    if (!isNum(a.salary) || a.salary <= 0) throw inputError('"compare.inHouse.salary" must be greater than 0.');
    var load = n0(a.loadPct) / 100, rec = n0(a.recruitPct) / 100;
    var delay = Math.min(n0(a.searchMonths), H), payMonths = Math.max(0, H - delay);
    var sal = (a.salary / 12) * payMonths, ld = sal * load, rc = a.salary * rec, tl = tools * payMonths, mg = mgmtCost(n0(a.mgmtHoursPerWeek), payMonths);
    opts.push({ id: 'inHouse', name: 'In-house hire', lines: { salary: sal, load: ld, recruiting: rc, tools: tl, yourTime: mg },
      total: sal + ld + rc + tl + mg, productive: productiveMonths(H, delay, n0(a.rampMonths)), startsIn: delay, oneOff: rc,
      monthly: (a.salary / 12) * (1 + load) + tools + n0(a.mgmtHoursPerWeek) * WEEKS_PER_MONTH * own,
      yourHours: n0(a.mgmtHoursPerWeek) * WEEKS_PER_MONTH * payMonths, raw: a });
  }
  if (c.fractional) {
    var b = c.fractional;
    if (!isNum(b.retainer) || b.retainer <= 0) throw inputError('"compare.fractional.retainer" must be greater than 0.');
    var fee = b.retainer * H, ex = n0(b.executionMonthly) * H, tlb = tools * H, mgb = mgmtCost(n0(b.mgmtHoursPerWeek), H);
    opts.push({ id: 'fractional', name: 'Fractional leader', lines: { retainer: fee, execution: ex, tools: tlb, yourTime: mgb },
      total: fee + ex + tlb + mgb, productive: productiveMonths(H, 0, n0(b.rampMonths)), startsIn: 0, oneOff: 0,
      monthly: b.retainer + n0(b.executionMonthly) + tools + n0(b.mgmtHoursPerWeek) * WEEKS_PER_MONTH * own,
      yourHours: n0(b.mgmtHoursPerWeek) * WEEKS_PER_MONTH * H, raw: b });
  }
  if (c.agency) {
    var g = c.agency;
    if (!isNum(g.retainer) || g.retainer <= 0) throw inputError('"compare.agency.retainer" must be greater than 0.');
    var cf = g.retainer * H, su = n0(g.setupFee), tlc = tools * H, mgc = mgmtCost(n0(g.mgmtHoursPerWeek), H);
    opts.push({ id: 'agency', name: 'Agency', lines: { retainer: cf, setup: su, tools: tlc, yourTime: mgc },
      total: cf + su + tlc + mgc, productive: productiveMonths(H, 0, n0(g.rampMonths)), startsIn: 0, oneOff: su,
      monthly: g.retainer + tools + n0(g.mgmtHoursPerWeek) * WEEKS_PER_MONTH * own,
      yourHours: n0(g.mgmtHoursPerWeek) * WEEKS_PER_MONTH * H, raw: g });
  }
  if (!opts.length) throw inputError('"compare" needs at least one of inHouse, fractional, agency.');
  return { H: H, own: own, tools: tools, opts: opts };
}

// Cumulative cost at month m, from the real monthly rate and the real one-off, so the
// crossover does not move when the horizon changes.
function cumulative(opt, m) { return opt.oneOff + opt.monthly * Math.max(0, m - opt.startsIn); }

function crossover(A, B, H) {
  // First month, after the hire has started, where in-house cumulative is below the
  // other option and stays below to the end of the search window.
  var LIMIT = Math.max(H, CROSSOVER_LIMIT_MIN);
  for (var m = Math.max(1, A.startsIn + 1); m <= LIMIT; m++) {
    if (cumulative(A, m) >= cumulative(B, m)) continue;
    var holds = true;
    for (var n = m; n <= LIMIT; n++) if (cumulative(A, n) >= cumulative(B, n)) { holds = false; break; }
    if (holds) return m;
  }
  return null;
}

function compare(c) {
  c = c || {};
  var m = buildOptions(c), H = m.H;
  var cheapest = m.opts.reduce(function (a, b) { return b.total < a.total ? b : a; });
  var rows = m.opts.map(function (o) {
    return { id: o.id, name: o.name, total: o.total, lines: o.lines, startsIn: o.startsIn, productiveMonths: o.productive,
      costPerProductiveMonth: o.productive > 0 ? o.total / o.productive : null, yourHours: o.yourHours, monthlyOnceRunning: o.monthly };
  });
  var byId = {}; m.opts.forEach(function (o) { byId[o.id] = o; });
  var cross = null;
  if (byId.inHouse && (byId.fractional || byId.agency)) {
    var other = byId.fractional || byId.agency;
    var month = crossover(byId.inHouse, other, H);
    cross = { against: other.name, month: month, insideHorizon: month !== null && month <= H,
      monthlyGap: byId.inHouse.monthly - other.monthly,
      text: month === null ? 'The in-house hire never becomes the cheaper option: once both are running it costs ' + Math.round(byId.inHouse.monthly - other.monthly).toLocaleString('en-US') + ' more per month than the ' + other.name.toLowerCase() + ', so the gap only widens. Check the salary load and the execution line; those are the two people usually get wrong.'
        : month <= H ? 'The in-house hire becomes the cheaper option in month ' + month + ', inside your ' + H + '-month horizon.'
        : 'The in-house hire becomes the cheaper option in month ' + month + ', beyond the ' + H + ' months you are deciding for.' };
  }
  // Exit: what has already left the bank, and what leaving still obliges you to pay.
  var q = Math.min(EXIT_MONTH, H);
  var exit = m.opts.map(function (o) {
    var r = o.raw, spent, owed, note;
    if (o.id === 'inHouse') {
      var worked = Math.max(0, q - o.startsIn);
      spent = r.salary * n0(r.recruitPct) / 100 + ((r.salary / 12) * (1 + n0(r.loadPct) / 100) + m.tools) * worked; owed = 0;
      note = 'Recruiting again, and the replacement ramps from zero. No severance assumed.';
    } else if (o.id === 'fractional') {
      spent = (r.retainer + n0(r.executionMonthly) + m.tools) * q; owed = (r.retainer + n0(r.executionMonthly)) * n0(r.noticeMonths);
      note = n0(r.noticeMonths) + '-month notice, then it stops.';
    } else {
      spent = n0(r.setupFee) + (r.retainer + m.tools) * q; var left = Math.max(0, n0(r.minTermMonths) - q); owed = r.retainer * left;
      note = left > 0 ? 'Committed for ' + left + ' more month' + (left === 1 ? '' : 's') + ' whether it works or not.' : 'Minimum term already served.';
    }
    return { id: o.id, name: o.name, spent: spent, owed: owed, note: note };
  });
  return { horizonMonths: H, ownHourly: m.own, options: rows, cheapest: cheapest.id, crossover: cross, exitAtMonth: q, exit: exit };
}

function fit(f) {
  f = f || {};
  var lead = n0(f.leadershipHoursPerWeek), exec = n0(f.executionHoursPerWeek);
  var execInHouse = f.executionInHouse === true;
  var spec = Array.isArray(f.channelSpecialism) ? f.channelSpecialism.filter(Boolean) : [];
  var founder = isNum(f.founderHoursPerWeek) ? f.founderHoursPerWeek : null;
  var months = n0(f.monthsToDecide) || 12;
  var notes = [];
  var needsHands = exec >= EXECUTION_HEAVY && !execInHouse;
  var fullTimeLead = lead >= LEADERSHIP_FULL_TIME;
  var verdict;
  if (fullTimeLead && needsHands) verdict = { level: 'in-house', text: lead + ' hours a week of leadership and ' + exec + ' of execution with nobody to do it is a full-time job plus hands. Hire the leader; buy or hire the execution.' };
  else if (fullTimeLead) verdict = { level: 'in-house', text: lead + ' hours a week of leadership is a full-time role (AAJ treats ' + LEADERSHIP_FULL_TIME + '+ as full time). A fractional leader at that load costs more than a hire and holds less.' };
  else if (needsHands && spec.length) verdict = { level: 'agency', text: 'The work is mostly hands (' + exec + ' hours a week) in channels you do not have (' + spec.join(', ') + '). An agency or specialist contractors fit; add a fractional leader only if nobody is setting direction.' };
  else if (needsHands) verdict = { level: 'fractional-plus-execution', text: 'Judgement is part-time (' + lead + ' hours) but execution is not (' + exec + ' hours) and nobody in-house does it. A strategy-only retainer will not write the emails: pair a fractional leader with a contractor or a junior hire, and count both.' };
  else if (lead > 0) verdict = { level: 'fractional', text: lead + ' hours a week of leadership, with execution covered. That is what a fractional arrangement is for; revisit when the leadership load passes ' + LEADERSHIP_FULL_TIME + ' hours or the horizon passes the crossover month.' };
  else verdict = { level: 'unclear', text: 'Say how many hours a week of leadership and execution the work is; the shape of help follows from that.' };
  if (founder !== null && founder < 2) notes.push('With ' + founder + ' hour(s) a week to give, an agency is the hardest to run well: it usually needs the most of your time in briefs and reviews.');
  if (spec.length && execInHouse) notes.push('Execution exists in-house but not in ' + spec.join(', ') + '. A specialist contractor for those channels is cheaper than either an agency retainer or a hire.');
  if (months < 6) notes.push('Deciding for under six months: a hire is unlikely to be productive before the horizon ends (search plus ramp). Fractional or agency for now.');
  return { leadershipHoursPerWeek: lead, executionHoursPerWeek: exec, executionInHouse: execInHouse, channelSpecialism: spec, verdict: verdict, notes: notes };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.compare && !cfg.fit) throw inputError('Give "compare" (the three options on your numbers), "fit" (the work you have), or both.');
  return {
    compare: cfg.compare ? compare(cfg.compare) : null,
    fit: cfg.fit ? fit(cfg.fit) : null,
    rules: { RAMP_OUTPUT: RAMP_OUTPUT, EXIT_MONTH: EXIT_MONTH, LEADERSHIP_FULL_TIME: LEADERSHIP_FULL_TIME, EXECUTION_HEAVY: EXECUTION_HEAVY, WEEKS_PER_MONTH: WEEKS_PER_MONTH },
  };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const money = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
function render(r) {
  const L = [];
  if (r.compare) {
    const c = r.compare;
    L.push(`COMPARE - over ${c.horizonMonths} months, your time at ${money(c.ownHourly)} an hour. Nothing here is a benchmark.`);
    c.options.forEach((o) => {
      const lines = Object.keys(o.lines).filter((k) => o.lines[k]).map((k) => `${k} ${money(o.lines[k])}`).join(', ');
      L.push(`  ${o.name}${o.id === c.cheapest ? ' (cheapest)' : ''}: ${money(o.total)} total; starts ${o.startsIn ? 'in ' + o.startsIn + ' mo' : 'now'}; ${o.productiveMonths.toFixed(1)} productive months; ${money(o.costPerProductiveMonth)} per productive month; ${Math.round(o.yourHours)} of your hours`);
      L.push(`     ${lines}`);
    });
    if (c.crossover) L.push(`  Crossover: ${c.crossover.text}`);
    L.push(`  If you stop at month ${c.exitAtMonth}:`);
    c.exit.forEach((e) => L.push(`     ${e.name}: spent ${money(e.spent)}, still owed ${money(e.owed)}. ${e.note}`));
    L.push('');
  }
  if (r.fit) {
    const f = r.fit;
    L.push(`FIT - ${f.verdict.level.toUpperCase()}: ${f.verdict.text}`);
    f.notes.forEach((n) => L.push(`  - ${n}`));
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: the defaults from the AAJ comparator, which are starting assumptions, not benchmarks.
const DEMO = {
  compare: {
    horizonMonths: 12, ownHourly: 150, toolsMonthly: 400,
    inHouse: { salary: 180000, loadPct: 30, recruitPct: 20, searchMonths: 2, rampMonths: 3, mgmtHoursPerWeek: 2 },
    fractional: { retainer: 10000, executionMonthly: 3000, rampMonths: 1, mgmtHoursPerWeek: 2, noticeMonths: 1 },
    agency: { retainer: 12000, setupFee: 5000, rampMonths: 2, mgmtHoursPerWeek: 4, minTermMonths: 6 },
  },
  fit: { leadershipHoursPerWeek: 10, executionHoursPerWeek: 25, executionInHouse: false, channelSpecialism: [], founderHoursPerWeek: 3, monthsToDecide: 12 },
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); } catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: the three options on illustrative numbers over 12 months, and a fit check for a seed-stage team)\n');
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, compare, fit, productiveMonths, cumulative, crossover, RAMP_OUTPUT, EXIT_MONTH, LEADERSHIP_FULL_TIME, EXECUTION_HEAVY, WEEKS_PER_MONTH };
