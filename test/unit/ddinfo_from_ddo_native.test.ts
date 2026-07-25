/**
 * WC-052 gate — the rows `ddinfo` breadcrumb (matrixReadSource.emitRow):
 *
 * 1. SUPPRESSION: a value_with_parents ddo whose component resolved NO real
 *    value for the row emits NO ddinfo. A 'self' ddo resolves for EVERY
 *    searched section, so e.g. `hierarchy25` runs for a `tchi1` row where it
 *    has no data (entries: [], fallback_value: [null]) and — before WC-052 —
 *    emitted a PHANTOM breadcrumb the picker rendered BEFORE the row's real
 *    term column (`tch555`). The frozen PHP oracle keeps the phantom;
 *    deliberate divergence.
 * 2. STAMP: every emitted ddinfo carries `from_ddo_tipo` (the generating ddo)
 *    so the client can anchor each breadcrumb to its own term column
 *    (client `get_columns_map` per-anchor ddinfo columns).
 * 3. The lang-fallback face counts as a value: terms stored only in another
 *    lang arrive as `fallback_value` and must still produce their breadcrumb.
 */

import { describe, expect, test } from 'bun:test';
import type { Ddo } from '../../src/core/concepts/ddo.ts';
import { portalCellEmitsDdinfo } from '../../src/core/relations/relation_core.ts';
import { EmissionContext } from '../../src/core/resolve/component_data.ts';
import { matrixReadSource } from '../../src/core/section/read_source.ts';
import type { EmitRowContext, SectionRow } from '../../src/core/section/read_source.ts';

// A section tipo no ontology resolves — buildDdInfoChain returns [] without
// touching thesaurus data, keeping the gate independent of DB content.
const FAKE_SECTION = 'zzz999';

function contextFor(
	emittedByDdo: Record<string, object[]>,
	ddoMap: object[],
): { context: EmitRowContext; emission: EmissionContext } {
	const emission = new EmissionContext();
	const row = { section_tipo: FAKE_SECTION, section_id: 1, raw: {} } as unknown as SectionRow;
	const context = {
		row,
		ddoMap: ddoMap as EmitRowContext['ddoMap'],
		mode: 'list',
		lang: 'lg-spa',
		callerTipo: 'caller1',
		emission,
		emitDdo: (ddo: { tipo?: string }) => {
			for (const item of emittedByDdo[ddo.tipo ?? ''] ?? []) {
				emission.items.push(item as never);
			}
			return Promise.resolve();
		},
	} as unknown as EmitRowContext;
	return { context, emission };
}

function ddinfoItems(emission: EmissionContext): { from_ddo_tipo?: string }[] {
	return emission.items.filter((item) => (item as { tipo?: string }).tipo === 'ddinfo') as {
		from_ddo_tipo?: string;
	}[];
}

describe('WC-052 rows ddinfo suppression + from_ddo_tipo stamp', () => {
	test('phantom shape (entries [], fallback_value [null]) emits NO ddinfo', async () => {
		const { context, emission } = contextFor(
			{ h25: [{ tipo: 'h25', entries: [], fallback_value: [null] }] },
			[{ tipo: 'h25', parent: 'caller1', value_with_parents: true }],
		);
		await matrixReadSource.emitRow(context);
		expect(ddinfoItems(emission)).toHaveLength(0);
	});

	test('a resolved entries value emits ONE ddinfo stamped with the generating ddo', async () => {
		const { context, emission } = contextFor(
			{
				h25: [{ tipo: 'h25', entries: [], fallback_value: [null] }],
				t15: [{ tipo: 't15', entries: [{ lang: 'lg-spa', value: 'Cirat' }] }],
			},
			[
				{ tipo: 'h25', parent: 'caller1', value_with_parents: true },
				{ tipo: 't15', parent: 'caller1', value_with_parents: true },
			],
		);
		await matrixReadSource.emitRow(context);
		const items = ddinfoItems(emission);
		expect(items).toHaveLength(1);
		expect(items[0]?.from_ddo_tipo).toBe('t15');
	});

	test('the lang-fallback face counts as a value', async () => {
		const { context, emission } = contextFor(
			{
				h25: [
					{ tipo: 'h25', entries: [], fallback_value: [{ lang: 'lg-ita', value: 'Cicirata' }] },
				],
			},
			[{ tipo: 'h25', parent: 'caller1', value_with_parents: true }],
		);
		await matrixReadSource.emitRow(context);
		const items = ddinfoItems(emission);
		expect(items).toHaveLength(1);
		expect(items[0]?.from_ddo_tipo).toBe('h25');
	});

	test('a locator-shaped entry (no value face) counts as a value', async () => {
		const { context, emission } = contextFor(
			{ h25: [{ tipo: 'h25', entries: [{ section_tipo: 'es1', section_id: 5 }] }] },
			[{ tipo: 'h25', parent: 'caller1', value_with_parents: true }],
		);
		await matrixReadSource.emitRow(context);
		expect(ddinfoItems(emission)).toHaveLength(1);
	});

	test('a non-value_with_parents ddo never emits ddinfo', async () => {
		const { context, emission } = contextFor(
			{ t13: [{ tipo: 't13', entries: [{ lang: 'lg-spa', value: 'X' }] }] },
			[{ tipo: 't13', parent: 'caller1' }],
		);
		await matrixReadSource.emitRow(context);
		expect(ddinfoItems(emission)).toHaveLength(0);
	});
});

describe('portal-cell ddinfo config trigger (portalCellEmitsDdinfo)', () => {
	// The `tch555` own-config shape: user thesaurus `tchi1` lives in the
	// generic `matrix` table, so ONLY this config-driven trigger keeps its
	// edit-cell breadcrumb.
	const ddos = [
		{ tipo: 'h25', section_tipo: ['es1', 'tchi1'], value_with_parents: true },
		{ tipo: 't15', section_tipo: 'tchi1', value_with_parents: true },
		{ tipo: 't13', section_tipo: 'tchi1' },
	] as unknown as Ddo[];

	test('a vwp child compatible with the target triggers', () => {
		expect(portalCellEmitsDdinfo(ddos, 'tchi1')).toBe(true);
		expect(portalCellEmitsDdinfo(ddos, 'es1')).toBe(true);
	});

	test('a target no vwp child declares does NOT trigger', () => {
		expect(portalCellEmitsDdinfo(ddos, 'object1')).toBe(false);
	});

	test("'self'/undeclared section_tipo pass; non-vwp children never trigger", () => {
		expect(
			portalCellEmitsDdinfo(
				[{ tipo: 'x', section_tipo: 'self', value_with_parents: true }] as unknown as Ddo[],
				'any1',
			),
		).toBe(true);
		expect(
			portalCellEmitsDdinfo([{ tipo: 'x', value_with_parents: true }] as unknown as Ddo[], 'any1'),
		).toBe(true);
		expect(
			portalCellEmitsDdinfo([{ tipo: 'x', section_tipo: 'any1' }] as unknown as Ddo[], 'any1'),
		).toBe(false);
	});
});
