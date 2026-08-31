/**
 * TRIPWIRE — every client test file is REGISTERED, or it never runs
 * (P2-28 / DEAD-10).
 *
 * `test_section_map.js` held 104 lines of real assertions over the client's
 * section_map scope/term resolution. It was in no manifest and imported by
 * nothing, so it had NEVER RUN — while the client baseline reported 131/131
 * green. A suite that reports a perfect score over a corpus it silently
 * narrowed is the shape this project's law forbids outright.
 *
 * The registry is a bare-name list, so a new `test_*.js` file simply does not
 * appear anywhere: nothing imports it, no build breaks, no count changes. The
 * only thing that can notice is a census.
 *
 * CENSUS: TOTAL over `client/dedalo/test/client/js/test_*.js`, with the
 * infrastructure modules ENUMERATED — they are named `test_*` but are the
 * harness itself, not suites.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SUITE_DIR = join(REPO_ROOT, 'client/dedalo/test/client/js');
const REGISTRY = join(SUITE_DIR, 'test_registry.js');

/**
 * Named `test_*` but NOT suites — the runner's own machinery. Each says what it
 * is, so "infrastructure" cannot become a place to park a suite nobody runs.
 */
const NOT_A_SUITE: Record<string, string> = {
	test_registry: 'THE manifest itself — the list every other entry is checked against.',
	test_bootstrap: 'Boots Mocha and the page shell before any suite loads; imported by the runner.',
	test_stats: 'The counters model (cards, group stats, window.global_stats for Puppeteer).',
};

function suiteFiles(): string[] {
	return [...new Glob('test_*.js').scanSync({ cwd: SUITE_DIR })]
		.map((name) => name.replace(/\.js$/, ''))
		.sort();
}

describe('every client test file is registered', () => {
	const files = suiteFiles();
	const registry = readFileSync(REGISTRY, 'utf8');

	test('the census sees the suite directory (anti-vacuity)', () => {
		// "Every file is registered" over an empty listing is not a verdict.
		expect(files.length).toBeGreaterThan(90);
		expect(files).toContain('test_section_map');
	});

	test('no suite is unreachable', () => {
		const orphans = files
			.filter((name) => NOT_A_SUITE[name] === undefined)
			.filter((name) => !registry.includes(`'${name}'`));
		expect(
			orphans,
			'These files hold assertions that NEVER RUN: not in test_registry.js, imported by ' +
				'nothing, invisible to the pass count. Register them (and fix what they find), or ' +
				`delete them — a test nobody runs is worse than no test.\n  ${orphans.join('\n  ')}`,
		).toEqual([]);
	});

	test('every registry entry names a file that exists', () => {
		// The other direction: a renamed or deleted suite leaves a registry entry
		// pointing at nothing, and the runner would report a phantom.
		const named = [...registry.matchAll(/'(test_[a-z0-9_]+)'/g)].map((match) => match[1] as string);
		expect(named.length).toBeGreaterThan(90);
		const missing = [...new Set(named)].filter((name) => !files.includes(name)).sort();
		expect(missing, `registry names suites with no file:\n  ${missing.join('\n  ')}`).toEqual([]);
	});

	test('each infrastructure exemption is real and reasoned', () => {
		for (const [name, reason] of Object.entries(NOT_A_SUITE)) {
			expect(reason.length, `${name}: an exemption needs a real reason`).toBeGreaterThan(40);
			expect(files, `${name} no longer exists — DELETE its exemption`).toContain(name);
		}
	});
});
