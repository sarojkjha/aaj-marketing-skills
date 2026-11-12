#!/usr/bin/env node
/*
 * AAJ Revenue-to-Pipeline Planner - engine
 * Part of the "revenue-to-pipeline" Agent Skill.
 *
 * Works backward from a revenue target for a period to the wins, opportunities,
 * SQLs, MQLs and leads it takes, using the team's own conversion rates. Rates
 * come either typed in directly or derived from last period's stage counts.
 * AAJ supplies no conversion rates and no benchmarks: every rate is yours.
 *
 * USAGE
 *   node pipeline-plan.js                    # demo (Example Co., invented numbers)
 *   node pipeline-plan.js '<json-config>'    # your own
 *   node pipeline-plan.js --help
 *
 * CONFIG (JSON). Money in one currency; rates as fractions (0.35 = 35%).
 *
 *   {
 *     "target": 600000,          // new revenue to win in the period
 *     "dealSize": 25000,         // average new revenue per win
 *     "periodMonths": 3,         // length of the period, whole months (1 to 36)
 *     "expected": 120000,        // optional: revenue you already expect from open pipeline (your own figure)
 *
 *     // Give your rates ONE of two ways:
 *     "last": {                  // (b) last period's counts, same names as the marketing-report skill
 *       "leads": 2400, "mqls": 840, "sqls": 300, "opps": 120, "wins": 30
 *     },
 *     "rates": {                 // (a) stage-to-stage rates, typed directly
 *       "leadsToMqls": 0.35, "mqlsToSqls": 0.36, "sqlsToOpps": 0.4, "oppsToWins": 0.25
 *     },
 *
 *     "salesCycleDays": 75,      // optional: days from the top stage of your funnel to a win
 *     "current": {               // optional: what each stage produces per month now
 *       "leads": 450, "mqls": 160, "sqls": 70, "opps": 20
 *     },
 *     "period": "Q1 2027",       // optional label
 *     "currency": "$"            // optional
 *   }
 *
 * STAGES, top to bottom: leads, mqls, sqls, opps, wins. Use any of them in that
 * order, ending at wins; a team with no MQL stage gives leads, sqls, opps, wins.
 * Rate names join two stages: leadsToMqls, leadsToSqls (no MQL stage), mqlsToSqls,
 * sqlsToOpps, oppsToWins, and so on. The rates must form one unbroken chain.
 *
 * MATH
 *   still to win        = target - expected (never below 0)
 *   wins needed         = still to win / dealSize
 *   stage needed        = needed at the next stage / rate from this stage to the next
 *   rounding            = each count rounds UP, from the whole number below it
 *                         (you cannot win 0.4 of a deal); the exact figure is shown too
 *   per month           = rounded count / periodMonths, an average (one decimal)
 *   monthly gap         = per-month need - current monthly volume; the stage with the
 *                         largest gap as a share of its need is named
 *   rates from counts   = count at the next stage / count at this stage, last period
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`.
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

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
// Every rate comes from the user. The engine holds no conversion rates and no benchmarks.
var STAGES = [
  { key: 'leads', label: 'Leads', one: 'lead', many: 'leads' },
  { key: 'mqls', label: 'MQLs', one: 'MQL', many: 'MQLs' },
  { key: 'sqls', label: 'SQLs', one: 'SQL', many: 'SQLs' },
  { key: 'opps', label: 'Opportunities', one: 'opportunity', many: 'opportunities' },
  { key: 'wins', label: 'Wins', one: 'win', many: 'wins' }
];
var STAGE_KEYS = STAGES.map(function (s) { return s.key; });
var FIELDS = ['target', 'dealSize', 'periodMonths', 'expected', 'rates', 'last', 'current', 'salesCycleDays', 'period', 'currency'];
var BIG = 1e13;
var DAYS_PER_MONTH = 365 / 12;   // calendar average, used only to state the period in days

function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }
function rateKey(from, to) { return from + 'To' + cap(to); }
var RATE_KEYS = [];
STAGE_KEYS.forEach(function (a, i) { STAGE_KEYS.slice(i + 1).forEach(function (b) { RATE_KEYS.push(rateKey(a, b)); }); });
function parseRateKey(k) {
  for (var i = 0; i < STAGE_KEYS.length; i++) for (var j = i + 1; j < STAGE_KEYS.length; j++) {
    if (rateKey(STAGE_KEYS[i], STAGE_KEYS[j]) === k) return { from: i, to: j };
  }
  return null;
}
function stageOf(k) { return STAGES[STAGE_KEYS.indexOf(k)]; }

// Round off floating-point noise (100.00000000001 -> 100) before rounding up.
function tidy(v) { return Math.round(v * 1e9) / 1e9; }
function up(v) { return Math.ceil(tidy(v)); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }

function inputError(errors) {
  var e = new Error(errors.map(function (x) { return x.message; }).join('\n'));
  e.errors = errors; e.isInputError = true;
  return e;
}

function normalise(cfg) {
  var errs = [];
  function err(field, message) { errs.push({ field: field, message: message }); }
  if (!isObj(cfg)) throw inputError([{ field: null, message: 'The config must be a JSON object.' }]);
  Object.keys(cfg).forEach(function (k) {
    if (FIELDS.indexOf(k) < 0) err(k, 'Unknown field "' + k + '". Allowed: ' + FIELDS.join(', ') + '.');
  });
  function money(k, required, allowZero) {
    var v = cfg[k];
    if (v == null) { if (required) err(k, '"' + k + '" is required.'); return null; }
    if (!isNum(v)) { err(k, '"' + k + '" must be a number (got ' + JSON.stringify(v) + ').'); return null; }
    if (v < 0 || (!allowZero && v === 0) || v > BIG) { err(k, '"' + k + '" must be ' + (allowZero ? '0 or more' : 'above 0') + ' (got ' + v + ').'); return null; }
    return v;
  }
  function whole(k, lo, hi, required) {
    var v = cfg[k];
    if (v == null) { if (required) err(k, '"' + k + '" is required.'); return null; }
    if (!isNum(v)) { err(k, '"' + k + '" must be a number (got ' + JSON.stringify(v) + ').'); return null; }
    if (v !== Math.floor(v) || v < lo || v > hi) { err(k, '"' + k + '" must be a whole number from ' + lo + ' to ' + hi + ' (got ' + v + ').'); return null; }
    return v;
  }
  var s = {
    target: money('target', true, false),
    dealSize: money('dealSize', true, false),
    periodMonths: whole('periodMonths', 1, 36, true),
    expected: money('expected', false, true),
    salesCycleDays: whole('salesCycleDays', 1, 1095, false),
    period: cfg.period == null ? null : String(cfg.period).slice(0, 40),
    currency: cfg.currency == null ? '$' : String(cfg.currency).slice(0, 4),
    rateSource: null, last: null, rates: null, current: null, chain: null
  };

  // Rates: typed (a) or from last period's counts (b), never both.
  if (cfg.rates != null && cfg.last != null) err('rates', 'Give "rates" or "last", not both: the engine would not know which to plan from.');
  else if (cfg.rates == null && cfg.last == null) err('rates', 'Give your conversion rates: either "rates" (typed) or "last" (last period\'s counts). The engine has no rates of its own.');
  else if (cfg.rates != null) {
    s.rateSource = 'entered';
    if (!isObj(cfg.rates)) err('rates', '"rates" must be an object such as {"sqlsToOpps":0.4,"oppsToWins":0.25}.');
    else {
      var links = [];
      Object.keys(cfg.rates).forEach(function (k) {
        var p = parseRateKey(k), v = cfg.rates[k];
        if (!p) { err('rates.' + k, 'Unknown rate "' + k + '". Rate names join two stages in order, such as leadsToMqls, leadsToSqls, sqlsToOpps, oppsToWins.'); return; }
        if (!isNum(v)) { err('rates.' + k, 'Rate "' + k + '" must be a number (got ' + JSON.stringify(v) + ').'); return; }
        if (v <= 0 || v > 1) { err('rates.' + k, 'Rate "' + k + '" must be above 0 and at most 1 (got ' + v + '). Write 35% as 0.35.'); return; }
        links.push({ key: k, from: p.from, to: p.to, rate: v });
      });
      if (!errs.length) {
        links.sort(function (a, b) { return a.from - b.from; });
        if (!links.length) err('rates', '"rates" is empty. Give at least the rate into wins, such as "oppsToWins".');
        for (var i = 0; i < links.length && !errs.length; i++) {
          if (i > 0 && links[i].from === links[i - 1].from) err('rates.' + links[i].key, 'Two rates start at ' + STAGES[links[i].from].label + ' ("' + links[i - 1].key + '" and "' + links[i].key + '"). Keep one.');
          else if (i > 0 && links[i].from !== links[i - 1].to) err('rates.' + links[i].key, 'The rates must form one chain: "' + links[i - 1].key + '" ends at ' + STAGES[links[i - 1].to].label + ', but the next rate, "' + links[i].key + '", starts at ' + STAGES[links[i].from].label + '.');
        }
        if (!errs.length && links[links.length - 1].to !== STAGE_KEYS.length - 1) {
          var end = links[links.length - 1].to, more = [];
          for (var m = end; m < STAGE_KEYS.length - 1; m++) more.push('"' + rateKey(STAGE_KEYS[m], STAGE_KEYS[m + 1]) + '"');
          err('rates', 'The chain must end at wins: the last rate, "' + links[links.length - 1].key + '", ends at ' + STAGES[end].label + '. Add the rates from ' + STAGES[end].label + ' down to wins, such as ' + more.join(' and ') + '.');
        }
        if (!errs.length) {
          s.rates = {}; links.forEach(function (l) { s.rates[l.key] = l.rate; });
          s.chain = [links[0].from].concat(links.map(function (l) { return l.to; })).map(function (i) { return STAGE_KEYS[i]; });
          s.links = links.map(function (l) { return { key: l.key, from: STAGE_KEYS[l.from], to: STAGE_KEYS[l.to], rate: l.rate }; });
        }
      }
    }
  } else {
    s.rateSource = 'last period';
    if (!isObj(cfg.last)) err('last', '"last" must be an object of last period\'s counts, such as {"opps":120,"wins":30}.');
    else {
      var given = [];
      Object.keys(cfg.last).forEach(function (k) {
        var v = cfg.last[k];
        if (STAGE_KEYS.indexOf(k) < 0) { err('last.' + k, 'Unknown stage "' + k + '" in "last". Stages: ' + STAGE_KEYS.join(', ') + '.'); return; }
        if (!isNum(v)) { err('last.' + k, '"last.' + k + '" must be a number (got ' + JSON.stringify(v) + ').'); return; }
        if (v < 0 || v !== Math.floor(v) || v > BIG) { err('last.' + k, '"last.' + k + '" must be a whole number, 0 or more (got ' + v + ').'); return; }
      });
      if (!errs.length) {
        STAGE_KEYS.forEach(function (k) { if (cfg.last[k] != null) given.push(k); });
        if (given.indexOf('wins') < 0) err('last.wins', '"last" needs "wins": the plan works back from the wins the target takes.');
        else if (given.length < 2) err('last', '"last" needs at least two stages, such as "opps" and "wins", to give a rate.');
        else if (cfg.last.wins === 0) err('last.wins', '"last.wins" is 0: with no wins last period there is no win rate to plan from.');
        else {
          for (var g = 1; g < given.length; g++) {
            if (cfg.last[given[g]] > cfg.last[given[g - 1]]) { err('last.' + given[g], stageOf(given[g]).label + ' (' + cfg.last[given[g]] + ') is more than ' + stageOf(given[g - 1]).label + ' (' + cfg.last[given[g - 1]] + ') last period; each stage should be no larger than the one above it.'); break; }
          }
        }
        if (!errs.length) {
          s.last = {}; given.forEach(function (k) { s.last[k] = cfg.last[k]; });
          s.chain = given;
          s.links = [];
          for (var h = 0; h < given.length - 1; h++) s.links.push({ key: rateKey(given[h], given[h + 1]), from: given[h], to: given[h + 1], rate: cfg.last[given[h + 1]] / cfg.last[given[h]] });
        }
      }
    }
  }

  if (cfg.current != null) {
    if (!isObj(cfg.current)) err('current', '"current" must be an object of monthly volumes, such as {"leads":450,"opps":20}.');
    else {
      var cur = {};
      Object.keys(cfg.current).forEach(function (k) {
        var v = cfg.current[k];
        if (STAGE_KEYS.indexOf(k) < 0) { err('current.' + k, 'Unknown stage "' + k + '" in "current". Stages: ' + STAGE_KEYS.join(', ') + '.'); return; }
        if (s.chain && s.chain.indexOf(k) < 0) { err('current.' + k, '"current.' + k + '" is not a stage in your rates (' + s.chain.join(', ') + ').'); return; }
        if (!isNum(v)) { err('current.' + k, '"current.' + k + '" must be a number (got ' + JSON.stringify(v) + ').'); return; }
        if (v < 0 || v > BIG) { err('current.' + k, '"current.' + k + '" must be 0 or more (got ' + v + ').'); return; }
        cur[k] = v;
      });
      if (!Object.keys(cfg.current).length) err('current', '"current" is empty. Leave it out, or give at least one stage\'s monthly volume.');
      s.current = cur;
    }
  }

  if (errs.length) throw inputError(errs);
  return s;
}

function run(cfg) {
  var s = normalise(cfg);
  var money = function (v) { return s.currency + Math.round(v).toLocaleString('en-US'); };
  var expected = s.expected == null ? 0 : s.expected;
  var remaining = Math.max(0, s.target - expected);
  var winsExact = remaining / s.dealSize;
  var chain = s.chain, n = chain.length;
  var rateFrom = {};
  s.links.forEach(function (l) { rateFrom[l.from] = l.rate; });

  var exact = new Array(n), rounded = new Array(n);
  exact[n - 1] = winsExact; rounded[n - 1] = up(winsExact);
  for (var i = n - 2; i >= 0; i--) {
    exact[i] = exact[i + 1] / rateFrom[chain[i]];
    rounded[i] = up(rounded[i + 1] / rateFrom[chain[i]]);
  }

  var stages = chain.map(function (k, idx) {
    var st = stageOf(k);
    var row = {
      stage: k, label: st.label,
      rateToNext: idx < n - 1 ? rateFrom[k] : null,
      next: idx < n - 1 ? chain[idx + 1] : null,
      neededExact: tidy(exact[idx]), needed: rounded[idx],
      roundedUp: tidy(exact[idx]) !== rounded[idx],
      perMonth: tidy(rounded[idx] / s.periodMonths),
      lastCount: s.last ? s.last[k] : null,
      current: s.current && s.current[k] != null ? s.current[k] : null
    };
    if (row.current != null) {
      row.gap = tidy(row.perMonth - row.current);
      row.gapShare = row.perMonth > 0 ? tidy(Math.max(0, row.gap) / row.perMonth) : 0;
      row.status = row.gap > 0 ? 'short' : 'covered';
    }
    return row;
  });

  var out = {
    inputs: s, rateSource: s.rateSource, stages: stages,
    target: s.target, expected: s.expected, remaining: remaining,
    winsExact: tidy(winsExact), wins: rounded[n - 1],
    revenueFromRoundedWins: rounded[n - 1] * s.dealSize,
    covered: remaining === 0,
    largestGap: null, leadTime: null, notes: []
  };

  // Monthly gap: name the stage furthest short of its need, as a share of that need.
  if (s.current) {
    var withGap = stages.filter(function (r) { return r.current != null; });
    var max = 0;
    withGap.forEach(function (r) { if (r.gapShare > max) max = r.gapShare; });
    out.gapStages = withGap.map(function (r) { return r.stage; });
    if (max > 0) {
      var top = withGap.filter(function (r) { return r.gapShare === max; });
      out.largestGap = { stages: top.map(function (r) { return r.stage; }), labels: top.map(function (r) { return r.label; }), share: max };
    }
  }

  // Lead time: when the top of the funnel has to be created, as a statement, not a date.
  if (s.salesCycleDays != null) {
    var d = s.salesCycleDays, pd = Math.round(s.periodMonths * DAYS_PER_MONTH), topSt = stageOf(chain[0]);
    out.leadTime = {
      days: d, periodDays: pd, topStage: chain[0], cycleLongerThanPeriod: d >= pd,
      text: 'At a ' + d + '-day cycle from a new ' + topSt.one + ' to a win, the ' + topSt.many + ' behind this period\'s wins have to be created between ' +
        d + ' days before the period starts and ' + d + ' days before it ends (the period is about ' + pd + ' days, counting a month as 365/12 days). ' +
        (d >= pd ? 'The cycle is as long as the period or longer, so all of them have to be created before the period starts.'
          : topSt.label + ' created in the last ' + d + ' days of the period close after it ends.') +
        ' This treats every deal as taking the same ' + d + ' days; real cycles vary.'
    };
  }

  if (out.covered) out.notes.push('The revenue you expect from open pipeline (' + money(expected) + ') meets the target, so on these numbers no new pipeline is needed this period. Check that the expected figure is weighted, not the full value of every open deal.');
  else if (s.expected != null) out.notes.push('Revenue expected from open pipeline is your own figure and is subtracted as given. If it is the full value of open deals rather than a weighted forecast, the plan understates what is needed.');
  if (s.rateSource === 'last period') out.notes.push('Rates come from last period\'s counts at each stage. Deals that crossed from one period into the next make these rates approximate; a cohort view (what share of a period\'s leads became wins, however long it took) is more exact when you have it.');
  if (out.wins > 0 && out.revenueFromRoundedWins > remaining) out.notes.push('Rounded up to whole wins, ' + out.wins + ' wins at the average deal size bring in ' + money(out.revenueFromRoundedWins) + ', more than the ' + money(remaining) + ' still to win.');
  return out;
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const s = r.inputs, cur = s.currency;
  const money = (v) => cur + Math.round(v).toLocaleString('en-US');
  const count = (v) => Math.round(v).toLocaleString('en-US');
  const one = (v) => (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num = (v) => (Number.isInteger(v) ? count(v) : one(v));
  const pct = (v) => (Math.round(v * 1000) / 10).toFixed(1) + '%';
  const pad = (t, w) => (t + ' '.repeat(w)).slice(0, Math.max(w, t.length));
  const lpad = (t, w) => (' '.repeat(w) + t).slice(-Math.max(w, t.length));
  const L = [];
  L.push('REVENUE-TO-PIPELINE PLAN');
  L.push('═'.repeat(58));
  L.push(`Period                       ${s.period ? s.period + ', ' : ''}${s.periodMonths} month${s.periodMonths === 1 ? '' : 's'}`);
  L.push(`Revenue target               ${money(r.target)}`);
  if (r.expected != null) L.push(`Expected from open pipeline  ${money(r.expected)} (your figure)`);
  L.push(`New revenue still to win     ${money(r.remaining)}`);
  L.push(`Average deal size            ${money(s.dealSize)}`);
  L.push(`Rates                        ${r.rateSource === 'entered' ? 'as you entered them' : "from last period's counts"}`);
  L.push('');
  L.push(pad('STAGE', 15) + lpad('RATE ON', 9) + lpad('EXACT', 12) + lpad('NEEDED', 10) + lpad('PER MONTH', 11));
  r.stages.forEach((row) => {
    L.push(pad(row.label, 15) + lpad(row.rateToNext == null ? '-' : pct(row.rateToNext), 9) + lpad(one(row.neededExact), 12) + lpad(count(row.needed), 10) + lpad(one(row.perMonth), 11));
  });
  L.push('');
  L.push('  RATE ON is the rate from each stage to the next one listed.');
  L.push('  Counts round up at each stage, from the whole number below it:');
  L.push('  you cannot win 0.4 of a deal. EXACT is before rounding.');
  L.push('  PER MONTH is the rounded count spread evenly over the period.');
  if (r.rateSource === 'last period') {
    L.push('');
    L.push('LAST PERIOD');
    L.push('  ' + r.stages.map((row) => `${row.label} ${count(row.lastCount)}`).join(' > '));
  }
  if (r.gapStages) {
    L.push('');
    L.push('MONTHLY GAP (need per month vs what you produce per month now)');
    r.stages.filter((row) => row.current != null).forEach((row) => {
      L.push('  ' + pad(row.label, 15) + `need ${num(row.perMonth)}, have ${num(row.current)}: ` +
        (row.status === 'short' ? `short ${num(row.gap)} (${pct(row.gapShare)} of need)` : 'covered'));
    });
    L.push(r.largestGap ? `  Largest gap for its size: ${r.largestGap.labels.join(' and ')} (${pct(r.largestGap.share)} short)`
      : '  Every stage you gave meets or beats its monthly need.');
  }
  if (r.leadTime) {
    L.push('');
    L.push('LEAD TIME');
    wrap(r.leadTime.text, 70).forEach((x) => L.push('  ' + x));
  }
  const notes = r.notes;
  if (notes.length) {
    L.push('');
    L.push('NOTES');
    notes.forEach((n) => wrap(n, 70).forEach((x, i) => L.push((i ? '    ' : '  - ') + x)));
  }
  return L.join('\n');
}
function wrap(text, w) {
  const out = []; let line = '';
  text.split(' ').forEach((word) => {
    if (line && (line + ' ' + word).length > w) { out.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  });
  if (line) out.push(line);
  return out;
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional; every number here is invented for the demo.
const DEMO = {
  period: 'Q1 2027', target: 600000, dealSize: 25000, periodMonths: 3, expected: 120000,
  last: { leads: 2400, mqls: 840, sqls: 300, opps: 120, wins: 30 },
  salesCycleDays: 75,
  current: { leads: 450, mqls: 160, sqls: 70, opps: 20 },
};

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    return;
  }
  let cfg;
  if (argv.length === 0 || argv.includes('--demo')) {
    cfg = DEMO;
    console.log('(no config - demo: Example Co., a fictional company, with invented numbers)\n');
  } else {
    try { cfg = JSON.parse(argv[0]); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    e.errors.forEach((x) => console.error('error: ' + x.message));
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, render, normalise, STAGES, RATE_KEYS };
