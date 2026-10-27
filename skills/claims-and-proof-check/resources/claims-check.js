#!/usr/bin/env node
/*
 * AAJ Claims & Proof Check - engine
 * Part of the "claims-and-proof-check" Agent Skill.
 *
 * Reads marketing copy sentence by sentence and flags every claim that needs
 * support before it is published: numbers, results, superlatives, absolutes,
 * comparisons, testimonials and reviews, compliance badges, security and
 * privacy promises, health claims, AI claims, "free" and limited-time offers,
 * and environmental claims. Each flag quotes the text, says why it needs
 * support, what evidence or consent to keep on file, and links the regulator's
 * own guidance.
 *
 * It flags. It never rules. This flags claims that need support. It is not
 * legal advice: check the legal consequences with counsel before publishing.
 *
 * USAGE
 *   node claims-check.js --demo                 # worked example (fictional copy)
 *   node claims-check.js '<json-config>'        # your own copy
 *   node claims-check.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "text": "Your marketing copy. Paste a page, an ad, an email.",
 *     "audience": "general" | "b2b-saas" | "ai" | "edtech" | "medtech",   // optional, default "general"
 *     "evidenceOnFile": [                                                  // optional
 *       "s2-number",                               // a flag id from a previous run, or
 *       "40% faster: internal benchmark, March 2026, 212 accounts"   // a note that quotes the flagged words
 *     ]
 *   }
 *
 * OUTPUT
 *   sentences[]  { n, text, verdict: "needs-proof" | "needs-consent" | "review-wording" | "ok", flags: [ids] }
 *   flags[]      { id, n, type, label, action, text, phrases, spans, sentence, why, keep, sources[], onFile, evidence }
 *   summary      { sentences, needsProof, needsConsent, reviewWording, ok, flags, open, onFile, byType }
 *   unmatchedEvidence[]  notes that matched no flag
 *   disclaimer   the line every result must carry
 *
 * An evidence note clears a flag when it equals the flag id or quotes one of
 * the flagged phrases. The flag stays listed, marked "on file", so the record
 * of what was checked survives.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
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

'use strict';

/* aaj:core:begin - copied verbatim into aajconsult.com/tools/claims-proof-checker.
   If this block changes, re-copy it there; the site's verify script runs the same cases. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

const DISCLAIMER = 'This flags claims that need support. It is not legal advice: check the legal consequences with counsel before publishing.';
const AUDIENCES = ['general', 'b2b-saas', 'ai', 'edtech', 'medtech'];
const MAX_CHARS = 50000;

// Primary guidance, each opened on the regulator's own domain. `line` is the
// passage this engine relies on, quoted from the page.
const SOURCES = {
  substantiation: { name: 'FTC Policy Statement Regarding Advertising Substantiation', url: 'https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation', line: 'the Commission expects the firm to have at least the advertised level of substantiation.' },
  adFaq: { name: "FTC - Advertising FAQ's: A Guide for Small Business", url: 'https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business', line: 'Advertisers must have evidence to back up their claims' },
  comparative: { name: 'FTC Statement of Policy Regarding Comparative Advertising', url: 'https://www.ftc.gov/legal-library/browse/statement-policy-regarding-comparative-advertising', line: 'Comparative advertising, when truthful and non-deceptive, is a source of important information to consumers' },
  endorsements: { name: "FTC's Endorsement Guides: What People Are Asking", url: 'https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking', line: "An endorsement must reflect the honest opinion of the endorser and can't be used to make a claim the marketer of the product couldn't legally make." },
  reviews: { name: 'FTC - The Consumer Reviews and Testimonials Rule: Questions and Answers', url: 'https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers', line: "as long as there isn't an express or implied requirement that the reviews have to express a particular sentiment." },
  health: { name: 'FTC Health Products Compliance Guidance', url: 'https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance', line: 'the same legal principles apply to the marketing of any health-related product.' },
  aiAccuracy: { name: 'FTC - Order Requires Workado to Back Up Artificial Intelligence Detection Claims (Apr 2025)', url: 'https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-order-requires-workado-back-artificial-intelligence-detection-claims', line: 'unless it maintains competent and reliable evidence showing those products are as accurate as claimed' },
  aiComply: { name: 'FTC Announces Crackdown on Deceptive AI Claims and Schemes (Sep 2024)', url: 'https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes', line: 'there is no AI exemption from the laws on the books.' },
  security: { name: 'FTC - Start with Security: A Guide for Business', url: 'https://www.ftc.gov/business-guidance/resources/start-security-guide-business', line: 'When offering privacy and security features, ensure that your product lives up to your advertising claims.' },
  hipaaCert: { name: 'HHS - Are we required to "certify" our organization\'s compliance with the standards of the Security Rule?', url: 'https://www.hhs.gov/hipaa/for-professionals/faq/2003/are-we-required-to-certify-our-organizations-compliance-with-the-standards/index.html', line: 'HHS does not endorse or otherwise recognize private organizations’ “certifications” regarding the Security Rule.' },
  hipaaMarketing: { name: 'HHS - HIPAA Privacy Rule: Marketing', url: 'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/marketing/index.html', line: "the Rule requires an individual's written authorization before a use or disclosure of his or her protected health information can be made for marketing" },
  ferpa: { name: 'U.S. Department of Education - What is FERPA?', url: 'https://studentprivacy.ed.gov/faq/what-ferpa', line: 'the right to have some control over the disclosure of personally identifiable information from the education records.' },
  coppa: { name: 'FTC - Complying with COPPA: Frequently Asked Questions (N. COPPA and Schools)', url: 'https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions', line: "the school's ability to consent for the parent is limited to the educational context \u2013 where an operator collects personal information from students for the use and benefit of the school, and for no other commercial purpose" },
  gdprCert: { name: 'EDPB - Register of certification mechanisms, seals and marks', url: 'https://www.edpb.europa.eu/our-work-tools/accountability-tools/certification-mechanisms-seals-and-marks_en', line: '(page title; the register of approved schemes - check whether a named seal is listed there)' },
  free: { name: 'FTC - Guide Concerning Use of the Word "Free" and Similar Representations', url: 'https://www.ftc.gov/legal-library/browse/rules/guide-concerning-use-word-free-similar-representations', line: 'should be set forth clearly and conspicuously at the outset of the offer' },
  green: { name: 'FTC - Environmental Claims: Summary of the Green Guides', url: 'https://www.ftc.gov/business-guidance/resources/environmental-claims-summary-green-guides', line: 'Marketers should not make broad, unqualified general environmental benefit claims like "green" or "eco-friendly."' },
};

// What each verdict means. Never a legal verdict: these describe what to do next.
const VERDICTS = {
  'needs-proof': 'Needs proof',
  'needs-consent': 'Needs consent',
  'review-wording': 'Review wording',
  ok: 'OK - nothing flagged',
};
const ACTION_VERDICT = { proof: 'needs-proof', consent: 'needs-consent', wording: 'review-wording' };
const VERDICT_RANK = { 'needs-proof': 3, 'needs-consent': 2, 'review-wording': 1, ok: 0 };

const AI_MENTION = /\b(?:AI|A\.I\.|artificial intelligence|machine[- ]learning|LLMs?|GPT[\w.-]*|chatbot|copilot|algorithm|model|agent)\b/i;

// Claim types, in priority order: when two matches overlap, the earlier type keeps the words.
const TYPES = [
  {
    type: 'health', label: 'Health or clinical claim', action: 'proof',
    why: 'A claim that a product treats, prevents or improves a health condition is held to the health-claims standard: competent and reliable scientific evidence, often human clinical testing of the product itself.',
    keep: 'The study or studies behind the exact claim (design, population, endpoint, dates), who ran them, and the regulatory status if you mention one (for example the FDA clearance letter).',
    sources: ['health', 'substantiation'],
    res: [
      /\b(?:clinically|medically)\s+(?:proven|tested|validated|studied|backed|shown)\b/gi,
      /\bFDA[- ](?:approved|cleared|registered|listed)\b|\bFDA\s+(?:approval|clearance)\b/gi,
      /\b(?:cures?|cured|heals?|healing)\s+(?:\w+\s+){0,2}?(?:disease|illness|cancer|diabetes|depression|anxiety|pain|infections?|wounds?|injury|injuries|conditions?|disorders?|symptoms)\b/gi,
      /\b(?:treats?|treating|treatment\s+(?:of|for))\s+(?:\w+\s+){0,2}?(?:disease|illness|cancer|diabetes|depression|anxiety|insomnia|pain|ADHD|PTSD|obesity|hypertension|infections?|conditions?|disorders?|symptoms)\b/gi,
      /\bdiagnos(?:e|es|ing|is)\s+(?:of\s+)?(?:\w+\s+){0,2}?(?:disease|illness|cancer|diabetes|depression|conditions?|disorders?|infections?|sepsis|stroke|arrhythmias?)\b/gi,
      /\b(?:prevents?|preventing|reduces?|reducing|lowers?|lowering|cuts?)\s+(?:the\s+)?(?:risk\s+of\s+)?(?:\w+\s+)?(?:readmissions?|hospitali[sz]ations?|mortality|deaths?|falls|infections?|symptoms|pain|anxiety|depression|stress|blood pressure|cholesterol|A1c|HbA1c|complications|relapses?|sepsis|strokes?|heart attacks?|disease|illness)\b/gi,
      /\b(?:improves?|improving|better)\s+(?:\w+\s+)?(?:patient|health|clinical|medical)\s+outcomes\b/gi,
      /\b(?:boosts?|strengthens?)\s+(?:your\s+)?(?:immunity|immune\s+system|mental health|heart health|brain health|cognitive function|memory)\b/gi,
      /\b(?:medical|clinical|hospital|pharmaceutical)[- ]grade\b/gi,
      /\b(?:doctor|physician|clinician|dentist|dermatologist|nurse)[- ](?:recommended|approved|tested)\b/gi,
      /\bsafe\s+and\s+effective\b|\b(?:no|zero|without)\s+side[- ]effects\b/gi,
    ],
  },
  {
    type: 'ai', label: 'AI capability or accuracy claim', action: 'proof',
    why: 'Claims about what an AI product does, how accurate it is, or that it replaces people are ordinary advertising claims: they need evidence that the product performs as claimed, under the conditions a buyer will use it.',
    keep: 'The test behind each figure: data set, task, sample size, date, model version, and who ran it. For "AI-powered", a plain record of which feature uses which model. For "replaces", a side-by-side test against the people it is said to replace.',
    sources: ['aiAccuracy', 'aiComply', 'substantiation'],
    res: [
      /\b(?:AI|A\.I\.|artificial intelligence|machine[- ]learning|GenAI|generative AI|LLM|GPT)[- ](?:powered|driven|based|enabled|first|native|backed)\b/gi,
      /\bpowered\s+by\s+(?:AI|A\.I\.|artificial intelligence|machine learning|GPT[\w.-]*|LLMs?|generative AI|deep learning|neural networks?)\b/gi,
      /\b\d{1,3}(?:\.\d+)?\s?%\s+(?:accurate|accuracy|precision|recall|correct|precise)\b|\b(?:accuracy|precision|recall)\s+(?:of|rate of)\s+\d{1,3}(?:\.\d+)?\s?%/gi,
      /\b(?:replaces?|replacing|instead\s+of\s+hiring|no\s+need\s+(?:for|to\s+hire)|eliminates?\s+the\s+need\s+for|without\s+hiring)\s+(?:(?:your|a|an|the|entire|whole)\s+)*(?:\w+\s+){0,2}?(?:team|teams|lawyers?|attorneys?|accountants?|analysts?|SDRs?|BDRs?|developers?|engineers?|designers?|writers?|copywriters?|doctors?|radiologists?|teachers?|tutors?|recruiters?|agency|agencies|staff|humans?|people|employees|marketers?|experts?|consultants?)\b/gi,
      /\b(?:human|expert|doctor|physician|lawyer|teacher|PhD|clinician)[- ]level\b|\b(?:as\s+good\s+as|better\s+than|outperforms?)\s+(?:a\s+|an\s+)?(?:human|humans|experts?|doctors?|lawyers?|teachers?|radiologists?)\b/gi,
      /\b(?:no|zero|never)\s+hallucinat\w*|\bhallucination[- ]free\b|\bfully\s+autonomous\b|\b(?:unbiased|bias[- ]free)\b/gi,
    ],
    gated: [
      // Only when the sentence talks about AI, or the copy is for an AI product.
      /\b(?:understands|thinks|reasons)\s+(?:like\s+a\s+human|your\s+\w+|context|intent|emotions)\b/gi,
      /\b(?:accurate|accuracy)\b/gi,
    ],
  },
  {
    type: 'compliance', label: 'Compliance badge or certification', action: 'proof',
    why: 'A named standard or "compliant" / "certified" tells the buyer an obligation has been met or an audit passed. Some of these have no official certification at all, so the wording must match what you can show.',
    keep: 'The report, certificate or attestation, its scope (which product, which entities), its date and who issued it. For HIPAA, the safeguards and the signed business associate agreements; for FERPA and COPPA, the school agreements and data practices the claim rests on.',
    sources: ['substantiation'],
    res: [
      /\b(?:HIPAA|FERPA|COPPA|GDPR|CCPA|CPRA|PIPEDA|HITRUST|FedRAMP|StateRAMP|VPAT|SOC\s?[12](?:\s+Type\s+(?:II|I|1|2))?|ISO(?:\/IEC)?\s?2700[12]|ISO\s?27701|PCI[- ]?DSS|WCAG(?:\s?2(?:\.\d)?)?|Section\s508|Student Privacy Pledge)\b/g,
      /\b(?:fully\s+|100%\s+)?(?:compliant|certified|accredited)\b/gi,
    ],
  },
  {
    type: 'security', label: 'Security or privacy promise', action: 'proof',
    why: 'Security and privacy statements are product claims. If the safeguard is not in place, or the data is shared after all, the statement is what a buyer and a regulator will hold you to.',
    keep: 'The control behind each promise (encryption at rest and in transit, access controls, data-sharing list, retention policy), who verified it and when, and the privacy policy text that matches the copy.',
    sources: ['security'],
    res: [
      /\b(?:bank|military|enterprise|hospital)[- ]grade\s+(?:security|encryption)\b/gi,
      /\b(?:end[- ]to[- ]end\s+)?encrypt(?:ed|ion|s)?\b/gi,
      /\b(?:100%|completely|fully|totally|perfectly)\s+(?:secure|private|safe|anonymous|protected)\b/gi,
      /\b(?:data|information|records|files|details|PHI|PII|messages|conversations)\s+(?:is|are|stays?|remains?|will\s+(?:stay|remain|be)|kept|always)\s+(?:\w+\s+)?(?:safe|secure|private|protected|confidential)\b/gi,
      /\b(?:never|don't|do not|won't|will not)\s+(?:sell|share|rent|monetize)\s+(?:your\s+|any\s+|personal\s+|student\s+|patient\s+)?(?:data|information|details|PII)\b/gi,
      /\b(?:data|information|details|PII)\s+(?:is|are|will\s+be)\s+(?:never|not)\s+(?:sold|shared|rented)\b/gi,
      /\b(?:unhackable|breach[- ]proof|hack[- ]proof|anonymi[sz]ed|de[- ]identified|secure\s+by\s+design|privacy[- ]first|zero[- ]knowledge)\b/gi,
      /\bsecure\s+(?:platform|data|storage|cloud|infrastructure|hosting|login|portal|messaging|environment|app|system)\b/gi,
    ],
  },
  {
    type: 'reviews', label: 'Rating or review claim', action: 'proof',
    why: 'A star rating or review count is a factual claim about what real customers said. It must come from genuine reviews, not curated, bought or written by insiders.',
    keep: 'A dated screenshot or export of the rating at its source, the count it is based on, and how reviews were collected, including any incentive offered and that it did not depend on a positive review.',
    sources: ['reviews', 'endorsements'],
    res: [
      /\b[1-5](?:\.\d)?\s?(?:\/\s?5\b|out of 5\b|stars?\b)|\b(?:five|5)[- ]star\b|\brated\s+[1-5](?:\.\d)?(?:\s?(?:\/\s?5|out of 5|stars?))?\b/gi,
      /(?<![\w.,])\d[\d,]*\+?\s+(?:(?:five|5)[- ]star\s+)?(?:reviews|ratings)\b/gi,
      /\b(?:top|highest|best)[- ]rated\b/gi,
      /\b(?:on|from)\s+(?:G2|Capterra|Trustpilot|TrustRadius|Gartner Peer Insights|the App Store|Google Play|Product Hunt|Yelp)\b|\bG2\s+(?:Leader|High Performer|badge)\b/gi,
    ],
  },
  {
    type: 'endorsement', label: 'Testimonial, endorsement or influencer', action: 'consent',
    why: 'A testimonial, a named customer, a logo or a creator post speaks for someone else. It must reflect their honest experience, you need their permission to use it, and any payment or other connection must be disclosed.',
    keep: 'Written permission from the person or company (what may be used, where, until when), the original words, any payment, free product or relationship to disclose, and evidence that the result they describe is what buyers can generally expect - or a clear statement of what is typical.',
    sources: ['endorsements'],
    res: [
      /["“][^"”\n]{25,}["”]/g,
      /\b(?:trusted|loved|chosen|relied on|recommended|endorsed|praised)\s+by\b/gi,
      /\bused\s+by(?=\s+(?:over\s+|more than\s+)?(?:\d|teams|companies|thousands|hundreds|millions|leading|top|the world))/gi,
      /\bas\s+(?:seen|featured|heard)\s+(?:in|on)\b|\bfeatured\s+in\b/gi,
      /\b(?:customers|clients|users|teachers|parents|students|doctors|clinicians|patients|founders|marketers|reviewers)\s+(?:say|said|love|rave|agree|swear by|recommend|trust)\b/gi,
      /\b(?:customers|clients|partners)\s+include\b|\bjoin\s+(?:\w+\s+){0,3}?(?:teams|companies|schools|brands|founders|customers|marketers|educators|clinicians)\s+(?:at|like|from|including)\b/gi,
      /\b(?:ambassadors?|influencers?|brand partners?|paid partnership|sponsored)\b|(?:^|\s)#(?:ad|sponsored)\b/gi,
    ],
  },
  {
    type: 'establishment', label: '"Proven" or "studies show" claim', action: 'proof',
    why: 'Saying a claim is proven, tested or backed by research promises a specific level of evidence. You need at least the level of support the words imply.',
    keep: 'The study or test the wording points to: who ran it, when, the method, the sample, and the result that matches the words in the copy.',
    sources: ['substantiation'],
    res: [
      /\b(?:scientifically|statistically|independently)\s+(?:proven|tested|validated|verified)\b/gi,
      /\b(?:proven|tested and proven)\s+(?:to|results|method|methodology|framework|system|approach|formula|strategy|track record)\b/gi,
      /\b(?:studies|research|tests|trials|science)\s+(?:shows?|proves?|confirms?|demonstrates?)\b/gi,
      /\b(?:research|science|evidence)[- ](?:backed|based|proven)\b|\bpeer[- ]reviewed\b|\blab[- ]tested\b/gi,
    ],
  },
  {
    type: 'comparative', label: 'Comparison with a competitor or alternative', action: 'proof',
    why: 'Naming or implying a competitor invites the buyer, and the competitor, to check. A comparison is held to the same standard as any other claim: true, current and supported.',
    keep: 'The side-by-side behind the comparison: what was compared, on which version and plan, the source for the competitor facts, and the date it was last checked.',
    sources: ['comparative', 'adFaq'],
    res: [
      /\b(?:better|faster|cheaper|easier|smarter|safer|simpler|stronger|more\s+(?:accurate|affordable|reliable|secure|effective|powerful|flexible|intuitive|engaging)|less\s+expensive|lower[- ]cost)\s+than\b(?:\s+(?:\w+[-']?\w*)){0,2}/gi,
      /\b(?:unlike|compared\s+(?:to|with)|versus|vs\.?(?=\s)|outperforms?|outperforming|switch(?:ing)?\s+from|alternative\s+to)\s+(?:\w+[-']?\w*)(?:\s+(?:\w+[-']?\w*))?/gi,
      /\b(?:beats?|beating)\s+(?:the\s+)?(?:competition|competitors?|rivals?|alternatives?|incumbents?)\b/gi,
    ],
  },
  {
    type: 'superlative', label: 'Superlative or ranking', action: 'proof',
    why: '"Best", "#1", "leading" or "first" claims a ranking that can be checked. Without the ranking source, a buyer reads it as a fact you cannot show.',
    keep: 'Who ranked you, on what measure, among which set, and when - or reword it to the specific thing you can show.',
    sources: ['substantiation', 'adFaq'],
    res: [
      /\bbest(?:[- ]in[- ]class|[- ]selling|[- ]of[- ]breed)?\b(?![- ](?:practices?|fit|way|ways|of luck|regards|wishes|case|guess|efforts?|for you|suited|rated))/gi,
      /(?:^|[^\w])#\s?1\b|\bNo\.\s?1\b|\bnumber[- ]one\b/gi,
      /\b(?:industry|market|category|world|sector)[- ]leading\b|\b(?:the|a|an)\s+leading\s+(?:\w+\s+)?(?:provider|platform|solution|company|tool|vendor|brand|app|software|player|expert)s?\b/gi,
      /\b(?:world'?s|industry'?s|market'?s|category'?s|the)\s+first\b(?!\s+(?:step|steps|time|times|month|months|week|weeks|day|days|year|years|call|draft|thing|things|meeting|session|lesson|page|question|hire|\d))/gi,
      /\b(?:fastest|cheapest|easiest|smartest|safest|quickest|largest|biggest|fastest[- ]growing)\b|\bmost\s+(?:trusted|accurate|advanced|secure|powerful|popular|reliable|affordable|comprehensive|complete|loved|innovative|intuitive|effective|efficient|widely used|recommended)\b/gi,
      /\baward[- ]winning\b/gi,
    ],
  },
  {
    type: 'absolute', label: 'Absolute or guarantee', action: 'wording',
    why: '"Only", "guaranteed", "100%", "never" or "zero" can be disproved by a single counterexample. If it is not literally true every time, the wording overclaims.',
    keep: 'Either evidence that it holds every time (and the written terms, for a guarantee), or a narrower wording that says what you do and how you know.',
    sources: ['adFaq', 'substantiation'],
    res: [
      /(?<!\bnot\s)(?<!n't\s)\bthe\s+only\s+(?:[\w-]+\s+){0,2}?(?:platform|tool|solution|product|company|app|one|software|provider|vendor|system|service|way|option|choice|partner|agency|curriculum|program|device)s?\b/gi,
      /\b(?:only we|nobody else|no one else)\b|\bno\s+other\s+(?:\w+\s+)?(?:platform|tool|solution|product|company|app|software|provider|vendor)\b/gi,
      /(?<!money[- ]back\s)(?<!satisfaction\s)(?<!\d[- ]day\s)\bguarantee(?:d|s)?\b/gi,
      /(?<![\d.])100\s?%|\b100\s?percent\b|\bone hundred percent\b/gi,
      /\bnever\s+(?:miss|misses|lose|loses|fail|fails|worry|go(?:es)?\s+down|break|breaks|crash|crashes|forget|leak|leaks|again)\b/gi,
      /(?<!\bas\s)\balways\s+(?:on|accurate|available|right|compliant|secure|up|correct|works?|delivers?)\b/gi,
      /\bzero\s+(?:downtime|errors?|risk|bugs|data loss|false positives|churn|fees|breaches|mistakes|defects)\b|\b(?:error|bug|defect|mistake)[- ]free\b/gi,
      /\b(?:unmatched|unbeatable|unrivall?ed|unparalleled|flawless|foolproof)\b|\bperfect\s+(?:accuracy|results|record|score|uptime)\b|\binstant(?:ly)?\s+(?:results|ROI|growth|success|payback)\b/gi,
    ],
  },
  {
    type: 'offer', label: '"Free", "risk-free" or limited-time offer', action: 'wording',
    why: 'An offer is judged by what the buyer has to do to get it. Conditions, renewal terms and real deadlines belong next to the offer, not in the small print.',
    keep: 'The full terms as published (what is free, for how long, what happens at the end, any card or purchase required), and for a deadline or "only N left", the record that it is real.',
    sources: ['free', 'adFaq'],
    res: [
      /(?<![-\w])(?<!feel\s)(?<!toll\s)free\b(?![- ]?(?:form|text|time|flow|will|speech|lanc|up|to\b))/gi,
      /\b(?:risk|obligation)[- ]free\b|\bno[- ](?:risk|obligation|strings attached)\b|\bmoney[- ]back\b|\bsatisfaction\s+guaranteed?\b|\b\d+[- ]day\s+(?:guarantee|refund)\b|\bno\s+credit\s+card\b/gi,
      /\b(?:limited[- ]time|today only|this week only|last chance|act now|hurry)\b|\bends\s+(?:soon|today|tonight|at midnight|midnight|friday|sunday|monday|this week)\b|\bwhile\s+(?:supplies|spots|seats)\s+last\b|\bonly\s+\d+\s+(?:spots|seats|places|left|remaining)\b/gi,
      /(?<![\d.])\d{1,2}\s?%\s+off\b|\bsave\s+\d{1,2}\s?%/gi,
    ],
  },
  {
    type: 'environmental', label: 'Environmental claim', action: 'proof',
    why: 'Broad environmental claims such as "green" or "eco-friendly" are hard to substantiate; specific claims need specific evidence.',
    keep: 'The specific benefit and the evidence for it (energy source, offsets and their verification, material certifications), dated.',
    sources: ['green'],
    res: [
      /\b(?:eco[- ]friendly|environmentally[- ]friendly|planet[- ]friendly|carbon[- ](?:neutral|negative|free|zero)|net[- ]zero|climate[- ](?:positive|neutral)|biodegradable|compostable|recyclable|zero[- ]waste|non[- ]toxic)\b/gi,
      /\b(?:green|sustainable)\s+(?:hosting|cloud|energy|product|packaging|materials?|choice|company|brand|sourcing|infrastructure|data cent(?:er|re)s?)\b|\b(?:100%|fully|truly)\s+(?:green|sustainable|renewable)\b/gi,
    ],
  },
  {
    type: 'outcome', label: 'Result or outcome claim', action: 'proof',
    why: 'A promise of a result (more revenue, better scores, less churn) is the claim a buyer is paying for. It needs evidence that the product causes it for buyers like them, not only for your best customer.',
    keep: 'The data behind the result: which customers, how many, over what period, measured how, and what else changed at the time. If it is one customer\'s result, say so in the copy.',
    sources: ['adFaq', 'substantiation'],
    res: [
      /\b(?:increase[sd]?|boost(?:s|ed)?|grow(?:s|n)?|double[sd]?|triple[sd]?|improve[sd]?|raise[sd]?|lift(?:s|ed)?|cut(?:s)?|reduce[sd]?|lower(?:s|ed)?|slash(?:es|ed)?|eliminate[sd]?|drive[sd]?|deliver(?:s|ed)?|accelerate[sd]?|maximi[sz]e[sd]?|multipl(?:y|ies|ied)|halve[sd]?)\s+(?:[\w'-]+\s+){0,4}?(?:revenue|sales|pipeline|bookings|ARR|MRR|conversions?|conversion rates?|leads|sign-?ups|demos|meetings booked|churn|retention|costs?|CAC|spend|ROI|ROAS|profits?|margins?|productivity|efficiency|engagement|open rates?|click[- ]through rates?|CTR|traffic|rankings|reading (?:scores|levels|fluency|comprehension)|test scores|math scores|scores|grades|learning outcomes|outcomes|attendance|graduation rates?|completion rates?|enrollments?|readmissions?|no[- ]shows|wait times|burnout|turnover|downtime|errors|mistakes|time[- ]to[- ](?:hire|value|close|market)|sales cycles?|response times?)\b/gi,
      /\b(?:save[sd]?|saving|cut(?:s)?|reduce[sd]?|shorten(?:s|ed)?|halve[sd]?|slash(?:es|ed)?)\s+(?:[A-Za-z'-]+\s+){0,2}?(?:time|hours|days|weeks|admin|paperwork)\b/gi,
      /\b(?:more|higher|better|bigger|faster)\s+(?:qualified\s+)?(?:revenue|sales|pipeline|leads|deals|customers|meetings|replies|conversions|grades|scores|test scores|outcomes|ROI|retention|engagement|results)\b|\b(?:fewer|lower|less)\s+(?:churn|costs?|errors|no[- ]shows|readmissions)\b/gi,
    ],
  },
  {
    type: 'number', label: 'Specific number, percentage or multiplier', action: 'proof',
    why: 'A specific figure reads as measured fact. It needs the measurement behind it, and the copy should say what it is a figure of.',
    keep: 'The calculation and its inputs: the data source, the sample, the period, the baseline, and the date the figure was last checked.',
    sources: ['substantiation', 'adFaq'],
    res: [
      /(?<![\d.,])(?!100\s?%)(?!100\s?percent)\d{1,3}(?:[.,]\d+)?\s?(?:%|percent\b)/gi,
      /(?<![\w.])\d+(?:\.\d+)?\s?[x×](?!\w)|\b(?:two|three|four|five|six|seven|eight|nine|ten|twice|\d+)\s+times\s+(?:faster|more|better|higher|lower|cheaper|less|as\s+\w+)\b|\b(?:doubled|tripled|quadrupled|halved)\b/gi,
      /(?<![\w.,$])(?<!(?:up to|for|per|max|maximum|limit of|includes?|seats? for)\s)\d[\d,]*(?:\.\d+)?\s?(?:k|m|million|billion|thousand)?\+?\s+(?:(?:happy|active|paying|enterprise|satisfied|new)\s+)?(?:customers|clients|users|teams|companies|businesses|brands|organizations|schools|districts|students|learners|teachers|educators|patients|clinicians|providers|hospitals|clinics|members|downloads|installs|signups|countries|marketers|founders|startups|agencies)\b/gi,
      /\b(?:in|within|under|less than|saves?|saved|saving|cuts?|by)\s+(?:just\s+|only\s+|over\s+|up to\s+)?\d[\d,.]*\s?(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\b|\b\d[\d,.]*\s?(?:hours?|hrs?|minutes?|days?|weeks?)\s+(?:saved|faster|sooner|less|back)\b/gi,
      /\b(?:save[sd]?|saving|generated?|generating|added|adds|drove|drives|driving|unlock(?:ed|s)?|recover(?:ed|s)?|earn(?:ed|s)?|made)\s+(?:over\s+|up to\s+|more than\s+|an extra\s+|an average of\s+)?\$\s?\d[\d,.]*\s?(?:k|m|b|million|billion)?\b|\$\s?\d[\d,.]*\s?(?:k|m|b|million|billion)?\+?\s+(?:in|of)\s+(?:new\s+)?(?:revenue|pipeline|savings|ARR|MRR|sales|bookings|funding)\b/gi,
    ],
  },
];
const TYPE_BY_ID = {};
TYPES.forEach((t) => { TYPE_BY_ID[t.type] = t; });

// Audience notes: added to the matching flag, with the guidance that applies.
function audienceNotes(type, audience, sentence, phrases) {
  const all = phrases.join(' ');
  const out = { keep: [], sources: [] };
  const add = (k, s) => { if (k) out.keep.push(k); if (s) out.sources.push(s); };
  if (type === 'compliance') {
    if (/HIPAA/i.test(all)) add('HHS does not recognise private "HIPAA certifications"; keep what you actually do (risk analysis, safeguards, signed business associate agreements) and word the claim to match.', 'hipaaCert');
    if (/FERPA/i.test(all)) add('FERPA governs schools’ education records; keep the school agreements that set how you may use student data.', 'ferpa');
    if (/COPPA/i.test(all)) add('For a service used by children under 13, keep how you obtain parental consent, or the school consent you rely on and its limits.', 'coppa');
    if (/GDPR/i.test(all)) add('A GDPR certification is a named, approved scheme; if you hold none, describe the measures instead of a badge.', 'gdprCert');
    if (/SOC\s?[12]|ISO|PCI|HITRUST|FedRAMP|StateRAMP/i.test(all)) add('The current report or certificate, its period and scope.', 'security');
  }
  if (type === 'endorsement') {
    if (audience === 'medtech' || /\bpatients?\b/i.test(sentence)) add('If the person is a patient and you are a HIPAA covered entity or business associate, their written HIPAA authorization to use their information in marketing.', 'hipaaMarketing');
    if (audience === 'edtech' || /\b(?:students?|pupils?|kids|children|learners)\b/i.test(sentence)) add('For a student under 18, permission from a parent or guardian; keep anything drawn from education records out of the copy unless the school agreement allows it.', 'ferpa');
  }
  if (type === 'security' && (audience === 'edtech' || /\b(?:students?|kids|children|under 13)\b/i.test(sentence))) add('If children under 13 use the product, the COPPA consent you rely on and its limits.', 'coppa');
  if (type === 'security' && (audience === 'medtech' || /\b(?:patients?|PHI|health data)\b/i.test(sentence))) add('', 'hipaaCert');
  if (type === 'outcome' && (audience === 'edtech' || /\b(?:scores|grades|reading|learning)\b/i.test(all))) add('For learning results: the study design (comparison group, sample, grade levels, test used, time period).', null);
  if (type === 'outcome' && (audience === 'medtech' || /\breadmissions?\b/i.test(all))) add('For a health outcome, the clinical evidence standard applies - see the health guidance.', 'health');
  if (type === 'comparative' && audience === 'ai' && /\b(?:human|expert|doctor|lawyer|teacher)s?\b/i.test(all)) add('A comparison with people needs a test against people doing the same task.', 'aiComply');
  return out;
}

const ABBREV = /\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Corp|St|Jr|Sr|approx|No|U\.S|U\.K|a\.m|p\.m)\./g;

function splitSentences(text) {
  const out = [];
  String(text).replace(/\r\n?/g, '\n').split(/\n+/).forEach((line) => {
    const clean = line.replace(/^\s*(?:[-*•–—>]|\d+[.)])\s+/, '').trim();
    if (!clean) return;
    const guarded = clean.replace(ABBREV, (m) => m.replace(/\./g, '\u0000'));
    guarded.replace(/([.!?…]+["'”’)\]]*)\s+(?=["'\u201c(\[]?[A-Z0-9#$])/g, '$1\u0001')
      .split('\u0001')
      .map((s) => s.replace(/\u0000/g, '.').trim())
      .filter(Boolean)
      .forEach((s) => out.push(s));
  });
  return out;
}

function overlaps(a, list) {
  return list.some((b) => a[0] < b[1] && b[0] < a[1]);
}

function scanSentence(s, audience) {
  const claimed = [];
  const found = [];
  const aiContext = audience === 'ai' || AI_MENTION.test(s);
  TYPES.forEach((t) => {
    const res = t.res.concat(t.gated && aiContext ? t.gated : []);
    const spans = [];
    res.forEach((re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        let start = m.index, txt = m[0];
        const lead = txt.length - txt.replace(/^[^\w"“#$]+/, '').length;
        start += lead; txt = txt.slice(lead).replace(/\s+$/, '');
        let prev;
        do { prev = txt; txt = txt.replace(/[\s,;:]+(?:and|or|but|for|with|in|on|at|to|of|the|a|an)$/i, '').replace(/[\s,;:]+$/, ''); } while (txt !== prev);
        const span = [start, start + txt.length];
        if (overlaps(span, claimed) || overlaps(span, spans)) continue;
        spans.push(span);
      }
    });
    if (spans.length) {
      spans.sort((a, b) => a[0] - b[0]);
      spans.forEach((sp) => claimed.push(sp));
      found.push({ t, spans });
    }
  });
  return found;
}

function norm(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function check(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) die('Config must be a JSON object.');
  if (typeof cfg.text !== 'string' || !cfg.text.trim()) die('Give "text": the marketing copy to check.', 'Paste a page, an ad or an email as one string.');
  if (cfg.text.length > MAX_CHARS) die(`"text" is ${cfg.text.length} characters; the limit is ${MAX_CHARS}. Check one page at a time.`);
  const audience = cfg.audience === undefined || cfg.audience === '' ? 'general' : String(cfg.audience).toLowerCase();
  if (AUDIENCES.indexOf(audience) < 0) die(`"audience" must be one of: ${AUDIENCES.join(', ')}.`);
  if (cfg.evidenceOnFile !== undefined && !Array.isArray(cfg.evidenceOnFile)) die('"evidenceOnFile" must be a list of flag ids or notes.');
  const evidence = (cfg.evidenceOnFile || []).filter((e) => typeof e === 'string' && e.trim()).map((e) => e.trim());
  const used = {};

  const texts = splitSentences(cfg.text);
  if (!texts.length) die('No sentences found in "text".');

  const sentences = [];
  const flags = [];
  texts.forEach((s, i) => {
    const n = i + 1;
    const ids = [];
    let verdict = 'ok';
    let onFileCount = 0;
    scanSentence(s, audience).forEach(({ t, spans }) => {
      const phrases = [];
      spans.forEach((sp) => { const p = s.slice(sp[0], sp[1]); if (phrases.indexOf(p) < 0) phrases.push(p); });
      const id = `s${n}-${t.type}`;
      const extra = audienceNotes(t.type, audience, s, phrases);
      const srcKeys = [];
      t.sources.concat(extra.sources).forEach((k) => { if (k && srcKeys.indexOf(k) < 0) srcKeys.push(k); });
      let ev = null;
      evidence.forEach((e) => {
        if (ev) return;
        const ne = norm(e);
        if (ne === id || phrases.some((p) => norm(p).length >= 3 && ne.indexOf(norm(p)) >= 0)) { ev = e; used[e] = true; }
      });
      let why = t.why;
      if (t.type === 'comparative') {
        const named = phrases.map((p) => (p.match(/\b(?:[Tt]han|[Uu]nlike|[Vv]ersus|[Vv]s\.?|[Tt]o|[Ww]ith|[Ff]rom|[Oo]utperforms?)\s+((?:[A-Z][\w&.-]*)(?:\s+[A-Z][\w&.-]*)?)/) || [])[1]).filter((x) => x && !/^(?:The|Other|Most|Any|Our|Your|Their|Traditional|Legacy|Manual)$/.test(x));
        why += named.length ? ` Named here: ${named.join(', ')}.` : ' The competitor is implied, not named - the buyer will fill in a name.';
      }
      const action = t.action;
      flags.push({
        id, n, type: t.type, label: t.label, action, verdict: ACTION_VERDICT[action],
        text: phrases.join(' · '), phrases, spans, sentence: s,
        why, keep: [t.keep].concat(extra.keep).join(' '),
        sources: srcKeys.map((k) => SOURCES[k]),
        onFile: !!ev, evidence: ev,
      });
      ids.push(id);
      if (ev) onFileCount++;
      else if (VERDICT_RANK[ACTION_VERDICT[action]] > VERDICT_RANK[verdict]) verdict = ACTION_VERDICT[action];
    });
    sentences.push({ n, text: s, verdict, label: verdict === 'ok' && onFileCount ? 'OK - evidence noted' : VERDICTS[verdict], flags: ids, onFile: onFileCount });
  });

  const count = (v) => sentences.filter((x) => x.verdict === v).length;
  const byType = {};
  flags.forEach((f) => { byType[f.type] = (byType[f.type] || 0) + 1; });
  const summary = {
    sentences: sentences.length,
    needsProof: count('needs-proof'),
    needsConsent: count('needs-consent'),
    reviewWording: count('review-wording'),
    ok: count('ok'),
    flags: flags.length,
    open: flags.filter((f) => !f.onFile).length,
    onFile: flags.filter((f) => f.onFile).length,
    byType,
  };
  return {
    audience, sentences, flags, summary,
    unmatchedEvidence: evidence.filter((e) => !used[e]),
    disclaimer: DISCLAIMER,
  };
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  const s = r.summary;
  L.push('');
  L.push(`AAJ - CLAIMS & PROOF CHECK (audience: ${r.audience})`);
  L.push('-'.repeat(66));
  L.push(`  ${s.sentences} sentences: ${s.needsProof} need proof, ${s.needsConsent} need consent, ${s.reviewWording} to review wording, ${s.ok} with nothing flagged.`);
  L.push(`  ${s.flags} flags, ${s.open} open, ${s.onFile} with evidence noted as on file.`);
  L.push('');
  L.push('  ' + r.disclaimer);
  r.sentences.forEach((x) => {
    L.push('');
    L.push(`[${x.n}] ${x.label.toUpperCase()}  "${x.text}"`);
    r.flags.filter((f) => f.n === x.n).forEach((f) => {
      L.push(`    ${f.onFile ? 'on file' : f.action.padEnd(7)}  ${f.label}: "${f.text}"   (${f.id})`);
      if (f.onFile) { L.push(`             evidence: ${f.evidence}`); return; }
      L.push(`             why:  ${f.why}`);
      L.push(`             keep: ${f.keep}`);
      f.sources.forEach((src) => L.push(`             see:  ${src.name} - ${src.url}`));
    });
  });
  if (r.unmatchedEvidence.length) {
    L.push('');
    L.push('EVIDENCE NOTES THAT MATCHED NO FLAG');
    r.unmatchedEvidence.forEach((e) => L.push('  - ' + e));
  }
  L.push('');
  L.push(r.disclaimer);
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Fictional copy for an invented product. Example inputs, not real claims or results.
const DEMO = {
  audience: 'ai',
  text: [
    'Meet Quillo, the AI-powered proposal writer for agencies.',
    'Quillo is 99% accurate and replaces your entire proposal team.',
    'Teams using Quillo win 3x more deals and cut proposal time in half.',
    'Unlike Loopdeck, every draft is checked against your past wins.',
    '"Quillo paid for itself in the first month." - Dana R., Head of Growth',
    'Rated 4.9 out of 5 from 1,200 reviews.',
    'SOC 2 Type II certified, with bank-grade encryption.',
    'Start your free trial today - no credit card required.',
    'Set up takes about an hour with your own templates.',
  ].join('\n'),
  evidenceOnFile: ['s6-reviews', 'SOC 2 Type II: report dated 2026-06-30, covers production'],
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: fictional copy for an invented AI product; two items noted as on file)');
  }
  try {
    console.log(render(check(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { check, splitSentences, TYPES, SOURCES, AUDIENCES, DISCLAIMER, VERDICTS };
