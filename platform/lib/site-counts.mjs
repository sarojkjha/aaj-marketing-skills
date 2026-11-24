/**
 * Free tool counts from aajconsult.com. The website owns the tools: its build counts
 * its own /tools pages (scripts/generate-content-counts.mjs there) and publishes them
 * at https://aajconsult.com/counts.json. They are copied here so counts.json can carry
 * them with no network call at build time.
 *
 *   npm run sync:tools            copy the live numbers here, then refresh counts.json
 *   npm run check:tools           fail if this copy and the live file disagree
 *
 * The "Tools count" workflow runs the check every day, so a tool added on the
 * website shows up as a failed run within a day. Do not edit by hand.
 */
export const SITE_COUNTS = {
  source: "https://aajconsult.com/counts.json",
  copied_on: "2026-11-24",
  free_tools: 58,
  skills_with_browser_tool: 49,
};
