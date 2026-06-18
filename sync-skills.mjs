# Platform Data Model (Step 4)

The Supabase backend for `skills.aajconsult.com`. The **repo is the single source of truth** for skill content; this database is the queryable catalog the platform reads, synced from the `SKILL.md` frontmatter. Accounts, favorites, ratings, learning paths, and capture live here too.

## Files
- `supabase/schema.sql` — all tables + indexes + RLS + the full-text search column. Run first.
- `supabase/seed-categories.sql` — the eight catalog categories. Run second.
- `scripts/sync-skills.mjs` — reads every `skills/<slug>/SKILL.md` and upserts the catalog. Run third (and on every change).

## Setup (once)
1. Create a Supabase project. In the SQL editor, run `schema.sql` then `seed-categories.sql`.
2. From the repo root: `npm install @supabase/supabase-js gray-matter`.
3. Export `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service-role key is **server-side only** — never put it in the Lovable frontend; it's used only by this sync (and CI).
4. `node platform/scripts/sync-skills.mjs` → upserts all 12 skills and their AAJ links.

The Lovable app reads with the **anon** key, which only ever sees what the read policies allow.

## Tables

**Catalog (synced — don't hand-edit rows):**
- `categories` — the 8 categories (slug, name, description, order).
- `skills` — one row per skill: slug, name, summary, category, phase, difficulty, version, agents[], inputs, outputs, tags[], `has_engine`, `repo_path`, `install_cmd`. Includes a generated `search` tsvector + GIN index for full-text search.
- `resource_links` — the AAJ cross-links per skill (from `related_aaj`), kind = tool/playbook/guide. Nullable: many skills have none yet.
- `skill_examples` — example prompts/results shown on a skill page (populated via the app or a later frontmatter field).
- `related_skills` — the dependency map, stored by slug; synced if you add `metadata.related: [slug, …]` to frontmatter (optional).

**Phase 2 (created now, RLS-ready):**
- `profiles` — extends `auth.users`.
- `favorites` — user ↔ skill.
- `ratings` — 1–5 + comment, one per user per skill (public read for averages).
- `learning_paths` / `path_items` — guided sequences mixing skills and AAJ resources.

**Capture:**
- `leads` — newsletter / soft email gate (`source`).
- `submissions` — community "share your example" + status workflow.

## RLS at a glance
- **Catalog + learning paths + ratings** → public READ (anon SELECT). The sync writes with the service-role key, which bypasses RLS, so there are no anon write policies on the catalog.
- **`leads` / `submissions`** → anon **INSERT only**, no SELECT. (This is the pattern your tools already use — the most common place to get it wrong is leaving a SELECT policy open, so there deliberately isn't one.)
- **`favorites` / `ratings`** → authenticated users manage only their own rows (`auth.uid() = user_id`).
- **`profiles`** → any authenticated user can read; you update only your own.

## How the sync keeps one source of truth
`sync-skills.mjs` parses each `SKILL.md` frontmatter (`name`, `description`, and the `metadata` block) and upserts the `skills` row, replacing that skill's `resource_links` from `related_aaj` and setting `has_engine` by detecting a script in `resources/`. Edit a skill in the repo, re-run the sync (or wire it into CI on push to `main`), and the catalog updates — you never re-type metadata in the database.

## What the Lovable app will query (Step 5 preview)
- Catalog grid: `skills` joined to `categories`, filtered by category/phase/difficulty, searched via the `search` column.
- Skill page: one `skill` + its `resource_links`, `skill_examples`, `related_skills`, and average `ratings`.
- Capture: insert into `leads` / `submissions` with the anon key.
- Accounts (Phase 2): `favorites`, `ratings`, `profiles` under the owner policies.

This schema is what the Step 5 Lovable build prompt will target.
