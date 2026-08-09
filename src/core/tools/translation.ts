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
import { currentDataLang } from '../resolve/request_lang.ts';
import { addBabelNotransTags, processBabelResponse } from './babel.ts';

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
	/** Unmodified provider body (PHP $response->raw_result) — debug only, never persisted. */
	rawResult?: string;
}

/** PHP tool_lang:270 budgets the provider message in BYTES (strlen/substr). */
const PROVIDER_MSG_MAX_BYTES = 512;

/**
 * PHP tool_lang:270 — a translation service that fails can answer with a whole
 * HTML error page; the message is truncated before it reaches the response so
 * one bad request cannot flood the wire.
 *
 * THE UNIT IS BYTES. PHP's `strlen`/`substr` count bytes, JS `String.length` and
 * `slice` count UTF-16 code units, so an error page in any language with accents
 * truncated at a completely different point — and `slice` could cut a surrogate
 * pair in half and put a LONE SURROGATE on the wire.
 *
 * One deliberate divergence, ledgered as
 * `WC-2026-08-09-provider-message-truncation-boundary`: PHP's byte `substr` can
 * end mid-character and emit a partial UTF-8 sequence (which then makes PHP's own
 * `json_encode` fail); we spend the same 512-byte budget but cut on a CHARACTER
 * boundary, dropping the straddling character whole.
 */
export function truncateProviderMessage(message: string): string {
	const bytes = new TextEncoder().encode(message);
	if (bytes.length <= PROVIDER_MSG_MAX_BYTES) return message;
	// Walk back off any UTF-8 continuation byte (10xxxxxx) so the cut lands on
	// the start of a character rather than inside one.
	let end = PROVIDER_MSG_MAX_BYTES;
	while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
	return `${new TextDecoder().decode(bytes.subarray(0, end))}..`;
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
		if (res.result === false) return { items: [], error: truncateProviderMessage(res.msg) };
		if (res.result.startsWith('Sorry. Quota exceeded')) {
			return { items: [], error: 'Sorry. Quota exceeded' };
		}
		out.push({ value: res.result, lang: cfg.targetLang });
	}
	return { items: out, error: null };
}

/**
 * Babel direction code — PHP `babel::get_babel_direction` (class.babel.php:189).
 *
 * `substr($lang, 3, 2)`: the FIRST TWO letters of the ISO code, not the whole
 * code — 'lg-spa' → 'sp', so the pair is 'sp-en'. That is the mode grammar of
 * the babel service Dédalo talks to, stated in its own docblock ("uses two-letter
 * codes for most language pairs but requires the full three-letter 'deu'/'eng'
 * suffix for the German pair").
 *
 * The port stripped the 'lg-' prefix instead and asked for 'spa-eng', a mode the
 * box does not have — so every translation came back as the `Error: Mode …`
 * sentence that audit §5.6 found written over the target-language slot. Screening
 * that body (babel.ts) stops it being persisted; THIS restores the request that
 * makes a translation happen at all.
 *
 * The German branch is PHP's, exception and asymmetry included: the SOURCE
 * becomes 'deu', and the target becomes 'eng' only when it is English. German as
 * a target keeps the generic two-letter extraction — PHP flags that as
 * questionable but it is the contract the service was built against, so it is
 * ported verbatim rather than "improved" here.
 */
export function babelDirection(sourceLang: string, targetLang: string): string {
	// String.slice(3, 5) is PHP substr($lang, 3, 2), empty slice included.
	let source = sourceLang.slice(3, 5);
	let target = targetLang.slice(3, 5);
	if (sourceLang === 'lg-deu') {
		source = 'deu';
		if (targetLang === 'lg-eng') target = 'eng';
	}
	return `${source}-${target}`;
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
 * Real Babel provider — the IO shell of PHP `babel::translate`. Everything that
 * is not the HTTP call lives in `babel.ts` (pure, unit-tested): mark protection
 * on the way out, and the error screen + entity decode + tag strip on the way
 * back.
 *
 * THE RULE THIS ENFORCES: a body that is not a translation must NEVER become
 * one. Until 2026-08 this returned `await res.text()` verbatim, so an Apertium
 * box answering `Error: Mode …` had its error sentence written over the
 * target-language slot and reported as a success (audit §5.6). The screen is
 * PHP's — HTTP 200 is not proof of a translation.
 */
export const babelProvider: TranslationProvider = async (req) => {
	if (!isSafeTranslatorUrl(req.uri)) return { result: false, msg: 'invalid translator URL (SSRF)' };
	const body = new URLSearchParams({
		key: req.key,
		// PHP: trim(TR::addBabelTagsOnTheFly($text)) — the timecode/index/person/
		// note/reference/svg/geo/page marks travel inside <apertium-notrans> so
		// the engine cannot rewrite them.
		text: addBabelNotransTags(req.text ?? '').trim(),
		direction: babelDirection(req.sourceLang, req.targetLang),
	});
	try {
		const res = await fetch(req.uri, { method: 'POST', body });
		if (!res.ok) return { result: false, msg: `translate HTTP ${res.status}` };
		const rawResult = await res.text();
		const processed = processBabelResponse(rawResult);
		return processed.ok
			? { result: processed.value, msg: 'ok', rawResult }
			: { result: false, msg: processed.msg };
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
 *
 * THE LOCK (audit 2026-08 §5.6). The merge is a read-modify-write of ONE jsonb
 * key holding EVERY language of the component, so it is only safe under the
 * engine's locked-RMW contract. Without it, tool_lang_multi's "translate all"
 * — N concurrent requests, one per target language, on the SAME record — had
 * every request merge onto the same stale snapshot and the last write silently
 * discard the languages the others had just added. PHP never had this bug: its
 * requests serialised behind the session lock.
 *
 * The order matters as much as the lock: the provider call is an EXTERNAL HTTP
 * request that can take minutes, so it happens BEFORE the transaction opens.
 * The row lock is then taken for the merge only, and the merge base is the
 * freshly locked re-read — never the pre-translation snapshot.
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
	const { withTransaction } = await import('../db/postgres.ts');
	const { readMatrixKeyForUpdate } = await import('../db/matrix_write.ts');

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

	// The external call happens OUTSIDE the transaction — a translator server can
	// take minutes, and holding a FOR UPDATE row lock across it would block every
	// other writer of the record.
	const { items: targetItems, error } = await translateItems(sourceSlice, input.provider, {
		uri: input.uri,
		key: input.key,
		sourceLang: input.sourceLang,
		targetLang: input.targetLang,
	});
	if (error !== null) return { ok: false, msg: error, count: 0 };

	return await withTransaction(async () => {
		// TAKE THE ROW LOCK. The merge base must be the row as it stands NOW, not
		// the snapshot taken before the translator was called, so that concurrent
		// translations into other languages stack instead of clobbering.
		// `readMatrixKeyForUpdate` refuses to run outside a transaction, so the
		// lock can never be silently lost.
		const locked = await readMatrixKeyForUpdate(
			table,
			input.sectionTipo,
			input.sectionId,
			column as MatrixJsonbColumn,
			input.componentTipo,
		);
		if (locked === null) {
			return {
				ok: false,
				msg: `record ${input.sectionTipo}/${input.sectionId} not found in ${table} — it was deleted concurrently; the translation was NOT saved`,
				count: 0,
			};
		}
		// DECODE THROUGH THE READ CHOKEPOINT, never through the lock's return
		// value. `readMatrixKeyForUpdate` answers `[]` for anything that is not a
		// JSON array, which on a LEGACY record — where the component value is a
		// bare `{lang,value}` object rather than an array (pre-matrix_dd shape) —
		// is indistinguishable from "this component has no items". Merging the new
		// target language onto that empty base DELETES the record's existing
		// language: the source text the tool was asked to translate is the very
		// thing it destroys. `readComponentItems` is the one place that knows the
		// legacy shape (coerce non-array to `[items]`, drop null/'' holes), and it
		// is already what produced `sourceSlice` above — so the merge base and the
		// source base are decoded by the same grammar or they will disagree again.
		//
		// This re-read runs on the transaction's own connection AFTER the FOR
		// UPDATE, so it sees exactly the row version the lock is held on.
		const lockedRecord = await readMatrixRecord(table, input.sectionTipo, input.sectionId);
		if (lockedRecord === null) {
			// Impossible under the row lock we hold — report it rather than
			// inventing an empty merge base out of it.
			throw new Error(
				`translateAndWrite: ${table}/${input.sectionTipo}/${input.sectionId} vanished between FOR UPDATE and the locked re-read`,
			);
		}
		const currentItems = readComponentItems(lockedRecord, input.componentTipo, input.model) ?? [];

		const merged = [
			...currentItems.filter(
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
	});
}

/**
 * The source language a request that does not name one translates FROM — PHP
 * `$options->source_lang ?? DEDALO_DATA_LANG` (tool_lang.php:149), whose TS twin
 * is the ALS request data lang (installation default outside a request).
 *
 * This was the literal `'lg-eng'` (audit 2026-08 §5.6 tail): a Catalan archive
 * omitting source_lang read the (usually empty) English slice, so the tool
 * either translated nothing or translated the wrong text. Languages are
 * configuration, never module literals.
 */
export function defaultTranslationSourceLang(): string {
	return currentDataLang();
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
	const sourceLang = String(o.source_lang ?? defaultTranslationSourceLang());
	const targetLang = String(o.target_lang ?? '');
	const engine = String(o.translator ?? 'babel');

	if (componentTipo === '' || sectionTipo === '' || targetLang === '') {
		return fail('Missing required parameters: component_tipo, section_tipo, target_lang', [
			'invalid_request',
		]);
	}

	// PHP asserts BOTH halves (tool_lang :164/:167, tool_lang_multi :122/:124;
	// TOOLS-10, 2026-07-28 audit): assert_tipo_permission(section_tipo,
	// component_tipo, 2) — the SCHEMA pair, which a section-level check does not
	// imply when the component carries its own dd774 grant, so a user with
	// section write but NOT write on THIS component cannot translate-overwrite
	// it — and assert_record_in_user_scope(section_tipo, section_id). The
	// 'record' gate below is the second half only, so the pair is asserted
	// explicitly first. (Both branches added this same check in parallel; merged
	// 2026-07-29.)
	const { getPermissions } = await import('../security/permissions.ts');
	if ((await getPermissions(ctx.principal, sectionTipo, componentTipo)) < 2) {
		return fail('insufficient permissions on the target component', ['unauthorized']);
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

/**
 * Resolve the {uri, key} for an engine from a tool's translator_config (dd996).
 *
 * SHAPE: `getToolConfig` resolves options FLAT — one key per option, already
 * unwrapped — so the entry list is `toolConfig.translator_config` (an array).
 * The nested `config.translator_config.value` form is PHP's raw config-item
 * shape and is TOLERATED as legacy, but reading ONLY it (as this did until
 * 2026-07-28) meant the resolver never matched what the caller actually passes:
 * every automatic_translation failed with "Translator config is not defined"
 * while the tests fed the nested shape by hand and stayed green. Same bug, same
 * fix, as resolveTranscriberConfig one subsystem over.
 */
export function resolveTranslatorConfig(
	toolConfig: Record<string, unknown>,
	engine: string,
): { uri: string; key: string } | null {
	const flat = toolConfig?.translator_config;
	const nested = (toolConfig?.config as { translator_config?: { value?: unknown[] } } | undefined)
		?.translator_config?.value;
	// Tolerate an un-unwrapped `{value:[…]}` under the flat key too (a config
	// layer that stored the prop object rather than its value).
	const configs = Array.isArray(flat)
		? flat
		: ((flat as { value?: unknown } | undefined)?.value ?? nested);
	if (!Array.isArray(configs)) return null;
	const entry = configs.find(
		(item) =>
			item !== null && typeof item === 'object' && (item as { name?: string }).name === engine,
	) as { uri?: string; key?: string } | undefined;
	if (!entry?.uri || !entry.key) return null;
	return { uri: entry.uri, key: entry.key };
}
