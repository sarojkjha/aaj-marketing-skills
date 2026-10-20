# Directory and list submissions (Oct 19, 2026)

This is the kit for getting AAJ listed in the places where agents and developers look for skills and MCP servers. Every step below needs Saroj's own account, so Claude has prepared the files and copy, and Saroj does the submitting. Do the steps in order. The first three take about 15 minutes in total.

The repo-side changes are in the PR that adds this file:

- `server.json`: the official MCP registry entry.
- `glama.json`: lets Glama confirm the maintainer.
- Version 1.2.0 in the Claude plugin manifest, `package.json` and `server.json`. A new CI check makes sure these and the MCP server stay on the same version.
- `.claude-plugin/plugin.json` now also starts the local engines MCP server.
- A star line in the README.
- `docs/brand/social-preview.png`.

Merge that PR first.

## 1. GitHub settings (5 minutes)

The session's GitHub access can't change repository settings, so these are manual:

1. **Topics.** Open the repo page, then the gear next to "About". Add these to the 10 already there:
   - `marketing-skills`
   - `claude-skills`
   - `claude-code-plugin`
   - `mcp-server`
   - `marketing-analytics`
   - `unit-economics`
   - `startup`
   - `saas-metrics`
   - `codex`
   - `ai-marketing`

   That makes 20, GitHub's limit. `marketing-skills` matters most, because the [topic page](https://github.com/topics/marketing-skills) is where people browse.
2. **Discussions.** Go to Settings → General → Features and tick Discussions. The README now links to it.
3. **Social preview.** Go to Settings → General → Social preview → Edit. Upload `docs/brand/social-preview.png` (1280 × 640). It shows wherever the repo link is shared.
4. **Release.** After the PR is merged, go to Releases → Draft a new release.
   - Tag: `v1.2.0` on `main`.
   - Title: "v1.2.0: strict engine inputs, engine specs, plugin MCP server".
   - Generate the notes, then publish. Everyone who watches the repo gets notified, and later releases show up in the feeds that directories read.

The three good-first issues are already open: #19 (Stripe recipe), #20 (Search Console recipe) and #21 (PowerShell examples).

## 2. Claude plugin directory

The submission portal opened on Sep 25, 2026 ([report](https://aicatchup.com/news/claude-plugin-directory-submission-portal)). It needs:

- a paid Claude plan
- the repo connected to claude.ai through GitHub
- a `.claude-plugin/plugin.json`
- a README that explains how data is handled

The repo has all of these. `claude plugin validate --strict .` passes on Claude Code 2.1.303.

Submit **two listings**:

**A. Plugin bundle** (the repo `sarojkjha/aaj-marketing-skills`)

- **Name:** AAJ Marketing Skills
- **Short description:** The math layer for marketing agents: skills with deterministic engines for LTV:CAC, pipeline coverage, A/B significance, budget splits and pricing.
- **Long description:** 73 marketing skills for Seed to Series B founders and marketers, 62 of them with deterministic engines. Each engine takes your numbers and returns a number and a verdict, the same answer every time, from code you can read. The plugin also starts a local MCP server so Claude can run an engine directly. Engines make no network calls and write no files. Keep your writing skills; add the arithmetic.
- **Category:** Marketing (or Business, if Marketing isn't offered)
- **Data handling:** Everything runs on your machine. The engines make no network calls, write no files and take no actions in other tools. AAJ receives nothing. Your Claude conversation is handled under your Anthropic account's terms. Details: https://github.com/sarojkjha/aaj-marketing-skills#what-happens-to-your-data
- **Support:** https://github.com/sarojkjha/aaj-marketing-skills/issues
- **Website:** https://skills.aajconsult.com

**B. MCP connector** (the hosted server)

- **URL:** `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` (Streamable HTTP, no sign-in)
- **Name:** AAJ Marketing Engines
- **Description:** Five tools that find an AAJ marketing method and run its engine on your numbers: unit economics, pipeline forecast, A/B significance, budget allocation, pricing, retention and SEO/GEO scoring.
- **Data handling:** The server receives the engine inputs over HTTPS, runs them in memory and keeps no copy. Cloudflare keeps error logs, with no inputs, for up to 7 days. Don't send personal data; no engine needs it.

The portal may ask for counts. Paste them from `counts.json` (`npm run counts:phrases`) rather than typing them.

## 3. Official MCP registry

The registry reads `server.json` from the repo root. On Windows:

1. Download `mcp-publisher` for Windows from the releases page of `modelcontextprotocol/registry` on GitHub and put it on your PATH.
2. In `C:\dev\aaj-marketing-skills`, after `git pull`, run:
   ```
   mcp-publisher login github
   mcp-publisher publish
   ```
   Logging in with GitHub proves the `io.github.sarojkjha/*` namespace. No DNS record is needed.
   **Done Oct 19, 2026:** published as `io.github.sarojkjha/aaj-engines` version 1.2.0 (status active, remote `streamable-http`). Check with `curl.exe "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.sarojkjha/aaj-engines"`.

   Windows notes: PowerShell does not run a program from the current folder by name, so call it as `.\mcp-publisher.exe` or by full path. Opening the `/mcp` URL in a browser shows "This server does not open a server-to-client stream"; that is expected, because the worker only accepts POSTed JSON-RPC.
3. Every later change to the listing needs a new version. Bump all four version fields together; CI enforces this.

[Registry docs for remote servers](https://modelcontextprotocol.io/registry/remote-servers.md). The registry is in preview, so a data reset could mean publishing again.

## 4. Other MCP directories (about 30 minutes)

| Directory | How | What to paste |
|---|---|---|
| Smithery (smithery.ai) | **Blocked on Smithery's side (Oct 19).** The account namespace is `sarojmsu`, not `sarojkjha`. Both the web flow and `smithery mcp publish "https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp" -n sarojmsu/aaj-engines` fail with `403 {"error":"Updating servers has been removed. Contact support@smithery.ai."}`, and the web flow asks for a config value the server does not use. Email support@smithery.ai; do not add a config value. | Name and description from 2B |
| PulseMCP (pulsemcp.com) | **Paused (Oct 19):** submissions and listing changes are closed. It says it will pick up servers from the official registry automatically when it reopens, so no action is needed. Originally: "Submit" in the top navigation | Repo URL, hosted URL, description from 2B |
| mcp.so | Only a paid one-time submission ($39) as of Oct 19. Skipped. | Same |
| Glama (glama.ai/mcp) | **Listed Oct 20** at glama.ai/mcp/connectors/io.github.sarojkjha/aaj-engines (healthy, 5 tools). It indexes public GitHub servers on its own. Once listed, claim the entry; `glama.json` names you as maintainer | Nothing |
| punkpeye/awesome-mcp-servers | Pull request, see below | One line |
| JAW9C/awesome-remote-mcp-servers | **Hold:** its rules ask for OAuth 2.0, official support and an active community (see the table below) | One line, later |

**Opening a pull request without the command line:**

1. Open the list's `README.md` on GitHub and click the pencil icon. GitHub makes your fork automatically.
2. Add the line in the right section, in alphabetical order, and copy the format of the lines around it.
3. Click "Propose changes", then "Create pull request".

Rules read on Oct 20 from each list's CONTRIBUTING.md. Two of the four lists do not fit AAJ yet; do not open those PRs until the condition is met.

| List | Fits today? | Why |
|---|---|---|
| punkpeye/awesome-mcp-servers | Yes | For servers with a public GitHub repo that you install and run; AAJ's local MCP server is in the repo. Section: Marketing. Alphabetical by owner/repo. |
| ComposioHQ/awesome-claude-skills | Yes | Business & Marketing accepts links to skill repos elsewhere on GitHub. Needs a real use case, documentation and examples. The list's last commit was Jul 24, so a reply may be slow. |
| JAW9C/awesome-remote-mcp-servers | **Not yet** | Asks for official, production-ready servers, an active community and OAuth 2.0 authentication ("Must be OAuth 2.0"). The hosted AAJ server has no sign-in and the repo has 0 stars. Revisit once there are users. |
| VoltAgent/awesome-agent-skills | **Not yet** | "Brand new skills that were just created are not accepted"; it wants real community usage. Revisit in December once installs exist. Its entries are one per skill with a description of 10 words or fewer, so submit the strongest skill (for example `unit-economics`), not the whole library. |

Lines to add:

- **awesome-mcp-servers**, Marketing section, just before `sharozdawa/ai-visibility` (the section is roughly alphabetical by owner): `- [sarojkjha/aaj-marketing-skills](https://github.com/sarojkjha/aaj-marketing-skills) 📇 ☁️ 🏠 - Deterministic marketing math for agents: LTV:CAC, pipeline coverage, A/B significance, budget allocation and pricing engines. Run locally or hosted, no sign-in.` PR title: `Add sarojkjha/aaj-marketing-skills`.
- **awesome-claude-skills**, Business & Marketing, same format as the external entries there: `- [AAJ Marketing Skills](https://github.com/sarojkjha/aaj-marketing-skills) - 73 marketing skills for Seed to Series B founders, 62 with engines that return the same number and verdict every time. *By [@sarojkjha](https://github.com/sarojkjha)*`
- **awesome-remote-mcp-servers** (when it fits; Category "Data Analysis" or "Other"): `| AAJ Marketing Engines | Data Analysis | `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` | Open | [AAJ](https://skills.aajconsult.com) |`
- **awesome-agent-skills** (when it fits; Community Skills, Marketing, end of the subcategory; PR title `Add skill: sarojkjha/unit-economics`): `- **[sarojkjha/unit-economics](https://github.com/sarojkjha/aaj-marketing-skills/tree/main/skills/unit-economics)** - Computes LTV, CAC, payback and a verdict from your numbers`

## 5. Skill lists

1. **skills.sh re-index.** On Oct 11 only 39 of 68 skills were listed. In PowerShell:
   ```
   cd $env:TEMP; mkdir aaj-reindex; cd aaj-reindex
   npx -y skills add sarojkjha/aaj-marketing-skills --skill '*' --agent claude-code -y
   cd ..; Remove-Item -Recurse -Force aaj-reindex
   ```
   This adds about 73 installs to the count; note that in the next monthly metrics row.
2. **VoltAgent/awesome-agent-skills:** **hold until December.** It does not accept brand-new skills without community usage (see the table in section 4).
3. **ComposioHQ/awesome-claude-skills:** a pull request with the line in section 4, in Business & Marketing.
4. **SkillRank and claudemarketplaces.com:** search for "aaj-marketing-skills". If AAJ is listed, claim it or check the description. If not, use their submit link.

Each list has its own contribution rules (CONTRIBUTING.md). Read them first. Some ask for a minimum number of stars or a demo GIF, and a pull request that ignores them gets closed.

## After submitting

Add a row per listing to `docs/metrics/monthly.csv` notes in the landing repo with the date submitted and the date accepted. The Dec 1 metrics row will show whether listings moved installs and stars.
