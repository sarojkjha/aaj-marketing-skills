#!/usr/bin/env node
/*
 * AAJ Lead Handoff & SLA Checker - engine
 * Part of the "lead-handoff-sla" Agent Skill.
 *
 * Checks whether the marketing-to-sales handoff is doing what the SLA says:
 * were MQLs touched within the response target, did any never get touched,
 * does sales accept or reject what marketing sends, do accepted MQLs convert,
 * is the MQL threshold in the right place (conversion by score band), and did
 * marketing deliver the MQL volume it promised. Every rate carries its count
 * and a 90% Wilson interval; any rate built on fewer than 30 leads is marked
 * directional (30 is AAJ's rule of thumb, not a statistical law).
 *
 * The scoring model follows the AAJ Lead Scoring and SLA Sheet
 * (aajconsult.com/templates/lead-scoring-and-sla-sheet): a fit score from ICP
 * criteria plus a behavior score from buying signals; total at or above the
 * MQL threshold makes an MQL.
 *
 * USAGE
 *   node handoff-sla.js --demo              # worked example (fictional)
 *   node handoff-sla.js '<json-config>'     # your own
 *   node handoff-sla.js '<json-config>' --json
 *   node handoff-sla.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "model": {
 *       "mqlThreshold": 50,                          // total score that makes an MQL
 *       "fit":       [ { "name": "Company size 50-500", "points": 15 } ],
 *       "behavior": [ { "name": "Demo request", "points": 30 } ],
 *       "bandWidth": 10                              // optional, points per score band (default 10)
 *     },
 *     "sla": {
 *       "responseHours": 4,            // first sales touch within this many hours of becoming an MQL
 *       "acceptWindowHours": 48,       // optional: sales accepts or rejects within this many hours
 *       "promisedMqlsPerWeek": 9,      // optional: marketing's volume promise
 *       "complianceTarget": 0.9,       // optional, 0-1 (default 0.9, the AAJ sheet's starting value)
 *       "businessHours": false         // optional: true if your SLA is written in business hours (see CLOCK)
 *     },
 *     "asOf": "2026-10-05 09:00",      // optional: "now" for open leads (default: latest time in the data)
 *     "period": { "start": "2026-09-07", "end": "2026-10-05" },   // optional, for the volume check
 *     "leads": [
 *       { "id": "L-01",
 *         "createdAt": "2026-09-07 22:00",
 *         "fit": 30,                    // fit points, OR "fitMatches": ["Company size 50-500", ...]
 *         "behavior": 20,               // behavior points, OR "signals": ["Demo request", ...]
 *         "mqlAt": "2026-09-07 22:40",  // blank if it never became an MQL
 *         "firstTouchAt": "2026-09-08 09:40",   // first sales touch; blank if none
 *         "outcome": "rejected",        // accepted | rejected | converted | open
 *         "decidedAt": "2026-09-11 07:40",      // optional: when sales accepted or rejected
 *         "reason": "No budget" }       // optional: reason code for a rejection
 *     ]
 *   }
 *
 * ("behaviour" is accepted as an alias of "behavior", in the model and on leads.)
 *
 * TIMES are "YYYY-MM-DD", "YYYY-MM-DD HH:MM" or ISO 8601. Times without a zone
 * are read as wall-clock times; keep every column in the same zone.
 * OUTCOME "converted" means the lead became whatever your next stage is (SQL
 * or opportunity); a converted lead counts as accepted. "fitMatches" and
 * "signals" are scored at full points (no decay); if you decay behavior points
 * as the AAJ sheet does, pass the decayed "behavior" number instead.
 *
 * CLOCK. Response and decision times are measured in calendar hours. A lead
 * that becomes an MQL on Friday evening and is called on Monday morning shows
 * as about 60 hours. If your SLA is written in business hours, set
 * "businessHours": true and the engine reports how many late leads became MQLs
 * outside Monday-Friday 09:00-17:00, so you can judge which misses are real.
 *
 * The engine reports data problems instead of refusing to run: a lead with a
 * bad date is a finding to fix, not an error.
 */

// --- AAJ arg normalisation ---------------------------------------------------
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

/* aaj:core:begin - copied verbatim into aajconsult.com/tools/lead-handoff-sla-checker.
   If this block changes, re-copy it there; the site's verify script checks it byte for byte. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

// Rules of this engine, stated where they are used so a reader can argue with them.
const MIN_N = 30;                       // AAJ rule of thumb: a rate on fewer leads is directional
const Z90 = 1.645;                      // z for a 90% Wilson interval
const DEFAULT_BAND_WIDTH = 10;          // score points per band in the threshold check
const DEFAULT_COMPLIANCE_TARGET = 0.9;  // the AAJ sheet's starting value, not a benchmark
const REJECT_LINE = 0.5;                // sales rejecting more than it accepts = no shared definition
const WORK_START = 9, WORK_END = 17;    // Mon-Fri wall clock; only used to flag off-hours MQLs
const OUTCOMES = ['accepted', 'rejected', 'converted', 'open'];
const HOUR = 3600000, DAY = 24 * HOUR, WEEK = 7 * DAY;

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const has = (v) => str(v).length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);
// null when blank, NaN when not a number
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// "YYYY-MM-DD", "YYYY-MM-DD HH:MM[:SS]" or ISO 8601 with an optional zone.
// Returns null when blank, false when unreadable, else { t: instant ms, wall: wall-clock ms }.
const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
function parseTime(v) {
  const s = str(v);
  if (!s) return null;
  const m = s.match(TIME_RE);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0), se = +(m[6] || 0);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || se > 59) return false;
  const wall = Date.UTC(y, mo - 1, d, h, mi, se);
  if (new Date(wall).getUTCDate() !== d) return false;
  let t = wall;
  if (m[7] && m[7].toUpperCase() !== 'Z') {
    const z = m[7].replace(':', '');
    const sign = z[0] === '-' ? -1 : 1;
    t = wall - sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60000;
  }
  return { t, wall };
}

// Wilson score interval: an honest range for a rate from a small number of leads.
function wilson(k, n, z) {
  if (n <= 0) return null;
  const p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
function rate(k, n) {
  if (!n) return { num: k, den: 0, rate: null, low: null, high: null, directional: true };
  const w = wilson(k, n, Z90);
  return { num: k, den: n, rate: w.rate, low: w.low, high: w.high, directional: n < MIN_N };
}
// a is clearly below b: the 90% ranges do not overlap
const clearlyBelow = (a, b) => a.den > 0 && b.den > 0 && a.high < b.low;

function pct(v) { return v === null || v === undefined ? '-' : Math.round(v * 100) + '%'; }
function fmt1(v) { return String(Math.round(v * 10) / 10); }
function fmtH(h) {
  if (h === null || h === undefined) return '-';
  if (h < 1) return Math.round(h * 60) + ' min';
  if (h < 48) return fmt1(h) + ' h';
  return fmt1(h / 24) + ' days';
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
function idList(rows, max) {
  const ids = rows.map((r) => (typeof r === 'string' ? r : r.id));
  const cap = max || 8;
  return ids.slice(0, cap).join(', ') + (ids.length > cap ? ' and ' + (ids.length - cap) + ' more' : '');
}
function isOffHours(wall) {
  const d = new Date(wall);
  const day = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return day === 0 || day === 6 || h < WORK_START || h >= WORK_END;
}

const ISSUE_TEXT = {
  'bad-time': [1, 'have a date that could not be read; those fields were ignored. Use YYYY-MM-DD HH:MM.'],
  'bad-number': [1, 'have fit or behavior points that are not numbers; they were ignored.'],
  'unknown-criterion': [1, 'name a fit criterion or behavior signal that is not in the scoring model; it scored zero.'],
  'fit-over-max': [1, 'have more fit points than the model allows; check the criteria or the export.'],
  'no-score': [1, 'have no fit or behavior points, so they are left out of the score bands.'],
  'bad-outcome': [1, 'have an outcome other than accepted, rejected, converted or open; read as open.'],
  'duplicate-id': [1, 'share an ID with an earlier row; check for duplicates in the export.'],
  'outcome-no-mql': [2, 'have a sales outcome but no MQL time, so they are left out of the handoff checks.'],
  'outcome-no-touch': [1, 'were accepted, rejected or converted but have no first-touch time, so they are left out of the response-time check.'],
  'touch-before-mql': [2, 'were touched by sales before they became MQLs; counted as on time at 0 hours.'],
  'passed-below': [2, 'became MQLs with a score below the threshold. Fine as a deliberate exception; a problem if it is routine.'],
  'scored-not-marked': [1, 'scored at or above the MQL threshold but were never marked as MQLs: a possible handoff leak.'],
  'rejected-no-reason': [1, 'were rejected with no reason code, so nobody can learn from them.'],
};

function analyze(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');

  // ---- the scoring model
  const model = cfg.model && typeof cfg.model === 'object' ? cfg.model : {};
  const T = num(model.mqlThreshold);
  if (T === null || Number.isNaN(T) || T <= 0) die('Give "model.mqlThreshold": the total score that makes a lead an MQL.', 'For example 50, the starting value in the AAJ Lead Scoring and SLA Sheet.');
  const bw = model.bandWidth === undefined || model.bandWidth === null || model.bandWidth === '' ? DEFAULT_BAND_WIDTH : num(model.bandWidth);
  if (!(bw > 0)) die('"model.bandWidth" must be a positive number of score points.');
  const crit = (list) => arr(list).filter((c) => c && has(c.name || c.criterion || c.signal))
    .map((c) => ({ name: str(c.name || c.criterion || c.signal), points: num(c.points) }));
  const fitC = crit(model.fit), behC = crit(model.behavior || model.behaviour);
  fitC.concat(behC).forEach((c) => {
    if (c.points === null || Number.isNaN(c.points) || c.points < 0) die(`Points for "${c.name}" must be a number of 0 or more.`);
  });
  const total = (list) => list.reduce((s, c) => s + c.points, 0);
  const maxFit = fitC.length ? total(fitC) : null, maxBeh = behC.length ? total(behC) : null;

  // ---- the SLA
  const sla = cfg.sla && typeof cfg.sla === 'object' ? cfg.sla : {};
  const opt = (v) => (v === undefined || v === null || str(v) === '' ? null : num(v));
  const target = num(sla.responseHours);
  if (!(target > 0)) die('Give "sla.responseHours": the first-touch target in hours.', 'For example 4. The engine counts calendar hours.');
  const win = opt(sla.acceptWindowHours);
  if (win !== null && !(win > 0)) die('"sla.acceptWindowHours" must be a positive number of hours, or left out.');
  const promised = opt(sla.promisedMqlsPerWeek);
  if (promised !== null && !(promised > 0)) die('"sla.promisedMqlsPerWeek" must be a positive number, or left out.');
  const compTarget = opt(sla.complianceTarget) === null ? DEFAULT_COMPLIANCE_TARGET : num(sla.complianceTarget);
  if (!(compTarget > 0 && compTarget <= 1)) die('"sla.complianceTarget" is a share between 0 and 1, for example 0.9 for 90%.');
  const businessHours = sla.businessHours === true || /^(yes|true|1)$/i.test(str(sla.businessHours));

  // ---- the leads
  const raw = arr(cfg.leads);
  if (!raw.length) die('Give "leads": an array of leads, each with an id, a score and an MQL time.');
  const issues = {};
  const flag = (code, id) => { if (!issues[code]) issues[code] = []; if (issues[code].indexOf(id) < 0) issues[code].push(id); };
  const seen = {};
  const sumMatches = (names, table, id) => {
    const list = Array.isArray(names) ? names : str(names).split(/[;|]/);
    let s = 0;
    list.map(str).filter(Boolean).forEach((nm) => {
      const hit = table.find((c) => c.name.toLowerCase() === nm.toLowerCase());
      if (hit) s += hit.points; else flag('unknown-criterion', id);
    });
    return s;
  };
  const leads = raw.map((x, i) => {
    const r = x && typeof x === 'object' ? x : {};
    const id = has(r.id) ? str(r.id) : 'row ' + (i + 1);
    if (seen[id]) flag('duplicate-id', id);
    seen[id] = true;
    const time = (k) => { const v = parseTime(r[k]); if (v === false) { flag('bad-time', id); return null; } return v; };
    const points = (v) => { const n = num(v); if (Number.isNaN(n)) { flag('bad-number', id); return null; } return n; };
    let fit = points(r.fit);
    if (fit === null && r.fitMatches !== undefined && has(r.fitMatches)) fit = sumMatches(r.fitMatches, fitC, id);
    let beh = points(r.behavior !== undefined ? r.behavior : r.behaviour);
    if (beh === null && r.signals !== undefined && has(r.signals)) beh = sumMatches(r.signals, behC, id);
    let score = fit === null && beh === null ? null : (fit || 0) + (beh || 0);
    if (score === null) { const s = points(r.score); if (s !== null) score = s; }
    if (fit !== null && maxFit !== null && fit > maxFit) flag('fit-over-max', id);
    if (score === null) flag('no-score', id);
    let outcome = str(r.outcome).toLowerCase() || 'open';
    if (OUTCOMES.indexOf(outcome) < 0) { flag('bad-outcome', id); outcome = 'open'; }
    return {
      id, fit, behavior: beh, score, outcome, reason: str(r.reason),
      created: time('createdAt'), mql: time('mqlAt'), touch: time('firstTouchAt'), decided: time('decidedAt'),
    };
  });

  // ---- "now": for leads that are still waiting
  let asOf = null;
  if (has(cfg.asOf)) {
    const a = parseTime(cfg.asOf);
    if (!a) die('"asOf" must be a date or time, for example "2026-10-05 09:00".');
    asOf = a.t;
  } else {
    leads.forEach((l) => [l.created, l.mql, l.touch, l.decided].forEach((v) => { if (v && (asOf === null || v.t > asOf)) asOf = v.t; }));
  }
  const ageOf = (l) => (asOf === null ? null : (asOf - l.mql.t) / HOUR);

  // ---- handoff hygiene
  const mqls = leads.filter((l) => l.mql);
  leads.forEach((l) => {
    if (!l.mql && l.outcome !== 'open') flag('outcome-no-mql', l.id);
    if (!l.mql && l.score !== null && l.score >= T) flag('scored-not-marked', l.id);
    if (l.mql && l.score !== null && l.score < T) flag('passed-below', l.id);
  });

  // ---- response time
  const touched = [], never = [], notYetDue = [];
  let within = 0, before = 0;
  mqls.forEach((l) => {
    if (l.touch) {
      let h = (l.touch.t - l.mql.t) / HOUR;
      if (h < 0) { before++; flag('touch-before-mql', l.id); h = 0; }
      touched.push({ id: l.id, hours: h, wall: l.mql.wall });
      if (h <= target) within++;
    } else if (l.outcome !== 'open') {
      flag('outcome-no-touch', l.id);
    } else {
      const age = ageOf(l);
      if (age !== null && age > target) never.push({ id: l.id, ageHours: age, wall: l.mql.wall });
      else notYetDue.push(l.id);
    }
  });
  never.sort((a, b) => b.ageHours - a.ageHours);
  const sorted = touched.map((x) => x.hours).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const late = touched.filter((x) => x.hours > target).sort((a, b) => b.hours - a.hours);
  const slowest = touched.length ? touched.slice().sort((a, b) => b.hours - a.hours)[0] : null;
  const compliance = rate(within, touched.length + never.length);
  const offHoursLate = businessHours ? late.concat(never).filter((x) => isOffHours(x.wall)).length : null;
  const response = {
    targetHours: target, complianceTarget: compTarget, compliance,
    met: compliance.den ? compliance.rate >= compTarget : null,
    touched: touched.length, medianHours: median, slowest: slowest ? { id: slowest.id, hours: slowest.hours } : null,
    late: late.map((x) => ({ id: x.id, hours: x.hours })),
    neverTouched: never.map((x) => ({ id: x.id, ageHours: x.ageHours })),
    notYetDue: notYetDue.length, touchedBeforeMql: before,
    businessHours, offHoursLate,
  };

  // ---- acceptance and conversion
  const c = { accepted: 0, rejected: 0, converted: 0, open: 0 };
  mqls.forEach((l) => { c[l.outcome]++; });
  const decided = c.accepted + c.rejected + c.converted;
  const reasons = Object.create(null); // keyed by user text: no prototype
  mqls.filter((l) => l.outcome === 'rejected').forEach((l) => {
    if (!l.reason) { flag('rejected-no-reason', l.id); return; }
    const k = l.reason.toLowerCase();
    if (!reasons[k]) reasons[k] = { reason: l.reason, count: 0 };
    reasons[k].count++;
  });
  let decidedWithin = null, undatedDecisions = 0;
  const limbo = [];
  if (win !== null) {
    let inWin = 0, dated = 0;
    mqls.forEach((l) => {
      if (l.outcome === 'open') { const age = ageOf(l); if (age !== null && age > win) limbo.push({ id: l.id, ageHours: age }); return; }
      if (!l.decided) { undatedDecisions++; return; }
      dated++;
      if ((l.decided.t - l.mql.t) / HOUR <= win) inWin++;
    });
    decidedWithin = dated ? rate(inWin, dated) : null;
    limbo.sort((a, b) => b.ageHours - a.ageHours);
  }
  const acceptance = {
    mqls: mqls.length, decided, accepted: c.accepted, rejected: c.rejected, converted: c.converted, open: c.open,
    rate: rate(c.accepted + c.converted, decided),
    windowHours: win, decidedWithin, undatedDecisions, limbo,
    reasons: Object.keys(reasons).map((k) => reasons[k]).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
  const conversion = rate(c.converted, c.accepted + c.converted);

  // ---- threshold check: conversion by score band, for every lead with a score and a sales decision
  const bandDefs = [
    { key: 'below', label: 'Under ' + T, from: null, to: T },
    { key: 'b0', label: T + ' to under ' + (T + bw), from: T, to: T + bw },
    { key: 'b1', label: (T + bw) + ' to under ' + (T + 2 * bw), from: T + bw, to: T + 2 * bw },
    { key: 'b2', label: (T + 2 * bw) + ' and up', from: T + 2 * bw, to: null },
  ];
  const inBand = (b, s) => (b.from === null || s >= b.from) && (b.to === null || s < b.to);
  const bandOf = (rows) => {
    const dec = rows.filter((l) => l.outcome !== 'open');
    const acc = dec.filter((l) => l.outcome !== 'rejected').length;
    const conv = dec.filter((l) => l.outcome === 'converted').length;
    return { leads: rows.length, mqls: rows.filter((l) => l.mql).length, decided: dec.length, accepted: acc, converted: conv, acceptance: rate(acc, dec.length), conversion: rate(conv, dec.length) };
  };
  const scored = leads.filter((l) => l.score !== null);
  const bands = bandDefs.map((b) => Object.assign({ key: b.key, label: b.label, from: b.from, to: b.to }, bandOf(scored.filter((l) => inBand(b, l.score)))));
  const higher = bandOf(scored.filter((l) => l.score >= T + bw));
  const below = bands[0], first = bands[1];
  let tStatus, tText;
  const thin = [first, higher].concat(below.decided ? [below] : []).some((b) => b.conversion.directional);
  if (!first.decided && !higher.decided) {
    tStatus = 'cannot-tell';
    tText = 'No MQLs have a sales decision yet, so conversion by score cannot be read.';
  } else if (!first.decided) {
    tStatus = 'cannot-tell';
    tText = `No MQLs scoring ${first.label} have a sales decision yet. That band, just above the line, is the one that tests the threshold.`;
  } else if (!higher.decided && !below.decided) {
    tStatus = 'cannot-tell';
    tText = `Only MQLs scoring ${first.label} have sales decisions, so there is nothing to compare them with yet.`;
  } else if (clearlyBelow(first.conversion, higher.conversion)) {
    tStatus = 'raise';
    tText = `MQLs scoring ${first.label} converted at ${pct(first.conversion.rate)} (${first.converted} of ${first.decided}) against ${pct(higher.conversion.rate)} (${higher.converted} of ${higher.decided}) for ${T + bw} and up, and the 90% ranges do not overlap. Consider raising the threshold toward ${T + bw}, with sales, before the next review.`;
  } else if (below.decided && clearlyBelow(first.conversion, below.conversion)) {
    tStatus = 'lower';
    tText = `Leads under ${T} that sales worked anyway converted at ${pct(below.conversion.rate)} (${below.converted} of ${below.decided}), clearly better than ${pct(first.conversion.rate)} just above the line. The threshold may be leaving good leads in nurture; look at which criteria those leads met before lowering it.`;
  } else if (first.decided && higher.decided && first.conversion.rate < higher.conversion.rate) {
    tStatus = 'raise-hint';
    tText = `Conversion rises with score: ${pct(first.conversion.rate)} (${first.converted} of ${first.decided}) for ${first.label} against ${pct(higher.conversion.rate)} (${higher.converted} of ${higher.decided}) for ${T + bw} and up. The 90% ranges overlap, so the data cannot yet say the threshold is too low.`;
    if (below.decided && below.conversion.rate >= first.conversion.rate) tText += ` Leads under ${T} that sales worked anyway converted at ${pct(below.conversion.rate)} (${below.converted} of ${below.decided}), no worse than just above the line; also too few to read.`;
  } else if (below.decided && first.decided && below.conversion.rate >= first.conversion.rate) {
    tStatus = 'lower-hint';
    tText = `Leads under ${T} that sales worked anyway converted at ${pct(below.conversion.rate)} (${below.converted} of ${below.decided}), no worse than ${pct(first.conversion.rate)} (${first.converted} of ${first.decided}) just above the line. The ranges overlap, so this is a hint that the threshold may be too high, not proof.`;
  } else {
    tStatus = 'holds';
    tText = higher.decided
      ? `MQLs just above the line convert about as well as higher-scoring ones, so nothing here says the threshold of ${T} is in the wrong place.`
      : `Leads under ${T} that sales worked converted no better than MQLs just above the line, so nothing here says the threshold of ${T} is too high.`;
  }
  if (tStatus !== 'cannot-tell' && thin) tText += ` Directional: at least one band rests on fewer than ${MIN_N} decided leads (AAJ's rule of thumb).`;
  if (tStatus !== 'cannot-tell' && !below.decided) tText += ` No leads under ${T} have a sales decision, so this data cannot show whether the threshold is too high.`;
  const threshold = { threshold: T, bandWidth: bw, status: tStatus, text: tText, higher, maxFit, maxBehavior: maxBeh, maxScore: maxFit !== null || maxBeh !== null ? (maxFit || 0) + (maxBeh || 0) : null };

  // ---- volume promise
  let volume = null;
  if (mqls.length) {
    const p = cfg.period && typeof cfg.period === 'object' ? cfg.period : {};
    let start = null, end = null;
    if (has(p.start)) { const v = parseTime(p.start); if (!v) die('"period.start" must be a date, for example "2026-09-07".'); start = v.t; }
    if (has(p.end)) { const v = parseTime(p.end); if (!v) die('"period.end" must be a date, for example "2026-10-05".'); end = v.t; }
    if (start === null) { start = Math.min.apply(null, mqls.map((l) => l.mql.t)); start -= ((start % DAY) + DAY) % DAY; }
    if (end === null) end = Math.max(asOf === null ? 0 : asOf, Math.max.apply(null, mqls.map((l) => l.mql.t)));
    if (!(end > start)) die('"period.end" must be after "period.start".');
    const weeks = (end - start) / WEEK;
    const inPeriod = mqls.filter((l) => l.mql.t >= start && l.mql.t <= end);
    const buckets = [];
    for (let s = start; s < end; s += WEEK) {
      const e = Math.min(s + WEEK, end);
      const last = e >= end;
      buckets.push({ start: new Date(s).toISOString().slice(0, 10), count: inPeriod.filter((l) => l.mql.t >= s && (last ? l.mql.t <= e : l.mql.t < e)).length, partial: e - s < WEEK });
    }
    const perWeek = inPeriod.length / weeks;
    const tooShort = weeks < 1;   // under a week, a weekly rate is an extrapolation
    volume = {
      promised, start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10),
      weeks, tooShort, mqls: inPeriod.length, perWeek, met: promised === null || tooShort ? null : perWeek >= promised,
      buckets, fullWeeksBelow: promised === null ? null : buckets.filter((b) => !b.partial && b.count < promised).length,
      fullWeeks: buckets.filter((b) => !b.partial).length,
    };
  }

  // ---- data issues
  const issueList = Object.keys(ISSUE_TEXT).filter((k) => issues[k]).map((k) => ({
    id: k, level: ISSUE_TEXT[k][0] === 1 ? 'fix' : 'note', count: issues[k].length, leads: issues[k],
    text: `${plural(issues[k].length, 'lead')} (${idList(issues[k])}) ${ISSUE_TEXT[k][1]}`,
  }));
  const nIssue = (k) => (issues[k] ? issues[k].length : 0);

  // ---- fixes, most important first; the top three are shown
  const cands = [];
  const add = (id, title, text) => { if (!cands.some((x) => x.id === id)) cands.push({ id, title, text }); };
  if (never.length) add('never-touched', `Work the ${plural(never.length, 'MQL')} nobody has touched`,
    `${idList(never)} ${never.length === 1 ? 'became an MQL' : 'became MQLs'} more than ${fmtH(target)} ago and ${never.length === 1 ? 'has' : 'have'} no sales touch. Give ${never.length === 1 ? 'it' : 'each'} a named owner today, then find where routing dropped ${never.length === 1 ? 'it' : 'them'}: no owner, no alert, or an alert nobody reads.`);
  if (compliance.den && compliance.rate < compTarget) add('sla-miss', `Lift response-time compliance from ${pct(compliance.rate)} to ${pct(compTarget)}`,
    `${compliance.num} of ${compliance.den} due MQLs were touched within ${fmtH(target)}.${slowest ? ` The slowest touched lead was ${slowest.id} at ${fmtH(slowest.hours)}.` : ''} Look at when the late leads arrived and who owned them before you change any scores.` +
    (businessHours && offHoursLate ? ` ${offHoursLate} of the ${late.length + never.length} late or untouched leads became MQLs outside Monday-Friday ${WORK_START}:00-${WORK_END}:00; if your SLA counts business hours, some of these may be on time.` : ''));
  if (limbo.length) add('limbo', `Get a decision on ${plural(limbo.length, 'MQL')} waiting past the acceptance window (${fmtH(win)})`,
    `${idList(limbo)} ${limbo.length === 1 ? 'has' : 'have'} no accept-or-reject decision. An MQL in limbo is invisible to both teams: marketing thinks it was handed over, and sales has not said yes or no.`);
  if (nIssue('scored-not-marked')) add('scored-not-marked', `Route the ${plural(nIssue('scored-not-marked'), 'lead')} that scored as MQLs but were never handed over`,
    `${idList(issues['scored-not-marked'])} scored ${T} or more and ${nIssue('scored-not-marked') === 1 ? 'has' : 'have'} no MQL time. Either the score in your CRM differs from this one, or the handoff rule did not fire.`);
  if (volume && volume.met === false) add('volume', `Close the volume gap: ${fmt1(volume.perWeek)} MQLs a week against ${fmt1(promised)} promised`,
    `Marketing delivered ${volume.mqls} MQLs over ${fmt1(volume.weeks)} weeks${volume.fullWeeks ? `, and ${volume.fullWeeksBelow} of ${volume.fullWeeks} full weeks fell short` : ''}. Grow the sources whose MQLs sales accepts, or re-set the promise with sales in writing. Do not lower the threshold to hit the number: sales will reject the difference.`);
  if (decided && acceptance.rate.rate < REJECT_LINE) add('low-acceptance', `Re-agree the MQL definition: sales rejected ${c.rejected} of ${decided}`,
    (acceptance.reasons.length ? `The top rejection reason is "${acceptance.reasons[0].reason}" (${acceptance.reasons[0].count}). ` : '') + 'When sales turns down more MQLs than it takes, the two teams are not using the same definition. Go through ten rejected leads together and change the fit criteria, not just the threshold.');
  if (tStatus === 'raise' || tStatus === 'lower') add('threshold', tStatus === 'raise' ? 'Raise the MQL threshold, with sales' : 'Review the leads under the threshold', tText);
  if (nIssue('rejected-no-reason')) add('reasons', 'Ask for a reason code on every rejection',
    `${plural(nIssue('rejected-no-reason'), 'rejected MQL')} (${idList(issues['rejected-no-reason'])}) ${nIssue('rejected-no-reason') === 1 ? 'has' : 'have'} no reason. Without reasons, a rejection is a complaint you cannot act on; use the reason codes in your SLA.`);
  if (tStatus === 'raise-hint' || tStatus === 'lower-hint') add('threshold-hint', 'Watch the threshold, but do not move it yet', tText);
  if (win === null) add('no-window', 'Add an acceptance window to the SLA',
    'Without a time limit for sales to accept or reject, an MQL can wait forever and nobody notices. Agree one, and record when each decision is made.');
  else if (undatedDecisions && undatedDecisions === decided) add('no-decision-times', 'Record when sales accepts or rejects',
    'None of the decisions has a time, so the acceptance window cannot be checked. Add a decided_at column from your CRM.');
  if (nIssue('bad-time') || nIssue('outcome-no-touch') || nIssue('outcome-no-mql')) add('data', 'Fix the timestamps in the export',
    `${nIssue('bad-time') + nIssue('outcome-no-touch') + nIssue('outcome-no-mql')} lead rows have missing or unreadable times and were left out of some checks. See the data notes.`);
  if (compliance.directional || thin) add('sample', `Keep collecting: these rates rest on ${plural(compliance.den, 'due MQL')}`,
    `Re-run when there are ${MIN_N} or more decided leads in each score band (AAJ's rule of thumb). Until then, read the rates as a hint, not a verdict.`);
  add('keep', 'Keep the weekly review', 'Re-run this check every month with the same SLA, and change points or the threshold only when the score bands say so.');
  add('backtest', 'Score last quarter\'s won and lost deals', 'If the deals you won do not score highest, the points are wrong, whatever the threshold. Adjust the fit criteria first.');
  add('reasons-review', 'Review rejection reasons with sales each month', 'The reasons tell you whether to change the fit criteria, the behavior points or the threshold.');
  const fixes = cands.slice(0, 3);

  // ---- verdict
  let verdict;
  if (!mqls.length) verdict = { level: 'no-data', headline: 'No MQLs to check', body: 'None of these leads has an MQL time. Add the became_mql_at column, or check that the right leads were pasted.' };
  else if (!compliance.den) verdict = { level: 'no-data', headline: 'Too early to judge', body: `No MQL is past the ${fmtH(target)} response target yet.` };
  else {
    const leaks = [];
    if (never.length) leaks.push(`${plural(never.length, 'MQL')} never touched`);
    if (compliance.rate < compTarget) leaks.push(`${pct(compliance.rate)} touched within ${fmtH(target)} against a ${pct(compTarget)} target`);
    if (limbo.length) leaks.push(`${plural(limbo.length, 'MQL')} waiting past the acceptance window`);
    if (nIssue('scored-not-marked')) leaks.push(`${plural(nIssue('scored-not-marked'), 'lead')} scored as MQLs but never handed over`);
    if (volume && volume.met === false) leaks.push(`${fmt1(volume.perWeek)} MQLs a week against ${fmt1(promised)} promised`);
    verdict = leaks.length
      ? { level: 'leaking', headline: 'The handoff is leaking', body: leaks.join('; ') + '.' }
      : { level: 'holding', headline: 'The handoff is holding', body: `${pct(compliance.rate)} of due MQLs were touched within ${fmtH(target)}, none is waiting untouched${win !== null ? ' or undecided past the window' : ''}${volume && volume.met ? ', and marketing met its volume promise' : ''}.` };
    verdict.body = verdict.body.charAt(0).toUpperCase() + verdict.body.slice(1);
    if (compliance.directional) verdict.body += ` Directional: ${plural(compliance.den, 'due MQL')} is fewer than ${MIN_N} (AAJ's rule of thumb).`;
    verdict.directional = compliance.directional;
  }

  return {
    counts: { leads: leads.length, scored: scored.length, mqls: mqls.length, due: compliance.den },
    asOf: asOf === null ? null : new Date(asOf).toISOString().slice(0, 16).replace('T', ' '),
    response, acceptance, conversion, bands, threshold, volume,
    issues: issueList, fixes, verdict,
    rules: { MIN_N, Z: Z90, interval: '90% Wilson', clock: 'calendar hours', bandWidth: bw, complianceTarget: compTarget, REJECT_LINE, workHours: `Mon-Fri ${WORK_START}:00-${WORK_END}:00` },
  };
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function rateLine(r, label) {
  if (!r.den) return `${label}: no data`;
  return `${label}: ${pct(r.rate)} (${r.num} of ${r.den}; 90% range ${pct(r.low)} to ${pct(r.high)})${r.directional ? ' - directional, n < ' + MIN_N : ''}`;
}

// cfg is the input as given: a compliance target the user did not set is labelled as the AAJ sheet's, not theirs.
function render(r, cfg = {}) {
  const L = [];
  const R = r.response, A = r.acceptance;
  const sla = (cfg && cfg.sla) || {};
  const targetSet = sla.complianceTarget !== undefined && sla.complianceTarget !== null && sla.complianceTarget !== '';
  L.push('');
  L.push('AAJ - LEAD HANDOFF & SLA CHECK');
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push(`  ${r.counts.leads} leads, ${r.counts.mqls} MQLs, ${r.counts.due} due for a first touch (as of ${r.asOf || '-'})`);
  if (!targetSet) L.push(`  The ${pct(R.complianceTarget)} compliance goal is the AAJ sheet's starting value, not one you set (sla.complianceTarget).`);
  L.push('');
  L.push(`RESPONSE TIME (target ${fmtH(R.targetHours)}, calendar hours)`);
  L.push('  ' + rateLine(R.compliance, `Touched within target (goal ${pct(R.complianceTarget)})`));
  L.push(`  Median time to first touch: ${fmtH(R.medianHours)} across ${plural(R.touched, 'touched MQL')}`);
  if (R.slowest) L.push(`  Slowest touched: ${R.slowest.id} at ${fmtH(R.slowest.hours)} (1 lead)`);
  L.push(`  Never touched, past target: ${R.neverTouched.length}${R.neverTouched.length ? ' - ' + idList(R.neverTouched) : ''}`);
  if (R.notYetDue) L.push(`  Not yet due: ${R.notYetDue}`);
  if (R.businessHours && R.offHoursLate !== null) L.push(`  Late or untouched leads that became MQLs outside ${r.rules.workHours}: ${R.offHoursLate}`);
  L.push('');
  L.push('ACCEPTANCE AND CONVERSION');
  L.push('  ' + rateLine(A.rate, 'Sales accepted'));
  L.push(`  accepted ${A.accepted} | converted ${A.converted} | rejected ${A.rejected} | open ${A.open}`);
  if (A.windowHours !== null) {
    L.push('  ' + (A.decidedWithin ? rateLine(A.decidedWithin, `Decided within ${fmtH(A.windowHours)}`) : `Decided within ${fmtH(A.windowHours)}: no decision times`));
    L.push(`  Open past the window: ${A.limbo.length}${A.limbo.length ? ' - ' + idList(A.limbo) : ''}`);
  }
  if (A.reasons.length) L.push('  Rejection reasons: ' + A.reasons.map((x) => `${x.reason} (${x.count})`).join(', '));
  L.push('  ' + rateLine(r.conversion, 'Accepted MQLs that converted'));
  L.push('');
  L.push(`THRESHOLD CHECK (MQL at ${r.threshold.threshold}; conversion of leads with a sales decision)`);
  r.bands.forEach((b) => L.push(`  ${b.label.padEnd(18)} ${plural(b.leads, 'lead').padStart(9)}  ${b.decided ? `${pct(b.conversion.rate).padStart(4)} converted (${b.converted} of ${b.decided}; ${pct(b.conversion.low)}-${pct(b.conversion.high)})${b.conversion.directional ? ' directional' : ''}` : 'no decisions'}`));
  L.push('  ' + r.threshold.text);
  if (r.volume) {
    const V = r.volume;
    L.push('');
    L.push(`VOLUME (${V.start} to ${V.end}, ${fmt1(V.weeks)} weeks)`);
    if (V.tooShort) L.push(`  ${plural(V.mqls, 'MQL')} in less than a week of data: too short to check the weekly promise.`);
    else L.push(`  ${V.mqls} MQLs = ${fmt1(V.perWeek)} a week${V.promised !== null ? ` against ${fmt1(V.promised)} promised - ${V.met ? 'met on average' : 'missed'}${V.fullWeeks ? `; ${V.fullWeeksBelow} of ${V.fullWeeks} full weeks fell short` : ''}` : ' (no promise given)'}`);
    L.push('  ' + V.buckets.map((b) => `${b.start}: ${b.count}${b.partial ? '*' : ''}`).join('  ') + (V.buckets.some((b) => b.partial) ? '   (* part week)' : ''));
  }
  L.push('');
  L.push('THREE FIXES');
  r.fixes.forEach((f, i) => { L.push(`  ${i + 1}. ${f.title}`); L.push(`     ${f.text}`); });
  if (r.issues.length) {
    L.push('');
    L.push('DATA NOTES');
    r.issues.forEach((x) => L.push(`  ${x.level === 'fix' ? '!' : '-'}  ${x.text}`));
  }
  L.push('');
  L.push(`Rules: rates on fewer than ${MIN_N} leads are directional (AAJ's rule of thumb); ranges are 90% Wilson intervals; times are calendar hours.`);
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Illustrative only: Example Co. is fictional, as in the AAJ Lead Scoring and SLA Sheet.
// The SLA settings are example inputs, not benchmarks.
const DEMO_ROWS = [
  ["L-01", "2026-09-08 06:20", 35, 20, "2026-09-08 06:35", "2026-09-08 17:35", "open", "", ""],
  ["L-02", "2026-09-08 17:00", 10, 20, "", "", "open", "", ""],
  ["L-03", "2026-09-09 13:10", 30, 25, "2026-09-09 13:50", "2026-09-09 17:10", "accepted", "2026-09-12 15:10", ""],
  ["L-04", "2026-09-10 04:35", 30, 20, "2026-09-10 04:50", "2026-09-10 06:25", "converted", "2026-09-10 12:25", ""],
  ["L-05", "2026-09-10 04:45", 25, 27, "2026-09-10 05:00", "2026-09-10 05:25", "rejected", "2026-09-12 09:25", "Wrong timing"],
  ["L-06", "2026-09-10 16:10", 25, 30, "2026-09-10 16:15", "2026-09-10 17:50", "rejected", "2026-09-12 21:50", ""],
  ["L-07", "2026-09-10 18:20", 35, 30, "2026-09-10 18:35", "2026-09-10 21:05", "converted", "2026-09-13 19:05", ""],
  ["L-08", "2026-09-11 15:35", 25, 20, "2026-09-11 15:50", "2026-09-12 17:50", "rejected", "2026-09-14 21:50", "Not a fit"],
  ["L-09", "2026-09-11 20:20", 20, 30, "2026-09-11 20:25", "2026-09-11 20:50", "accepted", "2026-09-12 16:50", ""],
  ["L-10", "2026-09-12 23:00", 30, 20, "2026-09-12 23:40", "2026-09-13 10:40", "rejected", "2026-09-16 08:40", "No budget"],
  ["L-11", "2026-09-12 23:10", 20, 25, "2026-09-12 23:50", "2026-09-13 02:20", "rejected", "2026-09-13 08:20", ""],
  ["L-12", "2026-09-13 12:00", 40, 30, "2026-09-13 13:30", "2026-09-14 15:30", "converted", "2026-09-14 21:30", ""],
  ["L-13", "2026-09-14 01:00", 10, 5, "", "", "open", "", ""],
  ["L-14", "2026-09-14 05:10", 40, 25, "2026-09-14 06:40", "2026-09-14 08:15", "converted", "2026-09-16 12:15", ""],
  ["L-15", "2026-09-14 23:20", 35, 27, "2026-09-15 03:20", "2026-09-15 03:32", "rejected", "2026-09-16 09:32", "Not a fit"],
  ["L-16", "2026-09-15 03:00", 20, 15, "", "", "open", "", ""],
  ["L-17", "2026-09-15 18:20", 30, 15, "2026-09-15 18:35", "2026-09-15 19:45", "converted", "2026-09-16 01:45", ""],
  ["L-18", "2026-09-16 04:00", 10, 10, "", "", "open", "", ""],
  ["L-19", "2026-09-17 04:00", 20, 15, "", "", "open", "", ""],
  ["L-20", "2026-09-17 12:10", 40, 15, "2026-09-17 12:15", "2026-09-17 15:35", "rejected", "2026-09-17 21:35", "Wrong timing"],
  ["L-21", "2026-09-17 15:00", 25, 20, "", "", "open", "", ""],
  ["L-22", "2026-09-18 03:00", 35, 25, "2026-09-18 03:40", "2026-09-18 04:20", "accepted", "2026-09-19 10:20", ""],
  ["L-23", "2026-09-18 11:00", 35, 45, "2026-09-18 11:40", "2026-09-18 11:52", "accepted", "2026-09-18 13:52", ""],
  ["L-24", "2026-09-18 13:00", 25, 10, "", "", "open", "", ""],
  ["L-25", "2026-09-18 17:10", 40, 30, "2026-09-18 17:50", "2026-09-18 21:10", "converted", "2026-09-19 03:10", ""],
  ["L-26", "2026-09-18 22:20", 35, 17, "2026-09-18 22:35", "2026-09-19 00:10", "rejected", "2026-09-20 06:10", "Wrong timing"],
  ["L-27", "2026-09-19 10:10", 40, 22, "2026-09-19 10:50", "2026-09-20 04:50", "accepted", "2026-09-22 08:50", ""],
  ["L-28", "2026-09-20 04:00", 10, 10, "", "", "open", "", ""],
  ["L-29", "2026-09-21 08:00", 25, 15, "", "", "open", "", ""],
  ["L-30", "2026-09-21 09:10", 30, 35, "2026-09-21 13:10", "2026-09-22 07:10", "accepted", "2026-09-22 13:10", ""],
  ["L-31", "2026-09-22 07:20", 35, 35, "2026-09-22 07:25", "2026-09-22 10:45", "accepted", "2026-09-22 16:45", ""],
  ["L-32", "2026-09-22 21:00", 40, 45, "2026-09-22 21:05", "2026-09-22 21:17", "converted", "2026-09-22 23:17", ""],
  ["L-33", "2026-09-23 03:00", 25, 5, "", "", "open", "", ""],
  ["L-34", "2026-09-23 04:00", 25, 25, "2026-09-23 04:15", "2026-09-25 19:15", "open", "", ""],
  ["L-35", "2026-09-23 12:00", 20, 10, "", "", "open", "", ""],
  ["L-36", "2026-09-24 04:00", 40, 30, "2026-09-24 04:40", "2026-09-24 05:05", "converted", "2026-09-24 07:05", ""],
  ["L-37", "2026-09-24 14:00", 40, 15, "", "", "open", "", ""],
  ["L-38", "2026-09-24 17:45", 40, 30, "2026-09-24 17:50", "2026-09-24 18:15", "converted", "2026-09-26 22:15", ""],
  ["L-39", "2026-09-24 22:00", 15, 5, "", "", "open", "", ""],
  ["L-40", "2026-09-26 03:45", 35, 40, "2026-09-26 05:15", "2026-09-26 06:50", "converted", "2026-09-27 02:50", ""],
  ["L-41", "2026-09-26 17:00", 25, 2, "", "", "open", "", ""],
  ["L-42", "2026-09-27 00:00", 15, 5, "", "", "open", "", ""],
  ["L-43", "2026-09-28 20:35", 35, 30, "2026-09-29 00:35", "2026-09-29 03:55", "accepted", "2026-09-29 05:55", ""],
  ["L-44", "2026-09-29 17:00", 40, 20, "2026-09-29 21:00", "2026-09-30 00:20", "rejected", "2026-10-02 22:20", "No budget"],
  ["L-45", "2026-09-29 21:10", 30, 22, "2026-09-29 21:50", "2026-09-30 01:10", "accepted", "2026-10-01 07:10", ""],
  ["L-46", "2026-09-30 17:35", 40, 35, "2026-09-30 21:35", "", "open", "", ""],
  ["L-47", "2026-10-01 06:10", 40, 30, "2026-10-01 06:25", "2026-10-01 06:37", "rejected", "2026-10-03 10:37", "Wrong timing"],
  ["L-48", "2026-10-01 08:00", 10, 20, "", "", "open", "", ""],
  ["L-49", "2026-10-01 10:00", 35, 20, "", "", "open", "", ""],
  ["L-50", "2026-10-01 13:35", 30, 32, "2026-10-01 15:05", "2026-10-01 20:05", "accepted", "2026-10-04 00:05", ""],
  ["L-51", "2026-10-01 14:00", 35, 15, "2026-10-01 14:40", "2026-10-02 08:40", "rejected", "2026-10-02 14:40", "Wrong timing"],
  ["L-52", "2026-10-02 09:00", 10, 10, "", "", "open", "", ""],
  ["L-53", "2026-10-03 23:00", 30, 30, "2026-10-03 23:05", "2026-10-04 00:15", "open", "", ""],
  ["L-54", "2026-10-04 05:45", 30, 30, "2026-10-04 06:00", "2026-10-04 06:12", "converted", "2026-10-05 08:00", ""],
];
const DEMO = {
  model: {
    mqlThreshold: 50,
    fit: [
      { name: 'Company size: 50 to 500 employees', points: 15 },
      { name: 'Role: controller, CFO or VP Finance', points: 10 },
      { name: 'Accounting system Example Co. integrates with', points: 10 },
      { name: 'Month-end close longer than 8 working days', points: 5 },
    ],
    behavior: [
      { name: 'Demo request', points: 30 },
      { name: 'Pricing-page visit', points: 15 },
      { name: 'Webinar attended', points: 10 },
      { name: 'Close-checklist download', points: 5 },
      { name: 'Security-page visit', points: 5 },
      { name: 'Blog post read', points: 2 },
    ],
  },
  sla: { responseHours: 4, acceptWindowHours: 48, promisedMqlsPerWeek: 9, complianceTarget: 0.9, businessHours: true },
  asOf: '2026-10-05 09:00',
  period: { start: '2026-09-07', end: '2026-10-05' },
  leads: DEMO_ROWS.map((r) => ({ id: r[0], createdAt: r[1], fit: r[2], behavior: r[3], mqlAt: r[4], firstTouchAt: r[5], outcome: r[6], decidedAt: r[7], reason: r[8] })),
};

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const arg = args.filter((a) => a !== '--json')[0];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg && arg !== '--demo') {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    if (!asJson) console.log('(demo: Example Co., fictional - 54 leads over four weeks; SLA settings are example inputs, not benchmarks)');
  }
  try {
    const r = analyze(cfg);
    console.log(asJson ? JSON.stringify(r, null, 2) : render(r, cfg));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { analyze, wilson, parseTime, MIN_N, DEFAULT_COMPLIANCE_TARGET, DEFAULT_BAND_WIDTH, DEMO };
