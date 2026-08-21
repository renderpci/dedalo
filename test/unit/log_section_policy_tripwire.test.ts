/**
 * TRIPWIRE — an append-only LOG SECTION's policy is declared in ONE place.
 *
 * WHY THIS EXISTS. dd15 (Time Machine) and dd542 (Activity) are not a family in
 * the ontology — nothing in `dd_ontology` says they are the same kind of thing —
 * but the ENGINE has always treated them as one, and it did so through several
 * separate literal sets in different modules. Each had to be remembered
 * independently whenever either section changed, and one of them HAD ALREADY
 * DRIFTED: `SUPPRESS_SECTION_INFO` listed dd542 as a deliberate divergence while
 * dd15's identical need went unnoticed for months (WC-045). That is the failure
 * this gate exists to prevent recurring.
 *
 * The registry is `LOG_SECTION_POLICY` in `concepts/section.ts`. This gate holds
 * two things:
 *
 *   1. NO NEW COPIES — a log-section tipo may not appear in a CONDITIONAL in the
 *      resolver layer, which is how a per-section rule gets re-derived by hand.
 *      Sites that legitimately name one for another reason are declared below
 *      WITH their reason, and each declaration is checked for staleness.
 *   2. THE POLICY STILL BINDS — the registry is not merely present but consumed:
 *      the sortability and section-info answers must come FROM it, asserted
 *      through the public helpers rather than by reading the map back.
 *
 * POLICY, NOT MECHANISM. The two sections deliberately do NOT share a read path:
 * `matrix_activity` is in MATRIX_TABLE_ALLOWLIST and dd542 reads through the
 * ordinary matrixReadSource + buildSearchSql, while `matrix_time_machine` is
 * deliberately outside it and dd15 has its own read source over physical
 * columns. Two tables, two read paths, one policy — so this gate never asserts
 * they read alike.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules): the ordinary-section control is the phase-2 `test` clone (src/core/test_data/test_tld_tipo_map.json); the log registry it must not leak into is seed-shipped dd.

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
	ACTIVITY_SECTION_TIPO,
	ACTIVITY_WHEN_TIPO,
	LOG_SECTION_POLICY,
	logSectionColumnIsSortable,
	logSectionSuppressesSectionInfo,
	TIME_MACHINE_SECTION_TIPO,
	TIME_MACHINE_SORTABLE_TIPOS,
} from '../../src/core/concepts/section.ts';

const REPO = join(import.meta.dir, '..', '..');
/** Where a hand-rolled per-section rule would most plausibly reappear. */
const SCANNED = ['src/core/resolve', 'src/core/section'];
const LOG_TIPOS = [TIME_MACHINE_SECTION_TIPO, ACTIVITY_SECTION_TIPO];

/**
 * Sites that legitimately test a log-section tipo for a reason that is NOT the
 * policy — each with its reason, each staleness-checked below.
 */
const DECLARED: readonly { file: string; reason: string }[] = [
	{
		file: 'src/core/resolve/read_tm.ts',
		reason:
			'the dd15 READ SOURCE itself — it owns row acquisition for matrix_time_machine and must name the section it serves',
	},
	{
		file: 'src/core/section/list_definitions/time_machine_list.ts',
		reason:
			'the dd15 ACL gate + column authority: it resolves the §7.4 grant and derives each surface’s columns',
	},
	{
		file: 'src/core/section/read_facade.ts',
		reason:
			'the Time Machine ACL gate: an UNSCOPED browse is gated against dd15 itself, which is what makes it global-admin only',
	},
];

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) yield* walk(full);
		else if (entry.endsWith('.ts')) yield full;
	}
}

/** Comments are documentation, not a second implementation. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('log-section policy has ONE home', () => {
	test('no resolver re-derives a per-log-section rule by hand', () => {
		const offenders: string[] = [];
		const declaredFiles = new Set(DECLARED.map((entry) => entry.file));
		for (const root of SCANNED) {
			for (const file of walk(join(REPO, root))) {
				const relative = file.slice(REPO.length + 1);
				if (declaredFiles.has(relative)) continue;
				const body = stripComments(readFileSync(file, 'utf8'));
				for (const [index, line] of body.split('\n').entries()) {
					// A tipo inside a CONDITIONAL is the shape that re-derives policy;
					// naming one as data (a map key, an import) is not.
					if (!LOG_TIPOS.some((tipo) => line.includes(`'${tipo}'`))) continue;
					if (!/\b(if|\?|&&|\|\||===|!==)\b|[?&|=!]==/.test(line)) continue;
					offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
				}
			}
		}
		expect(
			offenders,
			'A per-log-section rule belongs in LOG_SECTION_POLICY (concepts/section.ts), not in a\n' +
				'conditional here — that is how SUPPRESS_SECTION_INFO came to list dd542 and silently\n' +
				'omit dd15 for months. If a site legitimately names one for another reason, add it to\n' +
				'DECLARED in this file WITH its reason.',
		).toEqual([]);
	});

	test('every declared exemption is real and reasoned (no stale free passes)', () => {
		const stale: string[] = [];
		for (const entry of DECLARED) {
			expect(entry.reason.length, `${entry.file} needs a real reason`).toBeGreaterThan(40);
			let body: string;
			try {
				body = readFileSync(join(REPO, entry.file), 'utf8');
			} catch {
				stale.push(`${entry.file}: file does not exist`);
				continue;
			}
			if (!LOG_TIPOS.some((tipo) => body.includes(`'${tipo}'`))) {
				stale.push(`${entry.file}: no longer names a log-section tipo`);
			}
		}
		expect(stale, 'A stale exemption silently widens this gate — delete it or repoint it.').toEqual(
			[],
		);
	});
});

describe('the registry actually BINDS', () => {
	test('it holds exactly the two log sections', () => {
		expect([...LOG_SECTION_POLICY.keys()].sort()).toEqual(
			[TIME_MACHINE_SECTION_TIPO, ACTIVITY_SECTION_TIPO].sort(),
		);
	});

	test('sortability is answered FROM the registry, per section', () => {
		// dd15: only the three index-served columns (WC-053).
		expect(logSectionColumnIsSortable(TIME_MACHINE_SECTION_TIPO, 'dd1573')).toBe(true);
		expect(logSectionColumnIsSortable(TIME_MACHINE_SECTION_TIPO, 'dd559')).toBe(true);
		expect(logSectionColumnIsSortable(TIME_MACHINE_SECTION_TIPO, 'dd577')).toBe(false);
		// dd542: only When (WC-044) — a DIFFERENT cause, same shape.
		expect(logSectionColumnIsSortable(ACTIVITY_SECTION_TIPO, ACTIVITY_WHEN_TIPO)).toBe(true);
		expect(logSectionColumnIsSortable(ACTIVITY_SECTION_TIPO, 'dd546')).toBe(false);
		// An ordinary section is unrestricted — the registry must not leak outward.
		expect(logSectionColumnIsSortable('test6813', 'test6837')).toBe(true);
	});

	test('section-info suppression is answered FROM the registry', () => {
		expect(logSectionSuppressesSectionInfo(TIME_MACHINE_SECTION_TIPO)).toBe(true);
		expect(logSectionSuppressesSectionInfo(ACTIVITY_SECTION_TIPO)).toBe(true);
		expect(logSectionSuppressesSectionInfo('test6813')).toBe(false);
	});

	test('the named dd15 export is DERIVED from the registry, not a second copy', () => {
		// tm_sort_policy.test.ts and the WC ledger both name this set; it must stay
		// the same object the registry holds, or the two can drift apart again.
		expect(TIME_MACHINE_SORTABLE_TIPOS).toBe(
			LOG_SECTION_POLICY.get(TIME_MACHINE_SECTION_TIPO)?.sortableColumns as ReadonlySet<string>,
		);
	});
});
