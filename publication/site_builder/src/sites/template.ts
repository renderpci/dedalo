/**
 * Scaffolding a new site from a starter template.
 *
 * Templates ship with the daemon under templates/<name>/. Scaffolding copies the tree
 * into the workspace and substitutes a small set of placeholders (currently just the
 * publication API URL, so the starter's fetch helpers point at the right data source
 * without the agent having to wire them). Placeholder substitution is applied to text
 * files only, by extension allowlist — a binary asset in a template is copied verbatim.
 *
 * The template list is discovered from the templates/ directory at import; adding a
 * template is dropping a directory there (with a template.json), no code change.
 */

import { cp, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';

// Resolved relative to this source file so it works regardless of cwd.
const TEMPLATES_DIR = new URL('../../templates/', import.meta.url).pathname;

const SUBSTITUTE_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.css', '.less', '.scss', '.json', '.md', '.txt', '.svg', '.xml',
]);

/** Local build state that may exist in a template dir but is never site content. */
const EXCLUDED_FROM_SCAFFOLD = new Set(['node_modules', '.git']);

export interface TemplateInfo {
  id: string;
  label: string;
  description: string;
}

/** Lists the templates shipped with the daemon (directories under templates/). */
export async function listTemplates(): Promise<TemplateInfo[]> {
  if (!existsSync(TEMPLATES_DIR)) return [];
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const templates: TemplateInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(TEMPLATES_DIR, entry.name, 'template.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8')) as Partial<TemplateInfo>;
      templates.push({
        id: entry.name,
        label: meta.label ?? entry.name,
        description: meta.description ?? '',
      });
    } catch {
      // A template with an unreadable template.json is skipped, not fatal.
    }
  }
  return templates;
}

export async function templateExists(id: string): Promise<boolean> {
  const templates = await listTemplates();
  return templates.some(t => t.id === id);
}

/**
 * Copies template `id` into the workspace for `slug` and substitutes placeholders.
 * The workspace directory must already exist (workspace.ts creates it). template.json
 * is not copied into the site — it is daemon metadata, not site content.
 */
export async function scaffold(slug: string, templateId: string): Promise<void> {
  const src = join(TEMPLATES_DIR, templateId);
  if (!existsSync(src)) {
    throw new Error(`scaffold: unknown template '${templateId}'`);
  }
  const dest = confinedPath(config.SITES_ROOT, slug);

  await cp(src, dest, {
    recursive: true,
    filter: source => {
      if (source.endsWith(`${templateId}/template.json`)) return false;
      // A template directory is a source tree, but nothing stops a developer from
      // running `bun install` inside it (refreshing its lockfile does exactly that).
      // Both of these are local build state, never site content, and copying them
      // would clone a whole node_modules into every scaffolded site. Returning false
      // for a directory prunes the subtree, so this costs one check per entry.
      // substituteTree() skips the same two names.
      return !EXCLUDED_FROM_SCAFFOLD.has(basename(source));
    },
  });

  await substituteTree(dest);
}

const PLACEHOLDERS: Record<string, string> = {
  __PUBLICATION_API_URL__: config.PUBLICATION_API_URL,
};

async function substituteTree(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      await substituteTree(full);
      continue;
    }
    if (!SUBSTITUTE_EXTENSIONS.has(extname(entry.name))) continue;
    const info = await stat(full);
    if (info.size > 1_000_000) continue; // do not rewrite large files
    let text = await readFile(full, 'utf8');
    let changed = false;
    for (const [needle, value] of Object.entries(PLACEHOLDERS)) {
      if (text.includes(needle)) {
        text = text.replaceAll(needle, value);
        changed = true;
      }
    }
    if (changed) await writeFile(full, text, 'utf8');
  }
}
