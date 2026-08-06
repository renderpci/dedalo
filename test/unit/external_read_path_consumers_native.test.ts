/**
 * THE TWO READ-PATH CONSUMERS OF A request_config, and what each is allowed to
 * take from it. Both invariants here were broken by the multi-engine landing
 * and both change bytes for ORDINARY dedalo-only records — nothing external is
 * needed to trigger either.
 *
 * ── 1. THE FLAT/EXPORT MAP IS SHOW-ONLY ──────────────────────────────────────
 * `full_ddo_map` (class.common.php:2312-2341) merges show + hide, and that is
 * what the CLIENT gets. The flat cell JOIN and the export atoms are a different
 * consumer: PHP builds them from `show->ddo_map` alone
 * (class.component_relation_common.php:756-761 get_export_value, :331-339
 * get_grid_value) and resolves hide separately into `$ar_hide`, "used as
 * internal data … it doesn't show into the list" (class.component_common.php
 * :2932-2960).
 *
 * Routing the flat map through the shared flattener made hide leak into it.
 * 58 live nodes in dedalo_mib_v7 declare a hide ddo, ALL with `parent: 'self'`
 * so the consumers' parent filter passes every one:
 *   - 49 component_dataframe frames declare rsc1246 in BOTH maps (show mode
 *     'edit', hide mode 'solved' — the rating colour the widget resolves
 *     without rendering). The structural dedup keeps both, so the flat cell
 *     printed the rating TWICE: "Alta, Alta".
 *   - 8 component_autocomplete_hi hide hierarchy31 (component_geolocation),
 *     which has no flatValue family — one false entry in the response's
 *     `unresolved` ledger per cell.
 *
 * ── 2. CELL PAGING IS LOCAL, NOT A REMOTE CAPABILITY ─────────────────────────
 * `cellLimit` slices the locator array THIS install stores. It was being
 * negotiated as `capabilities.pagination`, which asks whether the remote
 * SERVICE can page its own result set — a different question, answered `false`
 * by zenon, whose refusal then threw out of resolveListCellMap → expandPortal
 * and 500-ed every list of the hosting section.
 *
 * Ontology-only: no matrix row is read and nothing is written.
 */

import { describe, expect, test } from 'bun:test';
import { flattenConfigDdoMaps } from '../../src/core/relations/config_ddo_map.ts';
import { selectLocalConfigItem } from '../../src/core/relations/request_config/engine_select.ts';
import {
	resolveListCellMap,
	resolveOwnConfigMap,
} from '../../src/core/section/list_definitions/section_list.ts';

/** A dataframe frame declaring rsc1246 in show (mode 'edit') AND hide ('solved'). */
const RATING_FRAME = 'numisdata188';
const RATING = 'rsc1246';
/** An autocomplete_hi hiding hierarchy31 (component_geolocation — no flat value). */
const GEO_HIDER = 'numisdata585';
const GEOLOCATION = 'hierarchy31';
/** The one EXTERNAL-ONLY node: its single config item declares `zenon`. */
const EXTERNAL_ONLY = 'test61';

const count = (ddos: { tipo: string }[] | null, tipo: string): number =>
	(ddos ?? []).filter((ddo) => ddo.tipo === tipo).length;

describe('the flat/export map is SHOW-ONLY', () => {
	test('a rating frame contributes the rating ONCE, not "Alta, Alta"', async () => {
		const own = await resolveOwnConfigMap(RATING_FRAME);
		// The flat cell JOIN (resolve/relation_list.ts) and the export atoms
		// (diffusion/export/atoms.ts) both read exactly this list, and both
		// concatenate one field per entry.
		expect(count(own.rawDdos, RATING)).toBe(1);
		// It is the SHOW entry that survives, not the hide one.
		expect((own.rawDdos ?? []).find((ddo) => ddo.tipo === RATING)?.mode).toBe('edit');
	});

	test('a hidden component with no flat value never reaches the cell resolver', async () => {
		// Every one of these would otherwise be pushed into the response's
		// `unresolved` ledger — a false report of missing coverage.
		const own = await resolveOwnConfigMap(GEO_HIDER);
		expect(count(own.rawDdos, GEOLOCATION)).toBe(0);
	});

	test('the EMISSION map still carries hide (PHP full_ddo_map)', async () => {
		// The carve-out is per CONSUMER, not a global drop: the client widgets
		// read these (numisdata585's hierarchy31 feeds the map observer;
		// rsc1246 'solved' is the rating colour).
		const cell = await resolveListCellMap(RATING_FRAME);
		expect(count(cell.rawDdos, RATING)).toBe(2);
		expect(count((await resolveListCellMap(GEO_HIDER)).rawDdos, GEOLOCATION)).toBe(1);
	});

	test('flattenConfigDdoMaps: hide is excluded at the INPUT, never post-filtered', () => {
		// A hide ddo must not win the dedup slot of a LATER item's show ddo it
		// collides with — which is exactly what a post-filter would let it do.
		const items = [
			{ show: { ddo_map: [{ tipo: 'a' }] }, hide: { ddo_map: [{ tipo: 'b' }] } },
			{ show: { ddo_map: [{ tipo: 'b' }] } },
		];
		expect(flattenConfigDdoMaps(items, { ownerTipo: 'x', includeHideDdos: false })).toEqual([
			{ tipo: 'a' },
			{ tipo: 'b' },
		]);
		// Default (emission) keeps hide, first occurrence wins.
		expect(flattenConfigDdoMaps(items, { ownerTipo: 'x' })).toEqual([{ tipo: 'a' }, { tipo: 'b' }]);
	});
});

describe('cell paging is a LOCAL concern', () => {
	test('an external-only component resolves its cell map instead of throwing', async () => {
		// test61's only request_config item declares api_engine 'zenon', whose
		// adapter declares capabilities.pagination = false. Negotiating that
		// threw ExternalEngineConcernUnsupportedError uncaught through
		// expandPortal and 500-ed the whole section list.
		const cell = await resolveListCellMap(EXTERNAL_ONLY);
		expect(cell.rawDdos?.map((ddo) => ddo.tipo)).toEqual(['zenon3', 'zenon4', 'zenon5', 'zenon6']);
		// No sqo_config.limit declared → the caller's own default applies.
		expect(cell.cellLimit).toBeNull();
	});

	test('selectLocalConfigItem: dedalo item else first item, no adapter consulted', () => {
		const dedalo = { api_engine: 'dedalo', sqo: { limit: 7 } };
		const zenon = { api_engine: 'zenon', sqo: { limit: 3 } };
		// Implicit dedalo (no api_engine) still wins — test204's first item.
		const implicit: { api_engine?: string; sqo: { limit: number } } = { sqo: { limit: 9 } };
		expect(selectLocalConfigItem([implicit, zenon])).toBe(implicit);
		expect(selectLocalConfigItem([zenon, dedalo])).toBe(dedalo);
		// External-only: the item that owns the number, ungated.
		expect(selectLocalConfigItem([zenon])).toBe(zenon);
		expect(selectLocalConfigItem([])).toBeNull();
		expect(selectLocalConfigItem(null)).toBeNull();
	});
});
