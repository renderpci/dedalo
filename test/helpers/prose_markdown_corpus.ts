/**
 * THE PROSE MARKDOWN CORPUS — every `*.md` an operator or developer reads as
 * instructions: the manual (`docs/`) and the engineering definitions
 * (`engineering/`). For gates that census what those pages TELL a reader to
 * run (a fenced systemd unit, a command) — not the mkdocs site set, which is
 * scripts/lib/docs_paths.ts (docs/ minus `exclude_docs`, no engineering/).
 *
 * `census_derivation_tripwire` refuses a gate that chooses its own walk root
 * in-file. The roots live HERE; zero-argument on purpose — a parameterized
 * lister hands the root choice back to the caller.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The prose roots. The ONLY place they are named. */
const PROSE_ROOTS = [join(REPO_ROOT, 'docs'), join(REPO_ROOT, 'engineering')];

function markdownUnder(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...markdownUnder(path));
		else if (entry.name.endsWith('.md')) out.push(path);
	}
	return out;
}

/** Every `*.md` under docs/ and engineering/, absolute, sorted. */
export function proseMarkdownFiles(): string[] {
	return PROSE_ROOTS.flatMap((root) => markdownUnder(root)).sort();
}
