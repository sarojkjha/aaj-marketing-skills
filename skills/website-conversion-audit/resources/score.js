#!/usr/bin/env node
/*
 * AAJ Website Conversion Audit — scoring engine
 * Part of the "website-conversion-audit" Agent Skill.
 *
 * Takes pass/partial/fail results for conversion checks across 6 weighted
 * categories (mirrors the AAJ Website Grader) and returns category scores, a
 * 0–100 total, a grade, and the failing items. The AGENT performs the audit
 * (read the page, evaluate each check) and feeds results here.
 *
 * USAGE
 *   node score.js                 # demo
 *   node score.js '<results-json>'
 *   node score.js --help
 *
 * RESULTS JSON
 *   { "checks": { "clear_value_prop":"pass", "primary_cta_visible":"partial", ... } }
 *   Values: "pass" (1.0) | "partial" (0.5) | "fail" (0). Omitted = fail.
 *   See resources/conversion-rubric.md for what each check means.
 */

'use strict';

const RUBRIC = {
  'Message & Clarity': { weight: 22, checks: [
    'clear_value_prop', 'headline_outcome_focused', 'audience_obvious', 'jargon_free', 'above_fold_clarity' ] },
  'Call to Action': { weight: 20, checks: [
    'primary_cta_visible', 'single_primary_action', 'cta_copy_specific', 'cta_repeated_on_long_pages' ] },
  'Trust & Proof': { weight: 18, checks: [
    'social_proof', 'specific_results_or_data', 'security_trust_signals', 'real_testimonials' ] },
  'Friction & Forms': { weight: 16, checks: [
    'short_forms', 'no_unnecessary_fields', 'clear_next_step', 'no_dead_ends' ] },
  'Speed & Mobile': { weight: 14, checks: [
    'fast_load', 'mobile_usable', 'no_layout_shift' ] },
  'Conversion Tracking': { weight: 10, checks: [
    'analytics_installed', 'conversion_events_defined', 'optimizes_to_customers' ] }
};
const VAL = { pass: 1, partial: 0.5, fail: 0 };

function grade(s){
  if (s>=90) return ['A','excellent — built to convert'];
  if (s>=75) return ['B','strong — a few leaks to plug'];
  if (s>=60) return ['C','average — clear opportunities'];
  if (s>=45) return ['D','leaky — significant friction'];
  return ['F','converting in spite of itself'];
}

function score(results){
  const checks = (results && results.checks) || {};
  let total = 0; const cats = []; const failing = [];
  for (const [name, def] of Object.entries(RUBRIC)){
    let earned = 0;
    for (const ck of def.checks){
      const v = VAL[checks[ck]] != null ? VAL[checks[ck]] : 0;
      earned += v; if (v < 1) failing.push({ category:name, check:ck, state: checks[ck] || 'fail' });
    }
    const pct = earned / def.checks.length, pts = pct * def.weight; total += pts;
    cats.push({ category:name, weight:def.weight, points:Math.round(pts*10)/10, earned, of:def.checks.length, pct:Math.round(pct*100) });
  }
  total = Math.round(total); const [g,label] = grade(total);
  return { total, grade:g, label, categories:cats, failing };
}

function render(results){
  const r = score(results); const out = [];
  out.push(`\nAAJ Website Conversion Audit — ${r.total}/100   Grade ${r.grade} (${r.label})`);
  out.push('-'.repeat(58));
  r.categories.forEach(c => out.push(`${c.category.padEnd(24)} ${String(c.points).padStart(5)} / ${c.weight}   (${c.earned}/${c.of}, ${c.pct}%)`));
  out.push('');
  if (r.failing.length){ out.push('Top fixes:'); r.failing.slice(0,10).forEach(f => out.push(`  • [${f.state}] ${f.check}  (${f.category})`)); if(r.failing.length>10) out.push(`  …and ${r.failing.length-10} more.`); }
  else out.push('No gaps — all checks passing.');
  out.push('\n--- JSON ---'); out.push(JSON.stringify(r, null, 2));
  return out.join('\n');
}

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let results;
if (arg){ try { results = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help.\n'+e.message); process.exit(1);} }
else {
  results = { checks: {
    clear_value_prop:'partial', headline_outcome_focused:'fail', audience_obvious:'partial', jargon_free:'partial', above_fold_clarity:'partial',
    primary_cta_visible:'pass', single_primary_action:'fail', cta_copy_specific:'fail', cta_repeated_on_long_pages:'partial',
    social_proof:'partial', specific_results_or_data:'fail', security_trust_signals:'pass', real_testimonials:'partial',
    short_forms:'pass', no_unnecessary_fields:'partial', clear_next_step:'pass', no_dead_ends:'pass',
    fast_load:'partial', mobile_usable:'pass', no_layout_shift:'partial',
    analytics_installed:'pass', conversion_events_defined:'partial', optimizes_to_customers:'fail'
  }};
  console.log('(no results — demo: a typical leaky landing page)');
}
console.log(render(results));
