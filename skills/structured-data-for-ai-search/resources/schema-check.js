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
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
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

module.exports = { check, htmlToText, extractLd, SRC };
