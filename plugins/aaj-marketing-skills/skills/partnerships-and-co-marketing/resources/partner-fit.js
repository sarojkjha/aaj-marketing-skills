/**
 * partner-fit.js — AAJ partner co-marketing engine
 *
 * Three checks, one per decision the AAJ Partner Co-Marketing Playbook says
 * actually matters:
 *   scorePartner(partner)        — should we work with them at all? (Step 2)
 *   checkTerms(terms)            — is the agreement written before work starts? (Step 4)
 *   reviewPartnership(result)    — do it again, change the format, or stop? (Step 8)
 *
 * Scope note: this is a RUBRIC, not a prediction. It cannot know whether a
 * partner will promote as promised. What it does is weight overlap above size,
 * so a famous logo cannot score on fame, and refuse to pass an agreement whose
 * lead-sharing line is missing.
 *
 * Partner shape:
 *   {
 *     name:        String,
 *     goal:        String,   // "We want [outcome] from [partner] within [period]"
 *     overlap:     0-3,      // their customers match your ICP
 *     complementary: 0-3,    // you make each other more useful (3) ... compete (0)
 *     reach:       0-3,      // a list, community or sales team that will promote
 *     ease:        0-3,      // a named person who can say yes AND do the work
 *     namedContact: String,  // who that person is
 *     wellKnown:   Boolean,  // only used to catch scoring on fame
 *     unknowns:    [String]  // anything you are guessing rather than know
 *   }
 *
 * Command line:
 *   node partner-fit.js                 # demo, labelled as a demo
 *   node partner-fit.js --help
 *   node partner-fit.js '{"check":"scorePartner","input":{ ... }}'
 *     check is one of: scorePartner, checkTerms, reviewPartnership.
 *     input is the object that function takes, as described above.
 *     Prints the result as JSON. An unknown check, an unknown top-level
 *     field or a missing input stops the run with an error that says why.
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

// Overlap carries the most weight because the playbook's whole selection rule is
// that a small partner with a perfect overlap beats a famous one with a loose one.
const FACTORS = [
  { key: "overlap", label: "Audience overlap", weight: 40,
    q: "Do their customers match your ideal customer?",
    low: "A famous logo with no audience overlap brings attention, not buyers." },
  { key: "complementary", label: "Complementary product", weight: 25,
    q: "Do you each make the other more useful, rather than compete?",
    low: "If you compete, neither side can promote the other honestly." },
  { key: "reach", label: "Reach you can use", weight: 25,
    q: "Is there a list, community or sales team that will actually promote?",
    low: "An audience nobody activates is not reach." },
  { key: "ease", label: "Ease of working together", weight: 10,
    q: "Is there a named person who can say yes and do the work?",
    low: "Partnerships die in the gap between agreeing and executing." },
];

const BAND = ["none", "weak", "partial", "strong"];

function scorePartner(partner) {
  const p = partner || {};
  const checks = FACTORS.map((f) => {
    const raw = Math.max(0, Math.min(3, Number(p[f.key]) || 0));
    const points = (raw / 3) * f.weight;
    return {
      label: f.label, question: f.q, band: BAND[raw], raw,
      points: Math.round(points), max: f.weight,
      note: raw <= 1 ? f.low : null,
    };
  });

  const score = checks.reduce((t, c) => t + c.points, 0);
  const blockers = [];

  if (!String(p.goal || "").trim())
    blockers.push("No one-line goal. Pick the outcome before the partner.");
  if ((Number(p.overlap) || 0) === 0)
    blockers.push("No audience overlap. Not a fit however well known they are.");
  if ((Number(p.ease) || 0) === 0 || !String(p.namedContact || "").trim())
    blockers.push("No named person who can say yes and do the work.");
  if ((Number(p.complementary) || 0) === 0)
    blockers.push("Competing products. There is no honest joint asset here.");

  const notes = [];
  if (p.wellKnown && (Number(p.overlap) || 0) <= 1)
    notes.push("Well known, weak overlap — this is the fame trap. Attention, not buyers.");
  if (Array.isArray(p.unknowns) && p.unknowns.length)
    notes.push("Guessed rather than known: " + p.unknowns.join("; ") +
      ". A score built on a guess is worse than no score — ask them.");

  let tier, verdict;
  if (blockers.length) { tier = "No"; verdict = "Not a fit. " + blockers[0]; }
  else if (score >= 75) { tier = "Start here"; verdict = "Strong overlap and usable reach. One of your first two or three."; }
  else if (score >= 50) { tier = "Worth a conversation"; verdict = "Workable, with a gap to close before you commit effort."; }
  else { tier = "Not yet"; verdict = "Too much of this rests on them being interesting rather than aligned."; }

  return {
    name: p.name || "(unnamed partner)",
    goal: String(p.goal || "").trim() || "(not written)",
    score: Math.round(score), max: 100, tier, verdict,
    checks, blockers, notes,
  };
}

const TERMS = [
  ["goalEachSide", "The goal for each side", "They can differ, as long as both are stated."],
  ["whoDoesWhat", "Who does what", "Content, design, promotion, hosting, follow-up."],
  ["promotionPlan", "What each side promotes, and where", "Emails, posts, newsletters, sales teams."],
  ["leadSharing", "How leads are shared", "Who gets which contacts, with what consent, and who follows up."],
  ["howJudged", "How you will judge it", "The numbers you will both look at afterwards."],
];

/** Step 4, applied to a draft agreement. */
function checkTerms(terms) {
  const t = terms || {};
  const missing = TERMS.filter(([k]) => !t[k]).map(([, label]) => label);
  const issues = [];

  missing.forEach((m) => issues.push("Missing: " + m));

  // The lead-sharing line is the one that damages people outside the deal.
  if (t.leadSharing && !t.consentStatedOnForm)
    issues.push("Lead sharing agreed, but the form does not state which companies receive a person's details. Never pass on contacts people did not agree to share.");
  if (t.leadSharing && !t.whoFollowsUp)
    issues.push("Lead sharing agreed with nobody named to follow up. Contacts go cold in days.");

  if (t.promotionPlan && !t.promotionDates)
    issues.push("Promotion agreed without dates. Uneven promotion is the most common way these fail.");

  if (t.workStarted && missing.length)
    issues.push("Work has already started on an unwritten agreement. Unspoken expectations turn into resentment by week three.");

  if (Array.isArray(t.assets) && t.assets.length > 1)
    issues.push(`${t.assets.length} assets planned. One good asset promoted well beats five promoted by nobody.`);

  return {
    ready: issues.length === 0,
    missing,
    issues,
    rule: "Agree lead sharing in writing before anything goes live.",
  };
}

/** Step 8 — judged on pipeline, not sign-ups. */
function reviewPartnership(result) {
  const r = result || {};
  const signups = Number(r.signups) || 0;
  const qualified = Number(r.qualifiedLeads) || 0;
  const pipeline = Number(r.pipelineValue) || 0;
  const ourHours = Number(r.ourHours) || 0;
  const theirHours = Number(r.theirHours) || 0;
  const fullCycle = r.fullSalesCycleElapsed === true;

  const qualRate = signups > 0 ? qualified / signups : null;
  const perHour = ourHours > 0 ? pipeline / ourHours : null;
  const effortRatio = theirHours > 0 ? ourHours / theirHours : null;

  const findings = [];
  if (!fullCycle)
    findings.push("A full sales cycle has not elapsed. Judge the pipeline number again when it has.");
  if (signups > 0 && qualified === 0)
    findings.push(`${signups} sign-ups and no qualified leads. That was a list-building exercise, not a partnership.`);
  else if (qualRate !== null && qualRate < 0.1 && pipeline === 0)
    findings.push(`${signups} sign-ups, ${qualified} of them your buyer, no pipeline. That was a list-building exercise, not a partnership.`);
  else if (qualRate !== null && qualRate < 0.2)
    findings.push(`Only ${Math.round(qualRate * 100)}% of sign-ups matched your ICP. The overlap was weaker than it scored.`);
  if (effortRatio !== null && effortRatio > 2)
    findings.push(`You spent ${effortRatio.toFixed(1)}x the partner's hours. Promotion or production was not shared as agreed.`);
  if (pipeline > 0 && perHour !== null)
    findings.push(`Pipeline per hour of your effort: ${Math.round(perHour).toLocaleString("en-US")}. Compare partners on this, not on raw sign-ups.`);

  // "Change the format" only applies when the right people actually turned up.
  // A handful of qualified leads inside a big, badly matched crowd is an
  // audience problem, and telling the user to change the asset would send them
  // back to the same wrong list.
  const audienceHeld = qualRate !== null ? qualRate >= 0.2 : qualified > 0;

  let verdict, reason;
  if (!fullCycle && pipeline === 0) {
    verdict = "Too early to decide";
    reason = "Nothing has had time to close. Set a date to review again rather than judging it now.";
  } else if (qualified > 0 && pipeline > 0 && !fullCycle) {
    verdict = "Too early to decide";
    reason = "There is pipeline, but a full sales cycle has not elapsed, so it may not close. Set a date to review again before repeating.";
  } else if (qualified > 0 && pipeline > 0 && !audienceHeld) {
    verdict = "Change the format";
    reason = "Pipeline came, but from a small share of a poorly matched crowd. Repeat only with a tighter audience, not the same list.";
  } else if (qualified > 0 && pipeline > 0) {
    verdict = "Do it again";
    reason = "Real pipeline from the right audience after a full sales cycle is the pattern worth repeating — consider a rhythm, such as one joint asset a quarter.";
  } else if (audienceHeld) {
    verdict = "Change the format";
    reason = "The right people came and nothing progressed. The audience was fine; the asset or the follow-up was not.";
  } else if (qualified > 0) {
    verdict = "Stop";
    reason = "The crowd was large and almost none of it was your buyer. That is an overlap problem, and a different asset for the same list will not fix it.";
  } else {
    verdict = "Stop";
    reason = "It did not serve both sides. End it politely rather than letting it drift.";
  }

  return {
    partner: r.name || "(unnamed partner)",
    againstGoal: r.goal || "(no goal was written)",
    signups, qualified, pipeline,
    qualifiedRate: qualRate === null ? null : Math.round(qualRate * 100),
    pipelinePerHour: perHour === null ? null : Math.round(perHour),
    verdict, reason, findings,
    note: "Use your own numbers, not an industry benchmark.",
  };
}

module.exports = { scorePartner, checkTerms, reviewPartnership, FACTORS, TERMS };

// --- demo --------------------------------------------------------------------
if (require.main === module && (process.argv.includes("--demo") || process.argv.length <= 2)) {
  if (!process.argv.includes("--demo")) console.log("(no input, so this is the built-in demo. Run --help to see how to pass your own.)");
  const P = (...a) => console.log(...a);
  const show = (r) => {
    P(`\n${r.name} — ${r.score}/${r.max} · ${r.tier}`);
    P(r.verdict);
    r.checks.forEach(c => P(`  ${c.label.padEnd(26)} ${String(c.points).padStart(2)}/${c.max}  ${c.band}${c.note ? "  — " + c.note : ""}`));
    r.blockers.forEach(b => P("  ! " + b));
    r.notes.forEach(n => P("  · " + n));
  };

  const GOAL = "We want qualified pipeline from mid-market HR teams within one quarter";

  P("=== A. THE FAMOUS ONE EVERYONE WANTS TO PARTNER WITH ===");
  show(scorePartner({
    name: "A very well-known HR brand", goal: GOAL,
    overlap: 1, complementary: 2, reach: 3, ease: 1,
    namedContact: "", wellKnown: true,
    unknowns: ["how much of their list is actually mid-market"],
  }));

  P("\n=== B. THE SMALL ONE WITH A PERFECT OVERLAP ===");
  show(scorePartner({
    name: "A mid-market onboarding consultancy", goal: GOAL,
    overlap: 3, complementary: 3, reach: 2, ease: 3,
    namedContact: "Dana, head of marketing", wellKnown: false, unknowns: [],
  }));

  P("\n=== TERMS CHECK (Step 4) ===");
  const bad = checkTerms({
    goalEachSide: true, whoDoesWhat: true, promotionPlan: true,
    leadSharing: true, consentStatedOnForm: false, whoFollowsUp: null,
    howJudged: false, promotionDates: false, workStarted: true,
    assets: ["joint guide", "webinar", "email course"],
  });
  P(`draft — ${bad.ready ? "ready" : "not ready"}`);
  bad.issues.forEach(i => P("  - " + i));
  P("  " + bad.rule);

  const good = checkTerms({
    goalEachSide: true, whoDoesWhat: true, promotionPlan: true, promotionDates: true,
    leadSharing: true, consentStatedOnForm: true, whoFollowsUp: "each side takes its own registrants",
    howJudged: true, workStarted: false, assets: ["one joint session"],
  });
  P(`\nrevised draft — ${good.ready ? "ready" : "not ready"}`);
  good.issues.forEach(i => P("  - " + i));

  P("\n=== REVIEW (Step 8) ===");
  [
    { name: "Big-list partner", goal: GOAL, signups: 400, qualifiedLeads: 6, pipelineValue: 0,
      ourHours: 40, theirHours: 6, fullSalesCycleElapsed: true },
    { name: "Small overlap partner", goal: GOAL, signups: 55, qualifiedLeads: 31, pipelineValue: 180000,
      ourHours: 22, theirHours: 18, fullSalesCycleElapsed: true },
  ].forEach(c => {
    const r = reviewPartnership(c);
    P(`\n${r.partner} — ${r.verdict}`);
    P(r.reason);
    P(`  ${r.signups} sign-ups · ${r.qualified} qualified (${r.qualifiedRate}%) · pipeline ${r.pipeline.toLocaleString("en-US")}`);
    r.findings.forEach(f => P("  - " + f));
  });

  P("\nThis is a rubric, not a prediction. Use your own numbers, not an industry benchmark.");
}

// --- command line ------------------------------------------------------------
// Anything other than the demo: --help prints the header, a JSON argument runs
// one check. Nothing is silently ignored.
if (require.main === module && process.argv.length > 2 && !process.argv.includes("--demo")) {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h") {
    console.log(require("fs").readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*+/, ""));
    process.exit(0);
  }
  const CHECKS = { scorePartner, checkTerms, reviewPartnership };
  const fail = (m) => { console.error(m + "\nRun --help for the input shape."); process.exit(1); };
  let req;
  try { req = JSON.parse(arg); } catch (e) { fail("Invalid JSON: " + e.message); }
  if (!req || typeof req !== "object" || Array.isArray(req)) fail('The input must be a JSON object: {"check": "...", "input": {...}}.');
  const extra = Object.keys(req).filter((k) => k !== "check" && k !== "input");
  if (extra.length) fail("Unrecognised field" + (extra.length > 1 ? "s" : "") + ": " + extra.map((k) => '"' + k + '"').join(", ") + '. Expected: "check" and "input".');
  if (!Object.prototype.hasOwnProperty.call(CHECKS, req.check)) fail('"check" must be one of: ' + Object.keys(CHECKS).join(", ") + ".");
  if (!req.input || typeof req.input !== "object" || Array.isArray(req.input)) fail('"input" is required: the object that ' + req.check + " takes.");
  const FIELDS = {
    scorePartner: ["name", "goal", "overlap", "complementary", "reach", "ease", "namedContact", "wellKnown", "unknowns"],
    checkTerms: TERMS.map(([k]) => k),
    reviewPartnership: ["name", "goal", "signups", "qualifiedLeads", "pipelineValue", "ourHours", "theirHours", "fullSalesCycleElapsed"],
  };
  const badIn = Object.keys(req.input).filter((k) => !FIELDS[req.check].includes(k));
  if (badIn.length) fail("Unrecognised field" + (badIn.length > 1 ? "s" : "") + " in input: " + badIn.map((k) => '"' + k + '"').join(", ") + ". Expected: " + FIELDS[req.check].join(", ") + ".");
  let result;
  try { result = CHECKS[req.check](req.input); } catch (e) { fail(req.check + " could not run on that input: " + e.message); }
  console.log(JSON.stringify(result, null, 2));
}
