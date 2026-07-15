/**
 * Generates the per-site agent context file — AGENTS.md, with CLAUDE.md symlinked to it.
 *
 * This is the coding agent's brief: what it is building, where the data comes from, which
 * MCP tools it has, and the rules it must not break. Both filenames exist because the
 * drivers read different ones natively (Claude Code reads CLAUDE.md, OpenCode reads
 * AGENTS.md); the symlink keeps them one file so they cannot drift.
 *
 * The schema summary is fetched once, at create time, from the publication API's
 * discovery endpoints and embedded so the agent starts oriented rather than having to
 * probe. It is best-effort: if the API is unreachable at create time, the file still
 * generates with a note pointing at the live docs — the MCP tools give the agent the
 * schema at run time regardless.
 */

import { symlink, writeFile, rm } from 'node:fs/promises';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import type { SiteManifest } from '../sites/manifest';

const SCHEMA_FETCH_TIMEOUT_MS = 8000;

export async function writeAgentsFile(manifest: SiteManifest): Promise<void> {
  const schemaSummary = await fetchSchemaSummary();
  const body = renderAgentsMd(manifest, schemaSummary);

  const agentsPath = confinedPath(config.SITES_ROOT, manifest.slug, 'AGENTS.md');
  const claudePath = confinedPath(config.SITES_ROOT, manifest.slug, 'CLAUDE.md');

  await writeFile(agentsPath, body, 'utf8');
  // Re-point the symlink idempotently (regeneration overwrites AGENTS.md in place, but
  // the symlink may already exist).
  await rm(claudePath, { force: true }).catch(() => {});
  await symlink('AGENTS.md', claudePath).catch(() => {});
}

async function fetchSchemaSummary(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCHEMA_FETCH_TIMEOUT_MS);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.PUBLICATION_API_KEY) headers['X-API-Key'] = config.PUBLICATION_API_KEY;

    const dbRes = await fetch(`${config.PUBLICATION_API_URL}/databases`, {
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!dbRes.ok) return schemaUnavailableNote();

    const dbJson = (await dbRes.json()) as { data?: Array<{ name?: string }> };
    const dbs = (dbJson.data ?? []).map(d => d.name).filter(Boolean) as string[];
    if (dbs.length === 0) return schemaUnavailableNote();

    // Summarize the first database's tables — enough to orient; the agent uses MCP
    // get_schema for column-level detail on demand.
    const primary = dbs[0];
    const tRes = await fetch(`${config.PUBLICATION_API_URL}/${encodeURIComponent(primary)}/tables`, {
      headers,
    });
    if (!tRes.ok) return `Databases: ${dbs.join(', ')}.`;
    const tJson = (await tRes.json()) as { data?: Array<{ name?: string; row_count?: number }> };
    const tables = (tJson.data ?? [])
      .map(t => (t.name ? `- \`${t.name}\`${typeof t.row_count === 'number' ? ` (${t.row_count} rows)` : ''}` : ''))
      .filter(Boolean);

    return [
      `Databases: ${dbs.join(', ')}.`,
      '',
      `Tables in \`${primary}\`:`,
      ...tables,
    ].join('\n');
  } catch {
    return schemaUnavailableNote();
  }
}

function schemaUnavailableNote(): string {
  return `(Schema could not be fetched at scaffold time. Query it live: ${config.PUBLICATION_API_URL}/databases and the MCP \`get_schema\` tool.)`;
}

function renderAgentsMd(manifest: SiteManifest, schemaSummary: string): string {
  return `# ${manifest.name}

You are building a public website that visualizes published Dédalo data.

## What this site is

- **Name:** ${manifest.name}
- **Slug:** \`${manifest.slug}\`
- The audience is the public. Build whatever best presents the data: maps, charts,
  interactive analysis, search. Use any framework or library you like — this is not a
  Dédalo engine codebase and its conventions do not apply here.

## Data source (READ-ONLY)

All data comes from the Dédalo Publication API v2. It is read-only by construction; you
cannot and must not attempt to write.

- **Base URL:** \`${config.PUBLICATION_API_URL}\`
- **Interactive docs:** \`${config.PUBLICATION_API_URL}/docs\`
- **OpenAPI spec:** \`${config.PUBLICATION_API_URL}/openapi.yaml\`
- **MCP tools** (already wired for you): \`list_databases\`, \`get_schema\`,
  \`search_records\`, \`get_record\`, \`count_records\`, \`fulltext_search\`,
  \`get_text_fragment\`, \`get_av_fragment\`, \`get_av_indexation_fragment\`.
- Helper functions pre-pointed at this API live in \`src/lib/dedalo.ts\` — prefer them.

### Schema summary

${schemaSummary}

## Rules

- **Static output only.** Your build must emit static files to \`${manifest.build.output}/\`
  (the build command is \`${manifest.build.build}\`). No server-side code, no runtime
  backend — the site is served as static files and fetches data from the API in the
  browser.
- **No secrets.** Never hardcode API keys, tokens or credentials. The publication API is
  public; it needs none.
- **Do not edit** \`site.json\`, \`AGENTS.md\`, \`CLAUDE.md\`, or anything under
  \`.builder/\` — those are owned by the platform.
- Keep data fetching client-side and resilient: the API paginates (\`limit\`/\`offset\`)
  and rate-limits; handle empty results and errors gracefully.
`;
}
