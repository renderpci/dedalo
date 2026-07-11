/**
 * Multi-section projects filter (sql_assembler::buildMultiSectionProjectsFilter,
 * 2026-07-09) — the per-record ACL for a NON-ADMIN searching several sections
 * at once (the autocomplete picker's normal shape). Replaces the Phase 5c
 * fail-closed throw: these tests pin the now-covered contract so the removed
 * loud throw is genuinely replaced, not silently dropped.
 *
 * Semantics pinned (WC-011, deliberate strictly-safer divergence): each
 * section is scoped by its OWN component_filter tipo behind a section_tipo
 * guard — NOT PHP's main-section-only clause (trait.where.php:743-744), which
 * is fail-open when the first section is ungated. The cross-engine result-set
 * assertions live in test/parity/projects_filter_differential.test.ts; this
 * file pins the emitted SQL shape without needing the PHP oracle.
 *
 * Fixtures (monedaiberica ontology, same as the differential):
 *   numisdata267 gated by component_filter numisdata21
 *   numisdata6   gated by component_filter numisdata127
 *   numisdata5   ungated
 *   user 16 → project 7; user 999999 → no projects
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql as db } from '../../src/core/db/postgres.ts';
import { getComponentFilterTipo } from '../../src/core/ontology/resolver.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const GATED_A = 'numisdata267'; // filter tipo numisdata21
const GATED_A_FILTER = 'numisdata21';
const GATED_B = 'numisdata6'; // filter tipo numisdata127
const GATED_B_FILTER = 'numisdata127';
const UNGATED = 'numisdata5';

const NON_ADMIN: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_PROJECTS_USER: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

function sqoOver(sections: string[]): never {
	return { section_tipo: sections, limit: 10, offset: 0 } as never;
}

let dbReady = false;
beforeAll(async () => {
	try {
		await db`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false; // no shared DB on this machine — cases skip honestly
	}
});

describe('multi-section projects filter (non-admin, per-section ACL)', () => {
	test('fixture assumptions hold (drift must redden, not vacuously pass)', async () => {
		if (!dbReady) return;
		expect(await getComponentFilterTipo(GATED_A)).toBe(GATED_A_FILTER);
		expect(await getComponentFilterTipo(GATED_B)).toBe(GATED_B_FILTER);
		expect(await getComponentFilterTipo(UNGATED)).toBeNull();
	});

	test('mixed gated/ungated: no throw; gated section guarded by its OWN filter, ungated survives bare', async () => {
		if (!dbReady) return;
		const { sql } = await buildSearchSql(sqoOver([GATED_A, UNGATED]), { principal: NON_ADMIN });
		// One EXISTS, keyed to the gated section's own filter tipo.
		expect(sql).toContain(`relation::jsonb->'${GATED_A_FILTER}'`);
		// The predicate is a disjunction of section_tipo-guarded branches:
		// (mix.section_tipo = $a AND EXISTS(…)) OR (mix.section_tipo = $b)
		expect(sql).toMatch(/\(mix\.section_tipo = \$\d+::text AND EXISTS /);
		expect(sql).toMatch(/ OR \(mix\.section_tipo = \$\d+::text\)\)/);
	});

	test('two gated sections with DIFFERENT filter tipos each get their own predicate (anti main-only)', async () => {
		if (!dbReady) return;
		const { sql } = await buildSearchSql(sqoOver([GATED_A, GATED_B]), { principal: NON_ADMIN });
		expect(sql).toContain(`relation::jsonb->'${GATED_A_FILTER}'`);
		expect(sql).toContain(`relation::jsonb->'${GATED_B_FILTER}'`);
	});

	test('ungated-FIRST ordering still filters the gated section (the PHP fail-open case)', async () => {
		if (!dbReady) return;
		// PHP keys the filter off the FIRST section only: ungated-first emits NO
		// filter and leaks every gated record. TS must filter regardless of order.
		const { sql } = await buildSearchSql(sqoOver([UNGATED, GATED_A]), { principal: NON_ADMIN });
		expect(sql).toContain(`relation::jsonb->'${GATED_A_FILTER}'`);
	});

	test('global admin bypasses the filter entirely', async () => {
		if (!dbReady) return;
		const { sql } = await buildSearchSql(sqoOver([GATED_A, UNGATED]), { principal: ADMIN });
		expect(sql).not.toContain('jsonb_array_elements');
		expect(sql).not.toContain(GATED_A_FILTER);
	});

	test('projects-less non-admin gets the impossible clause on gated sections only', async () => {
		if (!dbReady) return;
		const { sql } = await buildSearchSql(sqoOver([GATED_A, UNGATED]), {
			principal: NO_PROJECTS_USER,
		});
		expect(sql).toContain('IMPOSSIBLE VALUE (User without projects)');
	});
});
