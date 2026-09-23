/**
 * ai-governance.js — AAJ AI marketing governance engine
 *
 * Three checks, all from the AAJ AI Tool Policy for Marketing:
 *   scoreReadiness(state)     — is this team safe to publish AI-drafted work?
 *   checkCitation(citation)   — does this source meet the section 5 rules?
 *   checkDraft(draft)         — sweep a draft before it reaches the review gate
 *
 * Scope note: this is a RULE CHECK, not a fact checker. It cannot tell you
 * whether a study exists. What it can do is refuse a citation that is missing
 * the parts a real one always has, and catch the patterns that mark a source as
 * unciteable — an index page, a "via", an aggregator, a preprint dressed up as a
 * journal paper. Opening the document yourself is still the only verification.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

const NEVER_IN_A_PROMPT = [
  "Customer names, email addresses, or any exported customer list",
  "Unannounced pricing, roadmap, or financials",
  "Anything under NDA — a client's data, a partner's numbers, an unsigned contract",
  "Employee records, performance notes, or compensation",
  "Credentials, API keys, access tokens",
  "Anything you would not be comfortable seeing in a screenshot on social media",
];

const REVIEW_QUESTIONS = [
  "Is every factual claim in this true, and can I show where it came from?",
  "Does it sound like us, or does it sound like everyone?",
  "Does it promise anything we cannot deliver?",
  "Would I be comfortable if a customer knew AI drafted it?",
];

const FIVE_RULES = [
  ["AI drafts. People decide and sign.", "No exceptions, no \"it was only a social post\"."],
  ["Use the tools on the list.", "Anything else needs approval first."],
  ["Nothing confidential goes into a prompt.", "Customers, pricing, NDAs, credentials — none of it."],
  ["Ask for the argument, not the statistics.", "Add every figure yourself, from a document you opened."],
  ["A named person reviews before publish.", "Their name goes somewhere that survives the week."],
];

const TASKS = [
  "Research and summarising",
  "First drafts — blog, email, social",
  "Editing, proofing, shortening",
  "Images and video",
  "Code on the marketing site",
  "Customer or revenue data analysis",
];

function scoreReadiness(state) {
  const s = state || {};
  const tools = Array.isArray(s.approvedTools) ? s.approvedTools.filter(Boolean) : [];
  const training = s.trainingOnInputs || {};
  const gate = s.reviewGate || {};
  const own = s.ownership || {};

  const checks = [];
  const add = (label, pass, points, note) =>
    checks.push({ label, pass: !!pass, points: pass ? points : 0, max: points, note });

  // Section 2 — approved tools, by task
  const named = tools.filter(t => t.tool && String(t.tool).trim() && !/^ai$/i.test(String(t.tool).trim()));
  const coveredTasks = new Set(named.map(t => t.task));
  const uncovered = TASKS.filter(t => !coveredTasks.has(t));
  add("Tools named, by task", named.length > 0 && uncovered.length === 0, 15,
    uncovered.length ? `No tool named for: ${uncovered.join("; ")}`
                     : `${named.length} named across the six tasks`);

  const unowned = named.filter(t => !t.whoMayUse || !String(t.whoMayUse).trim()).map(t => t.task);
  add("Each approved tool says who may use it", named.length > 0 && unowned.length === 0, 5,
    unowned.length ? `No user named for: ${unowned.join("; ")}` : "Every row has a person against it");

  // Section 3 — what never goes into a prompt
  add("The never-in-a-prompt list is written down", Array.isArray(s.neverInAPrompt) && s.neverInAPrompt.length >= 4, 15,
    "Treat every prompt as though it may be read by someone outside the company, because it may be");

  add("Training-on-inputs setting verified, not assumed", training.verified === true && !!training.verifiedOn && !!training.verifiedBy, 15,
    training.verified
      ? `Trains on inputs: ${training.trains ? "Yes" : "No"} · verified ${training.verifiedOn} by ${training.verifiedBy}`
      : "Consumer tiers often train on inputs and the default is rarely the safe one. Check it, write the answer down, re-check it when the plan changes");

  // Section 4 — the review gate
  const reviewer = String(gate.reviewerName || "").trim();
  const isAPerson = reviewer.length > 0 && !/^(the )?(team|marketing|everyone|us|we)$/i.test(reviewer);
  add("A named human reviewer", isAPerson, 20,
    reviewer ? (isAPerson ? reviewer : `"${reviewer}" is not a name. Accountability that is not a name is not accountability`)
             : "Nothing AI-drafted publishes without a named human reviewer");

  add("Reviewer's name is recorded somewhere durable", !!gate.recordedIn, 5,
    gate.recordedIn ? `Recorded in: ${gate.recordedIn}` : "The doc, the ticket or the CMS field — somewhere it survives the week");

  add("All four review questions in use", Array.isArray(gate.questions) && gate.questions.length >= 4, 5,
    "The four questions are what the reviewer is accountable for");

  // Section 5 — fact and citation checks
  add("Figures are added by a person, not asked for", s.figuresAddedByHand === true, 15,
    "Ask AI for the argument, not the statistics. A model generates plausible citations, not retrieved ones");

  // Section 6 — disclosure
  add("Disclosure line decided", typeof s.disclosureRule === "string" && s.disclosureRule.trim().length > 0, 5,
    "Disclose where the reader's judgement depends on who wrote it; routine drafting help needs no more disclosure than a spellchecker");

  // Section 7 — ownership and review
  add("Policy has an owner and a next review date", !!own.owner && !!own.nextReview, 10,
    own.owner ? `Owner: ${own.owner}, next review ${own.nextReview || "(not set)"}`
              : "A policy nobody owns is a document, not a policy");

  const score = checks.reduce((t, c) => t + c.points, 0);
  const max = checks.reduce((t, c) => t + c.max, 0);
  const pct = Math.round((score / max) * 100);
  const blockers = checks.filter(c => !c.pass && c.max >= 15).map(c => c.label);

  let verdict, reason;
  if (blockers.length) {
    verdict = "Do not publish AI-drafted work yet";
    reason = `Blocked on: ${blockers.join("; ")}. These are the checks that sit between the draft and the publish button.`;
  } else if (pct >= 85) {
    verdict = "Adopt it";
    reason = "Tools are named, the prompt line is drawn, a person signs, and figures come from documents.";
  } else if (pct >= 65) {
    verdict = "Close the gaps first";
    reason = "The structure is there. Fill in what is listed below before this goes to the team.";
  } else {
    verdict = "Keep writing the policy";
    reason = "Too much of this is still an intention rather than a rule with a name against it.";
  }

  return {
    score, max, pct, verdict, reason,
    checks,
    neverInAPrompt: NEVER_IN_A_PROMPT,
    reviewQuestions: REVIEW_QUESTIONS,
    fiveRules: FIVE_RULES.map(([r, sub]) => ({ rule: r, detail: sub })),
    notes: [
      "This is a rule check, not a fact checker. It cannot tell you whether a study exists.",
      "If a claim needs a number you cannot find, the claim is wrong — not under-researched.",
    ],
  };
}

const NEVER_CITE = [
  [/\/(tag|tags|category|categories|topics?|search)(\/|$|\?)/i,
   "Publisher index, tag or category page — a citation resolves to one document"],
  [/\bvia\b/i,
   "Reached \"via\" a third party. The word via in a source list is a confession"],
  [/(arxiv|ssrn|biorxiv|medrxiv|preprints?)\b/i,
   "Preprint — label it a preprint with its identifier, not a conference or journal paper"],
];

/** Section 5, applied to one citation. */
function checkCitation(citation) {
  const c = citation || {};
  const url = String(c.url || "");
  const issues = [];

  if (!c.organisation) issues.push("No organisation named. It must be the one that RAN the study, not the one that repeated it.");
  else if (c.repeatedBy && c.organisation === c.repeatedBy)
    issues.push(`"${c.organisation}" repeated this figure rather than producing it. Cite the source study.`);

  if (!c.title) issues.push("No document title.");
  if (!c.date) issues.push("No document date.");
  if (c.isAnnual && !c.edition) issues.push("Annual publication with no edition named — a 2024 finding dated 2026 is the classic error.");

  const sample = c.sample || {};
  if (!sample.n || !sample.of || !sample.when)
    issues.push("Incomplete sample: it needs how many, of what, measured when.");

  if (!url) issues.push("No link.");
  else {
    if (c.organisationDomain && !url.includes(c.organisationDomain))
      issues.push(`Link is not on ${c.organisationDomain} — a citation resolves to the publisher's own domain.`);
    NEVER_CITE.forEach(([re, why]) => { if (re.test(url)) issues.push(why); });
  }

  if (c.aggregator) issues.push("AI-generated aggregator or \"research\" page that republishes other people's work.");
  if (c.organisationDefunct) issues.push("The firm no longer exists and the figure cannot be opened today.");
  if (c.openedByAHuman === false) issues.push("Nobody has opened this document. Add figures one at a time, each from a document you opened yourself.");

  return {
    claim: c.claim || "(unstated claim)",
    citeable: issues.length === 0,
    issues,
    rule: "If a claim needs a number you cannot find, the claim is wrong — not under-researched.",
  };
}

/** A sweep of a draft before it reaches the named reviewer. */
function checkDraft(draft) {
  const d = draft || {};
  const text = String(d.text || "");
  const citations = Array.isArray(d.citations) ? d.citations : [];

  const issues = [];

  // Figures present in the prose, matched against the citation list.
  // \b after "%" never matches, because % is not a word character — keep the
  // boundary only on the word-suffixed forms.
  const figures = text.match(
    /\b\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s?(?:percent|x|×)\b|\$\s?\d[\d.,]*\s?(?:k|m|bn|b)?\b/gi
  ) || [];
  const unique = [...new Set(figures.map(f => f.trim()))];
  const cited = new Set(citations.map(c => String(c.figure || "").trim()));
  const uncited = unique.filter(f => !cited.has(f));
  if (uncited.length)
    issues.push(`Figure with no citation attached: ${uncited.join(", ")}. Ask AI for the argument, not the statistics.`);

  citations.forEach(c => {
    const r = checkCitation(c);
    if (!r.citeable) issues.push(`Citation "${r.claim}" — ${r.issues.join(" ")}`);
  });

  if (d.underNamedByline && !d.namedPersonApproved)
    issues.push("Published under a named person's byline without that person reading and approving it.");

  if (d.containsQuote && d.quoteInvented)
    issues.push("Invented quote, review or testimonial. There is no version of that which is a shortcut rather than a fabrication.");

  if (d.readerJudgementDependsOnAuthor && !d.disclosed)
    issues.push("Disclosure needed: the reader's judgement here depends on who wrote it.");

  if (!d.reviewerName)
    issues.push("No named reviewer. Nothing AI-drafted publishes without one.");

  return {
    figuresFound: unique,
    ready: issues.length === 0,
    issues,
    reviewQuestions: REVIEW_QUESTIONS,
  };
}

module.exports = { scoreReadiness, checkCitation, checkDraft, FIVE_RULES, NEVER_IN_A_PROMPT };

// --- demo --------------------------------------------------------------------
if (require.main === module && process.argv.includes("--demo")) {
  const P = (...a) => console.log(...a);
  const show = (r) => {
    P(`${r.score}/${r.max} (${r.pct}%) · ${r.verdict}`);
    P(r.reason);
    const failed = r.checks.filter(c => !c.pass);
    if (failed.length) {
      P("failed checks:");
      failed.forEach(c => P(`  - ${c.label} — ${c.note}`));
    }
  };

  P("=== A. THE TEAM THAT ADOPTED AI BEFORE ANYONE WROTE RULES ===");
  show(scoreReadiness({
    approvedTools: [{ task: "First drafts — blog, email, social", tool: "AI", whoMayUse: "" }],
    neverInAPrompt: [],
    trainingOnInputs: {},
    reviewGate: { reviewerName: "the team" },
    figuresAddedByHand: false,
    ownership: {},
  }));

  P("\n=== B. THE SAME TEAM, POLICY ADOPTED ===");
  show(scoreReadiness({
    approvedTools: [
      { task: "Research and summarising", tool: "Claude (Team)", whoMayUse: "Everyone" },
      { task: "First drafts — blog, email, social", tool: "Claude (Team)", whoMayUse: "Marketing" },
      { task: "Editing, proofing, shortening", tool: "Grammarly Business", whoMayUse: "Everyone" },
      { task: "Images and video", tool: "Canva Pro", whoMayUse: "Marketing", notes: "Check licence terms for commercial use" },
      { task: "Code on the marketing site", tool: "Cursor", whoMayUse: "Dev only" },
      { task: "Customer or revenue data analysis", tool: "None — approval required", whoMayUse: "Founder" },
    ],
    neverInAPrompt: NEVER_IN_A_PROMPT,
    trainingOnInputs: { verified: true, trains: false, verifiedOn: "2026-09-23", verifiedBy: "Priya" },
    reviewGate: { reviewerName: "Priya Raman", recordedIn: "CMS reviewer field", questions: REVIEW_QUESTIONS },
    figuresAddedByHand: true,
    disclosureRule: "Disclose on founder notes, customer stories and any named byline the person did not write.",
    ownership: { owner: "Priya Raman", nextReview: "2026-12-23" },
  }));

  P("\n=== CITATION CHECK (section 5) ===");
  const real = checkCitation({
    claim: "42% of startups fail from no market need",
    organisation: "CB Insights", organisationDomain: "cbinsights.com",
    title: "The Top 12 Reasons Startups Fail", date: "2021-08-03",
    sample: { n: 483, of: "startup post-mortems", when: "2010–2021" },
    url: "https://www.cbinsights.com/research/report/startup-failure-reasons-top/",
    openedByAHuman: true,
  });
  P(`"${real.claim}" — ${real.citeable ? "citeable" : "not citeable"}`);
  real.issues.forEach(i => P("  - " + i));

  const fake = checkCitation({
    claim: "Strong positioning makes the next round 30% faster",
    organisation: "CB Insights",
    url: "https://somevendor.com/blog/category/positioning-stats",
    openedByAHuman: false,
  });
  P(`\n"${fake.claim}" — ${fake.citeable ? "citeable" : "not citeable"}`);
  fake.issues.forEach(i => P("  - " + i));
  P("  " + fake.rule);

  P("\n=== DRAFT SWEEP ===");
  const sweep = checkDraft({
    text: "Positioning is the cheapest lever you have. Companies with sharp positioning raise 30% faster, and 42% of startups fail from no market need.",
    citations: [{ figure: "42%", claim: "42% fail from no market need", organisation: "CB Insights",
                  organisationDomain: "cbinsights.com", title: "The Top 12 Reasons Startups Fail", date: "2021-08-03",
                  sample: { n: 483, of: "startup post-mortems", when: "2010–2021" },
                  url: "https://www.cbinsights.com/research/report/startup-failure-reasons-top/", openedByAHuman: true }],
    underNamedByline: true, namedPersonApproved: false,
    readerJudgementDependsOnAuthor: true, disclosed: false,
    reviewerName: null,
  });
  P(`figures found: ${sweep.figuresFound.join(", ")} — ${sweep.ready ? "ready" : "not ready"}`);
  sweep.issues.forEach(i => P("  - " + i));

  P("\n=== THE FIVE RULES ===");
  FIVE_RULES.forEach(([r, sub], i) => P(`  0${i + 1}  ${r}\n      ${sub}`));
}
