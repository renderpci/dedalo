/**
 * WHICH DOCS PAGES THE SITE ACTUALLY SERVES.
 *
 * One implementation, deliberately, because there were briefly two: the publish
 * script wrote docs/published_paths.json from its own scan while
 * docs_versioning_tripwire compared against a second scan of its own. The
 * moment `exclude_docs` entered mkdocs.yml the two disagreed — the script
 * recorded a page as published that the build had excluded, and the gate then
 * demanded a redirect for a page that had never been public.
 *
 * The gate caught it, but the cure is not a third copy of the rule: it is this
 * module, imported by both. ("Link, never duplicate", AGENTS.md.)
 *
 * Consumers: scripts/docs_publish.ts, test/unit/docs_versioning_tripwire.test.ts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

/**
 * The `exclude_docs` globs from mkdocs.yml — the paths the build skips, and so
 * the paths that are never published.
 *
 * Reads the block-scalar form (`exclude_docs: |`), one pattern per line, which
 * is the form MkDocs itself parses. A line scan rather than a YAML parse
 * because mkdocs.yml carries a `!!python/name:` tag (the mermaid superfence)
 * that a strict loader refuses.
 */
export function excludedDocsPatterns(mkdocsYml: string): string[] {
	const block = mkdocsYml.match(/^exclude_docs:\s*\|\s*\n((?:[ \t]+\S.*\n?)+)/m);
	if (!block?.[1]) return [];
	return block[1]
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '' && !l.startsWith('#'));
}

/** True when `path` (relative to docs/) is covered by an exclude_docs pattern. */
export function isExcluded(path: string, patterns: string[]): boolean {
	return patterns.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

/**
 * Page paths as the site serves them, excluded pages left out:
 * `index.md` -> ``, `core/index.md` -> `core/`, `a/b.md` -> `a/b`.
 */
export function publishedPagePaths(repoRoot: string): string[] {
	const docsDir = join(repoRoot, 'docs');
	const patterns = excludedDocsPatterns(readFileSync(join(repoRoot, 'mkdocs.yml'), 'utf8'));
	const out: string[] = [];
	for (const file of new Glob('**/*.md').scanSync({ cwd: docsDir })) {
		if (isExcluded(file, patterns)) continue;
		const noExt = file.replace(/\.md$/, '');
		out.push(noExt === 'index' ? '' : noExt.replace(/(^|\/)index$/, '$1'));
	}
	return out.sort();
}
