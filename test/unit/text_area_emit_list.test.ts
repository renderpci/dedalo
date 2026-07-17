/**
 * component_text_area LIST-value gate (DEC-14b native twin of PHP
 * get_list_value :1895-1948): embedded Dédalo tags render to `<img>` HTML
 * (TR::add_tag_img_on_the_fly, default tag_url) BEFORE the 130-char HTML
 * truncation — the regression this pins: the TS emit hook shipped
 * truncate-only, so list mode showed the raw `[geo-n-1--data:[1]:data]` text
 * (numisdata5 → numisdata212). Expected bytes match the frozen oracle harvest
 * (fixtures/oracle_harvest/sqo_differential.json carries this exact geo img).
 */

import { describe, expect, test } from 'bun:test';
import { textAreaEmitHook } from '../../src/core/components/component_text_area/emit.ts';
import type { EmitHookContext } from '../../src/core/components/emit_hooks.ts';

/** The hook only reads ddoMode — a minimal context is honest here. */
const ctx = (ddoMode: string): EmitHookContext => ({ ddoMode }) as EmitHookContext;

const transform = (value: unknown[] | null, mode = 'list'): unknown[] | null =>
	// text_area's transformValue is declared and sync — the casts are honest
	textAreaEmitHook.transformValue?.(value, ctx(mode)) as unknown[] | null;

describe('text_area list emit — tag→img before truncation', () => {
	test('geo tag renders to the oracle-exact img (fixture bytes)', () => {
		const out = transform([{ value: '[geo-n-1--data:[1]:data] Puig de la Nau' }]);
		expect(out).toEqual([
			{
				value:
					'<img id="[geo-n-1-]" src="../component_text_area/tag/?id=[geo-n-1-]" class="geo" data-type="geo" data-tag_id="1" data-state="n" data-label="" data-data="[1]"> Puig de la Nau',
			},
		]);
	});

	test('conversion happens BEFORE truncation: img is uncounted markup and survives', () => {
		const longText = 'palabra '.repeat(40).trim(); // 319 plain chars > 130
		const out = transform([{ value: `[geo-n-1--data:[1]:data] ${longText}` }]) as {
			value: string;
		}[];
		const value = (out[0] as { value: string }).value;
		// The full img tag survives intact (truncate-first would have split the
		// raw bracket text mid-tag); only the plain text is cut.
		expect(value.startsWith('<img id="[geo-n-1-]" src="../component_text_area/tag/?id=')).toBe(
			true,
		);
		expect(value.endsWith('...')).toBe(true);
		expect(value.replace(/<.*?>/g, '').length).toBeLessThanOrEqual(130);
	});

	test('tag-free values still truncate to 130 plain chars', () => {
		const out = transform([{ value: 'ab '.repeat(100) }]) as { value: string }[];
		const value = (out[0] as { value: string }).value;
		expect(value.endsWith('...')).toBe(true);
		expect(value.replace(/<.*?>/g, '').length).toBeLessThanOrEqual(130);
	});

	test('non-list mode and non-string/empty values pass through unchanged', () => {
		const items = [{ value: '[geo-n-1--data:[1]:data]' }];
		expect(transform(items, 'edit')).toBe(items);
		const mixed = [null, 7, { value: '' }, { other: 1 }];
		expect(transform(mixed)).toEqual(mixed);
	});
});
