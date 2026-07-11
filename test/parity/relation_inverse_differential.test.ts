/**
 * RELATIONS_SPEC.md gate 4 — the INVERSE/INDEXATION family vs live PHP,
 * driven through the surfaces BOTH engines actually serve:
 *
 * 1. CHILDREN (§6.3, get_data action): rsc680 (component_relation_children)
 *    on rsc205 §19575 — 66 real children computed from the inverse dd47
 *    question, paged 5, expanded through the component's child ddos. Plus
 *    the DATA-DRIVEN-tipo pin: hierarchy49 on dz1 §503 resolves EMPTY on
 *    BOTH engines through this generic path (dz1 has no ontology node; the
 *    tree UI flows through dd_ts_api instead — a separate subsystem).
 * 2. INDEXATION + TAG LINKS (§6.4, get_data action): hierarchy40
 *    (component_relation_index, source {mode:'external'}) on dz1 §1024 — the
 *    dd96 inverse locator carries tag_id/section_top anchors (the rsc167
 *    rsc860 tag-indexation contract) + related_list children + full count.
 * 3. RELATED transitive closure (§6.6, section read): numisdata55
 *    (MULTIDIRECTIONAL dd621) on numisdata4 §6 — the computed `references`
 *    [{value, label}] on the edit item (a=b ∧ b=c ⇒ c=a walk + label build).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readComponentData, readSection } from '../../src/core/section/read.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

let php: PhpApiClient;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
}, 60000);

/** Comparable projection (identity + payload + computed references). */
function itemProjection(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_id: item.section_id,
		mode: item.mode,
		from_component_tipo: item.from_component_tipo,
		entries: item.entries ?? null,
		pagination: item.pagination ?? null,
		references: item.references ?? null,
	};
}

function getDataRqo(
	model: string,
	tipo: string,
	sectionTipo: string,
	sectionId: string,
	limit: number,
): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			action: 'get_data',
			model,
			tipo,
			section_tipo: sectionTipo,
			section_id: sectionId,
			mode: 'edit',
			lang: 'lg-nolan',
		},
		sqo: { section_tipo: [sectionTipo], limit, offset: 0 },
	};
}

/** Drive one get_data on both engines and project ALL returned items. */
async function compareGetData(rqo: Record<string, unknown>): Promise<{
	php: unknown[];
	ts: unknown[];
}> {
	const { body } = await php.call(structuredClone(rqo));
	// WC-001 (unified []): rewrite the PHP side only (see engineering/WIRE_CONTRACT.md).
	const phpItems = adoptEntriesArrayContract(
		(body.result as { data?: Record<string, unknown>[] })?.data ?? [],
	).map(itemProjection);
	const tsItems = (
		(await readComponentData(structuredClone(rqo) as unknown as Rqo)) as Record<string, unknown>[]
	).map(itemProjection);
	return { php: phpItems, ts: tsItems };
}

describe.if(hasPhpCredentials())('inverse/indexation family differential (spec gate 4)', () => {
	test('children get_data: rsc680 on rsc205 §19575 — computed page + full count + subdatum', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = getDataRqo('component_relation_children', 'rsc680', 'rsc205', '19575', 5);
		const { php: phpItems, ts: tsItems } = await compareGetData(rqo);
		expect(tsItems.length).toBeGreaterThan(1); // own item + expanded children
		expect(tsItems).toEqual(phpItems as never);
	});

	test('children get_data on a DATA-DRIVEN tipo (dz1 §503): EMPTY on both engines (pinned)', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = getDataRqo('component_relation_children', 'hierarchy49', 'dz1', '503', 5);
		const { php: phpItems, ts: tsItems } = await compareGetData(rqo);
		// dz1 has no ontology node: the generic path resolves no table/children
		// on EITHER engine (the tree resolves via dd_ts_api). Pin the parity so
		// a PHP behavior change surfaces loudly.
		expect(tsItems).toEqual(phpItems as never);
	});

	test('indexation get_data: hierarchy40 on dz1 §1024 — tag-carrying dd96 inverse page', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = getDataRqo('component_relation_index', 'hierarchy40', 'dz1', '1024', 5);
		const { php: phpItems, ts: tsItems } = await compareGetData(rqo);
		expect(tsItems.length).toBeGreaterThan(0);
		// The inverse locator MUST surface the tag anchors (tag_id +
		// section_top_id/tipo + from_component_top_tipo) — the stored
		// tag-indexation contract read back through the inverse machinery.
		const ownItem = tsItems.find((item) => (item as { tipo?: unknown }).tipo === 'hierarchy40') as
			| { entries?: { tag_id?: unknown }[] }
			| undefined;
		expect(ownItem?.entries?.[0]?.tag_id).toBeDefined();
		expect(tsItems).toEqual(phpItems as never);
	});

	test('relation_related MULTIDIRECTIONAL: numisdata4 §61683 computed references on the edit item', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				model: 'section',
				tipo: 'numisdata4',
				section_tipo: 'numisdata4',
				mode: 'edit',
				lang: 'lg-spa',
				action: 'search',
			},
			sqo: {
				section_tipo: ['numisdata4'],
				limit: 1,
				offset: 0,
				filter_by_locators: [{ section_tipo: 'numisdata4', section_id: '61683' }],
			},
			show: {
				ddo_map: [{ tipo: 'numisdata55', section_tipo: 'self', parent: 'self', mode: 'edit' }],
			},
		};
		const { body } = await php.call(structuredClone(rqo));
		// WC-001 (unified []): rewrite the PHP side only (see engineering/WIRE_CONTRACT.md).
		const phpItems = adoptEntriesArrayContract(
			(body.result as { data?: Record<string, unknown>[] })?.data ?? [],
		)
			.filter((item) => item.tipo === 'numisdata55')
			.map(itemProjection);
		const tsResult = await readSection(structuredClone(rqo) as unknown as Rqo);
		const tsItems = (tsResult.data as Record<string, unknown>[])
			.filter((item) => item.tipo === 'numisdata55')
			.map(itemProjection);
		expect(
			((tsItems[0] as { references?: unknown[] } | undefined)?.references ?? []).length,
		).toBeGreaterThan(0);
		expect(tsItems).toEqual(phpItems as never);
	});
});
