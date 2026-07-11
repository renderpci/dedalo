/**
 * Phase 6 gate: AREA element contexts differential — one representative
 * instance of EVERY area model on this install (the "13 areas" breadth item).
 *
 * Areas are plain ontology nodes (label, translatable term, parent_grouper,
 * empty tools/buttons/columns_map); their structure context resolves through
 * the same generic builder as sections/components, exposed via
 * dd_core_api.get_element_context. We assert the TS single-entry context
 * matches live PHP on the structural subset + tools + buttons for each model.
 *
 * LEDGERED (excluded from the subset): the PHP area default request_config
 * null-skeleton (TS area entries omit the key), and the `type`/`typo` wrapper
 * fields not yet modeled anywhere.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** One representative per area model (from this install's ontology). */
const AREA_CASES: { model: string; tipo: string }[] = [
	{ model: 'area', tipo: 'dd322' },
	{ model: 'area_activity', tipo: 'dd69' },
	{ model: 'area_admin', tipo: 'dd207' },
	{ model: 'area_development', tipo: 'dd770' },
	{ model: 'area_graph', tipo: 'dd630' },
	{ model: 'area_maintenance', tipo: 'dd88' },
	{ model: 'area_ontology', tipo: 'dd5' },
	{ model: 'area_publication', tipo: 'dd222' },
	{ model: 'area_resource', tipo: 'dd14' },
	{ model: 'area_root', tipo: 'dd242' },
	{ model: 'area_thesaurus', tipo: 'dd100' },
	{ model: 'area_tool', tipo: 'dd35' },
];

/** The structural subset both sides must agree on for an area context. */
function subset(entry: Record<string, unknown>): Record<string, unknown> {
	const sectionTipo = Array.isArray(entry.section_tipo)
		? (entry.section_tipo as string[])[0]
		: entry.section_tipo;
	return {
		tipo: entry.tipo,
		section_tipo: sectionTipo,
		model: entry.model,
		mode: entry.mode,
		lang: entry.lang,
		label: entry.label,
		translatable: entry.translatable ?? false,
		parent_grouper: entry.parent_grouper ?? null,
		tools: entry.tools ?? [],
		buttons: entry.buttons ?? [],
	};
}

describe.if(hasPhpCredentials())('areas differential (Phase 6 gate — every area model)', () => {
	const results: { model: string; php: Record<string, unknown>; ts: Record<string, unknown> }[] =
		[];

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
		const ctx = {
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		};

		for (const area of AREA_CASES) {
			const rqo = {
				action: 'get_element_context',
				dd_api: 'dd_core_api',
				source: {
					model: area.model,
					tipo: area.tipo,
					section_tipo: area.tipo,
					mode: 'list',
					lang: 'lg-spa',
				},
			};
			const { body } = await client.call(structuredClone(rqo));
			const phpEntry = (body.result as Record<string, unknown>[])?.[0] ?? {};
			const tsResult = await dispatchRqo(rqo as unknown as Rqo, ctx);
			const tsEntry = (tsResult.body.result as Record<string, unknown>[])?.[0] ?? {};
			results.push({ model: area.model, php: phpEntry, ts: tsEntry });
		}
	});

	test('every area model context matches PHP (subset + tools + buttons)', () => {
		if (!hasPhpCredentials()) return;
		expect(results.length).toBe(AREA_CASES.length);
		for (const { model, php, ts } of results) {
			// Per-model comparison so a failure names the exact area model.
			expect({ model, ...subset(ts) }).toEqual({ model, ...subset(php) });
		}
	});
});
