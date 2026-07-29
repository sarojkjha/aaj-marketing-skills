#!/usr/bin/env node
/**
 * AAJ — agent-readiness
 * Scores how well a site and product can be discovered, evaluated and acted on
 * by AI agents buying on a customer's behalf. Distinct from GEO: this is about
 * being *transactable* by a machine, not just cited by one.
 * No dependencies. Node 14+.
 *
 *   node resources/agent-readiness.js                        # demo
 *   node resources/agent-readiness.js --ssr --schema --pricing-public
 *   node resources/agent-readiness.js --help
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


// Five dimensions. Weights reflect what actually stops an agent: it can work
// around weak trust signals, but it cannot read a page that never renders.
const DIMENSIONS = [
  { id: "readable",  name: "Machine-readable content", weight: 30 },
  { id: "evaluable", name: "Evaluable facts",          weight: 25 },
  { id: "actionable",name: "Action surface",           weight: 20 },
  { id: "trust",     name: "Identity & trust",         weight: 15 },
  { id: "access",    name: "Agent access policy",      weight: 10 }
];

// Each check: dimension, flag name, points, and what it means when missing.
const CHECKS = [
  // ── Machine-readable content (30) ──────────────────────────────────────
  { dim: "readable", id: "ssr", pts: 14, label: "Content renders without JavaScript",
    gap: "Agents that don't execute JS see an empty shell. This is the single hardest blocker — nothing else matters if the content isn't there.",
    fix: "Server-render or prerender every page an agent might read. Verify with view-source, not DevTools." },
  { dim: "readable", id: "schema", pts: 8, label: "Structured data on key pages",
    gap: "Without schema, an agent has to infer what your page is from prose.",
    fix: "Add Product, Service, Offer, Organization and FAQPage schema where each applies." },
  { dim: "readable", id: "llmsTxt", pts: 5, label: "llms.txt published",
    gap: "No curated entry point, so agents crawl blind.",
    fix: "Publish llms.txt listing your key pages, what each covers, and the canonical facts." },
  { dim: "readable", id: "cleanHeadings", pts: 3, label: "Clean heading hierarchy",
    gap: "Passage extraction degrades when structure is implied by styling rather than markup.",
    fix: "One H1, meaningful H2s, no heading levels skipped for visual effect." },

  // ── Evaluable facts (25) ───────────────────────────────────────────────
  { dim: "evaluable", id: "pricingPublic", pts: 12, label: "Pricing published and parseable",
    gap: "An agent comparing options cannot include you. 'Contact us' is a non-answer to a machine — it will return your competitor's number instead.",
    fix: "Publish prices as text, not images, with the unit and currency explicit." },
  { dim: "evaluable", id: "specsStructured", pts: 7, label: "Specs / features in structured form",
    gap: "Capabilities buried in marketing prose can't be matched against requirements.",
    fix: "Tables or lists with consistent labels. Say what it does, not how transformative it is." },
  { dim: "evaluable", id: "comparisonData", pts: 6, label: "Comparison facts available",
    gap: "Agents build comparisons whether or not you supply the facts. Absent yours, they use a competitor's framing.",
    fix: "Publish honest comparison pages, integration lists, and limits — including what you don't do." },

  // ── Action surface (20) ────────────────────────────────────────────────
  { dim: "actionable", id: "selfServe", pts: 8, label: "Self-serve path exists",
    gap: "If every path requires a human conversation, an agent can't progress the purchase at all.",
    fix: "Offer at least one route — trial, purchase, or booking — that completes without a sales call." },
  { dim: "actionable", id: "api", pts: 6, label: "Public API or documented integration",
    gap: "No programmatic surface means no agent-initiated action.",
    fix: "Document a public API, or at minimum a stable booking or enquiry endpoint." },
  { dim: "actionable", id: "noCaptcha", pts: 6, label: "Key actions aren't CAPTCHA-walled",
    gap: "CAPTCHA on enquiry or signup blocks legitimate agents alongside bots.",
    fix: "Use invisible or risk-based challenges; keep at least one unblocked path." },

  // ── Identity & trust (15) ──────────────────────────────────────────────
  { dim: "trust", id: "orgSchema", pts: 6, label: "Organization schema with consistent identity",
    gap: "Agents resolve entities. Inconsistent naming splits your identity across sources.",
    fix: "Organization schema with the same legal name, URL and contact everywhere." },
  { dim: "trust", id: "claimsSourced", pts: 5, label: "Claims are sourced and verifiable",
    gap: "Unverifiable claims get discounted or contradicted by a source the agent trusts more.",
    fix: "Attribute every statistic. Prefer specific, checkable facts over superlatives." },
  { dim: "trust", id: "consistentFacts", pts: 4, label: "Facts consistent across surfaces",
    gap: "Contradictions between pages make an agent choose one — often not the one you'd pick.",
    fix: "One number for one fact, everywhere. Audit for drift periodically." },

  // ── Agent access policy (10) ───────────────────────────────────────────
  { dim: "access", id: "allowsAiCrawlers", pts: 6, label: "AI crawlers permitted in robots.txt",
    gap: "Blocking the crawlers your buyers' agents use removes you from consideration entirely.",
    fix: "Decide deliberately per crawler. Blocking training crawlers is defensible; blocking retrieval crawlers costs you visibility." },
  { dim: "access", id: "noAgentBlocking", pts: 4, label: "No blanket bot-blocking at the edge",
    gap: "Aggressive WAF or rate-limit rules often catch legitimate agents.",
    fix: "Allowlist known retrieval agents; rate-limit rather than block outright." }
];

const num = v => (typeof v === "number" ? v : parseFloat(v));

function score(flags) {
  const results = CHECKS.map(c => ({ ...c, pass: !!flags[c.id] }));

  const dims = DIMENSIONS.map(d => {
    const own = results.filter(r => r.dim === d.id);
    const earned = own.filter(r => r.pass).reduce((s, r) => s + r.pts, 0);
    const possible = own.reduce((s, r) => s + r.pts, 0);
    return { ...d, earned, possible, pct: possible ? (earned / possible) * 100 : 0 };
  });

  const total = dims.reduce((s, d) => s + d.earned, 0);
  const gaps = results.filter(r => !r.pass).sort((a, b) => b.pts - a.pts);

  // A hard blocker: if content doesn't render, nothing downstream can help.
  const blocked = !flags.ssr;

  return { total, dims, results, gaps, blocked };
}

function verdict(total, blocked) {
  if (blocked) return ["BLOCKED", "Content doesn't render without JavaScript. Fix that before anything else — the rest of the score is theoretical until an agent can read the page."];
  if (total >= 85) return ["READY", "An agent can find you, evaluate you against alternatives, and act."];
  if (total >= 65) return ["PARTIAL", "Discoverable and readable, but gaps will cost you in agent-mediated comparisons."];
  if (total >= 40) return ["WEAK", "An agent can read the site but can't reliably evaluate or transact."];
  return ["INVISIBLE", "Effectively absent from agent-mediated buying."];
}

const bar = pct => "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));

function report(flags, r) {
  const [v, note] = verdict(r.total, r.blocked);
  const L = [];
  L.push("");
  L.push("AAJ · AGENT READINESS");
  L.push("─".repeat(66));
  L.push(`  Score  ${bar(r.total)}  ${r.total}/100`);
  L.push(`  ${v} — ${note}`);
  L.push("");
  L.push("BY DIMENSION");
  r.dims.forEach(d => {
    L.push(`  ${d.name.padEnd(28)} ${String(d.earned).padStart(2)}/${String(d.possible).padEnd(3)} ${bar(d.pct)}`);
  });
  L.push("");

  if (r.gaps.length) {
    L.push("─".repeat(66));
    L.push("GAPS — highest cost first");
    L.push("");
    r.gaps.slice(0, 8).forEach((g, i) => {
      L.push(`  ${i + 1}. ${g.label}  (−${g.pts})`);
      L.push(`     Why it matters: ${g.gap}`);
      L.push(`     Fix: ${g.fix}`);
      L.push("");
    });
    if (r.gaps.length > 8) L.push(`  …and ${r.gaps.length - 8} smaller gaps.`);
    L.push("");
  } else {
    L.push("  No gaps. Re-audit when the site changes — this degrades quietly.");
    L.push("");
  }

  L.push("─".repeat(66));
  L.push("WHAT AN AGENT CAN DO TODAY");
  L.push(`  Read your content      ${flags.ssr ? "yes" : "NO — this is the blocker"}`);
  L.push(`  Compare you on price   ${flags.pricingPublic ? "yes" : "no — you're excluded from price comparisons"}`);
  L.push(`  Take an action         ${flags.selfServe ? "yes" : "no — every path needs a human"}`);
  L.push(`  Reach you at all       ${flags.allowsAiCrawlers ? "yes" : "no — crawlers are blocked"}`);
  L.push("");
  L.push("  This is a self-assessment. Verify each answer against the live site —");
  L.push("  view-source for rendering, robots.txt for access, and an actual agent");
  L.push("  attempt for the action surface.");
  L.push("");
  L.push("─".repeat(66));
  L.push("JSON");
  L.push(JSON.stringify({
    score: r.total,
    verdict: v,
    blocked: r.blocked,
    dimensions: r.dims.map(d => ({ id: d.id, name: d.name, earned: d.earned, possible: d.possible })),
    gaps: r.gaps.map(g => ({ id: g.id, label: g.label, points: g.pts, fix: g.fix }))
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ agent-readiness — can an AI agent find, evaluate and buy from you?

Usage
  node resources/agent-readiness.js                  Demo (nothing passing)
  node resources/agent-readiness.js [flags]
  node resources/agent-readiness.js --all            Everything passing
  node resources/agent-readiness.js --json [flags]

Flags — add one for each check you pass
  Machine-readable content
    --ssr                 Content renders without JavaScript          (14)
    --schema              Structured data on key pages                 (8)
    --llms-txt            llms.txt published                           (5)
    --clean-headings      Clean heading hierarchy                      (3)
  Evaluable facts
    --pricing-public      Pricing published and parseable             (12)
    --specs-structured    Specs/features in structured form            (7)
    --comparison-data     Comparison facts available                   (6)
  Action surface
    --self-serve          A path completes without a sales call        (8)
    --api                 Public API or documented integration         (6)
    --no-captcha          Key actions aren't CAPTCHA-walled            (6)
  Identity & trust
    --org-schema          Organization schema, consistent identity     (6)
    --claims-sourced      Claims sourced and verifiable                (5)
    --consistent-facts    Facts consistent across surfaces             (4)
  Agent access
    --allows-ai-crawlers  AI crawlers permitted in robots.txt          (6)
    --no-agent-blocking   No blanket bot-blocking at the edge          (4)

Why this is not GEO
  GEO asks whether an AI engine will cite you in an answer. This asks
  whether an agent acting for a buyer can evaluate you against alternatives
  and then do something. A site can be well cited and still be impossible
  to transact with — which is the gap this measures.
`;

const FLAGMAP = {
  "--ssr": "ssr", "--schema": "schema", "--llms-txt": "llmsTxt", "--clean-headings": "cleanHeadings",
  "--pricing-public": "pricingPublic", "--specs-structured": "specsStructured", "--comparison-data": "comparisonData",
  "--self-serve": "selfServe", "--api": "api", "--no-captcha": "noCaptcha",
  "--org-schema": "orgSchema", "--claims-sourced": "claimsSourced", "--consistent-facts": "consistentFacts",
  "--allows-ai-crawlers": "allowsAiCrawlers", "--no-agent-blocking": "noAgentBlocking"
};

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const flags = {};
  if (argv.includes("--all")) CHECKS.forEach(c => { flags[c.id] = true; });

  const unknown = argv.filter(a => a.startsWith("--") && !FLAGMAP[a] && !["--help","-h","--json","--all","--demo"].includes(a));
  if (unknown.length) {
    console.error(`Unknown flag(s): ${unknown.join(", ")}\nRun --help for the list.`);
    process.exit(1);
  }
  argv.forEach(a => { if (FLAGMAP[a]) flags[FLAGMAP[a]] = true; });

  const r = score(flags);

  if (argv.includes("--json")) {
    const [v] = verdict(r.total, r.blocked);
    console.log(JSON.stringify({
      score: r.total, verdict: v, blocked: r.blocked,
      dimensions: r.dims.map(d => ({ id: d.id, name: d.name, earned: d.earned, possible: d.possible })),
      gaps: r.gaps.map(g => ({ id: g.id, label: g.label, points: g.pts, fix: g.fix }))
    }, null, 2));
    return;
  }

  if (!argv.filter(a => FLAGMAP[a] || a === "--all").length) {
    console.log("\n(demo: nothing passing — add flags for what you do have, or --all)");
  }
  console.log(report(flags, r));
}

if (require.main === module) main();
module.exports = { score, verdict, CHECKS, DIMENSIONS };
