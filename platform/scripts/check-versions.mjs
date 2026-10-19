// Fails when the version in package.json, the Claude plugin manifest, the MCP
// registry entry (server.json) and the MCP server (platform/mcp/core.mjs) disagree.
// The Claude plugin directory and the MCP registry both list the version, and a
// registry update needs a new one, so they move together. Bump all four at once.
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const found = {
  "package.json": JSON.parse(read("package.json")).version,
  ".claude-plugin/plugin.json": JSON.parse(read(".claude-plugin/plugin.json")).version,
  "server.json": JSON.parse(read("server.json")).version,
  "platform/mcp/core.mjs": (read("platform/mcp/core.mjs").match(/SERVER_VERSION\s*=\s*"([^"]+)"/) || [])[1],
};
const versions = new Set(Object.values(found));
if (versions.size !== 1 || versions.has(undefined)) {
  console.error("Versions disagree:\n" + Object.entries(found).map(([f, v]) => `  ${f}: ${v}`).join("\n"));
  process.exit(1);
}
console.log(`All versions agree: ${[...versions][0]}`);
