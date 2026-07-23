#!/usr/bin/env node
/**
 * AAJ — pattern-check
 * Flags manipulative persuasion patterns in marketing copy, separating
 * dark patterns (no honest version exists) from claims whose ethics depend
 * on a fact only you can verify.
 * No dependencies. Node 14+.
 *
 *   node resources/pattern-check.js                    # demo
 *   node resources/pattern-check.js "your copy here"
 *   node resources/pattern-check.js --file pricing.md
 *   node resources/pattern-check.js --help
 */

// Tiers:
//   dark    — no legitimate version exists. Remove.
//   verify  — legitimate ONLY if the underlying fact is literally true.
//   pressure— not inherently dishonest, but worth a second look.
const PATTERNS = [
  // ── DARK ──────────────────────────────────────────────────────────────
  {
    id: "confirmshaming",
    tier: "dark",
    label: "Confirmshaming",
    why: "Shaming the decline option is manipulation with no honest version.",
    fix: "Make the decline neutral: \"No thanks\" or \"Not now\".",
    rx: [
      /\bno,?\s+(?:thanks,?\s+)?i(?:'m| am)?\s+(?:don'?t|do not|prefer|hate|like)\b[^.!?]{0,60}/gi,
      /\bi\s+don'?t\s+(?:want|care|need)\s+(?:to\s+)?(?:save|grow|succeed|make money|improve)\b[^.!?]{0,40}/gi,
      /\bno\s+thanks,?\s+i(?:'d| would)?\s+(?:rather|prefer)\b[^.!?]{0,50}/gi,
      /\bi\s+like\s+(?:losing|wasting|paying)\b[^.!?]{0,40}/gi
    ]
  },
  {
    id: "live-viewers",
    tier: "dark",
    label: "Live viewer / activity counter",
    why: "Almost always fabricated, and treated as deceptive when it is.",
    fix: "Remove it, or show a real, verifiable figure with its source.",
    rx: [
      /\b\d+\s+(?:people|users|others|customers|visitors)\s+(?:are\s+)?(?:currently\s+)?(?:viewing|looking at|watching|browsing)\b/gi,
      /\b\d+\s+(?:people|others)\s+(?:just|recently)\s+(?:bought|signed up|purchased|joined)\b/gi,
      /\bsomeone\s+(?:in|from)\s+[A-Z][a-z]+\s+just\s+(?:bought|purchased|signed up)\b/gi
    ]
  },
  {
    id: "resetting-timer",
    tier: "dark",
    label: "Perpetual / resetting countdown",
    why: "A timer that restarts is a fabricated deadline.",
    fix: "Use a real, fixed date — or remove the timer.",
    rx: [
      /\boffer\s+(?:ends|expires)\s+(?:in\s+)?\d+\s*(?::\d+)+/gi,
      /\b(?:timer|countdown)\s+(?:resets?|restarts?)\b/gi,
      /\bends\s+in\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)\s*(?::\s*\d+)/gi
    ]
  },
  {
    id: "hidden-cost",
    tier: "dark",
    label: "Hidden or deferred cost",
    why: "Costs revealed late are an enforcement target, not a tactic.",
    fix: "State the full price where the buyer first sees a price.",
    rx: [
      /\b(?:additional|extra|other)\s+fees\s+(?:may\s+)?apply\b/gi,
      /\bplus\s+(?:applicable\s+)?(?:fees|charges)\b/gi,
      /\bprice\s+(?:shown\s+)?(?:excludes|does not include)\b[^.!?]{0,50}/gi
    ]
  },
  {
    id: "forced-continuity",
    tier: "dark",
    label: "Forced continuity",
    why: "Auto-charging after a trial without prominent notice is regulated.",
    fix: "State the charge date and amount at signup, and make cancelling one click.",
    rx: [
      /\bautomatically\s+(?:be\s+)?(?:billed|charged|renewed?)\b/gi,
      /\bunless\s+(?:you\s+)?cancel\b/gi,
      /\bcancel\s+anytime\*/gi
    ]
  },

  // ── VERIFY ────────────────────────────────────────────────────────────
  {
    id: "scarcity-count",
    tier: "verify",
    label: "Scarcity claim",
    why: "Persuasive and legal when true; deceptive when invented.",
    fix: "Confirm the number is real and enforced. Digital goods are rarely scarce.",
    rx: [
      /\bonly\s+\d+\s+(?:left|remaining|spots?|seats?|slots?|places?|units?|licen[cs]es?)\b/gi,
      /\b\d+\s+(?:spots?|seats?|slots?|places?)\s+(?:left|remaining|available)\b/gi,
      /\b(?:almost|nearly)\s+(?:sold\s+out|gone|full)\b/gi,
      /\bselling\s+(?:out\s+)?fast\b/gi,
      /\blimited\s+(?:spots?|seats?|availability|quantity|stock)\b/gi,
      /\bwhile\s+(?:supplies|stocks?)\s+last\b/gi
    ]
  },
  {
    id: "urgency-deadline",
    tier: "verify",
    label: "Urgency / deadline",
    why: "A real deadline is fine. A recurring 'final chance' is not.",
    fix: "Name the actual date and honour it. If it slips, the claim was false.",
    rx: [
      /\b(?:ends|expires|closes)\s+(?:today|tonight|tomorrow|soon|at midnight)\b/gi,
      /\blast\s+chance\b/gi,
      /\bfinal\s+(?:hours?|days?|call|chance)\b/gi,
      /\bdon'?t\s+miss\s+(?:out|this)\b/gi,
      /\b(?:hurry|act\s+(?:now|fast)|don'?t\s+wait)\b/gi,
      /\blimited[- ]time\s+(?:offer|only|deal)\b/gi,
      /\bexpires\s+in\s+\d+/gi
    ]
  },
  {
    id: "vague-social-proof",
    tier: "verify",
    label: "Unquantified social proof",
    why: "Vague volume claims are unverifiable, and read that way.",
    fix: "Use the real number and the relevant segment: '40 Series-A B2B SaaS teams'.",
    rx: [
      /\b(?:thousands|millions|hundreds)\s+of\s+(?:companies|businesses|teams|customers|users|marketers|founders)\b/gi,
      /\bjoin\s+(?:thousands|millions|hundreds|\d[\d,]*\+?)\s+of\b/gi,
      /\beveryone\s+is\s+(?:using|switching|talking)\b/gi,
      /\bmost\s+(?:popular|loved|trusted)\b/gi,
      /\btrusted\s+by\s+(?:thousands|millions|hundreds|companies|teams)\b/gi
    ]
  },
  {
    id: "anchor-was-price",
    tier: "verify",
    label: "Reference / 'was' price",
    why: "Anchoring against a price never actually charged is deceptive pricing.",
    fix: "Confirm the reference price was genuinely charged for a meaningful period.",
    rx: [
      /\bwas\s+\$\d[\d,.]*/gi,
      /\bnormally\s+\$\d[\d,.]*/gi,
      /\bregular(?:ly)?\s+(?:price\s+)?\$\d[\d,.]*/gi,
      /\bvalued?\s+at\s+\$\d[\d,.]*/gi,
      /\b\$\d[\d,.]*\s+value\b/gi
    ]
  },
  {
    id: "guarantee",
    tier: "verify",
    label: "Guarantee / risk reversal",
    why: "Strong when honoured; a liability when the terms quietly contradict it.",
    fix: "Confirm the refund process matches the promise, with no undisclosed conditions.",
    rx: [
      /\b(?:money[- ]back|satisfaction)\s+guarantee(?:d)?\b/gi,
      /\b\d+[- ]day\s+guarantee\b/gi,
      /\bno[- ]questions[- ]asked\b/gi,
      /\brisk[- ]free\b/gi
    ]
  },

  // ── PRESSURE ──────────────────────────────────────────────────────────
  {
    id: "regret-fear",
    tier: "pressure",
    label: "Regret / fear appeal",
    why: "Fear framing converts short-term and raises refunds and churn.",
    fix: "Replace with the quantified real cost of inaction.",
    rx: [
      /\byou'?ll\s+regret\b/gi,
      /\bdon'?t\s+be\s+(?:the\s+one|left\s+behind)\b/gi,
      /\bfalling\s+behind\b/gi,
      /\bbefore\s+it'?s\s+too\s+late\b/gi,
      /\bcan'?t\s+afford\s+(?:to\s+)?(?:wait|miss)\b/gi
    ]
  },
  {
    id: "exaggerated-outcome",
    tier: "pressure",
    label: "Unbacked outcome promise",
    why: "Outcome guarantees get ads rejected and rarely survive scrutiny.",
    fix: "State the mechanism and a real, sourced result instead.",
    rx: [
      /\b(?:10x|100x|double|triple)\s+your\b/gi,
      /\bskyrocket\b/gi,
      /\bguaranteed\s+(?:results?|growth|revenue|roi)\b/gi,
      /\bovernight\s+(?:success|results?)\b/gi,
      /\beffortless(?:ly)?\b/gi
    ]
  },
  {
    id: "pre-ticked",
    tier: "pressure",
    label: "Opt-out default",
    why: "Defaults are the most abusable principle — fine for the user's benefit, not yours.",
    fix: "Confirm the default serves the buyer, and that opting out is one click.",
    rx: [
      /\b(?:pre[- ]?(?:selected|checked|ticked))\b/gi,
      /\buncheck\s+(?:this|the box)\b/gi,
      /\bopt\s+out\s+(?:below|here)\b/gi
    ]
  }
];

const TIER_META = {
  dark:     { rank: 0, title: "DARK PATTERN", note: "No honest version exists — remove." },
  verify:   { rank: 1, title: "VERIFY", note: "Legitimate only if the underlying fact is literally true." },
  pressure: { rank: 2, title: "REVIEW", note: "Not inherently dishonest — check it's earning its place." }
};

function snippet(text, index, len) {
  const pad = 32;
  const s = Math.max(0, index - pad);
  const e = Math.min(text.length, index + len + pad);
  let out = text.slice(s, e).replace(/\s+/g, " ").trim();
  if (s > 0) out = "…" + out;
  if (e < text.length) out += "…";
  return out;
}

function scan(text) {
  const found = [];
  for (const p of PATTERNS) {
    const ranges = []; // [start,end) already claimed by this pattern
    for (const rx of p.rx) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(text)) !== null) {
        const start = m.index, end = m.index + m[0].length;
        // Skip if this overlaps a match the same pattern already recorded —
        // several regexes intentionally catch variants of the same phrase.
        const overlaps = ranges.some(r => start < r[1] && end > r[0]);
        if (!overlaps) {
          ranges.push([start, end]);
          found.push({
            id: p.id, tier: p.tier, label: p.label, why: p.why, fix: p.fix,
            matched: m[0].trim(),
            context: snippet(text, m.index, m[0].length)
          });
        }
        if (m.index === rx.lastIndex) rx.lastIndex++; // guard zero-width
      }
    }
  }
  return found.sort((a, b) => TIER_META[a.tier].rank - TIER_META[b.tier].rank);
}

function verdict(counts) {
  if (counts.dark > 0) {
    return `FAIL — ${counts.dark} dark pattern${counts.dark > 1 ? "s" : ""} found. Remove before shipping.`;
  }
  if (counts.verify > 0) {
    return `CONDITIONAL — ${counts.verify} claim${counts.verify > 1 ? "s" : ""} that must be factually true. Verify each.`;
  }
  if (counts.pressure > 0) {
    return `PASS with notes — ${counts.pressure} item${counts.pressure > 1 ? "s" : ""} worth a second look.`;
  }
  return "PASS — no manipulative patterns detected.";
}

function report(flags) {
  const counts = { dark: 0, verify: 0, pressure: 0 };
  flags.forEach(f => counts[f.tier]++);

  const L = [];
  L.push("");
  L.push("AAJ · MANIPULATION CHECK");
  L.push("─".repeat(60));
  L.push(`  ${verdict(counts)}`);
  L.push("");
  L.push(`  Dark patterns   ${counts.dark}`);
  L.push(`  Verify required ${counts.verify}`);
  L.push(`  Review          ${counts.pressure}`);
  L.push("");

  for (const tier of ["dark", "verify", "pressure"]) {
    const group = flags.filter(f => f.tier === tier);
    if (!group.length) continue;
    L.push("─".repeat(60));
    L.push(`${TIER_META[tier].title} — ${TIER_META[tier].note}`);
    L.push("");
    const byId = {};
    group.forEach(f => { (byId[f.id] = byId[f.id] || []).push(f); });
    for (const id of Object.keys(byId)) {
      const g = byId[id];
      L.push(`  ${g[0].label}`);
      L.push(`    Why:  ${g[0].why}`);
      L.push(`    Fix:  ${g[0].fix}`);
      g.slice(0, 3).forEach(f => L.push(`    →     "${f.matched}"`));
      if (g.length > 3) L.push(`    →     …and ${g.length - 3} more`);
      L.push("");
    }
  }

  if (counts.verify > 0) {
    L.push("─".repeat(60));
    L.push("BEFORE SHIPPING, CONFIRM EACH IS TRUE");
    const uniq = [...new Set(flags.filter(f => f.tier === "verify").map(f => f.matched))];
    uniq.forEach(m => L.push(`  [ ] "${m}"`));
    L.push("");
    L.push("  If any is not literally true, it is a dark pattern regardless of intent.");
    L.push("");
  }

  L.push("─".repeat(60));
  L.push("JSON");
  L.push(JSON.stringify({
    verdict: verdict(counts),
    counts,
    flags: flags.map(f => ({ tier: f.tier, pattern: f.id, label: f.label, matched: f.matched, fix: f.fix }))
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ pattern-check — flag manipulative persuasion patterns in marketing copy.

Usage
  node resources/pattern-check.js                    Run the built-in demo
  node resources/pattern-check.js "your copy here"   Check a string
  node resources/pattern-check.js --file page.md     Check a file
  node resources/pattern-check.js --json "copy"      JSON only
  node resources/pattern-check.js --help             This message

Tiers
  DARK PATTERN   No honest version exists. Remove.
  VERIFY         Legitimate only if the underlying fact is literally true.
  REVIEW         Not inherently dishonest; check it earns its place.

This tool cannot know whether "only 3 seats left" is true — that is exactly
why it flags it. It surfaces every claim whose ethics depend on a fact you
must confirm. A true scarcity claim is persuasion; the same words when
false are deception.
`;

const DEMO = `Only 3 spots left — and 47 people are viewing this page right now!
Limited-time offer, ends tonight. Join thousands of companies who trust us.
Was $999, now $299 — don't miss out or you'll regret it. Trial converts to a
paid plan automatically unless you cancel. Guaranteed results, effortlessly.
[ No thanks, I don't want to grow my business ]`;

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const jsonOnly = argv.includes("--json");
  let text = null;
  const fi = argv.indexOf("--file");
  if (fi !== -1 && argv[fi + 1]) {
    try { text = require("fs").readFileSync(argv[fi + 1], "utf8"); }
    catch { console.error(`Could not read file: ${argv[fi + 1]}`); process.exit(1); }
  } else {
    text = argv.filter(a => !a.startsWith("--"))[0] || null;
  }

  let demo = false;
  if (!text) { text = DEMO; demo = true; }

  const flags = scan(text);

  if (jsonOnly) {
    const counts = { dark: 0, verify: 0, pressure: 0 };
    flags.forEach(f => counts[f.tier]++);
    console.log(JSON.stringify({
      verdict: verdict(counts), counts,
      flags: flags.map(f => ({ tier: f.tier, pattern: f.id, label: f.label, matched: f.matched, fix: f.fix }))
    }, null, 2));
    return;
  }
  if (demo) console.log("\n(demo copy — pass a string or --file to check your own)");
  console.log(report(flags));
}

if (require.main === module) main();
module.exports = { scan, verdict, PATTERNS };
