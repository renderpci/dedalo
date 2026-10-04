/**
 * PASSWORD POLICY — one evaluator, every door.
 *
 * The rules live in a pure client module
 * (client/dedalo/core/component_password/js/password_policy.js) that the browser
 * checklist and the server refusal both run. This gate pins:
 *   1. the rules themselves (what passes, what fails, which rule is reported);
 *   2. that every rule's label exists in master.json with EXACTLY the
 *      placeholders its params fill (a rule shown as a raw key or with a
 *      literal `${min}` is the opacity this component was rebuilt to remove);
 *   3. that the three server doors (write engine, recovery, installer) and the
 *      client component all reach the SAME module — no second policy can grow.
 * The write-engine behaviour (refused, nothing stored) is asserted against a
 * scratch record in password_hash_on_save.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	check_password,
	PASSWORD_POLICY,
	PASSWORD_RULES,
} from '../../client/dedalo/core/component_password/js/password_policy.js';
import { DedaloError, toErrorBody } from '../../src/core/errors/index.ts';
import {
	assertPasswordPolicy,
	passwordPolicyFailure,
} from '../../src/core/security/password_policy.ts';

const ROOT = resolve(import.meta.dir, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('the rules', () => {
	test('a conforming password passes every rule', () => {
		const verdict = check_password('Heritage-Vault-7');
		expect(verdict.valid).toBe(true);
		expect(verdict.failed).toBe(null);
		expect(verdict.rules.every((r: { ok: boolean }) => r.ok)).toBe(true);
	});

	test.each([
		['Ab1', 'length'],
		['A'.repeat(PASSWORD_POLICY.max_length) + 'b1', 'length'],
		['NOLOWER99', 'lower'],
		['noupper99', 'upper'],
		['NoDigitsHere', 'digit'],
		['Tom&Jerry-97', 'banned_chars'],
		['MyPassword97', 'banned_words'],
		['Contraseña-97', 'banned_words'],
		['Xabcd-Tree9', 'sequence'],
		['Tree-1234-X', 'sequence'],
		['Tree-ABCD-x9', 'sequence'],
	])('%p breaks %p', (pw, rule) => {
		const verdict = check_password(pw);
		expect(verdict.valid).toBe(false);
		expect(verdict.failed).toBe(rule);
		expect(passwordPolicyFailure(pw)).toBe(rule);
	});

	test('length counts code points and classes are Unicode-aware', () => {
		// 8 code points (one astral = 2 UTF-16 units): meets the minimum…
		expect(check_password('Ñandú7𝄞x').failed).toBe(null);
		// …7 code points but 8 UTF-16 units: does NOT.
		expect('Ñand7𝄞x'.length).toBe(8);
		expect(check_password('Ñand7𝄞x').failed).toBe('length');
		// Uppercase/lowercase outside ASCII count.
		expect(check_password('ÁRBOL-ñ-79').failed).toBe(null);
	});

	test('empty is not judged as a password (the caller decides what empty means)', () => {
		const verdict = check_password('');
		expect(verdict.rules.map((r: { id: string }) => r.id)).toEqual(
			PASSWORD_RULES.map((r: { id: string }) => r.id),
		);
	});

	test('the refusal is a typed validation.password_policy carrying the rule', () => {
		let thrown: unknown = null;
		try {
			assertPasswordPolicy('short');
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(DedaloError);
		const body = toErrorBody(thrown as DedaloError);
		expect(body.code).toBe('validation.password_policy');
		expect(body.details).toEqual({ rule: 'length' });
		expect(() => assertPasswordPolicy('Heritage-Vault-7')).not.toThrow();
	});
});

describe('every rule speaks', () => {
	const master = JSON.parse(read('src/core/labels/master.json')) as Record<string, string>;

	test.each(PASSWORD_RULES.map((r: { id: string }) => [r.id]))('rule %p has its label', (id) => {
		const rule = PASSWORD_RULES.find((r: { id: string }) => r.id === id) as {
			label: string;
			params?: Record<string, unknown>;
		};
		const template = master[rule.label];
		expect(typeof template).toBe('string');
		const placeholders = [...(template as string).matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).sort();
		expect(placeholders).toEqual(Object.keys(rule.params ?? {}).sort());
	});
});

describe('one policy, every door', () => {
	test('the server module re-exports the client evaluator (no second implementation)', () => {
		const src = read('src/core/security/password_policy.ts');
		expect(src).toContain(
			"from '../../../client/dedalo/core/component_password/js/password_policy.js'",
		);
	});

	test.each([
		['src/core/security/password_hash.ts', 'assertPasswordPolicy'],
		['src/core/security/password_reset.ts', 'passwordPolicyFailure'],
		['src/core/install/root_pw.ts', 'passwordPolicyFailure'],
		['client/dedalo/core/component_password/js/component_password.js', 'check_password'],
		['client/dedalo/core/component_password/js/view_default_edit_password.js', 'check_password'],
	])('%p enforces through the shared policy', (file, symbol) => {
		const src = read(file);
		expect(src).toContain(symbol);
		// A local length literal is exactly how the three doors drifted apart (6 vs 8).
		expect(src).not.toMatch(
			/\.length\s*<\s*[0-9]+\s*\)\s*\{\s*\n\s*(refuseInstall|throw new DedaloError\('password)/,
		);
	});
});

describe('the suite credential obeys the policy too', () => {
	test('SUITE_LOGIN_PASSWORD conforms, and the runner copy is kept in step', async () => {
		const { SUITE_LOGIN_PASSWORD } = await import('../../src/core/test_data/suite_login.ts');
		expect(passwordPolicyFailure(SUITE_LOGIN_PASSWORD)).toBe(null);
		// scripts/client_test_runner.ts keeps its own copy (it must not import src/
		// before the suite repoint); a drift would log the runner in with the wrong one.
		const runner = read('scripts/client_test_runner.ts');
		expect(runner).toContain(`const SUITE_LOGIN_PASSWORD = '${SUITE_LOGIN_PASSWORD}';`);
	});
});
