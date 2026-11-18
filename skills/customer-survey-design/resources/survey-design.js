#!/usr/bin/env node
/*
 * AAJ Customer Survey Design — sampling engine
 * Part of the "customer-survey-design" Agent Skill.
 *
 * Answers the two questions every survey plan gets wrong: how many completes
 * do you actually need, and which segment cuts will be readable afterwards.
 *
 * USAGE
 *   node survey-design.js --demo                 # both modes, worked examples
 *   node survey-design.js sample '<json>'        # required completes + invites
 *   node survey-design.js segments '<json>'      # per-cut margin of error
 *   node survey-design.js readout '<json>'       # what the answers say, from a results export
 *   node survey-design.js '<json>'               # one JSON object; the mode is its "mode" field,
 *                                                #   or is told from its fields
 *   node survey-design.js --help
 *
 * CONFIG (JSON)
 *   sample:
 *     { "marginOfError": 5,          // ± percentage points you can accept
 *       "confidence": 95,            // 90 | 95 | 99
 *       "expectedProportion": 50,    // % — use 50 if unsure (worst case)
 *       "population": 2000,          // optional — total reachable audience
 *       "responseRate": 20 }         // optional % — turns completes into invites
 *   segments:
 *     { "completes": 400, "confidence": 95,
 *       "segments": [ { "name": "SMB", "share": 55 },
 *                     { "name": "Mid-Market", "share": 30 },
 *                     { "name": "Enterprise", "share": 15 } ] }
 *   readout:
 *     { "confidence": 95,
 *       "columns": ["Timestamp", "How often do you use it?", "How likely are you to recommend us?"],
 *       "rows": [["2026-11-02 09:14", "Weekly", "9"], ...],   // one row per person, cells as text
 *       "questions": [ { "column": 1, "type": "choice", "options": ["Daily", "Weekly", "Monthly"] } ] }
 *     questions is optional. Each entry sets one column's type: choice, multi, rating, nps, text or skip.
 *     A choice or multi may list its options (so an option nobody picked shows as 0); a multi may give
 *     the separator between answers in a cell (default ";"); a rating may give min and max.
 *     The engine counts the answers itself. It returns each share with a Wilson range, the average of a
 *     rating, and NPS with its range.
 *
 * Readability thresholds are working labels, not laws: ±5pp or tighter reads
 * clean, ±5–8pp directional, wider than ±8pp is noise for most decisions.
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

/* aaj:core:begin */
const Z = { 90: 1.645, 95: 1.960, 99: 2.576 };

function pct(v) {
  // Accept 20 or 0.2 for "20%". A value of 1 or less is a fraction, so 1 means 100%;
  // write 1% as 0.01.
  if (v == null || isNaN(v)) return null;
  return v > 1 ? v / 100 : v;
}

function sampleSize(cfg) {
  const conf = cfg.confidence || 95;
  const z = Z[conf];
  if (!z) throw new Error(`confidence must be 90, 95 or 99 (got ${cfg.confidence})`);
  const e = pct(cfg.marginOfError);
  if (!e || e <= 0 || e >= 0.5) throw new Error('marginOfError must be a positive ± in points, e.g. 5 (a value of 1 or less is read as a fraction: for ±1 point write 0.01)');
  const p = pct(cfg.expectedProportion != null ? cfg.expectedProportion : 50);
  if (p <= 0 || p >= 1) throw new Error('expectedProportion must be between 0 and 100 (exclusive)');

  const n0 = (z * z * p * (1 - p)) / (e * e);
  let n = n0, fpcApplied = false;
  const N = cfg.population;
  if (N && N > 0) { n = n0 / (1 + (n0 - 1) / N); fpcApplied = true; }
  n = Math.ceil(n);

  let invites = null, feasible = null;
  const rr = pct(cfg.responseRate);
  if (rr) {
    if (rr <= 0 || rr > 1) throw new Error('responseRate must be between 0 and 100');
    invites = Math.ceil(n / rr);
    if (N) feasible = invites <= N;
  }
  return { z, conf, e, p, n0: Math.ceil(n0), n, N: N || null, fpcApplied, rr: rr || null, invites, feasible };
}

function segmentMoE(nSeg, z) {
  // Worst-case p = 0.5 for a proportion read within the cell.
  return z * Math.sqrt(0.25 / nSeg);
}

function readLabel(moePP) {
  if (moePP <= 5) return ['READ', 'clean read'];
  if (moePP <= 8) return ['CAUTION', 'directional only'];
  return ['DON\u2019T READ', 'noise at this size'];
}

function segments(cfg) {
  const conf = cfg.confidence || 95;
  const z = Z[conf];
  if (!z) throw new Error(`confidence must be 90, 95 or 99 (got ${cfg.confidence})`);
  const n = cfg.completes;
  if (!n || n < 1) throw new Error('completes must be a positive number');
  if (!Array.isArray(cfg.segments) || !cfg.segments.length) throw new Error('segments must be a non-empty array of {name, share}');
  const shareSum = cfg.segments.reduce((a, s) => a + (pct(s.share) || 0), 0);
  const rows = cfg.segments.map(s => {
    const share = pct(s.share);
    if (share == null || share <= 0) throw new Error(`segment "${s.name}" needs a positive share`);
    const nSeg = Math.round(n * share);
    const moe = nSeg > 0 ? segmentMoE(nSeg, z) * 100 : Infinity;
    const [flag, note] = readLabel(moe);
    return { name: s.name, share, nSeg, moe, flag, note };
  });
  return { conf, z, n, rows, shareSum };
}
// ---- readout: what the answers say, from an export with one row per person and one column per question.
// The engine does the counting, so nothing is tallied by hand or by a model. Rules, stated so you can
// argue with them:
//   - A blank cell is no answer. Shares are of the people who answered that question.
//   - Each share carries a range from the Wilson score interval (Wilson, 1927), which holds up for small
//     samples and for shares near 0% or 100%, where the plain +/- formula does not.
//   - Each choice question gets one read label, from its widest range (half its width, in points), with
//     the same working thresholds as the planner.
//   - NPS: 9-10 promoters, 7-8 passives, 0-6 detractors; score = % promoters - % detractors.
//   - Without a type from you, a column is read by AAJ's rules below (READ_RULES). Say the type to override.
const READ_TYPES = ['choice', 'multi', 'rating', 'nps', 'text', 'skip'];
const READ_RULES = {
  maxRows: 50000, maxColumns: 300,
  choiceMaxDistinct: 12,   // more distinct answers than this, or fewer than two people per answer on average, reads as open text
  separator: ';',          // several answers in one cell are split on this unless you give another
  skipHeaders: ['timestamp', 'submitted at', 'submission id', 'submission date', 'submission time', 'respondent id', 'response id', 'collector id',
    'start date', 'start time', 'started at', 'end date', 'end time', 'completed at', 'created at', 'email', 'e-mail', 'email address', 'e-mail address',
    'name', 'full name', 'first name', 'last name', 'phone', 'phone number', 'ip address'],
};

function fail(msg) { const e = new Error(msg); e.isInputError = true; throw e; }
function cleanCell(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }

function wilson(k, n, z) {
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / d;
  return { low: k === 0 ? 0 : Math.max(0, c - h), high: k === n ? 1 : Math.min(1, c + h) };
}

function shareRow(label, count, n, z, listed) {
  const w = wilson(count, n, z);
  return { label, count, share: count / n, low: w.low, high: w.high, moe: (w.high - w.low) / 2 * 100, listed };
}

// One cell holding several answers -> the answers. With the options known, an option that contains the
// separator (a comma inside a label) still matches whole.
function splitMulti(cell, sep, options) {
  const out = [], add = (v) => { v = cleanCell(v); if (v && out.indexOf(v) < 0) out.push(v); };
  const mark = sep.trim() || sep;
  if (!options) { cell.split(mark).forEach(add); return out; }
  const byLength = options.slice().sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < cell.length) {
    while (i < cell.length && cell[i] === ' ') i++;
    const hit = byLength.find((o) => cell.substr(i, o.length) === o && (cell.substr(i + o.length).trim() === '' || cell.substr(i + o.length).trim().indexOf(mark) === 0));
    let end;
    if (hit) { add(hit); end = cell.indexOf(mark, i + hit.length); }
    else { end = cell.indexOf(mark, i); add(cell.slice(i, end < 0 ? cell.length : end)); }
    if (end < 0) break;
    i = end + mark.length;
  }
  return out;
}

function tallyChoices(lists, n, z, options) {
  const counts = new Map();
  (options || []).forEach((o) => counts.set(o, 0));
  lists.forEach((l) => l.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
  const rows = [...counts.entries()].map(([label, count]) => shareRow(label, count, n, z, !options || options.indexOf(label) >= 0));
  if (!options) rows.sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  else { const tail = rows.filter((r) => !r.listed).sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1)); rows.splice(options.length, rows.length, ...tail); }
  return rows;
}

function readout(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail('readout needs an object with "columns" and "rows"');
  const allowed = ['mode', 'confidence', 'columns', 'rows', 'questions'];
  Object.keys(cfg).forEach((k) => { if (allowed.indexOf(k) < 0) fail(`unknown field "${k}" (allowed: ${allowed.join(', ')})`); });
  const conf = cfg.confidence == null ? 95 : cfg.confidence, z = Z[conf];
  if (!z) fail(`confidence must be 90, 95 or 99 (got ${cfg.confidence})`);
  if (!Array.isArray(cfg.columns) || !cfg.columns.length) fail('columns must be the list of column headings, one per question');
  if (cfg.columns.length > READ_RULES.maxColumns) fail(`too many columns: ${cfg.columns.length} (the limit is ${READ_RULES.maxColumns})`);
  if (!Array.isArray(cfg.rows)) fail('rows must be a list with one list of cells per person');
  if (cfg.rows.length > READ_RULES.maxRows) fail(`too many rows: ${cfg.rows.length} (the limit is ${READ_RULES.maxRows})`);
  const columns = cfg.columns.map(cleanCell), width = columns.length;
  let blankRows = 0;
  const rows = [];
  cfg.rows.forEach((r, i) => {
    if (!Array.isArray(r)) fail(`row ${i + 1} must be a list of cells`);
    if (r.length > width) fail(`row ${i + 1} has ${r.length} cells but there ${width === 1 ? 'is 1 column' : 'are ' + width + ' columns'}`);
    const cells = columns.map((_, c) => cleanCell(r[c]));
    if (cells.every((c) => c === '')) blankRows++; else rows.push(cells);
  });
  if (!rows.length) fail('there are no answers in rows');

  const hints = {};
  if (cfg.questions != null) {
    if (!Array.isArray(cfg.questions)) fail('questions must be a list of { column, type, ... }');
    cfg.questions.forEach((q, i) => {
      const at = `questions[${i}]`;
      if (!q || typeof q !== 'object' || Array.isArray(q)) fail(`${at} must be an object`);
      const ok = ['column', 'type', 'options', 'min', 'max', 'separator'];
      Object.keys(q).forEach((k) => { if (ok.indexOf(k) < 0) fail(`unknown field "${k}" in ${at} (allowed: ${ok.join(', ')})`); });
      if (!Number.isInteger(q.column) || q.column < 0 || q.column >= width) fail(`${at}.column must be a column number from 0 to ${width - 1}`);
      if (hints[q.column]) fail(`${at}: column ${q.column} is listed twice`);
      if (READ_TYPES.indexOf(q.type) < 0) fail(`${at}.type must be one of ${READ_TYPES.join(', ')}`);
      const h = { type: q.type };
      if (q.options != null) {
        if (q.type !== 'choice' && q.type !== 'multi') fail(`${at}.options only applies to a choice or multi question`);
        if (!Array.isArray(q.options) || !q.options.length) fail(`${at}.options must be a non-empty list`);
        h.options = q.options.map(cleanCell);
        if (h.options.some((o) => o === '')) fail(`${at}.options has a blank option`);
        if (new Set(h.options).size !== h.options.length) fail(`${at}.options lists an option twice`);
      }
      if (q.separator != null) {
        if (q.type !== 'multi') fail(`${at}.separator only applies to a multi question`);
        if (typeof q.separator !== 'string' || !q.separator.trim() || q.separator.length > 3) fail(`${at}.separator must be one to three characters, such as ";" or ","`);
        h.separator = q.separator;
      }
      if (q.min != null || q.max != null) {
        if (q.type !== 'rating') fail(`${at}.min and max only apply to a rating question`);
        if (!Number.isInteger(q.min) || !Number.isInteger(q.max) || q.min < 0 || q.max > 10 || q.min >= q.max) fail(`${at}: min and max must be whole numbers with 0 <= min < max <= 10`);
        h.min = q.min; h.max = q.max;
      }
      hints[q.column] = h;
    });
  }

  const isScore = (v) => /^\d{1,2}$/.test(v) && Number(v) <= 10;
  const questions = [], skipped = [];
  columns.forEach((title, c) => {
    const answers = rows.map((r) => r[c]).filter((v) => v !== '');
    const n = answers.length, hint = hints[c] || null;
    const base = { column: c, title: title || `Column ${c + 1}`, answered: n, skipped: rows.length - n };
    if (hint && hint.type === 'skip') { skipped.push({ column: c, title: base.title, reason: 'you set it to skip' }); return; }
    if (!n) { skipped.push({ column: c, title: base.title, reason: 'no answers' }); return; }
    let type = hint ? hint.type : null, sep = hint && hint.separator ? hint.separator : READ_RULES.separator;
    if (!type) {
      if (READ_RULES.skipHeaders.indexOf(title.toLowerCase()) >= 0) { skipped.push({ column: c, title: base.title, reason: 'not a question (a date, an ID or contact details)' }); return; }
      const distinct = new Set(answers).size;
      if (answers.every(isScore)) {
        const top = Math.max(...answers.map(Number));
        type = top === 10 && /recommend/i.test(title) ? 'nps' : top >= 2 ? 'rating' : 'choice';
      } else if (answers.some((v) => v.indexOf(sep) >= 0) && new Set([].concat(...answers.map((v) => splitMulti(v, sep, null)))).size <= READ_RULES.choiceMaxDistinct) type = 'multi';
      else type = distinct <= READ_RULES.choiceMaxDistinct && distinct * 2 <= n ? 'choice' : 'text';
    }
    const q = Object.assign(base, { type, detected: !hint });
    if (type === 'choice' || type === 'multi') {
      if (type === 'multi') q.separator = sep;
      q.options = tallyChoices(answers.map((v) => (type === 'multi' ? splitMulti(v, sep, hint && hint.options) : [v])), n, z, hint && hint.options);
      q.maxMoe = Math.max(...q.options.map((o) => o.moe));
      const lab = readLabel(q.maxMoe); q.flag = lab[0]; q.note = lab[1];
    }
    else if (type === 'text') q.distinct = new Set(answers).size;
    else {
      const nps = type === 'nps';
      const seen = answers.filter(isScore).map(Number);
      const min = nps ? 0 : hint && hint.min != null ? hint.min : (seen.length && Math.min(...seen) === 0 ? 0 : 1);
      const max = nps ? 10 : hint && hint.max != null ? hint.max : (seen.length ? Math.max(Math.max(...seen), min + 1) : min + 1);
      const valid = [], invalid = [];
      answers.forEach((v) => { if (isScore(v) && Number(v) >= min && Number(v) <= max) valid.push(Number(v)); else invalid.push(v); });
      q.scale = { min, max, from: nps ? 'nps' : hint && hint.min != null ? 'given' : 'answers' };
      q.invalid = { count: invalid.length, examples: [...new Set(invalid)].slice(0, 5) };
      q.answered = valid.length;
      const m = valid.length;
      q.counts = []; for (let v = min; v <= max; v++) { const k = valid.filter((x) => x === v).length; q.counts.push({ value: v, count: k, share: m ? k / m : 0 }); }
      if (!m) { q.mean = null; q.score = null; }
      else if (nps) {
        const pro = valid.filter((x) => x >= 9).length, det = valid.filter((x) => x <= 6).length, pas = m - pro - det;
        const pp = pro / m, pd = det / m, moe = z * Math.sqrt(Math.max(0, pp + pd - (pp - pd) * (pp - pd)) / m) * 100;
        q.promoters = shareRow('Promoters (9-10)', pro, m, z, true); q.passives = shareRow('Passives (7-8)', pas, m, z, true); q.detractors = shareRow('Detractors (0-6)', det, m, z, true);
        q.score = (pp - pd) * 100; q.moe = moe; q.low = Math.max(-100, q.score - moe); q.high = Math.min(100, q.score + moe);
      } else {
        const mean = valid.reduce((a, b) => a + b, 0) / m;
        const sd = m > 1 ? Math.sqrt(valid.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (m - 1)) : null;
        const moe = sd === null ? null : z * sd / Math.sqrt(m);
        q.mean = mean; q.sd = sd; q.moe = moe; q.low = moe === null ? null : Math.max(min, mean - moe); q.high = moe === null ? null : Math.min(max, mean + moe);
      }
    }
    questions.push(q);
  });
  return { conf, z, respondents: rows.length, blankRows, questions, skipped, rules: READ_RULES };
}
/* aaj:core:end */

/* ---------- rendering ---------- */

function bar(v, max, width) {
  const w = Math.max(0, Math.round((v / max) * width));
  return '\u2588'.repeat(w) + '\u2591'.repeat(width - w);
}

function renderSample(r) {
  const L = [];
  L.push('AAJ \u00b7 SURVEY SAMPLE SIZE');
  L.push('\u2500'.repeat(56));
  L.push(`Target read        \u00b1${(r.e * 100).toFixed(1)}pp at ${r.conf}% confidence (z=${r.z})`);
  L.push(`Assumed proportion ${(r.p * 100).toFixed(0)}%${r.p === 0.5 ? ' (worst case \u2014 safest)' : ''}`);
  L.push('');
  L.push(`Completes needed   ${r.n}${r.fpcApplied ? `   (infinite-population n=${r.n0}, corrected for N=${r.N})` : ''}`);
  if (r.invites != null) {
    L.push(`Invites needed     ${r.invites}   (at ${(r.rr * 100).toFixed(0)}% response rate)`);
  }
  L.push('');
  if (r.feasible === false) {
    L.push(`\u25bc NOT FEASIBLE \u2014 you need ${r.invites} invites but only have ${r.N} people.`);
    L.push('  Loosen the margin, lift the response rate (incentive, reminders),');
    L.push('  or accept a census of everyone you can reach and report the achieved \u00b1.');
  } else if (r.feasible === true) {
    L.push(`\u25b2 FEASIBLE \u2014 ${r.invites} invites fits inside your ${r.N}-person audience.`);
  } else {
    L.push('\u25b8 Add "responseRate" (and "population" if finite) to turn completes into a send plan.');
  }
  return L.join('\n');
}

function renderSegments(r) {
  const L = [];
  L.push('AAJ \u00b7 SEGMENT READABILITY');
  L.push('\u2500'.repeat(64));
  L.push(`Total completes ${r.n} \u00b7 ${r.conf}% confidence \u00b7 worst-case p=50%`);
  if (Math.abs(r.shareSum - 1) > 0.02) L.push(`\u26a0 segment shares sum to ${(r.shareSum * 100).toFixed(0)}% \u2014 check the mix`);
  L.push('');
  L.push('Segment          n     \u00b1MoE    ' + ' '.repeat(12) + 'Verdict');
  for (const s of r.rows) {
    L.push(
      s.name.padEnd(14) +
      String(s.nSeg).padStart(5) +
      `  \u00b1${s.moe.toFixed(1)}pp  `.padEnd(11) +
      bar(Math.min(s.moe, 15), 15, 12) + '  ' +
      `${s.flag} (${s.note})`
    );
  }
  L.push('');
  const bad = r.rows.filter(s => s.flag !== 'READ');
  if (!bad.length) L.push('\u25b2 Every planned cut is readable at this sample size.');
  else {
    const worst = bad.reduce((a, s) => (s.nSeg < a.nSeg ? s : a), bad[0]);
    const needed = Math.ceil(0.25 * r.z * r.z / Math.pow(0.05, 2)); // n per cell for ±5pp
    L.push(`\u25bc ${bad.length} cut(s) below a clean read. Smallest cell "${worst.name}" (n=${worst.nSeg}) is \u00b1${worst.moe.toFixed(1)}pp.`);
    L.push(`  A \u00b15pp read needs ~${needed} completes per cell at ${r.conf}% \u2014 either boost total n,`);
    L.push('  oversample the small segment, or merge it into a wider cut before fielding.');
  }
  return L.join('\n');
}

function renderReadout(r) {
  const L = [], p1 = (v) => (v * 100).toFixed(1) + '%', n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const many = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;
  L.push('AAJ · SURVEY RESULTS READOUT');
  L.push('─'.repeat(72));
  L.push(`${many(r.respondents, 'response')} · ${r.conf}% confidence (z=${r.z}) · ranges are Wilson score intervals` + (r.blankRows ? ` · ${many(r.blankRows, 'blank row')} left out` : ''));
  const shareLine = (o) => '  ' + bar(o.share, 1, 14) + ' ' + p1(o.share).padStart(6) + `  ${String(o.count).padStart(5)}  ` + `${p1(o.low)} to ${p1(o.high)}`.padEnd(16) + ` ${o.label}${o.listed ? '' : '  (not one of your options)'}`;
  const precision = (q) => `  Ranges here reach ±${n1(q.maxMoe)} points: ` + (q.flag === 'READ' ? 'a clean read.' : q.flag === 'CAUTION' ? 'directional only.' : 'only large gaps between answers mean anything.');
  r.questions.forEach((q) => {
    L.push('');
    L.push(`${q.title}`);
    const how = q.detected ? 'read as' : 'set to';
    if (q.type === 'choice' || q.type === 'multi') {
      L.push(`  ${how} ${q.type === 'multi' ? `several answers allowed, split on "${q.separator.trim()}"` : 'one answer each'} · ${many(q.answered, 'answer')}${q.skipped ? `, ${q.skipped} blank` : ''}` + (q.type === 'multi' ? ' · shares are of people, so they can add to more than 100%' : ''));
      q.options.forEach((o) => L.push(shareLine(o)));
      L.push(precision(q));
    } else if (q.type === 'text') {
      L.push(`  ${how} open text · ${many(q.answered, 'answer')}, ${q.distinct} different${q.skipped ? `, ${q.skipped} blank` : ''}. Read them; the engine does not count words.`);
    } else {
      const scale = `${q.scale.min} to ${q.scale.max}` + (q.scale.from === 'answers' ? ' (taken from the answers seen; give min and max if the scale is wider)' : '');
      L.push(`  ${how} ${q.type === 'nps' ? 'an NPS question, 0 to 10' : 'a rating, ' + scale} · ${many(q.answered, 'answer')}${q.skipped ? `, ${q.skipped} blank` : ''}`);
      if (q.invalid.count) L.push(`  ${many(q.invalid.count, 'answer')} left out as not a whole number on the scale: ${q.invalid.examples.map((x) => JSON.stringify(x)).join(', ')}`);
      if (!q.answered) L.push('  No usable answers.');
      else if (q.type === 'nps') {
        L.push(`  NPS ${Math.round(q.score)}, range ${Math.round(q.low)} to ${Math.round(q.high)}`);
        [q.promoters, q.passives, q.detractors].forEach((o) => L.push(shareLine(o)));
      } else {
        L.push(`  Average ${n1(q.mean)}` + (q.moe === null ? ' (one answer: no range)' : `, range ${n1(q.low)} to ${n1(q.high)}`));
        q.counts.forEach((c) => L.push('  ' + bar(c.share, 1, 14) + ' ' + p1(c.share).padStart(6) + `  ${String(c.count).padStart(5)}  ${c.value}`));
      }
    }
  });
  if (r.skipped.length) { L.push(''); L.push('Columns left out: ' + r.skipped.map((s) => `${s.title} (${s.reason})`).join('; ')); }
  L.push('');
  L.push('Within ±5 points reads clean, within ±8 is directional, wider is noise for small gaps: working labels, not laws.');
  L.push('The ranges cover sampling error only, not who chose to answer.');
  return L.join('\n');
}

/* ---------- CLI ---------- */

const HELP = `AAJ Customer Survey Design \u2014 sampling engine

MODES
  sample '<json>'     completes + invites needed for a target margin of error
  segments '<json>'   per-segment margin of error for your planned cuts
  readout '<json>'    what the answers say: shares with ranges, rating averages, NPS
  '<json>'            one JSON object with a "mode" field (sample, segments or readout);
                      without it the mode is told from the fields
  --demo              run both worked examples (no arguments needed)

SCHEMA
  sample:   { "marginOfError": 5, "confidence": 95, "expectedProportion": 50,
              "population": 2000, "responseRate": 20 }
            population and responseRate optional; percents accept 20 or 0.2 (1 or less is a fraction: write 1% as 0.01).
  segments: { "completes": 400, "confidence": 95,
              "segments": [ { "name": "SMB", "share": 55 }, ... ] }
  readout:  { "confidence": 95, "columns": ["Question 1", ...],
              "rows": [["answer", ...], ...],
              "questions": [ { "column": 0, "type": "choice", "options": [...] } ] }
            One row per person, one column per question. questions is optional; types are
            choice, multi, rating, nps, text, skip. A multi may give "separator" (default ";"),
            a rating "min" and "max". Blank cells are no answer.

Confidence must be 90, 95 or 99. Margin thresholds: \u00b15pp clean, \u00b15\u20138pp
directional, wider is noise \u2014 working labels, not laws.`;

function demo() {
  console.log('\u25b8 DEMO 1 \u2014 sample mode (Brightlane onboarding NPS-driver survey)');
  console.log(renderSample(sampleSize({ marginOfError: 5, confidence: 95, expectedProportion: 50, population: 2000, responseRate: 20 })));
  console.log('');
  console.log('\u25b8 DEMO 2 \u2014 segments mode (can we read Enterprise separately?)');
  console.log(renderSegments(segments({
    completes: 323, confidence: 95,
    segments: [
      { name: 'SMB', share: 55 },
      { name: 'Mid-Market', share: 30 },
      { name: 'Enterprise', share: 15 }
    ]
  })));
  console.log('');
  console.log('\u25b8 DEMO 3 \u2014 readout mode (Example Co., a fictional company; invented answers)');
  console.log(renderReadout(readout(DEMO_READOUT)));
}

// Example Co. is fictional and every answer here is invented.
const DEMO_READOUT = (() => {
  const rows = [], add = (k, use, wants, sat, nps, note) => { for (let i = 0; i < k; i++) rows.push([use, wants, sat, nps, i === 0 ? note : '']); };
  add(14, 'Weekly', 'Reports;Alerts', '4', '9', 'The weekly digest saves me an hour.');
  add(9, 'Weekly', 'Reports', '5', '10', 'Easy to set up.');
  add(8, 'Daily', 'Alerts;Integrations', '4', '8', 'Would like a Slack integration.');
  add(6, 'Monthly', 'Reports', '3', '7', '');
  add(5, 'Monthly', '', '2', '4', 'Too many emails.');
  add(3, 'Daily', 'Integrations', '5', '', 'Fast.');
  return { confidence: 95, columns: ['How often do you use it?', 'Which features matter most?', 'How satisfied are you?', 'How likely are you to recommend us?', 'Anything else?'], rows,
    questions: [{ column: 0, type: 'choice', options: ['Daily', 'Weekly', 'Monthly', 'Never'] }, { column: 2, type: 'rating', min: 1, max: 5 }] };
})();

function modeOf(cfg) {
  if (cfg.mode != null) return cfg.mode;
  if (cfg.rows !== undefined || cfg.columns !== undefined) return 'readout';
  if (cfg.segments !== undefined || cfg.completes !== undefined) return 'segments';
  if (cfg.marginOfError !== undefined) return 'sample';
  return null;
}

function main() {
  let [mode, arg] = process.argv.slice(2);
  const MODES = ['sample', 'segments', 'readout'];
  try {
    if (!mode || mode === '--demo') return demo();
    if (mode === '--help' || mode === '-h') return console.log(HELP);
    // One JSON object on its own: the mode is its "mode" field, or is told from its fields.
    if (/^\s*\{/.test(mode)) { arg = mode; mode = null; }
    else if (MODES.indexOf(mode) < 0) throw new Error(`Unknown mode "${mode}". Modes: ${MODES.join(', ')}, --demo, --help`);
    else if (!arg) throw new Error(`${mode} mode needs a JSON config \u2014 run --demo to see one`);
    let cfg;
    try { cfg = JSON.parse(arg); }
    catch (e) { throw new Error('Invalid JSON. Run --demo for a worked example, --help for the schema.'); }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('The config must be a JSON object. Run --help for the schema.');
    if (!mode) {
      mode = modeOf(cfg);
      if (MODES.indexOf(mode) < 0) throw new Error(mode == null ? 'Say which mode: add "mode": "sample", "segments" or "readout". Run --help for the schema.' : `Unknown mode "${mode}". Modes: ${MODES.join(', ')}`);
    }
    if (mode !== 'readout' && cfg.mode !== undefined) { cfg = Object.assign({}, cfg); delete cfg.mode; }
    const out = mode === 'sample' ? renderSample(sampleSize(cfg)) : mode === 'segments' ? renderSegments(segments(cfg)) : renderReadout(readout(cfg));
    return console.log(out);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { sampleSize, segments, segmentMoE, readLabel, pct, readout, wilson, splitMulti, READ_RULES, READ_TYPES, renderSample, renderSegments, renderReadout };
