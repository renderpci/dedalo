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
 * harness itself, not suites. The list lives in test/helpers/client_suite_census.ts,
 * shared with client_gate_inventory_tripwire.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	NOT_A_SUITE,
	NOT_A_SUITE_COUNT,
	REGISTRY_PATH,
	registeredSuiteNames,
	suiteFiles,
} from '../helpers/client_suite_census.ts';

// The census (the file walk, the registry parse and the ENUMERATED non-suite
// exemptions) is SHARED with client_gate_inventory_tripwire through
// test/helpers/client_suite_census.ts — one list, so a harness file added to one
// gate's exemptions cannot silently be a suite to the other.

describe('every client test file is registered', () => {
	const files = suiteFiles();
	const registry = readFileSync(REGISTRY_PATH, 'utf8');

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
		const named = registeredSuiteNames(registry);
		expect(named.length).toBeGreaterThan(90);
		const missing = named.filter((name) => !files.includes(name)).sort();
		expect(missing, `registry names suites with no file:\n  ${missing.join('\n  ')}`).toEqual([]);
	});

	test('each infrastructure exemption is real and reasoned, and the list is shrink-only', () => {
		expect(Object.keys(NOT_A_SUITE).length).toBeLessThanOrEqual(NOT_A_SUITE_COUNT);
		for (const [name, reason] of Object.entries(NOT_A_SUITE)) {
			expect(reason.length, `${name}: an exemption needs a real reason`).toBeGreaterThan(40);
			expect(files, `${name} no longer exists — DELETE its exemption`).toContain(name);
		}
	});
});
