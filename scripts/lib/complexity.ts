/**
 * CYCLOMATIC COMPLEXITY — THE ONE IMPLEMENTATION.
 *
 * This module is the SINGLE source of truth for "how complex is a function" in
 * this repo. The baseline generator (scripts/crap_baseline.ts) and the ratchet
 * gate both import it. If the generator and the gate ever computed complexity
 * differently the ratchet would be worthless — so there is exactly one function
 * here that counts decision points, and nothing else in the repo may count them.
 *
 * ── WHY A COMPLEXITY NUMBER AT ALL (the CRAP framing) ─────────────────────────
 * CRAP(m) = comp² × (1 − cov)³ + comp. At cov = 1 this collapses to CRAP = comp,
 * so a "CRAP ≤ 6" rule is a HARD cyclomatic cap of 6 no matter how well tested a
 * function is. About a fifth of src/core/'s functions exceed comp 6 today (the
 * measured census lives in engineering/crap_complexity_baseline.json — this
 * header deliberately quotes no number, so it cannot go stale), so a flat cap
 * can never pass: the enforcement shape is a SHRINK-ONLY RATCHET over a frozen
 * per-file baseline, not a threshold.
 *
 * WHAT THIS IS NOT: it is not a CRAP score. CRAP == comp only at cov = 1, and
 * this tree is nowhere near that, so the cap derived from the identity is the
 * BEST CASE — the gate is strictly WEAKER than a real CRAP ≤ 6 (a comp-6
 * function at 50% coverage scores CRAP 10.5). Nothing here measures coverage.
 *
 * Coverage is deliberately NOT an input. There is no lcov artifact in CI, and a
 * gate that needs an 8-minute coverage run is a gate nobody runs. This engine is
 * AST-ONLY and HERMETIC: no DB, no network, no coverage, no clock, no randomness.
 * (For the record, when coverage IS discussed elsewhere in this project it is
 * LINE coverage — Bun emits no BRDA branch records.)
 *
 * ── THE METRIC ────────────────────────────────────────────────────────────────
 * Per function: complexity = 1 + one point for each decision node in the
 * function's OWN body (nested functions are excluded — they are counted as
 * functions in their own right).
 *
 * Decision nodes (the complete set — nothing else counts):
 *   IfStatement, ConditionalExpression (?:),
 *   ForStatement, ForInStatement, ForOfStatement (incl. `for await`),
 *   WhileStatement, DoWhileStatement,
 *   CatchClause,
 *   SwitchCase WITH a `test` (i.e. `case X:`; `default:` does not count),
 *   LogicalExpression (`&&`, `||`, `??`).
 *
 * ── EDGE-CASE DECISIONS (each one deliberate; do not "fix" without a reason) ──
 *  1. `?.` / `?.()` (OptionalMemberExpression, OptionalCallExpression) do NOT
 *     count. `?.` guards ONE expression; it is not a separate path a reader or a
 *     test must reason about, and counting it would make every defensive-read
 *     helper look complex. Uniform: no optional-chaining form ever counts.
 *  2. `finally` does NOT count — it always runs, there is no alternative path.
 *     Only CatchClause counts, so `try/catch` = 2 and `try/finally` = 1.
 *  3. `catch { }` with no binding still counts — it is a CatchClause.
 *  4. Default parameters count their logicals: `f(a = b || c, d = e ?? 2)` = 3.
 *     Defaults execute on every call; they are part of the function's own
 *     decisions. The walk therefore covers params, not just the body.
 *  5. Getters and setters are TWO separate functions (ClassMethod kind
 *     get/set) — never merged into one "property".
 *  6. A class-property arrow (`f = (x) => …`) is its own function; the
 *     ClassProperty wrapper is not.
 *  7. Object methods, function expressions and IIFEs are all counted.
 *  8. Bodiless TS declarations are NOT functions: overload signatures
 *     (TSDeclareFunction), `abstract m(): void;` (TSDeclareMethod), and
 *     `declare function g()`. They are types, not code.
 *  9. Nested functions are attributed to THEMSELVES. The enclosing function's
 *     walk stops at any nested function node.
 * 10. MODULE-LEVEL CODE IS ATTRIBUTED TO NO FUNCTION. `if (x) { … }` at the top
 *     level of a file belongs to no function and is not folded into a synthetic
 *     "module" pseudo-function. Consequence a reader must know: a file whose
 *     only branching is top-level has maxComplexity 0. That is correct and
 *     intended — this metric is per-function, and a file's max does NOT cover
 *     all of the file's code.
 * 11. A file with zero functions has maxComplexity 0. It is still SCANNED
 *     (presence in the scan set is what proves it was not skipped); it simply
 *     carries no baseline entry.
 *
 * ── FAILURE POSTURE: LOUD, NEVER SILENT ──────────────────────────────────────
 * A file that cannot be parsed is a file OUTSIDE the gate, which is the exact
 * hole this whole ratchet exists to prevent. So:
 *   - a parser throw is re-thrown with the file path attached;
 *   - `errorRecovery: true` is on, and a NON-EMPTY `ast.errors` is a HARD
 *     FAILURE naming the file and the first reasonCode — never a warning, never
 *     a skip. (Recovery is enabled only so the message can name the real reason
 *     instead of dying on the first token.)
 *   - a file that disappears mid-scan throws; it is not skipped.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 * Same source + same @babel/parser version ⇒ byte-identical output on every
 * machine. No clock, no RNG, no env, no filesystem order leaks: scanTree sorts
 * its results by CODEPOINT (never localeCompare — ICU collation ignores `/` and
 * `_` at the primary level and would reorder the whole baseline under a
 * different ICU build), so an APFS mac and a debian-slim container emit the
 * same list in the same order.
 *
 * @babel/parser is pinned EXACT (8.0.4, no caret) in package.json because the
 * baseline numbers are a function of the parser's node taxonomy — a caret range
 * would let a minor babel release silently shift every number in the frozen
 * baseline. Precisely: the exact pin covers the parser itself, which in turn
 * declares a caret range on @babel/types; what actually holds the whole tree
 * still is bun.lock plus `bun install --frozen-lockfile` in CI. Dependabot
 * proposes the bumps (exactness with an updater, per DEC-12), and a bump
 * arrives as one reviewable PR carrying the parser change plus any baseline
 * delta.
 *
 * NOTE: line numbers are message-only and MUST NOT enter a baseline file — they
 * would make the baseline churn on every unrelated edit above a function.
 */

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { type ParserPlugin, parse } from '@babel/parser';
import { Glob } from 'bun';

/** One function's measurement. `name` and `line` are for ERROR MESSAGES ONLY. */
export interface FunctionComplexity {
	name: string;
	line: number;
	complexity: number;
}

/**
 * THE CAP. CRAP ≤ 6 at full coverage IS cyclomatic ≤ 6, so 6 is the number the
 * ratchet drives every file toward. A file whose max is ≤ CAP needs no baseline
 * entry at all; a file above it is frozen debt, listed and shrink-only.
 */
export const COMPLEXITY_CAP = 6;

/** One file's measurement. `file` is a repo-relative, forward-slash path. */
export interface FileComplexity {
	file: string;
	maxComplexity: number;
	functionCount: number;
	/** How many of this file's functions exceed COMPLEXITY_CAP (summary input). */
	functionsOverCap: number;
	worst: FunctionComplexity | null;
}

/**
 * Babel plugins. NOTE: babel does NOT validate plugin names — an unknown name
 * is silently accepted, so this list cannot be trusted by inspection. Its
 * behaviour is asserted by the gate (a decorated class method must parse), so a
 * future plugin rename shows up as a red test, not as a mystery throw.
 */
const PARSER_PLUGINS: readonly ParserPlugin[] = [
	'typescript',
	// Load-bearing: `class A { @dec m() {} }` THROWS without it.
	'decorators-legacy',
	// NOT listed: 'explicitResourceManagement'. On Babel 8 `using r = o()` parses
	// by default and the plugin name was removed from the type union — listing it
	// would be a no-op that only looks like it is doing work.
];

/** Node types that ARE functions (all of these have a body). */
const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'ClassMethod',
	'ClassPrivateMethod',
	'ObjectMethod',
]);

/** Node types that each add ONE decision point. See the header for the rationale. */
const DECISION_TYPES = new Set([
	'IfStatement',
	'ConditionalExpression',
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
	'WhileStatement',
	'DoWhileStatement',
	'CatchClause',
	'LogicalExpression',
	// SwitchCase is handled separately: only `case X:` counts, never `default:`.
]);

/** AST keys that carry position/comment metadata, never child nodes. */
const SKIP_KEYS = new Set([
	'loc',
	'start',
	'end',
	'range',
	'extra',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'comments',
	'tokens',
	'errors',
]);

type Node = Record<string, unknown> & { type: string };

function isNode(value: unknown): value is Node {
	return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

/** Every direct child node, in declaration order. Generic — no @babel/types needed. */
function* childNodes(node: Node): Generator<{ key: string; node: Node }> {
	for (const key of Object.keys(node)) {
		if (SKIP_KEYS.has(key)) continue;
		const value = node[key];
		if (isNode(value)) {
			yield { key, node: value };
		} else if (Array.isArray(value)) {
			for (const item of value) if (isNode(item)) yield { key, node: item };
		}
	}
}

/** Decision weight of ONE node (its children are handled by the walker). */
function decisionWeight(node: Node): number {
	if (DECISION_TYPES.has(node.type)) return 1;
	// `case X:` is a decision; `default:` is the fall-through, not a decision.
	if (node.type === 'SwitchCase' && node.test != null) return 1;
	return 0;
}

/**
 * Cyclomatic complexity of ONE function, EXCLUDING nested functions (which are
 * measured separately). Params are walked too — default-value logicals count.
 */
function functionComplexity(fn: Node): number {
	let complexity = 1;
	const walk = (node: Node, isRoot: boolean): void => {
		if (!isRoot) {
			if (FUNCTION_TYPES.has(node.type)) return; // nested function: its own
			complexity += decisionWeight(node);
		}
		for (const child of childNodes(node)) walk(child.node, false);
	};
	walk(fn, true);
	return complexity;
}

/** Identifier-ish text of a key/id node, for messages only. */
function keyText(value: unknown): string | null {
	if (!isNode(value)) return null;
	if (typeof value.name === 'string') return value.name;
	if (typeof value.value === 'string') return value.value;
	if (typeof value.value === 'number') return String(value.value);
	if (value.type === 'PrivateName') return `#${keyText(value.id) ?? '?'}`;
	return null;
}

/**
 * A name hint a parent can give a child that is an anonymous function
 * (`const f = () => …`, `prop: () => …`, `f = () => …` class property).
 * MESSAGE-ONLY: names are never baseline-key material, precisely because
 * anonymous functions are everywhere and renames must not churn the baseline.
 */
function hintFor(parent: Node, key: string): string | null {
	switch (parent.type) {
		case 'VariableDeclarator':
			return key === 'init' ? keyText(parent.id) : null;
		case 'ClassProperty':
		case 'ClassPrivateProperty':
		case 'PropertyDefinition':
		case 'ObjectProperty':
			return key === 'value' ? keyText(parent.key) : null;
		case 'AssignmentExpression':
			return key === 'right' ? keyText(parent.left) : null;
		case 'ExportDefaultDeclaration':
			return key === 'declaration' ? 'default' : null;
		default:
			return null;
	}
}

function functionName(fn: Node, hint: string | null, line: number): string {
	const own = keyText(fn.id) ?? keyText(fn.key);
	if (own) {
		const kind = fn.kind;
		if (kind === 'get' || kind === 'set') return `${kind} ${own}`;
		return own;
	}
	return hint ?? `<anon>@${line}`;
}

function lineOf(node: Node): number {
	const loc = node.loc as { start?: { line?: number } } | undefined;
	return loc?.start?.line ?? 0;
}

/** Every function in an AST, in source order. */
function collectFunctions(root: Node): FunctionComplexity[] {
	const found: FunctionComplexity[] = [];
	const visit = (node: Node, hint: string | null): void => {
		if (FUNCTION_TYPES.has(node.type)) {
			const line = lineOf(node);
			found.push({
				name: functionName(node, hint, line),
				line,
				complexity: functionComplexity(node),
			});
		}
		for (const child of childNodes(node)) visit(child.node, hintFor(node, child.key));
	};
	visit(root, null);
	return found;
}

/**
 * Parse ONE file and measure every function in it.
 *
 * THROWS — loudly, with the file path — on any parse failure or any recovered
 * parser error. A file this function cannot measure is a file outside the gate;
 * it is never skipped and never returned as an empty result.
 */
export function analyzeFile(absPath: string, repoRelative?: string): FileComplexity {
	let source: string;
	try {
		source = readFileSync(absPath, 'utf-8');
	} catch (error) {
		throw new Error(
			`complexity: cannot read ${absPath} (a file the scanner cannot read is a file outside the gate): ${String(error)}`,
		);
	}

	let ast: ReturnType<typeof parse>;
	try {
		ast = parse(source, {
			sourceType: 'module',
			// On only so the message below can name the real reason instead of
			// dying at the first token. Any recovered error is still fatal.
			errorRecovery: true,
			plugins: [...PARSER_PLUGINS],
		});
	} catch (error) {
		throw new Error(`complexity: parse failed for ${absPath}: ${String(error)}`);
	}

	if (ast.errors.length > 0) {
		const first = ast.errors[0] as { reasonCode?: string; loc?: { line?: number } };
		throw new Error(
			`complexity: ${ast.errors.length} recovered parser error(s) in ${absPath} — first: ${first?.reasonCode ?? 'unknown'} at line ${first?.loc?.line ?? '?'}. A partially-parsed file would be silently under-measured; fix the source or the plugin list.`,
		);
	}

	const functions = collectFunctions(ast.program as unknown as Node);
	let worst: FunctionComplexity | null = null;
	let functionsOverCap = 0;
	for (const fn of functions) {
		// Strictly greater ⇒ ties resolve to the FIRST in source order (stable).
		if (worst === null || fn.complexity > worst.complexity) worst = fn;
		if (fn.complexity > COMPLEXITY_CAP) functionsOverCap += 1;
	}

	return {
		file: repoRelative ?? absPath,
		maxComplexity: worst?.complexity ?? 0,
		functionCount: functions.length,
		functionsOverCap,
		worst,
	};
}

/** Repo root (this file lives at scripts/lib/complexity.ts). */
export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Repo-relative, forward-slash path — stable across machines. */
export function toRepoRelative(absPath: string): string {
	return relative(REPO_ROOT, absPath).split(sep).join('/');
}

/**
 * Codepoint order — NOT `localeCompare`. ICU collation ignores `/` and `_` at
 * the primary level, so it orders `area_maintenance/backup.ts` before
 * `area/dashboard.ts` and would reorder the whole baseline under a different
 * ICU version or a small-icu build. Codepoint order is a property of the
 * strings, not of the runtime.
 */
export function byPath(a: { file: string }, b: { file: string }): number {
	return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
}

/** The ONE extension this metric measures. Everything else is out of scope. */
export const MEASURED_EXTENSION = '.ts';

/** Suffixes excluded from measurement inside the scan root, by shape not by name. */
export const EXCLUDED_SUFFIXES = ['.test.ts', '.d.ts'] as const;

/**
 * Glob options, in one place because they are load-bearing for RULE 3 (no
 * silent skips): `dot` reaches into dot-directories and `followSymlinks`
 * reaches through symlinked files AND symlinked directories. Without them a
 * symlinked source tree — and this repo has an explicit symlink culture
 * (CLAUDE.md → AGENTS.md, .claude → .agents) — would leave the corpus with no
 * error at all. `throwErrorOnBrokenSymlink` makes a dangling link loud.
 */
const SCAN_OPTIONS = {
	dot: true,
	followSymlinks: true,
	throwErrorOnBrokenSymlink: true,
} as const;

/** Repo-relative matches under `absRoot`, sorted, deduplicated. */
function globPaths(absRoot: string, pattern: string): string[] {
	const glob = new Glob(pattern);
	const seen = new Set<string>();
	for (const match of glob.scanSync({ cwd: absRoot, ...SCAN_OPTIONS })) {
		seen.add(match.split(sep).join('/'));
	}
	return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** True for the paths `scanTree` actually measures. */
function isMeasured(relative: string): boolean {
	if (!relative.endsWith(MEASURED_EXTENSION)) return false;
	return !EXCLUDED_SUFFIXES.some((suffix) => relative.endsWith(suffix));
}

/**
 * Every measurable TS file under `absRoot`, DETERMINISTICALLY ORDERED
 * (codepoint order on the repo-relative path — filesystem order never leaks).
 *
 * SCOPE, stated because a reader will otherwise assume the directory is
 * covered: this measures `*.ts` ONLY. Excluded, deliberately and by shape not
 * by name: `*.test.ts` (test files are not the code under measurement) and
 * `*.d.ts` (declarations contain no function bodies). Any OTHER source
 * extension under the root (`.js`, `.tsx`, `.mts`, …) is outside the metric —
 * that is not silent: `unmeasuredSourceFiles()` enumerates exactly those files
 * so the gate can pin the set and a new one cannot enter unannounced.
 *
 * Within the measured set nothing is ever skipped — an unparseable, unreadable
 * or vanished file THROWS.
 */
export function scanTree(absRoot: string): FileComplexity[] {
	const results = globPaths(absRoot, `**/*${MEASURED_EXTENSION}`)
		.filter(isMeasured)
		.map((relative) => {
			const abs = join(absRoot, relative);
			return analyzeFile(abs, toRepoRelative(abs));
		});
	results.sort(byPath);
	return results;
}

/**
 * The HONEST COMPLEMENT of `scanTree`: every source file under `absRoot` that
 * the metric does NOT measure — other code extensions, plus the `*.test.ts` /
 * `*.d.ts` exclusions. Returned as repo-relative paths so the gate can assert
 * the set against a frozen, named list.
 *
 * Why this exists: "the scan root is src/core/" reads as "the directory is
 * covered". It is not — `.js` sources live there today. An enumerated set turns
 * an invisible hole into a tripwire; a new `.tsx` file then arrives as a red
 * test naming it, never as a quiet exclusion.
 */
export const UNMEASURED_SOURCE_EXTENSIONS = [
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.tsx',
	'.mts',
	'.cts',
] as const;

export function unmeasuredSourceFiles(absRoot: string): string[] {
	const patterns = [
		`**/*${MEASURED_EXTENSION}`,
		...UNMEASURED_SOURCE_EXTENSIONS.map((extension) => `**/*${extension}`),
	];
	const found = new Set<string>();
	for (const pattern of patterns) {
		for (const relative of globPaths(absRoot, pattern)) {
			if (isMeasured(relative)) continue;
			found.add(toRepoRelative(join(absRoot, relative)));
		}
	}
	return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Aggregate totals over a scan — the "frozen debt at a glance" summary that
 * makes a vacuous regeneration (e.g. an accidentally empty scan set) obvious.
 */
export function summarize(results: readonly FileComplexity[]): {
	files: number;
	functions: number;
	functionsOverCap: number;
	filesOverCap: number;
} {
	let functions = 0;
	let functionsOverCap = 0;
	let filesOverCap = 0;
	for (const result of results) {
		functions += result.functionCount;
		functionsOverCap += result.functionsOverCap;
		if (result.maxComplexity > COMPLEXITY_CAP) filesOverCap += 1;
	}
	return { files: results.length, functions, functionsOverCap, filesOverCap };
}
