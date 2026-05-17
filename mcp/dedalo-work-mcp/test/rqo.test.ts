import { describe, test, expect } from 'bun:test';
import { rqo } from '../src/tools/_shared/rqo.js';

describe('rqo()', () => {
	test('minimal action with default dd_api', () => {
		const r = rqo({ action: 'get_environment' });
		expect(r).toEqual({ action: 'get_environment', dd_api: 'dd_core_api', prevent_lock: true });
	});

	test('omits empty source / options', () => {
		const r = rqo({ action: 'count', source: {}, options: {} });
		expect(r.source).toBeUndefined();
		expect(r.options).toBeUndefined();
	});

	test('keeps non-empty source and options', () => {
		const r = rqo({ action: 'save', source: { tipo: 'oh1' }, options: { value: 'hello' } });
		expect(r.source).toEqual({ tipo: 'oh1' });
		expect(r.options).toEqual({ value: 'hello' });
	});

	test('writes set prevent_lock=false explicitly', () => {
		const r = rqo({ action: 'save', source: { tipo: 'oh1' }, options: { value: 1 }, prevent_lock: false });
		expect(r.prevent_lock).toBe(false);
	});

	test('accepts loose source extras (process_id)', () => {
		const r = rqo({ action: 'get_process_status', dd_api: 'dd_utils_api', source: { process_id: 'p-1' } });
		expect((r.source as Record<string, unknown>).process_id).toBe('p-1');
	});
});
