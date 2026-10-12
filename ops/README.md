# ops/

Working files that used to sit in the repo root. None of them is part of the skills library, so a visitor to the repo, `npx skills` and the Claude Code and Codex plugins never need them. They were moved here on Oct 11, 2026, not deleted, so nothing is lost.

| Folder | What it holds | Still used? |
|---|---|---|
| `patches/` | `git format-patch` files from July to September 2026, already applied to `main` | No. Kept for the record |
| `powershell/` | `verify-deploy.ps1`, `check-404-routes.ps1` (aajconsult.com deploy checks), `log-traffic.ps1` (weekly GitHub traffic log) and `deploy-baseline.json` | Yes, from this folder: `cd ops\powershell` first, because the scripts read and write files next to themselves |
| `seo-worker/` | The July copy of the aajconsult.com SEO worker, its backups and the `wrangler.jsonc` that deployed it | No. The live worker is generated in the aaj-landing-page-launch repo (`public/seo-worker-combined.txt`) |
| `claude-outputs/` | Drafts and email previews produced in working sessions | Reference only |
| `brand/` | LinkedIn banners | Reference only |
| `archive/` | An older copy of the MCP server README, a citation-run CSV template and an old `skills-lock.json` | No |

The library itself is `skills/`, with `platform/` (catalog, MCP server, site sync), `recipes/` and the plugin manifests in `.claude-plugin/` and `.agents/plugins/`.
