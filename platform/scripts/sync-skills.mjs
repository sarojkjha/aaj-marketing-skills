#!/usr/bin/env node
// =====================================================================
// AAJ Marketing Skills — catalog sync (Step 4)
// Reads every skills/<slug>/SKILL.md — frontmatter AND body — and upserts it
// into the Supabase catalog, so the repo stays the single source of truth.
// The body is stored in skills.body_md so skill pages can server-render the
// full text: without it every skill page is a metadata stub with nothing for
// search engines or AI answer engines to cite.
//
// SETUP (run from the repo root):
//   npm init -y
//   npm install @supabase/supabase-js gray-matter
//   export SUPABASE_URL="https://<project>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # server-side only — never ship to the browser
//   node platform/scripts/sync-skills.mjs
//
// Run schema.sql and seed-categories.sql first. Re-run this any time skills change
// (e.g. in CI on push to main).
// =====================================================================

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import matter from 'gray-matter';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const linkKind = (u) =>
  u.includes('/tools/') ? 'tool' : u.includes('/blog/') ? 'playbook' : u.includes('/guide') ? 'guide' : 'other';

async function main() {
  // category name -> id
  const { data: cats, error: cErr } = await db.from('categories').select('id,name');
  if (cErr) throw cErr;
  const catByName = Object.fromEntries((cats || []).map(c => [c.name, c.id]));

  const slugs = readdirSync(SKILLS_DIR).filter(d => existsSync(join(SKILLS_DIR, d, 'SKILL.md')));
  let ok = 0;

  for (const slug of slugs) {
    const dir = join(SKILLS_DIR, slug);
    const { data, content } = matter(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
    const m = data.metadata || {};
    const resDir = join(dir, 'resources');
    const hasEngine = existsSync(resDir) && readdirSync(resDir).some(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.py'));

    const row = {
      slug: data.name,
      name: m.slug ? (data.title || data.name) : data.name,   // display name fallback
      summary: (data.description || '').trim(),
      category_id: catByName[m.category] || null,
      phase: m.phase || null,
      difficulty: m.difficulty || null,
      version: m.version ? String(m.version) : null,
      agents: m.agents || [],
      inputs: m.inputs || null,
      outputs: m.outputs || null,
      tags: m.tags || [],
      has_engine: hasEngine,
      repo_path: `skills/${slug}`,
      install_cmd: `npx skills add sarojkjha/aaj-marketing-skills --skill ${data.name}`,
      body_md: (content || '').trim() || null,
      published: true
    };
    if (!catByName[m.category]) console.warn(`  ! ${slug}: category "${m.category}" not found — run seed-categories.sql`);

    const { data: up, error: uErr } = await db.from('skills').upsert(row, { onConflict: 'slug' }).select('id').single();
    if (uErr) { console.error(`  ✗ ${slug}:`, uErr.message); continue; }
    const skillId = up.id;

    // resource_links: replace from related_aaj
    await db.from('resource_links').delete().eq('skill_id', skillId);
    const links = (m.related_aaj || []).filter(Boolean).map((u, i) => ({
      skill_id: skillId, url: u, kind: linkKind(u),
      label: linkKind(u) === 'tool' ? 'Interactive tool' : linkKind(u) === 'playbook' ? 'Playbook' : 'Resource',
      sort_order: i
    }));
    if (links.length) await db.from('resource_links').insert(links);

    // related_skills: optional frontmatter `metadata.related: [slug, ...]`
    if (Array.isArray(m.related)) {
      await db.from('related_skills').delete().eq('skill_id', skillId);
      await db.from('related_skills').insert(m.related.map(rs => ({ skill_id: skillId, related_slug: rs })));
    }

    ok++;
    const words = (row.body_md || '').split(/\s+/).filter(Boolean).length;
    if (!words) console.warn(`  ! ${slug}: empty body — page will render as a stub`);
    console.log(`  ✓ ${data.name}  (${words} words)`);
  }
  console.log(`\nSynced ${ok}/${slugs.length} skills.`);
}

main().catch(e => { console.error(e); process.exit(1); });
