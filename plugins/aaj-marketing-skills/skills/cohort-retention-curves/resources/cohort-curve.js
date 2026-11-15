#!/usr/bin/env node
/*
 * AAJ Cohort Retention Curves - engine
 * Part of the "cohort-retention-curves" Agent Skill.
 *
 * Builds the average retention curve from cohorts of different ages, says
 * whether and where it levels off, and compares newer cohorts with older ones.
 * The free browser tool (aajconsult.com/tools/cohort-retention-curve-builder)
 * runs this same code.
 *
 * USAGE
 *   node cohort-curve.js                    # demo (Example Co., invented numbers)
 *   node cohort-curve.js '<json-config>'    # your own
 *   node cohort-curve.js --help
 *
 * CONFIG (JSON) - the data as ONE of: cohorts, table or customers.
 *
 *   {
 *     "label": "Example Co., customers by signup month",  // optional
 *     "measure": "customers",        // "customers" (default) or "revenue"
 *     "period": "month",             // "month" (default), "week" or "quarter"; only used for labels
 *     "unit": "count",               // "count" (default) or "percent" of the starting cohort
 *     "flatPts": 2,                  // optional: levels off when each later period moves less
 *                                    //   than this many points of the starting cohort (tool rule)
 *     "comparePeriod": 6,            // optional: the period for newer vs older (else chosen for you)
 *
 *     "cohorts": [                   // (a) one entry per cohort, OLDEST FIRST
 *       { "label": "2026-01", "values": [120, 84, 70, 66] },   // period 0 = starting size
 *       { "label": "2026-02", "values": [95, 70, 57] },        // stop where the cohort stops:
 *       { "label": "2026-03", "values": [140, 101] }           //   no blanks for periods not reached
 *     ],
 *     // with "unit": "percent", period 0 is 100 and each cohort may give "size" (all or none)
 *
 *     // or (b) "table": the same table as text, as pasted into the browser tool:
 *     //   "cohort,month 0,month 1,month 2\n2026-01,120,84,70\n2026-02,95,70"
 *
 *     // or (c) one row per customer, turned into monthly cohorts:
 *     //   "customers": [ { "id": "C-1", "start": "2026-01-14", "end": null },
 *     //                  { "id": "C-2", "start": "2026-01-20", "end": "2026-04-02" } ],
 *     //   "asOf": "2026-04-30"         // optional: defaults to the latest date given
 *   }
 *
 * STRICT INPUTS
 *   Unknown fields, non-numbers, negative values, a later period larger than
 *   the cohort (for customers), a blank followed by more numbers, unreadable
 *   dates, an end before a start: each stops with an error naming the field.
 *   The browser tool reads pasted text leniently and lists what it skipped;
 *   this engine refuses it instead.
 *
 * METHOD
 *   Average curve, chained over the cohorts that reached both periods:
 *     S(0) = 1;  S(k) = S(k-1) x sum v_c(k) / sum v_c(k-1)
 *   For customer counts this is the product-limit estimator for grouped data
 *   (E. L. Kaplan and P. Meier, "Nonparametric estimation from incomplete
 *   observations", Journal of the American Statistical Association 53, 1958).
 *   95% band for customer counts: Greenwood's variance (M. Greenwood, "The
 *   natural duration of cancer", Reports on Public Health and Medical Subjects
 *   33, 1926). Newer vs older: pooled two-proportion z-test (NIST/SEMATECH
 *   e-Handbook of Statistical Methods, 7.3.3), p-value from Abramowitz and
 *   Stegun 26.2.17.
 *
 * TOOL RULES (AAJ's choices, not benchmarks)
 *   MIN_COHORTS = 3     a period is reliable when at least 3 cohorts reached it
 *   FLAT_PTS = 2        levels off from period F when every later reliable period
 *                       moves less than 2 points of the starting cohort, up or down
 *   FLAT_MIN_AFTER = 2  judged over at least 2 later periods
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
/*
 * AAJ Cohort Retention Curve Builder - engine.
 *
 * Input is either a cohort table (one row per cohort, one column per period,
 * counts or percentages) or one row per customer with a start and an end date,
 * which is turned into monthly cohorts.
 *
 * The average curve is chained, period by period, using only the cohorts that
 * have reached both periods:
 *     S(0) = 1
 *     S(k) = S(k-1) * sum_c v_c(k) / sum_c v_c(k-1)   over cohorts observed at k
 * For customer counts this is the product-limit estimator for grouped data
 * (E. L. Kaplan and P. Meier, "Nonparametric estimation from incomplete
 * observations", JASA 53, 1958), so young cohorts do not drag the later part
 * of the curve down just because they have not got there yet. The 95% band
 * for customer counts uses Greenwood's variance (M. Greenwood, "The natural
 * duration of cancer", Reports on Public Health and Medical Subjects 33, 1926).
 *
 * Tool rules, labelled as such on the page (AAJ's choices, not benchmarks):
 *   MIN_COHORTS     a period is "reliable" when at least 3 cohorts have reached it
 *   FLAT_PTS        the curve has levelled off from period F when every later
 *                   reliable period moves less than 2 percentage points of the
 *                   starting cohort, up or down (user can change it; FLAT_PTS_DEFAULT)
 *   FLAT_MIN_AFTER  judged over at least 2 later periods
 *
 * Newer against older cohorts: a pooled two-proportion z-test (NIST/SEMATECH
 * e-Handbook of Statistical Methods, section 7.3.3), with the normal tail from
 * M. Abramowitz and I. A. Stegun, Handbook of Mathematical Functions (1964),
 * formula 26.2.17.
 */

var MIN_COHORTS = 3;
var FLAT_PTS_DEFAULT = 2;
var FLAT_MIN_AFTER = 2;
var Z95 = 1.959964;

/* ---------------- small helpers ---------------- */

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

var NUM_RE = /^[-+]?[$€£¥₹]?\s*(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?\s*%?$/;
function num(s) {
  if (s === undefined || s === null) return NaN;
  var t = String(s).trim().replace(/^"|"$/g, "").trim();
  if (!t || !NUM_RE.test(t) || !/\d/.test(t)) return NaN;
  return parseFloat(t.replace(/[$€£¥₹,%\s+]/g, ""));
}
function isBlank(s) { var t = String(s === undefined ? "" : s).trim().replace(/^"|"$/g, "").trim(); return t === "" || t === "-" || t === "–" || /^n\/?a$/i.test(t); }

function splitRow(line, delim) {
  if (delim === "ws") return line.trim().split(/\s{2,}|\t/);
  if (delim !== ",") return line.split(delim);
  var out = [], cur = "", q = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function detectDelim(lines) {
  var s = lines.slice(0, 5).join("\n");
  if (s.indexOf("\t") >= 0) return "\t";
  if (s.indexOf(";") >= 0 && s.indexOf(",") < 0) return ";";
  if (s.indexOf(",") >= 0) return ",";
  return "ws";
}
function lines(text) { return String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.trim() !== ""; }); }

/* ---------------- cohort table ---------------- */

// unit: "count" (period 0 is the cohort's starting size) or "percent" (of the
// starting cohort). A header is optional; a column headed size / customers /
// users / accounts / starting / n gives each cohort's size.
function parseTable(text, opts) {
  opts = opts || {};
  var unit = opts.unit === "percent" ? "percent" : "count";
  var L = lines(text), out = { cohorts: [], skipped: 0, gaps: 0, overSize: 0, hasSize: false, firstPeriod: 0, unit: unit };
  if (!L.length) return out;
  var delim = detectDelim(L), rows = L.map(function (l) { return splitRow(l, delim); });
  var head = null;
  var first = rows[0], numericAfterFirst = first.slice(1).filter(function (c) { return !isNaN(num(c)); }).length;
  if (first.length > 1 && numericAfterFirst < (first.length - 1) / 2) { head = first; rows = rows.slice(1); }
  var sizeCol = -1, periodStart = 1;
  if (head) {
    for (var h = 1; h < head.length; h++) {
      if (/^\s*"?\s*(cohort\s*size|size|customers|users|accounts|starting|start(ing)?\s*(count|size)|new(\s*customers)?|n)\s*"?\s*$/i.test(head[h])) { sizeCol = h; break; }
    }
    periodStart = sizeCol === 1 ? 2 : 1;
    var m = String(head[periodStart] || "").match(/(\d+)/);
    out.firstPeriod = m ? parseInt(m[1], 10) : 0;
    if (out.firstPeriod > 1) out.firstPeriod = 0;
  }
  out.hasSize = sizeCol > 0;
  rows.forEach(function (r, i) {
    var labelNumeric = !isNaN(num(r[0])) && !/[-\/]/.test(String(r[0]).trim().replace(/^-/, ""));
    var label, cells;
    if (labelNumeric && !head) { label = "Cohort " + (i + 1); cells = r; }
    else { label = String(r[0]).trim().replace(/^"|"$/g, "") || "Cohort " + (i + 1); cells = r.slice(periodStart); }
    var size = sizeCol > 0 ? num(r[sizeCol]) : NaN;
    var vals = [];
    for (var j = 0; j < cells.length; j++) {
      if (isBlank(cells[j])) {
        var rest = cells.slice(j + 1).some(function (c) { return !isBlank(c); });
        if (rest) out.gaps++;
        break;
      }
      var v = num(cells[j]);
      if (isNaN(v)) { vals = null; break; }
      vals.push(v);
    }
    if (!vals || !vals.length) { out.skipped++; return; }
    // period numbering: when the first period column is period 1, period 0 is the size
    if (out.firstPeriod === 1) {
      if (isNaN(size)) { out.skipped++; return; }
      vals.unshift(unit === "percent" ? 100 : size);
    }
    var weighted = true, overStated = false;
    if (unit === "percent") {
      if (isNaN(size) || size <= 0) { weighted = false; size = 100; }
      var base = vals[0] > 0 ? vals[0] : 100;
      vals = vals.map(function (p) { return p / base * size; });
    } else {
      if (isNaN(size)) size = vals[0];
      else if (vals[0] !== size && out.firstPeriod === 0) {
        // Period 0 given and a size column: trust period 0, but a count above the stated size
        // is flagged (retention over 100% of the cohort), never absorbed silently.
        if (vals.some(function (v) { return v > size + 1e-9; })) { out.overSize++; overStated = true; }
        size = vals[0];
      }
    }
    if (!(size > 0)) { out.skipped++; return; }
    out.cohorts.push({ label: label, size: size, values: vals, weighted: weighted, overStated: overStated });
  });
  out.weighted = out.cohorts.length > 0 && out.cohorts.every(function (c) { return c.weighted; });
  return out;
}

/* ---------------- one row per customer ---------------- */

function parseDate(s) {
  var t = String(s === undefined ? "" : s).trim().replace(/^"|"$/g, "").trim();
  if (!t) return null;
  var m;
  if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?(?:[T\s].*)?$/))) return mk(+m[1], +m[2], m[3] ? +m[3] : 1);
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s.*)?$/))) { var y = +m[3]; if (y < 100) y += 2000; return mk(y, +m[1], +m[2]); }
  return undefined;
  function mk(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return undefined;
    return { y: y, m: mo, d: d, t: dt.getTime() };
  }
}
function monthIndex(dt) { return dt.y * 12 + (dt.m - 1); }
function monthStartT(mi) { return Date.UTC(Math.floor(mi / 12), mi % 12, 1); }
function monthLabel(mi) { var y = Math.floor(mi / 12), m = mi % 12 + 1; return y + "-" + (m < 10 ? "0" : "") + m; }

// A customer counts as retained in month k when they had not ended before the
// first day of the k-th month after the month they started. Month k is only
// observed for a cohort once its first day is on or before the as-of date.
function parseCustomers(text, opts) {
  opts = opts || {};
  var L = lines(text), out = { cohorts: [], unreadable: 0, endBeforeStart: 0, customers: 0, asOf: null };
  if (!L.length) return out;
  var delim = detectDelim(L), rows = L.map(function (l) { return splitRow(l, delim); });
  var sCol = -1, eCol = -1, first = rows[0];
  var headerLike = first.every(function (c) { return parseDate(c) === undefined || isBlank(c); }) && first.some(function (c) { return /[a-z]/i.test(c); });
  if (headerLike) {
    first.forEach(function (c, i) {
      if (sCol < 0 && /start|sign.?up|created|joined|acquired|subscribed|first/i.test(c)) sCol = i;
      else if (eCol < 0 && /end|cancel|churn|lost|last|stopp?ed|closed/i.test(c)) eCol = i;
    });
    rows = rows.slice(1);
  }
  if (sCol < 0 || eCol < 0) {
    var w = rows.length ? rows[0].length : 0;
    if (w >= 3) { sCol = w - 2; eCol = w - 1; } else { sCol = 0; eCol = 1; }
  }
  var recs = [], maxT = -Infinity;
  rows.forEach(function (r) {
    var s = parseDate(r[sCol]), e = isBlank(r[eCol]) ? null : parseDate(r[eCol]);
    if (!s || e === undefined) { out.unreadable++; return; }
    if (e && e.t < s.t) { out.endBeforeStart++; return; }
    recs.push({ s: s, e: e });
    maxT = Math.max(maxT, s.t, e ? e.t : -Infinity);
  });
  out.customers = recs.length;
  if (!recs.length) return out;
  var asOf = opts.asOf ? parseDate(opts.asOf) : null;
  var asOfT = asOf ? asOf.t : maxT;
  out.asOf = new Date(asOfT).toISOString().slice(0, 10);
  var by = {};
  recs.forEach(function (x) {
    if (x.s.t > asOfT) return;
    var mi = monthIndex(x.s);
    (by[mi] = by[mi] || []).push(x);
  });
  Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).forEach(function (mi) {
    var g = by[mi], vals = [];
    for (var k = 0; ; k++) {
      var t0 = monthStartT(mi + k);
      if (k > 0 && t0 > asOfT) break;
      if (k === 0) { vals.push(g.length); continue; }
      vals.push(g.filter(function (x) { return !x.e || x.e.t >= t0; }).length);
      if (k > 600) break;
    }
    out.cohorts.push({ label: monthLabel(mi), size: g.length, values: vals, weighted: true });
  });
  out.weighted = true;
  return out;
}

/* ---------------- analysis ---------------- */

function chain(cohorts) {
  var K = 0;
  cohorts.forEach(function (c) { K = Math.max(K, c.values.length); });
  var S = [1], n = [cohorts.length], atRisk = [], survived = [], gw = [0], gwOk = true, cum = 0;
  for (var k = 1; k < K; k++) {
    var num_ = 0, den = 0, cnt = 0;
    cohorts.forEach(function (c) { if (c.values.length > k) { num_ += c.values[k]; den += c.values[k - 1]; cnt++; } });
    n.push(cnt);
    atRisk.push(den); survived.push(num_);
    if (den <= 0) { S.push(S[k - 1] === 0 ? 0 : null); gw.push(null); continue; }
    S.push(S[k - 1] === null ? null : S[k - 1] * num_ / den);
    var d = den - num_;
    if (d < 0 || num_ <= 0) gwOk = false;
    if (gwOk) { cum += d / (den * num_); gw.push(cum); } else gw.push(null);
  }
  return { S: S, n: n, greenwood: gw, greenwoodOk: gwOk, atRisk: atRisk, survived: survived };
}

function lastReliable(n) { var r = 0; for (var k = 0; k < n.length; k++) if (n[k] >= MIN_COHORTS) r = k; return r; }

function flattening(S, last, flatPts) {
  var thr = flatPts / 100;
  for (var F = 1; F <= last - FLAT_MIN_AFTER; F++) {
    var ok = true;
    for (var j = F + 1; j <= last; j++) { if (S[j] === null || S[j - 1] === null || Math.abs(S[j - 1] - S[j]) >= thr) { ok = false; break; } }
    if (ok) {
      var tail = S.slice(F, last + 1);
      return { period: F, level: tail.reduce(function (a, b) { return a + b; }, 0) / tail.length, judgedOver: last - F };
    }
  }
  return null;
}

function normCdf(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

function autoComparePeriod(cohorts) {
  var best = null;
  for (var k = 1; k <= 12; k++) {
    var c = cohorts.filter(function (x) { return x.values.length > k; }).length;
    if (c >= Math.max(4, Math.ceil(cohorts.length / 2))) best = k;
  }
  return best;
}

function compareCohorts(cohorts, P, measure, weighted) {
  var at = cohorts.filter(function (c) { return c.values.length > P; });
  if (at.length < 4) return null;
  var h = Math.floor(at.length / 2), older = at.slice(0, h), newer = at.slice(at.length - h);
  function pool(g) { var a = 0, b = 0; g.forEach(function (c) { a += c.values[P]; b += c.size; }); return { retained: a, size: b, rate: a / b, cohorts: g.length, from: g[0].label, to: g[g.length - 1].label }; }
  var o = pool(older), nw = pool(newer), diff = nw.rate - o.rate, test = null;
  if (measure === "customers" && weighted && o.rate <= 1 && nw.rate <= 1) {
    var p = (o.retained + nw.retained) / (o.size + nw.size), se = Math.sqrt(p * (1 - p) * (1 / o.size + 1 / nw.size));
    if (se > 0) { var z = diff / se; test = { z: z, p: 2 * (1 - normCdf(Math.abs(z))) }; }
  }
  var rates = at.map(function (c) { return { label: c.label, rate: c.values[P] / c.size, size: c.size }; });
  var sorted = rates.slice().sort(function (a, b) { return b.rate - a.rate; });
  return { period: P, older: o, newer: nw, diff: diff, test: test, best: sorted[0], worst: sorted[sorted.length - 1], cohortsCompared: at.length, middleLeftOut: at.length - 2 * h };
}

function analyse(parsed, opts) {
  opts = opts || {};
  var measure = opts.measure === "revenue" ? "revenue" : "customers";
  var flatPts = isFinite(opts.flatPts) && opts.flatPts > 0 ? +opts.flatPts : FLAT_PTS_DEFAULT;
  var cohorts = (parsed.cohorts || []).filter(function (c) { return c.values.length >= 1; });
  var base = { ok: false, measure: measure, cohortCount: cohorts.length };
  if (!cohorts.length) { base.error = "no_rows"; return base; }
  if (!cohorts.some(function (c) { return c.values.length >= 2; })) { base.error = "one_period"; return base; }

  var ch = chain(cohorts), S = ch.S, last = lastReliable(ch.n);
  var weighted = parsed.weighted !== false;
  var band = null;
  if (measure === "customers" && weighted && ch.greenwoodOk) {
    band = S.map(function (s, k) {
      if (s === null || ch.greenwood[k] === null) return null;
      var se = s * Math.sqrt(ch.greenwood[k]);
      return { lo: Math.max(0, s - Z95 * se), hi: Math.min(1, s + Z95 * se) };
    });
  }
  var flat = last >= FLAT_MIN_AFTER + 1 ? flattening(S, last, flatPts) : null;
  var K = Math.min(12, last + 1), area = 0;
  for (var k = 0; k < K; k++) area += S[k] === null ? 0 : S[k];
  var P = opts.comparePeriod && opts.comparePeriod > 0 ? opts.comparePeriod : autoComparePeriod(cohorts);
  var cmp = P ? compareCohorts(cohorts, P, measure, weighted) : null;

  var findings = [];
  var gains = cohorts.filter(function (c) { for (var i = 1; i < c.values.length; i++) if (c.values[i] > c.values[i - 1] + 1e-9) return true; return false; }).length;
  if (measure === "customers" && gains) findings.push({ level: "warn", id: "gains", text: gains + " cohort" + (gains === 1 ? " gains" : "s gain") + " customers between periods. If these are active users coming back, that is reactivation and the curve is an activity curve, not a survival curve. If they are paying customers, check the data: a customer cannot rejoin a cohort they left without a reactivation rule." });
  // One finding per problem, not per symptom: a cohort whose size column is below a count AND whose later
  // period beats its first is one cohort with retention over 100%, counted once.
  var overLater = measure === "customers" ? cohorts.filter(function (c) { return c.values.some(function (v) { return v > c.size + 1e-9; }); }) : [];
  var overAny = cohorts.filter(function (c) { return c.overStated || overLater.indexOf(c) >= 0; });
  if (overAny.length) {
    var nStated = overAny.filter(function (c) { return c.overStated; }).length, nLater = overLater.length;
    var why = [];
    if (nStated) why.push((nStated === overAny.length ? "" : nStated + " of them ") + "a count above the size in the size column (the tool used the first period's count as the size instead)");
    if (nLater) why.push((nLater === overAny.length ? "" : nLater + " of them ") + "more customers in a later period than in the first");
    findings.push({ level: "fix", id: "over-100", text: overAny.length + " cohort" + (overAny.length === 1 ? " shows" : "s show") + " retention over 100%: " + why.join("; ") + ". Check which number is the real starting size" + (nLater ? ", or switch the measure to revenue if the data is revenue" : "") + "." });
  }
  if (!weighted) findings.push({ level: "info", id: "unweighted", text: "No cohort sizes were given, so every cohort counts equally. Add a size column (headed \"size\") to weight large cohorts more than small ones." });
  if (parsed.gaps) findings.push({ level: "warn", id: "gaps", text: parsed.gaps + " row" + (parsed.gaps === 1 ? " has" : "s have") + " a blank cell followed by more numbers. The tool reads a blank as \"not reached yet\", so everything after the first blank in those rows was ignored." });
  if (parsed.skipped) findings.push({ level: "info", id: "skipped", text: parsed.skipped + " row" + (parsed.skipped === 1 ? " was" : "s were") + " left out because they could not be read as a cohort with a starting size." });
  if (parsed.unreadable) findings.push({ level: "info", id: "unreadable", text: parsed.unreadable + " customer row" + (parsed.unreadable === 1 ? "" : "s") + " had a start or end date that could not be read, and " + (parsed.unreadable === 1 ? "was" : "were") + " left out. Dates are read as YYYY-MM-DD, YYYY-MM or MM/DD/YYYY." });
  if (parsed.endBeforeStart) findings.push({ level: "warn", id: "end-before-start", text: parsed.endBeforeStart + " customer" + (parsed.endBeforeStart === 1 ? " ends" : "s end") + " before they start, and " + (parsed.endBeforeStart === 1 ? "was" : "were") + " left out. Check whether the two date columns are swapped." });
  var totalStart = cohorts.reduce(function (t, c) { return t + c.size; }, 0);
  if (measure === "customers" && weighted && totalStart < 50) findings.push({ level: "warn", id: "small", text: "There are only " + Math.round(totalStart) + " customers in total. With numbers this small, one customer moves a cohort's retention by several points, so read the shape of the curve rather than the exact percentages." });
  if (last < 3) findings.push({ level: "warn", id: "thin", text: "Only " + (last + 1) + " period" + (last === 0 ? " has" : "s have") + " data from at least " + MIN_COHORTS + " cohorts. The curve is shown, but it is too short to say whether it levels off." });
  if (ch.n[ch.n.length - 1] < MIN_COHORTS && ch.n.length - 1 > last) findings.push({ level: "info", id: "tail", text: "Periods " + (last + 1) + " to " + (ch.n.length - 1) + " come from fewer than " + MIN_COHORTS + " cohorts. They are drawn dashed and are not used to judge where the curve levels off." });
  if (last >= FLAT_MIN_AFTER + 1 && !flat) findings.push({ level: "warn", id: "not-flat", text: "The curve has not levelled off within the data: it is still losing " + flatPts + " points or more of the starting cohort per period. Retention that keeps falling means no cohort settles into a stable base yet, which puts a ceiling on growth however much you acquire." });
  if (cmp && cmp.test && cmp.test.p < 0.05) findings.push({ level: cmp.diff > 0 ? "info" : "warn", id: "trend", text: "Newer cohorts retain " + (cmp.diff > 0 ? "better" : "worse") + " than older ones at period " + cmp.period + ": " + Math.round(cmp.newer.rate * 100) + "% against " + Math.round(cmp.older.rate * 100) + "% (p = " + cmp.test.p.toFixed(3) + "). " + (cmp.diff > 0 ? "Something that changed between them is working. Find out what it was before it gets undone." : "Find out what changed between them: the channel, the customer, the product or the onboarding.") });
  if (measure === "revenue" && S[last] > 1) findings.push({ level: "info", id: "nrr-over-100", text: "Revenue in the average cohort ends above where it started: expansion outweighs churn and contraction over the first " + last + " periods." });

  return {
    ok: true, measure: measure, weighted: weighted, flatPts: flatPts,
    cohorts: cohorts, curve: S, cohortsAt: ch.n, band: band, lastReliable: last,
    flattening: flat, area: { periods: K, value: area }, compare: cmp,
    findings: findings, asOf: parsed.asOf || null
  };
}

/* ---------------- sample data ---------------- */

// Synthetic cohorts for trying the tool. Not real customers.
function sampleTable(seed) {
  var rnd = mulberry32(seed || 11), rows = ["cohort,month 0,month 1,month 2,month 3,month 4,month 5,month 6,month 7,month 8,month 9,month 10,month 11"];
  var months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  months.forEach(function (lab, i) {
    var size = 80 + Math.floor(rnd() * 120), floor = 0.34 + 0.012 * i, row = [lab, size], alive = size;
    for (var k = 1; k < months.length - i; k++) {
      var target = size * (floor + (1 - floor) * Math.exp(-k / 1.8));
      var next = Math.min(alive, Math.max(0, Math.round(target + (rnd() - 0.5) * size * 0.03)));
      alive = next; row.push(next);
    }
    rows.push(row.join(","));
  });
  return rows.join("\n");
}

/* ---------------- strict reader for agents (the skill's run) ---------------- */

// The browser tool reads pasted text leniently and reports what it skipped as findings.
// run() takes one JSON config and refuses anything it would otherwise skip or absorb,
// naming the field. It then calls the same analyse() the page calls.
var SOURCES = {
  kaplanMeier: { who: "E. L. Kaplan and P. Meier", title: "Nonparametric estimation from incomplete observations", where: "Journal of the American Statistical Association 53 (1958)" },
  greenwood: { who: "M. Greenwood", title: "The natural duration of cancer", where: "Reports on Public Health and Medical Subjects 33 (1926)" },
  twoProportion: { who: "NIST/SEMATECH e-Handbook of Statistical Methods", title: "7.3.3. How can we determine whether two processes produce the same proportion of defectives?", url: "https://www.itl.nist.gov/div898/handbook/prc/section3/prc33.htm" },
  normalTail: { who: "M. Abramowitz and I. A. Stegun", title: "Handbook of Mathematical Functions", where: "National Bureau of Standards (1964), formula 26.2.17" }
};
var RULES = { MIN_COHORTS: MIN_COHORTS, FLAT_PTS_DEFAULT: FLAT_PTS_DEFAULT, FLAT_MIN_AFTER: FLAT_MIN_AFTER, Z95: Z95 };
var RUN_FIELDS = ["label", "measure", "period", "unit", "flatPts", "comparePeriod", "cohorts", "table", "customers", "asOf"];
var COHORT_FIELDS = ["label", "size", "values"];
var CUSTOMER_FIELDS = ["id", "start", "end"];
var PERIOD_WORDS = ["month", "week", "quarter"];

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
function isNum(v) { return typeof v === "number" && isFinite(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function checkFields(c, allowed, where) {
  Object.keys(c).forEach(function (k) {
    if (allowed.indexOf(k) < 0) throw inputError(where + "Unknown field \"" + k + "\".", "Allowed: " + allowed.join(", ") + ".");
  });
}
function readText(v, where, name) {
  if (v == null) return null;
  if (typeof v !== "string") throw inputError(where + "\"" + name + "\" must be text (got " + JSON.stringify(v) + ").");
  return v.trim().slice(0, 120) || null;
}
function oneOf(v, allowed, name, dflt) {
  if (v == null) return dflt;
  if (allowed.indexOf(v) < 0) throw inputError("\"" + name + "\" must be one of " + allowed.map(function (a) { return "\"" + a + "\""; }).join(", ") + " (got " + JSON.stringify(v) + ").");
  return v;
}
function overSize(c) { return c.values.some(function (v) { return v > c.size + 1e-9; }); }

// cohorts: [{ label, size (percent only), values: [period 0, period 1, ...] }], oldest first.
function readCohorts(list, unit, measure) {
  if (!Array.isArray(list)) throw inputError("\"cohorts\" must be a list of cohorts, oldest first.", "Each cohort: {\"label\": \"2026-01\", \"values\": [120, 84, 70]}.");
  if (!list.length) throw inputError("\"cohorts\" is empty.", "Give at least one cohort with a starting size and one later period.");
  var sized = 0, out = [];
  list.forEach(function (c, i) {
    var where = "cohorts[" + i + "]: ";
    if (!isObj(c)) throw inputError(where + "each cohort must be a JSON object (got " + JSON.stringify(c) + ").");
    checkFields(c, COHORT_FIELDS, where);
    var label = readText(c.label, where, "label") || "Cohort " + (i + 1);
    where = "cohorts[" + i + "] (" + label + "): ";
    if (!Array.isArray(c.values) || !c.values.length) throw inputError(where + "\"values\" must be a list of numbers, period 0 first.");
    c.values.forEach(function (v, k) {
      if (!isNum(v)) throw inputError(where + "period " + k + " must be a number (got " + JSON.stringify(v) + ").", "Leave off periods the cohort has not reached yet; do not fill them with blanks or text.");
      if (v < 0) throw inputError(where + "period " + k + " must be 0 or more (got " + v + ").");
      if (measure === "customers" && unit === "count" && Math.floor(v) !== v) throw inputError(where + "period " + k + " must be a whole number of customers (got " + v + ").", "For revenue, set \"measure\": \"revenue\".");
    });
    var vals = c.values.slice(), size, weighted = true;
    if (unit === "count") {
      if (c.size != null) throw inputError(where + "\"size\" is only for percentages: with counts, period 0 is the cohort's starting size.");
      if (!(vals[0] > 0)) throw inputError(where + "period 0 is the cohort's starting size and must be above 0 (got " + vals[0] + ").");
      size = vals[0];
      if (measure === "customers") vals.forEach(function (v, k) {
        if (v > size) throw inputError(where + "period " + k + " has " + v + " customers, more than the " + size + " the cohort started with.", "A cohort cannot keep more customers than it started with. If this is revenue, set \"measure\": \"revenue\".");
      });
    } else {
      if (vals[0] !== 100) throw inputError(where + "period 0 must be 100 (the whole cohort) when \"unit\" is \"percent\" (got " + vals[0] + ").");
      if (measure === "customers") vals.forEach(function (v, k) {
        if (v > 100) throw inputError(where + "period " + k + " is " + v + "%, above the 100% the cohort started with.", "Customer retention cannot go above 100%. If this is revenue, set \"measure\": \"revenue\".");
      });
      if (c.size != null) {
        if (!isNum(c.size) || c.size <= 0) throw inputError(where + "\"size\" must be a number above 0 (got " + JSON.stringify(c.size) + ").");
        if (measure === "customers" && Math.floor(c.size) !== c.size) throw inputError(where + "\"size\" must be a whole number of customers (got " + c.size + ").");
        size = c.size; sized++;
      } else { size = 100; weighted = false; }
      var base = vals[0];
      vals = vals.map(function (p) { return p / base * size; });
    }
    out.push({ label: label, size: size, values: vals, weighted: weighted, overStated: false });
  });
  if (unit === "percent" && sized && sized !== list.length) throw inputError("Give \"size\" for every cohort or for none (" + sized + " of " + list.length + " have one).", "With sizes, large cohorts weigh more; without, every cohort counts equally.");
  return { cohorts: out, skipped: 0, gaps: 0, weighted: out.every(function (c) { return c.weighted; }) };
}

// table: the text the page reads, one row per cohort. Anything the page would skip is an error here.
function readTableText(text, unit, measure) {
  if (typeof text !== "string" || !text.trim()) throw inputError("\"table\" must be the cohort table as text (CSV or tab-separated), one row per cohort.");
  var p = parseTable(text, { unit: unit });
  if (p.skipped) throw inputError("table: " + p.skipped + " row" + (p.skipped === 1 ? "" : "s") + " could not be read as a cohort with a starting size.", "Each row: a cohort name, then period 0 (or a size column), then the later periods. Numbers only.");
  if (p.gaps) throw inputError("table: " + p.gaps + " row" + (p.gaps === 1 ? " has" : "s have") + " a blank cell followed by more numbers.", "A blank means \"not reached yet\", so nothing can follow it in the same row.");
  if (!p.cohorts.length) throw inputError("table: no cohorts could be read.");
  if (measure === "customers") p.cohorts.forEach(function (c) {
    if (c.overStated || overSize(c)) throw inputError("table: cohort " + c.label + " has more customers in a period than it started with" + (c.overStated ? " (a count above its size column)" : "") + ".", "A cohort cannot keep more customers than it started with. If this is revenue, set \"measure\": \"revenue\".");
  });
  return p;
}

// customers: [{ id, start, end }], one per customer; end left out or null while still a customer.
function readCustomerList(list, asOf) {
  if (!Array.isArray(list) || !list.length) throw inputError("\"customers\" must be a non-empty list of {\"start\": \"YYYY-MM-DD\", \"end\": \"YYYY-MM-DD\" or null}.");
  var asOfD = null;
  if (asOf != null) {
    asOfD = typeof asOf === "string" ? parseDate(asOf) : undefined;
    if (!asOfD) throw inputError("\"asOf\" must be a date such as \"2026-04-30\" (got " + JSON.stringify(asOf) + ").");
  }
  var rows = ["start,end"];
  list.forEach(function (c, i) {
    var where = "customers[" + i + "]: ";
    if (!isObj(c)) throw inputError(where + "each customer must be a JSON object (got " + JSON.stringify(c) + ").");
    checkFields(c, CUSTOMER_FIELDS, where);
    if (c.id != null && typeof c.id !== "string" && !isNum(c.id)) throw inputError(where + "\"id\" must be text or a number.");
    var s = typeof c.start === "string" ? parseDate(c.start) : undefined;
    if (!s) throw inputError(where + "\"start\" must be a date such as \"2026-01-14\" (got " + JSON.stringify(c.start) + ").", "Dates are read as YYYY-MM-DD, YYYY-MM or MM/DD/YYYY.");
    var e = null;
    if (c.end != null && c.end !== "") {
      e = typeof c.end === "string" ? parseDate(c.end) : undefined;
      if (!e) throw inputError(where + "\"end\" must be a date or null (got " + JSON.stringify(c.end) + ").", "Leave \"end\" out, or set it to null, for a customer who has not left.");
      if (e.t < s.t) throw inputError(where + "ends (" + c.end.trim() + ") before it starts (" + c.start.trim() + ").", "Check whether start and end are swapped.");
    }
    if (asOfD && s.t > asOfD.t) throw inputError(where + "starts (" + c.start.trim() + ") after \"asOf\" (" + asOf.trim() + ").", "Move \"asOf\" later, or leave this customer out.");
    rows.push(c.start.trim() + "," + (e ? c.end.trim() : ""));
  });
  return parseCustomers(rows.join("\n"), { asOf: asOfD ? asOf.trim() : undefined });
}

function fmtPct(v, d) { return v === null || v === undefined ? "-" : (v * 100).toFixed(d === undefined ? 0 : d) + "%"; }

function run(cfg) {
  if (!isObj(cfg)) throw inputError("The config must be a JSON object.");
  checkFields(cfg, RUN_FIELDS, "");
  var given = ["cohorts", "table", "customers"].filter(function (k) { return cfg[k] != null; });
  if (given.length !== 1) throw inputError(given.length ? "Give one input: \"cohorts\", \"table\" or \"customers\", not " + given.join(" and ") + "." : "Give the data: \"cohorts\" (a list), \"table\" (text) or \"customers\" (one row per customer).", "Run --help for the schema.");
  var source = given[0];
  var measure = oneOf(cfg.measure, ["customers", "revenue"], "measure", "customers");
  var unit = oneOf(cfg.unit, ["count", "percent"], "unit", "count");
  var word = oneOf(cfg.period, PERIOD_WORDS, "period", "month");
  if (source === "customers") {
    if (measure !== "customers") throw inputError("A customer list measures customers; leave \"measure\" out or set it to \"customers\".");
    if (cfg.unit != null) throw inputError("\"unit\" is for \"cohorts\" and \"table\"; a customer list is counted, not given in percent.");
    if (cfg.period != null && word !== "month") throw inputError("A customer list is grouped into monthly cohorts; leave \"period\" out or set it to \"month\".");
  } else if (cfg.asOf != null) throw inputError("\"asOf\" is only for a customer list (\"customers\").");
  var flatPts = FLAT_PTS_DEFAULT;
  if (cfg.flatPts != null) {
    if (!isNum(cfg.flatPts) || cfg.flatPts <= 0 || cfg.flatPts >= 100) throw inputError("\"flatPts\" must be a number of percentage points above 0 and below 100 (got " + JSON.stringify(cfg.flatPts) + ").", "2 means a period that moves less than 2 points of the starting cohort counts as flat.");
    flatPts = cfg.flatPts;
  }
  var opts = { measure: measure, flatPts: flatPts };
  if (cfg.comparePeriod != null) {
    if (!isNum(cfg.comparePeriod) || cfg.comparePeriod < 1 || Math.floor(cfg.comparePeriod) !== cfg.comparePeriod) throw inputError("\"comparePeriod\" must be a whole number, 1 or more (got " + JSON.stringify(cfg.comparePeriod) + ").");
    opts.comparePeriod = cfg.comparePeriod;
  }
  var parsed = source === "cohorts" ? readCohorts(cfg.cohorts, unit, measure)
    : source === "table" ? readTableText(cfg.table, unit, measure)
    : readCustomerList(cfg.customers, cfg.asOf);
  var r = analyse(parsed, opts);
  if (!r.ok) {
    if (r.error === "no_rows") throw inputError(source === "customers" ? "No customer started on or before \"asOf\"." : "No cohorts could be read.");
    throw inputError("Every cohort has only period 0, its starting size.", "Add at least one later " + word + " to draw a curve.");
  }
  r.label = readText(cfg.label, "", "label");
  r.period = source === "customers" ? "month" : word;
  r.unit = source === "customers" ? "count" : unit;
  r.source = source;
  if (source === "customers") r.customers = parsed.customers;
  r.headline = r.flattening
    ? "Retention levels off at about " + fmtPct(r.flattening.level) + " from " + r.period + " " + r.flattening.period
    : (r.lastReliable >= 3 ? "Retention has not levelled off yet" : "Too little history to tell whether retention levels off");
  r.compareAsked = opts.comparePeriod || null;
  r.sources = SOURCES;
  r.rules = RULES;
  r.view = [];
  if (r.flattening) r.view.push("In AAJ's view, a curve that levels off is a base to build on: from " + r.period + " " + r.flattening.period + " each " + r.period + " moves less than " + flatPts + " points of the starting cohort, so what you acquire adds to a base that keeps.");
  else if (r.lastReliable >= FLAT_MIN_AFTER + 1 && r.curve[r.lastReliable] < r.curve[r.lastReliable - 1]) r.view.push("In AAJ's view, fix retention before buying more acquisition: while the curve keeps falling, more customers in only fills a leaking bucket faster.");
  r.view.push("The levelling-off threshold (" + flatPts + " points per " + r.period + "), the " + MIN_COHORTS + "-cohort minimum and the " + FLAT_MIN_AFTER + " later " + r.period + "s it is judged over are tool rules, AAJ's choices, not benchmarks.");
  return r;
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function render(r) {
  const w = r.period, W = cap(w), L = [];
  const n = r.cohorts.length, K = r.curve.length - 1;
  L.push('COHORT RETENTION CURVES' + (r.label ? ' - ' + r.label : ''));
  L.push('═'.repeat(58));
  L.push(n + ' cohort' + (n === 1 ? '' : 's') + ', ' + K + ' ' + w + 's of history, ' + (r.measure === 'revenue' ? 'revenue retention' : 'customer retention') +
    (r.source === 'customers' ? ' (from ' + r.customers + ' customers' + (r.asOf ? ', as of ' + r.asOf : '') + ')' : ''));
  L.push('');
  L.push('RESULT: ' + r.headline);
  L.push('');
  L.push('KEY FIGURES');
  const b1 = r.band && r.band[1];
  L.push('  ' + (W + ' 1 retention:').padEnd(30) + fmtPct(r.curve[1]).padStart(6) + '   ' + (b1 ? '95% band ' + fmtPct(b1.lo) + ' to ' + fmtPct(b1.hi) : 'the first drop is usually the biggest'));
  L.push('  ' + (W + ' ' + r.lastReliable + ' retention:').padEnd(30) + fmtPct(r.curve[r.lastReliable]).padStart(6) + '   the last ' + w + ' at least ' + r.rules.MIN_COHORTS + ' cohorts have reached');
  if (r.measure === 'revenue') L.push('  ' + ('Revenue over ' + r.area.periods + ' ' + w + 's:').padEnd(30) + (r.area.value.toFixed(1) + 'x').padStart(6) + '   multiples of the first ' + w + "'s revenue, per cohort");
  else L.push('  ' + (W + 's active, first ' + r.area.periods + ':').padEnd(30) + r.area.value.toFixed(1).padStart(6) + '   of the first ' + r.area.periods + ' ' + w + 's, the average customer was around for this many');
  L.push('');
  L.push('CURVE (chained average' + (r.band ? ', 95% band over the reliable ' + w + 's' : '') + ')');
  L.push('  ' + W.padStart(7) + '  Average   ' + (r.band ? '95% band'.padEnd(16) : '') + 'Cohorts');
  r.curve.forEach((v, k) => {
    const band = r.band ? (r.band[k] && k <= r.lastReliable && k > 0 ? fmtPct(r.band[k].lo, 1) + ' to ' + fmtPct(r.band[k].hi, 1) : '').padEnd(16) : '';
    L.push('  ' + String(k).padStart(7) + '  ' + fmtPct(v, 1).padStart(7) + '   ' + band + String(r.cohortsAt[k]).padStart(7) + (k > r.lastReliable ? '   fewer than ' + r.rules.MIN_COHORTS + ' cohorts' : '') + (r.flattening && k === r.flattening.period ? '   levels off from here' : ''));
  });
  if (r.flattening) L.push('  Levels off at about ' + fmtPct(r.flattening.level) + ' from ' + w + ' ' + r.flattening.period + ' (the average of ' + w + 's ' + r.flattening.period + ' to ' + r.lastReliable + ', judged over ' + r.flattening.judgedOver + ' later ' + w + 's).');
  L.push('');
  const c = r.compare;
  if (c) {
    L.push('NEWER VS OLDER COHORTS, at ' + w + ' ' + c.period);
    L.push('  ' + ('Older ' + c.older.cohorts + ' (' + c.older.from + ' to ' + c.older.to + '):').padEnd(36) + fmtPct(c.older.rate, 1).padStart(7) + '   pooled, ' + Math.round(c.older.size).toLocaleString('en-US') + ' at start');
    L.push('  ' + ('Newer ' + c.newer.cohorts + ' (' + c.newer.from + ' to ' + c.newer.to + '):').padEnd(36) + fmtPct(c.newer.rate, 1).padStart(7) + '   pooled, ' + Math.round(c.newer.size).toLocaleString('en-US') + ' at start');
    const verdict = c.test ? (c.test.p < 0.05 ? (c.diff > 0 ? 'Newer cohorts retain better' : 'Newer cohorts retain worse') : 'No clear difference between newer and older cohorts')
      : (Math.abs(c.diff) < 0.01 ? 'Newer and older cohorts look about the same' : (c.diff > 0 ? 'Newer cohorts look better' : 'Newer cohorts look worse') + ' (no significance test for this data)');
    L.push('  ' + verdict + '.');
    L.push('  Difference ' + (c.diff >= 0 ? '+' : '') + (c.diff * 100).toFixed(1) + ' points' + (c.test ? ' (p = ' + c.test.p.toFixed(3) + ')' : '') + '. ' +
      'Best cohort at ' + w + ' ' + c.period + ': ' + c.best.label + ' (' + fmtPct(c.best.rate) + '); weakest: ' + c.worst.label + ' (' + fmtPct(c.worst.rate) + ').' +
      (c.middleLeftOut ? ' The middle cohort is left out so the halves are equal.' : ''));
  } else {
    L.push('NEWER VS OLDER COHORTS');
    L.push('  Not compared: ' + (r.compareAsked ? 'fewer than 4 cohorts reach ' + w + ' ' + r.compareAsked + '.' : 'too few cohorts reach the same ' + w + ' (the comparison needs at least 4).'));
  }
  L.push('');
  L.push('FINDINGS');
  const CH = { fix: 'Fix', warn: 'Check', info: 'Note' };
  if (r.findings.length) r.findings.forEach((f) => L.push('  [' + CH[f.level] + '] ' + f.text));
  else L.push('  Nothing to flag: every row was read, and the curve has enough cohorts behind it to judge.');
  L.push('');
  L.push("AAJ'S VIEW");
  r.view.forEach((v) => L.push('  - ' + v));
  L.push('');
  L.push('SOURCES');
  const S = r.sources;
  L.push('  Curve: ' + S.kaplanMeier.who + ', "' + S.kaplanMeier.title + '", ' + S.kaplanMeier.where + '.');
  if (r.band) L.push('  95% band: ' + S.greenwood.who + ', "' + S.greenwood.title + '", ' + S.greenwood.where + '.');
  if (c && c.test) {
    L.push('  Newer vs older: ' + S.twoProportion.who + ', "' + S.twoProportion.title + '": ' + S.twoProportion.url);
    L.push('  p-value: ' + S.normalTail.who + ', ' + S.normalTail.title + ', ' + S.normalTail.where + '.');
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional; every number here is invented for the demo. These are the
// twelve monthly cohorts the browser tool's "Load sample data" button loads (sampleTable(11)).
const DEMO = {
  label: 'Example Co., customers by signup month',
  measure: 'customers',
  period: 'month',
  cohorts: [
    { label: '2025-10', values: [141, 101, 79, 66, 60, 54, 49, 49, 49, 48, 48, 48] },
    { label: '2025-11', values: [130, 95, 74, 60, 54, 50, 48, 47, 47, 45, 45] },
    { label: '2025-12', values: [149, 108, 87, 73, 66, 59, 58, 55, 53, 53] },
    { label: '2026-01', values: [197, 143, 112, 99, 86, 82, 79, 79, 73] },
    { label: '2026-02', values: [181, 136, 106, 89, 80, 79, 74, 73] },
    { label: '2026-03', values: [112, 83, 68, 56, 53, 47, 47] },
    { label: '2026-04', values: [156, 119, 94, 81, 74, 68] },
    { label: '2026-05', values: [168, 126, 104, 89, 82] },
    { label: '2026-06', values: [121, 93, 74, 64] },
    { label: '2026-07', values: [155, 119, 96] },
    { label: '2026-08', values: [124, 95] },
    { label: '2026-09', values: [192] },
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

module.exports = { run, render, analyse, parseTable, parseCustomers, parseDate, chain, flattening, compareCohorts, sampleTable, mulberry32, fmtPct,
  SOURCES, RULES, MIN_COHORTS, FLAT_PTS_DEFAULT, FLAT_MIN_AFTER, DEMO };
