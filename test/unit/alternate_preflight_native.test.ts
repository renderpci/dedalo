/**
 * THE PRE-FLIGHT THAT MAKES DEGRADATION VISIBLE IS ITSELF EXECUTED
 * (P2-23 / GATE-42).
 *
 * `src/core/media/alternate_preflight.ts` was the ONLY file in the complexity
 * baseline that no test loads. It is imported at boot from server.ts, and its
 * stated purpose is to make a silent degradation visible — so the module whose
 * whole job is to prevent silent behaviour was itself never executed by the
 * suite. Its own header even claims "Here it has a gate", and that gate reads it
 * as TEXT: a source-substring check cannot tell working code from code that
 * throws on its first line.
 *
 * This file IMPORTS and RUNS it. Hermetic: `alternateExtensionWarnings` probes
 * ImageMagick with a real 1x1 encode and treats an unwritable format as an
 * ANSWER, never an error, so it returns on any host (measured: 47ms here).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	alternateExtensionWarnings,
	reportAlternateExtensionSupport,
} from '../../src/core/media/alternate_preflight.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

describe('alternate-extension pre-flight actually runs', () => {
	test('it returns a list of operator-facing sentences, never throws', async () => {
		const warnings = await alternateExtensionWarnings();
		expect(Array.isArray(warnings)).toBe(true);
		// Every entry must be the sentence an operator will read, not a code.
		for (const warning of warnings) {
			expect(typeof warning).toBe('string');
			expect(warning.startsWith('[media]'), `unprefixed warning: ${warning}`).toBe(true);
			// The catalog prose PROMISES the operator three things in this line:
			// the parameter, its value, and the reason. A bare "unsupported" would
			// keep the module alive while breaking the promise it exists to keep.
			expect(warning.length).toBeGreaterThan(40);
		}
	});

	test('a probe failure is an ANSWER, not an exception (advisory, never fatal)', async () => {
		// The design decision this module's header defends at length: config-read
		// throw, boot-fatal and ingest-assert were all rejected because they turn
		// "no ImageMagick delegate" into "no engine". Calling it twice also proves
		// it holds no first-run state that would make the second call differ.
		const first = await alternateExtensionWarnings();
		const second = await alternateExtensionWarnings();
		expect(second).toEqual(first);
	});

	test('the boot entry point swallows nothing silently', async () => {
		// reportAlternateExtensionSupport is fire-and-forget from boot: it must
		// never reject (that would be an unhandled rejection at start-up) and must
		// print what it found.
		const lines: string[] = [];
		const realWarn = console.warn;
		console.warn = (...args: unknown[]) => lines.push(args.join(' '));
		try {
			await expect(reportAlternateExtensionSupport()).resolves.toBeUndefined();
		} finally {
			console.warn = realWarn;
		}
		// It printed exactly what the pure function returned — no filtering, no
		// swallowing.
		const expected = await alternateExtensionWarnings();
		expect(lines).toEqual(expected);
	});

	test('the forwarding is REAL, not empty-equals-empty on a capable host', () => {
		// HONEST LIMIT, stated rather than papered over. On a host that can encode
		// every configured format the pre-flight yields NO warnings, so the
		// equality above is []===[] and would still hold if the boot entry point
		// swallowed everything. Measured: replacing the forward loop with a bare
		// `await alternateExtensionWarnings()` leaves that test GREEN on this
		// machine.
		//
		// The function has no injection seam and inventing one to make a test
		// non-vacuous would change production code to suit the test. So the
		// forwarding is pinned structurally, and this comment records exactly what
		// each half proves: the case above proves the entry point does not REJECT
		// and does not INVENT output; this one proves it still forwards.
		const source = readFileSync(join(REPO_ROOT, 'src/core/media/alternate_preflight.ts'), 'utf8');
		expect(source).toMatch(
			/for \(const warning of await alternateExtensionWarnings\(\)\) \{[\s\S]{0,80}console\.warn\(warning\)/,
		);
		// ...and the catch must not be mistaken for a clean run.
		expect(source).toContain('pre-flight skipped');
	});
});
