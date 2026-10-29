#!/usr/bin/env node
/*
 * AAJ AI Referral Share Reader - engine
 * Part of the "ai-referral-share" Agent Skill.
 *
 * Reads a Google Analytics 4 traffic-acquisition export (session source /
 * medium, sessions, key events, optional revenue and engaged sessions) and
 * separates the visits AI assistants sent: ChatGPT, Perplexity, Gemini,
 * Copilot, Claude, DeepSeek and Grok. Reports each assistant's share of
 * sessions and key events, and whether its key-event rate really differs from
 * the rest of the site or the data is too thin to tell.
 *
 * USAGE
 *   node ai-referral-share.js                    # demo (Example Co., invented numbers)
 *   node ai-referral-share.js '<json-config>'    # your own
 *   node ai-referral-share.js --help
 *
 * CONFIG (JSON) - give rows, or the export pasted as csv, not both.
 *   {
 *     "rows": [                                   // one row per session source / medium
 *       { "source": "chatgpt.com", "medium": "referral", "sessions": 310, "keyEvents": 19,
 *         "convertingSessions": 15,               // optional: sessions with a key event
 *         "revenue": 0, "engagedSessions": 220 }  // revenue and engagedSessions optional
 *     ],
 *     "csv": "...",                               // or: the GA4 CSV export, as text
 *     "totals": { "sessions": 9000, "keyEvents": 300 },  // optional: site totals, when the rows are not all your traffic
 *     "extra": [ { "name": "Le Chat", "match": "chat.mistral.ai" } ],  // optional: more assistants to count
 *     "currency": "$"                             // optional
 *   }
 *
 * HOW A ROW IS COUNTED AS AN ASSISTANT
 *   Its source equals one of the assistant's web addresses, or ends with "." and
 *   one of them, after lowercasing and dropping "www." and any protocol. Each
 *   address is the one the assistant's maker publishes (sources in ASSISTANTS).
 *   A row with medium "ai-assistant" (which GA4 sets for AI assistant visits) and
 *   an unknown source counts as "Other AI assistant".
 *
 * IS THE DIFFERENCE REAL?
 *   Sessions with a key event (when the export has "Session key event rate") or
 *   else key events, per session, for an assistant vs the rest of the site,
 *   compared as a ratio of two rates with an exact interval (conditional
 *   binomial, Clopper-Pearson). 95% for all assistants combined; for single
 *   assistants the 5% is split across the assistants compared (Bonferroni).
 *   Higher or lower when the interval excludes 1; about the same when it sits
 *   inside 0.9 to 1.1; otherwise not enough data. AAJ's choice of test and rules.
 *   Key events can repeat within a session, which makes that interval somewhat
 *   too narrow; sessions with a key event avoid that.
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
// Each assistant's web addresses, as its maker publishes them (checked 2026-10-28). Addresses in
// aajAdded are not stated in the cited page's text; AAJ adds them because they are the maker's own domain.
var ASSISTANTS = [
  { name: 'ChatGPT', match: ['chatgpt.com', 'chat.openai.com'], aajAdded: ['chat.openai.com'], source: 'OpenAI, Publishers and Developers FAQ: "ChatGPT automatically includes the UTM parameter utm_source=chatgpt.com in referral URLs"', url: 'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq' },
  { name: 'Perplexity', match: ['perplexity.ai'], aajAdded: ['perplexity.ai'], source: 'Perplexity Help Center, hosted on perplexity.ai (the page links there but does not state the address in its text)', url: 'https://www.perplexity.ai/help-center/en/articles/11502647-supported-browsers-for-perplexity-web-app' },
  { name: 'Gemini', match: ['gemini.google.com'], source: 'Google, Gemini Apps Help: "the Gemini web app, gemini.google.com"', url: 'https://support.google.com/gemini/answer/13278668' },
  { name: 'Copilot', match: ['copilot.microsoft.com', 'copilot.com', 'copilot.cloud.microsoft'], aajAdded: ['copilot.microsoft.com'], source: 'Microsoft Support: "Go to www.copilot.com to access the web app" and "Go to copilot.cloud.microsoft"', url: 'https://support.microsoft.com/en-us/microsoft-365-copilot/what-is-microsoft-copilot-app' },
  { name: 'Claude', match: ['claude.ai'], source: 'Anthropic, Claude Help Center: "Chat (claude.ai)"', url: 'https://support.claude.com/en/articles/8114487-what-interfaces-can-i-use-to-access-claude' },
  { name: 'DeepSeek', match: ['chat.deepseek.com'], source: 'DeepSeek home page: "Chat with DeepSeek" links to chat.deepseek.com', url: 'https://deepseek.com/en/' },
  { name: 'Grok', match: ['grok.com'], source: 'Grok docs (SpaceXSI Docs): "Grok is SpaceXSI\'s assistant, available on the web at grok.com"', url: 'https://docs.x.ai/grok/overview' }
];
var GOOGLE_NOTE = { text: 'Google\'s AI Assistant channel excludes AI Overviews and AI Mode, so clicks from those arrive as Google search and cannot be separated here.', url: 'https://support.google.com/analytics/answer/9756891' };
var ALPHA = 0.05;          // AAJ's choice: 95% intervals
var SIMILAR = 0.10;        // AAJ's rule: an interval inside 0.9 to 1.1 means no real difference
// AAJ's heuristic for sources worth a second look: a part of the address that names an AI product, or gpt / llm.
var AI_WORDS = ['openai', 'chatgpt', 'perplexity', 'gemini', 'claude', 'anthropic', 'copilot', 'deepseek', 'grok', 'mistral', 'poe', 'phind', 'kagi', 'character'];
var RESERVED = ['all ai assistants', 'other ai assistant'];
var BIG = 1e12;

var FIELDS = ['rows', 'csv', 'totals', 'extra', 'currency'];
var ROW_FIELDS = ['source', 'medium', 'sessions', 'keyEvents', 'convertingSessions', 'revenue', 'engagedSessions'];

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function looksAi(host) {
  if (/gpt|llm/.test(host) || host === 'meta.ai' || /\.meta\.ai$/.test(host)) return true;
  var labels = host.split('.');
  for (var i = 0; i < labels.length; i++) if (AI_WORDS.indexOf(labels[i]) >= 0) return true;
  return false;
}

// ---- exact interval for a ratio of two Poisson rates -----------------------
function lgamma(x) {
  var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  var s = 1.000000000190015;
  for (var j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function betacf(a, b, x) {
  var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, TINY = 1e-300;
  if (Math.abs(d) < TINY) d = TINY; d = 1 / d; var h = d;
  for (var m = 1; m <= 300; m++) {
    var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
    var del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}
function betai(a, b, x) {   // regularized incomplete beta I_x(a, b)
  if (x <= 0) return 0; if (x >= 1) return 1;
  var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
function betaInv(p, a, b) { var lo = 0, hi = 1; for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2; if (betai(a, b, mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; }
// k1 events in n1 sessions vs k2 in n2: conditional on k1 + k2, k1 is binomial with p = n1 r1 / (n1 r1 + n2 r2).
// ratio and high are null when they are unbounded (no events on the other side).
function rateRatio(k1, n1, k2, n2, alpha) {
  if (!(n1 > 0) || !(n2 > 0) || k1 + k2 === 0) return null;
  var lo = k1 === 0 ? 0 : betaInv(alpha / 2, k1, k2 + 1), hi = k2 === 0 ? 1 : betaInv(1 - alpha / 2, k1 + 1, k2);
  var toRR = function (p) { return p >= 1 ? null : (p / (1 - p)) * (n2 / n1); };
  return { ratio: k2 === 0 ? null : (k1 / n1) / (k2 / n2), low: toRR(lo), high: toRR(hi), alpha: alpha };
}

// ---- reading the export -----------------------------------------------------
function num(v, label, row, integer) {
  if (v == null || v === '') return null;
  if (typeof v !== 'number' && typeof v !== 'string') throw inputError('Row ' + row + ': "' + label + '" must be a number.');
  var x = typeof v === 'number' ? v : Number(String(v).replace(/[,\s$€£]/g, ''));
  if (!isNum(x) || x < 0 || x > BIG) throw inputError('Row ' + row + ': "' + label + '" must be a number from 0 to 1,000,000,000,000 (got ' + JSON.stringify(v) + ').');
  if (integer && Math.floor(x) !== x) throw inputError('Row ' + row + ': "' + label + '" must be a whole number (got ' + JSON.stringify(v) + ').');
  return x;
}
function text(v, label, row) {
  if (v == null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw inputError('Row ' + row + ': "' + label + '" must be text.');
  return String(v).trim();
}
function splitCsvLine(l) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < l.length; i++) {
    var ch = l[i];
    if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === '\t') { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim()); return out;
}
// "source / medium" in one field: split on the last " / ", so app referrers such as android-app://x stay whole.
function splitSourceMedium(s) {
  var i = s.lastIndexOf(' / ');
  return i < 0 ? { source: s.trim(), medium: '' } : { source: s.slice(0, i).trim(), medium: s.slice(i + 3).trim() };
}
// GA4's CSV export starts with "#" comment lines; the first other line is the header.
function readCsv(csv, notes) {
  var lines = String(csv).replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== '' && !/^\s*#/.test(l); });
  if (lines.length < 2) throw inputError('The CSV needs a header row and at least one data row.');
  var raw = splitCsvLine(lines[0]), head = raw.map(function (h) { return h.toLowerCase(); });
  var cols = function (re) { var o = []; for (var i = 0; i < head.length; i++) if (re.test(head[i])) o.push(i); return o; };
  var col = function (re) { var o = cols(re); return o.length ? o[0] : -1; };
  var cSM = col(/source\s*\/\s*medium/), cS = cSM >= 0 ? cSM : col(/source/), cM = cSM >= 0 ? -1 : col(/medium/);
  var cSess = col(/^sessions$/), keCols = cols(/^key events|^conversions/), cKe = keCols.length ? keCols[0] : -1;
  var cRate = col(/^session key event rate|^session conversion rate/), cRev = col(/revenue/), cEng = col(/^engaged sessions$/);
  if (cS < 0 || cSess < 0) throw inputError('The CSV needs a source column (such as "Session source / medium") and a "Sessions" column.', 'Export GA4\'s Traffic acquisition report with the dimension "Session source / medium".');
  if (/first user/.test(head[cS])) notes.push('The export uses ' + raw[cS] + '. The reader is built for session source; first-user source credits a user\'s first visit, not each session.');
  if (keCols.length > 1) notes.push('The export has ' + keCols.length + ' key event columns; the reader used "' + raw[cKe] + '".');
  if (cKe < 0 && cRate < 0) notes.push('No key events column was found, so the reader compares sessions only.');
  var rows = [], rate = [];
  lines.slice(1).forEach(function (l) {
    var c = splitCsvLine(l), s = c[cS] || '', r = { source: s };
    if (cSM >= 0) { var sm = splitSourceMedium(s); r.source = sm.source; r.medium = sm.medium; }
    else if (cM >= 0) r.medium = c[cM];
    r.sessions = c[cSess]; if (cKe >= 0) r.keyEvents = c[cKe]; if (cRev >= 0) r.revenue = c[cRev]; if (cEng >= 0) r.engagedSessions = c[cEng];
    rows.push(r); rate.push(cRate >= 0 ? c[cRate] : '');
  });
  // Session key event rate: share of sessions with a key event. GA4 may export it as 0.032 or 3.2%.
  if (cRate >= 0) {
    var pctForm = rate.some(function (v) { return /%/.test(v) || Number(String(v).replace(/[,\s]/g, '')) > 1; });
    rows.forEach(function (r, i) {
      var v = String(rate[i] || '').replace(/[,\s%]/g, '');
      var sess = Number(String(r.sessions || '').replace(/[,\s]/g, ''));
      if (v !== '' && isNum(Number(v)) && isNum(sess)) r.convertingSessions = Math.round(Number(v) / (pctForm ? 100 : 1) * sess);
    });
  }
  return rows;
}

function hostOf(source) {
  return String(source || '').toLowerCase().replace(/^\s+/, '').replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[\/?#\s].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '');
}
function matchAssistant(host, list) {
  for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i].match.length; j++) {
    var d = list[i].match[j];
    if (host === d || host.slice(-(d.length + 1)) === '.' + d) return list[i];
  }
  return null;
}

function normalise(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw inputError('The config must be a JSON object.');
  Object.keys(cfg).forEach(function (k) { if (FIELDS.indexOf(k) < 0) throw inputError('Unknown field "' + k + '".', 'Allowed: ' + FIELDS.join(', ') + '.'); });
  if (cfg.rows != null && cfg.csv != null) throw inputError('Give rows or csv, not both.');
  if (cfg.currency != null && typeof cfg.currency !== 'string') throw inputError('"currency" must be text, such as "$".');
  var notes = [], raw;
  if (cfg.csv != null) { if (typeof cfg.csv !== 'string') throw inputError('"csv" must be the export as text.'); raw = readCsv(cfg.csv, notes); }
  else if (Array.isArray(cfg.rows)) raw = cfg.rows;
  else throw inputError('Give "rows" (a list of sources) or "csv" (the GA4 export as text).', 'See --help.');
  if (!raw.length) throw inputError('There are no rows to read.');
  if (raw.length > 5000) throw inputError('Up to 5,000 rows at a time.');
  var extra = [], taken = ASSISTANTS.map(function (a) { return a.name.toLowerCase(); }).concat(RESERVED);
  if (cfg.extra != null) {
    if (!Array.isArray(cfg.extra) || cfg.extra.length > 20) throw inputError('"extra" must be a list of up to 20 { "name", "match" } items.');
    cfg.extra.forEach(function (x, i) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) throw inputError('extra[' + i + '] must be { "name", "match" }.');
      Object.keys(x).forEach(function (k) { if (k !== 'name' && k !== 'match') throw inputError('extra[' + i + ']: unknown field "' + k + '".'); });
      if (typeof x.name !== 'string' || !x.name.trim() || typeof x.match !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(x.match.trim()))
        throw inputError('extra[' + i + '] needs a "name" and a "match" web address such as chat.mistral.ai.');
      var name = x.name.trim().slice(0, 40);
      if (taken.indexOf(name.toLowerCase()) >= 0) throw inputError('extra[' + i + ']: the name "' + name + '" is already in use. Give each assistant its own name.');
      taken.push(name.toLowerCase());
      extra.push({ name: name, match: [x.match.trim().toLowerCase().replace(/^www\./, '')], source: 'Added by you', url: null });
    });
  }
  var rows = [], skipped = 0;
  raw.forEach(function (r, i) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw inputError('Row ' + (i + 1) + ' must be an object.');
    Object.keys(r).forEach(function (k) { if (ROW_FIELDS.indexOf(k) < 0) throw inputError('Row ' + (i + 1) + ': unknown field "' + k + '".', 'Allowed: ' + ROW_FIELDS.join(', ') + '.'); });
    var src = text(r.source, 'source', i + 1), med = text(r.medium, 'medium', i + 1);
    if (!med && src.indexOf(' / ') >= 0) { var sm = splitSourceMedium(src); src = sm.source; med = sm.medium; }
    if (!src || /^(grand )?totals?$/i.test(src)) { skipped++; return; }
    var o = { source: src, medium: med, sessions: num(r.sessions, 'sessions', i + 1, true),
      keyEvents: num(r.keyEvents, 'keyEvents', i + 1, true), convertingSessions: num(r.convertingSessions, 'convertingSessions', i + 1, true),
      revenue: num(r.revenue, 'revenue', i + 1), engagedSessions: num(r.engagedSessions, 'engagedSessions', i + 1, true) };
    if (o.sessions === null) throw inputError('Row ' + (i + 1) + ' (' + src + ') has no sessions.');
    if (o.engagedSessions !== null && o.engagedSessions > o.sessions) throw inputError('Row ' + (i + 1) + ' (' + src + ') has more engaged sessions than sessions.');
    if (o.convertingSessions !== null && o.convertingSessions > o.sessions) throw inputError('Row ' + (i + 1) + ' (' + src + ') has more sessions with a key event than sessions.');
    rows.push(o);
  });
  if (skipped) notes.push(skipped + ' row' + (skipped > 1 ? 's' : '') + ' with no source or labelled as a total ' + (skipped > 1 ? 'were' : 'was') + ' left out.');
  if (!rows.length) throw inputError('No rows with a source and sessions.');
  // Every row must carry the measure the comparison uses, or the missing ones would count as zero.
  ['keyEvents', 'convertingSessions'].forEach(function (k) {
    var have = rows.filter(function (r) { return r[k] !== null; }).length;
    if (have && have < rows.length) {
      var miss = rows.filter(function (r) { return r[k] === null; })[0];
      throw inputError('Some rows have ' + (k === 'keyEvents' ? 'key events' : 'sessions with a key event') + ' and some don\'t, for example ' + miss.source + '. Fill the blanks with 0 or remove those rows.');
    }
  });
  var totals = null;
  if (cfg.totals != null) {
    if (typeof cfg.totals !== 'object' || Array.isArray(cfg.totals)) throw inputError('"totals" must be { "sessions", "keyEvents" }.');
    Object.keys(cfg.totals).forEach(function (k) { if (['sessions', 'keyEvents'].indexOf(k) < 0) throw inputError('totals: unknown field "' + k + '".'); });
    totals = { sessions: num(cfg.totals.sessions, 'totals.sessions', 'totals', true), keyEvents: num(cfg.totals.keyEvents, 'totals.keyEvents', 'totals', true) };
    if (totals.sessions === null) throw inputError('"totals" needs sessions.');
  }
  return { rows: rows, totals: totals, extra: extra, notes: notes, currency: cfg.currency == null ? '$' : cfg.currency.slice(0, 4) };
}

function run(cfg) {
  var s = normalise(cfg), list = ASSISTANTS.concat(s.extra), notes = s.notes.slice();
  var hasKe = s.rows[0].keyEvents !== null, hasConv = s.rows[0].convertingSessions !== null,
    hasRev = s.rows.some(function (r) { return r.revenue !== null; }), hasEng = s.rows.some(function (r) { return r.engagedSessions !== null; });
  // The comparison uses sessions with a key event when the export has them (each session counts once);
  // otherwise key events, which one session can trigger several times.
  var basis = hasConv ? 'convertingSessions' : hasKe ? 'keyEvents' : null;
  if (basis === 'keyEvents') notes.push('The comparison counts key events, and one session can trigger several. That makes the interval somewhat too narrow. Export "Session key event rate" too, and the reader compares sessions with a key event instead.');
  var sum = { sessions: 0, keyEvents: 0, convertingSessions: 0, revenue: 0, engagedSessions: 0 };
  var by = Object.create(null), check = [];
  s.rows.forEach(function (r) {
    sum.sessions += r.sessions; sum.keyEvents += r.keyEvents || 0; sum.convertingSessions += r.convertingSessions || 0; sum.revenue += r.revenue || 0; sum.engagedSessions += r.engagedSessions || 0;
    var host = hostOf(r.source), a = matchAssistant(host, list), name = a ? a.name : (String(r.medium).toLowerCase() === 'ai-assistant' ? 'Other AI assistant' : null);
    if (!name) { if (looksAi(host)) check.push({ source: r.source, medium: r.medium, sessions: r.sessions }); return; }
    var b = by[name] = by[name] || { name: name, sessions: 0, keyEvents: 0, convertingSessions: 0, revenue: 0, engagedSessions: 0, sources: [], evidence: a ? { text: a.source, url: a.url } : { text: 'GA4 gave these sessions the medium ai-assistant', url: GOOGLE_NOTE.url } };
    b.sessions += r.sessions; b.keyEvents += r.keyEvents || 0; b.convertingSessions += r.convertingSessions || 0; b.revenue += r.revenue || 0; b.engagedSessions += r.engagedSessions || 0;
    var label = r.source + (r.medium ? ' / ' + r.medium : '');
    if (b.sources.indexOf(label) < 0) b.sources.push(label);
  });
  var total = { sessions: sum.sessions, keyEvents: sum.keyEvents, convertingSessions: sum.convertingSessions, from: 'sum of rows' };
  if (s.totals) {
    if (s.totals.sessions < sum.sessions) throw inputError('totals.sessions (' + s.totals.sessions + ') is less than the rows add up to (' + sum.sessions + ').');
    if (s.totals.keyEvents !== null && s.totals.keyEvents < sum.keyEvents) throw inputError('totals.keyEvents (' + s.totals.keyEvents + ') is less than the rows add up to (' + sum.keyEvents + ').');
    if (basis === 'convertingSessions') throw inputError('Site totals work with key events, not with session key event rate. Leave totals empty when the export has every row, or remove the rate column.');
    total = { sessions: s.totals.sessions, keyEvents: s.totals.keyEvents !== null ? s.totals.keyEvents : sum.keyEvents, convertingSessions: null, from: 'entered' };
    if (s.totals.keyEvents === null && hasKe) notes.push('Site key events are the sum of the rows, because totals gave sessions only.');
  } else notes.push('Site totals are the sum of the rows. If the export was filtered or cut short, enter your site totals instead.');
  if (total.sessions <= 0) throw inputError('Total sessions must be above 0.');

  var names = ASSISTANTS.map(function (a) { return a.name; }).concat(s.extra.map(function (a) { return a.name; }), ['Other AI assistant']);
  var found = names.filter(function (n) { return by[n]; }).map(function (n) { return by[n]; });
  var ai = { name: 'All AI assistants', sessions: 0, keyEvents: 0, convertingSessions: 0, revenue: 0, engagedSessions: 0 };
  found.forEach(function (b) { ai.sessions += b.sessions; ai.keyEvents += b.keyEvents; ai.convertingSessions += b.convertingSessions; ai.revenue += b.revenue; ai.engagedSessions += b.engagedSessions; });

  var compared = found.filter(function (b) { return b.sessions > 0; }).length;
  var alphaEach = compared > 1 ? ALPHA / compared : ALPHA;
  function describe(b, alpha) {
    var o = { name: b.name, sessions: b.sessions, sessionShare: b.sessions / total.sessions };
    if (hasKe) { o.keyEvents = b.keyEvents; o.keyEventShare = total.keyEvents > 0 ? b.keyEvents / total.keyEvents : null; o.keyEventsPerSession = b.sessions > 0 ? b.keyEvents / b.sessions : null; }
    if (hasConv) { o.convertingSessions = b.convertingSessions; o.sessionKeyEventRate = b.sessions > 0 ? b.convertingSessions / b.sessions : null; }
    if (basis) {
      var k = b[basis], restS = total.sessions - b.sessions, restK = total[basis] - k;
      o.restRate = restS > 0 ? restK / restS : null;
      var rr = b.sessions > 0 ? rateRatio(k, b.sessions, restK, restS, alpha) : null;
      if (rr) {
        var verdict = rr.low > 1 ? 'higher' : (rr.high !== null && rr.high < 1) ? 'lower'
          : (rr.high !== null && rr.low >= 1 - SIMILAR && rr.high <= 1 + SIMILAR) ? 'similar' : 'unclear';
        o.vsRest = { basis: basis, ratio: rr.ratio, low: rr.low, high: rr.high, confidence: 1 - alpha, verdict: verdict };
      } else o.vsRestReason = b.sessions === 0 ? 'No sessions to compare.' : restS <= 0 ? 'All sessions came from here, so there is no rest of the site to compare with.'
        : k + restK === 0 ? 'No ' + (basis === 'keyEvents' ? 'key events' : 'sessions with a key event') + ' anywhere to compare.' : 'Nothing to compare.';
    }
    if (hasRev) { o.revenue = b.revenue; o.revenuePerSession = b.sessions > 0 ? b.revenue / b.sessions : null; }
    if (hasEng) o.engagementRate = b.sessions > 0 ? b.engagedSessions / b.sessions : null;
    if (b.sources) { o.sources = b.sources; o.evidence = b.evidence; }
    return o;
  }
  var out = { total: total, basis: basis, combined: describe(ai, ALPHA), assistants: found.map(function (b) { return describe(b, alphaEach); }),
    perAssistantConfidence: 1 - alphaEach, assistantsCompared: compared, toCheck: check, notes: notes, hasKeyEvents: hasKe, hasConvertingSessions: hasConv, currency: s.currency,
    rest: { revenuePerSession: hasRev && !s.totals && sum.sessions - ai.sessions > 0 ? (sum.revenue - ai.revenue) / (sum.sessions - ai.sessions) : null,
      engagementRate: hasEng && !s.totals && sum.sessions - ai.sessions > 0 ? (sum.engagedSessions - ai.engagedSessions) / (sum.sessions - ai.sessions) : null },
    assistantList: ASSISTANTS.map(function (a) { return { name: a.name, match: a.match, aajAdded: a.aajAdded || [], source: a.source, url: a.url }; }), googleNote: GOOGLE_NOTE };
  if (compared > 1) out.notes.push('Each assistant is compared with everything else, including the other assistants. With ' + compared + ' assistants compared, each single-assistant interval is ' + Math.round((1 - alphaEach) * 1000) / 10 + '% (the 5% split ' + compared + ' ways), so a chance difference is less likely to be called real. The combined result uses its own 95%.');
  out.notes.push(GOOGLE_NOTE.text);
  if (!found.length) out.notes.push('No sessions from the assistants this reader knows. If you expected some, check the "worth a second look" list and that the export uses session source.');

  // The headline, in plain words.
  var c = out.combined, pct = function (x) { return (x * 100).toFixed(x > 0 && x < 0.001 ? 2 : 1) + '%'; };
  var head = 'AI assistants sent ' + c.sessions.toLocaleString('en-US') + ' of ' + total.sessions.toLocaleString('en-US') + ' sessions (' + pct(c.sessionShare) + ')';
  if (hasKe && total.keyEvents > 0) head += ' and ' + c.keyEvents.toLocaleString('en-US') + ' of ' + total.keyEvents.toLocaleString('en-US') + ' key events (' + pct(c.keyEventShare) + ')';
  head += '.';
  var conv = basis === 'convertingSessions';
  if (c.vsRest) head += c.vsRest.verdict === 'higher' ? ' Their visits ' + (conv ? 'lead to a key event more often than' : 'produce more key events per session than') + ' the rest of the site.'
    : c.vsRest.verdict === 'lower' ? ' Their visits ' + (conv ? 'lead to a key event less often than' : 'produce fewer key events per session than') + ' the rest of the site.'
    : c.vsRest.verdict === 'similar' ? ' Their visits perform about the same as the rest of the site (within 10%).'
    : ' There is not enough data yet to say whether their visits perform better or worse than the rest of the site.';
  out.headline = head;
  return out;
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const L = [];
  const pct = (x) => x == null ? 'n/a' : (x * 100).toFixed(x < 0.001 && x > 0 ? 2 : 1) + '%';
  const per100 = (x) => x == null ? 'n/a' : (x * 100).toFixed(1) + ' per 100 sessions';
  const fx = (v) => v == null ? 'no upper limit' : v.toFixed(2);
  const ratio = (v) => `${v.ratio == null ? 'n/a (the rest of the site has none)' : v.ratio.toFixed(2) + 'x'} (${Math.round(v.confidence * 1000) / 10}% interval ${v.low.toFixed(2)} to ${fx(v.high)})`;
  const money = (v) => (v < 0 ? '-' : '') + r.currency + Math.abs(v).toFixed(2);
  const WORD = { higher: 'higher', lower: 'lower', similar: 'about the same (within 10%)', unclear: 'not enough data to tell' };
  L.push('AI REFERRAL SHARE');
  L.push('═'.repeat(58));
  L.push(r.headline);
  L.push('');
  L.push(`Site total: ${r.total.sessions.toLocaleString('en-US')} sessions` + (r.hasKeyEvents ? `, ${r.total.keyEvents.toLocaleString('en-US')} key events` : '') + ` (${r.total.from})`);
  if (r.basis) L.push(`Compared by: ${r.basis === 'convertingSessions' ? 'sessions with a key event (from session key event rate)' : 'key events per session'}`);
  const line = (a) => {
    L.push(`${a.name}`);
    L.push(`  Sessions      ${a.sessions.toLocaleString('en-US')} (${pct(a.sessionShare)} of all)`);
    if (r.hasKeyEvents) L.push(`  Key events    ${a.keyEvents.toLocaleString('en-US')} (${pct(a.keyEventShare)} of all), ${per100(a.keyEventsPerSession)}`);
    if (r.hasConvertingSessions) L.push(`  Converting    ${a.convertingSessions.toLocaleString('en-US')} sessions with a key event (${pct(a.sessionKeyEventRate)})`);
    if (r.basis) {
      L.push(`  The rest      ${r.basis === 'convertingSessions' ? pct(a.restRate) + ' of sessions with a key event' : per100(a.restRate)}`);
      L.push(`  vs the rest   ${a.vsRest ? WORD[a.vsRest.verdict] + ': ' + ratio(a.vsRest) : a.vsRestReason}`);
    }
    const all = a.name === 'All AI assistants';
    if (a.revenuePerSession != null) L.push(`  Revenue       ${money(a.revenue)} (${money(a.revenuePerSession)} per session` + (all && r.rest.revenuePerSession != null ? ` vs ${money(r.rest.revenuePerSession)} for the rest)` : ')'));
    if (a.engagementRate != null) L.push(`  Engaged       ${pct(a.engagementRate)} of sessions` + (all && r.rest.engagementRate != null ? ` vs ${pct(r.rest.engagementRate)} for the rest` : ''));
    if (a.sources) L.push(`  From          ${a.sources.join(', ')}`);
  };
  L.push('');
  line(r.combined);
  r.assistants.forEach((a) => { L.push(''); line(a); });
  if (r.toCheck.length) {
    L.push(''); L.push('WORTH A SECOND LOOK (AAJ\'s heuristic: part of the address names an AI product)');
    r.toCheck.forEach((x) => L.push(`  ${x.source}${x.medium ? ' / ' + x.medium : ''}: ${x.sessions.toLocaleString('en-US')} sessions`));
  }
  L.push(''); L.push('NOTES'); r.notes.forEach((n) => L.push('  - ' + n));
  L.push(''); L.push('HOW ASSISTANTS ARE RECOGNISED');
  r.assistantList.forEach((a) => L.push(`  ${a.name}: ${a.match.join(', ')} (${a.url})` + (a.aajAdded.length ? `; ${a.aajAdded.join(', ')} added by AAJ, on the maker's own domain` : '')));
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional; every number here is invented for the demo.
const DEMO = {
  rows: [
    { source: 'google', medium: 'organic', sessions: 4200, keyEvents: 126 },
    { source: '(direct)', medium: '(none)', sessions: 2600, keyEvents: 78 },
    { source: 'newsletter', medium: 'email', sessions: 600, keyEvents: 30 },
    { source: 'linkedin.com', medium: 'referral', sessions: 500, keyEvents: 9 },
    { source: 'chatgpt.com', medium: 'referral', sessions: 310, keyEvents: 19 },
    { source: 'bing', medium: 'organic', sessions: 300, keyEvents: 8 },
    { source: 'perplexity.ai', medium: 'referral', sessions: 95, keyEvents: 4 },
    { source: 'gemini.google.com', medium: 'referral', sessions: 40, keyEvents: 1 },
    { source: 'copilot.microsoft.com', medium: 'referral', sessions: 22, keyEvents: 0 },
    { source: 'claude.ai', medium: 'referral', sessions: 18, keyEvents: 2 },
    { source: 'chat.mistral.ai', medium: 'referral', sessions: 7, keyEvents: 0 },
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

module.exports = { run, render, normalise, rateRatio, ASSISTANTS };
