/**
 * Phase 6 gate: dd_core_api::get_element_context differential.
 *
 * get_element_context returns ONE element's structure context (no data) — the
 * element's own get_json(get_context=true). We drive it for a section and a
 * component and assert the TS dispatch handler reproduces the same single-entry
 * context, comparing the structural subset TS emits plus the tools list.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const CASES = [
	{
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'list',
		lang: 'lg-spa',
	},
	{
		model: 'component_input_text',
		tipo: 'numisdata16',
		section_tipo: 'numisdata6',
		mode: 'edit',
		lang: 'lg-spa',
	},
];

/**
 * Availability-ledgered tools the TS resolver omits on purpose (their
 * is_available needs a not-yet-ported subsystem — tool_diffusion → the
 * diffusion section-map). Excluded from BOTH sides so the comparison targets
 * what the element-context wiring actually covers.
 */
const LEDGERED_TOOLS = new Set<string>([]); // tool_diffusion now resolves via the diffusion section-map

/** Structural fields both sides must agree on (the subset TS emits). */
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
		view: entry.view ?? null,
		tools: ((entry.tools ?? []) as { name: string }[])
			.map((tool) => tool.name)
			.filter((name) => !LEDGERED_TOOLS.has(name))
			.sort(),
		buttons: ((entry.buttons ?? []) as { tipo?: string }[]).map((button) => button.tipo).sort(),
	};
}

describe.if(hasPhpCredentials())('get_element_context differential (Phase 6 gate)', () => {
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

		for (const source of CASES) {
			const rqo = { action: 'get_element_context', dd_api: 'dd_core_api', source };
			const { body } = await client.call(structuredClone(rqo));
			const phpEntry = (body.result as Record<string, unknown>[])[0] ?? {};

			const tsResult = await dispatchRqo(rqo as unknown as Rqo, {
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			});
			const tsEntry = (tsResult.body.result as Record<string, unknown>[])[0] ?? {};
			results.push({ model: source.model, php: phpEntry, ts: tsEntry });
		}
	});

	test('section + component element contexts match PHP (subset + tools + buttons)', () => {
		if (!hasPhpCredentials()) return;
		expect(results.length).toBe(CASES.length);
		for (const { php, ts } of results) {
			expect(subset(ts)).toEqual(subset(php));
		}
	});
});
