/**
 * PRODUCTION IMPORT TRIPWIRE — what a production entrypoint imports, what a
 * production dependency is FOR, and what an accepted advisory can reach.
 *
 * WHY THIS EXISTS (P1-23 residual / DEAD-12 / GATE-53, CLI-26). Until 2026-09-04
 * `@huggingface/transformers` was a production `dependencies` entry that no
 * engine module imported: the only consumer was the browser, through the
 * client-lib registry, and the only file it loaded was dist/transformers.js. The
 * package's own dependency block nevertheless pulled onnxruntime-node (211 MB of
 * native binaries, unpacked at install by adm-zip) and sharp/@img (16 MB of
 * libvips) into every `bun install --production` of every installation and of
 * every code-update quarantine — 567 MB the engine never executed, and the ONLY
 * path to two of the three HIGH advisories the dependency baseline accepted. The
 * baseline's reasons said "transitive only" and "no engine code imports it"; both
 * were true and NEITHER was measured. Prose is what this gate replaces.
 *
 * THREE LEGS, one census. The package roots are DERIVED from the tree — every
 * `bun.lock` outside node_modules with its sibling package.json — so a new
 * sub-package is in the census the day its lockfile lands.
 *
 *   LEG 1 — every bare specifier a production source file imports (static,
 *   side-effect, re-export, `import()` and `require()`; `import type` excluded,
 *   node:/bun:/builtins excluded) names a package in THAT package's `dependencies`.
 *   A devDependency reachable from production would 404 after a `--production`
 *   install; an undeclared one resolves to whatever hoisting happens to provide.
 *
 *   LEG 2 — the REMEDIATION direction: every `dependencies` entry is engine-imported
 *   (LEG 1's set) OR browser-served by a `source: 'npm'`, non-devOnly row of the
 *   client-lib registry (the engine's package) OR named by the publication API's
 *   docs route allowlist (`serveStaticFile('<pkg>', …)`), OR carries an ENUMERATED
 *   shrink-only exemption with a reason. Census TOTAL over `dependencies`: a package
 *   nobody imports and nobody serves is weight every install pays for nothing.
 *
 *   LEG 3 — the transitive production closure (bun.lock walked from every
 *   `dependencies` entry over dependencies + optionalDependencies + non-optional
 *   peers) contains NO package the advisory baseline accepts. An accepted advisory
 *   is accepted on the claim that shipped code cannot reach it; this leg is what
 *   makes that claim true instead of written.
 *
 * Every leg has a positive control (a synthetic offender fed to the same
 * predicate) and a corpus floor, so an empty scan or a neutered extractor is RED.
 *
 * FILE-ONLY: reads the tree and the lockfiles, opens no socket. The registry module
 * it imports (src/core/client_libs/registry.ts) is a table plus a config reader.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';
import { packageRoots, productionFilesOf, REPO_ROOT } from '../../scripts/lib/production_corpus.ts';
import { thinReasonProblem } from '../../scripts/lib/reason_validator.ts';
import { CLIENT_LIBS } from '../../src/core/client_libs/registry.ts';

const BASELINE_PATH = 'engineering/dependency_audit_baseline.json';

// ── ENUMERATED exemptions (shrink-only, reasoned) ────────────────────────────

/**
 * `<package root>` → `<dependency>` → why a production dependency that nothing
 * imports and nothing serves is still a production dependency. Each entry MUST
 * still be unreachable (else it is stale and the gate reddens), and the reason
 * must be substantive (reason_validator). EMPTY at the time of writing: the one
 * package that qualified was vendored instead, which is the answer this gate
 * exists to force.
 */
const UNUSED_PRODUCTION_DEPENDENCY_EXEMPTIONS: Readonly<
	Record<string, Readonly<Record<string, string>>>
> = {};

// ── the census: package roots derived from the tree ───────────────────────────
// Lives in scripts/lib/production_corpus.ts, a registered shared lister
// (census_derivation_tripwire SHARED_LISTERS) — the root set is written ONCE.

// ── specifier extraction ─────────────────────────────────────────────────────

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

/** Strip block comments and whole-line `//` comments — JSDoc `import('sharp')` types are not imports. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * The forms, anchored so that a STRING saying 'import' (a directory name, a
 * label, a message) is not read as a statement: the keyword may not follow an
 * identifier char, a dot or a quote, and a specifier never holds whitespace.
 */
const IMPORT_FORMS: readonly { re: RegExp; typeOnly?: number; specifier: number }[] = [
	// import … from 'x'  /  export … from 'x'   (group 1 = `type ` when type-only)
	{
		re: /(?<![\w$.'"`])(?:import|export)\s+(type\s+)?[\w$*{}\s,]*?\s*from\s*['"]([^'"\s]+)['"]/g,
		typeOnly: 1,
		specifier: 2,
	},
	// import 'x'   (side-effect)
	{ re: /(?<![\w$.'"`])import\s*['"]([^'"\s]+)['"]/g, specifier: 1 },
	// import('x')  /  require('x')   (dynamic — resolved at run time, still a dependency)
	{ re: /(?<![\w$.'"`])(?:import|require)\s*\(\s*['"]([^'"\s]+)['"]\s*\)/g, specifier: 1 },
];

/** The BARE specifiers a source imports at run time (relative/absolute/builtin/type-only excluded). */
function bareImportsOf(source: string): string[] {
	const text = stripComments(source);
	const out = new Set<string>();
	for (const form of IMPORT_FORMS) {
		for (const match of text.matchAll(form.re)) {
			if (form.typeOnly !== undefined && match[form.typeOnly]) continue;
			const specifier = match[form.specifier] ?? '';
			if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/')) continue;
			if (/^(node|bun):/.test(specifier) || specifier === 'bun' || BUILTINS.has(specifier))
				continue;
			out.add(specifier);
		}
	}
	return [...out].sort();
}

/** `@scope/name/deep/path` → `@scope/name`; `name/deep` → `name`. */
function packageOf(specifier: string): string {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

// ── package.json + bun.lock ──────────────────────────────────────────────────

type PackageJson = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

function readPackageJson(root: string): PackageJson {
	return JSON.parse(readFileSync(join(REPO_ROOT, root, 'package.json'), 'utf-8')) as PackageJson;
}

type LockMeta = {
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalPeers?: string[];
};
type Lockfile = { packages: Record<string, unknown[]> };

/**
 * bun.lock is JSONC — trailing commas `JSON.parse` refuses. Same shape as
 * dependency_integrity_tripwire's parseLockfile (the origin of this idiom); the
 * lockfile is machine-written, so the comma is the only deviation.
 */
function parseLockfile(root: string): Lockfile {
	const text = readFileSync(join(REPO_ROOT, root, 'bun.lock'), 'utf-8').replace(
		/,(\s*[}\]])/g,
		'$1',
	);
	return JSON.parse(text) as Lockfile;
}

/**
 * The lock key that resolves `name` as seen from the package at `fromKey`. bun
 * hoists: a nested resolution is keyed `<parent key>/<name>`, so the lookup walks
 * the parent chain up to the top-level `<name>`.
 */
function resolveLockKey(lock: Lockfile, fromKey: string, name: string): string | null {
	const segments = fromKey === '' ? [] : fromKey.split('/');
	// A scoped key ("@a/b") occupies two segments but is ONE ancestor; walking by
	// prefix length is still correct because every candidate is tested as a key.
	for (let depth = segments.length; depth >= 0; depth--) {
		const candidate = [...segments.slice(0, depth), name].join('/');
		if (candidate in lock.packages) return candidate;
	}
	return null;
}

/**
 * The transitive PRODUCTION closure of a root's `dependencies`, as package names:
 * dependencies + optionalDependencies + peerDependencies not listed as optional
 * peers (bun installs a non-optional peer; an unresolvable one was never installed
 * and is skipped rather than invented). devDependencies of the root never enter.
 */
function productionClosure(lock: Lockfile, rootDependencies: readonly string[]): Set<string> {
	const seenKeys = new Set<string>();
	const names = new Set<string>();
	const queue: { key: string; name: string }[] = [];
	for (const name of rootDependencies) {
		const key = resolveLockKey(lock, '', name);
		if (key !== null) queue.push({ key, name });
	}
	while (queue.length > 0) {
		const { key, name } = queue.shift() as { key: string; name: string };
		if (seenKeys.has(key)) continue;
		seenKeys.add(key);
		names.add(name);
		const meta = (lock.packages[key]?.[2] ?? {}) as LockMeta;
		const optionalPeers = new Set(meta.optionalPeers ?? []);
		const next = [
			...Object.keys(meta.dependencies ?? {}),
			...Object.keys(meta.optionalDependencies ?? {}),
			...Object.keys(meta.peerDependencies ?? {}).filter((peer) => !optionalPeers.has(peer)),
		];
		for (const child of next) {
			const childKey = resolveLockKey(lock, key, child);
			if (childKey !== null) queue.push({ key: childKey, name: child });
		}
	}
	return names;
}

// ── what serves a dependency to a browser (LEG 2's second door) ──────────────

/** The engine's npm-sourced, production-served client libs, by package name. */
function browserServedByRegistry(): Set<string> {
	const out = new Set<string>();
	for (const lib of Object.values(CLIENT_LIBS)) {
		if (lib.source !== 'npm' || lib.devOnly) continue;
		const base = lib.base.replace(/^node_modules\//, '');
		out.add(packageOf(base));
	}
	return out;
}

/** The publication API's docs route: every literal `serveStaticFile('<pkg>', …)`. */
function browserServedByDocsRoute(root: string): Set<string> {
	const docsRoute = join(REPO_ROOT, root, 'src/routes/docs.ts');
	if (!existsSync(docsRoute)) return new Set();
	const source = stripComments(readFileSync(docsRoute, 'utf-8'));
	return new Set(
		[...source.matchAll(/\bserveStaticFile\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? ''),
	);
}

function servedBy(root: string): Set<string> {
	return root === '.' ? browserServedByRegistry() : browserServedByDocsRoute(root);
}

// ── the measurement ──────────────────────────────────────────────────────────

type RootMeasure = {
	root: string;
	files: string[];
	/** bare specifier → files importing it */
	imports: Map<string, string[]>;
	importedPackages: Set<string>;
	pkg: PackageJson;
	served: Set<string>;
	closure: Set<string>;
};

function measure(root: string): RootMeasure {
	const files = productionFilesOf(root);
	const imports = new Map<string, string[]>();
	for (const file of files) {
		for (const specifier of bareImportsOf(readFileSync(file, 'utf-8'))) {
			imports.set(specifier, [...(imports.get(specifier) ?? []), relative(REPO_ROOT, file)]);
		}
	}
	const pkg = readPackageJson(root);
	return {
		root,
		files,
		imports,
		importedPackages: new Set([...imports.keys()].map(packageOf)),
		pkg,
		served: servedBy(root),
		closure: productionClosure(parseLockfile(root), Object.keys(pkg.dependencies ?? {})),
	};
}

/** LEG 1's predicate: the specifiers whose package is not in `dependencies`. */
function undeclaredProblems(
	imports: ReadonlyMap<string, readonly string[]>,
	pkg: PackageJson,
): string[] {
	const dependencies = new Set(Object.keys(pkg.dependencies ?? {}));
	const dev = new Set(Object.keys(pkg.devDependencies ?? {}));
	const problems: string[] = [];
	for (const [specifier, files] of imports) {
		const name = packageOf(specifier);
		if (dependencies.has(name)) continue;
		const kind = dev.has(name) ? 'a devDependency' : 'NOT DECLARED in package.json';
		problems.push(`'${specifier}' → ${name} is ${kind}; imported by ${files.join(', ')}`);
	}
	return problems.sort();
}

/** LEG 2's predicate: the `dependencies` entries nothing imports and nothing serves. */
function unusedProblems(
	pkg: PackageJson,
	importedPackages: ReadonlySet<string>,
	served: ReadonlySet<string>,
	exemptions: Readonly<Record<string, string>>,
): string[] {
	return Object.keys(pkg.dependencies ?? {})
		.filter((name) => !importedPackages.has(name) && !served.has(name) && !(name in exemptions))
		.sort();
}

/** The packages the advisory baseline accepts, per root. */
function acceptedPackagesByRoot(): Map<string, Set<string>> {
	const baseline = JSON.parse(readFileSync(join(REPO_ROOT, BASELINE_PATH), 'utf-8')) as {
		accepted: Record<string, { package: string }[]>;
	};
	const out = new Map<string, Set<string>>();
	for (const [root, entries] of Object.entries(baseline.accepted)) {
		out.set(root, new Set(entries.map((entry) => entry.package)));
	}
	return out;
}

/** LEG 3's predicate: accepted packages that the production closure reaches. */
function reachableAcceptedProblems(
	closure: ReadonlySet<string>,
	accepted: ReadonlySet<string>,
): string[] {
	return [...accepted].filter((name) => closure.has(name)).sort();
}

const ROOTS = packageRoots();
const MEASURED = ROOTS.map(measure);
const ACCEPTED = acceptedPackagesByRoot();

const WHY =
	'A production dependency is bytes every installation and every code-update quarantine installs. ' +
	'It must be something the engine imports or a browser is served — never a devDependency reached ' +
	'from production, never weight nothing loads, never the path to an advisory the baseline accepts ' +
	'on the claim that shipped code cannot reach it.';

// ── LEG 1 ────────────────────────────────────────────────────────────────────

describe('production_import — LEG 1: every bare import of a production entrypoint is a `dependencies` entry', () => {
	test('corpus floor — the census saw the real trees', () => {
		expect(ROOTS, 'the engine root must be in the census').toContain('.');
		expect(ROOTS.length, 'sub-packages with their own bun.lock').toBeGreaterThan(2);
		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		expect(engine.files.length, 'engine production files (src + tools/*/server)').toBeGreaterThan(
			500,
		);
		expect(
			engine.files.some((file) => /\/tools\/tool_[a-z_]+\/server\//.test(file)),
			'tool server handlers are in the scan',
		).toBe(true);
		expect(engine.importedPackages.size, 'distinct engine-imported packages').toBeGreaterThan(3);
		for (const m of MEASURED) {
			expect(m.files.length, `${m.root}: production files`).toBeGreaterThan(0);
		}
	});

	for (const m of MEASURED) {
		test(`${m.root}: no devDependency or undeclared package reachable from production`, () => {
			expect(undeclaredProblems(m.imports, m.pkg), `${m.root}: ${WHY}`).toEqual([]);
		});
	}

	test('positive control — the extractor sees every import form and the predicate reds on a devDependency', () => {
		const offender = [
			"import type { Only } from 'puppeteer';", // type-only: NOT an import
			"import { launch } from 'puppeteer';",
			"import mocha from 'mocha/lib/cli';",
			"export { x } from 'chai';",
			"import 'less';",
			"const p = await import('@babel/parser');",
			"const r = require('nodemailer');",
			"import { z } from 'zod';",
			"import { readFileSync } from 'node:fs';",
			"import { join } from 'path';",
			"import { sql } from 'bun';",
			"import { Database } from 'bun:sqlite';",
			"import { local } from './local.ts';",
			"import { abs } from '/abs/path.js';",
			'/** @type {import("sharp").Sharp} */',
			"// import { dead } from 'leaflet';",
		].join('\n');
		const seen = bareImportsOf(offender);
		expect(seen).toEqual([
			'@babel/parser',
			'chai',
			'less',
			'mocha/lib/cli',
			'nodemailer',
			'puppeteer',
			'zod',
		]);

		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		const imports = new Map(seen.map((s) => [s, ['synthetic.ts']]));
		const problems = undeclaredProblems(imports, engine.pkg);
		expect(problems.some((p) => p.startsWith("'puppeteer' → puppeteer is a devDependency"))).toBe(
			true,
		);
		expect(problems.some((p) => p.startsWith("'mocha/lib/cli' → mocha is a devDependency"))).toBe(
			true,
		);
		expect(
			problems.some((p) => p.startsWith("'@babel/parser' → @babel/parser is a devDependency")),
		).toBe(true);
		expect(problems.some((p) => p.includes('zod'))).toBe(false);
		expect(problems.some((p) => p.includes('nodemailer'))).toBe(false);
		// An undeclared package is named as such, not as a devDependency.
		expect(
			undeclaredProblems(new Map([['left-pad', ['x.ts']]]), { dependencies: { zod: '1' } }),
		).toEqual(["'left-pad' → left-pad is NOT DECLARED in package.json; imported by x.ts"]);
	});
});

// ── LEG 2 ────────────────────────────────────────────────────────────────────

describe('production_import — LEG 2: every `dependencies` entry is engine-imported or browser-served (Census TOTAL)', () => {
	test('corpus floor — the served sets are real', () => {
		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		expect(engine.served.size, 'registry npm rows served in production').toBeGreaterThan(10);
		expect(
			Object.keys(engine.pkg.dependencies ?? {}).length,
			'engine dependencies',
		).toBeGreaterThan(10);
		const api = MEASURED.find((m) => /server_api/.test(m.root));
		expect(api, 'the publication API is in the census').toBeDefined();
		expect(api?.served.size, 'docs-route served packages').toBeGreaterThan(1);
	});

	for (const m of MEASURED) {
		test(`${m.root}: no dependency that nothing imports and nothing serves`, () => {
			expect(
				unusedProblems(
					m.pkg,
					m.importedPackages,
					m.served,
					UNUSED_PRODUCTION_DEPENDENCY_EXEMPTIONS[m.root] ?? {},
				),
				`${m.root}: ${WHY}\nEither the engine imports it, a registry row / docs route serves it, ` +
					'it moves to devDependencies, it is vendored (the transformers precedent), or it is REMOVED. ' +
					'An ENUMERATED exemption with a reason is the last resort, never the first.',
			).toEqual([]);
		});
	}

	test('every exemption is still earned (shrink-only, reasoned)', () => {
		for (const [root, entries] of Object.entries(UNUSED_PRODUCTION_DEPENDENCY_EXEMPTIONS)) {
			const m = MEASURED.find((row) => row.root === root);
			expect(m, `${root}: exempt root no longer exists — DELETE the entry`).toBeDefined();
			for (const [name, reason] of Object.entries(entries)) {
				expect(thinReasonProblem(reason, 12), `${root}/${name}: exemption reason`).toBeNull();
				expect(
					name in (m?.pkg.dependencies ?? {}),
					`${root}/${name}: no longer a dependency — DELETE the entry`,
				).toBe(true);
				expect(
					unusedProblems(
						m?.pkg ?? {},
						m?.importedPackages ?? new Set(),
						m?.served ?? new Set(),
						{},
					),
					`${root}/${name}: it is imported or served now — the exemption is stale, DELETE it`,
				).toContain(name);
			}
		}
	});

	test('positive control — a dependency nothing imports or serves is caught; a served one is not', () => {
		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		const pkg: PackageJson = { dependencies: { ...engine.pkg.dependencies, 'left-pad': '1.0.0' } };
		expect(unusedProblems(pkg, engine.importedPackages, engine.served, {})).toEqual(['left-pad']);
		expect(
			unusedProblems(pkg, engine.importedPackages, engine.served, { 'left-pad': 'x' }),
		).toEqual([]);
		// A registry-served npm lib (leaflet) and an engine import (zod) both count as used.
		expect(engine.served.has('leaflet')).toBe(true);
		expect(engine.importedPackages.has('zod')).toBe(true);
		// A devOnly registry row does NOT count as production-served.
		expect(engine.served.has('mocha')).toBe(false);
	});
});

// ── LEG 3 ────────────────────────────────────────────────────────────────────

describe('production_import — LEG 3: no package the advisory baseline accepts is in the production closure', () => {
	test('corpus floor — the closure walk resolves a real tree', () => {
		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		expect(engine.closure.size, 'engine production closure').toBeGreaterThan(50);
		// A transitive dep the engine never names directly (the MCP SDK's) is in the closure…
		expect(engine.closure.has('hono')).toBe(true);
		// …and a devDependency's transitive tree is not.
		expect(engine.closure.has('puppeteer')).toBe(false);
		expect(engine.closure.has('@puppeteer/browsers')).toBe(false);
		// Every root the baseline names is measured, and vice versa (the baseline is per-root).
		for (const root of ACCEPTED.keys())
			expect(ROOTS, `baseline root ${root} not in the census`).toContain(root);
		for (const root of ROOTS)
			expect([...ACCEPTED.keys()], `census root ${root} not in the baseline`).toContain(root);
		// NO floor on the number of ACCEPTED entries. An acceptance is an advisory
		// we tolerate, and the goal is zero of them: on 2026-09-23 the last four
		// were fixed by taking the upstream bumps, and a `> 0` floor here turned
		// that into a red build — a ratchet read backwards, exactly like flooring
		// an offender set. What the corpus floor must witness is that the BASELINE
		// WAS READ and its roots line up with the census (the two loops above),
		// which is true whether it accepts four advisories or none. The detection
		// logic itself is proved by the positive control below, over a constructed
		// baseline, so an empty real one leaves nothing unproven.
		expect(ACCEPTED.size, `${BASELINE_PATH} declares no roots — it was not read`).toBe(
			ROOTS.length,
		);
	});

	for (const m of MEASURED) {
		test(`${m.root}: accepted advisories are outside the production closure`, () => {
			expect(
				reachableAcceptedProblems(m.closure, ACCEPTED.get(m.root) ?? new Set()),
				`${m.root}: an advisory accepted in ${BASELINE_PATH} names a package that a production install SHIPS. ` +
					'Its reason ("transitive only", "dev-only") is false. Bump the dependency that reaches it, ' +
					'vendor the browser bundle instead of the package (the transformers precedent), or REMOVE the acceptance and fix the advisory.',
			).toEqual([]);
		});
	}

	test('positive control — a baseline entry naming a shipped package is caught', () => {
		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		expect(
			reachableAcceptedProblems(engine.closure, new Set(['zod', 'hono', 'puppeteer'])),
		).toEqual(['hono', 'zod']);
		// The closure walk itself: a synthetic lock where a root dep reaches a nested resolution.
		const lock: Lockfile = {
			packages: {
				a: [
					'a@1.0.0',
					'',
					{
						dependencies: { b: '^1' },
						peerDependencies: { p: '^1', q: '^1' },
						optionalPeers: ['q'],
					},
					'',
				],
				'a/b': ['b@1.5.0', '', { optionalDependencies: { c: '^1' } }, ''],
				b: ['b@2.0.0', '', {}, ''],
				c: ['c@1.0.0', '', {}, ''],
				p: ['p@1.0.0', '', {}, ''],
				q: ['q@1.0.0', '', {}, ''],
				dev: ['dev@1.0.0', '', { dependencies: { c: '^1' } }, ''],
			},
		};
		expect([...productionClosure(lock, ['a'])].sort()).toEqual(['a', 'b', 'c', 'p']);
		expect([...productionClosure(lock, [])]).toEqual([]);
	});
});

// ── the precedent this gate was born from ─────────────────────────────────────

describe('production_import — the transformers precedent holds', () => {
	test('@huggingface/transformers is a vendored browser bundle, not a lockfile dependency', () => {
		const engine = MEASURED.find((m) => m.root === '.') as RootMeasure;
		expect(engine.pkg.dependencies?.['@huggingface/transformers']).toBeUndefined();
		expect(engine.closure.has('onnxruntime-node')).toBe(false);
		expect(engine.closure.has('sharp')).toBe(false);
		expect(engine.closure.has('adm-zip')).toBe(false);
		expect(CLIENT_LIBS.transformers?.source).toBe('vendor');
		expect(
			statSync(join(REPO_ROOT, CLIENT_LIBS.transformers?.base ?? '', 'dist/transformers.js')).size,
		).toBeGreaterThan(1_000_000);
	});
});
