/**
 * ERROR REGISTRY — totality gate (engineering/ERRORS_SPEC.md §1-2).
 *
 * The registry is a data table; this gate proves the table is closed and
 * self-consistent: grammar, labels, placeholders ≡ details_keys, status ↔
 * category, external retryable agreement with the component_external state
 * map, every former MCP HINT mapped, LEGACY_TOKEN_MAP total, label reuse
 * coherent — and that the checker itself fails a synthetic bad spec.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HINTS } from '../../src/ai/mcp/envelope.ts';
import {
	EXTERNAL_STATE_LABEL_KEY,
	EXTERNAL_STATE_RETRYABLE,
	stateForKind,
} from '../../src/core/components/component_external/value.ts';
import {
	CATEGORY_STATUS,
	defaultLabelKey,
	ERROR_CODE_PATTERN,
	ERROR_CODES,
	ERROR_REGISTRY,
	type ErrorCode,
	type ErrorSpec,
	EXTERNAL_ERROR_KINDS,
	isErrorCode,
	LEGACY_TOKEN_MAP,
	MCP_HINT_CODES,
	STATUS_EXEMPTIONS,
} from '../../src/core/errors/registry.ts';
import type { ExternalErrorKind } from '../../src/external/errors.ts';

const MASTER: Record<string, string> = JSON.parse(
	readFileSync(resolve(import.meta.dir, '../../src/core/labels/master.json'), 'utf8'),
);

/** The table viewed as a plain string-keyed record (loops over arbitrary strings below). */
const TABLE: Record<string, ErrorSpec> = ERROR_REGISTRY;

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;
function placeholders(text: string): string[] {
	return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string).sort();
}

/**
 * The checker, as a function over an arbitrary (code, spec) pair so the
 * anti-vacuity probe below can feed it a synthetic offender.
 */
function specViolations(code: string, spec: ErrorSpec, master: Record<string, string>): string[] {
	const out: string[] = [];
	if (!ERROR_CODE_PATTERN.test(code)) out.push(`grammar: ${code}`);
	if (!(spec.label_key in master)) out.push(`label missing: ${spec.label_key}`);
	const expected = CATEGORY_STATUS[spec.category];
	if (spec.status !== expected && !STATUS_EXEMPTIONS.includes(code)) {
		out.push(`status ${spec.status} ≠ ${expected} for category ${spec.category}: ${code}`);
	}
	if (spec.message.trim() === '') out.push(`empty message: ${code}`);
	const keys = [...(spec.details_keys ?? [])].sort();
	const labelParams = placeholders(master[spec.label_key] ?? '');
	if (JSON.stringify(keys) !== JSON.stringify(labelParams)) {
		out.push(
			`placeholders ${JSON.stringify(labelParams)} ≠ details_keys ${JSON.stringify(keys)}: ${code}`,
		);
	}
	if (spec.label_key !== defaultLabelKey(code) && spec.label_key.startsWith('error_')) {
		out.push(`label_key deviates from convention without reusing a pre-existing key: ${code}`);
	}
	return out;
}

describe('error registry — totality', () => {
	test('anti-vacuity floor: the table is populous', () => {
		expect(ERROR_CODES.length).toBeGreaterThan(80);
	});

	test('every code passes the checker (grammar, label, status↔category, placeholders ≡ details_keys)', () => {
		const violations = ERROR_CODES.flatMap((code) =>
			specViolations(code, TABLE[code] as ErrorSpec, MASTER),
		);
		expect(violations).toEqual([]);
	});

	test('anti-vacuity: a synthetic bad spec fails the checker on every axis', () => {
		const bad: ErrorSpec = {
			category: 'caller',
			status: 500,
			label_key: 'error_nope_missing',
			message: '',
			severity: 'warn',
			disclosure: 'operator',
			retryable: false,
			details_keys: ['x'],
		};
		const violations = specViolations('BadCode', bad, MASTER);
		expect(violations.some((v) => v.startsWith('grammar'))).toBe(true);
		expect(violations.some((v) => v.startsWith('label missing'))).toBe(true);
		expect(violations.some((v) => v.startsWith('status'))).toBe(true);
		expect(violations.some((v) => v.startsWith('empty message'))).toBe(true);
		expect(violations.some((v) => v.startsWith('placeholders'))).toBe(true);
		// A label with a placeholder the spec does not declare is also caught.
		const master = { ...MASTER, error_probe_x: 'Hello {who}' };
		const spec: ErrorSpec = { ...bad, status: 400, message: 'm', label_key: 'error_probe_x' };
		expect(specViolations('probe.x', spec, master).some((v) => v.startsWith('placeholders'))).toBe(
			true,
		);
	});

	test('STATUS_EXEMPTIONS entries are registered codes (and empty today)', () => {
		expect(STATUS_EXEMPTIONS.filter((code) => !isErrorCode(code))).toEqual([]);
		expect(STATUS_EXEMPTIONS).toEqual([]);
	});

	test('the eight categories map to the eight statuses', () => {
		expect(CATEGORY_STATUS).toEqual({
			caller: 400,
			auth: 401,
			permission: 403,
			not_found: 404,
			conflict: 409,
			limit: 429,
			unavailable: 503,
			internal: 500,
		});
	});

	test('label reuse is coherent: a shared label key is a reused pre-existing key, and shared codes agree on category', () => {
		const byLabel = new Map<string, string[]>();
		for (const code of ERROR_CODES) {
			const key = (TABLE[code] as ErrorSpec).label_key;
			byLabel.set(key, [...(byLabel.get(key) ?? []), code]);
		}
		for (const [key, codes] of byLabel) {
			if (codes.length < 2) continue;
			expect(
				key.startsWith('error_'),
				`default-convention key ${key} shared by ${codes.join(',')}`,
			).toBe(false);
			const categories = new Set(codes.map((c) => (TABLE[c] as ErrorSpec).category));
			expect(categories.size, `${key}: ${codes.join(',')} disagree on category`).toBe(1);
		}
	});
});

describe('error registry — vocabulary fold-ins', () => {
	test('external.<kind> is total over ExternalErrorKind and agrees with the value.ts state map', () => {
		const kinds: readonly ExternalErrorKind[] = EXTERNAL_ERROR_KINDS;
		expect(kinds.length).toBe(11);
		for (const kind of kinds) {
			const code = `external.${kind}`;
			expect(isErrorCode(code), code).toBe(true);
			const spec = TABLE[code] as ErrorSpec;
			const state = stateForKind(kind);
			expect(spec.retryable, `${code} retryable`).toBe(EXTERNAL_STATE_RETRYABLE[state]);
			expect(spec.label_key, `${code} label`).toBe(EXTERNAL_STATE_LABEL_KEY[state] as string);
		}
	});

	test('every former MCP HINTS key is mapped and its code carries a hint', () => {
		for (const key of Object.keys(HINTS)) {
			const code = MCP_HINT_CODES[key];
			expect(code, `HINTS.${key} unmapped`).toBeDefined();
			expect((TABLE[code as string] as ErrorSpec).hint, `${code} hint`).toBeDefined();
			expect(LEGACY_TOKEN_MAP[key], `LEGACY_TOKEN_MAP.${key}`).toBe(code as ErrorCode);
		}
		expect(Object.keys(MCP_HINT_CODES).sort()).toEqual(Object.keys(HINTS).sort());
	});

	test('LEGACY_TOKEN_MAP values are all registered codes', () => {
		const bad = Object.entries(LEGACY_TOKEN_MAP).filter(([, code]) => !isErrorCode(code));
		expect(bad).toEqual([]);
		expect(Object.keys(LEGACY_TOKEN_MAP).length).toBeGreaterThan(60);
	});

	test('the identify decline codes and section_id refusals are registered', () => {
		for (const token of [
			'missing_seed',
			'forbidden',
			'invalid_profile',
			'no_profile',
			'rag_disabled',
			'media_disabled',
			'missing_image',
			'image_too_large',
			'invalid_image',
			'egress_forbidden',
			'provider_unavailable',
			'embed_failed',
			'empty_index',
			'invalid_source',
			'missing_section',
			'no_type_section',
			'no_link_component',
		]) {
			expect(LEGACY_TOKEN_MAP[token], token).toBeDefined();
		}
		for (const code of [
			'section_id.not_an_address',
			'section_id.numeric_shaped',
			'section_id.unusable_type',
		]) {
			expect(isErrorCode(code), code).toBe(true);
			expect((TABLE[code] as ErrorSpec).category).toBe('caller');
		}
	});

	test('the parity-table codes exist and carry a reason (never thrown by the engine)', () => {
		for (const code of ['php_fault.not_reproduced', 'envelope.not_an_envelope'] as const) {
			expect(ERROR_REGISTRY[code].reason).toBeDefined();
		}
		expect(ERROR_REGISTRY['record.delete_children_refused'].details_keys).toEqual(['not_deleted']);
	});
});
