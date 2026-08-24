/**
 * THE /health PAYLOAD — the one thing a mid-restart client can still read.
 *
 * `update_code`'s panel loses its job-frame stream at the swap by design (the
 * process dies), so /health is what decides "updated" vs "rolled back". Until
 * 2026-08-24 that verdict was `version` — which a dev-channel install leaves
 * unchanged on BOTH sides of the swap, making every same-version update report
 * success, rollback included. The installed archive digest is the token that
 * actually moves.
 */

import { describe, expect, test } from 'bun:test';
import { buildHealthPayload } from '../../src/core/api/health_payload.ts';

describe('buildHealthPayload', () => {
	const BASE = { entity: 'e', requestId: 'r', installDigest: 'a'.repeat(64) };

	test('publishes the installed archive digest, the token that survives a same-version swap', () => {
		expect(buildHealthPayload({ ...BASE, dbOk: true }).install_digest).toBe('a'.repeat(64));
	});

	test('a dev CHECKOUT has no digest and says so with null, never by omitting the key', () => {
		const payload = buildHealthPayload({ ...BASE, dbOk: true, installDigest: null });
		expect(payload.install_digest).toBeNull();
		expect('install_digest' in payload).toBe(true);
	});

	test('the pre-existing shape is untouched: result/entity/version/db/request_id', () => {
		const payload = buildHealthPayload({ ...BASE, dbOk: true, version: '7.0.1' });
		expect(payload).toMatchObject({
			result: 'ok',
			entity: 'e',
			version: '7.0.1',
			db: 'ok',
			request_id: 'r',
		});
	});

	test('a down database still answers, with db:down and result:error', () => {
		const payload = buildHealthPayload({ ...BASE, dbOk: false });
		expect(payload.result).toBe('error');
		expect(payload.db).toBe('down');
	});

	test('the test-database fingerprint is included only when one is given', () => {
		expect('test_database' in buildHealthPayload({ ...BASE, dbOk: true })).toBe(false);
		expect(buildHealthPayload({ ...BASE, dbOk: true, testDatabase: 'h' }).test_database).toBe('h');
	});
});
