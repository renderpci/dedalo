/**
 * Phase 7-adjacent gate: the `start` action — the client's first boot call.
 * PHP returns environment + a structure-context for the default section (list
 * mode, no data). We diff the default-section context's structural subset +
 * its request_config against live PHP.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

describe.if(hasPhpCredentials())('start action differential', () => {
	let phpSection: Record<string, unknown>;
	let tsSection: Record<string, unknown>;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call({
			action: 'start',
			prevent_lock: true,
			options: { search_obj: {}, menu: false },
		});
		phpSection = (body.result as { context: Record<string, unknown>[] }).context[0] as Record<
			string,
			unknown
		>;

		const adminContext: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: -1,
				username: 'root',
				isGlobalAdmin: true,
				csrfToken: 'x',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'x',
			principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
		};
		const outcome = await dispatchRqo(
			{ action: 'start', dd_api: 'dd_core_api', options: { search_obj: {}, menu: false } } as Rqo,
			adminContext,
		);
		tsSection = (outcome.body.result as { context: Record<string, unknown>[] })
			.context[0] as Record<string, unknown>;
	});

	test('default-section context matches (tipo/model/label/matrix_table/config)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsSection.tipo).toBe(phpSection.tipo);
		expect(tsSection.model).toBe(phpSection.model);
		expect(tsSection.label).toBe(phpSection.label);
		expect(tsSection.matrix_table).toBe(phpSection.matrix_table);
		expect((tsSection.config as { relation_list_tipo: string }).relation_list_tipo).toBe(
			(phpSection.config as { relation_list_tipo: string }).relation_list_tipo,
		);
	});

	test('start builds context WITHOUT the top-level request_config stamp (PHP parity)', () => {
		if (!hasPhpCredentials()) return;
		// PHP start uses add_request_config=false — no top-level request_config
		// on the entry (the config is only echoed into properties.source, which
		// PHP DERIVES from the section_list config; that properties.source
		// injection of columns_map/request_config is ledgered uncovered scope).
		expect(phpSection.request_config).toBeUndefined();
		expect(tsSection.request_config).toBeUndefined();
	});
});
