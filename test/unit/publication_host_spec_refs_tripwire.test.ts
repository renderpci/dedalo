/**
 * THE PUBLICATION-HOST SPEC NAMES ONLY THINGS THAT EXIST (2026-10-03).
 *
 * engineering/PUBLICATION_HOST_SPEC.md is the definition six phases implement. Its
 * §3/§5.2/§7/§8 BUILT lines tell a reader WHERE each piece lives and WHICH command
 * proves it. A reader acts on those claims. A renamed module or a dropped script would
 * leave them pointing at nothing, and no other gate reads the spec. So it checks both
 * kinds of name:
 *   - Every repo path in a code span exists. Roots: src/ scripts/ publication/ test/
 *     tests/ engineering/ docs/ deploy/. A span carrying a placeholder `<…>` or a glob
 *     `*` is not a path. A path resolves against the repo root or against one of the two
 *     deployables whose own trees the spec describes (publication/host_agent,
 *     publication/server_api/v2). The spec cites the agent's `src/boot.ts` and v2's
 *     `src/routes/docs.ts` by their package-relative paths.
 *   - Every `bun run <x>` it names is a script of the root or the agent package.json,
 *     or, when it ends `.ts`, a file resolved the same way.
 * Honest limit: it proves the names exist, never that the prose about them is true.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SPEC_FILE = 'engineering/PUBLICATION_HOST_SPEC.md';
const PATH_BASES = ['', 'publication/host_agent', 'publication/server_api/v2'] as const;
const SCRIPT_MANIFESTS = ['package.json', 'publication/host_agent/package.json'] as const;
const CODE_SPAN = /`([^`\n]+)`/g;
const REPO_PATH =
	/^(?:src|scripts|publication|test|tests|engineering|docs|deploy)\/[A-Za-z0-9_./-]+$/;
const BUN_RUN = /\bbun run ([A-Za-z0-9:_./-]+)/g;

function specRefs(text: string): { paths: string[]; scripts: string[] } {
	const paths = new Set<string>();
	const scripts = new Set<string>();
	for (const match of text.matchAll(CODE_SPAN)) {
		const span = match[1] ?? '';
		if (REPO_PATH.test(span)) paths.add(span);
		for (const run of span.matchAll(BUN_RUN)) scripts.add(run[1] ?? '');
	}
	return { paths: [...paths].sort(), scripts: [...scripts].sort() };
}

function pathResolves(path: string): boolean {
	return PATH_BASES.some((base) => existsSync(join(REPO_ROOT, base, path)));
}

function knownScripts(): Set<string> {
	const names = new Set<string>();
	for (const manifest of SCRIPT_MANIFESTS) {
		const parsed = JSON.parse(readFileSync(join(REPO_ROOT, manifest), 'utf8')) as {
			scripts?: Record<string, string>;
		};
		for (const name of Object.keys(parsed.scripts ?? {})) names.add(name);
	}
	return names;
}

function scriptResolves(name: string, scripts: Set<string>): boolean {
	return name.endsWith('.ts') ? pathResolves(name) : scripts.has(name);
}

const SPEC = specRefs(readFileSync(join(REPO_ROOT, SPEC_FILE), 'utf8'));

describe('publication-host spec references', () => {
	test('positive controls: a missing path and a missing script are caught; placeholders and globs are not paths', () => {
		const planted = specRefs(
			'`src/core/publication_host/nope.ts` `bun run nope:script` `<tree>/src/x.ts` `publication/server_api/**`',
		);
		expect(planted.paths).toEqual(['src/core/publication_host/nope.ts']);
		expect(planted.scripts).toEqual(['nope:script']);
		expect(pathResolves('src/core/publication_host/nope.ts')).toBe(false);
		expect(scriptResolves('nope:script', knownScripts())).toBe(false);
		expect(pathResolves('src/boot.ts')).toBe(true);
	});

	test('anti-vacuity: the scan reads the spec (≥ 20 paths, ≥ 3 scripts)', () => {
		expect(SPEC.paths.length).toBeGreaterThanOrEqual(20);
		expect(SPEC.scripts.length).toBeGreaterThanOrEqual(3);
	});

	test('every repo path the spec names exists', () => {
		expect(SPEC.paths.filter((path) => !pathResolves(path))).toEqual([]);
	});

	test('every `bun run` script the spec names exists', () => {
		const scripts = knownScripts();
		expect(SPEC.scripts.filter((name) => !scriptResolves(name, scripts))).toEqual([]);
	});
});
