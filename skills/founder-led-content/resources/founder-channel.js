/**
 * founder-channel.js — AAJ founder-led content engine
 *
 * Two checks, both from the AAJ Founder-Led LinkedIn Playbook:
 *   scoreSetup(setup) — is this account ready to start posting at all?
 *   checkPost(post)   — does this draft follow the drafting rules?
 *
 * Scope note: this is a RUBRIC, not a prediction. It cannot know whether a post
 * will travel, and nothing here makes an account work. What it does is refuse to
 * let a founder start on a purpose they have not written, themes a competitor
 * could own, an empty bank, or a cadence built for their best week.
 *
 * Setup shape:
 *   {
 *     purpose:   String,   // "I help [who] with [what problem]"
 *     themes: [ { name, source: "seen"|"believe"|"done", competitorCouldPost: Boolean } ],
 *     profile:   { headlineSaysWhoYouHelp: Boolean, featuredIsUseful: Boolean,
 *                  featuredIsSalesPage: Boolean },
 *     bank:      [ { title, theme } ],   // drafted posts ready before launch
 *     cadence:   { postsPerWeek: Number, isWorstWeekNumber: Boolean },
 *     attribution: { askedOnIntakeForm: Boolean, askedOnFirstCall: Boolean }
 *   }
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

const SOURCE_LABEL = {
  seen: "What you have seen repeatedly",
  believe: "What you believe that your category does not",
  done: "What you have done first-hand",
};

// A bank of eight is four weeks at the usual floor of two a week — enough to
// survive the first busy month without writing.
const BANK_FLOOR = 8;

function scoreSetup(setup) {
  const s = setup || {};
  const themes = Array.isArray(s.themes) ? s.themes.filter(Boolean) : [];
  const bank = Array.isArray(s.bank) ? s.bank.filter(Boolean) : [];
  const profile = s.profile || {};
  const cadence = s.cadence || {};
  const attr = s.attribution || {};

  const checks = [];
  const add = (label, pass, points, note) =>
    checks.push({ label, pass: !!pass, points: pass ? points : 0, max: points, note });

  // 1. What is the account for? (Step 1)
  const purpose = String(s.purpose || "").trim();
  add("One-line purpose written", purpose.length > 0, 15,
    purpose || "\"I help [who] with [what problem]\" — without it there is no way to tell a good post from a popular one");

  // 2. Three things only this founder can say (Step 2)
  add("Exactly three themes", themes.length === 3, 15,
    `${themes.length} named — three makes you known for something, ten makes you known for nothing`);

  const badSource = themes.filter(t => !SOURCE_LABEL[t.source]);
  add("Every theme traced to seen / believe / done", themes.length > 0 && badSource.length === 0, 15,
    badSource.length
      ? `Untraced: ${badSource.map(t => t.name || "(unnamed)").join(", ")}`
      : "Ownable material comes from those three places and nowhere else");

  const copyable = themes.filter(t => t.competitorCouldPost);
  add("Every theme survives the competitor test", themes.length > 0 && copyable.length === 0, 20,
    copyable.length
      ? `A competitor's founder could post these unchanged: ${copyable.map(t => t.name || "(unnamed)").join(", ")}`
      : "Nothing here could run unchanged on a competitor's account");

  // 3. The profile every good post sends people to (Step 4)
  add("Headline says who you help", profile.headlineSaysWhoYouHelp, 5,
    "Not a job title — the headline is read by people arriving from a post");
  add("Featured section holds something usable", profile.featuredIsUseful && !profile.featuredIsSalesPage, 5,
    profile.featuredIsSalesPage ? "A sales page is featured. Feature a guide, a tool or a template instead"
                                : "One thing a buyer can use today");

  // 4. The bank, before the first post (Step 5)
  add(`Bank of at least ${BANK_FLOOR} drafts before launch`, bank.length >= BANK_FLOOR, 10,
    `${bank.length} drafted — ${BANK_FLOOR} is about four weeks at the usual floor, which is what carries you through a busy month`);

  // 5. A floor, not a target (Step 7)
  const ppw = Number(cadence.postsPerWeek) || 0;
  add("Cadence is a worst-week floor", ppw > 0 && cadence.isWorstWeekNumber === true, 10,
    ppw ? `${ppw}/week — set the lowest number you can keep in your worst week, then protect it`
        : "No cadence set");

  // 6. The half of the channel analytics cannot see (Step 8)
  add("\"How did you hear about us?\" is being asked", attr.askedOnIntakeForm || attr.askedOnFirstCall, 5,
    "Most of this channel's results arrive privately. If you do not ask, you cannot see them");

  const score = checks.reduce((t, c) => t + c.points, 0);
  const max = checks.reduce((t, c) => t + c.max, 0);
  const pct = Math.round((score / max) * 100);
  const blockers = checks.filter(c => !c.pass && c.max >= 15).map(c => c.label);

  // Repeats in the bank — two drafts on the same theme making the same point is
  // the common first-batch failure.
  const seenTitles = new Map();
  const repeats = [];
  bank.forEach(p => {
    const key = String(p.title || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (!key) return;
    if (seenTitles.has(key)) repeats.push(p.title);
    else seenTitles.set(key, true);
  });

  const themeNames = new Set(themes.map(t => t.name));
  const offTheme = bank.filter(p => p.theme && themeNames.size && !themeNames.has(p.theme))
                       .map(p => p.title);

  let verdict, reason;
  if (blockers.length) {
    verdict = "Not ready to post";
    reason = `Blocked on: ${blockers.join("; ")}. Starting without these produces an account nobody can describe.`;
  } else if (pct >= 80) {
    verdict = "Start posting";
    reason = "The purpose is written, the themes are yours, and there is enough in the bank to survive a busy month.";
  } else if (pct >= 60) {
    verdict = "Close the gaps first";
    reason = "The core is there. Fix what is listed below before the first post rather than after.";
  } else {
    verdict = "Keep setting up";
    reason = "Too much of this rests on posting regularly rather than on having something only you can say.";
  }

  return {
    purpose: purpose || "(not written)",
    score, max, pct, verdict, reason,
    checks,
    themes: themes.map(t => ({
      name: t.name,
      source: SOURCE_LABEL[t.source] || "Untraced",
      ownable: !t.competitorCouldPost,
    })),
    bankSize: bank.length,
    bankRepeats: repeats,
    bankOffTheme: offTheme,
    judgeOn: [
      "Conversations started — DMs, comment threads and calls that began with a post",
      "Self-reported source — how often LinkedIn or your name appears in \"How did you hear about us?\"",
      "Whether new followers match the buyer in the Step 1 sentence",
    ],
    notes: [
      "This is a rubric, not a prediction. No score here makes the channel work.",
      "Judge the channel at ninety days, on conversations rather than impressions.",
    ],
  };
}

const BAIT = [
  [/\bagree\?/i, "\"Agree?\""],
  [/\bthoughts\?\s*$/i, "\"Thoughts?\" as the close"],
  [/comment\s+(yes|below|"?\w+"?\s+and)/i, "Comment-to-receive bait"],
  [/\bwho else\b/i, "\"Who else…\""],
  [/\bdrop a\b/i, "\"Drop a…\""],
  [/\brepost (this|if)\b/i, "Repost bait"],
  [/👇/, "Pointing-down emoji bait"],
];

/** Draft check — the Step 6 rules, applied to one post. */
function checkPost(post) {
  const p = post || {};
  const text = String(p.text || "");
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  const words = text.split(/\s+/).filter(Boolean).length;
  const figures = Array.isArray(p.figures) ? p.figures : [];
  const themes = Array.isArray(p.themes) ? p.themes : [];

  const issues = [];

  if (!firstLine) issues.push("Empty draft.");
  else if (p.firstLineCarriesThePoint === false)
    issues.push("First line is a warm-up. Most people read it and nothing else — put the point there.");

  if (p.ideaCount && p.ideaCount > 1)
    issues.push(`${p.ideaCount} ideas in one post. A second idea is a second post.`);

  const unsourced = figures.filter(f => !f || !f.source).map(f => (f && f.value) || "(figure)");
  if (unsourced.length)
    issues.push(`Figure with no source in the post: ${unsourced.join(", ")}. A borrowed number is how you end up correcting yourself in public.`);

  BAIT.forEach(([re, label]) => {
    if (re.test(text)) issues.push(`Engagement bait — ${label}. It gets reactions from the wrong people.`);
  });

  if (p.customerResult && !p.writtenPermission)
    issues.push("Customer result with no written permission. No logos, no numbers, no name.");

  if (p.inventedProof)
    issues.push("Composite or illustrative customer detail. Never invent the proof you do not have yet.");

  if (p.theme && themes.length && !themes.includes(p.theme))
    issues.push(`"${p.theme}" is outside the three themes. Post it elsewhere or change the themes deliberately.`);

  if (p.isPromotional && !p.saysSoPlainly)
    issues.push("Promotional without saying so. Buyers forgive an honest pitch far more readily than a disguised one.");

  return {
    words,
    firstLine,
    ready: issues.length === 0,
    issues,
    cadenceRule: "Protect the floor, not the peak. In a heavy quarter, post from the bank and write nothing new.",
  };
}

module.exports = { scoreSetup, checkPost };

// --- demo --------------------------------------------------------------------
if (require.main === module && process.argv.includes("--demo")) {
  const P = (...a) => console.log(...a);
  const show = (r) => {
    P(`\n"${r.purpose}"`);
    P(`${r.score}/${r.max} (${r.pct}%) · ${r.verdict}`);
    P(r.reason);
    const failed = r.checks.filter(c => !c.pass);
    if (failed.length) {
      P("failed checks:");
      failed.forEach(c => P(`  - ${c.label} — ${c.note}`));
    }
    P(`bank: ${r.bankSize} drafts${r.bankRepeats.length ? `, repeats: ${r.bankRepeats.join("; ")}` : ""}${r.bankOffTheme.length ? `, off-theme: ${r.bankOffTheme.join("; ")}` : ""}`);
  };

  P("=== A. THE USUAL START (post first, work it out later) ===");
  show(scoreSetup({
    purpose: "",
    themes: [
      { name: "Startup lessons", source: "believe", competitorCouldPost: true },
      { name: "Hiring tips", source: null, competitorCouldPost: true },
    ],
    profile: { headlineSaysWhoYouHelp: false, featuredIsUseful: false, featuredIsSalesPage: true },
    bank: [{ title: "Why culture matters", theme: "Startup lessons" }],
    cadence: { postsPerWeek: 5, isWorstWeekNumber: false },
    attribution: {},
  }));

  P("\n=== B. THE SAME FOUNDER, SET UP PROPERLY ===");
  show(scoreSetup({
    purpose: "I help mid-market HR leaders fix onboarding that stalls in the first 30 days",
    themes: [
      { name: "What forty onboarding rebuilds have in common", source: "seen", competitorCouldPost: false },
      { name: "Ninety-day onboarding is a scheduling artefact, not a design", source: "believe", competitorCouldPost: false },
      { name: "What we measured when we cut our own to thirty", source: "done", competitorCouldPost: false },
    ],
    profile: { headlineSaysWhoYouHelp: true, featuredIsUseful: true, featuredIsSalesPage: false },
    bank: [
      { title: "The handoff nobody owns", theme: "What forty onboarding rebuilds have in common" },
      { title: "Why day 31 is arbitrary", theme: "Ninety-day onboarding is a scheduling artefact, not a design" },
      { title: "What we cut first", theme: "What we measured when we cut our own to thirty" },
      { title: "The manager is the bottleneck", theme: "What forty onboarding rebuilds have in common" },
      { title: "A checklist is not a programme", theme: "Ninety-day onboarding is a scheduling artefact, not a design" },
      { title: "The number we got wrong", theme: "What we measured when we cut our own to thirty" },
      { title: "One question that predicts week four", theme: "What forty onboarding rebuilds have in common" },
      { title: "What we cut first", theme: "What we measured when we cut our own to thirty" },
    ],
    cadence: { postsPerWeek: 2, isWorstWeekNumber: true },
    attribution: { askedOnIntakeForm: true, askedOnFirstCall: true },
  }));

  P("\n=== DRAFT CHECK (Step 6) ===");
  const bad = checkPost({
    text: "I've been thinking a lot about onboarding lately.\n\nMost companies get it wrong. 70% of new hires decide in the first month.\n\nAgree? 👇",
    firstLineCarriesThePoint: false,
    ideaCount: 2,
    figures: [{ value: "70%", source: null }],
    theme: "Hiring tips",
    themes: ["What forty onboarding rebuilds have in common"],
  });
  P(`draft A — ${bad.words} words — ${bad.ready ? "ready" : "not ready"}`);
  bad.issues.forEach(i => P("  - " + i));

  const good = checkPost({
    text: "Day 31 is the most arbitrary date in onboarding.\n\nWe picked ninety days because the quarter is ninety days, not because anyone learns on that schedule. When we rebuilt ours around the first thirty, the only thing we lost was the part nobody was doing anyway.",
    firstLineCarriesThePoint: true,
    ideaCount: 1,
    figures: [],
    theme: "Ninety-day onboarding is a scheduling artefact, not a design",
    themes: ["Ninety-day onboarding is a scheduling artefact, not a design"],
  });
  P(`\ndraft B — ${good.words} words — ${good.ready ? "ready" : "not ready"}`);
  good.issues.forEach(i => P("  - " + i));
  P(good.cadenceRule);

  P("\nThis is a rubric, not a prediction. Judge the channel at ninety days, on conversations.");
}
