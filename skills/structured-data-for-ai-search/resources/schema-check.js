#!/usr/bin/env node
/*
 * AAJ Structured Data for AI Search - JSON-LD checker
 * Part of the "structured-data-for-ai-search" Agent Skill.
 *
 * Checks the JSON-LD on one page against the type you say the page is:
 * Google Search Central's required and recommended properties for that type
 * (where Google documents it), schema.org's definitions (where Google does not),
 * dates and structure, and - when you supply the page's visible text - whether
 * the markup says anything the page does not show. Every finding names its source.
 *
 * USAGE
 *   node schema-check.js                 # demo
 *   node schema-check.js '<json-config>' # your own
 *   node schema-check.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "pageType": "software",      // software | product | organization | faq | howto | article | breadcrumb
 *                                  // (aliases: saas, app, home, about, blog, post, faqpage, breadcrumblist...)
 *                                  // omit to check every node found
 *     "jsonld": { ... } | [ ... ] | "<json string>" | "<html with ld+json scripts>",
 *     "html": "<!doctype html>...",  // optional: the page HTML; ld+json AND visible text are read from it
 *     "visibleText": "...",          // optional: the page's visible text, if you have it without HTML
 *     "today": "2026-10-10"          // optional: for future-date checks (default: today)
 *   }
 *
 * GENERATE - the fix step: build JSON-LD, meta tags and an llms.txt from your own facts,
 * then check what was built (against your page text, if you give it):
 *
 *   { "generate": {
 *       "pageType": "home",                  // home | software | product | article | other
 *       "url": "https://example.com/",       // the page's full address (required)
 *       "title": "...", "description": "...", "image": "https://...", "siteName": "...",
 *       "organization": { "name", "url", "logo", "description", "sameAs": [] },        // home
 *       "software": { "name", "description", "applicationCategory", "operatingSystem",
 *                     "price", "priceCurrency", "ratingValue", "ratingCount" },        // software
 *       "product": { "name", "description", "image", "brand", "sku", "price",
 *                    "priceCurrency", "availability", "ratingValue", "ratingCount" }, // product
 *       "article": { "headline", "authorName", "authorUrl", "authorType", "datePublished",
 *                    "dateModified", "image", "publisherName" },                       // article
 *       "breadcrumbs": [ { "name", "url" } ],                                          // any page
 *       "llms": { "name", "summary", "details", "sections": [ { "title", "links": [ { "title", "url", "note" } ] } ] },
 *       "html": "..." | "visibleText": "..."  // optional: the page, to check the markup against
 *   }, "today": "2026-10-29" }
 *
 *   It marks up only what you enter: no rating without a value and a count, no price you didn't
 *   give. FAQ and HowTo are not generated: Google no longer shows those rich results.
 *
 * LEVELS
 *   fix          the markup is broken, or says something the page does not show
 *   eligibility  valid markup, but missing a property Google requires for that rich result
 *   improve      a recommended property is missing
 *   info         context (e.g. a rich result Google no longer shows)
 *
 * Sources are the pages opened on 2026-10-10: Google Search Central structured data
 * docs (software-app, product-snippet, review-snippet, organization, article,
 * breadcrumb, sd-policies, ai-features, documentation changelog) and schema.org type
 * pages. Google changes these pages; re-check the source URL each finding cites.
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

'use strict';

/* aaj:core:begin - the JSON-LD checking core. If a browser tool ever embeds
   this engine, copy this block verbatim and guard it byte for byte. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

const G = 'https://developers.google.com/search/docs/appearance/';
const SRC = {
  software: G + 'structured-data/software-app',
  product: G + 'structured-data/product-snippet',
  review: G + 'structured-data/review-snippet',
  organization: G + 'structured-data/organization',
  article: G + 'structured-data/article',
  breadcrumb: G + 'structured-data/breadcrumb',
  policies: G + 'structured-data/sd-policies',
  aiFeatures: G + 'ai-features',
  changelog: 'https://developers.google.com/search/updates',
  sSoftware: 'https://schema.org/SoftwareApplication',
  sHowTo: 'https://schema.org/HowTo',
  sHowToStep: 'https://schema.org/HowToStep',
  sWebPage: 'https://schema.org/WebPage',
  sAccepted: 'https://schema.org/acceptedAnswer',
  sArticle: 'https://schema.org/Article',
  sOrganization: 'https://schema.org/Organization',
  sBreadcrumb: 'https://schema.org/BreadcrumbList',
};

// Page types and the schema.org @type values that satisfy them.
const KINDS = {
  software: { label: 'SoftwareApplication', types: ['SoftwareApplication', 'WebApplication', 'MobileApplication', 'VideoGame'] },
  product: { label: 'Product', types: ['Product'] },
  organization: { label: 'Organization', types: ['Organization', 'Corporation', 'OnlineBusiness'] },
  faq: { label: 'FAQPage', types: ['FAQPage'] },
  howto: { label: 'HowTo', types: ['HowTo'] },
  article: { label: 'Article', types: ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle', 'Report'] },
  breadcrumb: { label: 'BreadcrumbList', types: ['BreadcrumbList'] },
};
const ALIASES = {
  software: 'software', softwareapplication: 'software', webapplication: 'software', saas: 'software', app: 'software', pricing: 'software',
  product: 'product',
  organization: 'organization', organisation: 'organization', org: 'organization', home: 'organization', homepage: 'organization', about: 'organization',
  faq: 'faq', faqpage: 'faq',
  howto: 'howto', 'how-to': 'howto', guide: 'howto',
  article: 'article', blog: 'article', blogposting: 'article', post: 'article', newsarticle: 'article',
  breadcrumb: 'breadcrumb', breadcrumbs: 'breadcrumb', breadcrumblist: 'breadcrumb',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const has = (v) => (Array.isArray(v) ? v.length > 0 : isObj(v) ? Object.keys(v).length > 0 : str(v) !== '');
const typesOf = (n) => list(n && n['@type']).map((t) => String(t).replace(/^https?:\/\/schema\.org\//, ''));
const isType = (n, kind) => typesOf(n).some((t) => KINDS[kind].types.includes(t) || (kind === 'organization' && /Organization$/.test(t)));

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function htmlToText(html) {
  return decodeEntities(String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '));
}
function extractLd(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html)))) out.push(m[1]);
  return out;
}
// Lower-case, straighten quotes, keep letters and digits, collapse spaces.
function norm(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, ' '))
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
function visibleHas(textNorm, value, maxChars) {
  let v = norm(value);
  if (!v) return true;
  if (maxChars && v.length > maxChars) v = v.slice(0, maxChars).replace(/\s\S*$/, '');
  return (' ' + textNorm + ' ').includes(' ' + v + ' ');
}
function priceVisible(textNorm, price) {
  const p = Number(String(price).replace(/,/g, ''));
  if (!Number.isFinite(p)) return true;
  if (p === 0) return /\bfree\b|\b0\b/.test(textNorm);
  const whole = Math.floor(p);
  const cents = Math.round((p - whole) * 100);
  const forms = [String(whole), whole.toLocaleString('en-US').replace(/,/g, ' ')];
  if (cents) forms.unshift(`${whole} ${String(cents).padStart(2, '0')}`);
  return forms.some((f) => (' ' + textNorm + ' ').includes(' ' + f + ' '));
}
function parseIsoDate(v) {
  const s = str(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

function collectNodes(blocks, findings) {
  const nodes = [];
  blocks.forEach((b, bi) => {
    let data = b;
    if (typeof b === 'string') {
      try { data = JSON.parse(b); }
      catch (e) {
        findings.push({ level: 'fix', id: 'parse-error', path: `block ${bi + 1}`, text: `JSON-LD block ${bi + 1} is not valid JSON (${e.message}). Search engines skip a block they cannot parse.`, source: SRC.policies });
        return;
      }
    }
    list(data).forEach((top, ti) => {
      if (!isObj(top)) return;
      const ctx = top['@context'];
      const ctxOk = list(ctx).some((c) => (typeof c === 'string' && /^https?:\/\/schema\.org\/?$/.test(c.trim())) || (isObj(c) && /^https?:\/\/schema\.org\/?$/.test(str(c['@vocab']))));
      const graph = Array.isArray(top['@graph']) ? top['@graph'] : null;
      if (!ctxOk) findings.push({ level: 'fix', id: 'context', path: `block ${bi + 1}`, text: `Block ${bi + 1} has no schema.org "@context" (found ${JSON.stringify(ctx === undefined ? null : ctx)}). Set "@context": "https://schema.org".`, source: SRC.policies });
      const members = graph ? graph : [top];
      members.forEach((n, ni) => {
        if (!isObj(n)) return;
        const path = graph ? `block ${bi + 1} @graph[${ni}]` : `block ${bi + 1}${Array.isArray(data) ? `[${ti}]` : ''}`;
        if (!typesOf(n).length) {
          findings.push({ level: 'fix', id: 'no-type', path, text: `${path} has no "@type", so nothing can tell what it describes.`, source: SRC.policies });
          return;
        }
        nodes.push({ node: n, path });
      });
    });
  });
  return nodes;
}

function checkRating(n, path, add, textNorm) {
  if (has(n.aggregateRating)) {
    const ar = isObj(n.aggregateRating) ? n.aggregateRating : {};
    if (!has(ar.ratingValue)) add('fix', 'rating-no-value', `${path}.aggregateRating`, 'aggregateRating has no ratingValue. Google\'s review snippet docs require it.', SRC.review);
    if (!has(ar.ratingCount) && !has(ar.reviewCount)) add('fix', 'rating-no-count', `${path}.aggregateRating`, 'aggregateRating needs ratingCount or reviewCount (Google: "At least one of ratingCount or reviewCount is required").', SRC.review);
    if (textNorm !== null && has(ar.ratingValue) && !visibleHas(textNorm, ar.ratingValue)) {
      add('fix', 'rating-not-visible', `${path}.aggregateRating`, `The rating ${str(ar.ratingValue)} does not appear in the page text. Google: "Don't mark up content that is not visible to readers of the page." Show the rating and its count on the page, or remove the markup.`, SRC.policies);
    }
  }
  list(n.review).forEach((rv, i) => {
    if (!isObj(rv)) return;
    if (!has(rv.author)) add('fix', 'review-no-author', `${path}.review[${i}]`, 'A review has no author. Google\'s review snippet docs require it.', SRC.review);
    if (!isObj(rv.reviewRating) || !has(rv.reviewRating.ratingValue)) add('fix', 'review-no-rating', `${path}.review[${i}]`, 'A review has no reviewRating.ratingValue. Google\'s review snippet docs require it.', SRC.review);
  });
}

function priceOf(offer) {
  if (!isObj(offer)) return null;
  if (has(offer.price)) return str(offer.price);
  if (isObj(offer.priceSpecification) && has(offer.priceSpecification.price)) return str(offer.priceSpecification.price);
  return null;
}

const CHECKS = {
  software(n, path, add, textNorm) {
    if (!has(n.name)) add('fix', 'no-name', path, 'No "name". Google lists name as required for software app markup.', SRC.software);
    else if (textNorm !== null && !visibleHas(textNorm, n.name)) add('fix', 'name-not-visible', path, `The name "${str(n.name)}" does not appear in the page text.`, SRC.policies);
    const offers = list(n.offers);
    const prices = offers.map(priceOf).filter((p) => p !== null);
    if (!offers.length) add('eligibility', 'no-offers', path, 'No "offers". Google requires offers.price for software app rich results; set price to 0 for a free app.', SRC.software);
    else if (!prices.length) {
      const low = offers.some((o) => isObj(o) && has(o.lowPrice));
      add('eligibility', 'no-price', `${path}.offers`, low ? 'offers has lowPrice but no price. Google\'s software app docs ask for offers.price.' : 'offers has no price. Google requires offers.price (0 for a free app).', SRC.software);
    } else if (textNorm !== null) {
      prices.forEach((p) => { if (!priceVisible(textNorm, p)) add('fix', 'price-not-visible', `${path}.offers`, `The price ${p} does not appear in the page text. Mark up the price the page shows.`, SRC.policies); });
    }
    if (!has(n.aggregateRating) && !has(n.review)) {
      add('eligibility', 'no-rating', path, 'Neither aggregateRating nor review. Google requires one of them for software app rich results. Add one only if real ratings are shown on this page; otherwise accept no software rich result rather than invent one.', SRC.software);
    }
    checkRating(n, path, add, textNorm);
    if (!has(n.applicationCategory)) add('improve', 'no-category', path, 'No applicationCategory (Google recommends it, as a supported app type such as BusinessApplication).', SRC.software);
    if (!has(n.operatingSystem)) add('improve', 'no-os', path, 'No operatingSystem (Google recommends it: the operating system(s) required to use the app).', SRC.software);
  },

  product(n, path, add, textNorm) {
    if (!has(n.name)) add('fix', 'no-name', path, 'No "name". Google lists name as required for product snippets.', SRC.product);
    else if (textNorm !== null && !visibleHas(textNorm, n.name)) add('fix', 'name-not-visible', path, `The name "${str(n.name)}" does not appear in the page text.`, SRC.policies);
    if (!has(n.review) && !has(n.aggregateRating) && !has(n.offers)) add('eligibility', 'no-review-rating-offer', path, 'Product snippets require one of review, aggregateRating or offers.', SRC.product);
    list(n.offers).forEach((o, i) => {
      if (!isObj(o)) return;
      const p = priceOf(o);
      if (p === null && !has(o.lowPrice)) add('eligibility', 'offer-no-price', `${path}.offers[${i}]`, 'An Offer has no price (or priceSpecification.price), which Google requires.', SRC.product);
      if (p !== null && !has(o.priceCurrency)) add('improve', 'offer-no-currency', `${path}.offers[${i}]`, 'An Offer has no priceCurrency, which Google recommends for product snippets.', SRC.product);
      if (p !== null && textNorm !== null && !priceVisible(textNorm, p)) add('fix', 'price-not-visible', `${path}.offers[${i}]`, `The price ${p} does not appear in the page text.`, SRC.policies);
    });
    checkRating(n, path, add, textNorm);
  },

  organization(n, path, add, textNorm) {
    // Google: "There are no required properties"; everything below is recommended.
    [['name', 'name'], ['url', 'url'], ['logo', 'logo'], ['sameAs', 'sameAs (your official profiles)'], ['description', 'description']].forEach(([k, label]) => {
      if (!has(n[k])) add('improve', 'org-no-' + k.toLowerCase(), path, `No ${label}. Google has no required Organization properties but recommends adding the relevant ones.`, SRC.organization);
    });
    if (has(n.url) && !/^https?:\/\//.test(str(n.url))) add('fix', 'org-url-relative', path, `url "${str(n.url)}" is not an absolute URL.`, SRC.sOrganization);
    const logo = isObj(n.logo) ? str(n.logo.url || n.logo.contentUrl) : str(n.logo);
    if (has(n.logo) && !/^https?:\/\//.test(logo)) add('fix', 'org-logo-url', path, 'logo is not an absolute image URL (or ImageObject with a url).', SRC.sOrganization);
    if (has(n.name) && textNorm !== null && !visibleHas(textNorm, n.name)) add('fix', 'name-not-visible', path, `The name "${str(n.name)}" does not appear in the page text.`, SRC.policies);
    if (has(n.aggregateRating) || has(n.review)) {
      add('info', 'org-self-serving', path, 'Organization markup carries ratings or reviews. Google: if the entity controls the reviews about itself, pages using Organization markup are ineligible for the star review feature.', SRC.review);
      checkRating(n, path, add, textNorm);
    }
  },

  faq(n, path, add, textNorm) {
    add('info', 'faq-retired', path, 'Google stopped showing FAQ rich results on 7 May 2026 and removed the FAQ documentation on 15 June 2026. The markup is still valid schema.org; keep it only where it mirrors a visible FAQ, and expect no Google appearance from it.', SRC.changelog);
    const qs = list(n.mainEntity);
    if (!qs.length) { add('fix', 'faq-empty', path, 'FAQPage has no mainEntity, so it lists no questions.', SRC.sWebPage); return; }
    qs.forEach((q, i) => {
      const qp = `${path}.mainEntity[${i}]`;
      if (!isObj(q) || !typesOf(q).includes('Question')) { add('fix', 'faq-not-question', qp, 'An entry in mainEntity is not a Question.', SRC.sAccepted); return; }
      if (!has(q.name)) add('fix', 'faq-no-question-text', qp, 'A Question has no name (the question text).', SRC.sAccepted);
      const a = list(q.acceptedAnswer)[0];
      const aText = isObj(a) ? str(a.text) : '';
      if (!aText) add('fix', 'faq-no-answer', qp, 'A Question has no acceptedAnswer with text.', SRC.sAccepted);
      if (textNorm !== null) {
        if (has(q.name) && !visibleHas(textNorm, q.name)) add('fix', 'faq-q-not-visible', qp, `The question "${str(q.name).slice(0, 80)}" is not in the page text. Mark up only the FAQ readers can see.`, SRC.policies);
        if (aText && !visibleHas(textNorm, aText, 120)) add('fix', 'faq-a-not-visible', qp, 'An answer does not match the page text. The marked-up answer must be the one readers see.', SRC.policies);
      }
    });
  },

  howto(n, path, add, textNorm) {
    add('info', 'howto-retired', path, 'Google removed its How-to documentation on 14 September 2023, as the rich result "is no longer shown in search results, on both desktop and mobile devices". The markup is still valid schema.org.', SRC.changelog);
    if (!has(n.name)) add('improve', 'howto-no-name', path, 'No name: say what the instructions achieve.', SRC.sHowTo);
    const steps = list(n.step);
    if (!steps.length) { add('fix', 'howto-no-steps', path, 'HowTo has no step, so it describes no instructions.', SRC.sHowTo); return; }
    steps.forEach((s, i) => {
      const sp = `${path}.step[${i}]`;
      if (typeof s === 'string') { if (textNorm !== null && !visibleHas(textNorm, s, 120)) add('fix', 'howto-step-not-visible', sp, 'A step is not in the page text.', SRC.policies); return; }
      if (!isObj(s)) return;
      const t = typesOf(s);
      if (!t.some((x) => ['HowToStep', 'HowToSection', 'CreativeWork'].includes(x))) add('fix', 'howto-step-type', sp, `A step is typed ${t.join('/') || 'nothing'}; schema.org expects HowToStep, HowToSection, CreativeWork or Text.`, SRC.sHowTo);
      const words = str(s.text) || str(s.name);
      if (!words && !has(s.itemListElement)) add('improve', 'howto-step-empty', sp, 'A step has no text, name or itemListElement, so it says nothing.', SRC.sHowToStep);
      if (words && textNorm !== null && !visibleHas(textNorm, words, 120)) add('fix', 'howto-step-not-visible', sp, `The step "${words.slice(0, 60)}" is not in the page text.`, SRC.policies);
    });
  },

  article(n, path, add, textNorm, today) {
    // Google: "There are no required properties"; recommended: author, dateModified, datePublished, headline, image.
    if (!has(n.headline)) add('improve', 'article-no-headline', path, 'No headline (Google recommends it; keep it concise).', SRC.article);
    else if (textNorm !== null && !visibleHas(textNorm, n.headline)) add('fix', 'headline-not-visible', path, `The headline "${str(n.headline).slice(0, 80)}" is not in the page text.`, SRC.policies);
    if (!has(n.image)) add('improve', 'article-no-image', path, 'No image (Google recommends it).', SRC.article);
    const authors = list(n.author);
    if (!authors.length) add('improve', 'article-no-author', path, 'No author (Google recommends author, author.name and author.url).', SRC.article);
    authors.forEach((a, i) => {
      const ap = `${path}.author${authors.length > 1 ? `[${i}]` : ''}`;
      if (!isObj(a)) { add('improve', 'author-not-typed', ap, 'author is plain text. Google: use the Person type for people and Organization for organizations.', SRC.article); return; }
      const t = typesOf(a);
      if (!t.includes('Person') && !t.includes('Organization')) add('improve', 'author-type', ap, `author is typed ${t.join('/') || 'nothing'}. Google: use Person for people, Organization for organizations (not Thing).`, SRC.article);
      if (!has(a.name)) add('improve', 'author-no-name', ap, 'author has no name.', SRC.article);
      if (!has(a.url)) add('improve', 'author-no-url', ap, 'author has no url (a page about the author; Google recommends it).', SRC.article);
    });
    const pub = has(n.datePublished) ? parseIsoDate(n.datePublished) : undefined;
    const mod = has(n.dateModified) ? parseIsoDate(n.dateModified) : undefined;
    if (pub === undefined) add('improve', 'article-no-published', path, 'No datePublished (Google recommends it).', SRC.article);
    if (mod === undefined) add('improve', 'article-no-modified', path, 'No dateModified (Google recommends it).', SRC.article);
    if (pub === null) add('fix', 'date-format', path, `datePublished "${str(n.datePublished)}" is not an ISO 8601 date.`, SRC.sArticle);
    if (mod === null) add('fix', 'date-format', path, `dateModified "${str(n.dateModified)}" is not an ISO 8601 date.`, SRC.sArticle);
    if (pub && mod && mod < pub) add('fix', 'modified-before-published', path, 'dateModified is earlier than datePublished.', SRC.sArticle);
    [['datePublished', pub], ['dateModified', mod]].forEach(([k, d]) => { if (d && d > today) add('fix', 'date-future', path, `${k} (${str(n[k])}) is in the future.`, SRC.policies); });
  },

  breadcrumb(n, path, add, textNorm) {
    const items = list(n.itemListElement);
    if (items.length < 2) add('eligibility', 'crumb-too-short', path, `BreadcrumbList has ${items.length} ListItem${items.length === 1 ? '' : 's'}; Google asks for at least two.`, SRC.breadcrumb);
    const positions = [];
    items.forEach((it, i) => {
      const ip = `${path}.itemListElement[${i}]`;
      if (!isObj(it)) { add('fix', 'crumb-not-item', ip, 'An entry is not a ListItem.', SRC.breadcrumb); return; }
      const nameV = has(it.name) ? it.name : isObj(it.item) ? it.item.name : undefined;
      if (!has(nameV)) add('fix', 'crumb-no-name', ip, 'A ListItem has no name (Google requires it).', SRC.breadcrumb);
      else if (textNorm !== null && !visibleHas(textNorm, nameV)) add('fix', 'crumb-not-visible', ip, `The breadcrumb "${str(nameV)}" is not in the page text.`, SRC.policies);
      const pos = Number(it.position);
      if (!has(it.position) || !Number.isInteger(pos)) add('fix', 'crumb-no-position', ip, 'A ListItem has no whole-number position (Google requires it; position 1 is the start of the trail).', SRC.breadcrumb);
      else positions.push(pos);
      const last = i === items.length - 1;
      const url = isObj(it.item) ? str(it.item['@id'] || it.item.url) : str(it.item);
      if (!last && !url) add('fix', 'crumb-no-item', ip, 'A ListItem other than the last has no item URL (Google requires it except for the last crumb).', SRC.breadcrumb);
      if (url && !/^https?:\/\//.test(url)) add('improve', 'crumb-relative', ip, `item "${url}" is not an absolute URL.`, SRC.breadcrumb);
    });
    if (positions.length) {
      const sorted = [...positions].sort((a, b) => a - b);
      const seq = sorted.every((p, i) => p === i + 1);
      if (!seq) add('improve', 'crumb-sequence', path, `Positions are ${positions.join(', ')}; number them 1, 2, 3 ... from the start of the trail.`, SRC.breadcrumb);
    }
  },
};

function check(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) die('Config must be a JSON object.');
  if (cfg.generate !== undefined) return generate(cfg);
  const unknownKeys = Object.keys(cfg).filter((k) => !['pageType', 'jsonld', 'html', 'visibleText', 'today'].includes(k));
  if (unknownKeys.length) die(`Unrecognised field${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.map((k) => '"' + k + '"').join(', ')}.`, 'Expected: pageType, jsonld, html, visibleText, today.');
  let kind = null;
  if (cfg.pageType !== undefined && cfg.pageType !== null && cfg.pageType !== '') {
    kind = ALIASES[String(cfg.pageType).toLowerCase().replace(/\s+/g, '')];
    if (!kind) die(`Unknown pageType "${cfg.pageType}".`, 'Use one of: software, product, organization, faq, howto, article, breadcrumb.');
  }
  let today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  if (cfg.today !== undefined) {
    today = parseIsoDate(cfg.today);
    if (!today) die('"today" must be a date as YYYY-MM-DD.');
  }

  // ---- gather JSON-LD blocks and visible text
  const blocks = [];
  let text = null;
  if (typeof cfg.html === 'string' && cfg.html.trim()) {
    blocks.push(...extractLd(cfg.html));
    text = htmlToText(cfg.html);
  }
  const j = cfg.jsonld;
  if (typeof j === 'string' && j.trim()) {
    if (/<script\b/i.test(j)) {
      blocks.push(...extractLd(j));
      if (text === null && /<(body|p|h1|h2|div|main)\b/i.test(j)) text = htmlToText(j);
    } else blocks.push(j);
  } else if (j && typeof j === 'object') blocks.push(j);
  if (typeof cfg.visibleText === 'string' && cfg.visibleText.trim()) text = (text ? text + ' ' : '') + cfg.visibleText;
  if (!blocks.length) die('No JSON-LD found.', 'Set "jsonld" (an object, a JSON string, or HTML with <script type="application/ld+json">), or "html".');

  const findings = [];
  const add = (level, id, path, textMsg, source) => findings.push({ level, id, path, text: textMsg, source });
  const nodes = collectNodes(blocks, findings);
  const textNorm = text === null ? null : norm(text);

  // ---- which nodes to check
  const found = nodes.map((x) => ({ path: x.path, types: typesOf(x.node) }));
  // Every node of a known type is checked; the page type decides which one must exist.
  const targets = [];
  nodes.forEach((x) => {
    const k = kind && isType(x.node, kind) ? kind : Object.keys(KINDS).find((kk) => isType(x.node, kk));
    if (k) targets.push({ ...x, kind: k });
  });
  if (kind && nodes.length && !targets.some((t) => t.kind === kind)) {
    add('fix', 'type-missing', '-', `The page is a ${kind} page but no ${KINDS[kind].label} node was found (found: ${[...new Set(found.flatMap((f) => f.types))].join(', ') || 'none'}).`, SRC.policies);
  }
  targets.forEach((t) => CHECKS[t.kind](t.node, t.path, add, textNorm, today));

  if (textNorm === null) add('info', 'no-visible-text', '-', 'No page text supplied, so nothing was checked against what readers see. Set "html" or "visibleText" to run those checks.', SRC.policies);
  add('info', 'ai-features', '-', 'Google says there is "no special schema.org structured data" needed for AI Overviews or AI Mode, and lists "making sure your structured data matches the visible text on the page" among the fundamentals.', SRC.aiFeatures);

  const count = (lvl) => findings.filter((f) => f.level === lvl).length;
  const fixes = count('fix');
  const elig = count('eligibility');
  const label = kind ? KINDS[kind].label : 'the page';
  let verdict;
  if (fixes) verdict = { level: 'fix', headline: 'Fix before publishing', body: `${fixes} issue${fixes > 1 ? 's' : ''} break the markup or describe something the page does not show.` };
  else if (elig) verdict = { level: 'valid', headline: 'Valid, not rich-result eligible', body: `The markup is sound, but ${elig} Google requirement${elig > 1 ? 's are' : ' is'} missing for ${label} rich results.` };
  else if (textNorm === null) verdict = { level: 'valid-unchecked', headline: 'Valid markup, not checked against the page', body: `No broken or unsupported markup found for ${label}, but no page text was supplied, so ratings, prices and names were not compared with what readers see. Set "html" or "visibleText" for a publish verdict.` };
  else verdict = { level: 'ready', headline: 'Ready to publish', body: `No broken or unsupported markup found for ${label}, and what it marks up appears in the page text.` };

  const fixList = findings.filter((f) => f.level === 'fix' || f.level === 'eligibility' || f.level === 'improve')
    .map((f) => ({ level: f.level, path: f.path, do: f.text, source: f.source }));

  return { pageType: kind, checked: targets.map((t) => ({ path: t.path, type: typesOf(t.node).join('/') })), found, visibleTextChecked: textNorm !== null, findings, fixes: fixList, verdict };
}
// ===================== GENERATE: JSON-LD, meta tags and llms.txt from a form =====================
// The fix step after the checker: builds markup only from what the user enters (no invented ratings,
// prices or dates), then runs the result through check() above. Every rule names its source.
const GSRC = {
  siteNames: G + 'site-names',
  titleLinks: G + 'title-link',
  snippet: G + 'snippet',
  canonical: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  ogp: 'https://ogp.me/',
  llms: 'https://llmstxt.org/',
};
const GEN_TYPES = ['home', 'software', 'product', 'article', 'other'];
const GEN_FIELDS = ['pageType', 'url', 'title', 'description', 'image', 'siteName', 'organization', 'software', 'product', 'article', 'breadcrumbs', 'llms', 'html', 'visibleText'];
const GEN_SUB = {
  organization: ['name', 'url', 'logo', 'description', 'sameAs'],
  software: ['name', 'description', 'applicationCategory', 'operatingSystem', 'price', 'priceCurrency', 'ratingValue', 'ratingCount'],
  product: ['name', 'description', 'image', 'brand', 'sku', 'price', 'priceCurrency', 'availability', 'ratingValue', 'ratingCount'],
  article: ['headline', 'authorName', 'authorUrl', 'authorType', 'datePublished', 'dateModified', 'image', 'publisherName'],
  llms: ['name', 'summary', 'details', 'sections'],
};
const AVAILABILITY = ['InStock', 'OutOfStock', 'PreOrder', 'BackOrder', 'Discontinued', 'LimitedAvailability', 'OnlineOnly', 'InStoreOnly', 'SoldOut'];
const absUrl = (v) => /^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(str(v));
const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdText = (v) => String(v).replace(/[\r\n]+/g, ' ').trim();

function genObj(v, label) {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) die(`"generate.${label}" must be an object.`);
  Object.keys(v).forEach((k) => { if (!GEN_SUB[label].includes(k)) die(`Unknown field "generate.${label}.${k}".`, 'Allowed: ' + GEN_SUB[label].join(', ') + '.'); });
  Object.keys(v).forEach((k) => {
    const x = v[k];
    if (k === 'sameAs' || k === 'sections') return;
    if (x !== undefined && x !== null && typeof x !== 'string' && typeof x !== 'number') die(`"generate.${label}.${k}" must be text.`);
  });
  return v;
}
function genUrl(v, label, add, required) {
  const u = str(v);
  if (!u) { if (required) die(`Give ${label}.`, 'A full address such as https://example.com/pricing.'); return ''; }
  if (!absUrl(u)) die(`${label} must be a full address starting with https:// (got "${u}").`, 'Google: "Use absolute paths rather than relative paths" for canonical URLs.');
  return u;
}
function genPrice(v, label) {
  const s = str(v).replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) die(`${label} must be a number such as 49 or 49.00 (got "${str(v)}").`);
  return s;
}
function genRating(o, path, add, label) {
  const v = str(o.ratingValue), c = str(o.ratingCount);
  if (!v && !c) return null;
  if (!v || !c) { add('fix', 'rating-incomplete', path, `Give both ratingValue and ratingCount, or neither. Google's review snippet docs require a value and a count; the rating was left out.`, SRC.review); return null; }
  if (!/^\d+(\.\d+)?$/.test(v) || !/^\d+$/.test(c)) die(`${label}: ratingValue must be a number and ratingCount a whole number.`);
  add('info', 'rating-visible', path, `A rating of ${v} from ${c} ratings was included because you entered it. Google: "Don't mark up content that is not visible to readers of the page." Show the same rating and count on the page.`, SRC.policies);
  return { '@type': 'AggregateRating', ratingValue: v, ratingCount: c };
}
function setIf(o, k, v) { if (has(v)) o[k] = typeof v === 'string' ? v.trim() : v; }

function generate(cfg) {
  const extra = Object.keys(cfg).filter((k) => !['generate', 'today'].includes(k));
  if (extra.length) die(`With "generate", the only other field is "today" (got ${extra.map((k) => '"' + k + '"').join(', ')}).`);
  const g = cfg.generate;
  if (!isObj(g)) die('"generate" must be an object.');
  Object.keys(g).forEach((k) => { if (!GEN_FIELDS.includes(k)) die(`Unknown field "generate.${k}".`, 'Allowed: ' + GEN_FIELDS.join(', ') + '.'); });
  const type = str(g.pageType).toLowerCase() || 'other';
  if (!GEN_TYPES.includes(type)) die(`"generate.pageType" must be one of ${GEN_TYPES.join(', ')}.`, 'FAQ and HowTo are left out: Google no longer shows those rich results.');
  ['title', 'description', 'siteName'].forEach((k) => { if (g[k] !== undefined && g[k] !== null && typeof g[k] !== 'string') die(`"generate.${k}" must be text.`); });
  const findings = [];
  const add = (level, id, path, text, source) => findings.push({ level, id, path, text, source });
  const url = genUrl(g.url, 'the page URL ("generate.url")', add, true);
  const image = genUrl(g.image, 'the image URL ("generate.image")', add, false);
  const origin = url.replace(/^(https?:\/\/[^/?#]+).*$/i, '$1');
  const nodes = [];

  // ---- the page's main entity
  if (type === 'home') {
    const o = genObj(g.organization, 'organization') || {};
    if (!str(o.name)) die('Give the organization\'s name ("generate.organization.name").', 'For the home page, the tool marks up your Organization and your WebSite.');
    const org = { '@context': 'https://schema.org', '@type': 'Organization', name: str(o.name) };
    setIf(org, 'url', genUrl(o.url, 'the organization URL', add, false) || origin + '/');
    setIf(org, 'logo', genUrl(o.logo, 'the logo URL', add, false));
    setIf(org, 'description', str(o.description));
    if (o.sameAs !== undefined) {
      if (!Array.isArray(o.sameAs) || o.sameAs.length > 20) die('"generate.organization.sameAs" must be a list of up to 20 profile URLs.');
      const same = o.sameAs.map((u, i) => genUrl(u, `sameAs[${i}]`, add, false)).filter(Boolean);
      if (same.length) org.sameAs = same;
    }
    nodes.push(org);
    const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: str(g.siteName) || str(o.name), url: origin + '/' };
    nodes.push(site);
    if (url.replace(/[?#].*$/, '').replace(/\/$/, '') !== origin) add('fix', 'website-not-home', 'WebSite', `WebSite markup belongs on the home page. Google: "The WebSite structured data must be on the home page of the site." Your URL is ${url}; use it on ${origin}/.`, GSRC.siteNames);
  } else if (type === 'software') {
    const s = genObj(g.software, 'software') || {};
    if (!str(s.name)) die('Give the software\'s name ("generate.software.name").');
    const n = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: str(s.name) };
    setIf(n, 'description', str(s.description));
    setIf(n, 'applicationCategory', str(s.applicationCategory));
    setIf(n, 'operatingSystem', str(s.operatingSystem));
    const price = genPrice(s.price, 'software.price');
    if (price !== null) { n.offers = { '@type': 'Offer', price }; setIf(n.offers, 'priceCurrency', str(s.priceCurrency).toUpperCase()); }
    const r = genRating(s, 'SoftwareApplication', add, 'software');
    if (r) n.aggregateRating = r;
    nodes.push(n);
  } else if (type === 'product') {
    const s = genObj(g.product, 'product') || {};
    if (!str(s.name)) die('Give the product\'s name ("generate.product.name").');
    const n = { '@context': 'https://schema.org', '@type': 'Product', name: str(s.name) };
    setIf(n, 'description', str(s.description));
    setIf(n, 'image', genUrl(s.image, 'the product image URL', add, false) || image);
    if (has(s.brand)) n.brand = { '@type': 'Brand', name: str(s.brand) };
    setIf(n, 'sku', str(s.sku));
    const price = genPrice(s.price, 'product.price');
    if (price !== null) {
      n.offers = { '@type': 'Offer', price, url };
      setIf(n.offers, 'priceCurrency', str(s.priceCurrency).toUpperCase());
      if (has(s.availability)) {
        const av = str(s.availability).replace(/^https?:\/\/schema\.org\//, '');
        if (!AVAILABILITY.includes(av)) die(`"product.availability" must be one of ${AVAILABILITY.join(', ')}.`);
        n.offers.availability = 'https://schema.org/' + av;
      }
    }
    const r = genRating(s, 'Product', add, 'product');
    if (r) n.aggregateRating = r;
    nodes.push(n);
  } else if (type === 'article') {
    const a = genObj(g.article, 'article') || {};
    if (!str(a.headline)) die('Give the article\'s headline ("generate.article.headline").');
    const n = { '@context': 'https://schema.org', '@type': 'Article', headline: str(a.headline) };
    setIf(n, 'image', genUrl(a.image, 'the article image URL', add, false) || image);
    ['datePublished', 'dateModified'].forEach((k) => {
      if (!has(a[k])) return;
      if (!parseIsoDate(a[k])) die(`"article.${k}" must be an ISO 8601 date such as 2026-10-29 (got "${str(a[k])}").`);
      n[k] = str(a[k]);
    });
    if (has(a.authorName)) {
      const t = str(a.authorType) || 'Person';
      if (!['Person', 'Organization'].includes(t)) die('"article.authorType" must be Person or Organization.');
      n.author = { '@type': t, name: str(a.authorName) };
      setIf(n.author, 'url', genUrl(a.authorUrl, 'the author URL', add, false));
    }
    if (has(a.publisherName)) n.publisher = { '@type': 'Organization', name: str(a.publisherName) };
    nodes.push(n);
  }

  // ---- breadcrumbs, on any page type
  if (g.breadcrumbs !== undefined && g.breadcrumbs !== null) {
    if (!Array.isArray(g.breadcrumbs) || g.breadcrumbs.length > 10) die('"generate.breadcrumbs" must be a list of up to 10 { "name", "url" } items.');
    const items = g.breadcrumbs.map((b, i) => {
      if (!isObj(b) || Object.keys(b).some((k) => k !== 'name' && k !== 'url')) die(`breadcrumbs[${i}] must be { "name", "url" }.`);
      if (!str(b.name)) die(`breadcrumbs[${i}] needs a name.`);
      const it = { '@type': 'ListItem', position: i + 1, name: str(b.name) };
      const u = genUrl(b.url, `breadcrumbs[${i}].url`, add, false);
      if (u) it.item = u;
      return it;
    });
    if (items.length >= 2) nodes.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items });
    else if (items.length === 1) add('info', 'crumb-skipped', 'BreadcrumbList', 'One breadcrumb was given; Google asks for at least two, so no BreadcrumbList was generated.', SRC.breadcrumb);
  }

  // ---- meta tags
  const title = str(g.title), desc = str(g.description), site = str(g.siteName);
  const ogType = type === 'article' ? 'article' : 'website';
  const meta = [];
  if (title) meta.push(`<title>${escText(title)}</title>`);
  else add('fix', 'no-title', 'meta', 'No title was given, so no <title> was generated. Every page needs one.', GSRC.titleLinks);
  if (desc) meta.push(`<meta name="description" content="${escAttr(desc)}">`);
  else add('improve', 'no-description', 'meta', 'No description was given, so no meta description was generated. Google: a good one "informs and interests users with a short, relevant summary of what a particular page is about."', GSRC.snippet);
  meta.push(`<link rel="canonical" href="${escAttr(url)}">`);
  if (title) meta.push(`<meta property="og:title" content="${escAttr(title)}">`);
  meta.push(`<meta property="og:type" content="${ogType}">`);
  meta.push(`<meta property="og:url" content="${escAttr(url)}">`);
  if (image) meta.push(`<meta property="og:image" content="${escAttr(image)}">`);
  else add('improve', 'no-og-image', 'meta', 'No image was given. The Open Graph protocol lists og:image as a required property: "An image URL which should represent your object within the graph."', GSRC.ogp);
  if (desc) meta.push(`<meta property="og:description" content="${escAttr(desc)}">`);
  if (site) meta.push(`<meta property="og:site_name" content="${escAttr(site)}">`);
  meta.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`);
  if (title && /^(home|profile)$/i.test(title)) add('fix', 'vague-title', 'meta', `"${title}" is a vague title. Google advises against vague descriptors such as "Home" or "Profile".`, GSRC.titleLinks);

  // ---- llms.txt
  let llmsTxt = null;
  if (g.llms !== undefined && g.llms !== null) {
    const l = genObj(g.llms, 'llms');
    const name = str(l.name) || site || (nodes[0] && str(nodes[0].name));
    if (!name) die('Give the llms.txt name ("generate.llms.name"): its H1 is the only required section.', 'llmstxt.org: an H1 with the project or site name is "the only required section".');
    const L = ['# ' + mdText(name)];
    if (has(l.summary)) L.push('', '> ' + mdText(l.summary));
    if (has(l.details)) L.push('', String(l.details).trim());
    if (l.sections !== undefined) {
      if (!Array.isArray(l.sections) || l.sections.length > 20) die('"generate.llms.sections" must be a list of up to 20 { "title", "links" } items.');
      l.sections.forEach((sec, i) => {
        if (!isObj(sec) || !str(sec.title) || !Array.isArray(sec.links)) die(`llms.sections[${i}] needs a "title" and a "links" list.`);
        if (Object.keys(sec).some((k) => k !== 'title' && k !== 'links')) die(`llms.sections[${i}] takes only "title" and "links".`);
        L.push('', '## ' + mdText(sec.title), '');
        sec.links.forEach((ln, j) => {
          if (!isObj(ln) || !str(ln.title) || !str(ln.url)) die(`llms.sections[${i}].links[${j}] needs a "title" and a "url".`);
          if (Object.keys(ln).some((k) => !['title', 'url', 'note'].includes(k))) die(`llms.sections[${i}].links[${j}] takes only "title", "url" and "note".`);
          if (/[\s()]/.test(str(ln.url))) die(`llms.sections[${i}].links[${j}].url has a space or bracket, which breaks the markdown link.`);
          L.push(`- [${mdText(ln.title).replace(/[\[\]]/g, '')}](${str(ln.url)})` + (has(ln.note) ? ': ' + mdText(ln.note) : ''));
        });
      });
    }
    llmsTxt = L.join('\n') + '\n';
    add('info', 'llms-format', 'llms.txt', 'llms.txt is a proposed format, not a standard: an H1 with the site name (the only required section), an optional summary in a blockquote, then H2 sections of links. Save it at /llms.txt.', GSRC.llms);
    add('info', 'llms-google', 'llms.txt', 'Google says: "You don\'t need to create new machine readable files, AI text files, or markup to appear in these features" (AI Overviews and AI Mode). So llms.txt is optional, and not a lever for Google.', SRC.aiFeatures);
  }

  // ---- check what was generated, against the page text when given
  const htmlBlocks = nodes.map((n) => '<script type="application/ld+json">\n' + JSON.stringify(n, null, 2).replace(/</g, '\\u003c') + '\n</script>');
  let checked = null;
  if (nodes.length) {
    const cc = { jsonld: htmlBlocks.join('\n') };
    if (cfg.today !== undefined) cc.today = cfg.today;
    if (typeof g.html === 'string' && g.html.trim()) cc.html = g.html;
    if (typeof g.visibleText === 'string' && g.visibleText.trim()) cc.visibleText = g.visibleText;
    if (type !== 'other') cc.pageType = type === 'home' ? 'organization' : type;
    checked = check(cc);
    // Name each finding by the node it is about ("block 2" -> "BreadcrumbList").
    checked.findings.forEach((f) => {
      if (f.id === 'ai-features') return;
      const m = /^block (\d+)(.*)$/.exec(f.path);
      findings.push(m && nodes[+m[1] - 1] ? Object.assign({}, f, { path: nodes[+m[1] - 1]['@type'] + m[2] }) : f);
    });
  } else if (type === 'other') add('info', 'no-entity', 'JSON-LD', 'No main entity for an "other" page; only breadcrumbs (if given) are marked up.', SRC.policies);
  if (title && typeof (g.html || g.visibleText) === 'string' && (g.html || g.visibleText).trim()) {
    const tn = norm(g.html ? htmlToText(g.html) : g.visibleText);
    if (!visibleHas(tn, title.split(/\s[|\-–—:]\s/)[0])) add('improve', 'title-not-on-page', 'meta', `The start of the title ("${title.split(/\s[|\-–—:]\s/)[0]}") isn't in the page text. AAJ's view: a title that matches the page's main heading is less likely to be rewritten.`, GSRC.titleLinks);
  }
  add('info', 'ai-features', '-', 'Google says there is "no special schema.org structured data" needed for AI Overviews or AI Mode, and lists "making sure your structured data matches the visible text on the page" among the fundamentals.', SRC.aiFeatures);

  const fixes = findings.filter((f) => f.level === 'fix').length;
  const verdict = fixes ? { level: 'fix', headline: 'Fix before publishing', body: `${fixes} issue${fixes > 1 ? 's' : ''} to fix before you add this to the page.` }
    : checked ? checked.verdict : { level: 'valid', headline: 'Generated', body: 'Meta tags generated; no JSON-LD for this page type.' };
  const order = { fix: 0, eligibility: 1, improve: 2, info: 3 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return { mode: 'generate', pageType: type, url, jsonld: nodes, jsonldHtml: htmlBlocks.join('\n'), metaHtml: meta.join('\n'), llmsTxt,
    findings, verdict, visibleTextChecked: !!(checked && checked.visibleTextChecked), sources: GSRC };
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function renderGenerate(r) {
  const L = ['', `AAJ - STRUCTURED DATA, META TAGS AND LLMS.TXT (${r.pageType} page)`, '-'.repeat(66), `  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`];
  L.push('', 'JSON-LD (paste into the page <head>)', r.jsonldHtml || '  (none for this page type)');
  L.push('', 'META TAGS (paste into the page <head>)', r.metaHtml);
  if (r.llmsTxt !== null) L.push('', 'LLMS.TXT (save as /llms.txt)', r.llmsTxt.trimEnd());
  const sec = (lvl, title, mark) => {
    const rows = r.findings.filter((f) => f.level === lvl);
    if (!rows.length) return;
    L.push('', title);
    rows.forEach((f) => L.push(`  ${mark}  [${f.path}] ${f.text}\n       source: ${f.source}`));
  };
  sec('fix', 'FIX', '!');
  sec('eligibility', 'RICH-RESULT ELIGIBILITY (Google requirements)', '*');
  sec('improve', 'IMPROVE', '-');
  sec('info', 'CONTEXT', 'i');
  return L.join('\n');
}

function render(r) {
  if (r.mode === 'generate') return renderGenerate(r);
  const L = [];
  L.push('');
  L.push(`AAJ - STRUCTURED DATA CHECK${r.pageType ? ' (' + r.pageType + ' page)' : ''}`);
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push(`  Nodes found: ${r.found.map((f) => f.types.join('/')).join(', ') || 'none'}`);
  L.push(`  Checked: ${r.checked.map((c) => c.type + ' at ' + c.path).join('; ') || 'nothing'}   Visible text: ${r.visibleTextChecked ? 'compared' : 'not supplied'}`);
  const sec = (lvl, title, mark) => {
    const rows = r.findings.filter((f) => f.level === lvl);
    if (!rows.length) return;
    L.push('');
    L.push(title);
    rows.forEach((f) => L.push(`  ${mark}  [${f.path}] ${f.text}\n       source: ${f.source}`));
  };
  sec('fix', 'FIX', '!');
  sec('eligibility', 'RICH-RESULT ELIGIBILITY (Google requirements)', '*');
  sec('improve', 'IMPROVE (recommended)', '-');
  sec('info', 'CONTEXT', 'i');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Fictional example: an invented B2B SaaS pricing page. Not a real product.
const DEMO = {
  pageType: 'software',
  today: '2026-10-10',
  html: `<!doctype html><html><head><title>Ledgerline pricing</title>
<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Ledgerline",
  "applicationCategory": "BusinessApplication",
  "offers": { "@type": "Offer", "price": "49.00", "priceCurrency": "USD" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8" }
}</script>
<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://example.com/" },
    { "@type": "ListItem", "position": 2, "name": "Pricing" }
  ]
}</script></head>
<body><nav>Home / Pricing</nav><h1>Ledgerline pricing</h1>
<p>Month-end close for multi-entity finance teams. Team plan: $59 per month, billed annually.</p></body></html>`,
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: a fictional SaaS pricing page whose markup shows a price and rating the page does not)');
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

module.exports = { check, generate, htmlToText, extractLd, SRC };
