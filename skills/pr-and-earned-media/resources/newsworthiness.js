/**
 * newsworthiness.js — AAJ earned-media engine
 *
 * Scores a story idea before it is pitched, and checks whether the materials a
 * journalist will ask for actually exist.
 *
 * Scope note: this is a RUBRIC, not a prediction. It cannot know an editor's
 * calendar, and no score here means coverage is likely. What it does is force
 * the four questions that separate a story from an announcement, and refuse to
 * score an idea whose evidence cannot be produced on request.
 *
 * Story shape:
 *   {
 *     headline:      String,   // the story in one line, as a reader would see it
 *     type:          "data" | "position" | "customer" | "timing",
 *     audience:      String,   // who the coverage is for (Step 1)
 *     outlets:       [String], // named outlets that reach that audience
 *     evidence: {
 *       method:        Boolean, // the method behind the figure is written down
 *       reproducible:  Boolean, // someone else could re-run it
 *       published:     Boolean, // it already has a home on your own site
 *       permission:    Boolean, // written permission, customer stories only
 *     },
 *     companyRemoved: Boolean, // is there still a story with your name removed?
 *     forwardTest:    Boolean, // would a reader forward this to a colleague?
 *     materials: {
 *       pressPage: Boolean, headshots: Boolean, logoPack: Boolean,
 *       methodDoc: Boolean, customerOnRecord: Boolean
 *     }
 *   }
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

const TYPE_LABEL = {
  data: "Data you own",
  position: "A position you can defend",
  customer: "A customer result",
  timing: "A clear reason for now",
};

function scoreStory(story) {
  const s = story || {};
  const ev = s.evidence || {};
  const mat = s.materials || {};
  const type = TYPE_LABEL[s.type] ? s.type : null;

  const checks = [];
  const add = (label, pass, points, note) =>
    checks.push({ label, pass: !!pass, points: pass ? points : 0, max: points, note });

  // 1. Is it a story at all? (Step 2)
  add("Recognised story type", type, 15,
    type ? TYPE_LABEL[type] : "None of the four AAJ story types — this reads as an announcement");
  add("Survives the company-removed test", s.companyRemoved, 20,
    "Strip your company name out. If nothing is left, there was never a story");
  add("Passes the forward-to-a-colleague test", s.forwardTest, 15,
    "A reader forwarding it is the only readership signal you control before publication");

  // 2. Can you back it? (Steps 2 and 6)
  add("Method is written down", ev.method, 15,
    "A figure whose method you cannot show is a figure you should not pitch");
  add("Someone else could reproduce it", ev.reproducible, 10,
    "Reproducibility is what makes a data story citable rather than quotable");
  add("Already published on your own site", ev.published, 10,
    "Journalists prefer data that has a home, a method and a chart (Step 4)");

  if (s.type === "customer") {
    add("Written permission from the customer", ev.permission, 15,
      "No customer result goes out without written permission — no exceptions");
  } else {
    add("Evidence is yours to share", true, 15, "No third-party permission needed for this story type");
  }

  // 3. Is it aimed at anyone? (Steps 1 and 3)
  const outlets = Array.isArray(s.outlets) ? s.outlets.filter(Boolean) : [];
  add("Audience named", !!(s.audience && String(s.audience).trim()), 5,
    "Step 1: 'We want [audience] to see us in [outlet] so that [outcome]'");
  add("At least three named outlets that reach them", outlets.length >= 3, 5,
    `${outlets.length} named — twenty of the right names beats two thousand of the wrong ones`);

  const score = checks.reduce((t, c) => t + c.points, 0);
  const max = checks.reduce((t, c) => t + c.max, 0);
  const pct = Math.round((score / max) * 100);

  // Materials gate (Step 6) — separate from the score, because a strong story
  // with nothing ready still loses the piece.
  const MAT = [
    ["pressPage", "Press page with company description and founder bio"],
    ["headshots", "Current headshots"],
    ["logoPack", "Logo pack"],
    ["methodDoc", "Written method behind any data you share"],
  ];
  if (s.type === "customer") MAT.push(["customerOnRecord", "A customer who has agreed in writing to speak"]);
  const missing = MAT.filter(([k]) => !mat[k]).map(([, label]) => label);

  const blockers = checks.filter(c => !c.pass && c.max >= 15).map(c => c.label);

  let verdict, reason;
  if (blockers.length) {
    verdict = "Do not pitch yet";
    reason = `Blocked on: ${blockers.join("; ")}. These are the checks a journalist applies in the first ten seconds.`;
  } else if (pct >= 80) {
    verdict = "Pitch it";
    reason = "The story stands without your company name, the evidence holds, and the list is aimed.";
  } else if (pct >= 60) {
    verdict = "Sharpen first";
    reason = "The core is there. Close the gaps below before the first email goes out.";
  } else {
    verdict = "Keep working on it";
    reason = "Too much of this rests on your company being interesting rather than the story being useful.";
  }

  return {
    headline: s.headline || "(untitled story)",
    type: type ? TYPE_LABEL[type] : "Unrecognised",
    score, max, pct, verdict, reason,
    checks,
    outlets,
    missingMaterials: missing,
    notes: [
      "This is a rubric, not a prediction. No score here makes coverage likely.",
      "Paid placement is advertising even when it looks like an article. Do not score it here.",
    ],
  };
}

/** Pitch email check — the Step 5 rules, applied to a draft. */
function checkPitch(pitch) {
  const p = pitch || {};
  const subject = String(p.subject || "");
  const body = String(p.body || "");
  const words = body.split(/\s+/).filter(Boolean).length;
  const company = String(p.companyName || "").trim();

  const issues = [];
  if (company && subject.toLowerCase().includes(company.toLowerCase()))
    issues.push("Subject line names your company. The subject is the story, not the sender.");
  if (words > 200) issues.push(`Body is ${words} words. Over 200 reads as a press release.`);
  if (!p.recipientName) issues.push("No recipient name — one pitch per person, addressed to them.");
  if (!p.recentPieceReferenced) issues.push("No reference to something they recently wrote. Read five pieces first.");
  if (p.hasAttachment) issues.push("Attachment present. Link to the data instead.");
  if (!p.offer) issues.push("No named offer (the data, an interview, a customer who will talk).");
  if (p.sentToCount && p.sentToCount > 1) issues.push(`Being sent to ${p.sentToCount} people. Mass sends reach nobody who cares.`);

  return {
    words,
    ready: issues.length === 0,
    issues,
    followUpRule: "One follow-up after a few days, with something new. Then stop.",
  };
}

module.exports = { scoreStory, checkPitch };

// --- demo --------------------------------------------------------------------
if (require.main === module && process.argv.includes("--demo")) {
  const P = (...a) => console.log(...a);
  const show = (r) => {
    P(`\n"${r.headline}"`);
    P(`${r.type} · ${r.score}/${r.max} (${r.pct}%) · ${r.verdict}`);
    P(r.reason);
    const failed = r.checks.filter(c => !c.pass);
    if (failed.length) {
      P("failed checks:");
      failed.forEach(c => P(`  - ${c.label} — ${c.note}`));
    }
    P(`materials not ready: ${r.missingMaterials.length ? r.missingMaterials.join("; ") : "none"}`);
  };

  P("=== A. THE ANNOUNCEMENT (what most founders send) ===");
  show(scoreStory({
    headline: "Acme raises $4M to reinvent employee onboarding",
    type: "timing",
    audience: "",
    outlets: ["a national business title"],
    evidence: { method: false, reproducible: false, published: false },
    companyRemoved: false,
    forwardTest: false,
    materials: { pressPage: true, headshots: false, logoPack: true, methodDoc: false },
  }));

  P("\n=== B. THE SAME QUARTER, REWORKED AS A STORY ===");
  show(scoreStory({
    headline: "Mid-market HR teams are rebuilding onboarding around the first 30 days",
    type: "data",
    audience: "HR leaders at 200-2,000 person companies",
    outlets: ["a trade newsletter", "an HR podcast", "a sector analyst"],
    evidence: { method: true, reproducible: true, published: true },
    companyRemoved: true,
    forwardTest: true,
    materials: { pressPage: true, headshots: true, logoPack: true, methodDoc: true },
  }));

  const pitch = checkPitch({
    subject: "HR teams are quietly rebuilding onboarding around the first 30 days",
    body: "Hi Priya - your piece on manager overload in March stayed with me. We work with about forty mid-market HR teams and most have moved onboarding from ninety days to thirty. Two will talk on record, and I can share the anonymised programme data. Worth fifteen minutes?",
    companyName: "Acme", recipientName: "Priya", recentPieceReferenced: true,
    hasAttachment: false, offer: "data + two customers on record", sentToCount: 1,
  });
  P("\n=== PITCH CHECK (Step 5) ===");
  P(`${pitch.words} words - ${pitch.ready ? "ready to send" : "not ready"}`);
  pitch.issues.forEach(i => P("  - " + i));
  P(pitch.followUpRule);

  P("\nThis is a rubric, not a prediction. No score here makes coverage likely.");
  P("Paid placement is advertising even when it looks like an article.");
}
