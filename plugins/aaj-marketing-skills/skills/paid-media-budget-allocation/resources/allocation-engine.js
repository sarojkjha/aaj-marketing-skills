#!/usr/bin/env node
/*
 * AAJ Paid Media Budget Allocator — allocation engine
 * Part of the "paid-media-budget-allocation" Agent Skill.
 *
 * Splits a paid budget across channels so the cost of the NEXT customer is
 * roughly equal everywhere (marginal-CAC equalization under diminishing
 * returns). Same verified math as the AAJ Paid Media Budget Allocator tool.
 *
 * USAGE
 *   node allocation-engine.js                 # demo: B2B SaaS, $30k budget
 *   node allocation-engine.js '<json-config>' # custom (schema below)
 *   node allocation-engine.js --help
 *
 * CONFIG (JSON)
 *   {
 *     "model": "saas",                 // saas | ecom | local | market (picks default channels + placeholder numbers)
 *     "mode": "budget",                // budget | cac | goal
 *     "budget": 30000,                 // mode=budget
 *     "cacTarget": 700,                // mode=cac
 *     "customerGoal": 50,              // mode=goal
 *     "diminishingReturns": "moderate",// gentle | moderate | aggressive
 *     "ltv": 15000, "acv": 6000, "margin": 80,   // optional overrides of model defaults
 *     "channels": [                    // optional: override defaults or add channels
 *       { "key": "google",   "cpc": 6,  "cvr": 8,  "l2c": 12, "cap": 30000 },
 *       { "key": "capterra", "model": "cpl", "cpl": 90, "l2c": 22, "cap": 8000 }
 *     ],
 *     "onlyListedChannels": true,      // optional: use ONLY the channels listed, each with all
 *                                      // its inputs, and none of the model's placeholder
 *                                      // numbers (no preset channels, LTV, ACV or margin).
 *                                      // LTV:CAC, ROAS and payback are shown only for the
 *                                      // ltv / acv / margin you give.
 *     "rangePct": 20,                  // optional what-if: how far every channel's cost per
 *                                      // customer may run from what you entered, 1 to 90
 *                                      // (default 20, AAJ's default; not a forecast band)
 *     "showMath": true                 // optional: print how each funded channel's numbers
 *                                      // are worked out
 *   }
 *
 * Channel model:
 *   funnel (default): baseCAC = (cpc / (cvr/100)) / (l2c/100)
 *   cpl  (Capterra/G2, pay-per-lead): baseCAC = cpl / (l2c/100)
 *
 * A channel can be given as a past period's results instead of rates:
 *   { "key": "google", "results": { "spend": 12000, "clicks": 2100, "leads": 170, "customers": 21 }, "cap": 30000 }
 *   The engine works the rates out (rounded to four decimals):
 *     cpc = spend / clicks, cvr = leads / clicks, l2c = customers / leads
 *   and fits the channel's base CAC so its curve passes through those results: at that
 *   monthly spend it gives exactly those customers. Typed rates are read as the cost at low
 *   spend; results are an average at the spend you ran, which already includes some
 *   diminishing returns, so their base CAC is lower than spend / customers:
 *     baseCAC = (cap / (customers x DR)) x ln(1 + DR x spend / cap)
 *   "months": 3 inside results says the figures cover three months (default 1); they are
 *   averaged to a month, because budgets and caps are monthly.
 *   No "leads"? Then cvr = customers / clicks and l2c = 100 (each converting click is a customer).
 *   No "customers" yet? Give "leads" in results and "l2c" beside them: customers = leads x l2c.
 *   Pay-per-lead channels take { "spend", "leads", "customers" }: cpl = spend / leads.
 *
 * Pacing: per day = month / 30.4 and per week = per day x 7. 30.4 is the average number
 * of days in a month (365 / 12), the factor Google Ads uses to turn an average daily
 * budget into a monthly limit (support.google.com/google-ads/answer/6385083).
 *
 * Range: the same plan re-run with every channel's base CAC rangePct lower and higher.
 * A fixed budget buys more or fewer customers; a CAC target supports more or less spend;
 * a customer goal needs a smaller or larger budget.
 *
 * Output is a per-channel table plus a machine-readable JSON block.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
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

const DR_MAP = { gentle: 0.4, moderate: 0.8, aggressive: 1.5 };

// Average days in a month (365 / 12), as Google Ads uses for a monthly spending limit.
const DAYS_PER_MONTH = 30.4;
// AAJ's default what-if range on every channel's cost per customer. Not a benchmark.
const RANGE_DEFAULT_PCT = 20;
const r4 = n => Math.round(n * 1e4) / 1e4;

// Last period's results -> the channel's rates, rounded to four decimals.
function fromResults(model, r) {
  const out = {};
  if (model === 'cpl') {
    out.cpl = r4(r.spend / r.leads);
    if (r.customers != null) out.l2c = r4(r.customers / r.leads * 100);
  } else {
    out.cpc = r4(r.spend / r.clicks);
    if (r.leads != null) {
      out.cvr = r4(r.leads / r.clicks * 100);
      if (r.customers != null) out.l2c = r4(r.customers / r.leads * 100);
    } else {
      // No lead stage in the results: every converting click is a customer.
      out.cvr = r4(r.customers / r.clicks * 100);
      out.l2c = 100;
      out.clickToCustomer = true;
    }
  }
  return out;
}
// The channel as the engine uses it: a "results" block replaced by the rates it gives and
// the monthly point (spend, customers) its curve is fitted through.
function withRates(o, model) {
  if (!o.results) return o;
  const r = o.results, months = r.months || 1;
  const eff = Object.assign({}, o, fromResults(model, r), { fromResults: true });
  const customers = r.customers != null ? r.customers : r.leads * eff.l2c / 100;
  eff.obsSpend = r.spend / months;
  eff.obsCustomers = customers / months;
  eff.obsMonths = months;
  delete eff.results;
  return eff;
}
const pacing = monthly => ({ daily: monthly / DAYS_PER_MONTH, weekly: monthly / DAYS_PER_MONTH * 7 });

const LABEL = {
  google: 'Google', microsoft: 'Microsoft', linkedin: 'LinkedIn', meta: 'Meta',
  youtube: 'YouTube', tiktok: 'TikTok', amazon: 'Amazon', capterra: 'Capterra/G2',
  reddit: 'Reddit', quora: 'Quora', x: 'X', pinterest: 'Pinterest',
  snapchat: 'Snapchat', nextdoor: 'Nextdoor', yelp: 'Yelp', applesearch: 'Apple Search'
};

// AAJ illustrative defaults by business model — round placeholders, not
// benchmarks, and not traced to any published survey. Replace with the
// client's own account data before the output informs a decision.
const PRESETS = {
  saas: {
    label: 'B2B SaaS', acv: 6000, margin: 80, ltv: 15000,
    defaults: ['google', 'linkedin', 'microsoft', 'meta', 'youtube'],
    ch: {
      google:    { cpc: 6,   cvr: 8,  l2c: 12, cap: 30000 },
      linkedin:  { cpc: 11,  cvr: 11, l2c: 20, cap: 15000 },
      microsoft: { cpc: 4.5, cvr: 8,  l2c: 12, cap: 12000 },
      meta:      { cpc: 2.5, cvr: 5,  l2c: 9,  cap: 45000 },
      youtube:   { cpc: 3,   cvr: 4,  l2c: 8,  cap: 25000 },
      capterra:  { model: 'cpl', cpl: 90, l2c: 22, cap: 8000 },
      reddit:    { cpc: 1.8, cvr: 4,  l2c: 8,  cap: 10000 },
      quora:     { cpc: 2.2, cvr: 5,  l2c: 10, cap: 6000 },
      x:         { cpc: 1.5, cvr: 3,  l2c: 6,  cap: 12000 }
    }
  },
  ecom: {
    label: 'Ecommerce', acv: 80, margin: 60, ltv: 160,
    defaults: ['meta', 'google', 'tiktok', 'amazon', 'microsoft'],
    ch: {
      meta:      { cpc: 0.9, cvr: 6,   l2c: 30, cap: 120000 },
      google:    { cpc: 1.0, cvr: 8,   l2c: 35, cap: 60000 },
      tiktok:    { cpc: 0.8, cvr: 5,   l2c: 25, cap: 80000 },
      amazon:    { cpc: 0.9, cvr: 12,  l2c: 40, cap: 50000 },
      microsoft: { cpc: 0.7, cvr: 7,   l2c: 32, cap: 30000 },
      pinterest: { cpc: 0.6, cvr: 4,   l2c: 20, cap: 40000 },
      youtube:   { cpc: 0.5, cvr: 3,   l2c: 18, cap: 50000 },
      snapchat:  { cpc: 0.5, cvr: 3.5, l2c: 16, cap: 30000 }
    }
  },
  local: {
    label: 'Local / services', acv: 800, margin: 50, ltv: 2000,
    defaults: ['google', 'meta', 'microsoft', 'youtube', 'tiktok'],
    ch: {
      google:    { cpc: 4,   cvr: 10, l2c: 25, cap: 20000 },
      meta:      { cpc: 1.5, cvr: 7,  l2c: 15, cap: 25000 },
      microsoft: { cpc: 3,   cvr: 9,  l2c: 24, cap: 12000 },
      youtube:   { cpc: 1.2, cvr: 4,  l2c: 12, cap: 15000 },
      tiktok:    { cpc: 1.0, cvr: 5,  l2c: 12, cap: 18000 },
      nextdoor:  { cpc: 1.8, cvr: 6,  l2c: 18, cap: 8000 },
      yelp:      { cpc: 5,   cvr: 12, l2c: 22, cap: 10000 },
      linkedin:  { cpc: 8,   cvr: 4,  l2c: 10, cap: 4000 }
    }
  },
  market: {
    label: 'Marketplace', acv: 120, margin: 70, ltv: 360,
    defaults: ['google', 'meta', 'tiktok', 'microsoft', 'youtube'],
    ch: {
      google:     { cpc: 1.5, cvr: 6,   l2c: 25, cap: 50000 },
      meta:       { cpc: 1.0, cvr: 5,   l2c: 20, cap: 80000 },
      tiktok:     { cpc: 0.8, cvr: 4.5, l2c: 18, cap: 80000 },
      microsoft:  { cpc: 1.1, cvr: 6,   l2c: 23, cap: 30000 },
      youtube:    { cpc: 0.6, cvr: 3.5, l2c: 15, cap: 50000 },
      reddit:     { cpc: 0.9, cvr: 4,   l2c: 14, cap: 20000 },
      applesearch:{ cpc: 2.0, cvr: 50,  l2c: 8,  cap: 25000 },
      pinterest:  { cpc: 0.7, cvr: 4,   l2c: 16, cap: 40000 }
    }
  }
};

// ---------------------------------------------------------------------------
// Engine (verified — do not "optimize" the math)
// ---------------------------------------------------------------------------
function econ(c, DR) {
  const cpl = c.model === 'cpl' ? c.cpl : c.cpc / (c.cvr / 100);
  // Given as results: the base CAC that makes the curve give those customers at that spend.
  const fitted = c.obsSpend != null;
  const baseCAC = fitted ? (c.cap / (c.obsCustomers * DR)) * Math.log(1 + (DR * c.obsSpend) / c.cap) : cpl / (c.l2c / 100);
  return Object.assign({}, c, { baseCAC, cplValue: cpl, fitted });
}
const custFromSpend  = (S, b, cap, DR) => (S <= 0 ? 0 : (cap / (b * DR)) * Math.log(1 + (DR * S) / cap));
const spendForMarginal = (lam, b, cap, DR) => (lam <= b ? 0 : (cap / DR) * (lam / b - 1));
const marginalCAC    = (S, b, cap, DR) => b * (1 + (DR * S) / cap);

function allocateBudget(chs, B, DR) {
  if (!chs.length || B <= 0) return chs.map(() => 0);
  let lo = Math.min(...chs.map(c => c.baseCAC));
  let hi = Math.max(...chs.map(c => c.baseCAC)) * 60;
  // Widen the search until the whole budget can be spent (returns diminish but never stop).
  const spendAt = lam => chs.reduce((s, c) => s + spendForMarginal(lam, c.baseCAC, c.cap, DR), 0);
  for (let k = 0; k < 200 && spendAt(hi) < B; k++) hi *= 2;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const tot = chs.reduce((s, c) => s + spendForMarginal(mid, c.baseCAC, c.cap, DR), 0);
    if (tot > B) hi = mid; else lo = mid;
  }
  const lam = (lo + hi) / 2;
  return chs.map(c => spendForMarginal(lam, c.baseCAC, c.cap, DR));
}
const allocateCAC = (chs, T, DR) => chs.map(c => spendForMarginal(T, c.baseCAC, c.cap, DR));

// How far the goal search may go: the last customer at most this many times the dearest base CAC.
const GOAL_SEARCH_LIMIT = 1e6;

function allocateGoal(chs, G, DR) {
  if (!chs.length || G <= 0) return chs.map(() => 0);
  let lo = Math.min(...chs.map(c => c.baseCAC));
  let hi = Math.max(...chs.map(c => c.baseCAC)) * 90;
  // Widen the search until the goal is reachable, up to the point where the last customer would
  // cost GOAL_SEARCH_LIMIT times the dearest channel's base CAC. Past that the goal is out of
  // reach, and the runner says so rather than printing a silent shortfall.
  const limit = Math.max(...chs.map(c => c.baseCAC)) * GOAL_SEARCH_LIMIT;
  const custAt = lam => chs.reduce((s, c) => s + custFromSpend(spendForMarginal(lam, c.baseCAC, c.cap, DR), c.baseCAC, c.cap, DR), 0);
  while (hi < limit && custAt(hi) < G) hi = Math.min(limit, hi * 2);
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const cust = chs.reduce((s, c) => s + custFromSpend(spendForMarginal(mid, c.baseCAC, c.cap, DR), c.baseCAC, c.cap, DR), 0);
    if (cust > G) hi = mid; else lo = mid;
  }
  const lam = (lo + hi) / 2;
  return chs.map(c => spendForMarginal(lam, c.baseCAC, c.cap, DR));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function buildChannels(cfg, DR) {
  const preset = PRESETS[cfg.model] || PRESETS.saas;
  const map = {};
  // Seed defaults from the preset (not when only the listed channels are wanted).
  if (!cfg.onlyListedChannels) preset.defaults.forEach(k => { map[k] = Object.assign({ key: k, model: 'funnel', placeholder: true, placeholderFields: null }, preset.ch[k]); });
  // Apply overrides / additions from cfg.channels. A channel counts as the
  // user's own data only when every economic input came from the config.
  (cfg.channels || []).forEach(raw => {
    // Own-channels mode never borrows a preset's numbers or channel model (review, Oct 29).
    const base = cfg.onlyListedChannels ? {} : (preset.ch[raw.key] || {});
    const o = withRates(raw, raw.model || base.model || 'funnel');
    const need = o.model === 'cpl' ? ['cpl', 'l2c', 'cap'] : ['cpc', 'cvr', 'l2c', 'cap'];
    // The inputs still on a placeholder. null means all of them (a channel not listed at all).
    const missing = need.filter(f => o[f] == null);
    const placeholder = missing.length > 0;
    map[o.key] = Object.assign({ key: o.key, model: 'funnel' }, base, o, { placeholder, placeholderFields: missing.length === need.length ? null : missing });
  });
  return Object.keys(map).map(k => econ(map[k], DR));
}

// Unknown fields, a missing budget and mistyped channel keys used to run on
// placeholder channels (or add a NaN row). They now stop the run and say why.
function validate(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['The input must be a JSON object.'];
  const errs = [];
  const known = ['model', 'mode', 'budget', 'cacTarget', 'customerGoal', 'diminishingReturns', 'ltv', 'acv', 'margin', 'channels', 'onlyListedChannels', 'rangePct', 'showMath'];
  const unknown = Object.keys(c).filter(k => !known.includes(k));
  if (unknown.length) errs.push('Unrecognised field' + (unknown.length > 1 ? 's' : '') + ': ' + unknown.map(k => '"' + k + '"').join(', ') + '. Expected: ' + known.join(', ') + '.');
  if (c.model !== undefined && !PRESETS[c.model]) errs.push('"model" is one of: ' + Object.keys(PRESETS).join(', ') + '.');
  if (c.mode !== undefined && !['budget', 'cac', 'goal'].includes(c.mode)) errs.push('"mode" is "budget", "cac" or "goal".');
  if (c.diminishingReturns !== undefined && !(c.diminishingReturns in DR_MAP)) errs.push('"diminishingReturns" is one of: ' + Object.keys(DR_MAP).join(', ') + '.');
  const need = { budget: 'budget', cac: 'cacTarget', goal: 'customerGoal' }[c.mode || 'budget'];
  if (need && !(typeof c[need] === 'number' && c[need] > 0)) errs.push('Mode "' + (c.mode || 'budget') + '" needs "' + need + '" as a number above 0.');
  for (const k of ['ltv', 'acv', 'margin']) if (c[k] !== undefined && !(typeof c[k] === 'number' && c[k] > 0)) errs.push('"' + k + '" must be a number above 0.');
  if (c.onlyListedChannels !== undefined && typeof c.onlyListedChannels !== 'boolean') errs.push('"onlyListedChannels" is true or false.');
  if (c.rangePct !== undefined && !(typeof c.rangePct === 'number' && c.rangePct >= 1 && c.rangePct <= 90)) errs.push('"rangePct" is a number from 1 to 90.');
  if (c.showMath !== undefined && typeof c.showMath !== 'boolean') errs.push('"showMath" is true or false.');
  // A channel given as results is checked first, so the checks below see the rates it gives.
  const preset = PRESETS[c.model] || PRESETS.saas;
  const rated = [];
  if (Array.isArray(c.channels)) c.channels.forEach((o, i) => {
    rated[i] = o;
    if (!o || typeof o !== 'object' || o.results === undefined || !LABEL[o.key]) return;
    const model = o.model || (c.onlyListedChannels ? undefined : (preset.ch[o.key] || {}).model) || 'funnel';
    const r = o.results, at = o.key + '.results';
    const shape = model === 'cpl' ? '{spend, leads, customers}' : '{spend, clicks, leads, customers}';
    if (r && typeof r === 'object' && r.months !== undefined && !(Number.isInteger(r.months) && r.months >= 1 && r.months <= 36)) errs.push(at + '.months is a whole number of months from 1 to 36.');
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errs.push(at + ' is ' + shape + ' for one period.'); rated[i] = null; return; }
    const allowed = model === 'cpl' ? ['spend', 'leads', 'customers'] : ['spend', 'clicks', 'leads', 'customers'];
    const before = errs.length - (r.months !== undefined && !(Number.isInteger(r.months) && r.months >= 1 && r.months <= 36) ? 1 : 0);
    const extra = Object.keys(r).filter(k => !allowed.includes(k) && k !== 'months');
    if (extra.length) errs.push(at + ': unrecognised field ' + extra.map(k => '"' + k + '"').join(', ') + '. ' + (model === 'cpl' ? LABEL[o.key] + ' is paid per lead, so results are ' : 'Expected: ') + shape + '.');
    for (const k of allowed) if (r[k] !== undefined && !(typeof r[k] === 'number' && Number.isFinite(r[k]) && r[k] > 0)) errs.push(at + '.' + k + ' must be a number above 0.');
    const clash = ['cpc', 'cvr', 'cpl'].filter(k => o[k] !== undefined);
    if (clash.length) errs.push(o.key + ': give "results" or ' + clash.join(', ') + ', not both.');
    const req = model === 'cpl' ? ['spend', 'leads'] : ['spend', 'clicks'];
    const miss = req.filter(k => r[k] === undefined);
    if (miss.length) errs.push(at + ' needs ' + miss.join(' and ') + '.');
    if (r.customers !== undefined && o.l2c !== undefined) errs.push(o.key + ': give "customers" in results or "l2c", not both.');
    if (r.customers === undefined && (model === 'cpl' || r.leads !== undefined) && o.l2c === undefined) errs.push(o.key + ': no "customers" in results, so lead-to-customer % cannot be worked out. Add "customers", or give "l2c".');
    if (model !== 'cpl' && r.leads === undefined && r.customers === undefined) errs.push(at + ' needs "leads" or "customers".');
    if (errs.length === before) {
      if (r.leads !== undefined && r.clicks !== undefined && r.leads > r.clicks) errs.push(at + ': leads (' + r.leads + ') cannot be more than clicks (' + r.clicks + ').');
      const from = r.leads !== undefined ? ['leads', r.leads] : ['clicks', r.clicks];
      if (r.customers !== undefined && r.customers > from[1]) errs.push(at + ': customers (' + r.customers + ') cannot be more than ' + from[0] + ' (' + from[1] + ').');
    }
    if (errs.length > before) { rated[i] = null; return; }
    const eff = withRates(o, model);
    const zero = ['cpc', 'cvr', 'l2c', 'cpl'].filter(k => eff[k] !== undefined && !(eff[k] > 0));
    if (zero.length) { errs.push(at + ' gives a ' + zero.join(', ') + ' that rounds to 0. Check the figures.'); rated[i] = null; return; }
    rated[i] = eff;
  });
  if (c.onlyListedChannels === true) {
    if (!Array.isArray(c.channels) || !c.channels.length) errs.push('"onlyListedChannels" needs at least one channel in "channels".');
    else rated.forEach((o, i) => {
      if (!o || typeof o !== 'object') return;
      const need = o.model === 'cpl' ? ['cpl', 'l2c', 'cap'] : ['cpc', 'cvr', 'l2c', 'cap'];
      const miss = need.filter(f => o[f] == null);
      if (miss.length) errs.push('channels[' + i + '] (' + o.key + ') needs ' + miss.join(', ') + ' with "onlyListedChannels": every input must be your own.');
    });
  }
  if (c.channels !== undefined) {
    if (!Array.isArray(c.channels)) errs.push('"channels" is a list of {key, cpc, cvr, l2c, cap}.');
    else c.channels.forEach((o, i) => {
      if (!o || typeof o !== 'object' || !LABEL[o.key]) { errs.push('channels[' + i + '].key "' + (o && o.key) + '" is not a known channel. Known: ' + Object.keys(LABEL).join(', ') + '.'); return; }
      const fields = ['model', 'key', 'cpc', 'cvr', 'l2c', 'cap', 'cpl', 'results'];
      const bad = Object.keys(o).filter(k => !fields.includes(k));
      if (bad.length) errs.push(o.key + ': unrecognised field ' + bad.map(k => '"' + k + '"').join(', ') + '. Expected: ' + fields.join(', ') + '.');
      for (const k of ['cpc', 'cvr', 'l2c', 'cap', 'cpl']) if (o[k] !== undefined && !(typeof o[k] === 'number' && o[k] > 0)) errs.push(o.key + '.' + k + ' must be a number above 0.');
    });
  }
  return errs;
}

function money(n) { return '$' + Math.round(n).toLocaleString(); }
function one(n) { return (Math.round(n * 10) / 10).toLocaleString(); }
// Cents for a click or a lead, and a rate or factor as entered (up to four decimals).
function money2(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function num(n) { return r4(n).toLocaleString('en-US', { maximumFractionDigits: 4 }); }
function two(n) { return (Math.round(n * 100) / 100).toLocaleString('en-US'); }

// How one funded channel's numbers are worked out, in the engine's own formulas.
// Figures are rounded for display; the engine works from the unrounded ones.
function mathLines(label, c, spend, DR) {
  const customers = custFromSpend(spend, c.baseCAC, c.cap, DR);
  const rows = [
    ['Cost per lead', c.model === 'cpl' ? `${money2(c.cpl)} (paid per lead)` : `${money2(c.cpc)} a click \u00f7 ${num(c.cvr)}% ${c.clickToCustomer ? 'click-to-customer (no lead stage given)' : 'click-to-lead'} = ${money2(c.cplValue)}`],
    c.fitted
      ? ['Base CAC', `fitted to ${money(c.obsSpend)} a month for ${two(c.obsCustomers)} customers: (${money(c.cap)} cap \u00f7 (${two(c.obsCustomers)} \u00d7 ${num(DR)})) \u00d7 ln(1 + ${num(DR)} \u00d7 ${money(c.obsSpend)} \u00f7 ${money(c.cap)}) = ${money(c.baseCAC)}`]
      : ['Base CAC', `${money2(c.cplValue)} \u00f7 ${num(c.l2c)}% lead-to-customer = ${money(c.baseCAC)}`],
    ['Customers', `(${money(c.cap)} cap \u00f7 (${money(c.baseCAC)} \u00d7 ${num(DR)})) \u00d7 ln(1 + ${num(DR)} \u00d7 ${money(spend)} \u00f7 ${money(c.cap)}) = ${two(customers)}`],
    ['Average CAC', `${money(spend)} \u00f7 ${two(customers)} = ${money(spend / customers)}`],
    ['Next customer', `${money(c.baseCAC)} \u00d7 (1 + ${num(DR)} \u00d7 ${money(spend)} \u00f7 ${money(c.cap)}) = ${money(marginalCAC(spend, c.baseCAC, c.cap, DR))}`],
    ['Per day', `${money(spend)} \u00f7 ${DAYS_PER_MONTH} days = ${money(spend / DAYS_PER_MONTH)}`]
  ];
  return [label].concat(rows.map(r => '  ' + r[0].padEnd(15) + r[1]));
}

// The range in words, for the mode it was run in.
function rangeLines(mode, cfg, R, ltvcac) {
  const lo = R.ifCostsLower, hi = R.ifCostsHigher, p = R.pct;
  const L = [`Range: every channel's cost per customer ${num(p)}% lower or higher than entered (${R.isDefault ? "AAJ's default; " : ''}a what-if, not a forecast).`];
  if (mode === 'cac') {
    L.push(`  The ${money(cfg.cacTarget)} target supports ${money(lo.totalSpend)} to ${money(hi.totalSpend)} of spend, for ${one(lo.customers)} to ${one(hi.customers)} customers.`);
  } else if (mode === 'goal') {
    if (lo.goalShortfall) L.push(`  The goal stays out of reach with these channels across the range: about ${one(lo.customers)} to ${one(hi.customers)} of the ${one(cfg.customerGoal)} customers.`);
    else if (hi.goalShortfall) L.push(`  ${one(cfg.customerGoal)} customers need ${money(lo.totalSpend)} a month at the lower costs. At the higher costs the goal is out of reach with these channels (about ${one(hi.customers)} customers).`);
    else L.push(`  ${one(cfg.customerGoal)} customers need ${money(lo.totalSpend)} to ${money(hi.totalSpend)} a month.`);
  } else {
    L.push(`  This budget buys ${one(lo.customers)} to ${one(hi.customers)} customers, at a blended CAC of ${money(lo.blendedCAC)} to ${money(hi.blendedCAC)}.`);
  }
  if (lo.ltvCac != null && lo.ltvCac >= 0.05 && hi.ltvCac >= 0.05) {
    L.push(`  LTV:CAC runs ${one(lo.ltvCac)}:1 to ${one(hi.ltvCac)}:1.`);
    if (ltvcac >= 3 && hi.ltvCac < 3) L.push(`\u26a0 At ${num(p)}% higher costs LTV:CAC falls to ${one(hi.ltvCac)}:1, below 3:1. Check the inputs that carry the plan before scaling.`);
    else if (ltvcac < 3 && lo.ltvCac >= 3) L.push(`\u2022 At ${num(p)}% lower costs LTV:CAC reaches ${one(lo.ltvCac)}:1, above 3:1.`);
  }
  return L;
}

function rangeJson(x, mode) {
  return {
    totalSpend: Math.round(x.totalSpend), customers: Math.round(x.customers * 10) / 10, blendedCAC: Math.round(x.blendedCAC),
    ltvCac: x.ltvCac == null ? null : Math.round(x.ltvCac * 100) / 100,
    roas: x.roas == null ? null : Math.round(x.roas * 100) / 100,
    cacPaybackMonths: x.cacPaybackMonths == null ? null : Math.round(x.cacPaybackMonths * 10) / 10,
    goalShortfall: mode === 'goal' ? Math.round(x.goalShortfall * 10) / 10 : undefined
  };
}

function run(cfg) {
  const preset = PRESETS[cfg.model] || PRESETS.saas;
  const DR = DR_MAP[cfg.diminishingReturns || 'moderate'];
  const own = !!cfg.onlyListedChannels;
  const ltv = cfg.ltv != null ? cfg.ltv : (own ? null : preset.ltv);
  const acv = cfg.acv != null ? cfg.acv : (own ? null : preset.acv);
  const margin = cfg.margin != null ? cfg.margin : (own ? null : preset.margin);
  const mode = cfg.mode || 'budget';
  const chs = buildChannels(cfg, DR);

  let spends, note = '';
  if (mode === 'cac') {
    spends = allocateCAC(chs, cfg.cacTarget, DR);
    if (spends.reduce((a, b) => a + b, 0) < 1) {
      note = `CAC target ${money(cfg.cacTarget)} is below every channel's base CAC (cheapest is ${money(Math.min(...chs.map(c => c.baseCAC)))}). Raise the target or improve the funnels.`;
    }
  } else if (mode === 'goal') {
    spends = allocateGoal(chs, cfg.customerGoal, DR);
  } else {
    spends = allocateBudget(chs, cfg.budget, DR);
  }

  let totSpend = 0, totCust = 0;
  const rows = chs.map((c, i) => {
    const spend = spends[i];
    const customers = custFromSpend(spend, c.baseCAC, c.cap, DR);
    const leads = c.model === 'cpl' ? (c.cpl > 0 ? spend / c.cpl : 0) : (spend / c.cpc) * (c.cvr / 100);
    totSpend += spend; totCust += customers;
    const pace = pacing(spend);
    return {
      channel: LABEL[c.key] || c.key,
      spend: Math.round(spend),
      daily: Math.round(pace.daily * 100) / 100,
      weekly: Math.round(pace.weekly * 100) / 100,
      customers: Math.round(customers * 10) / 10,
      cac: customers > 0 ? Math.round(spend / customers) : null,
      marginalCAC: Math.round(marginalCAC(spend, c.baseCAC, c.cap, DR)),
      baseCAC: Math.round(c.baseCAC),
      clicks: c.model === 'cpl' ? null : Math.round(spend / c.cpc),
      leads: Math.round(leads),
      inputs: c.model === 'cpl' ? { cpl: c.cpl, l2c: c.l2c, cap: c.cap } : { cpc: c.cpc, cvr: c.cvr, l2c: c.l2c, cap: c.cap },
      fromResults: !!c.fromResults,
      observed: c.fitted ? { monthlySpend: Math.round(c.obsSpend * 100) / 100, monthlyCustomers: Math.round(c.obsCustomers * 100) / 100, cac: Math.round(c.obsSpend / c.obsCustomers), months: c.obsMonths } : null,
      placeholderInputs: !!c.placeholder,
      placeholderFields: !c.placeholder ? [] : (c.placeholderFields || (c.model === 'cpl' ? ['cpl', 'l2c', 'cap'] : ['cpc', 'cvr', 'l2c', 'cap']))
    };
  });
  const goalShortfall = mode === 'goal' && totCust < cfg.customerGoal * (1 - 1e-6) ? cfg.customerGoal - totCust : 0;
  if (goalShortfall) {
    const lastCost = Math.max(...rows.filter(r => r.spend > 0).map(r => r.marginalCAC));
    note = `Goal out of reach with these channels: returns diminish as spend grows, and even at the most this engine will spend they deliver about ${one(totCust)} of the ${one(cfg.customerGoal)} customers, the last ones at ${money(lastCost)} each. Lower the goal, add channels, or raise their caps.`;
  }
  const blendedCAC = totCust > 0 ? totSpend / totCust : 0;
  // The cost of the last customer bought: the highest marginal CAC among funded channels.
  const lastCustomerCost = rows.filter(r => r.spend > 0).reduce((a, r) => Math.max(a, r.marginalCAC), 0);
  const lastAboveLtv = ltv != null && lastCustomerCost > ltv;
  const ltvcac = ltv == null ? null : (blendedCAC > 0 ? ltv / blendedCAC : 0);
  const roas = acv == null ? null : (totSpend > 0 ? (totCust * acv) / totSpend : 0);
  const payback = acv == null || margin == null ? null : ((acv * margin / 100 / 12) > 0 ? blendedCAC / (acv * margin / 100 / 12) : 0);

  // Range: the same plan re-run with every channel's base CAC moved by the same share.
  const rangePct = cfg.rangePct != null ? cfg.rangePct : RANGE_DEFAULT_PCT;
  const planAt = f => {
    const sc = chs.map(c => Object.assign({}, c, { baseCAC: c.baseCAC * f }));
    const sp = mode === 'cac' ? allocateCAC(sc, cfg.cacTarget, DR) : mode === 'goal' ? allocateGoal(sc, cfg.customerGoal, DR) : allocateBudget(sc, cfg.budget, DR);
    let S = 0, C = 0;
    sc.forEach((c, i) => { S += sp[i]; C += custFromSpend(sp[i], c.baseCAC, c.cap, DR); });
    const cac = C > 0 ? S / C : 0;
    const contrib = acv == null || margin == null ? null : acv * margin / 100 / 12;
    return {
      totalSpend: S, customers: C, blendedCAC: cac,
      ltvCac: ltv == null ? null : (cac > 0 ? ltv / cac : 0),
      roas: acv == null ? null : (S > 0 ? (C * acv) / S : 0),
      cacPaybackMonths: contrib == null ? null : (contrib > 0 ? cac / contrib : 0),
      goalShortfall: mode === 'goal' && C < cfg.customerGoal * (1 - 1e-6) ? cfg.customerGoal - C : 0
    };
  };
  const range = { pct: rangePct, isDefault: cfg.rangePct == null, ifCostsLower: planAt(1 - rangePct / 100), ifCostsHigher: planAt(1 + rangePct / 100) };
  const totalPace = pacing(totSpend);

  // ---- print ----
  const out = [];
  out.push('');
  out.push(own ? 'AAJ Paid Media Budget Allocator — your channels only' : `AAJ Paid Media Budget Allocator — ${preset.label}`);
  out.push(`Mode: ${mode}  ·  Diminishing returns: ${cfg.diminishingReturns || 'moderate'} (${DR}${cfg.diminishingReturns ? '' : ", AAJ's default"})`);
  if (note) out.push('\n⚠ ' + note + '\n');
  out.push('');
  const pad = (s, n) => String(s).padEnd(n);
  const padl = (s, n) => String(s).padStart(n);
  out.push(pad('Channel', 14) + padl('Spend', 10) + padl('%', 6) + padl('Per day', 9) + padl('Customers', 11) + padl('CAC', 9) + padl('Marg.CAC', 10) + padl('BaseCAC', 9));
  out.push('-'.repeat(78));
  rows.forEach(r => {
    const pc = totSpend > 0 ? Math.round(100 * r.spend / totSpend) : 0;
    out.push(pad(r.channel, 14) + padl(money(r.spend), 10) + padl(pc + '%', 6) + padl(money(r.daily), 9) + padl(one(r.customers), 11) + padl(r.cac != null ? money(r.cac) : '—', 9) + padl(money(r.marginalCAC), 10) + padl(money(r.baseCAC), 9));
  });
  out.push('-'.repeat(78));
  out.push(pad('BLENDED', 14) + padl(money(totSpend), 10) + padl('100%', 6) + padl(money(totalPace.daily), 9) + padl(one(totCust), 11) + padl(money(blendedCAC), 9));
  out.push('');
  const derived = chs.filter(c => c.fromResults);
  if (derived.length) {
    out.push("From results (each curve is fitted through the channel's own monthly spend and customers):");
    derived.forEach(c => {
      const rates = c.model === 'cpl' ? `Cost per lead ${money2(c.cpl)}, lead-to-customer ${num(c.l2c)}%` : c.clickToCustomer ? `CPC ${money2(c.cpc)}, click-to-customer ${num(c.cvr)}% (no lead stage given)` : `CPC ${money2(c.cpc)}, click-to-lead ${num(c.cvr)}%, lead-to-customer ${num(c.l2c)}%`;
      out.push(`  ${LABEL[c.key]}: ${money(c.obsSpend)} a month for ${two(c.obsCustomers)} customers (${money(c.obsSpend / c.obsCustomers)} each${c.obsMonths > 1 ? `, ${c.obsMonths} months averaged` : ''}). Base CAC at low spend ${money(c.baseCAC)}. ${rates}.`);
    });
    derived.filter(c => c.obsSpend > c.cap).forEach(c => out.push(`\u26a0 ${LABEL[c.key]} spent ${money(c.obsSpend)} a month, above its ${money(c.cap)} scale cap, so the fit leans heavily on the cap. Check it before budgeting from this.`));
    out.push('');
  }
  const metrics = [];
  if (ltvcac != null) metrics.push(`LTV:CAC ${one(ltvcac)}:1`);
  if (roas != null) metrics.push(`ROAS ${one(roas)}x`);
  if (payback != null) metrics.push(`CAC payback ${one(payback)} mo`);
  if (metrics.length) out.push(metrics.join('   ·   '));
  const skipped = [ltvcac == null && 'LTV:CAC (give ltv)', roas == null && 'ROAS (give acv)', payback == null && 'CAC payback (give acv and margin)'].filter(Boolean);
  if (skipped.length) out.push('Not computed, because the input was not given: ' + skipped.join(', ') + '.');
  if (ltvcac != null) out.push(ltvcac >= 3 ? '✓ LTV:CAC is above 3:1, David Skok\'s SaaS reference point (paid-media CAC only).' : '▼ LTV:CAC is below 3:1, David Skok\'s SaaS reference point — lift LTV or cut CAC before scaling.');
  if (lastAboveLtv) out.push(`⚠ The last customers in this plan cost ${money(lastCustomerCost)} each, more than the ${money(ltv)} LTV they are worth. Past that point extra spend loses money; ${mode === 'goal' ? 'lower the goal or add cheaper channels' : 'cut the budget until the last customer costs less than LTV'}.`);
  const thin = rows.filter(r => r.spend > 0 && r.spend < 1500);
  if (thin.length >= 2) out.push(`⚠ ${thin.length} channels are funded under ~$1,500/mo (${thin.map(t => t.channel).join(', ')}) — this engine's rule of thumb for enough budget to learn from. Consider consolidating.`);
  const ph = rows.filter(r => r.placeholderInputs);
  // A channel that is only partly on placeholders names the inputs that still are.
  const FIELD = { cpc: 'CPC', cvr: 'click-to-lead %', l2c: 'lead-to-customer %', cap: 'scale cap', cpl: 'cost per lead' };
  const phName = p => { const all = p.inputs.cpl !== undefined ? 3 : 4; return p.placeholderFields.length < all ? `${p.channel} (${p.placeholderFields.map(f => FIELD[f]).join(', ')})` : p.channel; };
  if (ph.length) out.push(`⚠ Placeholder inputs: ${ph.map(phName).join(', ')} ${ph.length === 1 ? 'uses' : 'use'} AAJ's illustrative defaults, not benchmarks. Replace with account data before budgeting from this.`);
  const zero = rows.filter(r => r.spend === 0);
  if (zero.length) out.push(`• Excluded at this budget (base CAC too high to compete): ${zero.map(z => z.channel).join(', ')}.`);
  out.push('');
  if (totSpend >= 1) out.push(`Pacing: ${money(totalPace.weekly)} a week and ${money(totalPace.daily)} a day in total (month \u00f7 ${DAYS_PER_MONTH}, the average days in a month, as Google Ads counts a monthly limit).`);
  rangeLines(mode, cfg, range, ltvcac).forEach(l => out.push(l));
  if (cfg.showMath) {
    const funded = chs.map((c, i) => ({ c, spend: spends[i] })).filter(x => x.spend >= 0.5);
    if (funded.length) {
      out.push('');
      out.push('How each number is worked out (figures rounded for display)');
      funded.forEach(x => mathLines(LABEL[x.c.key] || x.c.key, x.c, x.spend, DR).forEach(l => out.push(l)));
    }
  }
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    model: own ? null : (cfg.model || 'saas'), onlyListedChannels: own, mode, diminishingReturns: cfg.diminishingReturns || 'moderate',
    totalSpend: Math.round(totSpend), customers: Math.round(totCust * 10) / 10,
    goalShortfall: mode === 'goal' ? Math.round(goalShortfall * 10) / 10 : undefined,
    lastCustomerCost: Math.round(lastCustomerCost), lastCustomerAboveLtv: ltv == null ? null : lastAboveLtv,
    blendedCAC: Math.round(blendedCAC), ltvCac: ltvcac == null ? null : Math.round(ltvcac * 100) / 100,
    roas: roas == null ? null : Math.round(roas * 100) / 100, cacPaybackMonths: payback == null ? null : Math.round(payback * 10) / 10,
    pacing: { daysPerMonth: DAYS_PER_MONTH, weekly: Math.round(totalPace.weekly * 100) / 100, daily: Math.round(totalPace.daily * 100) / 100 },
    range: {
      pct: range.pct, isDefault: range.isDefault,
      ifCostsLower: rangeJson(range.ifCostsLower, mode), ifCostsHigher: rangeJson(range.ifCostsHigher, mode)
    },
    placeholderChannels: rows.filter(r => r.placeholderInputs).map(r => r.channel),
    ltvCacReference: { figure: 'LTV:CAC above 3:1', source: 'David Skok, SaaS Metrics 2.0', url: 'https://www.forentrepreneurs.com/saas-metrics-2/' },
    allocation: rows
  }, null, 2));
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h') {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*/, ''));
  process.exit(0);
}
let cfg;
if (arg) {
  try { cfg = JSON.parse(arg); }
  catch (e) { console.error('Invalid JSON config. Run with --help for the schema.\n' + e.message); process.exit(1); }
} else {
  // Demo: B2B SaaS, $30k budget, moderate diminishing returns.
  cfg = { model: 'saas', mode: 'budget', budget: 30000, diminishingReturns: 'moderate' };
  console.log('(no config supplied — running demo: B2B SaaS, $30,000 budget)');
}
const problems = validate(cfg);
if (problems.length) { console.error(problems.join('\n') + '\nRun --help for the input shape.'); process.exit(1); }
console.log(run(cfg));
