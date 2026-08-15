/**
 * ENVELOPE v2 — every registered code round-trips converter → schema, and
 * the wire invariants hold: ok:false ⇒ status ∉ 2xx; internal never leaks
 * the wrapped cause; request_id present; the compat block is byte-exact.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { resetProcessPoisonForTests } from '../../src/core/api/process_health.ts';
import {
	ERROR_ENVELOPE_COMPAT,
	ok,
	toErrorEnvelope,
	toStreamFrame,
	toStructuredErr,
} from '../../src/core/errors/convert.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { ERROR_CODES, ERROR_REGISTRY } from '../../src/core/errors/registry.ts';
import {
	apiEnvelopeSchema,
	errEnvelopeSchema,
	okEnvelopeSchema,
} from '../../src/core/errors/schema.ts';

const CTX = { requestId: 'req-envelope-test' } as const;

afterEach(() => {
	resetProcessPoisonForTests();
});

// Pin the debug key OFF for the whole file: process.env wins over ../private/.env
// (a dev checkout may carry DEDALO_DEBUG_API_ERRORS=true), and this gate asserts
// the production wire shape. The debug path is exercised in error_converter_native.
const previousDebug = process.env.DEDALO_DEBUG_API_ERRORS;
beforeAll(() => {
	process.env.DEDALO_DEBUG_API_ERRORS = 'false';
});
afterAll(() => {
	if (previousDebug === undefined) {
		delete process.env.DEDALO_DEBUG_API_ERRORS;
	} else process.env.DEDALO_DEBUG_API_ERRORS = previousDebug;
});

describe('envelope v2 — round trip over the whole registry', () => {
	test('every code: converter body parses as errEnvelopeSchema and the discriminated union', () => {
		expect(ERROR_CODES.length).toBeGreaterThan(80);
		for (const code of ERROR_CODES) {
			const { status, body } = toErrorEnvelope(new DedaloError(code), CTX);
			const parsed = errEnvelopeSchema.safeParse(body);
			expect(parsed.success, `${code}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
			expect(apiEnvelopeSchema.safeParse(body).success, code).toBe(true);
			expect(status, `${code} status`).toBe(ERROR_REGISTRY[code].status);
			expect(status < 200 || status >= 300, `${code}: ok:false must be non-2xx`).toBe(true);
			expect(body.request_id).toBe(CTX.requestId);
			expect(body.error.code).toBe(code);
			expect(body.error.category).toBe(ERROR_REGISTRY[code].category);
			expect(body.error.label_key).toBe(ERROR_REGISTRY[code].label_key);
			expect(body.error.message).toBe(ERROR_REGISTRY[code].message);
			expect(body.error.retryable).toBe(ERROR_REGISTRY[code].retryable);
			expect('debug' in body.error).toBe(false);
		}
	});

	test('the compat block is exact: result:false, msg = message, errors = [code]', () => {
		const { body } = toErrorEnvelope(new DedaloError('perm.denied'), CTX);
		expect(body.result).toBe(false);
		expect(body.msg).toBe('Insufficient permissions');
		expect(body.errors).toEqual(['perm.denied']);
		expect(ERROR_ENVELOPE_COMPAT.failure(body.error)).toEqual({
			result: false,
			msg: 'Insufficient permissions',
			errors: ['perm.denied'],
		});
	});

	test('the schema rejects an unregistered code', () => {
		const { body } = toErrorEnvelope(new DedaloError('perm.denied'), CTX);
		const forged = { ...body, error: { ...body.error, code: 'perm.made_up' } };
		expect(errEnvelopeSchema.safeParse(forged).success).toBe(false);
	});

	test('internal.unexpected never leaks the wrapped cause on the wire', () => {
		const secret = 'SELECT * FROM matrix WHERE /var/lib/secret';
		const { status, body } = toErrorEnvelope(new Error(secret), CTX);
		expect(status).toBe(500);
		expect(JSON.stringify(body)).not.toContain(secret);
		expect(body.error.code).toBe('internal.unexpected');
		expect(body.error.message).toBe('An unexpected error occurred');
		expect(body.msg).toBe('An unexpected error occurred');
	});

	test('ok(): ok:true + request_id + data, result mirrors data, notices optional', () => {
		const envelope = ok({ rows: [1] }, { requestId: 'r1' });
		expect(okEnvelopeSchema.safeParse(envelope).success).toBe(true);
		expect(envelope).toEqual({
			ok: true,
			request_id: 'r1',
			data: { rows: [1] },
			result: { rows: [1] },
		});
		const withNotices = ok(null, {
			requestId: 'r2',
			notices: [
				{ code: 'external.timeout', label_key: 'external_source_timeout', retryable: true },
			],
		});
		expect(apiEnvelopeSchema.safeParse(withNotices).success).toBe(true);
		expect(withNotices.notices?.length).toBe(1);
	});

	test('retryAfterMs surfaces on the envelope result for the chokepoint', () => {
		const result = toErrorEnvelope(new DedaloError('rate.limited', { retryAfterMs: 1500 }), CTX);
		expect(result.status).toBe(429);
		expect(result.retryAfterMs).toBe(1500);
		expect('retryAfterMs' in toErrorEnvelope(new DedaloError('rate.limited'), CTX)).toBe(false);
	});

	test('MCP structured error carries the registry hint; stream frame is a frame', () => {
		const structured = toStructuredErr(new DedaloError('request.invalid_tipo'));
		expect(structured.ok).toBe(false);
		expect(structured.error.code).toBe('request.invalid_tipo');
		expect(structured.error.hint).toContain('Resolve names to tipos');
		const frame = toStreamFrame(new DedaloError('auth.not_logged'));
		expect(frame.is_running).toBe(false);
		expect(frame.error.code).toBe('auth.not_logged');
		expect(frame.error.category).toBe('auth');
	});
});
