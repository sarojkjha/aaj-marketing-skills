# Install and run AAJ skills and engines: every agent, step by step

## Start here: pick one of three routes

The fastest way to use an AAJ engine is to add the hosted server to your AI client: no install, no sign-in, about a minute. If you want the skills themselves in your project, install them with one command. If you cannot use a terminal, copy the folders by hand.

| Route | What you need | Best for | Where your numbers go |
|---|---|---|---|
| 1. Hosted MCP server | An MCP client (Claude, Claude Code, Cursor and others) | Trying an engine now | To AAJ's server over HTTPS, run in memory, no copy kept |
| 2. Install the skills | Node 18 or later, any agent in the table below | Using the skills and engines inside a project | Stay on your machine; your agent's model provider still sees what you type |
| 3. Copy the folders by hand | A browser and File Explorer or Finder | People who cannot or do not want to use a terminal | Same as route 2 |

AAJ has 73 skills, and 62 of them have an engine: a script that takes your numbers and returns a number and a verdict, the same answer every time. The 11 skills without an engine give the method only.

Every answer built on an AAJ skill should open with an "AAJ ... engine result:" line and show the engine's output. If yours does not, see Troubleshooting.

## Route 1: add the hosted MCP server (no install)

The server address is the same for every client:

```
https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp
```

It needs no sign-in and gives your agent five tools: `list_engines`, `describe_engine`, `run_engine`, `search_skills` and `get_skill`. It runs the engines in memory and keeps no copy of what you send.

### Claude (web and desktop app)

1. Open **Settings**, then **Connectors**.
2. Click **Add custom connector**.
3. Paste the address above, name it "AAJ Marketing Engines", and save.
4. Start a new chat and ask: "Use the AAJ engines to check my unit economics: CAC $1,200, ARPA $300 a month, 80% gross margin, 3% monthly churn."

### Claude Code

1. In a terminal, run: `claude mcp add --transport http aaj-engines https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp`
2. Start Claude Code and run `/mcp` to confirm `aaj-engines` is connected.
3. Ask the same question as above.

### ChatGPT, Cursor, Windsurf and other MCP clients

1. Open your client's settings for MCP servers or custom connectors. The name varies by client.
2. Add a **remote** server of type **Streamable HTTP** with the address above, and no authentication.
3. Ask the same question and check that the answer shows the engine's output.

AAJ has verified the hosted server from Claude. The steps for the other clients follow each product's usual way of adding a remote server and have **not yet been tested by AAJ**; if a client asks for a different setting name, use its own documentation for adding a remote MCP server.

### If you prefer a local server

The same five tools can run on your machine, so AAJ receives nothing. It needs Node 18 or later and a clone of the repository.

1. Download or clone `github.com/sarojkjha/aaj-marketing-skills`.
2. Add this to your client's MCP settings, with the real path to the file:

```
{
  "mcpServers": {
    "aaj-engines": {
      "command": "node",
      "args": ["/absolute/path/to/aaj-marketing-skills/platform/mcp/server.mjs"]
    }
  }
}
```

On Windows, write the path with forward slashes or doubled backslashes, for example `C:/Users/you/aaj-marketing-skills/platform/mcp/server.mjs`.

## Route 2: install the skills with one command

This needs [Node.js](https://nodejs.org) 18 or later. Check with `node --version`. The command installs the skills into the **folder you run it from**, so choose that folder first.

### Windows (Command Prompt)

1. Press the Windows key, type `cmd`, and open **Command Prompt** the normal way. Do **not** choose "Run as administrator". Windows blocks the installer from writing into protected folders, and an administrator window opens in `C:\Windows\System32`, where the install fails with `EPERM: operation not permitted`.
2. Make a project folder and go into it:

```
cd %USERPROFILE%
mkdir aaj-demo
cd aaj-demo
```

1. Install one skill, for example the A/B test engine:

```
npx skills add sarojkjha/aaj-marketing-skills --skill ab-test-significance
```

1. When it asks **Which agents do you want to install to?**, pick only the agent you will use (see the table in the next section). Choose **Project** scope and **Symlink**, then answer Yes.
2. Check that the folder `aaj-demo\.agents\skills\ab-test-significance` now exists.
3. If the installer reports that it cannot create symlinks, run it again and add `--copy`. Windows only allows symlinks in some setups.

PowerShell works too, if you run it from your own folder and not as administrator. The commands are the same.

### Mac and Linux (Terminal)

1. Open Terminal.
2. Make a project folder and go into it:

```
mkdir -p ~/aaj-demo && cd ~/aaj-demo
```

1. Run the same install command:

```
npx skills add sarojkjha/aaj-marketing-skills --skill ab-test-significance
```

1. Pick your agent, choose **Project** scope and **Symlink**, and answer Yes.
2. Check with `ls .agents/skills`.

### Useful variations

| What you want | Command |
|---|---|
| See every skill available | `npx skills add sarojkjha/aaj-marketing-skills --list` |
| Install all 73 skills | `npx skills add sarojkjha/aaj-marketing-skills --skill ``"*"` |
| Install for one agent without the picker | `npx skills add sarojkjha/aaj-marketing-skills --skill unit-economics --agent claude-code --yes` |
| Install for your user, so every project has it | add `--global` |
| Copy the files instead of linking them | add `--copy` |

The agent names for `--agent` are in the table in the next section.

### Claude Code and Codex plugins (an alternative to the command)

The plugin adds all 73 skills and also starts the local MCP server, so Claude can call `run_engine` directly. It runs on your machine and AAJ receives nothing.

- **Claude Code** (version 2.1.275 or later): `/plugin marketplace add sarojkjha/aaj-marketing-skills`, then `/plugin install aaj-marketing-skills@aaj`. Skills then appear as `/aaj-marketing-skills:<skill>`.
- **Codex:** `codex plugin marketplace add sarojkjha/aaj-marketing-skills`, then `codex plugin add aaj-marketing-skills@aaj`.

## Route 3: copy the folders by hand (no terminal)

This does the same thing as the command, using a download and File Explorer or Finder.

1. Download the repository as a zip file: [github.com/sarojkjha/aaj-marketing-skills/archive/refs/heads/main.zip](https://github.com/sarojkjha/aaj-marketing-skills/archive/refs/heads/main.zip).
2. Unzip it. Inside, open the folder called `skills`. Each skill is one folder, for example `ab-test-significance` or `unit-economics`.
3. In your own user folder, make a project folder called `aaj-demo`. Inside it, make a folder called `.agents`, and inside that a folder called `skills`. On Windows, File Explorer may refuse a name that starts with a dot. Type `.agents.` with a dot at the end and it will accept it.
4. Copy the skill folders you want from the zip's `skills` folder into `aaj-demo/.agents/skills`.
5. Check which folder your agent reads in the table below. If it is not `.agents/skills`, copy the same folders there as well. Claude Code reads `.claude/skills`.
6. Keep the copy in `.agents/skills` even if your agent reads another folder. The skill files point to `.agents/skills/<skill>/resources/` when they run an engine.
7. Open `aaj-demo` as the working folder in your agent, then run your first engine (see below).

The zip always holds the latest version. To update, download it again and replace the folders.

## Every agent: where its skills live

The installer supports the agents below. Use the **`--agent`**** value** with `--agent`, and use the folders if you copy by hand (route 3). Project folders are relative to the folder you open in the agent; global folders sit in your home folder (`~`, which is `C:\Users\<you>` on Windows).

AAJ has tested the skills in **Claude Code** and in Codex on Windows (the ab-test-significance skill only). Every other row comes from the installer's own list of agents and has **not yet been tested by AAJ**. Agents that read `.agents/skills` are the easiest, because the default install already puts the skills there.

| Agent | `--agent` value | Project folder | Global folder |
|---|---|---|---|
| Amp, Replit, Universal | `amp`, `replit`, `universal` | `.agents/skills/` | `~/.config/agents/skills/` |
| Antigravity | `antigravity` | `.agents/skills/` | `~/.gemini/antigravity/skills/` |
| Antigravity CLI | `antigravity-cli` | `.agents/skills/` | `~/.gemini/antigravity-cli/skills/` |
| Cline, Dexto, Kimi Code CLI, Loaf, Warp, Zed | `cline`, `dexto`, `kimi-code-cli`, `loaf`, `warp`, `zed` | `.agents/skills/` | `~/.agents/skills/` |
| Codex (tested on Windows with `ab-test-significance`) | `codex` | `.agents/skills/` | `~/.codex/skills/` |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` |
| Deep Agents | `deepagents` | `.agents/skills/` | `~/.deepagents/agent/skills/` |
| Firebender | `firebender` | `.agents/skills/` | `~/.firebender/skills/` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `~/.gemini/skills/` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` |
| OpenCode | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` |
| PromptScript | `promptscript` | `.agents/skills/` | project only |
| **Claude Code** (tested) | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| AdaL | `adal` | `.adal/skills/` | `~/.adal/skills/` |
| AiderDesk | `aider-desk` | `.aider-desk/skills/` | `~/.aider-desk/skills/` |
| AstrBot | `astrbot` | `data/skills/` | `~/.astrbot/data/skills/` |
| Augment | `augment` | `.augment/skills/` | `~/.augment/skills/` |
| Autohand Code CLI | `autohand-code` | `.autohand/skills/` | `~/.autohand/skills/` |
| IBM Bob | `bob` | `.bob/skills/` | `~/.bob/skills/` |
| CodeArts Agent | `codearts-agent` | `.codeartsdoer/skills/` | `~/.codeartsdoer/skills/` |
| CodeBuddy | `codebuddy` | `.codebuddy/skills/` | `~/.codebuddy/skills/` |
| Codemaker | `codemaker` | `.codemaker/skills/` | `~/.codemaker/skills/` |
| Code Studio | `codestudio` | `.codestudio/skills/` | `~/.codestudio/skills/` |
| Command Code | `command-code` | `.commandcode/skills/` | `~/.commandcode/skills/` |
| Continue | `continue` | `.continue/skills/` | `~/.continue/skills/` |
| Cortex Code | `cortex` | `.cortex/skills/` | `~/.snowflake/cortex/skills/` |
| Crush | `crush` | `.crush/skills/` | `~/.config/crush/skills/` |
| Devin for Terminal | `devin` | `.devin/skills/` | `~/.config/devin/skills/` |
| Droid | `droid` | `.factory/skills/` | `~/.factory/skills/` |
| Eve | `eve` | `agent/skills/` | project only |
| ForgeCode | `forgecode` | `.forge/skills/` | `~/.forge/skills/` |
| Goose | `goose` | `.goose/skills/` | `~/.config/goose/skills/` |
| Grok Build | `grok` | `.grok/skills/` | `~/.grok/skills/` |
| Hermes Agent | `hermes-agent` | `.hermes/skills/` | `~/.hermes/skills/` |
| inference.sh | `inference-sh` | `.inferencesh/skills/` | `~/.inferencesh/skills/` |
| Jazz | `jazz` | `.jazz/skills/` | `~/.jazz/skills/` |
| Junie | `junie` | `.junie/skills/` | `~/.junie/skills/` |
| iFlow CLI | `iflow-cli` | `.iflow/skills/` | `~/.iflow/skills/` |
| Kilo Code | `kilo` | `.kilocode/skills/` | `~/.kilocode/skills/` |
| Kimchi | `kimchi` | `.kimchi/skills/` | `~/.config/kimchi/harness/skills/` |
| Kiro CLI | `kiro-cli` | `.kiro/skills/` | `~/.kiro/skills/` |
| Kode | `kode` | `.kode/skills/` | `~/.kode/skills/` |
| Lingma | `lingma` | `.lingma/skills/` | `~/.lingma/skills/` |
| MCPJam | `mcpjam` | `.mcpjam/skills/` | `~/.mcpjam/skills/` |
| MiniMax Code | `minimax-code` | `.minimax/skills/` | `~/.minimax/skills/` |
| Mistral Vibe | `mistral-vibe` | `.vibe/skills/` | `~/.vibe/skills/` |
| Moxby | `moxby` | `.moxby/skills/` | `~/.moxby/skills/` |
| Mux | `mux` | `.mux/skills/` | `~/.mux/skills/` |
| Neovate | `neovate` | `.neovate/skills/` | `~/.neovate/skills/` |
| OpenClaw | `openclaw` | `skills/` | `~/.openclaw/skills/` |
| OpenHands | `openhands` | `.openhands/skills/` | `~/.openhands/skills/` |
| Ona | `ona` | `.ona/skills/` | `~/.ona/skills/` |
| Pi | `pi` | `.pi/skills/` | `~/.pi/agent/skills/` |
| Pochi | `pochi` | `.pochi/skills/` | `~/.pochi/skills/` |
| Qoder | `qoder` | `.qoder/skills/` | `~/.qoder/skills/` |
| Qoder CN | `qoder-cn` | `.qoder/skills/` | `~/.qoder-cn/skills/` |
| Qwen Code | `qwen-code` | `.qwen/skills/` | `~/.qwen/skills/` |
| Reasonix | `reasonix` | `.reasonix/skills/` | `~/.reasonix/skills/` |
| Rovo Dev | `rovodev` | `.rovodev/skills/` | `~/.rovodev/skills/` |
| Roo Code | `roo` | `.roo/skills/` | `~/.roo/skills/` |
| Tabnine CLI | `tabnine-cli` | `.tabnine/agent/skills/` | `~/.tabnine/agent/skills/` |
| Terramind | `terramind` | `.terramind/skills/` | `~/.terramind/skills/` |
| Tinycloud | `tinycloud` | `.tinycloud/skills/` | `~/.tinycloud/skills/` |
| Trae | `trae` | `.trae/skills/` | `~/.trae/skills/` |
| Trae CN | `trae-cn` | `.trae/skills/` | `~/.trae-cn/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| ZCode | `zcode` | `.zcode/skills/` | `~/.zcode/skills/` |
| Zencoder, Zenflow | `zencoder`, `zenflow` | `.zencoder/skills/` | `~/.zencoder/skills/` |

Source: the [skills installer's agent list](https://github.com/vercel-labs/skills/blob/main/README.md), read on Oct 27, 2026. The list changes as agents are added, so check the installer's own help (`npx skills add --help`) for the current one.

No agent on the list? The folder is usually in that agent's own documentation under "skills". Copy the skill folders there, and keep the `.agents/skills` copy as well.

## Run your first engine

Open the `aaj-demo` folder as the working folder in your agent, then ask it a question in plain words and name the engine. This example uses the A/B test engine:

```
Use the AAJ ab-test-significance engine. Control: 3,000 visitors, 120 conversions. Variant: 3,000 visitors, 150 conversions. Significant at 95%?
```

A correct answer has four parts:

1. **An opening line that names AAJ:** "AAJ `ab-test-significance` engine result:".
2. **The engine's own output block, unchanged:**

```
AAJ A/B Test — significance
----------------------------------------------
Control   4%   (120/3000)
Variant   5%   (150/3000)
Relative lift  +25%   (abs +1%)
z = 1.87   p = 0.0617   (two-tailed, 95% threshold)

✗ NOT significant at 95% (p 0.062 ≥ 0.05). Keep running or treat as no detected difference.
```

1. **A plain-language reading under it:** a 25% lift, but not enough evidence yet, so keep the test running.
2. **A Method line** pointing to `https://skills.aajconsult.com/skills/ab-test-significance`.

Two more to try, with their results:

| Skill | Ask | The engine returns |
|---|---|---|
| `unit-economics` | Subscription, $400 a month per customer, 80% gross margin, 3% monthly churn, CAC $3,000. Are my unit economics healthy? | LTV $10,667, LTV:CAC 3.6:1, payback 9.4 months, both checks pass |
| `pipeline-and-forecast` | Target $400,000, win rate 25%. Deals: $300,000 and $250,000 in Discovery, $200,000 in Qualified, $150,000 in Proposal, $100,000 in Negotiation. Stage probabilities 10%, 25%, 50% and 75%. Enough pipeline? | Weighted forecast $255,000, coverage 2.5x against about 4x needed, gap $145,000, lever: advance deals |

To see all engines, ask your agent to list them, or open the [skills catalog](https://skills.aajconsult.com).

### Run an engine by hand (any computer with Node)

You can also run the script yourself, with no agent. From the `aaj-demo` folder:

```
node .agents/skills/ab-test-significance/resources/significance.js --demo
```

To use your own numbers, pass a JSON object. On Mac and Linux, wrap it in single quotes. On Windows Command Prompt, wrap it in double quotes and escape the inner ones:

```
node .agents/skills/ab-test-significance/resources/significance.js "{\"control\":{\"visitors\":3000,\"conversions\":120},\"variant\":{\"visitors\":3000,\"conversions\":150},\"confidence\":95}"
```

Every engine also accepts `--help`, which prints its inputs, units and a worked example.

## Troubleshooting

| What you see | Why | What to do |
|---|---|---|
| `EPERM: operation not permitted, mkdir 'C:\Windows\System32\.agents'` | You ran the install from `C:\Windows\System32`, which is where an administrator window starts. Windows blocks writing there. | Close the window. Open a normal Command Prompt (not as administrator), run `cd %USERPROFILE%`, make a folder, go into it, and run the install again. |
| `Failed to install` for many agents at once | The installer tries every agent you selected, so one cause shows 60 times. | Fix the cause above, then pick only the agent you use. |
| The installer cannot create symlinks (Windows) | Windows allows symlinks only in some setups. | Run the install again with `--copy`. |
| `Invalid JSON. Run --help.` when running an engine by hand | The shell passed the quotes in your JSON wrongly. | On Mac and Linux wrap the JSON in single quotes. On Windows Command Prompt use double quotes and escape the inner ones as `\"`. Engines installed after Oct 27, 2026 also accept the PowerShell style `{\"a\":1}`. If it still fails, run `--demo` first to check the engine works. |
| The agent answers without running an engine, and without an "AAJ ... engine result:" line | The skill was not loaded: it is in the wrong folder, or the agent was opened in a different folder. | Check the skill folder exists in the folder you opened (see the agent table). Name the engine in your question: "Use the AAJ ab-test-significance engine". |
| The agent says it cannot find `.agents/skills/<skill>/resources/...` | The skill is in `.claude/skills` or another folder, but the engine path in the skill points to `.agents/skills`. | Copy the skill folder into `.agents/skills` as well. The default install does this. |
| `node` is not recognised | Node.js is not installed, or the window was open before you installed it. | Install Node.js 18 or later from nodejs.org, close the window, and open a new one. |
| The hosted server does not appear in your client | The client does not accept remote servers on your plan or version. | Use route 2 or the local server in route 1. |

When the skill and your own agent disagree, the engine's output is the AAJ result. Anything the agent adds under it, such as a confidence interval the engine does not print, is the agent's own estimate and should be labelled that way.

Still stuck? Email [saroj@aajconsult.com](mailto:saroj@aajconsult.com) with the exact text of the error and the agent you used.

This guide is also published at https://skills.aajconsult.com/install.
