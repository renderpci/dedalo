/**
 * dd_ts_api read differential (plan A6): get_node_data / get_children_data vs live
 * PHP. Fixture: the tchi1 thesaurus. Node 602 is a descriptor with a link_children
 * element; 620 is its parent (a node with several children → get_children_data
 * mode A). Assertions diff the full node payload byte-for-byte.
 *
 * The orchestrator owns running/debugging the differential sweep; this file pins
 * the two highest-value shapes (single-node build + paginated children build).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const NODE = { section_tipo: 'tchi1', section_id: 602 };
const PARENT = { section_tipo: 'tchi1', section_id: 620, children_tipo: 'tchi40' };

let php: PhpApiClient;
let tsContext: Parameters<typeof dispatchRqo>[1];

async function callBoth(rqo: Record<string, unknown>) {
	const phpBody = (await php.call(structuredClone(rqo))).body;
	const tsBody = (await dispatchRqo(structuredClone(rqo) as never, tsContext)).body;
	return { phpBody, tsBody };
}

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as never;
}, 120000);

describe.if(hasPhpCredentials())('dd_ts_api.get_node_data differential', () => {
	test('descriptor node payload matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = {
			dd_api: 'dd_ts_api',
			action: 'get_node_data',
			prevent_lock: true,
			source: NODE,
			options: {},
		};
		const { phpBody, tsBody } = await callBoth(rqo);
		expect(tsBody.result).toEqual(phpBody.result);
		expect(tsBody.msg).toBe(phpBody.msg);
	});
});

describe.if(hasPhpCredentials())('dd_ts_api.get_children_data differential (mode A)', () => {
	test('paginated children build matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = {
			dd_api: 'dd_ts_api',
			action: 'get_children_data',
			prevent_lock: true,
			source: PARENT,
			options: {},
		};
		const { phpBody, tsBody } = await callBoth(rqo);
		const phpResult = phpBody.result as { ar_children_data?: unknown[] };
		const tsResult = tsBody.result as { ar_children_data?: unknown[] };
		expect(tsResult.ar_children_data).toEqual(phpResult.ar_children_data);
		expect(tsBody.msg).toBe(phpBody.msg);
	});
});
