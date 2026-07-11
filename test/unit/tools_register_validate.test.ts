/**
 * Registration validation: format detection, the full tools/ corpus
 * validates (the TS analogue of PHP's v6-corpus guard), and the authoring→v7
 * conversion produces a record that passes validateRegister.
 *
 * Corpus census 35 = the 34 PHP-seeded column-keyed registers + the TS-only
 * tool_error_report (WC-019), which is AUTHORED in the authoring format and
 * must convert+validate instead (reconciled 2026-07-11 — the tool landed
 * 2026-07-10 without bumping this pin).
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	convertAuthoringToV7,
	detectFormat,
	validateRegister,
} from '../../src/core/tools/register.ts';

const TOOLS_ROOT = resolve(import.meta.dir, '../../tools');

describe('detectFormat', () => {
	test('classifies the register.json shapes', () => {
		expect(detectFormat({ components: [] })).toBe('v6');
		expect(detectFormat({ name: 'tool_x', version: '1.0.0' })).toBe('authoring');
		expect(detectFormat({ string: {}, relation: {}, data: {} })).toBe('column');
		expect(detectFormat(null)).toBe('invalid');
		expect(detectFormat(42)).toBe('invalid');
	});
});

describe('seeded register.json corpus', () => {
	const toolDirs = readdirSync(TOOLS_ROOT).filter((name) => /^tool_[a-z0-9_]+$/.test(name));

	/** TS-authored tools (never PHP-seeded): register.json in the authoring
	 * format, converted at registration (WC-019 precedent). */
	const TS_AUTHORED = new Set(['tool_error_report']);

	test('every tool has a register.json and there are 35 (34 seeded + 1 TS-authored)', () => {
		expect(toolDirs.length).toBe(35);
	});

	for (const name of toolDirs) {
		test(`${name}: validates as a ${TS_AUTHORED.has(name) ? 'convertible authoring' : 'column-keyed'} record`, async () => {
			const raw = await Bun.file(resolve(TOOLS_ROOT, name, 'register.json')).json();
			if (TS_AUTHORED.has(name)) {
				expect(detectFormat(raw)).toBe('authoring');
				const converted = await convertAuthoringToV7(raw);
				// registration fills the empty `data` column post-conversion
				// (register.ts registration path) — mirror it before validating.
				if (converted.data === undefined) converted.data = {};
				expect(validateRegister(converted, name)).toEqual([]);
				return;
			}
			expect(detectFormat(raw)).toBe('column');
			const errors = validateRegister(raw, name);
			expect(errors).toEqual([]);
		});
	}
});

describe('authoring → v7 conversion', () => {
	test('a minimal authoring file converts to a valid record', async () => {
		const authoring = {
			name: 'tool_export',
			version: '1.0.0',
			label: { 'lg-eng': 'Export' },
			properties: { open_as: 'modal' },
		};
		const record = await convertAuthoringToV7(authoring);
		// name === basename must hold for the record to validate.
		expect(validateRegister(record, 'tool_export')).toEqual([]);
		// active defaults to true → dd1354 locator targets dd64/1.
		expect(record.relation?.dd1354?.[0]?.section_id).toBe('1');
	});

	test('a bad tool name is rejected by the authoring schema', async () => {
		await expect(
			convertAuthoringToV7({ name: 'BadName', version: '1.0.0', label: { 'lg-eng': 'x' } }),
		).rejects.toThrow();
	});

	test('validateRegister rejects a name that mismatches the directory', () => {
		const record = {
			data: {},
			string: {
				dd1326: [{ lang: 'lg-nolan', value: 'tool_a' }],
				dd1327: [{ value: '1.0.0' }],
				dd799: [{ value: 'A' }],
			},
			relation: {},
			misc: {},
		};
		const errors = validateRegister(record, 'tool_b');
		expect(errors.some((e) => e.includes('does not match its directory'))).toBe(true);
	});
});
