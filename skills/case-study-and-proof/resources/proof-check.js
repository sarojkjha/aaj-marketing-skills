#!/usr/bin/env node
/*
 * AAJ Case Study & Proof — engine
 * Part of the "case-study-and-proof" Agent Skill.
 *
 * Two checks, both from the AAJ position that proof you cannot publish is not
 * proof, and a number you cannot defend is worse than no number:
 *
 *   scoreProof(study)        does this case study convince a sceptic?
 *   checkPermission(consent) may you actually publish it, and in what form?
 *
 * USAGE
 *   node proof-check.js                    # demo (both checks)
 *   node proof-check.js '<json-config>'    # your own
 *   node proof-check.js --help
 *
 * CONFIG (JSON) — one or both keys:
 *
 *   { "study": {
 *       "customer":     "Northwind Logistics" | null,
 *       "descriptor":   "a 40-person freight broker in the Midwest",
 *       "problem":      "quotes took three days, so buyers went elsewhere",
 *       "beforeValue":  72, "afterValue": 4, "metric": "hours to quote",
 *       "periodMonths": 6,
 *       "otherChanges": ["hired two ops staff", "changed pricing"],
 *       "quote":        { "text": "...", "name": "Dana Ruiz", "role": "COO" },
 *       "verifiable":   "reference-call" | "public" | "none"
 *   } }
 *
 *   { "consent": {
 *       "written":    true,
 *       "approver":   { "name": "Dana Ruiz", "role": "COO" },
 *       "dated":      "2026-03-04",
 *       "covers":     ["name", "logo", "numbers", "quote"],
 *       "reviewMonths": 12,
 *       "uses":       ["name", "numbers", "quote"]
 *   } }
 *
 * `uses` is what the asset actually does. Anything used but not covered is a
 * blocker, not a warning.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

function die(msg, hint) {
  console.error('error: ' + msg);
  if (hint) console.error('       ' + hint);
  console.error('\nRun --help for the schema, or --demo for a worked example.');
  process.exit(1);
}

/* ─────────────────────────── proof scoring ─────────────────────────── */

// Weights follow what a sceptical buyer actually checks. The two heaviest are
// the ones most case studies skip: a baseline, and what else was changing.
const FACTORS = [
  { id: 'identified', pts: 15, name: 'The customer is identifiable',
    why: 'An unnamed customer with no descriptor reads as invented. If you cannot name them, a specific descriptor - sector, size, region - carries most of the weight.' },
  { id: 'before', pts: 15, name: 'A baseline number',
    why: 'Without a before, the after is a number with nothing to compare it to. This is the most common missing piece.' },
  { id: 'after', pts: 15, name: 'An after number on the same definition',
    why: 'Changing how the metric is defined between before and after is how honest teams accidentally mislead.' },
  { id: 'confounders', pts: 15, name: 'What else changed is disclosed',
    why: 'Buyers assume you were not the only variable, because you never are. Naming the others is what makes the claim survive scrutiny.' },
  { id: 'problem', pts: 10, name: 'The problem is specific',
    why: 'A generic problem produces a generic case study that any competitor could have written.' },
  { id: 'period', pts: 10, name: 'A timeframe',
    why: 'A result with no period cannot be judged. Six weeks and six quarters are different claims.' },
  { id: 'quote', pts: 10, name: 'A quote attributed to a named person and role',
    why: 'An anonymous quote adds nothing a sentence of your own prose would not.' },
  { id: 'verifiable', pts: 10, name: 'Independently checkable',
    why: 'A reference call or a public source turns a claim into evidence.' },
];

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

function scoreProof(study) {
  if (!study || typeof study !== 'object') die('"study" must be an object.');

  const before = num(study.beforeValue);
  const after = num(study.afterValue);
  const has = {
    identified: !!(study.customer || (study.descriptor && String(study.descriptor).trim().length >= 12)),
    before: before !== null,
    after: after !== null,
    confounders: Array.isArray(study.otherChanges) && study.otherChanges.length > 0,
    problem: !!(study.problem && String(study.problem).trim().length >= 20),
    period: num(study.periodMonths) !== null && num(study.periodMonths) > 0,
    quote: !!(study.quote && study.quote.text && study.quote.name && study.quote.role),
    verifiable: study.verifiable === 'reference-call' || study.verifiable === 'public',
  };

  const results = FACTORS.map((f) => ({ ...f, pass: !!has[f.id] }));
  const total = results.filter((r) => r.pass).reduce((s, r) => s + r.pts, 0);
  const gaps = results.filter((r) => !r.pass).sort((a, b) => b.pts - a.pts);

  // A case study without a baseline is a testimonial. Say so rather than
  // scoring it as a weak case study - they need different fixes.
  const testimonialOnly = !has.before;

  let change = null;
  if (before !== null && after !== null && before !== 0) {
    const delta = after - before;
    const relative = (delta / Math.abs(before)) * 100;
    change = {
      delta,
      relativePct: Math.round(relative * 10) / 10,
      direction: delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down',
    };
  }

  let band;
  if (testimonialOnly) band = 'TESTIMONIAL';
  else if (total >= 80) band = 'STRONG';
  else if (total >= 55) band = 'USABLE';
  else band = 'THIN';

  return { total, band, results, gaps, change, testimonialOnly, has };
}

/* ─────────────────────────── permission ─────────────────────────── */

const SCOPES = ['name', 'logo', 'numbers', 'quote'];

function checkPermission(consent) {
  if (!consent || typeof consent !== 'object') die('"consent" must be an object.');

  const covers = Array.isArray(consent.covers) ? consent.covers.map((s) => String(s).toLowerCase()) : [];
  const uses = Array.isArray(consent.uses) ? consent.uses.map((s) => String(s).toLowerCase()) : [];

  for (const u of uses) {
    if (!SCOPES.includes(u)) die(`"uses" contains "${u}", which is not one of: ${SCOPES.join(', ')}.`);
  }
  for (const c of covers) {
    if (!SCOPES.includes(c)) die(`"covers" contains "${c}", which is not one of: ${SCOPES.join(', ')}.`);
  }

  const blockers = [];
  const warnings = [];

  if (!consent.written) {
    blockers.push({
      id: 'unwritten',
      text: 'No written permission. A verbal yes from someone who has since left is not permission, and it is the person who did not give it who finds the page.',
    });
  }
  if (!consent.approver || !consent.approver.name || !consent.approver.role) {
    blockers.push({
      id: 'no-approver',
      text: 'No named approver with a role. "Marketing said it was fine" is not a record you can produce later.',
    });
  }

  const exceeded = uses.filter((u) => !covers.includes(u));
  for (const u of exceeded) {
    blockers.push({
      id: 'scope:' + u,
      text: `The asset uses the ${u} but permission does not cover it. Either get it covered or remove it.`,
    });
  }

  if (!consent.dated) {
    warnings.push('Permission is undated. Date it - scope questions surface years later.');
  }
  const review = num(consent.reviewMonths);
  if (review === null) {
    warnings.push('No review period. Set one (twelve months is usual) so a customer who churns or is acquired triggers a re-check.');
  } else if (review > 24) {
    warnings.push(`A ${review}-month review period is long. Companies change hands faster than that.`);
  }

  // What you may publish given what is actually covered.
  const permitted = SCOPES.filter((s) => covers.includes(s));
  const mustAnonymise = blockers.length > 0 || !covers.includes('name');

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    permitted,
    mustAnonymise,
    fallback: mustAnonymise
      ? 'Publish it anonymised: sector, company size and region instead of the name, no logo, and the numbers only if "numbers" is covered. An anonymised case study with real numbers beats a named one you had to take down.'
      : null,
  };
}

/* ─────────────────────────── rendering ─────────────────────────── */

const bar = (pct) => '#'.repeat(Math.round(pct / 10)) + '.'.repeat(10 - Math.round(pct / 10));

function renderProof(study, r) {
  const L = [];
  L.push('');
  L.push('AAJ - CASE STUDY & PROOF');
  L.push('-'.repeat(66));
  L.push(`  Credibility  ${bar(r.total)}  ${r.total}/100   ${r.band}`);
  if (r.testimonialOnly) {
    L.push('');
    L.push('  This is a testimonial, not a case study. There is no baseline, so');
    L.push('  there is no claim - only a happy sentence. Both are worth having;');
    L.push('  they are not interchangeable, and a buyer comparing vendors knows it.');
  }
  if (r.change) {
    const c = r.change;
    L.push('');
    L.push(`  Movement     ${study.beforeValue} -> ${study.afterValue} ${study.metric || ''}`.trimEnd());
    L.push(`               ${c.relativePct > 0 ? '+' : ''}${c.relativePct}% over ${study.periodMonths || '?'} months`);
  }
  L.push('');
  L.push('WHAT IS THERE');
  r.results.filter((x) => x.pass).forEach((x) => L.push(`  [x] ${x.name}`));
  if (r.gaps.length) {
    L.push('');
    L.push('WHAT IS MISSING');
    r.gaps.forEach((g) => {
      L.push(`  [ ] ${g.name}  (+${g.pts})`);
      L.push(`      ${g.why}`);
    });
  }
  return L.join('\n');
}

function renderPermission(p) {
  const L = [];
  L.push('');
  L.push('PERMISSION');
  L.push('-'.repeat(66));
  L.push(`  ${p.ok ? 'CLEARED' : 'NOT CLEARED'} - may publish: ${p.permitted.length ? p.permitted.join(', ') : 'nothing'}`);
  if (p.blockers.length) {
    L.push('');
    L.push('  BLOCKERS');
    p.blockers.forEach((b) => L.push(`  !  ${b.text}`));
  }
  if (p.warnings.length) {
    L.push('');
    L.push('  WARNINGS');
    p.warnings.forEach((w) => L.push(`  -  ${w}`));
  }
  if (p.fallback) {
    L.push('');
    L.push('  FALLBACK');
    L.push('     ' + p.fallback);
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

const DEMO = {
  study: {
    customer: 'Northwind Logistics',
    descriptor: 'a 40-person freight broker in the Midwest',
    problem: 'quoting took three days, so buyers booked with whoever answered first',
    beforeValue: 72, afterValue: 4, metric: 'hours to quote',
    periodMonths: 6,
    otherChanges: ['hired two ops staff in month two'],
    quote: { text: 'We stopped losing deals to whoever replied first.', name: 'Dana Ruiz', role: 'COO' },
    verifiable: 'reference-call',
  },
  consent: {
    written: true,
    approver: { name: 'Dana Ruiz', role: 'COO' },
    dated: '2026-03-04',
    covers: ['numbers', 'quote'],
    reviewMonths: 12,
    uses: ['name', 'numbers', 'quote'],
  },
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
    catch (e) { die('Invalid JSON. Run --help for the schema.', e.message); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: an anonymised freight broker, permission covering numbers and quote but not the name)');
  }

  if (!cfg.study && !cfg.consent) die('Give "study", "consent", or both.');

  if (cfg.study) {
    const r = scoreProof(cfg.study);
    console.log(renderProof(cfg.study, r));
  }
  if (cfg.consent) {
    const p = checkPermission(cfg.consent);
    console.log(renderPermission(p));
  }

  if (cfg.study && cfg.consent) {
    const r = scoreProof(cfg.study);
    const p = checkPermission(cfg.consent);
    console.log('');
    console.log('VERDICT');
    console.log('-'.repeat(66));
    if (!p.ok && r.total >= 55) {
      console.log('  The proof is good enough to publish and the permission is not.');
      console.log('  Fix the permission - this is the cheaper half, and the only half');
      console.log('  that can force a takedown.');
    } else if (p.ok && r.total < 55) {
      console.log('  You may publish it, but it will not convince anyone yet.');
      console.log('  Close the gaps above before it goes on the site.');
    } else if (p.ok && r.total >= 55) {
      console.log('  Publishable as it stands. Keep the permission record with the asset.');
    } else {
      console.log('  Neither half is ready. Start with the baseline number - without it');
      console.log('  there is no case study to get permission for.');
    }
  }
}

if (require.main === module) main();

module.exports = { scoreProof, checkPermission, FACTORS, SCOPES };
