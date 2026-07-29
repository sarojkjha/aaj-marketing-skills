#!/usr/bin/env node
/*
 * AAJ SEO / GEO / AEO Readiness — scoring engine
 * Part of the "seo-geo-aeo-audit" Agent Skill.
 *
 * Takes pass/partial/fail results for 27 checks across 5 weighted categories
 * (mirrors the AAJ SEO & GEO Readiness Scorer) and returns category scores, a
 * 0–100 total, a letter grade, and the failing checks. The AGENT performs the
 * audit (fetch/read the page, evaluate each check) and feeds the results here.
 *
 * USAGE
 *   node score.js                 # demo (a typical un-prerendered SPA)
 *   node score.js '<results-json>'
 *   node score.js --help
 *
 * RESULTS JSON
 *   { "checks": { "ssr_prerender": "fail", "title_tag": "pass",
 *                 "answer_first_passage": "partial", ... } }
 *   Values: "pass" (1.0) | "partial" (0.5) | "fail" (0). Omitted checks = fail.
 *
 * See resources/scoring-rubric.md for what each check means and how to evaluate it.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------


'use strict';

const RUBRIC = {
  'Technical & Crawlability': { weight: 25, checks: [
    'ssr_prerender', 'ai_crawlers_allowed', 'sitemap_present', 'canonical_correct',
    'https', 'mobile_responsive', 'core_web_vitals', 'structured_data_present' ] },
  'On-Page SEO': { weight: 20, checks: [
    'title_tag', 'meta_description', 'single_h1', 'heading_hierarchy',
    'internal_links', 'image_alt' ] },
  'AEO (Answer Readiness)': { weight: 20, checks: [
    'answer_first_passage', 'question_first_h2s', 'faqpage_schema', 'scannable_lists_tables' ] },
  'GEO (AI Citation Readiness)': { weight: 20, checks: [
    'statistics_present', 'inline_citations', 'quotations', 'precise_terminology',
    'llms_txt', 'freshness' ] },
  'Authority & Trust': { weight: 15, checks: [
    'author_publisher_schema', 'outbound_citations', 'original_data' ] }
};

const VAL = { pass: 1, partial: 0.5, fail: 0 };

function grade(score){
  if (score >= 90) return ['A', 'excellent — built to rank and be cited'];
  if (score >= 75) return ['B', 'strong — a few gaps to close'];
  if (score >= 60) return ['C', 'decent foundation — meaningful gaps'];
  if (score >= 45) return ['D', 'weak — significant work needed'];
  return ['F', 'failing — largely invisible to search and AI'];
}

function score(results){
  const checks = (results && results.checks) || {};
  let total = 0;
  const cats = [];
  const failing = [];
  for (const [name, def] of Object.entries(RUBRIC)){
    let earned = 0;
    for (const ck of def.checks){
      const v = VAL[checks[ck]] != null ? VAL[checks[ck]] : 0;
      earned += v;
      if (v < 1) failing.push({ category: name, check: ck, state: checks[ck] || 'fail' });
    }
    const pct = earned / def.checks.length;          // 0..1
    const catScore = pct * def.weight;               // weighted points
    total += catScore;
    cats.push({ category: name, weight: def.weight, earned, of: def.checks.length, points: Math.round(catScore*10)/10, pct: Math.round(pct*100) });
  }
  total = Math.round(total);
  const [g, label] = grade(total);
  return { total, grade: g, label, categories: cats, failing };
}

function render(results){
  const r = score(results);
  const out = [];
  out.push('');
  out.push(`AAJ SEO / GEO / AEO Readiness — ${r.total}/100   Grade ${r.grade} (${r.label})`);
  out.push('-'.repeat(60));
  r.categories.forEach(c => {
    out.push(`${c.category.padEnd(30)} ${String(c.points).padStart(5)} / ${c.weight}   (${c.earned}/${c.of} checks, ${c.pct}%)`);
  });
  out.push('');
  if (r.failing.length){
    out.push('Top gaps to fix:');
    r.failing.slice(0, 10).forEach(f => out.push(`  • [${f.state}] ${f.check}  (${f.category})`));
    if (r.failing.length > 10) out.push(`  …and ${r.failing.length - 10} more.`);
  } else {
    out.push('No gaps — all checks passing.');
  }
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify(r, null, 2));
  return out.join('\n');
}

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let results;
if (arg){ try { results = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help for the schema.\n'+e.message); process.exit(1);} }
else {
  // Demo: a typical client-side SPA — good on-page basics, fails SSR/GEO/AEO.
  results = { checks: {
    title_tag:'pass', meta_description:'pass', single_h1:'pass', heading_hierarchy:'pass',
    internal_links:'pass', image_alt:'partial', https:'pass', mobile_responsive:'pass',
    structured_data_present:'partial', canonical_correct:'partial', sitemap_present:'pass',
    core_web_vitals:'partial', ssr_prerender:'fail', ai_crawlers_allowed:'fail',
    answer_first_passage:'fail', question_first_h2s:'partial', faqpage_schema:'fail',
    scannable_lists_tables:'partial', statistics_present:'partial', inline_citations:'fail',
    quotations:'fail', precise_terminology:'partial', llms_txt:'fail', freshness:'partial',
    author_publisher_schema:'fail', outbound_citations:'partial', original_data:'fail'
  }};
  console.log('(no results — demo: a typical un-prerendered SPA)');
}
console.log(render(results));
