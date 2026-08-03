/**
 * R3 gate: tool_lang / tool_lang_multi automatic_translation. The read→translate
 * item logic is verified with a STUB provider (the plan's external-engine gate);
 * quota/failure short-circuits are checked; both modules load and share the core.
 * The real Babel HTTP call + the DB write drive are ledgered (external engine).
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realPermissions from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import {
	babelDirection,
	resolveTranslationProvider,
	resolveTranslatorConfig,
	runAutomaticTranslation,
	type TranslationProvider,
	translateItems,
} from '../../src/core/tools/translation.ts';
import { mustGet } from '../helpers/assert.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
const SCOPED: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

// mock.module is process-GLOBAL and mock.restore() does NOT revert it — snapshot
// the real exports at import time and re-install them (dedalo-ts-testing).
const REAL_PERMISSIONS = { ...realPermissions };
afterAll(() => {
	mock.module('../../src/core/security/permissions.ts', () => REAL_PERMISSIONS);
});

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

describe('runAutomaticTranslation — gates and loud failures', () => {
	const options = {
		component_tipo: 'numisdata16',
		section_tipo: 'test2',
		section_id: 905301,
		source_lang: 'lg-eng',
		target_lang: 'lg-spa',
	};

	test('missing required parameters are refused', async () => {
		for (const bad of [{ target_lang: '' }, { component_tipo: '' }, { section_tipo: '' }]) {
			const response = await runAutomaticTranslation(
				{ options: { ...options, ...bad }, userId: -1, principal: SUPERUSER },
				'tool_lang',
			);
			expect(response.result).toBe(false);
			expect(response.errors).toContain('invalid_request');
		}
	});

	test('an ungranted caller is refused outright', async () => {
		const response = await runAutomaticTranslation(
			{ options, userId: 999999, principal: NO_ACCESS },
			'tool_lang',
		);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('unauthorized');
	});

	test('the (section_tipo, component_tipo) WRITE pair is asserted, not just the section', async () => {
		// PHP asserts assert_tipo_permission(section_tipo, component_tipo, 2) AND
		// assert_record_in_user_scope; the port had only the record half, so a
		// caller with SECTION write but no grant on the COMPONENT slipped through.
		// The two are only distinguishable with a principal whose levels differ
		// per target, hence the mock (process-global — restored in afterEach).
		mock.module('../../src/core/security/permissions.ts', () => ({
			...REAL_PERMISSIONS,
			getPermissions: async (_p: unknown, sectionTipo: string, tipo: string) =>
				sectionTipo === tipo ? 2 : 0, // section: write. component: nothing.
		}));
		try {
			const response = await runAutomaticTranslation(
				{ options, userId: 16, principal: SCOPED },
				'tool_lang',
			);
			expect(response.result).toBe(false);
			expect(response.msg).toContain('insufficient permissions on the target component');
		} finally {
			mock.module('../../src/core/security/permissions.ts', () => REAL_PERMISSIONS);
		}
	});

	test('a client-side-only or unimplemented engine FAILS LOUDLY (never empty output)', async () => {
		for (const [translator, fragment] of [
			['browser_transformer', 'client-side only'],
			['google_translation', 'not implemented'],
		] as const) {
			const response = await runAutomaticTranslation(
				{ options: { ...options, translator }, userId: -1, principal: SUPERUSER },
				'tool_lang',
			);
			expect(response.result).toBe(false);
			expect(response.msg).toContain(fragment);
		}
	});

	test('an unconfigured backend is reported, never silently skipped', async () => {
		// Either the install has no translator_config for this engine (the
		// common case → the explicit config error) or it has one and the run
		// stops at the empty source slice — never a fabricated translation.
		const response = await runAutomaticTranslation(
			{ options: { ...options, translator: 'babel' }, userId: -1, principal: SUPERUSER },
			'tool_lang',
		);
		if (response.result === false) {
			expect(String(response.msg)).toContain('Translator config');
		} else {
			expect(response.msg).toBe('Ignored empty result. Nothing is saved!');
			expect(response.count).toBe(0);
		}
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

/**
 * REGRESSION GATE (2026-07-28): resolveTranslatorConfig must read the shape
 * getToolConfig ACTUALLY emits.
 *
 * getToolConfig resolves options FLAT (one key per option), so `tool_lang`'s
 * config comes back as {info, translator_config, translator_engine} with NO
 * `.config` wrapper. The resolver read `toolConfig.config.translator_config.value`
 * — a shape no DB record, no register.json and no caller ever produces — so it
 * returned null for every engine and EVERY automatic_translation request failed
 * with "Translator config (uri/key) is not defined". The pre-existing tests fed
 * the nested shape by hand, so they stayed green while the feature was dead.
 * This is the identical bug that was fixed one function over in
 * transcription_asr.ts; the fix mirrors it (flat first, nested tolerated).
 */
describe('resolveTranslatorConfig reads the real getToolConfig shape', () => {
	const entry = { name: 'babel', uri: 'https://tr.example.org', key: 'k' };

	test('the FLAT shape getToolConfig emits resolves', () => {
		expect(resolveTranslatorConfig({ translator_config: [entry] }, 'babel')).toEqual({
			uri: entry.uri,
			key: entry.key,
		});
	});

	test('an un-unwrapped {value:[…]} under the flat key resolves', () => {
		expect(resolveTranslatorConfig({ translator_config: { value: [entry] } }, 'babel')).toEqual({
			uri: entry.uri,
			key: entry.key,
		});
	});

	test('the legacy nested shape still resolves (tolerated, not required)', () => {
		expect(
			resolveTranslatorConfig({ config: { translator_config: { value: [entry] } } }, 'babel'),
		).toEqual({ uri: entry.uri, key: entry.key });
	});

	test('an unknown engine is still null', () => {
		expect(resolveTranslatorConfig({ translator_config: [entry] }, 'google')).toBeNull();
	});
});
