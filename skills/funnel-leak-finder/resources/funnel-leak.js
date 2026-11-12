#!/usr/bin/env node
/*
 * AAJ Funnel Leak Finder - engine
 * Part of the "funnel-leak-finder" Agent Skill.
 *
 * Names the funnel stage that cost the most wins this period, measured against
 * a baseline the user gives: last period's counts, or target rates per stage.
 * It never names a leak from raw drop-off. The biggest percentage drop is
 * almost always the top of the funnel, and in a multiplicative funnel a 10%
 * relative lift at any stage gives the same 10% more wins, so raw drop-off
 * says nothing about where wins were lost. Without a baseline the engine shows
 * the stage rates and says no leak can be named.
 *
 * USAGE
 *   node funnel-leak.js                    # demo (Example Co., invented numbers)
 *   node funnel-leak.js '<json-config>'    # your own
 *   node funnel-leak.js --help
 *
 * CONFIG (JSON) - this period's counts, plus ONE baseline: prior or targets.
 * Stage fields are the marketing-report names, in this order: sessions, leads,
 * mqls, sqls, opps, wins. Give at least 3, consecutive (no gaps), as whole numbers.
 *
 *   {
 *     "period": "Q3 2026",                 // optional label
 *     "sessions": 120000, "leads": 3000, "mqls": 1050, "sqls": 252, "opps": 126, "wins": 28,
 *     "revenuePerWin": 18000,              // optional: new revenue per win (needs wins as the last stage)
 *     "currency": "$",                     // optional
 *
 *     "prior": {                           // baseline (a): last period's counts, the same stages
 *       "period": "Q2 2026",
 *       "sessions": 110000, "leads": 2860, "mqls": 1001, "sqls": 320, "opps": 150, "wins": 36
 *     },
 *     // or
 *     "targets": {                         // baseline (b): your target rate per transition, as fractions
 *       "sessionsToLeads": 0.026, "leadsToMqls": 0.35, "mqlsToSqls": 0.3, "sqlsToOpps": 0.45, "oppsToWins": 0.25
 *     },
 *     "targetSource": "2026 operating plan" // optional: where the targets come from (recorded as given)
 *   }
 *
 * HOW A LEAK IS NAMED
 *   For each transition (one stage to the next): rate now = next / this.
 *   Wins lost at a stage = what the last stage would have been with that one
 *   stage at its baseline rate, holding the top-of-funnel count and every other
 *   stage at this period's rates, minus what it was. Stages at or above
 *   baseline are holding. The stage with the most wins lost is the leak. Each
 *   stage's figure holds the others still, so the figures do not add up to
 *   the total change.
 *
 * IS THE CHANGE REAL? (the noise check)
 *   Against a prior period: two-proportion z-test, pooled (NIST/SEMATECH
 *   e-Handbook of Statistical Methods, section 7.3.3). Against a target: one-
 *   proportion z-test (section 7.2.4). A change is "may be noise" when |z| is
 *   below 1.96 (95%, two-sided), or when the counts are too small for the test:
 *   fewer than 5 conversions or 5 non-conversions in either period (for a
 *   target, n x target or n x (1 - target) below 5, NIST 7.2.4's condition).
 *   The 95% level and applying the 5-count condition to both periods are AAJ's
 *   choices.
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
// The stage names and order are the marketing-report skill's. No rates or benchmarks live here:
// every rate the engine judges against comes from the user's prior period or the user's targets.
var STAGES = [['sessions', 'Sessions'], ['leads', 'Leads'], ['mqls', 'MQLs'], ['sqls', 'SQLs'], ['opps', 'Opportunities'], ['wins', 'Wins']];
var STAGE_KEYS = STAGES.map(function (s) { return s[0]; });
var MIN_STAGES = 3;
var Z_CRIT = 1.96;   // AAJ's choice: 95%, two-sided
var MIN_COUNT = 5;   // NIST 7.2.4's condition for the normal approximation; AAJ applies it to both periods
var SOURCES = {
  twoProportion: { who: 'NIST/SEMATECH e-Handbook of Statistical Methods', title: '7.3.3. How can we determine whether two processes produce the same proportion of defectives?', url: 'https://www.itl.nist.gov/div898/handbook/prc/section3/prc33.htm' },
  oneProportion: { who: 'NIST/SEMATECH e-Handbook of Statistical Methods', title: '7.2.4. Does the proportion of defectives meet requirements?', url: 'https://www.itl.nist.gov/div898/handbook/prc/section2/prc24.htm' }
};
var FIELDS = ['period'].concat(STAGE_KEYS, ['revenuePerWin', 'currency', 'prior', 'targets', 'targetSource']);
var PRIOR_FIELDS = ['period'].concat(STAGE_KEYS);

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function transitionKey(a, b) { return a + 'To' + cap(b); }
var TRANSITION_KEYS = [];
for (var ti = 1; ti < STAGE_KEYS.length; ti++) TRANSITION_KEYS.push(transitionKey(STAGE_KEYS[ti - 1], STAGE_KEYS[ti]));
function labelOf(k) { return STAGES[STAGE_KEYS.indexOf(k)][1]; }
// The last stage's name inside a sentence ("9.3 more wins", "62.5 more MQLs").
var UNITS = { sessions: 'sessions', leads: 'leads', mqls: 'MQLs', sqls: 'SQLs', opps: 'opportunities', wins: 'wins' };

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function tidy(v) { return Math.round(v * 1e9) / 1e9; }

// Reads the stage counts of one block (this period, or prior). Returns [{key,label,count}] in order.
function readStages(c, where) {
  var got = [];
  STAGE_KEYS.forEach(function (k) {
    if (c[k] == null) return;
    var v = c[k];
    if (!isNum(v)) throw inputError(where + '"' + k + '" must be a number (got ' + JSON.stringify(v) + ').');
    if (v < 0 || Math.floor(v) !== v) throw inputError(where + '"' + k + '" must be a whole number, 0 or more (got ' + v + ').', 'Stage counts are counts of people or deals.');
    got.push({ key: k, label: labelOf(k), count: v });
  });
  if (got.length < MIN_STAGES) throw inputError(where + 'Give at least ' + MIN_STAGES + ' funnel stages (got ' + got.length + ').', 'Stages, in order: ' + STAGE_KEYS.join(', ') + '.');
  for (var i = 1; i < got.length; i++) {
    var a = STAGE_KEYS.indexOf(got[i - 1].key), b = STAGE_KEYS.indexOf(got[i].key);
    if (b !== a + 1) throw inputError(where + 'Stages must be consecutive: "' + got[i - 1].key + '" is followed by "' + got[i].key + '" but "' + STAGE_KEYS.slice(a + 1, b).join('", "') + '" is missing.', 'Stages, in order: ' + STAGE_KEYS.join(', ') + '. Give a run of them with no gaps.');
    if (got[i].count > got[i - 1].count) throw inputError(where + got[i].label + ' (' + got[i].count + ') is more than ' + got[i - 1].label + ' (' + got[i - 1].count + '); each stage must be no larger than the one before it.');
    if (got[i - 1].count === 0) throw inputError(where + got[i - 1].label + ' is 0, so the rate to ' + got[i].label + ' cannot be computed.', 'Every stage except the last must be above 0.');
  }
  return got;
}
function readLabel(c, k, where) {
  if (c[k] == null) return null;
  if (typeof c[k] !== 'string') throw inputError(where + '"' + k + '" must be text (got ' + JSON.stringify(c[k]) + ').');
  return c[k].trim().slice(0, 120) || null;
}
function checkFields(c, allowed, where) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw inputError(where ? where.replace(/: $/, '') + ' must be a JSON object.' : 'The config must be a JSON object.');
  Object.keys(c).forEach(function (k) {
    if (allowed.indexOf(k) < 0) throw inputError(where + 'Unknown field "' + k + '".', 'Allowed: ' + allowed.join(', ') + '.');
  });
}

function normalise(cfg) {
  checkFields(cfg, FIELDS, '');
  var s = { period: readLabel(cfg, 'period', ''), stages: readStages(cfg, ''), revenuePerWin: null,
    currency: cfg.currency == null ? '$' : String(cfg.currency).slice(0, 4), prior: null, targets: null, targetSource: null };
  if (cfg.revenuePerWin != null) {
    if (!isNum(cfg.revenuePerWin) || cfg.revenuePerWin < 0) throw inputError('"revenuePerWin" must be a number, 0 or more (got ' + JSON.stringify(cfg.revenuePerWin) + ').');
    if (s.stages[s.stages.length - 1].key !== 'wins') throw inputError('"revenuePerWin" needs "wins" as the last stage you give.', 'Without wins, the engine counts what is lost in your last stage, not in wins.');
    s.revenuePerWin = cfg.revenuePerWin;
  }
  if (cfg.prior != null && cfg.targets != null) throw inputError('Give one baseline: "prior" or "targets", not both.', 'Run the engine twice to compare against each.');
  if (cfg.targetSource != null && cfg.targets == null) throw inputError('"targetSource" describes "targets"; give the targets too, or leave it out.');
  var keys = s.stages.map(function (x) { return x.key; });
  if (cfg.prior != null) {
    checkFields(cfg.prior, PRIOR_FIELDS, 'prior: ');
    var p = readStages(cfg.prior, 'prior: ');
    var pk = p.map(function (x) { return x.key; });
    if (pk.join() !== keys.join()) throw inputError('prior: give the same stages as this period (' + keys.join(', ') + '); got ' + pk.join(', ') + '.');
    s.prior = { period: readLabel(cfg.prior, 'period', 'prior: '), stages: p };
  }
  if (cfg.targets != null) {
    var allowedT = [];
    for (var i = 1; i < keys.length; i++) allowedT.push(transitionKey(keys[i - 1], keys[i]));
    if (!cfg.targets || typeof cfg.targets !== 'object' || Array.isArray(cfg.targets)) throw inputError('"targets" must be a JSON object of target rates, such as {"mqlsToSqls": 0.3}.');
    var t = {};
    Object.keys(cfg.targets).forEach(function (k) {
      if (allowedT.indexOf(k) < 0) throw inputError('targets: unknown or unused transition "' + k + '".', 'For the stages you gave, the transitions are: ' + allowedT.join(', ') + '.');
      var v = cfg.targets[k];
      if (!isNum(v) || v <= 0 || v > 1) throw inputError('targets: "' + k + '" must be a rate above 0 and up to 1 (got ' + JSON.stringify(v) + ').', 'Write 30% as 0.3.');
      t[k] = v;
    });
    if (!Object.keys(t).length) throw inputError('"targets" is empty.', 'Give a target rate for at least one of: ' + allowedT.join(', ') + '.');
    s.targets = t;
    s.targetSource = readLabel(cfg, 'targetSource', '');
  }
  return s;
}

// The noise check. Returns { test, z, verdict: 'clear' | 'may-be-noise', reason }.
function noiseVsPrior(x1, n1, x2, n2) {
  var r = { test: 'two-proportion z-test', z: null, source: 'twoProportion' };
  if (Math.min(x1, n1 - x1, x2, n2 - x2) < MIN_COUNT) { r.verdict = 'may-be-noise'; r.reason = 'too-few'; return r; }
  var p = (x1 + x2) / (n1 + n2);
  r.z = tidy((x1 / n1 - x2 / n2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)));
  r.verdict = Math.abs(r.z) < Z_CRIT ? 'may-be-noise' : 'clear'; r.reason = r.verdict === 'clear' ? 'significant' : 'not-significant';
  return r;
}
function noiseVsTarget(x, n, p0) {
  var r = { test: 'one-proportion z-test', z: null, source: 'oneProportion' };
  if (Math.min(n * p0, n * (1 - p0)) < MIN_COUNT) { r.verdict = 'may-be-noise'; r.reason = 'too-few'; return r; }
  r.z = tidy((x / n - p0) / Math.sqrt(p0 * (1 - p0) / n));
  r.verdict = Math.abs(r.z) < Z_CRIT ? 'may-be-noise' : 'clear'; r.reason = r.verdict === 'clear' ? 'significant' : 'not-significant';
  return r;
}

// Display helpers, shared by the CLI and any page that runs this engine, so both print the same figures.
function fmtRate(r) { var v = r * 100; return (v < 1 && v > 0 ? v.toFixed(2) : v.toFixed(1)) + '%'; }
function fmtPts(d) { var v = d * 100, a = Math.abs(v); return (v > 0 ? '+' : v < 0 ? '-' : '') + (a < 1 && a > 0 ? a.toFixed(2) : a.toFixed(1)) + ' pts'; }
function fmtRel(x) { if (x === null) return 'n/a'; var v = x * 100; return (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1) + '%'; }
function fmtCount(v) { return (Math.round(v * 10) / 10).toLocaleString('en-US'); }
function fmtMoney(v, cur) { return (v < 0 ? '-' : '') + (cur == null ? '$' : cur) + Math.round(Math.abs(v)).toLocaleString('en-US'); }

function run(cfg) {
  var s = normalise(cfg);
  var st = s.stages, last = st[st.length - 1];
  var out = { inputs: s, period: s.period, stages: st, outcome: { key: last.key, label: last.label, unit: UNITS[last.key], count: last.count },
    baseline: s.prior ? 'prior' : s.targets ? 'targets' : null,
    baselineLabel: s.prior ? (s.prior.period || 'the prior period') : s.targets ? (s.targetSource ? 'your targets (' + s.targetSource + ')' : 'your targets') : null,
    targetSource: s.targetSource, transitions: [], leak: null, firmLeak: null, volume: null, notes: [], view: [], sources: SOURCES,
    rules: { Z_CRIT: Z_CRIT, MIN_COUNT: MIN_COUNT, MIN_STAGES: MIN_STAGES } };

  var rates = [];
  for (var i = 1; i < st.length; i++) rates.push(st[i].count / st[i - 1].count);
  st.forEach(function (x, j) { if (s.prior) x.priorCount = s.prior.stages[j].count; });

  for (i = 1; i < st.length; i++) {
    var a = st[i - 1], b = st[i], k = transitionKey(a.key, b.key), r = rates[i - 1];
    var t = { key: k, from: a.key, to: b.key, fromLabel: a.label, toLabel: b.label, fromCount: a.count, toCount: b.count, rate: r,
      baselineRate: null, changePts: null, changeRel: null, status: 'no-baseline', lost: null, revenueLost: null, noise: null, rank: null };
    if (s.prior) {
      var pa = s.prior.stages[i - 1].count, pb = s.prior.stages[i].count;
      t.baselineRate = pb / pa; t.baselineFrom = pa; t.baselineTo = pb;
      t.noise = noiseVsPrior(b.count, a.count, pb, pa);
    } else if (s.targets && s.targets[k] != null) {
      t.baselineRate = s.targets[k];
      t.noise = noiseVsTarget(b.count, a.count, t.baselineRate);
    }
    if (t.baselineRate !== null) {
      t.changePts = tidy(r - t.baselineRate);
      t.changeRel = t.baselineRate > 0 ? tidy(r / t.baselineRate - 1) : null;
      if (r >= t.baselineRate) { t.status = 'holding'; t.lost = 0; }
      else {
        // The last stage with this one stage at baseline and every other stage as it is now.
        var counterfactual = st[0].count;
        for (var j = 0; j < rates.length; j++) counterfactual *= (j === i - 1 ? t.baselineRate : rates[j]);
        t.lost = tidy(counterfactual - last.count);
        // Below baseline but costing nothing: a later stage converted none, so no rate here changes the outcome.
        t.status = t.lost > 0 ? 'leaking' : 'below-no-effect';
        if (s.revenuePerWin !== null) t.revenueLost = tidy(t.lost * s.revenuePerWin);
      }
    }
    out.transitions.push(t);
  }

  if (!out.baseline) {
    out.verdict = { level: 'no-baseline', headline: 'No leak named', text: 'No leak can be named without a baseline. Raw drop-off cannot name one: each stage\'s rate has its own scale, and a 10% relative lift at any stage gives the same 10% more ' + UNITS[last.key] + '. Add last period\'s counts ("prior") or your target rates ("targets") to see which stage cost you ' + UNITS[last.key] + '.' };
    return out;
  }

  var judged = out.transitions.filter(function (t) { return t.status !== 'no-baseline'; });
  var leaking = judged.filter(function (t) { return t.status === 'leaking'; });
  // Rank by what each shortfall cost in the last stage; ties go to the earlier stage.
  leaking.sort(function (x, y) { return y.lost - x.lost || TRANSITION_KEYS.indexOf(x.key) - TRANSITION_KEYS.indexOf(y.key); });
  leaking.forEach(function (t, n) { t.rank = n + 1; });
  var unit = UNITS[last.key];
  if (s.targets) {
    var missing = out.transitions.filter(function (t) { return t.status === 'no-baseline'; }).map(function (t) { return t.key; });
    if (missing.length) out.notes.push('No target for ' + missing.join(', ') + ': ' + (missing.length > 1 ? 'those stages are' : 'that stage is') + ' shown but not judged, so ' + (missing.length > 1 ? 'they' : 'it') + ' cannot be named as the leak.');
  }

  if (s.prior) {
    var top = st[0], pTop = s.prior.stages[0].count;
    var atCurrent = 1; rates.forEach(function (x) { atCurrent *= x; });
    out.volume = { key: top.key, label: top.label, count: top.count, priorCount: pTop, changeRel: pTop > 0 ? tidy(top.count / pTop - 1) : null,
      effect: tidy((top.count - pTop) * atCurrent) };
    if (top.count < pTop) out.notes.push(top.label + ' fell from ' + fmtCount(pTop) + ' to ' + fmtCount(top.count) + ': at this period\'s rates that is ' + fmtCount(-out.volume.effect) + ' fewer ' + unit + '. That is volume, not conversion, so it is not ranked as a leak.');
  }

  var below = judged.filter(function (t) { return t.status === 'below-no-effect'; });
  if (!leaking.length && below.length) {
    out.verdict = { level: 'no-effect', headline: 'No leak ranked', text: below.map(function (t) { return t.fromLabel + ' to ' + t.toLabel; }).join(', ') + (below.length > 1 ? ' are' : ' is') + ' below baseline, but a later stage converted none, so raising ' + (below.length > 1 ? 'them' : 'it') + ' alone would add no ' + unit + '. Look at the stage that converted none first.' };
  } else if (!leaking.length) {
    out.verdict = { level: 'holding', headline: 'No leak', text: 'Every stage you gave a baseline for is at or above ' + out.baselineLabel + '.' };
  } else {
    var L = leaking[0];
    out.leak = L.key;
    var firm = leaking.filter(function (t) { return t.noise && t.noise.verdict === 'clear'; })[0] || null;
    out.firmLeak = firm ? firm.key : null;
    var money = L.revenueLost !== null ? ' (' + fmtMoney(L.revenueLost, s.currency) + ')' : '';
    var against = s.prior ? fmtRate(L.baselineRate) + ' in ' + out.baselineLabel : 'your target of ' + fmtRate(L.baselineRate) + (s.targetSource ? ' (' + s.targetSource + ')' : '');
    var txt = L.fromLabel + ' to ' + L.toLabel + ' converted at ' + fmtRate(L.rate) + ' against ' + against + '. At the baseline rate, with every other stage as it is, this period would have had ' + fmtCount(L.lost) + ' more ' + unit + money + '.';
    if (L.noise.verdict === 'may-be-noise') {
      txt += ' The change may be noise (' + (L.noise.reason === 'too-few' ? 'too few to test' : 'not significant at 95%') + '): confirm it next period before acting.';
      if (firm) txt += ' The largest shortfall that clears the noise check is ' + firm.fromLabel + ' to ' + firm.toLabel + ' (' + fmtCount(firm.lost) + ' ' + unit + ').';
    }
    out.verdict = { level: L.noise.verdict === 'clear' ? 'leak' : 'leak-may-be-noise', headline: 'Leak: ' + L.fromLabel + ' to ' + L.toLabel, text: txt };
    if (leaking.length > 1) out.notes.push('Each stage\'s figure holds the other stages at this period\'s rates, so the figures do not add up to the total change.');
  }
  if (out.leak) out.view.push('In AAJ\'s view, fix the named leak before adding volume at the top: more volume through a stage that is below baseline buys fewer ' + unit + ' per unit of spend than it did at baseline.');
  out.view.push(s.prior
    ? 'The noise check uses 95% (two-sided) and needs at least ' + MIN_COUNT + ' conversions and ' + MIN_COUNT + ' non-conversions in each period; those cut-offs are AAJ\'s choice.'
    : 'The noise check uses 95% (two-sided) and needs the stage count times the target, and times one minus the target, to be at least ' + MIN_COUNT + ' (NIST 7.2.4); the 95% level is AAJ\'s choice.');
  return out;
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const cur = r.inputs.currency;
  const unit = r.outcome.unit;
  const L = [];
  L.push('FUNNEL LEAK FINDER' + (r.period ? ' - ' + r.period : ''));
  L.push('═'.repeat(58));
  L.push(r.baseline ? 'Baseline: ' + r.baselineLabel : 'Baseline: none');
  L.push('');
  L.push('STAGES');
  r.stages.forEach((s) => L.push('  ' + (s.label + ':').padEnd(16) + fmtCount(s.count).padStart(10) + (s.priorCount != null ? '   (prior ' + fmtCount(s.priorCount) + ')' : '')));
  L.push('');
  L.push('TRANSITIONS');
  r.transitions.forEach((t) => {
    const name = (t.fromLabel + ' -> ' + t.toLabel).padEnd(26);
    if (t.status === 'no-baseline') { L.push('  ' + name + fmtRate(t.rate).padStart(8) + '   no baseline'); return; }
    const z = t.noise.reason === 'too-few' ? 'too few to test' : 'z ' + t.noise.z.toFixed(2) + (t.noise.verdict === 'clear' || t.status === 'holding' ? '' : ', may be noise');
    L.push('  ' + name + fmtRate(t.rate).padStart(8) + ' vs ' + fmtRate(t.baselineRate).padStart(7) + '  ' + fmtPts(t.changePts) + ' (' + fmtRel(t.changeRel) + ')');
    if (t.status === 'holding') L.push('      holding' + ' [' + z + ']');
    else if (t.status === 'below-no-effect') L.push('      below baseline, 0 ' + unit + ' lost: a later stage converted none [' + z + ']');
    else L.push('      ' + fmtCount(t.lost) + ' ' + unit + ' lost' + (t.revenueLost !== null ? ', ' + fmtMoney(t.revenueLost, cur) : '') + '  #' + t.rank + ' [' + z + ']');
  });
  L.push('');
  if (r.volume) L.push(r.volume.label + ' (volume, not ranked): ' + fmtCount(r.volume.count) + ' vs ' + fmtCount(r.volume.priorCount) + ' (' + fmtRel(r.volume.changeRel) + ')');
  if (r.volume) L.push('');
  L.push('RESULT: ' + r.verdict.headline);
  L.push('  ' + r.verdict.text);
  if (r.notes.length) { L.push(''); L.push('NOTES'); r.notes.forEach((n) => L.push('  - ' + n)); }
  if (r.view.length) { L.push(''); L.push("AAJ'S VIEW"); r.view.forEach((n) => L.push('  - ' + n)); }
  if (r.baseline) {
    const s = r.baseline === 'prior' ? r.sources.twoProportion : r.sources.oneProportion;
    L.push('');
    L.push('NOISE CHECK SOURCE');
    L.push('  ' + s.who + ', "' + s.title + '": ' + s.url);
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional; every number here is invented for the demo.
const DEMO = {
  period: 'Q3 2026', sessions: 120000, leads: 3000, mqls: 1050, sqls: 252, opps: 126, wins: 28, revenuePerWin: 18000,
  prior: { period: 'Q2 2026', sessions: 110000, leads: 2860, mqls: 1001, sqls: 320, opps: 150, wins: 36 },
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
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, render, normalise, SOURCES, fmtRate, fmtPts, fmtRel, fmtCount, fmtMoney };
