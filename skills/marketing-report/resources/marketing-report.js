#!/usr/bin/env node
/*
 * AAJ Marketing Report — engine
 * Part of the "marketing-report" Agent Skill.
 *
 * Rolls one period of raw marketing numbers into a board-ready KPI snapshot:
 * stage-by-stage funnel conversion, CAC and cost-per-lead, marketing efficiency
 * (new revenue : spend and pipeline : spend), target attainment, and — when a
 * prior period is supplied — the period-over-period deltas and a few flags.
 *
 * USAGE
 *   node marketing-report.js                  # demo
 *   node marketing-report.js '<json-config>'  # custom
 *   node marketing-report.js --help
 *
 * CONFIG (JSON) — supply what you have; metrics compute only where inputs allow.
 *   { "period":"Q2 2026",
 *     "spend":120000,           // marketing / S&M spend in the period
 *     "sessions":90000,         // funnel volumes (any subset, in this order):
 *     "leads":2600,
 *     "mqls":900,
 *     "sqls":320,
 *     "opps":140,
 *     "wins":34,
 *     "newRevenue":510000,      // new bookings / ARR / revenue won in the period
 *     "pipelineCreated":1300000,// $ pipeline created in the period (optional)
 *     "target":600000,          // revenue target for the period (optional)
 *     "prior": { ...same fields for the previous period... } }  // optional → deltas
 *
 * Note: new-revenue : spend is an efficiency read, not a true ROI — revenue often
 * lags the spend that created it, and attribution is imperfect. Present it as a
 * ratio with that caveat, not as return on investment.
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

var STAGES = [
  ['sessions','Sessions'], ['leads','Leads'], ['mqls','MQLs'],
  ['sqls','SQLs'], ['opps','Opportunities'], ['wins','Wins']
];

function money(n){ return '$' + Math.round(n).toLocaleString(); }
function one(n){ return (Math.round(n*10)/10).toLocaleString(); }
function pct(n){ return (Math.round(n*10)/10).toLocaleString() + '%'; }
function signed(n){ return (n>=0?'+':'') + one(n) + '%'; }
function pctA(n){ return (n<1 ? Math.round(n*100)/100 : Math.round(n*10)/10).toLocaleString() + '%'; }

function funnel(c){
  var stages = [];
  STAGES.forEach(function(s){ if (c[s[0]] != null) stages.push({ key:s[0], label:s[1], value:c[s[0]] }); });
  var rates = [];
  for (var i=1;i<stages.length;i++){
    var a = stages[i-1], b = stages[i];
    rates.push({ from:a.label, to:b.label, pct: a.value>0 ? b.value/a.value*100 : null });
  }
  var overall = null;
  if (stages.length>=2 && stages[0].value>0 && stages[stages.length-1].key==='wins'){
    overall = stages[stages.length-1].value / stages[0].value * 100;
  }
  return { stages:stages, rates:rates, overall:overall, first: stages[0], last: stages[stages.length-1] };
}

function compute(c){
  var f = funnel(c);
  var wins = c.wins != null ? c.wins : null;
  var cac = (c.spend != null && wins) ? c.spend / wins : null;
  var cpl = (c.spend != null && c.leads) ? c.spend / c.leads : null;
  var revToSpend = (c.newRevenue != null && c.spend) ? c.newRevenue / c.spend : null;
  var pipeToSpend = (c.pipelineCreated != null && c.spend) ? c.pipelineCreated / c.spend : null;
  var attainment = (c.newRevenue != null && c.target) ? c.newRevenue / c.target * 100 : null;
  return { period: c.period || null, spend: c.spend, newRevenue: c.newRevenue,
           funnel: f, cac: cac, cpl: cpl, revToSpend: revToSpend,
           pipeToSpend: pipeToSpend, attainment: attainment, wins: wins };
}

function delta(cur, prior){ return (prior != null && prior !== 0) ? (cur - prior) / Math.abs(prior) * 100 : null; }

function deltas(c){
  if (!c.prior) return null;
  var cur = compute(c), pr = compute(c.prior);
  var d = {};
  d.spend = delta(cur.spend, pr.spend);
  d.newRevenue = delta(cur.newRevenue, pr.newRevenue);
  d.wins = delta(cur.wins, pr.wins);
  d.cac = delta(cur.cac, pr.cac);
  d.revToSpend = delta(cur.revToSpend, pr.revToSpend);
  var sameFirst = cur.funnel.first && pr.funnel.first && cur.funnel.first.key === pr.funnel.first.key;
  d.overall = sameFirst ? delta(cur.funnel.overall, pr.funnel.overall) : null;
  return d;
}

function verdict(c){
  var r = compute(c), d = deltas(c), L = [];
  if (r.attainment != null){
    if (r.attainment >= 100) L.push('\u2713 Attainment ' + pct(r.attainment) + ' \u2014 target met.');
    else if (r.attainment >= 80) L.push('\u25bc Attainment ' + pct(r.attainment) + ' \u2014 short of target; close the gap or reset expectations.');
    else L.push('\u2717 Attainment ' + pct(r.attainment) + ' \u2014 well below target.');
  }
  if (r.revToSpend != null){
    if (r.revToSpend >= 1) L.push('\u2022 New revenue : spend ' + one(r.revToSpend) + '\u00d7 this period (efficiency read \u2014 revenue can lag the spend that created it).');
    else L.push('\u25bc New revenue : spend ' + one(r.revToSpend) + '\u00d7 \u2014 below 1\u00d7 in-period; check the sales-cycle lag before judging.');
  }
  if (d && d.cac != null){
    if (d.cac <= 0) L.push('\u2198 CAC ' + signed(d.cac) + ' vs prior \u2014 acquisition got more efficient.');
    else L.push('\u2197 CAC ' + signed(d.cac) + ' vs prior \u2014 acquisition got pricier; find where.');
  }
  if (d && d.overall != null){
    if (d.overall >= 0) L.push('\u2197 Funnel conversion ' + signed(d.overall) + ' vs prior.');
    else L.push('\u2198 Funnel conversion ' + signed(d.overall) + ' vs prior \u2014 a stage is leaking; check the stage rates.');
  }
  if (r.funnel.rates.length){
    L.push('\u2022 Report each stage rate with its own trend \u2014 don\'t compare a Sessions\u2192Leads rate to an MQL\u2192SQL rate; they\'re different orders of magnitude.');
  }
  return L;
}

function render(c){
  var r = compute(c), d = deltas(c);
  var out = [];
  out.push('');
  out.push('AAJ Marketing Report' + (r.period ? ' \u2014 ' + r.period : ''));
  out.push('-'.repeat(56));
  out.push('Spend                   ' + (r.spend!=null?money(r.spend):'\u2014') + (d&&d.spend!=null?'   ('+signed(d.spend)+' vs prior)':''));
  out.push('New revenue             ' + (r.newRevenue!=null?money(r.newRevenue):'\u2014') + (d&&d.newRevenue!=null?'   ('+signed(d.newRevenue)+')':''));
  out.push('Wins                    ' + (r.wins!=null?one(r.wins):'\u2014') + (d&&d.wins!=null?'   ('+signed(d.wins)+')':''));
  out.push('CAC                     ' + (r.cac!=null?money(r.cac):'\u2014') + (d&&d.cac!=null?'   ('+signed(d.cac)+')':''));
  out.push('Cost per lead           ' + (r.cpl!=null?money(r.cpl):'\u2014'));
  out.push('New revenue : spend     ' + (r.revToSpend!=null?one(r.revToSpend)+'\u00d7':'\u2014'));
  out.push('Pipeline : spend        ' + (r.pipeToSpend!=null?one(r.pipeToSpend)+'\u00d7':'\u2014'));
  out.push('Target attainment       ' + (r.attainment!=null?pct(r.attainment):'\u2014'));
  out.push('');
  out.push('Funnel');
  r.funnel.stages.forEach(function(s){ out.push('  ' + (s.label+':').padEnd(16) + one(s.value)); });
  r.funnel.rates.forEach(function(x){ if (x.pct!=null) out.push('  ' + (x.from+'\u2192'+x.to).padEnd(24) + pct(x.pct)); });
  if (r.funnel.overall!=null) out.push('  ' + 'Overall\u2192Win'.padEnd(24) + pctA(r.funnel.overall) + (d&&d.overall!=null?'   ('+signed(d.overall)+')':''));
  out.push('');
  verdict(c).forEach(function(l){ out.push(l); });
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    period: r.period,
    spend: r.spend, newRevenue: r.newRevenue, wins: r.wins,
    cac: r.cac!=null?Math.round(r.cac):null,
    costPerLead: r.cpl!=null?Math.round(r.cpl):null,
    newRevenueToSpend: r.revToSpend!=null?Math.round(r.revToSpend*100)/100:null,
    pipelineToSpend: r.pipeToSpend!=null?Math.round(r.pipeToSpend*100)/100:null,
    targetAttainmentPct: r.attainment!=null?Math.round(r.attainment*10)/10:null,
    funnelRates: r.funnel.rates.map(function(x){ return { step:x.from+'->'+x.to, pct:x.pct!=null?Math.round(x.pct*10)/10:null }; }),
    overallConversionPct: r.funnel.overall!=null?Math.round(r.funnel.overall*100)/100:null,
    deltasVsPrior: d
  }, null, 2));
  return out.join('\n');
}

var arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
var cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help for the schema.\n'+e.message); process.exit(1); } }
else {
  cfg = { period:'Q2 2026', spend:120000, sessions:90000, leads:2600, mqls:900, sqls:320, opps:140, wins:34,
          newRevenue:510000, pipelineCreated:1300000, target:600000,
          prior:{ spend:110000, sessions:85000, leads:2400, mqls:820, sqls:300, opps:120, wins:28, newRevenue:420000 } };
  console.log('(no config \u2014 demo: Q2 2026 with a prior-period comparison)');
}
console.log(render(cfg));

module.exports = { compute, deltas, verdict };
