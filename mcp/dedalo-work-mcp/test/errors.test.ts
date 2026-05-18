import { describe, test, expect } from 'bun:test';
import { DedaloError } from '@dedalo/mcp-common';
import { wrapError } from '../src/tools/_shared/errors.js';

describe('wrapError', () => {
	test('maps permissions_denied with profile hint', () => {
		const e = new DedaloError('No permission', 'permissions_denied', ['permissions_denied'], {});
		const w = wrapError(e);
		expect(w.ok).toBe(false);
		expect(w.error.code).toBe('permissions_denied');
		expect(w.error.hint).toMatch(/profile/i);
	});

	test('maps not_logged with auto-recover hint', () => {
		const e = new DedaloError('Session expired', 'not_logged');
		const w = wrapError(e);
		expect(w.error.hint).toMatch(/expired|recover/i);
	});

	test('plain Error becomes unknown code without hint', () => {
		const w = wrapError(new Error('boom'));
		expect(w.error.code).toBe('unknown');
		expect(w.error.message).toBe('boom');
		expect(w.error.hint).toBeUndefined();
	});

	test('non-Error value stringified', () => {
		const w = wrapError('weird');
		expect(w.error.code).toBe('unknown');
		expect(w.error.message).toBe('weird');
	});
});
