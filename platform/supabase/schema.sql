-- =====================================================================
-- AAJ Marketing Skills — Supabase schema (Step 4)
-- Catalog tables synced from the repo SKILL.md frontmatter (single source of
-- truth) + Phase-2 tables (accounts, favorites, ratings, learning paths,
-- submissions) + lead capture. Run in the Supabase SQL editor.
--
-- RLS summary:
--   • Catalog tables  → public READ (anon SELECT), writes service-role only.
--   • leads / submissions → anon INSERT only (no read for anon).
--   • favorites / ratings → each user manages only their own rows.
--   • profiles → user reads any, updates own.
-- =====================================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- CATALOG (synced from repo frontmatter — do not hand-edit rows)
-- =====================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  sort_order  int default 0
);

create table if not exists public.skills (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,            -- matches the repo folder / frontmatter name
  name          text not null,
  summary       text not null,                   -- frontmatter description
  category_id   uuid references public.categories(id) on delete set null,
  phase         text check (phase in ('Diagnose','Design','Execute')),
  difficulty    text check (difficulty in ('Starter','Intermediate','Advanced')),
  version       text,
  agents        text[] default '{}',
  inputs        text,
  outputs       text,
  tags          text[] default '{}',
  has_engine    boolean default false,           -- bundles a runnable script
  repo_path     text,                            -- e.g. skills/paid-media-budget-allocation
  install_cmd   text,                            -- npx skills add ... --skill <slug>
  published     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists skills_category_idx on public.skills(category_id);
create index if not exists skills_phase_idx on public.skills(phase);
-- full-text search over name + summary + tags
alter table public.skills add column if not exists search tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name,'') || ' ' || coalesce(summary,'') || ' ' || array_to_string(tags,' '))
  ) stored;
create index if not exists skills_search_idx on public.skills using gin(search);

-- AAJ cross-links (nullable per skill — many skills ship with none yet)
create table if not exists public.resource_links (
  id        uuid primary key default gen_random_uuid(),
  skill_id  uuid not null references public.skills(id) on delete cascade,
  label     text not null,
  url       text not null,
  kind      text check (kind in ('tool','playbook','guide','other')) default 'tool',
  sort_order int default 0
);
create index if not exists resource_links_skill_idx on public.resource_links(skill_id);

-- example use cases shown on a skill page
create table if not exists public.skill_examples (
  id        uuid primary key default gen_random_uuid(),
  skill_id  uuid not null references public.skills(id) on delete cascade,
  title     text,
  prompt    text,
  result    text,
  sort_order int default 0
);
create index if not exists skill_examples_skill_idx on public.skill_examples(skill_id);

-- dependency map (skill ↔ related skill)
create table if not exists public.related_skills (
  skill_id         uuid not null references public.skills(id) on delete cascade,
  related_slug     text not null,                -- stored by slug; resolve in app
  primary key (skill_id, related_slug)
);

-- =====================================================================
-- PHASE 2 (accounts, engagement, paths) — created now, RLS-ready
-- =====================================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz default now()
);

create table if not exists public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  skill_id   uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, skill_id)
);

create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  skill_id   uuid not null references public.skills(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz default now(),
  unique (user_id, skill_id)
);
create index if not exists ratings_skill_idx on public.ratings(skill_id);

create table if not exists public.learning_paths (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  sort_order  int default 0,
  published   boolean default true
);

create table if not exists public.path_items (
  id         uuid primary key default gen_random_uuid(),
  path_id    uuid not null references public.learning_paths(id) on delete cascade,
  position   int not null,
  item_type  text check (item_type in ('skill','resource')) not null,
  skill_slug text,                               -- when item_type = 'skill'
  resource_url text,                             -- when item_type = 'resource' (AAJ playbook, etc.)
  note       text
);
create index if not exists path_items_path_idx on public.path_items(path_id);

-- =====================================================================
-- CAPTURE (lead gen + community submissions)
-- =====================================================================

create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text default 'skills-platform',
  created_at timestamptz default now()
);

create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  skill_slug text,
  title      text,
  body       text,
  status     text default 'new' check (status in ('new','reviewed','published','rejected')),
  created_at timestamptz default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.categories      enable row level security;
alter table public.skills          enable row level security;
alter table public.resource_links  enable row level security;
alter table public.skill_examples  enable row level security;
alter table public.related_skills  enable row level security;
alter table public.learning_paths  enable row level security;
alter table public.path_items      enable row level security;
alter table public.profiles        enable row level security;
alter table public.favorites       enable row level security;
alter table public.ratings         enable row level security;
alter table public.leads           enable row level security;
alter table public.submissions     enable row level security;

-- Public catalog: anyone (anon) may READ. No anon writes — the sync uses the
-- service-role key, which bypasses RLS, so no write policy is needed here.
create policy "public read categories"     on public.categories     for select using (true);
create policy "public read skills"         on public.skills         for select using (published = true);
create policy "public read resource_links" on public.resource_links for select using (true);
create policy "public read skill_examples" on public.skill_examples for select using (true);
create policy "public read related_skills" on public.related_skills for select using (true);
create policy "public read learning_paths" on public.learning_paths for select using (published = true);
create policy "public read path_items"     on public.path_items     for select using (true);

-- Ratings are publicly readable (to show averages); writes are owner-only below.
create policy "public read ratings"        on public.ratings        for select using (true);

-- Capture tables: anon may INSERT only — and CANNOT read back (no select policy).
create policy "anon insert leads"          on public.leads          for insert to anon with check (true);
create policy "anon insert submissions"    on public.submissions    for insert to anon with check (true);

-- Profiles: any authenticated user may read; you may update only your own.
create policy "auth read profiles"         on public.profiles       for select to authenticated using (true);
create policy "user upsert own profile"    on public.profiles       for insert to authenticated with check (auth.uid() = id);
create policy "user update own profile"    on public.profiles       for update to authenticated using (auth.uid() = id);

-- Favorites: a user manages only their own.
create policy "user read own favorites"    on public.favorites      for select to authenticated using (auth.uid() = user_id);
create policy "user add own favorite"      on public.favorites      for insert to authenticated with check (auth.uid() = user_id);
create policy "user remove own favorite"   on public.favorites      for delete to authenticated using (auth.uid() = user_id);

-- Ratings: a user writes/edits/deletes only their own (read is public, above).
create policy "user add own rating"        on public.ratings        for insert to authenticated with check (auth.uid() = user_id);
create policy "user update own rating"     on public.ratings        for update to authenticated using (auth.uid() = user_id);
create policy "user delete own rating"     on public.ratings        for delete to authenticated using (auth.uid() = user_id);

-- =====================================================================
-- updated_at trigger for skills
-- =====================================================================
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists skills_touch on public.skills;
create trigger skills_touch before update on public.skills
  for each row execute function public.touch_updated_at();
