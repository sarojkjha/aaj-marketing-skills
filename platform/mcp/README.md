# AAJ Engines — MCP server

Gives any MCP client direct access to the AAJ marketing skills and their runnable
engines. An agent can find the right method for a problem, read its input schema,
and run it on real numbers — instead of estimating.

Five tools:

| Tool | What it does |
|---|---|
| `list_engines` | Every runnable engine, grouped by category |
| `describe_engine` | One engine's input schema, units and worked example |
| `run_engine` | Runs it on your numbers, or `--demo` for the worked example |
| `search_skills` | Finds a skill by the problem, not the name |
| `get_skill` | The full method for one skill |

No dependencies. No build step. No network calls — every engine is a local,
deterministic Node script, so nothing you pass it leaves your machine.

## Install

Clone the repo, then point your MCP client at `platform/mcp/server.mjs`.
Node 18 or newer.

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aaj-engines": {
      "command": "node",
      "args": ["/absolute/path/to/aaj-marketing-skills/platform/mcp/server.mjs"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add aaj-engines -- node /absolute/path/to/aaj-marketing-skills/platform/mcp/server.mjs
```

**Cursor** — `.cursor/mcp.json`, same shape as Claude Desktop.

Windows paths need escaped backslashes in JSON (`C:\\dev\\aaj-marketing-skills\\...`)
or plain forward slashes, which Node accepts.

Restart the client. It should report five tools under `aaj-engines`.

## Using it

The engines validate their input and fail loudly. A gross margin passed as `0.75`
when the engine expects `75` is reported as an error, not absorbed into a
confident wrong answer — so an agent that guesses the schema gets corrected
rather than believed.

```
list_engines
  → unit-economics, pipeline-and-forecast, paid-media-budget-allocation, …

describe_engine { "engine": "unit-economics" }
  → required fields, units, alternative shapes, a worked example

run_engine { "engine": "unit-economics",
             "input": { "model": "subscription", "arpaMonthly": 800,
                        "grossMargin": 75, "churnMonthly": 2, "cac": 6000 } }
  → LTV $30,000 · LTV:CAC 5:1 · payback 10 mo, with the verdict
```

Omit `input` to run the engine's demo. A few engines take a named mode as a
plain string (`"design"`, `"readout"`); `describe_engine` says which.

## Adding an engine

Nothing to register. The server reads `skills/` at startup: any skill directory
with a `resources/*.js` file becomes an engine, its id is the skill slug, and its
schema is the header comment that `--help` already prints. Adding skill number 44
needs no change to this server, and there is no manifest to fall out of sync.

## Troubleshooting

**"0 skills, 0 engines" on stderr** — the server resolves the repo as two levels
above itself. If you've moved the file, set `AAJ_SKILLS_ROOT` to the repo root:

```json
{ "command": "node",
  "args": ["/path/to/server.mjs"],
  "env": { "AAJ_SKILLS_ROOT": "/path/to/aaj-marketing-skills" } }
```

**An engine hangs** — it's killed after 30 seconds and reported as a timeout.
Engine output is capped at 120 KB.

**Checking it by hand** — the server speaks JSON-RPC 2.0 over newline-delimited
JSON on stdin:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node platform/mcp/server.mjs
```

Protocol traffic goes to stdout; diagnostics go to stderr, so the two never mix.

---

Methods and the free tools behind these engines: <https://aajconsult.com/hub> ·
<https://skills.aajconsult.com>
