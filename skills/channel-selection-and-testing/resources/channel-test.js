#!/usr/bin/env node
/*
 * AAJ Channel Test Budget - engine
 * Part of the "channel-selection-and-testing" Agent Skill.
 *
 * How much to spend, and for how long, before judging a new acquisition
 * channel - and the rule for stopping early. AAJ's position: most channel
 * tests are judged on too little data, and most "it didn't work" verdicts are
 * really "we stopped before it could tell". The engine sizes the test from your
 * own cost per click and conversion rates, reads it on leads (customers arrive
 * too slowly to judge a test on), and gives a stop rule worked out in advance.
 * Give it several candidate channels and it ranks them by what each costs to judge.
 *
 * USAGE
 *   node channel-test.js                    # demo (Example Co., invented numbers)
 *   node channel-test.js '<json-config>'    # your own
 *   node channel-test.js --help
 *
 * CONFIG (JSON) - money in one currency; rates as fractions (0.03 = 3%)
 *
 *   {
 *     "targetCpa": 3000,            // the most you will pay to win one customer (> 0)
 *     "weeklyBudget": 2500,         // what you can spend on the test each week (> 0)
 *     "leadToCustomer": 0.10,       // share of leads that become customers; per channel overrides it
 *     "testBudget": 20000,          // optional: the most you will spend on the test in total
 *     "salesCycleDays": 45,         // optional: days from first click to a closed customer (default 0)
 *     "maxWeeks": 12,               // optional: the longest you will run the test (default 12)
 *     "minWeeks": 2,                // optional: the shortest run you will judge (default 2)
 *     "precision": 0.3,             // optional: how close the read must be, 0.3 = within ±30% (default)
 *     "confidence": 0.9,            // optional: 0.8 to 0.99 (default 0.9)
 *     "currency": "$",              // optional: symbol for the output
 *     "channels": [                 // 1 to 6 candidates
 *       { "name": "LinkedIn Ads",
 *         "cpc": 9,                 // cost per click, OR "cpm" with "ctr" (cpc = cpm / (1000 x ctr))
 *         "clickToLead": 0.02,      // share of clicks that become a lead you can count during the test
 *         "leadToCustomer": 0.08,   // optional: this channel's own rate
 *         "progress": {             // optional: a test already running
 *           "spent": 4200, "leads": 5, "customers": 0 } }
 *     ]
 *   }
 *
 *   A "lead" is the first conversion you can count within days: a demo
 *   request, a trial start, a qualified sign-up. Pick one that tracks customers.
 *
 * OUTPUT
 *   Per channel: expected cost per lead and per customer on your own numbers,
 *   the leads the read needs, the spend and weeks to get them, what a
 *   customer-level read would take, a stop table, a verdict and options.
 *   Across channels: a ranking by cost to judge, and which to test first.
 *   With "progress": stop, ahead of target, read complete, or keep going.
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
// Rules of this engine, stated where they are used so a reader can argue with them.
// These are AAJ's defaults, not industry benchmarks; every one can be overridden.
var DEFAULT_PRECISION = 0.3;   // read cost per lead to within ±30% on both sides
var DEFAULT_CONFIDENCE = 0.9;  // at 90% confidence; also caps the chance of a false stop or a false "ahead" across all weekly checks
var DEFAULT_MIN_WEEKS = 2;     // so every day of the week is seen at least twice
var DEFAULT_MAX_WEEKS = 12;    // a quarter: AAJ's view of the longest a test stays comparable
var MAX_CHANNELS = 6;
var MAX_STOP_ROWS = 6;
var CLOSE_COST = 0.10;         // two channels within 10% on cost to judge: prefer the one with more room under target
var LEVEL_ORDER = { testable: 0, slow: 1, 'over-budget': 2, 'misses-on-paper': 3 };

var TOP_FIELDS = ['channels', 'targetCpa', 'weeklyBudget', 'leadToCustomer', 'testBudget', 'salesCycleDays',
  'maxWeeks', 'minWeeks', 'precision', 'confidence', 'currency'];
var CHANNEL_FIELDS = ['name', 'cpc', 'cpm', 'ctr', 'clickToLead', 'leadToCustomer', 'progress'];
var PROGRESS_FIELDS = ['spent', 'leads', 'customers'];

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function unknownFields(obj, allowed, where) {
  Object.keys(obj).forEach(function (k) {
    if (allowed.indexOf(k) < 0) throw inputError('Unknown field "' + k + '"' + where + '.', 'Allowed: ' + allowed.join(', ') + '.');
  });
}
function rate(v, label, allowZero) {
  if (!isNum(v) || v > 1 || (allowZero ? v < 0 : v <= 0)) {
    throw inputError(label + ' must be a fraction between 0 and 1 (got ' + JSON.stringify(v) + ').', 'Write 3% as 0.03.');
  }
  return v;
}
function positive(v, label) {
  if (!isNum(v) || v <= 0) throw inputError(label + ' must be a number above 0 (got ' + JSON.stringify(v) + ').');
  return v;
}

// Inverse of the standard normal CDF (Acklam's rational approximation).
function normInv(p) {
  var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  var q, r;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// log Gamma (Lanczos, g = 7, n = 9).
function logGamma(x) {
  var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1; var a = c[0], t = x + 7.5, i;
  for (i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// Regularized upper incomplete gamma Q(a, x) (series or continued fraction, Numerical Recipes 6.2).
function gammaQ(a, x) {
  if (x <= 0) return 1;
  var gln = logGamma(a), i;
  if (x < a + 1) {
    var ap = a, sum = 1 / a, del = sum;
    for (i = 0; i < 100000; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  var b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d, an, del2;
  for (i = 1; i < 100000; i++) {
    an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; del2 = d * c; h *= del2; if (Math.abs(del2 - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - gln) * h);
}
// P(X <= x) for X ~ Poisson(lambda), exactly: Q(x + 1, lambda). Fast for any x.
function poissonCdf(x, lambda) {
  if (x < 0) return 0;
  if (lambda <= 0) return 1;
  return gammaQ(x + 1, lambda);
}
// The mean at which seeing x or fewer events has probability p: the exact
// one-sided upper bound on a Poisson mean (x = 0 gives -ln p).
function poissonUpper(x, p) {
  var lo = 0, hi = x + 10 + 10 * Math.sqrt(x + 1), i;
  while (poissonCdf(x, hi) > p) hi *= 2;
  for (i = 0; i < 100; i++) { var mid = (lo + hi) / 2; if (poissonCdf(x, mid) > p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
// The mean at which seeing x or more events has probability p: the exact
// one-sided lower bound (0 when x = 0).
function poissonLower(x, p) {
  if (x <= 0) return 0;
  var lo = 0, hi = x, i;
  for (i = 0; i < 100; i++) { var mid = (lo + hi) / 2; if (1 - poissonCdf(x - 1, mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// How far the cost-per-lead read can be off with n leads, on the worse side:
// cost per lead is spend / leads, so its range is lopsided (wider above).
// Exact two-sided Poisson interval at the given confidence.
function precisionFor(n, confidence) {
  if (n < 1) return Infinity;
  var tail = (1 - confidence) / 2;
  return Math.max(n / poissonLower(n, tail) - 1, 1 - n / poissonUpper(n, tail));
}
// The fewest leads that read cost per lead within ±precision on both sides.
function leadsFor(precision, confidence) {
  var z = normInv(1 - (1 - confidence) / 2);
  var lo = 1, hi = Math.ceil(4 * Math.pow(z / precision, 2)) + 20;
  while (precisionFor(hi, confidence) > precision) hi *= 2;
  while (lo < hi) { var mid = Math.floor((lo + hi) / 2); if (precisionFor(mid, confidence) <= precision) hi = mid; else lo = mid + 1; }
  return lo;
}

function normalise(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw inputError('The config must be a JSON object.');
  unknownFields(cfg, TOP_FIELDS, '');
  var s = {
    targetCpa: positive(cfg.targetCpa, '"targetCpa"'),
    weeklyBudget: positive(cfg.weeklyBudget, '"weeklyBudget"'),
    testBudget: cfg.testBudget == null ? null : positive(cfg.testBudget, '"testBudget"'),
    salesCycleDays: cfg.salesCycleDays == null ? 0 : cfg.salesCycleDays,
    maxWeeks: cfg.maxWeeks == null ? DEFAULT_MAX_WEEKS : cfg.maxWeeks,
    minWeeks: cfg.minWeeks == null ? DEFAULT_MIN_WEEKS : cfg.minWeeks,
    precision: cfg.precision == null ? DEFAULT_PRECISION : cfg.precision,
    confidence: cfg.confidence == null ? DEFAULT_CONFIDENCE : cfg.confidence,
    currency: cfg.currency == null ? '$' : String(cfg.currency).slice(0, 4)
  };
  if (!isNum(s.salesCycleDays) || s.salesCycleDays < 0) throw inputError('"salesCycleDays" must be 0 or more.');
  if (!isNum(s.maxWeeks) || s.maxWeeks < 1 || s.maxWeeks > 104) throw inputError('"maxWeeks" must be between 1 and 104.');
  if (!isNum(s.minWeeks) || s.minWeeks < 1 || s.minWeeks > s.maxWeeks) throw inputError('"minWeeks" must be at least 1 and no more than "maxWeeks".');
  if (!isNum(s.precision) || s.precision < 0.05 || s.precision > 0.9) throw inputError('"precision" must be between 0.05 and 0.9 (0.3 = within ±30%).');
  if (!isNum(s.confidence) || s.confidence < 0.8 || s.confidence > 0.99) throw inputError('"confidence" must be between 0.8 and 0.99.');
  if (cfg.leadToCustomer != null) rate(cfg.leadToCustomer, '"leadToCustomer"');
  if (!Array.isArray(cfg.channels) || !cfg.channels.length) throw inputError('Give "channels": a list of 1 to ' + MAX_CHANNELS + ' candidate channels.');
  if (cfg.channels.length > MAX_CHANNELS) throw inputError('At most ' + MAX_CHANNELS + ' channels at once (got ' + cfg.channels.length + ').');
  var names = {}, given = {};
  cfg.channels.forEach(function (ch) { if (ch && ch.name != null && ch.name !== '') given[String(ch.name)] = true; });
  s.channels = cfg.channels.map(function (ch, i) {
    if (!ch || typeof ch !== 'object' || Array.isArray(ch)) throw inputError('channels[' + i + '] must be an object.');
    var name = ch.name == null || ch.name === '' ? null : String(ch.name);
    if (name === null) { var k = i + 1; while (given['Channel ' + k] || names['Channel ' + k]) k++; name = 'Channel ' + k; }
    var where = ' on channel "' + name + '"';
    unknownFields(ch, CHANNEL_FIELDS, where);
    if (names[name]) throw inputError('Two channels are both called "' + name + '". Give each a different name.');
    names[name] = true;
    var cpc;
    if (ch.cpc != null) {
      if (ch.cpm != null || ch.ctr != null) throw inputError('Give either "cpc" or "cpm" with "ctr"' + where + ', not both.');
      cpc = positive(ch.cpc, '"cpc"' + where);
    } else if (ch.cpm != null || ch.ctr != null) {
      positive(ch.cpm, '"cpm"' + where); rate(ch.ctr, '"ctr"' + where);
      cpc = ch.cpm / (1000 * ch.ctr);
    } else throw inputError('Give "cpc", or "cpm" with "ctr"' + where + '.');
    var l2c = ch.leadToCustomer != null ? ch.leadToCustomer : cfg.leadToCustomer;
    if (l2c == null) throw inputError('Give "leadToCustomer"' + where + ', or once for all channels.', 'Use your rate from other channels, or your best estimate, and say it is an estimate.');
    var progress = null;
    if (ch.progress != null) {
      if (typeof ch.progress !== 'object' || Array.isArray(ch.progress)) throw inputError('"progress"' + where + ' must be an object.');
      unknownFields(ch.progress, PROGRESS_FIELDS, ' in progress' + where);
      var p = ch.progress;
      if (!isNum(p.spent) || p.spent <= 0) throw inputError('"progress.spent"' + where + ' must be above 0. Add progress once the test has started spending.');
      if (!isNum(p.leads) || p.leads < 0 || Math.floor(p.leads) !== p.leads) throw inputError('"progress.leads"' + where + ' must be a whole number, 0 or more.');
      if (p.customers != null && (!isNum(p.customers) || p.customers < 0 || Math.floor(p.customers) !== p.customers)) throw inputError('"progress.customers"' + where + ' must be a whole number, 0 or more.');
      progress = { spent: p.spent, leads: p.leads, customers: p.customers == null ? null : p.customers };
    }
    return { name: name, cpc: cpc, cpcFromCpm: ch.cpc == null, clickToLead: rate(ch.clickToLead, '"clickToLead"' + where),
      leadToCustomer: rate(l2c, '"leadToCustomer"' + where), progress: progress };
  });
  return s;
}

// One check a week against one-sided alphaLook = alpha / planned weeks: by the
// union bound, a channel that is exactly on target gets a false "stop" (or a
// false "ahead") at most alpha of the time across all the planned checks.
function readProgress(p, ch, s, leadsNeeded, alphaLook) {
  var targetCpl = ch.targetCpl;
  var lambda = p.spent / targetCpl;                 // leads you would expect by now if exactly on target
  var pLow = poissonCdf(p.leads, lambda);            // chance of this few or fewer, if on target
  var pHigh = p.leads === 0 ? 1 : 1 - poissonCdf(p.leads - 1, lambda);
  var tail = (1 - s.confidence) / 2;
  var cpl = p.leads > 0 ? p.spent / p.leads : null;
  var range = p.leads > 0 ? { low: p.spent / poissonUpper(p.leads, tail), high: p.spent / poissonLower(p.leads, tail) } : null;
  var out = { spent: p.spent, leads: p.leads, customers: p.customers, expectedLeadsOnTarget: lambda, cpl: cpl, cplRange: range,
    impliedCac: cpl == null ? null : cpl / ch.leadToCustomer, customerCac: p.customers ? p.spent / p.customers : null,
    leadsToGo: Math.max(0, leadsNeeded - p.leads), pIfOnTarget: { thisFewOrFewer: pLow, thisManyOrMore: pHigh }, alphaPerCheck: alphaLook };
  // The spend at which the current lead count would trigger the stop rule.
  out.nextStopSpend = poissonUpper(p.leads, alphaLook) * targetCpl;
  var odds = Math.round(1 / alphaLook);
  if (pLow < alphaLook) {
    out.status = 'stop';
    out.headline = 'Stop: worse than your target';
    out.body = 'A channel that was on target would show this few leads for this spend less than 1 time in ' + odds + '. Stop, and check the offer and the audience before trying it again.';
  } else if (pHigh < alphaLook) {
    out.status = p.leads >= leadsNeeded ? 'read' : 'ahead';
    out.headline = p.leads >= leadsNeeded ? 'Read complete: better than your target' : 'Ahead of your target';
    out.body = 'A channel that was only on target would show this many leads for this spend less than 1 time in ' + odds + '. ' +
      (p.leads >= leadsNeeded ? 'Keep it running and judge it next on the customers it brings, once a full sales cycle has passed.' : 'Keep going to the planned lead count to learn by how much.');
  } else if (p.leads >= leadsNeeded) {
    out.status = 'read';
    out.headline = 'Read complete: too close to your target to call';
    out.body = 'Cost per lead could be either side of the target. Run it longer to narrow the range, or decide on the customers it brings once a full sales cycle has passed.';
  } else {
    out.status = 'continue';
    out.headline = 'Keep going';
    out.body = 'Too early to tell either way. Keep spending to the planned lead count, and stop early only if the stop rule says so.';
  }
  return out;
}

function assess(ch, s, alpha, leadsNeeded) {
  var r = { name: ch.name, cpc: ch.cpc, cpcFromCpm: ch.cpcFromCpm, clickToLead: ch.clickToLead, leadToCustomer: ch.leadToCustomer };
  r.expectedCpl = ch.cpc / ch.clickToLead;
  r.expectedCac = r.expectedCpl / ch.leadToCustomer;
  r.targetCpl = s.targetCpa * ch.leadToCustomer;
  ch.targetCpl = r.targetCpl;
  r.breakEvenClickToLead = ch.cpc / r.targetCpl;      // the click-to-lead rate that just hits the target
  r.onPaper = r.expectedCac <= s.targetCpa ? 'clears' : 'misses';

  var spend = leadsNeeded * r.expectedCpl;
  var weeks = Math.max(s.minWeeks, Math.ceil(spend / s.weeklyBudget - 1e-9));
  r.leadRead = { leads: leadsNeeded, spend: spend, weeks: weeks, perWeek: spend / weeks };

  var cSpend = leadsNeeded * r.expectedCac;
  var cWeeks = Math.max(s.minWeeks, Math.ceil(cSpend / s.weeklyBudget - 1e-9)) + Math.ceil(s.salesCycleDays / 7);
  r.customerRead = { customers: leadsNeeded, spend: cSpend, weeks: cWeeks,
    feasible: (s.testBudget == null || cSpend <= s.testBudget) && cWeeks <= s.maxWeeks };
  // Chance of seeing no customer at all by the end of the lead read, with every
  // sale already closed: at your own rates, and if the channel were exactly on target.
  r.zeroCustomerChance = Math.exp(-spend / r.expectedCac);
  r.zeroCustomerChanceOnTarget = Math.exp(-spend / s.targetCpa);

  // One check a week for the planned weeks; each check gets an equal share of alpha.
  r.checks = weeks;
  r.alphaPerCheck = alpha / weeks;
  r.stopRule = [];
  for (var x = 0; x < leadsNeeded && r.stopRule.length < MAX_STOP_ROWS; x++) {
    var at = poissonUpper(x, r.alphaPerCheck) * r.targetCpl;
    if (x > 0 && at > spend) break;
    r.stopRule.push({ leads: x, spend: at });
  }

  var budgetCap = s.testBudget == null ? Infinity : s.testBudget;
  var timeCap = s.maxWeeks * s.weeklyBudget;
  var affordable = Math.floor(Math.min(budgetCap, timeCap) / r.expectedCpl);
  r.achievablePrecision = affordable > 0 ? precisionFor(affordable, s.confidence) : null;
  r.weeklyBudgetForMaxWeeks = spend / s.maxWeeks;

  var cur = s.currency, money = function (v) { return cur + Math.round(v).toLocaleString('en-US'); };
  var pctTxt = function (v) { return Math.round(v * 1000) / 10 + '%'; };
  r.options = [];
  if (r.expectedCac > s.targetCpa) {
    r.level = 'misses-on-paper';
    r.headline = 'Misses your target on paper';
    r.body = 'On your own numbers this channel costs about ' + money(r.expectedCac) + ' a customer against a ' + money(s.targetCpa) +
      ' target. A test can only confirm that unless your guesses are wrong: clicks would need to turn into leads at ' +
      pctTxt(r.breakEvenClickToLead) + ' or better, against the ' + pctTxt(ch.clickToLead) + ' you entered.';
    r.options.push({ id: 'check-assumptions', text: 'Check the click-to-lead and lead-to-customer rates before spending; if they hold, skip this channel.' });
  } else if (spend > budgetCap) {
    r.level = 'over-budget';
    r.headline = "Can't be judged on this budget";
    r.body = 'Reaching ' + leadsNeeded + ' leads takes about ' + money(spend) + ', more than your ' + money(budgetCap) + ' test budget.';
  } else if (weeks > s.maxWeeks) {
    r.level = 'slow';
    r.headline = 'Too slow at this weekly budget';
    r.body = 'Reaching ' + leadsNeeded + ' leads takes about ' + money(spend) + ', which is ' + weeks + ' weeks at ' + money(s.weeklyBudget) +
      ' a week, longer than the ' + s.maxWeeks + ' you allowed.';
    r.options.push({ id: 'raise-weekly', text: 'Spend about ' + money(r.weeklyBudgetForMaxWeeks) + ' a week to finish in ' + s.maxWeeks + ' weeks.' });
  } else {
    r.level = 'testable';
    r.headline = 'Testable';
    r.body = 'About ' + leadsNeeded + ' leads, roughly ' + money(spend) + ' over ' + weeks + ' weeks (' + money(spend / weeks) + ' a week). ' +
      'Judge it on cost per lead against ' + money(r.targetCpl) + '.';
  }
  if ((r.level === 'over-budget' || r.level === 'slow') && r.achievablePrecision != null) {
    r.options.push({ id: 'widen', text: 'Accept a rougher read: your budget and time buy about ' + affordable + ' leads, which reads cost per lead to within ±' + Math.round(r.achievablePrecision * 100) + '%.' });
  }
  if (r.level === 'over-budget' || r.level === 'slow') {
    r.options.push({ id: 'cheaper-lead', text: 'Count an earlier, more frequent conversion as the lead, if it tracks customers.' });
  }
  if (ch.progress) r.progress = readProgress(ch.progress, ch, s, leadsNeeded, r.alphaPerCheck);
  return r;
}

function run(cfg) {
  var s = normalise(cfg);
  var alpha = 1 - s.confidence;                       // the chance of a false stop or false "ahead" over the whole test
  // The fewest leads whose exact range on cost per lead is within ±precision on both sides.
  var leadsNeeded = leadsFor(s.precision, s.confidence);
  var channels = s.channels.map(function (ch) { return assess(ch, s, alpha, leadsNeeded); });
  var sorted = channels.slice().sort(function (a, b) {
    return (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) || (a.leadRead.spend - b.leadRead.spend);
  });
  var swapped = false;
  if (sorted.length > 1 && sorted[0].level === 'testable' && sorted[1].level === 'testable' &&
      sorted[1].leadRead.spend <= sorted[0].leadRead.spend * (1 + CLOSE_COST) && sorted[1].expectedCac < sorted[0].expectedCac) {
    sorted = [sorted[1], sorted[0]].concat(sorted.slice(2)); swapped = true;
  }
  var ranking = sorted.map(function (c) { return c.name; });
  var first = sorted[0], second = sorted[1];
  var recommendation = null;
  if (channels.length > 1) {
    var cur = s.currency, money = function (v) { return cur + Math.round(v).toLocaleString('en-US'); };
    if (first.level !== 'testable') {
      recommendation = { name: null, level: first.level, text: 'None of these can be judged within your budget and time at ±' + Math.round(s.precision * 100) + '%. Widen the precision, raise the budget, or count an earlier conversion as the lead.' };
    } else if (swapped) {
      recommendation = { name: first.name, level: first.level, text: 'Test ' + first.name + ' first: it costs about the same to judge as ' + second.name +
        ' (within ' + Math.round(CLOSE_COST * 100) + '%) and has more room under your target, ' + money(first.expectedCac) + ' against ' + money(second.expectedCac) + ' a customer on your numbers.' };
    } else {
      recommendation = { name: first.name, level: first.level, text: 'Test ' + first.name + ' first: it is the cheapest of these to judge that clears your target on paper.' };
    }
  }
  return { settings: { targetCpa: s.targetCpa, weeklyBudget: s.weeklyBudget, testBudget: s.testBudget, salesCycleDays: s.salesCycleDays,
      maxWeeks: s.maxWeeks, minWeeks: s.minWeeks, precision: s.precision, confidence: s.confidence, currency: s.currency },
    alpha: alpha, leadsNeeded: leadsNeeded, channels: channels, ranking: ranking, recommendation: recommendation,
    rules: { DEFAULT_PRECISION: DEFAULT_PRECISION, DEFAULT_CONFIDENCE: DEFAULT_CONFIDENCE, DEFAULT_MIN_WEEKS: DEFAULT_MIN_WEEKS,
      DEFAULT_MAX_WEEKS: DEFAULT_MAX_WEEKS, MAX_CHANNELS: MAX_CHANNELS, CLOSE_COST: CLOSE_COST } };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const cur = r.settings.currency;
  const money = (v) => cur + Math.round(v).toLocaleString('en-US');
  const pct = (v, d = 1) => (v * 100).toFixed(d).replace(/\.0+$/, '') + '%';
  const L = [];
  const st = r.settings;
  L.push('CHANNEL TEST BUDGET');
  L.push('═'.repeat(58));
  L.push(`Target ${money(st.targetCpa)} a customer · ${money(st.weeklyBudget)} a week` +
    (st.testBudget != null ? ` · test budget ${money(st.testBudget)}` : '') + ` · up to ${st.maxWeeks} weeks`);
  L.push(`Read: cost per lead within ±${Math.round(st.precision * 100)}% at ${Math.round(st.confidence * 100)}% confidence → ${r.leadsNeeded} leads per channel`);
  L.push('');
  if (r.recommendation) {
    L.push('RECOMMENDATION');
    L.push('  ' + r.recommendation.text);
    L.push('');
    L.push('WHICH TO TEST FIRST');
    r.ranking.forEach((name, i) => {
      const c = r.channels.find((x) => x.name === name);
      L.push(`  ${i + 1}. ${name.padEnd(22)} ${c.headline.padEnd(32)} ${money(c.leadRead.spend)} · ${c.leadRead.weeks} wk`);
    });
    L.push('');
  }
  r.channels.forEach((c) => {
    L.push(`${c.name.toUpperCase()} - ${c.headline.toUpperCase()}`);
    L.push('─'.repeat(58));
    L.push('  ' + c.body);
    L.push('');
    L.push(`  Cost per click      ${cur}${c.cpc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c.cpcFromCpm ? '  (from CPM and CTR)' : ''}`);
    L.push(`  Cost per lead       ${money(c.expectedCpl)}   target ${money(c.targetCpl)} (target CPA × ${pct(c.leadToCustomer)} lead-to-customer)`);
    L.push(`  Cost per customer   ${money(c.expectedCac)}   on your own rates; ${c.onPaper === 'clears' ? 'clears' : 'misses'} the target`);
    L.push(`  Break-even          clicks must become leads at ${pct(c.breakEvenClickToLead, 2)} or better (you entered ${pct(c.clickToLead, 2)})`);
    L.push('');
    L.push(`  Lead read           ${c.leadRead.leads} leads · ${money(c.leadRead.spend)} · ${c.leadRead.weeks} weeks (${money(c.leadRead.perWeek)} a week)`);
    L.push(`  Customer read       ${c.customerRead.customers} customers · ${money(c.customerRead.spend)} · ${c.customerRead.weeks} weeks${c.customerRead.feasible ? '' : ' - beyond your limits'}`);
    L.push(`  Zero customers      ${pct(c.zeroCustomerChance, 0)} chance of none by the end of the lead read at your own rates (${pct(c.zeroCustomerChanceOnTarget, 0)} if exactly on target), with every sale closed`);
    L.push('');
    L.push('  STOP RULE - check once a week; stop if you reach this spend with this many leads or fewer:');
    c.stopRule.forEach((s) => L.push(`    ${s.leads === 0 ? 'no leads' : String(s.leads).padStart(3) + (s.leads === 1 ? ' lead ' : ' leads')}  by ${money(s.spend)}`));
    L.push(`    (a channel on its ${money(c.targetCpl)} target cost per lead hits a line by mistake less than ${Math.round((1 - st.confidence) * 100)}% of the time over all ${c.checks} weekly checks)`);
    if (c.options.length) {
      L.push('');
      L.push('  OPTIONS');
      c.options.forEach((o) => L.push('   - ' + o.text));
    }
    if (c.progress) {
      const p = c.progress;
      L.push('');
      L.push(`  PROGRESS - ${p.headline.toUpperCase()}`);
      L.push(`    ${money(p.spent)} spent, ${p.leads} lead${p.leads === 1 ? '' : 's'}` + (p.customers != null ? `, ${p.customers} customer${p.customers === 1 ? '' : 's'}` : '') +
        `; on target you would expect about ${p.expectedLeadsOnTarget.toFixed(1)} leads by now.`);
      if (p.cpl != null) L.push(`    Cost per lead ${money(p.cpl)} (range ${money(p.cplRange.low)} to ${money(p.cplRange.high)}); implies about ${money(p.impliedCac)} a customer at ${pct(c.leadToCustomer)} lead-to-customer.`);
      L.push('    ' + p.body);
      if (p.status === 'continue') L.push(`    ${p.leadsToGo} more leads to finish the read. Stop if you reach ${money(p.nextStopSpend)} with ${p.leads === 0 ? 'no leads' : p.leads + ' or fewer'}.`);
      if (p.status === 'ahead') L.push(`    ${p.leadsToGo} more leads to finish the read.`);
      if (p.customerCac != null) L.push(`    Spend per customer so far ${money(p.customerCac)} - read this only after a full sales cycle.`);
    }
    L.push('');
  });
  return L.join('\n').trimEnd();
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional and every number here is invented for the demo.
const DEMO = {
  targetCpa: 3000, weeklyBudget: 2500, testBudget: 20000, leadToCustomer: 0.1, salesCycleDays: 45,
  channels: [
    { name: 'LinkedIn Ads', cpc: 9, clickToLead: 0.02, leadToCustomer: 0.08, progress: { spent: 4200, leads: 5, customers: 0 } },
    { name: 'Google Search', cpc: 6, clickToLead: 0.035, leadToCustomer: 0.12 },
    { name: 'Meta', cpm: 18, ctr: 0.009, clickToLead: 0.012 },
  ],
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

module.exports = { run, render, normalise, poissonCdf, poissonUpper, poissonLower, normInv,
  DEFAULT_PRECISION, DEFAULT_CONFIDENCE, DEFAULT_MIN_WEEKS, DEFAULT_MAX_WEEKS, MAX_CHANNELS };
