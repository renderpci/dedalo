/**
 * Automatic translation core (PHP tool_lang / tool_lang_multi
 * ::automatic_translation + translators/class.babel.php). Reads a component's
 * source-lang items, translates each `value` through a pluggable provider, and
 * returns target-lang items ({value, lang}) to write into the target slot.
 *
 * The PROVIDER is a seam: the real `babelProvider` POSTs to the configured
 * Apertium/Babel service (external, SSRF-guarded); tests inject a stub. This is
 * the plan's external-engine gate (Phase 4: "the provider is a seam, stub in test").
 * browser_transformer is client-side only (never reaches the server); google is
 * not implemented in PHP either.
 */

import type { MatrixJsonbColumn } from '../db/matrix.ts';

export interface TranslateRequest {
	uri: string;
	key: string;
	sourceLang: string;
	targetLang: string;
	text: string;
}

export interface TranslateResult {
	/** Translated text, or false on provider failure. */
	result: string | false;
	msg: string;
}

export type TranslationProvider = (req: TranslateRequest) => Promise<TranslateResult>;

export interface TranslateItemsConfig {
	uri: string;
	key: string;
	sourceLang: string;
	targetLang: string;
}

/**
 * Translate every source item's `value` into target-lang items. Stops and
 * surfaces the provider error on the first failure (PHP returns immediately). The
 * "Sorry. Quota exceeded" leading string is treated as an error, never persisted.
 */
export async function translateItems(
	sourceItems: readonly unknown[],
	provider: TranslationProvider,
	cfg: TranslateItemsConfig,
): Promise<{ items: { value: string; lang: string }[]; error: string | null }> {
	const out: { value: string; lang: string }[] = [];
	for (const item of sourceItems) {
		const text =
			item !== null && typeof item === 'object'
				? String((item as { value?: unknown }).value ?? '')
				: String(item ?? '');
		const res = await provider({
			uri: cfg.uri,
			key: cfg.key,
			sourceLang: cfg.sourceLang,
			targetLang: cfg.targetLang,
			text,
		});
		if (res.result === false) return { items: [], error: res.msg };
		if (res.result.startsWith('Sorry. Quota exceeded')) {
			return { items: [], error: 'Sorry. Quota exceeded' };
		}
		out.push({ value: res.result, lang: cfg.targetLang });
	}
	return { items: out, error: null };
}

/** Babel/Apertium direction code (PHP get_babel_direction): 'lg-spa'→'spa', joined. */
export function babelDirection(sourceLang: string, targetLang: string): string {
	const strip = (lang: string) => lang.replace(/^lg-/, '');
	return `${strip(sourceLang)}-${strip(targetLang)}`;
}

/** Minimal SSRF guard for the outbound translator URL (PHP is_safe_remote_url). */
function isSafeTranslatorUrl(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	// Block loopback / link-local / cloud-metadata; private ranges are a
	// defense-in-depth block (translators are external services).
	if (
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '::1' ||
		host === '169.254.169.254'
	) {
		return false;
	}
	if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
	return true;
}

/**
 * Real Babel provider — POSTs to the configured Apertium service. External seam:
 * exercised on a running server with a configured engine (ledgered); unit tests
 * inject a stub provider instead.
 */
export const babelProvider: TranslationProvider = async (req) => {
	if (!isSafeTranslatorUrl(req.uri)) return { result: false, msg: 'invalid translator URL (SSRF)' };
	const body = new URLSearchParams({
		key: req.key,
		text: req.text,
		direction: babelDirection(req.sourceLang, req.targetLang),
	});
	try {
		const res = await fetch(req.uri, { method: 'POST', body });
		if (!res.ok) return { result: false, msg: `translate HTTP ${res.status}` };
		return { result: await res.text(), msg: 'ok' };
	} catch (error) {
		return { result: false, msg: (error as Error).message };
	}
};

/** Resolve a translation provider by engine name (PHP translator switch). */
export function resolveTranslationProvider(engine: string): {
	provider: TranslationProvider | null;
	error: string | null;
} {
	switch (engine) {
		case 'browser_transformer':
			return { provider: null, error: 'Browser transformer is client-side only' };
		case 'google_translation':
			return { provider: null, error: "'google_translation' is not implemented yet" };
		default:
			return { provider: babelProvider, error: null };
	}
}

/**
 * Read a component's source-lang items, translate them, and write the target-lang
 * slot (PHP automatic_translation save path). Empty source → nothing saved. Uses
 * the verified direct-write path (persistRecordKeys + recordTimeMachine, stamping
 * the record's modified metadata like PHP's component->save()). Shared
 * by tool_lang (one target) and tool_lang_multi (looped targets).
 */
export async function translateAndWrite(input: {
	model: string;
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	sourceLang: string;
	targetLang: string;
	provider: TranslationProvider;
	uri: string;
	key: string;
	userId: number;
}): Promise<{ ok: boolean; msg: string; count: number }> {
	const { getColumnNameByModel, getMatrixTableFromTipo } = await import('../ontology/resolver.ts');
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const { readComponentItems, filterItemsByLang } = await import('../resolve/component_data.ts');
	const { persistRecordKeys } = await import('../section_record/index.ts');
	const { recordTimeMachine } = await import('../db/time_machine.ts');
	const { dbTimestamp } = await import('../db/db_timestamp.ts');

	const table = await getMatrixTableFromTipo(input.sectionTipo);
	const column = getColumnNameByModel(input.model);
	if (table === null || column === null)
		return { ok: false, msg: 'no matrix table/column', count: 0 };

	const record = await readMatrixRecord(table, input.sectionTipo, input.sectionId);
	const allItems =
		record !== null ? (readComponentItems(record, input.componentTipo, input.model) ?? []) : [];
	const sourceSlice = filterItemsByLang(allItems, input.sourceLang);
	if (sourceSlice.length === 0)
		return { ok: true, msg: 'Ignored empty result. Nothing is saved!', count: 0 };

	const { items: targetItems, error } = await translateItems(sourceSlice, input.provider, {
		uri: input.uri,
		key: input.key,
		sourceLang: input.sourceLang,
		targetLang: input.targetLang,
	});
	if (error !== null) return { ok: false, msg: error, count: 0 };

	const merged = [
		...allItems.filter(
			(item) =>
				!(
					item !== null &&
					typeof item === 'object' &&
					(item as { lang?: string }).lang === input.targetLang
				),
		),
		...targetItems,
	];
	// Chokepoint write: translated value + modified stamps in one update (PHP
	// tool_lang saves via component->save(), which stamps).
	await persistRecordKeys(
		{ table, sectionTipo: input.sectionTipo, sectionId: input.sectionId },
		[{ column: column as MatrixJsonbColumn, key: input.componentTipo, value: merged }],
		{ userId: input.userId },
	);
	await recordTimeMachine(
		{
			sectionTipo: input.sectionTipo,
			sectionId: input.sectionId,
			componentTipo: input.componentTipo,
			lang: input.targetLang,
			userId: input.userId,
			data: merged,
		},
		dbTimestamp(),
	);
	return { ok: true, msg: 'OK. Request done', count: targetItems.length };
}

/**
 * The full automatic_translation handler orchestration (shared by tool_lang and
 * tool_lang_multi — PHP tool_lang_multi delegates to tool_lang). Gates, resolves
 * the engine + config, reads/translates/writes. `configToolName` selects whose
 * translator_config to read (PHP get_called_class → tool_lang).
 */
export async function runAutomaticTranslation(
	ctx: {
		options: Record<string, unknown>;
		userId: number;
		principal: import('../security/permissions.ts').Principal;
	},
	configToolName: string,
): Promise<{ result: unknown; msg: string; errors: string[]; count?: number }> {
	const fail = (message: string, errors: string[] = [message]) => ({
		result: false,
		msg: `Error. ${message}`,
		errors,
	});
	const o = ctx.options;
	const componentTipo = String(o.component_tipo ?? '');
	const sectionTipo = String(o.section_tipo ?? '');
	const sectionId = Number(o.section_id ?? 0);
	const sourceLang = String(o.source_lang ?? 'lg-eng');
	const targetLang = String(o.target_lang ?? '');
	const engine = String(o.translator ?? 'babel');

	if (componentTipo === '' || sectionTipo === '' || targetLang === '') {
		return fail('Missing required parameters: component_tipo, section_tipo, target_lang', [
			'invalid_request',
		]);
	}

	const { assertActionPermission } = await import('./security.ts');
	const gate = await assertActionPermission(
		{
			permission: 'record',
			minLevel: 2,
			handler: async () => ({ result: false, msg: '', errors: [] }),
		},
		{ section_tipo: sectionTipo, section_id: sectionId },
		ctx.principal,
	);
	if (!gate.ok) return fail(gate.msg, gate.errors);

	const { provider, error: providerError } = resolveTranslationProvider(engine);
	if (provider === null) return fail(providerError ?? 'unknown translator engine');

	const { getToolConfig } = await import('./config.ts');
	const cfg = resolveTranslatorConfig(await getToolConfig(configToolName), engine);
	if (cfg === null) return fail(`Translator config (uri/key) is not defined for '${engine}'`);

	const { getModelByTipo } = await import('../ontology/resolver.ts');
	const model = await getModelByTipo(componentTipo);
	if (model === null) return fail(`unknown component tipo: ${componentTipo}`);

	const outcome = await translateAndWrite({
		model,
		componentTipo,
		sectionTipo,
		sectionId,
		sourceLang,
		targetLang,
		provider,
		uri: cfg.uri,
		key: cfg.key,
		userId: ctx.userId,
	});
	return outcome.ok
		? { result: true, msg: outcome.msg, errors: [], count: outcome.count }
		: fail(outcome.msg);
}

/** Resolve the {uri, key} for an engine from a tool's translator_config (dd996). */
export function resolveTranslatorConfig(
	toolConfig: Record<string, unknown>,
	engine: string,
): { uri: string; key: string } | null {
	const configs = (toolConfig?.config as { translator_config?: { value?: unknown[] } } | undefined)
		?.translator_config?.value;
	if (!Array.isArray(configs)) return null;
	const entry = configs.find(
		(item) =>
			item !== null && typeof item === 'object' && (item as { name?: string }).name === engine,
	) as { uri?: string; key?: string } | undefined;
	if (!entry || !entry.uri || !entry.key) return null;
	return { uri: entry.uri, key: entry.key };
}
