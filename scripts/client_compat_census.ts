/**
 * CLIENT COMPAT-READ CENSUS — report + hard zero.
 *
 *   bun run scripts/client_compat_census.ts   # per-area totals + offending files; exit 1 if any
 *
 * Counts client reads of the RETIRED envelope compat keys `.msg` / `.errors` /
 * `.result` (engineering/ERRORS_SPEC.md §3.1 — the mirror was removed on
 * 2026-08-16, WC-2026-08-16-error-envelope-compat-removal) through the ONE
 * counter, scripts/lib/client_compat_census.ts. The number is a CONSTANT now:
 * zero. There is no baseline file and no ratchet — a ratchet frozen at 0 is a
 * second copy of a constant — and test/unit/client_error_contract_tripwire.test.ts
 * asserts the same zero through the same counter (a regression is red there
 * and here). The named non-envelope reads (NON_ENVELOPE_READS, data + reason)
 * are the only exemptions, and the tripwire fails on a stale one.
 */

import {
	byPath,
	census,
	type FileCompatReads,
	summarize,
	totalsByTopLevel,
} from './lib/client_compat_census.ts';

const ROOTS_LABEL = 'client/dedalo/**/*.js, tools/*/js/**/*.js';

function printReport(results: readonly FileCompatReads[]): number {
	const totals = summarize(results);
	console.log(
		`${ROOTS_LABEL}: ${totals.scanned} files scanned, ${totals.total} compat reads across ${totals.files} files (msg ${totals.byKey.msg}, errors ${totals.byKey.errors}, result ${totals.byKey.result}).`,
	);
	if (totals.total === 0) return 0;
	console.log('per area:');
	for (const [dir, count] of Object.entries(totalsByTopLevel(results))) {
		if (count > 0) console.log(`  ${String(count).padStart(5)}  ${dir}`);
	}
	console.log('offending files:');
	const offenders = [...results]
		.filter((result) => result.reads > 0)
		.sort((a, b) => b.reads - a.reads || byPath(a, b));
	for (const result of offenders) console.log(`  ${String(result.reads).padStart(5)}  ${result.file}`);
	console.error(
		'\nCOMPAT READS PRESENT: the server no longer emits `result`/`msg`/`errors` on the envelope (removed 2026-08-16). Read `data` / `error.code` / `error.label_key`, or — for a NON-envelope shape (stream frame, payload key, browser API) — add a NON_ENVELOPE_READS entry with its reason.',
	);
	return 1;
}

if (import.meta.main) process.exit(printReport(census()));
