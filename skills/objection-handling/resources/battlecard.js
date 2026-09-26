#!/usr/bin/env node
/*
 * AAJ Objection Handling — battlecard engine
 * Part of the "objection-handling" Agent Skill.
 *
 * Builds a competitor battlecard and checks it against the skill's guardrails
 * before a rep ever sees it: honest about where the rival wins, every claim of
 * ours backed by proof, every fact about them sourced and dated, objections
 * answered as acknowledge -> reframe -> prove, and no disparagement.
 *
 * USAGE
 *   node battlecard.js                    # demo
 *   node battlecard.js '<json-config>'    # your own
 *   node battlecard.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "you": "Your product",
 *     "competitor": "Their product",
 *     "today": "2026-09-26",                 // optional, for staleness
 *     "record": { "won": 7, "lost": 5 },     // optional: decided deals against them
 *     "whereWeWin":  [ { "point": "...", "proof": "..." } ],
 *     "whereTheyWin":[ { "point": "...", "response": "..." } ],   // honest; response optional
 *     "facts": [ { "claim": "Their entry plan is per seat", "source": "their pricing page", "checked": "2026-09-01" } ],
 *     "objections": [ { "objection": "...", "type": "blocker" | "misunderstanding" | "smokescreen",
 *                       "acknowledge": "...", "reframe": "...", "prove": "..." } ],
 *     "questions":    [ "A question that surfaces where you win?" ],
 *     "disqualifiers":[ "When to walk away" ]
 *   }
 *
 * The engine reports gaps instead of refusing to run: a battlecard with a hole
 * in it is a finding to fix, not an error.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into aajconsult.com/tools/battlecard-builder.
   If this block changes, re-copy it there; the site's verify script runs the same cases. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

// Rules of this engine, stated where they are used so a reader can argue with them.
const STALE_DAYS = 90;        // a fact about a competitor unchecked for longer is flagged
const MIN_ANSWER_CHARS = 25;  // shorter than this, a response is a slogan, not an answer
const TYPES = ['blocker', 'misunderstanding', 'smokescreen'];

// Words that turn a battlecard into an attack. A buyer who likes the rival stops listening.
const DISPARAGE = /\b(terrible|awful|garbage|trash|junk|scam|liars?|lying|incompetent|clueless|useless|pathetic|joke|crap|sucks?)\b/i;
// Absolutes a buyer can disprove with one counterexample.
const ABSOLUTE = /\b(always|never|only we|nobody else|no one else|best in class|the best|#1|number one|unmatched|unbeatable|guaranteed)\b/i;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (v) => str(v).length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);

function parseDate(v) {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt : null;
}

// Wilson score interval: an honest range for a win rate from a small number of deals.
function wilson(won, n, z) {
  if (n <= 0) return null;
  const p = won / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function build(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  if (!has(cfg.you)) die('Give "you": the product the battlecard is for.');
  if (!has(cfg.competitor)) die('Give "competitor": the rival the card is about.');

  const today = cfg.today !== undefined ? parseDate(cfg.today) : null;
  if (cfg.today !== undefined && !today) die('"today" must be a real date as YYYY-MM-DD.');
  const now = today || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  const findings = [];
  const add = (level, id, text) => findings.push({ level, id, text });

  const win = arr(cfg.whereWeWin).filter((x) => x && has(x.point)).map((x) => ({ point: str(x.point), proof: str(x.proof) }));
  const theyWin = arr(cfg.whereTheyWin).filter((x) => x && has(x.point)).map((x) => ({ point: str(x.point), response: str(x.response) }));
  const facts = arr(cfg.facts).filter((x) => x && has(x.claim)).map((x) => ({ claim: str(x.claim), source: str(x.source), checked: str(x.checked) }));
  const objections = arr(cfg.objections).filter((x) => x && has(x.objection)).map((x) => ({
    objection: str(x.objection), type: str(x.type).toLowerCase(),
    acknowledge: str(x.acknowledge), reframe: str(x.reframe), prove: str(x.prove),
  }));
  const questions = arr(cfg.questions).map(str).filter(Boolean);
  const disqualifiers = arr(cfg.disqualifiers).map(str).filter(Boolean);

  // ---- where we win: every point needs proof
  if (!win.length) add('fix', 'no-win', `Nothing listed where ${str(cfg.you)} wins. A rep with no reason to choose you will compete on price.`);
  win.forEach((w) => {
    if (!has(w.proof)) add('fix', 'win-no-proof', `"${w.point}" has no proof. Without a customer result, a demo moment or a checkable fact, it is an opinion - and the buyer has heard the rival's opinion too.`);
  });

  // ---- where they win: honesty is the credibility of the whole card
  if (!theyWin.length) add('fix', 'no-honesty', `Nothing listed where ${str(cfg.competitor)} wins. A card that admits no strengths reads as spin, and reps stop trusting it the first time a buyer knows better.`);
  theyWin.forEach((t) => {
    if (!has(t.response)) add('improve', 'strength-no-response', `"${t.point}" is acknowledged with nothing after it. Add when it matters less for this buyer, so the rep has somewhere to go.`);
  });

  // ---- facts about the competitor: sourced and dated
  facts.forEach((f) => {
    if (!has(f.source)) add('fix', 'fact-unsourced', `"${f.claim}" has no source. An unsourced claim about a competitor is the one a buyer is most likely to check - and repeat back to them.`);
    const d = parseDate(f.checked);
    if (!d) add('improve', 'fact-undated', `"${f.claim}" has no date it was last checked. Competitors change pricing and features; the rep needs to know how old this is.`);
    else {
      const age = Math.round((now - d) / 86400000);
      if (age > STALE_DAYS) add('fix', 'fact-stale', `"${f.claim}" was last checked ${age} days ago. Re-check it before a rep uses it - this engine flags anything older than ${STALE_DAYS} days.`);
    }
  });

  // ---- objections: acknowledge -> reframe -> prove
  if (!objections.length) add('improve', 'no-objections', 'No objections listed. Pull the real ones from lost deals and call notes; they are what the card is for.');
  objections.forEach((o) => {
    const missing = ['acknowledge', 'reframe', 'prove'].filter((k) => !has(o[k]));
    if (missing.length) add('fix', 'objection-incomplete', `"${o.objection}" is missing ${missing.join(', ')}. Each response needs all three: agree with what is true, change the frame, then show evidence.`);
    ['acknowledge', 'reframe', 'prove'].forEach((k) => {
      if (has(o[k]) && o[k].length < MIN_ANSWER_CHARS) add('improve', 'objection-thin', `The ${k} step for "${o.objection}" is very short. A slogan is not an answer a rep can say out loud.`);
    });
    if (!TYPES.includes(o.type)) add('improve', 'objection-untyped', `"${o.objection}" is not classified. Say whether it is a real blocker, a misunderstanding or a smokescreen - each needs a different response.`);
  });
  if (objections.some((o) => o.type === 'blocker') && !disqualifiers.length) {
    add('improve', 'blocker-no-walk', 'There is a real blocker but no disqualifier. Some blockers mean the deal is the wrong fit - say when to walk rather than overcome.');
  }

  // ---- questions and disqualifiers
  if (!questions.length) add('improve', 'no-questions', 'No reframing questions. A good question lets the buyer discover where you win instead of being told.');
  questions.forEach((q) => { if (!/\?\s*$/.test(q)) add('improve', 'question-not-question', `"${q}" is not phrased as a question.`); });
  if (!disqualifiers.length) add('improve', 'no-disqualifiers', 'No disqualifiers. Name the situations where the rival is the better fit and the rep should walk away.');

  // ---- tone: no disparagement, no absolutes
  const scan = [
    ...win.map((w) => ['where you win', w.point + ' ' + w.proof]),
    ...theyWin.map((t) => ['where they win', t.point + ' ' + t.response]),
    ...facts.map((f) => ['facts', f.claim]),
    ...objections.map((o) => ['objection responses', [o.acknowledge, o.reframe, o.prove].join(' ')]),
    ...questions.map((q) => ['questions', q]),
  ];
  const disp = scan.filter(([, t]) => DISPARAGE.test(t));
  if (disp.length) add('fix', 'disparaging', `Disparaging language in ${[...new Set(disp.map((d) => d[0]))].join(', ')} ("${(disp[0][1].match(DISPARAGE) || [''])[0]}"). Never attack the rival; a buyer who likes them stops listening.`);
  const abs = scan.filter(([, t]) => ABSOLUTE.test(t));
  if (abs.length) add('improve', 'absolute', `Absolute claims in ${[...new Set(abs.map((d) => d[0]))].join(', ')} ("${(abs[0][1].match(ABSOLUTE) || [''])[0]}"). A buyer needs one counterexample to disprove it. Say what you do, and how you know.`);

  // ---- the deal record
  let record = null;
  const r = cfg.record;
  if (r && typeof r === 'object') {
    const won = Number(r.won), lost = Number(r.lost);
    if (!Number.isInteger(won) || !Number.isInteger(lost) || won < 0 || lost < 0) die('"record.won" and "record.lost" must be whole numbers of decided deals.');
    const n = won + lost;
    record = { won, lost, n, interval: wilson(won, n, 1.645) };
    if (n === 0) add('improve', 'no-deals', `No decided deals against ${str(cfg.competitor)} yet. Until there are, this card is a hypothesis - mark it as one.`);
  } else {
    add('improve', 'no-record', `No deal record against ${str(cfg.competitor)}. Add won and lost counts from your CRM, so the card rests on outcomes rather than impressions.`);
  }

  const fixes = findings.filter((f) => f.level === 'fix').length;
  const verdict = fixes === 0
    ? { level: 'ready', headline: 'Ready for reps', body: 'Every claim is backed, every fact is sourced and current, and the card is honest about where the rival wins.' }
    : { level: 'fix', headline: 'Fix before sharing', body: `${fixes} issue${fixes > 1 ? 's' : ''} would cost a rep credibility in front of a buyer. Fix those first.` };

  return {
    you: str(cfg.you), competitor: str(cfg.competitor),
    card: { whereWeWin: win, whereTheyWin: theyWin, facts, objections, questions, disqualifiers },
    record, findings, verdict,
    rules: { STALE_DAYS, MIN_ANSWER_CHARS },
  };
}

function pct(v) { return Math.round(v * 100) + '%'; }
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  L.push('');
  L.push(`AAJ - BATTLECARD: ${r.you} vs ${r.competitor}`);
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  if (r.record && r.record.n > 0) {
    const i = r.record.interval;
    L.push(`  Record: won ${r.record.won} of ${r.record.n} decided deals (${pct(i.rate)}; plausibly ${pct(i.low)} to ${pct(i.high)})`);
  }
  const c = r.card;
  const sec = (title, rows) => { if (!rows.length) return; L.push(''); L.push(title); rows.forEach((x) => L.push('  ' + x)); };
  sec('WHERE WE WIN', c.whereWeWin.map((w) => `- ${w.point}${w.proof ? '\n      proof: ' + w.proof : '   [no proof]'}`));
  sec('WHERE THEY WIN (be honest)', c.whereTheyWin.map((t) => `- ${t.point}${t.response ? '\n      then: ' + t.response : ''}`));
  sec('QUESTIONS TO ASK', c.questions.map((q) => `- ${q}`));
  sec('OBJECTIONS', c.objections.map((o) => `- "${o.objection}" (${o.type || 'unclassified'})\n      acknowledge: ${o.acknowledge || '-'}\n      reframe:     ${o.reframe || '-'}\n      prove:       ${o.prove || '-'}`));
  sec('FACTS (sourced, dated)', c.facts.map((f) => `- ${f.claim}  [${f.source || 'no source'}, ${f.checked || 'undated'}]`));
  sec('WALK AWAY WHEN', c.disqualifiers.map((d) => `- ${d}`));
  if (r.findings.length) {
    L.push('');
    L.push('BEFORE SHARING');
    r.findings.filter((f) => f.level === 'fix').forEach((f) => L.push(`  !  ${f.text}`));
    r.findings.filter((f) => f.level === 'improve').forEach((f) => L.push(`  -  ${f.text}`));
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Illustrative only: invented products, not real companies or results.
const DEMO = {
  you: 'Ledgerline', competitor: 'Tallybook', today: '2026-09-26',
  record: { won: 7, lost: 5 },
  whereWeWin: [
    { point: 'Month-end close in days, not weeks, for multi-entity finance teams', proof: 'Named reference customer with a before-and-after close time, approved for use' },
    { point: 'Setup without a consultant', proof: 'Onboarding times from our own CRM records, available on request' },
  ],
  whereTheyWin: [
    { point: 'Larger app marketplace', response: 'Ask which integrations they actually use; we cover the common accounting and payroll ones.' },
    { point: 'Lower entry price for a single entity', response: '' },
  ],
  facts: [{ claim: 'Their multi-entity plan is priced per entity', source: 'their public pricing page', checked: '2026-04-02' }],
  objections: [
    { objection: 'Tallybook is cheaper', type: 'misunderstanding',
      acknowledge: 'For one entity, their entry plan does cost less than ours.',
      reframe: 'The comparison that matters is the cost once you add the second and third entity you mentioned.',
      prove: 'Walk through their public per-entity pricing against ours for their entity count.' },
    { objection: 'We need an app we already use', type: 'blocker', acknowledge: 'Fair.', reframe: '', prove: '' },
  ],
  questions: ['How long does month-end close take you today, and which step takes longest?', 'How many entities do you expect to run in a year'],
  disqualifiers: [],
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: two invented products; one stale fact, one unanswered blocker, no disqualifiers)');
  }
  try {
    console.log(render(build(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { build, wilson, STALE_DAYS, MIN_ANSWER_CHARS };
