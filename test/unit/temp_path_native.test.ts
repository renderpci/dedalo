/**
 * The temp-sibling name and its recognizer are ONE contract: every name
 * tempPathFor produces must be recognized by isTempSibling (tool_export's
 * sweep removes crash leftovers by it), and a finished file must not be.
 */
import { describe, expect, test } from 'bun:test';
import { basename } from 'node:path';
import { isTempSibling, tempPathFor } from '../../src/core/files/temp_path.ts';

describe('temp_path', () => {
	test('every tempPathFor name is a temp sibling, in the same directory', () => {
		for (let i = 0; i < 2000; i++) {
			const temp = tempPathFor('/x/job/export.csv');
			expect(temp.startsWith('/x/job/export.csv')).toBe(true);
			expect(isTempSibling(basename(temp))).toBe(true);
			expect(isTempSibling(temp)).toBe(true);
		}
	});

	test('final names are not temp siblings', () => {
		for (const name of [
			'export.csv',
			'export_a.xlsx',
			'media.zip',
			'manifest.json',
			'grid.ndjson',
			'x.tmp',
		]) {
			expect(isTempSibling(name)).toBe(false);
		}
	});
});
