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
 *     ddo (the portal's own ddo @ its own section) and lists the external
 *     fields after it. All three portal-shaped callers resolved to that own
 *     section, which has no `api_config`, and answered every search
 *     "misconfigured".
 *     The browser engine had hidden exactly this behind a hard-coded fallback
 *     URL, which is why it had never been noticed.
 *  2. IT ASKED ONE MODE (`list`). The builder answers a different item set per
 *     mode — a `section_list` child substitutes the whole config in list-like
 *     modes — so a caller that declares its external item in EDIT only
 *     resolved to nothing at all.
 *
 * The item shapes below are FROZEN COPIES of what
 * `buildRequestConfigForElement` actually answers for those nodes against the
 * application ontology (the `ontology_census.json` discipline: the gate must be
 * credless, and the test DB holds a smaller ontology that would quietly assert
 * less). The last describe re-runs the real thing wherever the tree does exist.
 */
// Migrated to the generic `test` TLD 2026-08-19. The frozen item shapes keep their SHAPE
// and lose the install's names: the external section and its display fields are the
// phase-2 clones test7342 / test7344-test7347 (src/core/test_data/test_tld_tipo_map.json),
// the seed-shipped caller/portal tipos are composed through `seed()` so the install-TLD
// census (scripts/lib/tld_census.ts) does not read them as corpus bindings, and the
// ontology half now drives the generic `test` callers instead of an install's census.

import { describe, expect, test } from 'bun:test';
import {
	type ExternalSearchConfigItem,
	resolveExternalSearchTarget,
	selectExternalSearchTarget,
} from '../../src/core/api/handlers/dd_external_api.ts';
import { getNode } from '../../src/core/ontology/resolver.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** A seed-shipped tipo, kept out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The generic clone of the external section, and its four display fields. */
const EXTERNAL_SECTION = 'test7342';
const EXTERNAL_DDOS = ['test7344', 'test7345', 'test7346', 'test7347'] as const;
/** A SECOND external section (a different engine) — fabricated, for the ambiguity case. */
const OTHER_EXTERNAL_SECTION = 'test7350';
const OTHER_EXTERNAL_DDO = 'test7390';

/**
 * The predicate the production path derives from the descriptor facet. Here it
 * answers for the external tree above (`test73**`) and for nothing else, so a
 * non-external leading ddo stays non-external.
 */
const isExternal = async (tipo: string): Promise<boolean> => tipo.startsWith('test73');

/** The portal caller and its own (non-external) leading ddo + section. */
const PORTAL_CALLER = seed('rsc', 1285);
const PORTAL_OWN_DDO = seed('rsc', 368);
const PORTAL_OWN_SECTION = seed('rsc', 332);
/** A second portal caller declaring the SAME item (the dedup case). */
const SECOND_PORTAL_CALLER = 'testimmovable1027';
/** The caller that declares its external item in EDIT only. */
const EDIT_ONLY_CALLER = 'test6231';
/** A caller that declares no external item in ANY mode. */
const NO_EXTERNAL_CALLER = seed('rsc', 999);

/** A PORTAL's external item — its own ddo first, the external fields after. */
const PORTAL_ITEM: ExternalSearchConfigItem = {
	api_engine: 'zenon',
	show: {
		ddo_map: [
			{ tipo: PORTAL_OWN_DDO, section_tipo: PORTAL_OWN_SECTION },
			{ tipo: EXTERNAL_DDOS[0], section_tipo: EXTERNAL_SECTION },
			{ tipo: EXTERNAL_DDOS[1], section_tipo: EXTERNAL_SECTION },
			{ tipo: EXTERNAL_DDOS[2], section_tipo: EXTERNAL_SECTION },
			{ tipo: EXTERNAL_DDOS[3], section_tipo: EXTERNAL_SECTION },
		],
	},
};

/** The simple autocomplete item — external ddos only. */
const AUTOCOMPLETE_ITEM: ExternalSearchConfigItem = {
	api_engine: 'zenon',
	show: {
		ddo_map: [
			{ tipo: EXTERNAL_DDOS[2], section_tipo: [EXTERNAL_SECTION] },
			{ tipo: EXTERNAL_DDOS[3], section_tipo: EXTERNAL_SECTION },
		],
	},
};

const DEDALO_ITEM: ExternalSearchConfigItem = {
	api_engine: 'dedalo',
	show: { ddo_map: [{ tipo: seed('rsc', 349), section_tipo: seed('rsc', 205) }] },
};

describe('the target is the section of the EXTERNAL ddos, not of ddo_map[0]', () => {
	test('a portal item whose first ddo is its own non-external ddo resolves to the external section', async () => {
		const { targetSectionTipo, externalDdos } = await selectExternalSearchTarget(
			PORTAL_CALLER,
			[[DEDALO_ITEM, PORTAL_ITEM]],
			isExternal,
		);
		// The first-ddo rule answers the portal's OWN section here — a section with
		// no api_config, so every search against this portal fails as misconfigured.
		expect(targetSectionTipo).toBe(EXTERNAL_SECTION);
		expect(externalDdos.map((entry) => entry.tipo)).toEqual([...EXTERNAL_DDOS]);
	});

	test('the non-external leading ddo is not carried as a display field', async () => {
		const { externalDdos } = await selectExternalSearchTarget(
			PORTAL_CALLER,
			[[PORTAL_ITEM]],
			isExternal,
		);
		expect(externalDdos.some((entry) => entry.tipo === PORTAL_OWN_DDO)).toBe(false);
	});
});

describe('every render mode is asked, because a component declares per mode', () => {
	test('an item declared in EDIT only still resolves (the edit-only shape)', async () => {
		// mode 'list' answers a section_list-substituted config with no external
		// item at all; mode 'edit' carries it. Asking one mode resolves nothing.
		const perMode = [[DEDALO_ITEM], [DEDALO_ITEM, PORTAL_ITEM]];
		const { targetSectionTipo } = await selectExternalSearchTarget(
			EDIT_ONLY_CALLER,
			perMode,
			isExternal,
		);
		expect(targetSectionTipo).toBe(EXTERNAL_SECTION);
	});

	test('a component with no external item in ANY mode is refused by name', async () => {
		// A registered refusal (`external.bad_config`): the ontology names no
		// engine. The naming sentence stays the LOG-only `message`.
		const refusal = await refusalOf(
			selectExternalSearchTarget(NO_EXTERNAL_CALLER, [[DEDALO_ITEM], [DEDALO_ITEM]], isExternal),
		);
		expect(refusal.code).toBe('external.bad_config');
		expect(refusal.message).toMatch(/declares no external api_engine/);
	});

	test('the same ddo declared in two modes is counted once', async () => {
		const { externalDdos } = await selectExternalSearchTarget(
			SECOND_PORTAL_CALLER,
			[[PORTAL_ITEM], [PORTAL_ITEM]],
			isExternal,
		);
		expect(externalDdos.map((entry) => entry.tipo)).toEqual([...EXTERNAL_DDOS]);
	});
});

describe('ambiguity is REFUSED, never resolved by picking one', () => {
	test('two external target sections throw and name both', async () => {
		const second: ExternalSearchConfigItem = {
			api_engine: 'wikidata',
			show: { ddo_map: [{ tipo: OTHER_EXTERNAL_DDO, section_tipo: OTHER_EXTERNAL_SECTION }] },
		};
		const refusal = await refusalOf(
			selectExternalSearchTarget(PORTAL_OWN_DDO, [[AUTOCOMPLETE_ITEM, second]], isExternal),
		);
		expect(refusal.code).toBe('external.bad_config');
		expect(refusal.message).toContain(EXTERNAL_SECTION);
		expect(refusal.message).toContain(OTHER_EXTERNAL_SECTION);
		expect(refusal.message).toMatch(/cannot choose/);
	});

	test('an external item whose ddos name no section is refused, not defaulted', async () => {
		const nameless: ExternalSearchConfigItem = {
			api_engine: 'zenon',
			show: { ddo_map: [{ tipo: EXTERNAL_DDOS[0] }] },
		};
		const refusal = await refusalOf(
			selectExternalSearchTarget(PORTAL_OWN_DDO, [[nameless]], isExternal),
		);
		expect(refusal.code).toBe('external.bad_config');
		expect(refusal.message).toMatch(/names no external target section/);
	});
});

describe('the real ontology — the generic `test` api_engine callers', () => {
	/**
	 * The credless half above proves the DECISION. This proves the WIRING — that
	 * the decision is fed the REAL builder's real answer for real nodes.
	 *
	 * It used to iterate a frozen census of THIS INSTALLATION's six api_engine
	 * callers and skip every one the database did not carry — on the suite
	 * database that was all of them, so the whole describe was a warning and
	 * nothing else. The generic `test` TLD carries its own api_engine callers
	 * (`test61`, `test204`), so they are driven here instead, unconditionally.
	 *
	 * The production path derives the target and THEN asks it for an api_config.
	 * The cloned external section deliberately carries NONE (the clone strips
	 * `properties.api_config`: a cloned live endpoint once handed the credless
	 * suite a real remote URL), so the run stops at that last step — and its
	 * refusal NAMES the section the derivation produced, which is exactly the
	 * decision this tripwire measures. Nothing here can reach the network.
	 */
	const GENERIC_API_ENGINE_CALLERS = ['test61', 'test204'] as const;

	test('every generic api_engine caller resolves to exactly one external section', async () => {
		let checked = 0;
		for (const tipo of GENERIC_API_ENGINE_CALLERS) {
			const sectionTipo = await sectionOf(tipo);
			if (sectionTipo === null) continue; // not in this DB
			if ((await getNode(EXTERNAL_SECTION)) === null) continue; // no display tree here
			const refusal = await refusalOf(resolveExternalSearchTarget(tipo, sectionTipo));
			expect(refusal.code, `${tipo} target`).toBe('external.bad_config');
			expect(refusal.message, `${tipo} target`).toBe(
				`target section ${EXTERNAL_SECTION} carries no api_config`,
			);
			checked++;
		}
		// Anti-vacuity: a run that checked nothing is a FAILURE, not a warning.
		expect(checked, 'no generic api_engine caller resolved in this database').toBe(
			GENERIC_API_ENGINE_CALLERS.length,
		);
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
