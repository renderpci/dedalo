/**
 * RELATIONS_SPEC.md gate 3 — request_config resolution parity over the §7
 * corpus (both config strategies exercised: explicit, self-targeting sqo,
 * dynamic hierarchy_types, multi-section, filter_by_list expansion, and the
 * implicit/no-source legacy rows).
 *
 * Oracle: dd_core_api::get_element_context on the live PHP server vs the TS
 * dispatch handler — comparing the REQUEST_CONFIG projection: per item
 * api_engine/type, resolved sqo target sections, the show/search/choose
 * ddo_map identity chain (tipo/parent/mode), and the expanded filter_by_list
 * (per filter: context tipo + datalist labels/values).
 *
 * sqo.section_tipo entries are the ENRICHED ddo objects on both engines
 * (labels, colors, permissions, buttons, matrix_table — the CLIENT depends
 * on them: portal link/new buttons read target_section[0].tipo) and are
 * compared IN FULL.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** The §7 corpus rows this gate drives (component context in EDIT mode). */
const CASES: { tipo: string; section_tipo: string; family: string }[] = [
	// explicit config
	{ tipo: 'numisdata161', section_tipo: 'numisdata4', family: 'explicit + filter_by_list' },
	{ tipo: 'numisdata77', section_tipo: 'numisdata3', family: 'explicit portal' },
	{ tipo: 'numisdata75', section_tipo: 'numisdata3', family: 'explicit portal + dataframe' },
	{ tipo: 'numisdata249', section_tipo: 'numisdata3', family: 'explicit deep ddo_map' },
	{ tipo: 'numisdata34', section_tipo: 'numisdata3', family: 'explicit autocomplete + dataframe' },
	// multi-section + dynamic hierarchy_types targets
	{ tipo: 'numisdata159', section_tipo: 'numisdata3', family: 'explicit multi-section' },
	{ tipo: 'numisdata20', section_tipo: 'numisdata6', family: 'explicit hierarchy_types' },
	{ tipo: 'rsc860', section_tipo: 'rsc167', family: 'explicit hierarchy_types wide' },
	// implicit-self sqo (no section_tipo, filter_by_list only)
	{ tipo: 'numisdata36', section_tipo: 'numisdata3', family: 'explicit self-targeting sqo' },
	{ tipo: 'numisdata1006', section_tipo: 'numisdata3', family: 'explicit self-targeting sqo' },
	// implicit / no-source legacy rows
	{ tipo: 'numisdata55', section_tipo: 'numisdata4', family: 'implicit legacy source object' },
	{ tipo: 'numisdata967', section_tipo: 'numisdata3', family: 'implicit no-source radio' },
	{ tipo: 'numisdata71', section_tipo: 'numisdata3', family: 'implicit no-source autocomplete' },
	{ tipo: 'numisdata1562', section_tipo: 'numisdata3', family: 'implicit no-source select' },
	// external engine (zenon aux item -> api_config attach) + portals
	{ tipo: 'numisdata163', section_tipo: 'numisdata6', family: 'explicit + zenon api_config' },
	{ tipo: 'rsc1435', section_tipo: 'rsc197', family: 'explicit family-unit portal' },
	{ tipo: 'hierarchy93', section_tipo: 'tema1', family: 'explicit thesaurus library' },
	// source {mode: external} — inverse/runtime resolution, no request_config
	{ tipo: 'hierarchy40', section_tipo: 'cult1', family: 'external-mode relation_index' },
];

/**
 * sqo.section_tipo entries: BOTH engines ship the ENRICHED ddo objects
 * (typo/tipo/model/permissions/label/buttons/color/matrix_table — the client
 * contract; PHP build_sqo_section_tipo_ddo). Compared in full.
 */
function targetTipos(sectionTipo: unknown): unknown[] {
	return Array.isArray(sectionTipo) ? sectionTipo : [];
}

/** ddo_map identity chain incl. the SELF-RESOLVED section_tipo (the client
 * bug of 2026-07-03: 'self' must resolve to the sqo TARGETS, not the caller —
 * excluded from this projection, the corpus missed it). */
function ddoChain(
	block: unknown,
): { tipo: unknown; parent: unknown; mode: unknown; section_tipo: unknown }[] {
	const map = (block as { ddo_map?: Record<string, unknown>[] } | null)?.ddo_map ?? [];
	return map.map((ddo) => ({
		tipo: ddo.tipo,
		parent: ddo.parent,
		mode: ddo.mode,
		section_tipo: ddo.section_tipo ?? null,
	}));
}

/** filter_by_list expansion surface: filter component + its option list. */
function filterByListSurface(
	filterByList: unknown,
): { tipo: unknown; options: { label: unknown; section_id: unknown }[] }[] {
	const list = Array.isArray(filterByList) ? filterByList : [];
	return list.map((filter) => {
		const context = (filter as { context?: unknown }).context;
		const contextEntry = Array.isArray(context) ? context[0] : context;
		const datalist = ((filter as { datalist?: unknown[] }).datalist ?? []) as Record<
			string,
			unknown
		>[];
		return {
			tipo: (contextEntry as { tipo?: unknown } | null)?.tipo,
			options: datalist.map((option) => ({
				label: option.label,
				section_id: option.section_id,
			})),
		};
	});
}

/** The full comparable projection of one request_config array. */
function configProjection(requestConfig: unknown): unknown {
	const items = Array.isArray(requestConfig) ? (requestConfig as Record<string, unknown>[]) : [];
	return items.map((item) => {
		const sqo = (item.sqo ?? {}) as Record<string, unknown>;
		return {
			api_engine: item.api_engine,
			type: item.type,
			targets: targetTipos(sqo.section_tipo),
			filter_by_list:
				sqo.filter_by_list === undefined ? null : filterByListSurface(sqo.filter_by_list),
			show: ddoChain(item.show),
			search: ddoChain(item.search),
			choose: ddoChain(item.choose),
		};
	});
}

function elementContextRqo(tipo: string, sectionTipo: string): Record<string, unknown> {
	return {
		action: 'get_element_context',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			tipo,
			section_tipo: sectionTipo,
			mode: 'edit',
			lang: 'lg-spa',
		},
	};
}

describe.if(hasPhpCredentials())(
	'relation corpus request_config parity (spec §7/§8 gate 3)',
	() => {
		const results = new Map<string, { php: unknown; ts: unknown }>();

		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const token = createSession(-1, 'root', true);
			const session = getSession(token);
			const principal = await resolvePrincipal(-1);

			for (const testCase of CASES) {
				const rqo = elementContextRqo(testCase.tipo, testCase.section_tipo);
				const { body } = await client.call(structuredClone(rqo));
				const phpEntry = ((body.result as Record<string, unknown>[]) ?? [])[0];
				const tsResult = await dispatchRqo(structuredClone(rqo) as unknown as Rqo, {
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				});
				const tsEntry = ((tsResult.body.result as Record<string, unknown>[]) ?? [])[0];
				results.set(testCase.tipo, {
					php: configProjection(phpEntry?.request_config),
					ts: configProjection(tsEntry?.request_config),
				});
			}
		});

		for (const testCase of CASES) {
			test(`${testCase.tipo} (${testCase.family}): request_config projection matches PHP`, () => {
				if (!hasPhpCredentials()) return;
				const pair = results.get(testCase.tipo);
				expect(pair).toBeDefined();
				expect(pair?.ts).toEqual(pair?.php as never);
			});
		}
	},
);
