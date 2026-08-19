/**
 * dd_ts_api read differential (plan A6): get_node_data / get_children_data vs live
 * PHP. Fixture: the tchi1 thesaurus. Node 602 is a descriptor with a link_children
 * element; 620 is its parent (a node with several children → get_children_data
 * mode A). Assertions diff the full node payload byte-for-byte.
 *
 * The orchestrator owns running/debugging the differential sweep; this file pins
 * the two highest-value shapes (single-node build + paginated children build).
 */
// BINDS INSTALL TLDs: tchi — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { adoptErrorEnvelopeV2, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

const NODE = { section_tipo: 'tchi1', section_id: 602 };
const PARENT = { section_tipo: 'tchi1', section_id: 620, children_tipo: 'tchi40' };

let php: PhpApiClient;
let tsContext: Parameters<typeof dispatchRqo>[1];

async function callBoth(rqo: Record<string, unknown>) {
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	const phpBody = normalizeSectionIdTypes((await php.call(structuredClone(rqo))).body);
	const tsBody = normalizeSectionIdTypes(
		(await dispatchRqo(structuredClone(rqo) as never, tsContext)).body as Record<string, unknown>,
	);
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
		// The frozen PHP body speaks the dd_manager envelope; project it onto v2
		// and compare the PAYLOADS. `msg` is not a wire fact on TS (envelope v2:
		// success carries no prose), so the old msg byte-equality is restated as
		// "both engines answered a SUCCESS".
		const adopted = adoptErrorEnvelopeV2(phpBody);
		expect(adopted.matched).toBe(true);
		expect(adopted.kind).toBe('ok');
		expect(tsBody.ok).toBe(true);
		expect(tsBody.data).toEqual((adopted.projection as { data: unknown }).data);
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
		const adopted = adoptErrorEnvelopeV2(phpBody);
		expect(adopted.matched).toBe(true);
		expect(adopted.kind).toBe('ok');
		expect(tsBody.ok).toBe(true);
		const phpResult = (adopted.projection as { data: { ar_children_data?: unknown[] } }).data;
		const tsResult = tsBody.data as { ar_children_data?: unknown[] };
		expect(tsResult.ar_children_data).toEqual(phpResult.ar_children_data);
	});
});
