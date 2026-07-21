/**
 * ACTIVITY (dd542) list-sort policy (WC-044, 2026-07-21) — the TS-native
 * contract that replaces the frozen-PHP behavior for the append-only log:
 *
 *  1. Only the When column (dd547) is sortable; its ORDER path maps to the
 *     indexed `section_id` direct column (append-only ⇒ When-order ≡
 *     insertion order). Every other dd542 component emits sortable:false —
 *     an arbitrary component sort is an unindexable full-table jsonb sort
 *     (minutes on a 33M-row production log). Same policy family as the TM
 *     list (read_tm.ts maps header sorts to real columns).
 *  2. The search assembler FLATTENS ordered single-section queries only on
 *     tables carrying the UNIQUE (section_id, section_tipo) key —
 *     matrix_time_machine/matrix_structurations lack it and must keep the
 *     windowed DISTINCT-ON shape (version rows share section_id).
 *
 * The dd542 rows of list_column_sortable_differential are history (ledgered
 * there); THIS gate pins the new contract.
 */

import { describe, expect, test } from 'bun:test';
import { ACTIVITY_SECTION_TIPO, ACTIVITY_WHEN_TIPO } from '../../src/core/concepts/section.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { buildOrderPath } from '../../src/core/search/order_path.ts';
import { tableHasUniqueSectionKey } from '../../src/core/search/sql_assembler.ts';
import { readSection } from '../../src/core/section/read.ts';

/** dd542's list columns (dd549 show.ddo_map + the projects filter). */
const ACTIVITY_COMPONENT_TIPOS = ['dd543', 'dd544', 'dd545', 'dd546', 'dd551'];

interface Ctx {
	tipo: string;
	section_tipo: string;
	model?: string;
	sortable?: unknown;
	path?: unknown;
}

async function activityListContext(): Promise<Ctx[]> {
	const res = await runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, () =>
		readSection({
			dd_api: 'dd_core_api',
			action: 'read',
			source: {
				model: 'section',
				tipo: ACTIVITY_SECTION_TIPO,
				section_tipo: ACTIVITY_SECTION_TIPO,
				mode: 'list',
				lang: 'lg-eng',
				action: 'search',
			},
			sqo: { section_tipo: [ACTIVITY_SECTION_TIPO], limit: 1, offset: 0 },
		} as never),
	);
	return ((res as { context?: Ctx[] }).context ?? []) as Ctx[];
}

describe('activity sort policy (WC-044)', () => {
	test('When (dd547) order path maps to the section_id direct column', async () => {
		const path = await runWithRequestLangs(
			{ applicationLang: 'lg-eng', dataLang: 'lg-eng' },
			() => buildOrderPath(ACTIVITY_WHEN_TIPO, ACTIVITY_SECTION_TIPO),
		);
		expect(path.length).toBe(1);
		expect(path[0]?.component_tipo).toBe('section_id');
		expect(path[0]?.section_tipo).toBe(ACTIVITY_SECTION_TIPO);
	});

	test('a non-activity date component keeps its ordinary jsonb order path', async () => {
		// Same model (component_date), different section — the mapping is
		// dd542-scoped, not a component_date behavior change.
		const path = await runWithRequestLangs(
			{ applicationLang: 'lg-eng', dataLang: 'lg-eng' },
			() => buildOrderPath('oh18', 'oh1'),
		);
		expect(path[0]?.component_tipo).toBe('oh18');
	});

	test('dd542 context: only When is sortable; its path is section_id', async () => {
		const ctx = await activityListContext();
		const byTipo = new Map(ctx.map((e) => [e.tipo, e]));

		const when = byTipo.get(ACTIVITY_WHEN_TIPO);
		expect(when?.sortable).toBe(true);
		const whenPath = when?.path as { component_tipo?: string }[] | undefined;
		expect(whenPath?.[0]?.component_tipo).toBe('section_id');

		for (const tipo of ACTIVITY_COMPONENT_TIPOS) {
			const entry = byTipo.get(tipo);
			if (entry === undefined) continue; // absent from this install's list config
			expect(entry.sortable, `${tipo} must not be sortable`).toBe(false);
		}
	});

	test('unique-key probe: ordinary matrix tables yes, versioned tables no', async () => {
		expect(await tableHasUniqueSectionKey('matrix_activity')).toBe(true);
		expect(await tableHasUniqueSectionKey('matrix')).toBe(true);
		expect(await tableHasUniqueSectionKey('matrix_time_machine')).toBe(false);
	});
});
