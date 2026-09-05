/**
 * SITE-BUILDER PATH & FRAME DISCIPLINE TRIPWIRE (DEC-12) — closes PUB-10 + PUB-11.
 *
 * TWO LAWS, both of which were broken by a single omitted call each.
 *
 * 1. CONFINEMENT IS NOT UNDONE ONE SEGMENT LATER.
 *    `publication/site_builder/src/util/paths.ts` is the daemon's confinement door, and
 *    `build/promote.ts` already spells the law in prose: "confinedPath, never join". It was
 *    obeyed for the SLUG and dropped for the last segment — `join(buildsDir(slug), id +
 *    '.json')` and `join(sessionsDir(slug), sessionId + '.jsonl')`. The router
 *    `decodeURIComponent`s each URL segment, so a build/session id spelling a traversal
 *    chain resolved OUTSIDE the confined directory and the daemon read (and returned) an
 *    arbitrary host `.json`/`.log`. Confining the root and then joining onto it is worth
 *    nothing; the law this gate enforces is therefore about the ROOT, not about the
 *    segment's spelling: NO `join`/`resolve` from `node:path` may take a confined root as
 *    its first argument, literal segments included. A path inside a confined root is built
 *    by `confinedPath`/`confinedRealPath` or it is not built.
 *
 * 2. THE AGENT PREVIEW FRAME CARRIES NO SAME-ORIGIN ESCAPE.
 *    `tools/tool_sitebuilder/js/sitebuilder_controller.js` frames arbitrary agent-generated
 *    HTML/JS. `sandbox='allow-scripts allow-same-origin'` is the known-dangerous pair: it
 *    buys nothing while preprod is a separate host and hands the framed agent script the
 *    ENGINE ORIGIN (operator session cookie, API as the operator) the day preprod is
 *    co-located. Safety must come from the attribute, never from a deployment assumption.
 *
 * CENSUS: TOTAL on both sides — every `.ts` under `publication/site_builder/src/` and every
 * `.js` under `tools/tool_sitebuilder/js/`, derived by walking the tree, each with a corpus
 * floor so a broken walk or regex cannot pass as a clean scan. Both exemption maps are
 * ENUMERATED, carry a per-entry reason, are asserted to be non-stale, and are shrink-only.
 *
 * HONEST LIMIT: this is a source-shape law, not a runtime proof. That a traversal id
 * REFUSES and reads nothing is asserted behaviourally in the daemon's own suite
 * (`publication/site_builder/tests/build.test.ts`, `tests/sessions.test.ts`), and that the
 * browser honours a sandbox attribute is the browser's contract, not ours. The scanner
 * reads text, so a path assembled by string concatenation or through a helper this gate
 * does not know is outside its reach — which is why the daemon suite holds the behaviour.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
	SITE_BUILDER_SRC,
	SITE_BUILDER_TOOL_JS,
	siteBuilderDaemonFiles,
	siteBuilderToolFiles,
} from '../helpers/publication_corpus.ts';

const REPO_ROOT = resolve(import.meta.dir, '../..');
// The two roots are the shared lister's — named there, never here.
const DAEMON_SRC = SITE_BUILDER_SRC;
const TOOL_JS = SITE_BUILDER_TOOL_JS;

/** Corpus floors — measured 2026-09: 60 daemon sources, 6 tool scripts. */
const DAEMON_FILE_FLOOR = 50;
const DAEMON_PATH_CALL_FLOOR = 40;
const TOOL_FILE_FLOOR = 5;

// ---------------------------------------------------------------------------
// Law 1 — the scanner
// ---------------------------------------------------------------------------

interface PathCall {
	/** `join` or `resolve`. */
	fn: string;
	/** The first argument, whitespace-normalized: the ROOT the path is built on. */
	root: string;
}

/** Reads the balanced-paren argument text starting at the '(' index. */
function argsOf(source: string, openParen: number): string | null {
	let depth = 0;
	for (let i = openParen; i < source.length; i++) {
		const char = source[i];
		if (char === '(') depth++;
		else if (char === ')') {
			depth--;
			if (depth === 0) return source.slice(openParen + 1, i);
		}
	}
	return null;
}

/** Splits an argument list on TOP-LEVEL commas (parens, braces, brackets nested). */
function splitArgs(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '(' || char === '[' || char === '{') depth++;
		else if (char === ')' || char === ']' || char === '}') depth--;
		else if (char === ',' && depth === 0) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim().replace(/\s+/g, ' '));
}

/** Every bare `join(`/`resolve(` call (never `array.join(`), with its root argument. */
function pathCalls(source: string): PathCall[] {
	const calls: PathCall[] = [];
	const pattern = /(^|[^.\w$])(join|resolve)\s*\(/g;
	for (const match of source.matchAll(pattern)) {
		const fn = match[2] ?? '';
		const openParen = (match.index ?? 0) + match[0].length - 1;
		const args = argsOf(source, openParen);
		if (args === null) continue;
		const parts = splitArgs(args);
		// A one-argument `resolve(x)` APPENDS nothing — it normalizes a path that is already
		// whatever it is. Only a call that adds a segment can carry one out of a root.
		if (parts.length < 2) continue;
		const root = parts[0] ?? '';
		if (root === '') continue;
		calls.push({ fn, root });
	}
	return calls;
}

/**
 * The set of expressions that name a CONFINED ROOT in this file: the multi-tenant
 * workspace root itself, any release store, any inline confinement call, and any local
 * binding (const/let or a helper function) whose value is one of those.
 */
function confinedRoots(source: string): RegExp[] {
	const names = new Set<string>();
	for (const match of source.matchAll(
		/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*confined(?:Real)?Path\s*\(/g,
	)) {
		names.add(match[1] ?? '');
	}
	// A helper whose body's first statement returns a confined path — buildsDir, sessionsDir,
	// workspaceDir. Matched as a call, so `NAME(` is the root spelling.
	for (const match of source.matchAll(
		/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*:\s*string\s*\{\s*return\s+confined(?:Real)?Path\s*\(/g,
	)) {
		names.add(`${match[1]}(`);
	}
	const patterns: RegExp[] = [/^config\.SITES_ROOT$/, /^confined(?:Real)?Path\s*\(/, /\.storeDir$/];
	for (const name of names) {
		patterns.push(
			name.endsWith('(') ? new RegExp(`^${name.slice(0, -1)}\\s*\\(`) : new RegExp(`^${name}$`),
		);
	}
	return patterns;
}

/** Every place this source joins onto a confined root — the violations of law 1. */
function unconfinedJoins(source: string): PathCall[] {
	const roots = confinedRoots(source);
	return pathCalls(source).filter((call) => roots.some((pattern) => pattern.test(call.root)));
}

/**
 * ENUMERATED exemptions for law 1 — shrink-only, a reason each. Empty: every path built on
 * a confined root in the daemon goes through the confinement helpers. An addition here is a
 * deliberate carve-out and must argue with PUB-10 first.
 */
const PATH_EXEMPTIONS: Array<{ file: string; root: string; reason: string }> = [];

// ---------------------------------------------------------------------------
// Law 2 — the scanner
// ---------------------------------------------------------------------------

/** Every sandbox attribute VALUE the source spells, however it is set. */
function sandboxValues(source: string): string[] {
	const values: string[] = [];
	for (const match of source.matchAll(
		/setAttribute\s*\(\s*['"]sandbox['"]\s*,\s*['"]([^'"]*)['"]\s*\)/g,
	)) {
		values.push(match[1] ?? '');
	}
	for (const match of source.matchAll(/\bsandbox\s*=\s*['"]([^'"]*)['"]/g)) {
		values.push(match[1] ?? '');
	}
	return values;
}

/** ENUMERATED exemptions for law 2 — shrink-only, a reason each. Empty by design. */
const SANDBOX_EXEMPTIONS: Array<{ file: string; value: string; reason: string }> = [];

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

// The corpus comes from the shared publication lister, which OWNS these roots
// (census_derivation_tripwire: a gate imports a lister rather than naming a
// directory in-file).
const daemonFiles = siteBuilderDaemonFiles();
const toolFiles = siteBuilderToolFiles();

describe('site-builder path confinement (PUB-10)', () => {
	test('the daemon census is TOTAL and the scanner sees real path construction', () => {
		expect(daemonFiles.length).toBeGreaterThan(DAEMON_FILE_FLOOR);
		const total = daemonFiles.reduce(
			(sum, file) => sum + pathCalls(readFileSync(file, 'utf8')).length,
			0,
		);
		expect(total).toBeGreaterThan(DAEMON_PATH_CALL_FLOOR);
	});

	test('no path is built by joining onto a confined root', () => {
		const violations: string[] = [];
		for (const file of daemonFiles) {
			const rel = relative(REPO_ROOT, file);
			for (const call of unconfinedJoins(readFileSync(file, 'utf8'))) {
				const exempt = PATH_EXEMPTIONS.some(
					(entry) => entry.file === rel && entry.root === call.root,
				);
				if (!exempt) violations.push(`${rel}: ${call.fn}(${call.root}, …)`);
			}
		}
		expect(violations).toEqual([]);
	});

	test('the confinement helpers are the door the daemon actually uses', () => {
		// The law above is a prohibition; without this leg, deleting every confinedPath call
		// in the daemon would leave it green.
		const users = daemonFiles.filter((file) =>
			/confined(?:Real)?Path\s*\(/.test(readFileSync(file, 'utf8')),
		);
		expect(users.length).toBeGreaterThan(8);
		// The two files PUB-10 was found in build THREE confined paths each — the directory
		// and both of the per-id artifacts under it. Counted, not spelled: a rename must not
		// redden this, but swapping any one of them back to a raw join must.
		const returnsConfined = (source: string): number =>
			source.match(/return confined(?:Real)?Path\(/g)?.length ?? 0;
		expect(
			returnsConfined(readFileSync(join(DAEMON_SRC, 'build/builder.ts'), 'utf8')),
		).toBeGreaterThan(2);
		expect(
			returnsConfined(readFileSync(join(DAEMON_SRC, 'sessions/store.ts'), 'utf8')),
		).toBeGreaterThan(2);
	});

	test('every path exemption is real (no stale entry)', () => {
		for (const entry of PATH_EXEMPTIONS) {
			expect(entry.reason.length).toBeGreaterThan(20);
			const source = readFileSync(join(REPO_ROOT, entry.file), 'utf8');
			expect(unconfinedJoins(source).some((call) => call.root === entry.root)).toBe(true);
		}
	});

	test('POSITIVE CONTROL: the scanner flags the exact PUB-10 shape and spares the fix', () => {
		const offending = [
			"import { join } from 'node:path';",
			'function buildsDir(slug: string): string {',
			"  return confinedPath(config.SITES_ROOT, slug, '.builder', 'builds');",
			'}',
			'function recordPath(slug: string, id: string): string {',
			'  return join(buildsDir(slug), `${id}.json`);',
			'}',
		].join('\n');
		expect(unconfinedJoins(offending).map((call) => call.root)).toEqual(['buildsDir(slug)']);

		// The same file with a literal segment is STILL flagged — confinement is about the
		// root, not about how the segment is spelled.
		expect(unconfinedJoins(offending.replace('`${id}.json`', "'record.json'")).length).toBe(1);

		// And the fix is clean.
		const fixed = offending.replace(
			'join(buildsDir(slug), `${id}.json`)',
			'confinedPath(buildsDir(slug), `${id}.json`)',
		);
		expect(unconfinedJoins(fixed)).toEqual([]);

		// A directory-walk continuation (root is a plain parameter) is not this law's business.
		expect(unconfinedJoins('const full = join(dir, entry.name);')).toEqual([]);
		// An array join is never a path call.
		expect(pathCalls("const s = parts.join(', ');")).toEqual([]);
		// Neither is a one-argument normalization of a confined root.
		expect(unconfinedJoins('const same = resolve(surface.storeDir);')).toEqual([]);
		expect(unconfinedJoins('const under = resolve(surface.storeDir, name);').length).toBe(1);
	});
});

describe('site-builder preview frame (PUB-11)', () => {
	test('the tool census is TOTAL and finds the frame', () => {
		expect(toolFiles.length).toBeGreaterThan(TOOL_FILE_FLOOR - 1);
		const found = toolFiles.reduce(
			(sum, file) => sum + sandboxValues(readFileSync(file, 'utf8')).length,
			0,
		);
		expect(found).toBeGreaterThan(0);
	});

	test('no sandbox attribute grants allow-same-origin', () => {
		const violations: string[] = [];
		for (const file of toolFiles) {
			const rel = relative(REPO_ROOT, file);
			for (const value of sandboxValues(readFileSync(file, 'utf8'))) {
				if (!value.includes('allow-same-origin')) continue;
				const exempt = SANDBOX_EXEMPTIONS.some(
					(entry) => entry.file === rel && entry.value === value,
				);
				if (!exempt) violations.push(`${rel}: sandbox='${value}'`);
			}
		}
		expect(violations).toEqual([]);
	});

	test('the preview frame is sandboxed, and with scripts only', () => {
		const controller = readFileSync(join(TOOL_JS, 'sitebuilder_controller.js'), 'utf8');
		const values = sandboxValues(controller);
		// Exactly one framed surface, and its grant list is exactly ['allow-scripts'] — an
		// absent attribute (no sandbox at all) fails here, not just a wider one.
		expect(values).toEqual(['allow-scripts']);
		expect(controller).toMatch(/frame\.setAttribute\('sandbox', 'allow-scripts'\)/);
	});

	test('every sandbox exemption is real (no stale entry)', () => {
		for (const entry of SANDBOX_EXEMPTIONS) {
			expect(entry.reason.length).toBeGreaterThan(20);
			const source = readFileSync(join(REPO_ROOT, entry.file), 'utf8');
			expect(sandboxValues(source)).toContain(entry.value);
		}
	});

	test('POSITIVE CONTROL: the scanner flags a same-origin grant in either spelling', () => {
		expect(
			sandboxValues("frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')"),
		).toEqual(['allow-scripts allow-same-origin']);
		expect(sandboxValues('<iframe sandbox="allow-scripts allow-same-origin">')).toEqual([
			'allow-scripts allow-same-origin',
		]);
		expect(sandboxValues("el.setAttribute('sandbox', 'allow-scripts')")).toEqual(['allow-scripts']);
	});
});
