/**
 * TRIPWIRE — the external SEARCH TARGET decision.
 *
 * `dd_external_api::search` is handed a component tipo and nothing else that
 * could name a service: no url, no host, no field list, no target section, not
 * even a render mode. Everything the request needs is therefore DERIVED, and
 * the derivation is the part that can be wrong while every other gate stays
 * green — a wrong target resolves to "misconfigured" (or, worse, to a different
 * catalogue) with a perfectly healthy transport underneath.
 *
 * The first cut of the action derived it two ways that LOOK right and are not,
 * and this gate exists because both were found by resolving the six real
 * `api_engine` callers of this installation rather than by reading the code:
 *
 *  1. IT TOOK `ddo_map[0].section_tipo`. That is what
 *     `relations/request_config/external.ts` does — PHP parity, on a
 *     PUBLICATION path — but a portal's external item leads with its OWN portal
 *     ddo (`rsc1285` → `rsc368`@`rsc332`) and lists the `zenon1` fields after
 *     it. `rsc1285`, `tchi29` and `numisdata162` all resolved to `rsc332`, a
 *     section with no `api_config`, and answered every search "misconfigured".
 *     The browser engine had hidden exactly this behind a hard-coded fallback
 *     URL, which is why it had never been noticed.
 *  2. IT ASKED ONE MODE (`list`). The builder answers a different item set per
 *     mode — a `section_list` child substitutes the whole config in list-like
 *     modes — so `numisdata162` declares its external item in EDIT only and
 *     resolved to nothing at all.
 *
 * The item shapes below are FROZEN COPIES of what
 * `buildRequestConfigForElement` actually answers for those nodes against the
 * application ontology (the `ontology_census.json` discipline: the gate must be
 * credless, and the test DB holds a smaller ontology that would quietly assert
 * less). The last describe re-runs the real thing wherever the tree does exist.
 */
// BINDS INSTALL TLDs: numisdata, rsc, tchi, zenon — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import {
	type ExternalSearchConfigItem,
	resolveExternalSearchTarget,
	selectExternalSearchTarget,
} from '../../src/core/api/handlers/dd_external_api.ts';
import { getNode } from '../../src/core/ontology/resolver.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** The predicate the production path derives from the descriptor facet. */
const isExternal = async (tipo: string): Promise<boolean> => tipo.startsWith('zenon');

/** rsc1285 / tchi29: a PORTAL's external item — its own ddo first, zenon after. */
const PORTAL_ITEM: ExternalSearchConfigItem = {
	api_engine: 'zenon',
	show: {
		ddo_map: [
			{ tipo: 'rsc368', section_tipo: 'rsc332' },
			{ tipo: 'zenon3', section_tipo: 'zenon1' },
			{ tipo: 'zenon4', section_tipo: 'zenon1' },
			{ tipo: 'zenon5', section_tipo: 'zenon1' },
			{ tipo: 'zenon6', section_tipo: 'zenon1' },
		],
	},
};

/** rsc368: the simple autocomplete item — external ddos only. */
const AUTOCOMPLETE_ITEM: ExternalSearchConfigItem = {
	api_engine: 'zenon',
	show: {
		ddo_map: [
			{ tipo: 'zenon5', section_tipo: ['zenon1'] },
			{ tipo: 'zenon6', section_tipo: 'zenon1' },
		],
	},
};

const DEDALO_ITEM: ExternalSearchConfigItem = {
	api_engine: 'dedalo',
	show: { ddo_map: [{ tipo: 'rsc349', section_tipo: 'rsc205' }] },
};

describe('the target is the section of the EXTERNAL ddos, not of ddo_map[0]', () => {
	test('a portal item whose first ddo is its own non-external ddo resolves to zenon1', async () => {
		const { targetSectionTipo, externalDdos } = await selectExternalSearchTarget(
			'rsc1285',
			[[DEDALO_ITEM, PORTAL_ITEM]],
			isExternal,
		);
		// The first-ddo rule answers 'rsc332' here — a section with no api_config,
		// so every search against this portal fails as misconfigured.
		expect(targetSectionTipo).toBe('zenon1');
		expect(externalDdos.map((entry) => entry.tipo)).toEqual([
			'zenon3',
			'zenon4',
			'zenon5',
			'zenon6',
		]);
	});

	test('the non-external leading ddo is not carried as a display field', async () => {
		const { externalDdos } = await selectExternalSearchTarget(
			'rsc1285',
			[[PORTAL_ITEM]],
			isExternal,
		);
		expect(externalDdos.some((entry) => entry.tipo === 'rsc368')).toBe(false);
	});
});

describe('every render mode is asked, because a component declares per mode', () => {
	test('an item declared in EDIT only still resolves (the numisdata162 shape)', async () => {
		// mode 'list' answers a section_list-substituted config with no external
		// item at all; mode 'edit' carries it. Asking one mode resolves nothing.
		const perMode = [[DEDALO_ITEM], [DEDALO_ITEM, PORTAL_ITEM]];
		const { targetSectionTipo } = await selectExternalSearchTarget(
			'numisdata162',
			perMode,
			isExternal,
		);
		expect(targetSectionTipo).toBe('zenon1');
	});

	test('a component with no external item in ANY mode is refused by name', async () => {
		// A registered refusal (`external.bad_config`): the ontology names no
		// engine. The naming sentence stays the LOG-only `message`.
		const refusal = await refusalOf(
			selectExternalSearchTarget('rsc999', [[DEDALO_ITEM], [DEDALO_ITEM]], isExternal),
		);
		expect(refusal.code).toBe('external.bad_config');
		expect(refusal.message).toMatch(/declares no external api_engine/);
	});

	test('the same ddo declared in two modes is counted once', async () => {
		const { externalDdos } = await selectExternalSearchTarget(
			'tchi29',
			[[PORTAL_ITEM], [PORTAL_ITEM]],
			isExternal,
		);
		expect(externalDdos.map((entry) => entry.tipo)).toEqual([
			'zenon3',
			'zenon4',
			'zenon5',
			'zenon6',
		]);
	});
});

describe('ambiguity is REFUSED, never resolved by picking one', () => {
	test('two external target sections throw and name both', async () => {
		const second: ExternalSearchConfigItem = {
			api_engine: 'wikidata',
			show: { ddo_map: [{ tipo: 'zenon90', section_tipo: 'zenon50' }] },
		};
		const refusal = await refusalOf(
			selectExternalSearchTarget('rsc368', [[AUTOCOMPLETE_ITEM, second]], isExternal),
		);
		expect(refusal.code).toBe('external.bad_config');
		expect(refusal.message).toMatch(/zenon1/);
		expect(refusal.message).toMatch(/zenon50/);
		expect(refusal.message).toMatch(/cannot choose/);
	});

	test('an external item whose ddos name no section is refused, not defaulted', async () => {
		const nameless: ExternalSearchConfigItem = {
			api_engine: 'zenon',
			show: { ddo_map: [{ tipo: 'zenon3' }] },
		};
		const refusal = await refusalOf(selectExternalSearchTarget('rsc368', [[nameless]], isExternal));
		expect(refusal.code).toBe('external.bad_config');
		expect(refusal.message).toMatch(/names no external target section/);
	});
});

describe('the real ontology, wherever this DB carries the tree', () => {
	/**
	 * The credless half above proves the DECISION. This proves the WIRING — that
	 * the decision is fed the real builder's real answer. It runs only where the
	 * caller and the zenon display tree both exist (the application ontology);
	 * the test DB carries a smaller one, and skipping LOUDLY is the honest
	 * alternative to asserting less.
	 */
	test('every api_engine caller resolves to exactly one external section', async () => {
		const census = (await Bun.file(
			`${import.meta.dir}/../fixtures/external/ontology_census.json`,
		).json()) as { api_engine_nodes: { tipo: string }[] };
		let checked = 0;
		for (const node of census.api_engine_nodes) {
			const sectionTipo = await sectionOf(node.tipo);
			if (sectionTipo === null) continue; // not in this DB
			if ((await getNode('zenon1')) === null) continue; // no display tree here
			const target = await resolveExternalSearchTarget(node.tipo, sectionTipo);
			expect(target.targetSectionTipo, `${node.tipo} target`).toBe('zenon1');
			expect(target.ddos.length, `${node.tipo} display fields`).toBeGreaterThan(0);
			expect(target.remoteFields, `${node.tipo} remote fields`).toContain('id');
			checked++;
		}
		if (checked === 0) {
			console.warn(
				'[external_search_target_tripwire] SKIPPED the ontology half: this DB carries no api_engine caller with a zenon1 display tree. The credless half above still ran.',
			);
		}
	});
});

/** The section a component lives under, by walking parents. */
async function sectionOf(tipo: string): Promise<string | null> {
	let current: string | null = tipo;
	for (let hop = 0; hop < 12 && current !== null; hop++) {
		const node = await getNode(current);
		if (node === null) return null;
		if (node.model === 'section') return current;
		current = (node.parent as string | null) ?? null;
	}
	return null;
}
