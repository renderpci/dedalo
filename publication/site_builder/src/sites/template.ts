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

import { cp, readdir, readFile, stat } from 'node:fs/promises';
import { applySharedModes, readFileShared, writeFileShared } from '../util/shared_tree';
import { existsSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
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

  await substituteTree(dest, dest);
  // `cp` carries the TEMPLATE's modes into the workspace, and the daemon's umask decides
  // the rest — neither of them knows that a second uid works in this tree. Stated here
  // instead: every scaffolded directory and file is the shared pair (2770/0660).
  await applySharedModes(dest);
}

const PLACEHOLDERS: Record<string, string> = {
  __PUBLICATION_API_URL__: config.PUBLICATION_API_URL,
};

/**
 * `root` is the workspace this daemon just created (trusted); `dir` is somewhere inside it.
 * The rewrite goes through `writeFileShared`, which re-walks the components below `root`
 * with O_NOFOLLOW — a template that ships a symlink is refused, never followed out.
 */
async function substituteTree(root: string, dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      await substituteTree(root, full);
      continue;
    }
    if (!SUBSTITUTE_EXTENSIONS.has(extname(entry.name))) continue;
    const info = await stat(full);
    if (info.size > 1_000_000) continue; // do not rewrite large files
    // Read through the same door it is written through: `dir` is inside the workspace, so a
    // template that ships (or a race that plants) a link is refused rather than followed out.
    const text0 = await readFileShared(root, relative(root, full));
    if (text0 === null) continue;
    let text = text0;
    let changed = false;
    for (const [needle, value] of Object.entries(PLACEHOLDERS)) {
      if (text.includes(needle)) {
        text = text.replaceAll(needle, value);
        changed = true;
      }
    }
    if (changed) await writeFileShared(root, relative(root, full), text);
  }
}
