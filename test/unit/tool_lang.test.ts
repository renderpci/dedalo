/**
 * R3 gate: tool_lang / tool_lang_multi automatic_translation. The read→translate
 * item logic is verified with a STUB provider (the plan's external-engine gate);
 * quota/failure short-circuits are checked; both modules load and share the core.
 * The real Babel HTTP call + the DB write drive are ledgered (external engine).
 */

import { describe, expect, test } from 'bun:test';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import {
	type TranslationProvider,
	babelDirection,
	resolveTranslationProvider,
	resolveTranslatorConfig,
	translateItems,
} from '../../src/core/tools/translation.ts';
import { mustGet } from '../helpers/assert.ts';

const cfg = { uri: 'https://tr.example.org', key: 'k', sourceLang: 'lg-eng', targetLang: 'lg-spa' };

/** A stub that upper-cases + tags each text so we can assert per-item mapping. */
const upperStub: TranslationProvider = async (req) => ({
	result: `[${req.text.toUpperCase()}]`,
	msg: 'ok',
});

describe('translateItems (stub provider)', () => {
	test('maps each source item value → target-lang item, preserving order', async () => {
		const out = await translateItems(
			[
				{ value: 'cat', lang: 'lg-eng' },
				{ value: 'dog', lang: 'lg-eng' },
			],
			upperStub,
			cfg,
		);
		expect(out.error).toBeNull();
		expect(out.items).toEqual([
			{ value: '[CAT]', lang: 'lg-spa' },
			{ value: '[DOG]', lang: 'lg-spa' },
		]);
	});

	test('provider failure short-circuits with the error', async () => {
		const failStub: TranslationProvider = async () => ({ result: false, msg: 'boom' });
		const out = await translateItems([{ value: 'x' }], failStub, cfg);
		expect(out).toEqual({ items: [], error: 'boom' });
	});

	test('quota-exceeded result is treated as an error (never persisted)', async () => {
		const quotaStub: TranslationProvider = async () => ({
			result: 'Sorry. Quota exceeded today',
			msg: 'ok',
		});
		const out = await translateItems([{ value: 'x' }], quotaStub, cfg);
		expect(out.error).toBe('Sorry. Quota exceeded');
	});
});

describe('translation helpers', () => {
	test('babelDirection strips lg- and joins', () => {
		expect(babelDirection('lg-spa', 'lg-eng')).toBe('spa-eng');
	});
	test('resolveTranslationProvider: babel default, browser/google rejected', () => {
		expect(resolveTranslationProvider('babel').provider).not.toBeNull();
		expect(resolveTranslationProvider('browser_transformer').provider).toBeNull();
		expect(resolveTranslationProvider('google_translation').error).toContain('not implemented');
	});
	test('resolveTranslatorConfig finds the engine entry by name', () => {
		const toolConfig = {
			config: { translator_config: { value: [{ name: 'babel', uri: 'u', key: 'k' }] } },
		};
		expect(resolveTranslatorConfig(toolConfig, 'babel')).toEqual({ uri: 'u', key: 'k' });
		expect(resolveTranslatorConfig(toolConfig, 'missing')).toBeNull();
		expect(resolveTranslatorConfig({}, 'babel')).toBeNull();
	});
});

describe('tool_lang / tool_lang_multi modules', () => {
	test('both load with the automatic_translation action', async () => {
		for (const name of ['tool_lang', 'tool_lang_multi']) {
			const loaded = await getLoadedTool(name);
			expect(loaded).not.toBeNull();
			expect(Object.keys(loaded!.module.apiActions)).toEqual(['automatic_translation']);
			expect(
				mustGet(loaded!.module.apiActions.automatic_translation, 'automatic_translation')
					.permission,
			).toBeNull();
		}
	});
});
