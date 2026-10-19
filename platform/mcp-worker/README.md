# Hosted AAJ Engines MCP server (Cloudflare Worker)

**Live at `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp`** (deployed Oct 10, 2026; `/health` on the same host).

This is the same five tools as the local server in `platform/mcp/`, served at one URL. Founders add that URL as a custom connector in Claude, ChatGPT or any MCP client instead of cloning the repo.

| Tool | What it does |
|---|---|
| `list_engines` | Lists every engine |
| `describe_engine` | Shows one engine's inputs |
| `run_engine` | Runs an engine and returns the result |
| `search_skills` | Finds skills that match a search |
| `get_skill` | Returns one skill's full method |

- **No sign-in, no storage.** The engines run in memory and make no network calls, and the server keeps no copy of what a client sends. Cloudflare's per-request logs are off (`invocation_logs: false`); error logs, which carry no inputs, are kept for up to 7 days. Your agent's model provider still sees what you give the agent.
- **Transport.** MCP Streamable HTTP, stateless:
  - `POST /mcp` returns JSON.
  - Notifications return 202.
  - `GET /mcp` returns 405.
  - `/` is a short info page.
  - `/health` returns counts.
- **Limits.**
  - Request bodies are capped at 256 KB.
  - Each IP gets 60 requests a minute per isolate, which guards against runaway loops. It is not a quota.
  - Every engine demo runs in under 2 ms of CPU.
- **How the engines run without Node.** `build.mjs` compiles each engine file into a plain function, wrapping its unchanged source. `console`, `process`, `require("fs")` and `module` become small stand-ins that capture output and exit codes.
- **Tests.** `test.mjs` checks every engine's `--demo`, `--help` and bad-input output against Node, byte for byte, and also tests the HTTP transport.

## Deploy (Saroj)

You need Node 18+ and a Cloudflare login on your computer.

```bash
git clone https://github.com/sarojkjha/aaj-marketing-skills && cd aaj-marketing-skills
node platform/mcp-worker/build.mjs       # regenerate engines.generated.mjs (also checked in CI)
node platform/mcp-worker/test.mjs        # 193 checks
cd platform/mcp-worker
npx wrangler login                       # once
npx wrangler deploy
```

Wrangler prints the address, `https://aaj-engines-mcp.<your-subdomain>.workers.dev`. The MCP endpoint is that address plus `/mcp`.

### Use mcp.aajconsult.com instead
1. Uncomment the `routes` line in `wrangler.jsonc`.
2. Run `npx wrangler deploy` again.

Cloudflare creates the DNS record and certificate, as long as aajconsult.com is on the same Cloudflare account.

### After you deploy
- **Check the server.** `curl https://<host>/health` should return the skill and engine counts.
- **Try it in Claude.** In Settings → Connectors, choose "Add custom connector" and paste `https://<host>/mcp`. Then ask: "Use the AAJ engines to check my unit economics: CAC $1,200, ARPA $300/month, 80% gross margin, 3% monthly churn."
- **Publish the address.** Send me the URL and I'll add it to the README, the skills site and the AAJ site.

### Redeploy when skills change
After skills are added or edited, run `node platform/mcp-worker/build.mjs`, then `npx wrangler deploy` again.

The `Catalog counts` workflow fails if `engines.generated.mjs` is stale, so a merged skill change will remind you.
