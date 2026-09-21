/**
 * THE BROWSER CORPUS — the one lister that owns the browser trees.
 *
 * `client/` and `tools/**\/js` are source (AGENTS.md: the client is the
 * PRIMARY, TS-OWNED client source), so every gate that scans them must scan
 * the SAME files. Three gates each grew their own walk — a corpus that can
 * drift per gate is a census nobody can trust, and `census_derivation_tripwire`
 * refuses a gate that chooses its own root in-file. This module owns the roots;
 * the gates import a shape and never name a directory.
 *
 * Two shapes, because the two censuses are legitimately different:
 *   `browserSources()`        — git's view: tracked AND untracked (a module not
 *                               yet `git add`ed is still SERVED), never ignored.
 *   `firstPartyClientFiles()` — the on-disk walk of first-party code only: the
 *                               app client plus every tool client, with the
 *                               vendored, test and server subtrees skipped.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The browser roots. The ONLY place they are named. */
export const CLIENT_JS_ROOTS = ['client', 'tools'];

/** Not first-party client code: vendored libraries, the suites, server code. */
const SKIP_DIRS = new Set(['lib', 'node_modules', 'test', 'server']);

/**
 * Every .js under the browser trees, excluding vendored libraries — tracked AND
 * untracked (a module not yet `git add`ed is still served), never ignored.
 */
export const browserSources = (): string[] =>
	execFileSync(
		'git',
		[
			'ls-files',
			'--cached',
			'--others',
			'--exclude-standard',
			'--',
			...CLIENT_JS_ROOTS.map((r) => `${r}/**/*.js`),
		],
		{
			cwd: REPO_ROOT,
			encoding: 'utf8',
		},
	)
		.split('\n')
		.filter(Boolean)
		.filter((f) => !/\/(lib|vendor|node_modules)\/|\.min\.js$/.test(f));

function walk(dir: string, out: string[]): void {
	for (const name of readdirSync(dir).sort()) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (!SKIP_DIRS.has(name)) walk(path, out);
		} else if (name.endsWith('.js')) {
			out.push(path);
		}
	}
}

/** Every first-party client .js file: the app client + every tool's client. */
export function firstPartyClientFiles(): string[] {
	const out: string[] = [];
	walk(join(REPO_ROOT, 'client/dedalo'), out);
	walk(join(REPO_ROOT, 'tools'), out);
	return out.map((p) => relative(REPO_ROOT, p)).sort();
}
