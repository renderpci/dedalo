/**
 * Phase 6 gate: dd_core_api::read_raw differential.
 *
 * read_raw returns the UNRESOLVED stored value(s) a SQO matches. We compare the
 * TS dispatch handler against live PHP for a component read (the raw multi-lang
 * value of numisdata16) and a section read (the matched rows' jsonb columns).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const COMPONENT_RQO = {
	action: 'read_raw',
	dd_api: 'dd_core_api',
	options: {
		section_tipo: 'numisdata6',
		tipo: 'numisdata16',
		model: 'component_input_text',
		type: 'component',
	},
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '1' }],
		limit: 1,
	},
};

const SECTION_RQO = {
	action: 'read_raw',
	dd_api: 'dd_core_api',
	options: { section_tipo: 'numisdata6', tipo: 'numisdata6', model: 'section', type: 'section' },
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '1' }],
		limit: 1,
	},
};

// target_section: harvest every stored locator pointing at rsc332 from the
// matched rows' relation columns (numisdata6/2 holds 22 numisdata163 links).
const TARGET_SECTION_RQO = {
	action: 'read_raw',
	dd_api: 'dd_core_api',
	options: {
		section_tipo: 'numisdata6',
		tipo: 'rsc332',
		model: 'section',
		type: 'target_section',
	},
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [
			{ section_tipo: 'numisdata6', section_id: '2' },
			{ section_tipo: 'numisdata6', section_id: '75' },
		],
		limit: 2,
		order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
	},
};

async function callBoth(rqo: Record<string, unknown>) {
	const client = new PhpApiClient();
	await client.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	const { body: phpBody } = await client.call(structuredClone(rqo));

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(rqo as unknown as Rqo, {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	});
	return { php: phpBody as Record<string, unknown>, ts: tsResult.body };
}

describe.if(hasPhpCredentials())('read_raw differential (Phase 6 gate)', () => {
	let component: { php: Record<string, unknown>; ts: Record<string, unknown> };
	let section: { php: Record<string, unknown>; ts: Record<string, unknown> };

	let targetSection: { php: Record<string, unknown>; ts: Record<string, unknown> };

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		component = await callBoth(COMPONENT_RQO);
		section = await callBoth(SECTION_RQO);
		targetSection = await callBoth(TARGET_SECTION_RQO);
	}, 60000);

	test('component read_raw returns the same raw value + table as PHP', () => {
		if (!hasPhpCredentials()) return;
		expect(component.ts.result).toEqual(component.php.result);
		expect(component.ts.table).toBe(component.php.table);
	});

	test('section read_raw returns the same matched-row columns as PHP', () => {
		if (!hasPhpCredentials()) return;
		// PHP fetch_all rows carry the jsonb columns; compare the columns TS emits
		// against PHP for the matched record (section_id + each jsonb column).
		const tsRow = (section.ts.result as Record<string, unknown>[])[0];
		const phpRow = (section.php.result as Record<string, unknown>[])[0];
		expect(tsRow).toBeDefined();
		expect(phpRow).toBeDefined();
		// Compare the jsonb component columns both sides agree on.
		for (const column of ['data', 'string', 'relation', 'date', 'number']) {
			expect(tsRow?.[column]).toEqual(phpRow?.[column] ?? null);
		}
		expect(String(tsRow?.section_id)).toBe(String(phpRow?.section_id));
	});

	test('target_section read_raw harvests the same locators as PHP', () => {
		if (!hasPhpCredentials()) return;
		const phpLocators = targetSection.php.result as Record<string, unknown>[];
		expect(phpLocators.length).toBeGreaterThan(0);
		expect(targetSection.ts.result).toEqual(phpLocators);
		expect(targetSection.ts.table).toBe(targetSection.php.table);
	});
});
