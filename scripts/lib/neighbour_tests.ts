/**
 * NEIGHBOUR SELECTION — the test files a changed source file obliges you to run.
 *
 * ONE IMPLEMENTATION, in a lib rather than inside scripts/verify.ts, because
 * verify.ts executes on import (top-level await) and therefore cannot be
 * imported by a gate. This selector is the developer's main local feedback
 * loop, and it silently selected NOTHING for every change until 2026-08-27
 * (audit 2026-08-26, GATE-04) — so it now has a behavioural gate of its own:
 * test/unit/verify_selector_selftest.test.ts.
 */

import { $ } from 'bun';

/** A changed source file's import-tail — the substring test files import it by,
 *  e.g. src/core/section/record/save_component.ts → core/section/record/save_component */
export function importTail(file: string): string | null {
	const m = file.match(/^src\/(.+)\.ts$/);
	return m?.[1] ?? null;
}

/** Test files (unit + parity) that import any changed src file, plus changed
 *  test files themselves. Targeted — never the whole suite. */
export async function neighbourTests(changed: string[]): Promise<string[]> {
	const out = new Set<string>();

	// A changed test file is its own neighbour.
	for (const f of changed) {
		if (f.startsWith('test/') && f.endsWith('.test.ts')) out.add(f);
	}

	// Src files: find every test that imports their module tail.
	const tails = changed.map(importTail).filter((t): t is string => t !== null);
	for (const tail of tails) {
		// grep the test tree for the import tail.
		//
		// THE GLOB IS QUOTED ON PURPOSE. Unquoted, Bun's shell expands
		// `*.test.ts` against the CWD before grep is spawned, finds nothing,
		// and fails the whole command — which the old blanket
		// `.catch(() => '')` turned into "no neighbours". The stage then
		// reported ok:true having selected ZERO tests for EVERY change, so the
		// developer's main local feedback loop asserted nothing at all
		// (audit 2026-08-26, GATE-04). Measured: quoted, the same call returns
		// 23 files for `core/media/engine/spawn.ts`; unquoted, it throws.
		//
		// Exit 1 is grep's "no match" and is legitimate; anything above 1 is a
		// real failure (unreadable path, bad pattern) and must not be silently
		// read as an empty selection.
		const found = await $`grep -rl --include="*.test.ts" ${tail} test/`.nothrow().quiet();
		if (found.exitCode > 1) {
			throw new Error(
				`neighbour selection failed for '${tail}': grep exited ${found.exitCode} — ` +
					`${found.stderr.toString().trim() || 'no stderr'}`,
			);
		}
		const hits = found.stdout.toString();
		for (const line of hits.split('\n')) {
			const f = line.trim();
			if (f) out.add(f);
		}
	}
	return [...out];
}
