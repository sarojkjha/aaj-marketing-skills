# Lovable Build Prompt — AAJ Marketing Skills Platform

**For:** `skills.aajconsult.com` (Lovable · React + Vite + TypeScript + Tailwind + shadcn/ui)
**Backend:** the Supabase project from Step 4 (schema already created — connect to it, don't recreate it).
**Goal:** a browsable, searchable catalog + learning platform for the AAJ Marketing Skills, cross-linked to aajconsult.com. More elaborate and engaging than a thin landing page: category and phase browsing, rich skill pages, learning paths (stubbed), and lead capture.

Attach `platform/DATA-MODEL.md` and `platform/supabase/schema.sql` to the Lovable chat as the schema reference.

---

## 0. The one blocking prerequisite — read first

This is a **discovery** platform, so it must be crawlable by search engines and AI engines. A default Lovable SPA serves an empty shell to bots, which would defeat the entire purpose. **Enable SSR or static prerendering** for `/`, `/skills`, `/skills/*`, and `/categories/*` so the title, meta, JSON-LD, and the skill content are present in the initial HTML response (not injected after hydration). Catalog pages can be statically generated at build/deploy and regenerated when the catalog syncs.

**Verify:** `curl -A "GPTBot" https://skills.aajconsult.com/skills/paid-media-budget-allocation` must return the skill name, summary, and JSON-LD in the raw HTML. Treat this as acceptance-blocking.

---

## 1. Stack & Supabase connection

- React + Vite + TypeScript + Tailwind + shadcn/ui.
- **Connect to the existing Supabase project** (Step 4). Do **not** create or alter tables — `schema.sql` and `seed-categories.sql` have run and `sync-skills.mjs` has populated the catalog.
- Read with the **anon key only**. RLS already enforces access: catalog tables are public-read; `leads`/`submissions` accept anon inserts; favorites/ratings are owner-only (Phase 2).
- No `localStorage` for app state beyond UI niceties.

---

## 2. Routes

| Route | Page |
|---|---|
| `/` | Home — hero, value prop, install one-liner, featured skills, browse by category & phase, "why it's different", AAJ cross-promo |
| `/skills` | Catalog — search + filters (category, phase, difficulty), skill grid |
| `/skills/:slug` | Skill detail — summary, install, inputs/outputs, examples, AAJ "go deeper" links, related skills, ratings |
| `/categories/:slug` | Category landing — intro + that category's skills (good for SEO) |
| `/paths` and `/paths/:slug` | Learning paths (Phase 2 — build the routes, render from `learning_paths`/`path_items`; empty state for now) |
| `/submit` | Submit-an-example form → inserts into `submissions` |

Newsletter capture lives in the footer and an optional soft modal (inserts into `leads`).

---

## 3. Design system (match aajconsult.com — one ecosystem)

```
Colors:  navy #0B182D / #0A1628 · gold #C49A1E · orange #F36F01 · bright #FBA800
         cream #F5F1EA · teal #1D7874 · paper #FFFDF8 · ink #142338
Fonts:   Cormorant Garamond (display/headlines) · DM Sans (body) · JetBrains Mono (code, install commands, data)
```

- **Phase drives the accent badge:** Diagnose = teal, Design = gold, Execute = orange. Show it on every skill card and skill page.
- **Category** shows as a labeled tag; give each of the 8 a consistent subtle accent.
- **"Has engine"** skills get a small badge (e.g. a terminal glyph) — it's the differentiator; surface it.
- Editorial, calm, navy-on-cream. Reuse AAJ's voice: "decisions you can defend," outcomes-first.

---

## 4. Page specs

### Home (`/`)
- **Hero:** headline (e.g. "Marketing skills for AI agents — grounded in real methodology"), one-line subhead, and the install one-liner in a JetBrains Mono block with a copy button: `npx skills add sarojkjha/aaj-marketing-skills`.
- **Why it's different:** three points — grounded in AAJ's tested tools/playbooks, several skills ship runnable engines, each links to a deeper AAJ guide.
- **Browse by phase:** three cards — Diagnose / Design / Execute (AAJ's spine), each linking to a filtered catalog.
- **Browse by category:** the 8 categories as cards (from `categories`).
- **Featured skills:** 4–6 skill cards (e.g. has-engine skills first).
- **AAJ cross-promo:** a band linking to aajconsult.com tools and services.
- Footer with newsletter capture + AAJ links.

### Catalog (`/skills`)
- **Search bar** (full-text over name/summary/tags) + **filter pills**: Category (8), Phase (3), Difficulty (3), and a "Has engine" toggle. Filters combine; reflect state in the URL query string for shareable/prerenderable views.
- **Skill grid:** cards showing name, summary (truncated), phase badge, category tag, difficulty, agent chips, and the has-engine badge. Empty state when filters match nothing.
- Results count + clear-filters.

### Skill detail (`/skills/:slug`)
- **Hero:** skill name (H1), phase badge, category tag, difficulty; the summary as an answer-first lead paragraph; the install command (`install_cmd`) in a mono block with copy.
- **What you give / what you get:** `inputs` and `outputs`.
- **Examples:** render `skill_examples` if present (prompt → result); hide the section if empty.
- **Go deeper (AAJ):** `resource_links` as prominent cards — "Interactive tool" / "Playbook" — linking to aajconsult.com. This is the holistic-learning bridge; make it visible.
- **Runnable:** if `has_engine`, a note that this skill bundles a tool you can run, with the `node resources/…` hint and a link to the file on GitHub.
- **Related skills:** `related_skills` (resolve slugs to names/links).
- **Ratings:** show average + count (public read); the rate action is Phase 2 (gate behind auth, hide for now).
- **View source:** link to the skill folder on GitHub (`https://github.com/sarojkjha/aaj-marketing-skills/tree/main/{repo_path}`).
- A small **per-skill FAQ** (generated from metadata): "What does this skill do?", "How do I install it?", "Which agents support it?" — also emitted as FAQPage JSON-LD (AEO).

### Category (`/categories/:slug`)
- Category name + description (from `categories`), then that category's skills (same card grid). Good standalone SEO target.

### Submit (`/submit`)
- Simple form (email optional, skill, title, example body) → `supabase.from('submissions').insert(...)`. Honeypot field. Success state; failure never loses the user's text.

---

## 5. Data layer (queries against the Step 4 schema)

```ts
// Catalog grid (with optional filters + search)
let q = supabase.from('skills')
  .select('slug,name,summary,phase,difficulty,tags,has_engine,agents,category_id,categories(slug,name)')
  .eq('published', true);
if (categorySlug) q = q.eq('categories.slug', categorySlug);
if (phase)        q = q.eq('phase', phase);
if (difficulty)   q = q.eq('difficulty', difficulty);
if (hasEngine)    q = q.eq('has_engine', true);
if (search)       q = q.textSearch('search', search, { type: 'websearch' });

// Skill detail
const { data: skill } = await supabase.from('skills')
  .select('*, categories(slug,name)').eq('slug', slug).single();
const { data: links } = await supabase.from('resource_links').select('*').eq('skill_id', skill.id).order('sort_order');
const { data: examples } = await supabase.from('skill_examples').select('*').eq('skill_id', skill.id).order('sort_order');
const { data: related } = await supabase.from('related_skills').select('related_slug').eq('skill_id', skill.id);
const { data: ratings } = await supabase.from('ratings').select('rating').eq('skill_id', skill.id); // average client-side

// Capture (anon insert — RLS allows insert, not read)
await supabase.from('leads').insert({ email, source: 'skills-platform' });
await supabase.from('submissions').insert({ email, skill_slug, title, body });
```

The catalog is small (dozens of rows) — fetch and filter/prerender freely; no pagination needed yet.

---

## 6. SEO / GEO / AEO guidelines

Apply to every public page; this is an AI-skills site, so being cited by AI engines is on-brand and on-mission.

### SEO
- One `<h1>` per page; descriptive, unique `<title>` (≤60) and meta description (~155) per route. Skill page title pattern: `[Skill] — AI Marketing Skill | AAJ Marketing Skills`.
- **Canonical discipline:** canonical = og:url = sitemap loc = breadcrumb item = internal links, identical strings. Pick one trailing-slash convention and keep all five in agreement.
- Dynamic `sitemap.xml` listing home, `/skills`, every `/skills/:slug`, and every `/categories/:slug`, with `lastmod` from `updated_at`.
- Internal linking: home ↔ catalog ↔ skill ↔ category ↔ related skills, plus outbound to the matching aajconsult.com tool/playbook.
- Core Web Vitals: code-split routes, lazy-load below-the-fold; mobile-first; usable at 360px.
- SSR/prerender (Section 0) so all of this is in the initial HTML.

### GEO (get cited by ChatGPT, Perplexity, Claude, AI Overviews)
- Each skill page is a **self-contained, quotable unit**: it should fully describe the skill without the rest of the site.
- Lead each skill page with an **answer-first** paragraph (what it does, when to use it) in 40–60 words.
- Use **precise terminology** (the skill's real domain terms) and concrete specifics (inputs, outputs, which agents).
- **Allow AI crawlers** in robots.txt and publish a dynamic **`llms.txt`** that lists every skill (name, URL, one-line description) — the ideal discovery surface for an agent-skills catalog. Also expose `llms-full.txt` with fuller summaries.
- Visible freshness ("Updated …") and `dateModified` in schema.

### AEO (win the direct answer)
- The per-skill FAQ (Section 4) with **FAQPage JSON-LD mirroring the visible Q&A**.
- Question-first section headers where natural ("What does it do?", "How do I install it?").
- Scannable structure — the inputs/outputs and install command are clean extractable blocks.

---

## 7. Structured data (JSON-LD, via react-helmet-async or SSR head)

- **Skill page:** `TechArticle` (headline = skill name, description = summary, `about`/`keywords` from tags, `dateModified`) + `BreadcrumbList` + `FAQPage` (the per-skill FAQ). Optionally `SoftwareSourceCode` pointing at the GitHub folder for has-engine skills.
- **Catalog page:** `CollectionPage` + `ItemList` of the skills.
- **Category page:** `CollectionPage` + `BreadcrumbList`.
- **Site-wide:** `Organization` (AAJ) and `WebSite` with `SearchAction`.

---

## 8. robots.txt / sitemap / llms.txt

```
# robots.txt
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: *
Allow: /

Sitemap: https://skills.aajconsult.com/sitemap.xml
```

- `sitemap.xml` — generated from the catalog (all skill + category routes).
- `llms.txt` — generated from `skills`: for each, `- [Name](https://skills.aajconsult.com/skills/{slug}): {summary}`. Group by category. Link to aajconsult.com at the top.

---

## 9. Acceptance checklist

**Platform**
- [ ] Routes live; connected to the Step 4 Supabase project (no tables recreated); reads use the anon key.
- [ ] Catalog grid renders all 12 skills; search + category/phase/difficulty/has-engine filters work and reflect in the URL.
- [ ] Skill pages render summary, install (copy works), inputs/outputs, AAJ resource links, related skills, ratings average, GitHub source link, and the per-skill FAQ. Empty `skill_examples` hide gracefully.
- [ ] Category pages render; `/paths` exists with an empty state.
- [ ] `/submit` and the newsletter capture insert into `submissions` / `leads`; failures never lose input; honeypot present.
- [ ] Design matches AAJ tokens; phase badges (teal/gold/orange) and has-engine badges present; usable at 360px.

**SEO / GEO / AEO**
- [ ] `curl -A "GPTBot"` on home + a skill page returns populated HTML with title, meta, and JSON-LD (SSR/prerender working).
- [ ] Canonical = og:url = sitemap loc = breadcrumb = internal links on each page.
- [ ] `sitemap.xml`, `robots.txt` (AI crawlers allowed), `llms.txt` and `llms-full.txt` all generated from the catalog.
- [ ] Answer-first lead paragraph + FAQPage JSON-LD on skill pages; TechArticle/CollectionPage/BreadcrumbList/Organization schema present and valid.
- [ ] Cross-links to aajconsult.com tools/playbooks on the relevant skill pages.

---

## 10. Plan Mode — paste this to start

> Build a catalog + learning platform at skills.aajconsult.com in React + Vite + TypeScript + Tailwind + shadcn/ui, backed by my existing Supabase project (schema is already created — connect, don't recreate; read with the anon key; RLS is in place). Attached are DATA-MODEL.md and schema.sql. Build routes: `/` (home with hero, install one-liner, browse by phase and category, featured skills, AAJ cross-promo), `/skills` (search + category/phase/difficulty/has-engine filters reflected in the URL, skill-card grid), `/skills/:slug` (summary as answer-first lead, install command with copy, inputs/outputs, examples, AAJ "go deeper" resource links, related skills, ratings average, GitHub source link, and a per-skill FAQ), `/categories/:slug`, `/paths` (empty state), and `/submit` (inserts into submissions). Add newsletter capture (inserts into leads). Use the AAJ design tokens in the spec (navy/gold/orange/teal, Cormorant Garamond + DM Sans + JetBrains Mono); phase drives a teal/gold/orange badge and "has engine" gets its own badge. Apply the SEO/GEO/AEO guidelines in the spec (canonical discipline, dynamic sitemap.xml + robots.txt allowing AI crawlers + llms.txt generated from the catalog, answer-first skill descriptions, TechArticle/CollectionPage/BreadcrumbList/FAQPage JSON-LD), and enable SSR/prerender for the public routes so meta, JSON-LD, and content are in the initial HTML. Before writing code, produce a step-by-step plan and the route/component/query list for my approval. Don't recreate the database.

## 11. Follow-up prompt queue (after the plan is approved)

1. "Scaffold the routes, the Supabase client (anon), and shared layout/design tokens. Show me the home and catalog shells reading live from `skills`/`categories`."
2. "Build the catalog: skill cards, search via the `search` column, and the category/phase/difficulty/has-engine filters with URL state. Paste a screenshot and the row count."
3. "Build the skill detail page with all sections, the copy-install action, the per-skill FAQ, and resource-link cards to aajconsult.com. Handle empty examples."
4. "Add `/categories/:slug`, the `/paths` empty state, `/submit`, and newsletter capture (anon inserts). Confirm an insert succeeds and that anon cannot read the tables back."
5. "Implement the SEO/GEO/AEO layer: per-page meta + JSON-LD, dynamic sitemap.xml, robots.txt, and llms.txt/llms-full.txt generated from the catalog. Then enable SSR/prerender for the public routes and paste `curl -A GPTBot` output for home and a skill page."
6. "Point skills.aajconsult.com (Cloudflare) at the deployment and confirm the prerendered HTML is served on the live domain."
