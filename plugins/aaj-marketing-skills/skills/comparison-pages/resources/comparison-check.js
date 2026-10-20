#!/usr/bin/env node
/*
 * AAJ Comparison Pages - fairness checker
 * Part of the "comparison-pages" Agent Skill.
 *
 * Checks an "X vs Y" or "alternatives to X" page before it ships: every fact
 * about a rival sourced and dated, nothing older than the staleness rule, at
 * least one criterion where each rival wins, no disparaging or absolute wording,
 * a methodology note that says how the comparison was made, and a visible
 * last-updated date. Buyers and AI answers both check the claims about the
 * other product first; this checks them before they do.
 *
 * USAGE
 *   node comparison-check.js                 # demo
 *   node comparison-check.js '<json-config>' # your own
 *   node comparison-check.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "us": "Ledgerline",
 *     "them": "Tallybook",                 // the rival (vs page) or the default rival for rows
 *     "pageType": "vs",                    // "vs" | "alternatives"
 *     "today": "2026-10-10",               // optional, for staleness (default today)
 *     "lastUpdated": "2026-10-01",         // optional: the date shown on the page
 *     "rows": [
 *       { "criterion": "Multi-entity consolidation",
 *         "us": "Included on all plans", "them": "Add-on on the Pro plan",
 *         "rival": "Tallybook",            // optional: which rival this row is about (alternatives pages)
 *         "source": "tallybook.com/pricing", "checked": "2026-09-20",
 *         "usSource": "our pricing page",  // optional: where our own claim can be checked
 *         "winner": "us" }                 // "us" | "them" | "tie" | "depends"
 *     ],
 *     "copy": "The page's text...",        // the prose around the table
 *     "methodology": "How we compared..."  // optional; otherwise looked for in copy
 *   }
 *
 * Rules of this engine (stated so a reader can argue with them): a fact about a
 * rival unchecked for more than 90 days is stale - the same rule as AAJ's
 * battlecard engine; every rival must win or tie at least one criterion.
 * The wording scan reuses the battlecard engine's approach (disparaging words and
 * absolutes a buyer can disprove with one counterexample), plus a few
 * comparison-page phrases. Orientation, not legal advice.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - the comparison checking core. If a browser tool ever embeds
   this engine, copy this block verbatim and guard it byte for byte. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

const STALE_DAYS = 90;
const WINNERS = ['us', 'them', 'tie', 'depends'];

// From the battlecard engine (objection-handling/resources/battlecard.js): words that
// turn a comparison into an attack, and absolutes a buyer can disprove with one
// counterexample. Comparison-page additions are on the second line of each.
const DISPARAGE = /\b(terrible|awful|garbage|trash|junk|scam|liars?|lying|incompetent|clueless|useless|pathetic|joke|crap|sucks?|ripoff|rip-off|dinosaur|bloated|clunky)\b/i;
const ABSOLUTE = /\b(always|never|only we|nobody else|no one else|best in class|the best|#1|number one|unmatched|unbeatable|guaranteed|in every way|hands down|no contest|the only (?:tool|platform|solution|product|option|choice))\b/i;
const METHOD = /\b(methodology|how we compared|how we tested|how we evaluated|how we chose|how this comparison was made|what we compared|our method)\b/i;
const DISCLOSE = /\b(we make|we build|we built|we sell|our product|our company|written by the|published by|disclosure|full disclosure|we are the team behind)\b/i;

const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const has = (v) => str(v).length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseDate(v) {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt : null;
}

function check(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  if (!has(cfg.us)) die('Give "us": the product the page is published by.');
  const pageType = has(cfg.pageType) ? str(cfg.pageType).toLowerCase() : 'vs';
  if (!['vs', 'alternatives'].includes(pageType)) die('"pageType" must be "vs" or "alternatives".');
  const them = str(cfg.them);
  if (pageType === 'vs' && !them) die('Give "them": the rival a vs page compares against.');
  const today = cfg.today !== undefined ? parseDate(cfg.today) : null;
  if (cfg.today !== undefined && !today) die('"today" must be a real date as YYYY-MM-DD.');
  const now = today || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  const rows = arr(cfg.rows).filter((r) => r && has(r.criterion)).map((r) => ({
    criterion: str(r.criterion), us: str(r.us), them: str(r.them),
    rival: str(r.rival) || them, source: str(r.source), checked: str(r.checked),
    usSource: str(r.usSource), winner: str(r.winner).toLowerCase(),
  }));
  if (!rows.length) die('Give "rows": the comparison table, one row per criterion.', 'Each row: criterion, us, them, source, checked, winner.');
  if (rows.some((r) => !r.rival)) die('A row has no rival. Give "them", or "rival" on each row.');
  const copy = str(cfg.copy);
  const methodology = str(cfg.methodology);

  const findings = [];
  const add = (level, id, text) => findings.push({ level, id, text });

  // ---- facts about the rival: sourced, dated, current
  rows.forEach((r) => {
    const label = `"${r.criterion}" (${r.rival})`;
    if (!r.them) add('improve', 'rival-blank', `${label} has no value for the rival. If it is not published, say "not published" rather than leave it blank.`);
    if (!r.source) add('fix', 'rival-unsourced', `${label} has no source. A claim about another company's product is the one a buyer, or an AI answer, checks first.`);
    const d = parseDate(r.checked);
    if (!d) add('fix', 'rival-undated', `${label} has no date it was last checked (YYYY-MM-DD). Readers need to know how old a claim about a rival is.`);
    else {
      const age = Math.round((now - d) / 86400000);
      if (age > STALE_DAYS) add('fix', 'rival-stale', `${label} was last checked ${age} days ago. Re-check it; this engine flags anything older than ${STALE_DAYS} days.`);
      else if (age < 0) add('fix', 'rival-future', `${label} has a checked date in the future.`);
    }
    if (r.us && !r.usSource) add('improve', 'us-unsourced', `${label}: our own claim has no source. Say where a reader can verify it (pricing page, docs, changelog).`);
    if (!WINNERS.includes(r.winner)) add('improve', 'no-winner', `${label} does not say who wins. Mark each row us, them, tie or depends, so one-sidedness can be checked.`);
  });

  // ---- one-sidedness: every rival wins or ties somewhere
  const rivals = [...new Set(rows.map((r) => r.rival))];
  const tally = rivals.map((name) => {
    const rs = rows.filter((r) => r.rival === name);
    const c = (w) => rs.filter((r) => r.winner === w).length;
    return { rival: name, rows: rs.length, us: c('us'), them: c('them'), tie: c('tie'), depends: c('depends') };
  });
  tally.forEach((t) => {
    const marked = t.us + t.them + t.tie + t.depends;
    if (marked && t.them === 0 && t.tie === 0 && t.depends === 0) {
      add('fix', 'one-sided', `${str(cfg.us)} wins every criterion against ${t.rival}. A table with no criterion where the rival wins reads as an ad, and buyers who know the rival stop trusting it. Add the criteria where ${t.rival} is the better choice.`);
    } else if (marked && t.them === 0) {
      add('improve', 'no-rival-win', `${t.rival} never wins outright (only ties or "depends"). Name at least one thing ${t.rival} does better, and for whom.`);
    }
  });
  if (pageType === 'alternatives' && rivals.length < 2) {
    add('improve', 'few-alternatives', `An alternatives page lists ${rivals.length} rival. Readers searching "alternatives to" expect more than one option; cover the ones they are actually weighing.`);
  }

  // ---- "who should choose them": the fairness passage in the copy
  rivals.forEach((name) => {
    const re = new RegExp(`(choose|pick|go with|stick with|better fit|better choice|better option)[^.]{0,80}\\b${esc(name)}\\b|\\b${esc(name)}\\b[^.]{0,80}(better fit|better choice|better option|is better|wins)`, 'i');
    if (copy && !re.test(copy)) add('improve', 'no-choose-them', `The copy never says when ${name} is the better choice. One honest paragraph on who should pick ${name} is what makes the rest believable.`);
  });

  // ---- wording: no disparagement, no absolutes
  const scan = [
    ...rows.map((r) => ['table', [r.criterion, r.us, r.them].join(' ')]),
    ['copy', copy],
    ['methodology', methodology],
  ].filter(([, t]) => t);
  const disp = scan.filter(([, t]) => DISPARAGE.test(t));
  if (disp.length) add('fix', 'disparaging', `Disparaging language in ${[...new Set(disp.map((d) => d[0]))].join(', ')} ("${(disp[0][1].match(DISPARAGE) || [''])[0]}"). Describe what the rival does, with a source; let the reader judge.`);
  const abs = scan.filter(([, t]) => ABSOLUTE.test(t));
  if (abs.length) add('improve', 'absolute', `Absolute claims in ${[...new Set(abs.map((d) => d[0]))].join(', ')} ("${(abs[0][1].match(ABSOLUTE) || [''])[0]}"). One counterexample disproves an absolute; say what you do and how you know.`);

  // ---- methodology, disclosure and freshness
  if (!methodology && !METHOD.test(copy)) add('fix', 'no-methodology', 'No methodology note. Say what was compared, how (plans, versions, public pages or hands-on tests), and when. The FTC\'s comparative advertising policy statement (16 CFR 14.15) supports brand comparisons whose bases are clearly identified.');
  if (copy && !DISCLOSE.test(copy) && !DISCLOSE.test(methodology)) add('improve', 'no-disclosure', `The page does not say that ${str(cfg.us)} published it. Say so near the top; a reader who finds out later discounts everything.`);
  let updatedAge = null;
  if (has(cfg.lastUpdated)) {
    const u = parseDate(cfg.lastUpdated);
    if (!u) add('improve', 'updated-format', '"lastUpdated" is not a date as YYYY-MM-DD.');
    else {
      updatedAge = Math.round((now - u) / 86400000);
      if (updatedAge > STALE_DAYS) add('improve', 'page-stale', `The page was last updated ${updatedAge} days ago. Review it on the same cycle as the facts in it.`);
    }
  } else add('improve', 'no-updated-date', 'No last-updated date given. Show one on the page, and update it when the facts are re-checked.');

  // ---- dates of rival facts: the oldest decides the review date
  const dated = rows.map((r) => parseDate(r.checked)).filter(Boolean);
  const oldest = dated.length ? new Date(Math.min(...dated.map((d) => d.getTime()))) : null;
  const reviewBy = oldest ? new Date(oldest.getTime() + STALE_DAYS * 86400000).toISOString().slice(0, 10) : null;

  const fixes = findings.filter((f) => f.level === 'fix').length;
  const verdict = fixes === 0
    ? { level: 'ready', headline: 'Ready to publish', body: 'Rival facts are sourced and current, each rival wins somewhere, and the method is stated.' }
    : { level: 'fix', headline: 'Fix before publishing', body: `${fixes} issue${fixes > 1 ? 's' : ''} would cost the page its credibility with a buyer who checks.` };

  return {
    us: str(cfg.us), pageType, rivals, rows, tally, findings, verdict,
    freshness: { oldestCheck: oldest ? oldest.toISOString().slice(0, 10) : null, reviewBy, overdue: !!(oldest && now - oldest > STALE_DAYS * 86400000), updatedAge },
    rules: { STALE_DAYS },
  };
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  L.push('');
  L.push(`AAJ - COMPARISON PAGE CHECK: ${r.us} ${r.pageType === 'vs' ? 'vs ' + r.rivals.join(', ') : 'alternatives (' + r.rivals.join(', ') + ')'}`);
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push('');
  L.push('WHO WINS WHAT');
  r.tally.forEach((t) => L.push(`  vs ${t.rival}: ${r.us} ${t.us}, ${t.rival} ${t.them}, tie ${t.tie}, depends ${t.depends} (of ${t.rows} criteria)`));
  L.push('');
  L.push('TABLE');
  r.rows.forEach((x) => L.push(`  - ${x.criterion}: ${x.us || '-'} | ${x.rival}: ${x.them || '-'}  [${x.source || 'no source'}, ${x.checked || 'undated'}] -> ${x.winner || '?'}`));
  if (r.freshness.reviewBy) {
    L.push('');
    L.push(`  Oldest rival fact checked ${r.freshness.oldestCheck}; ${r.freshness.overdue ? 're-check was due ' + r.freshness.reviewBy + ' (overdue)' : 're-check the table by ' + r.freshness.reviewBy}.`);
  }
  if (r.findings.length) {
    L.push('');
    L.push('BEFORE PUBLISHING');
    r.findings.filter((f) => f.level === 'fix').forEach((f) => L.push(`  !  ${f.text}`));
    r.findings.filter((f) => f.level === 'improve').forEach((f) => L.push(`  -  ${f.text}`));
  }
  L.push('');
  L.push('  Orientation, not legal advice: comparative claims about a named competitor can carry legal risk. See 16 CFR 14.15 and check the page with counsel.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Illustrative only: invented products, not real companies or facts.
const DEMO = {
  us: 'Ledgerline', them: 'Tallybook', pageType: 'vs', today: '2026-10-10', lastUpdated: '2026-09-28',
  rows: [
    { criterion: 'Multi-entity consolidation', us: 'Included on all plans', them: 'Add-on on the Pro plan', source: 'tallybook.example/pricing', checked: '2026-09-20', usSource: 'ledgerline.example/pricing', winner: 'us' },
    { criterion: 'Entry price, one entity', us: '$59 per month', them: '$29 per month', source: 'tallybook.example/pricing', checked: '2026-05-02', usSource: 'ledgerline.example/pricing', winner: 'them' },
    { criterion: 'App marketplace', us: '40 integrations', them: '300+ integrations', source: '', checked: '', winner: 'them' },
    { criterion: 'Setup', us: 'Self-serve import', them: 'Clunky partner-led onboarding', source: 'tallybook.example/docs/onboarding', checked: '2026-09-20', winner: 'us' },
  ],
  copy: 'Ledgerline vs Tallybook. Ledgerline is the best choice for multi-entity finance teams. Tallybook costs less for a single entity and has a larger app marketplace, so choose Tallybook if you run one entity and rely on niche apps.',
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: two invented products; one stale and one unsourced rival fact, a loaded word, no methodology)');
  }
  try {
    console.log(render(check(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { check, STALE_DAYS };
