/**
 * CLIENT SUITE CENSUS — the ONE static reading of the browser test inventory.
 *
 * Shared by the two client tripwires (client_suite_registration_tripwire,
 * client_gate_inventory_tripwire) and by the headless runner's inventory
 * banking (`scripts/client_test_runner.ts --update`), so the enumerated
 * non-suite exemptions, the registry parse and the `it()` scan exist once —
 * two copies would drift the day a harness file is added.
 *
 * Everything here is STATIC: it reads files. The dynamic truth (how many mocha
 * tests actually ran) comes from the browser through
 * `scripts/lib/client_gate_verdict.ts`; this module bounds it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

export const REPO_ROOT = join(import.meta.dir, '..', '..');
export const SUITE_DIR = join(REPO_ROOT, 'client/dedalo/test/client/js');
export const REGISTRY_PATH = join(SUITE_DIR, 'test_registry.js');

/**
 * Named `test_*` but NOT suites — the runner's own machinery. ENUMERATED, a
 * reason per entry, so "infrastructure" cannot become a place to park a suite
 * nobody runs. Shrink-only: {@link NOT_A_SUITE_COUNT}.
 */
export const NOT_A_SUITE: Record<string, string> = {
	test_registry: 'THE manifest itself — the list every other entry is checked against.',
	test_bootstrap: 'Boots Mocha and the page shell before any suite loads; imported by the runner.',
	test_stats: 'The counters model (cards, group stats, window.global_stats for Puppeteer).',
};
export const NOT_A_SUITE_COUNT = 3;

/** Every `test_*.js` in the suite directory, bare names, sorted. */
export function suiteFiles(): string[] {
	return [...new Glob('test_*.js').scanSync({ cwd: SUITE_DIR })]
		.map((name) => name.replace(/\.js$/, ''))
		.sort();
}

/**
 * The suite names of the GATED arrays only (`*_suites_green`), in file order —
 * what `run all` queues. A deferred suite renders a card but is excluded from
 * the queue and the counters, so it is not part of the inventory floor.
 */
export function gatedSuiteNames(registrySource = readFileSync(REGISTRY_PATH, 'utf8')): string[] {
	const names: string[] = [];
	const arrays = /export const (\w+_suites_green)\s*=\s*\[([\s\S]*?)\n\]/g;
	for (let m = arrays.exec(registrySource); m !== null; m = arrays.exec(registrySource)) {
		// One entry per line, the name first; the trailing `// reason` is not read.
		for (const line of (m[2] ?? '').split('\n')) {
			const entry = /^\s*'(test_[a-z0-9_]+)'/.exec(line);
			if (entry) names.push(entry[1] as string);
		}
	}
	return [...new Set(names)];
}

export const ELEMENTS_PATH = join(SUITE_DIR, 'elements.js');

/**
 * The models of the parameterized component matrix (`elements.js`), each of
 * which is ONE card running `test_component_full?model=<x>`. Counted from the
 * active `elements.push({ model: '…' })` calls — comments stripped first, so a
 * commented-out element (the registry keeps some) is not a card.
 */
export function componentMatrixModels(
	elementsSource = readFileSync(ELEMENTS_PATH, 'utf8'),
): string[] {
	const code = stripComments(elementsSource);
	return [...code.matchAll(/elements\.push\(\{\s*model\s*:\s*'([a-z0-9_]+)'/g)].map(
		(m) => m[1] as string,
	);
}

/**
 * The cards `run all` queues, read STATICALLY: every gated suite name is one
 * card, plus one card per component-matrix model. The dynamic run must observe
 * exactly this many non-deferred cards; the inventory floor is checked against it.
 */
export function gatedCardCount(): number {
	return gatedSuiteNames().length + componentMatrixModels().length;
}

/** Comments only (strings kept) — for scans that need the literal values. */
export function stripComments(source: string): string {
	let out = '';
	let i = 0;
	const n = source.length;
	while (i < n) {
		const c = source[i] as string;
		const next = source[i + 1];
		if (c === '/' && next === '/') {
			while (i < n && source[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && next === '*') {
			const end = source.indexOf('*/', i + 2);
			i = end === -1 ? n : end + 2;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			out += c;
			i++;
			while (i < n && source[i] !== c) {
				if (source[i] === '\\') {
					out += source[i];
					i++;
				}
				out += source[i];
				i++;
			}
			out += c;
			i++;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/** The bare suite names the registry quotes, deduplicated, in file order. */
export function registeredSuiteNames(
	registrySource = readFileSync(REGISTRY_PATH, 'utf8'),
): string[] {
	return [
		...new Set([...registrySource.matchAll(/'(test_[a-z0-9_]+)'/g)].map((m) => m[1] as string)),
	];
}

/**
 * Strip comments and string/template contents from JS source so a scan over it
 * sees only code. Strings become empty quotes (positions shift; the scan only
 * needs structure). Good enough for the suite files, which are plain ES
 * modules; not a parser.
 */
export function stripCommentsAndStrings(source: string): string {
	let out = '';
	let i = 0;
	const n = source.length;
	while (i < n) {
		const c = source[i] as string;
		const next = source[i + 1];
		if (c === '/' && next === '/') {
			while (i < n && source[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && next === '*') {
			const end = source.indexOf('*/', i + 2);
			i = end === -1 ? n : end + 2;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			out += c;
			i++;
			while (i < n && source[i] !== c) {
				if (source[i] === '\\') i++;
				i++;
			}
			out += c;
			i++;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/** One `it()` registration as the census reads it. */
export interface ItRegistration {
	/** The callback body (`{ … }`), or '' for a callback-less (pending) registration. */
	body: string;
	/** Can this registration RUN? false for `it.skip` and for a callback-less `it('title')`. */
	live: boolean;
}

/**
 * Every `it(...)` / `it.skip(...)` / `it.only(...)` registration: the callback's
 * body from its first `{` at the call's own paren depth to the call's closing
 * `)`, and whether the registration can run at all. A registration with no
 * callback (a pending `it('title')`) yields an empty body and is not live; an
 * `it.skip` is not live whatever its body says. Mocha counts both inside
 * `stats.tests` and runs neither — which is why the census keeps them apart
 * (GATE-12's all-pending variant).
 */
export function itRegistrations(source: string): ItRegistration[] {
	const code = stripCommentsAndStrings(source);
	const found: ItRegistration[] = [];
	const re = /\bit(\.skip|\.only)?\s*\(/g;
	for (let m = re.exec(code); m !== null; m = re.exec(code)) {
		const skipped = m[1] === '.skip';
		const open = m.index + m[0].length - 1;
		let depth = 0;
		// Braces/brackets nested inside the call, so a comma inside the callback
		// body (or an options object) is not read as a second argument.
		let nested = 0;
		let bodyStart = -1;
		// A second top-level argument = a callback, inline OR a named function
		// (`it(title, data_read)`); the title alone = a pending registration.
		let hasCallback = false;
		for (let i = open; i < code.length; i++) {
			const ch = code[i];
			if (ch === '(') depth++;
			else if (ch === ')') {
				depth--;
				if (depth === 0) {
					const body = bodyStart === -1 ? '' : code.slice(bodyStart, i);
					found.push({ body, live: !skipped && hasCallback });
					re.lastIndex = i;
					break;
				}
			} else if (ch === '{' || ch === '[') {
				if (ch === '{' && depth === 1 && nested === 0 && bodyStart === -1) bodyStart = i;
				nested++;
			} else if (ch === '}' || ch === ']') {
				nested--;
			} else if (ch === ',' && depth === 1 && nested === 0) {
				hasCallback = true;
			}
		}
	}
	return found;
}

/** The body text of every `it()` registration (live or not). */
export function itBodies(source: string): string[] {
	return itRegistrations(source).map((r) => r.body);
}

/** Does an `it()` body assert anything — chai `assert.*` / `expect(` / `.should`, or a bare throw? */
export function bodyAsserts(body: string): boolean {
	return /\bassert\s*[.(]|\bexpect\s*\(|\.should\b|\bthrow\b/.test(body);
}

/** Number of `it()` registrations in a suite source, live or not. */
export function countIt(source: string): number {
	return itRegistrations(source).length;
}

/** Number of `it()` registrations that can RUN: not `it.skip`, with a callback. */
export function countLiveIt(source: string): number {
	return itRegistrations(source).filter((r) => r.live).length;
}

/**
 * Registrations that can NEVER run, whatever the browser does: `it.skip`, a
 * callback-less `it('title')`, `xit`, `describe.skip`, `xdescribe`,
 * `context.skip`, `xcontext`. Every one of them lands inside mocha's `pending`
 * — the static shape of a suite that reports N tests and runs none. Ratcheted
 * in the inventory as `skipped_registration_budget`.
 */
export function countSkippedRegistrations(source: string): number {
	const code = stripCommentsAndStrings(source);
	const markers = code.match(
		/\b(?:xit|xdescribe|xcontext)\s*\(|\b(?:describe|context)\.skip\s*\(/g,
	);
	return (markers?.length ?? 0) + itRegistrations(source).filter((r) => !r.live).length;
}

/** Number of `it()` bodies that assert nothing (the GATE-13 ratchet). */
export function countAssertionFreeIt(source: string): number {
	return itBodies(source).filter((body) => !bodyAsserts(body)).length;
}

export interface SuiteScan {
	/** bare name */
	name: string;
	/** every it() registration, live or not */
	its: number;
	/** registrations that can run */
	liveIts: number;
	/** registrations that can never run (see countSkippedRegistrations) */
	skipped: number;
	assertionFree: number;
}

/** Scan every REGISTERED suite file. */
export function scanRegisteredSuites(): SuiteScan[] {
	return registeredSuiteNames().map((name) => {
		const source = readFileSync(join(SUITE_DIR, `${name}.js`), 'utf8');
		return {
			name,
			its: countIt(source),
			liveIts: countLiveIt(source),
			skipped: countSkippedRegistrations(source),
			assertionFree: countAssertionFreeIt(source),
		};
	});
}

/** The two static numbers the inventory banks. */
export function staticCensusTotals(scan = scanRegisteredSuites()): {
	assertionFreeIt: number;
	skippedRegistrations: number;
} {
	return {
		assertionFreeIt: scan.reduce((sum, s) => sum + s.assertionFree, 0),
		skippedRegistrations: scan.reduce((sum, s) => sum + s.skipped, 0),
	};
}
