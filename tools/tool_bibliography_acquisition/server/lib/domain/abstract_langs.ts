/**
 * Abstract language planning — which data-lang slot each `xml:lang` abstract variant lands in.
 *
 * PURE (no engine import): the caller passes the install's data languages, each paired with its
 * ISO 639-1 code through the engine's own map (lang_names.ts getAlpha2FromCode, filtered by
 * save_component.ts installedDataLangs()) — the same `{data, current}` shape tool_import_rdf's
 * engineRdfPlanLangs builds. No private code table: a language the install does not declare is
 * never written (save_component would refuse it and roll the whole publication back), it is
 * SKIPPED and REPORTED, never silent.
 *
 * Rules:
 * - An OAI `xml:lang` is normalised to its primary subtag ("es-ES" / "en_US" -> "es" / "en").
 *   A 2-letter subtag matches an installed lang by its ISO 639-1 code; a 3-letter one
 *   (ISO 639-2/T, "spa") matches the installed `lg-<code>` directly.
 * - Unmappable or not installed -> skipped, reason `language_not_installed` (tool_import_rdf's
 *   own reason name for the same situation).
 * - Two variants targeting the same slot: the FIRST is kept, every later one is skipped,
 *   reason `duplicate_language` — never a silent last-wins overwrite.
 * - A variant with no `xml:lang` goes to `current` (the request data lang) only when no tagged
 *   variant already targets that slot; otherwise it is skipped as `duplicate_language`.
 */

export interface AbstractLangs {
	/** The installed data languages that have an ISO 639-1 code. */
	readonly data: readonly { readonly code: string; readonly alpha2: string }[];
	/** The request's data lang (currentDataLang()) — where an untagged variant goes. */
	readonly current: string;
}

export interface AbstractVariant {
	readonly lang: string | null;
	readonly text: string;
}

export type AbstractSkipReason = 'language_not_installed' | 'duplicate_language';

export interface AbstractSkip {
	/** The variant's own `xml:lang` as the source sent it (null: untagged). */
	readonly lang: string | null;
	readonly reason: AbstractSkipReason;
}

export interface AbstractPlan {
	readonly writes: readonly { readonly lang: string; readonly text: string }[];
	readonly skipped: readonly AbstractSkip[];
}

/** The engine `lg-` code an OAI `xml:lang` maps to on this install, or null. */
export function resolveAbstractLang(sourceLang: string, langs: AbstractLangs): string | null {
	const primary = sourceLang.trim().toLowerCase().split(/[-_]/)[0] ?? '';
	if (primary.length === 2) {
		return langs.data.find((lang) => lang.alpha2 === primary)?.code ?? null;
	}
	if (primary.length === 3) {
		const code = `lg-${primary}`;
		return langs.data.some((lang) => lang.code === code) ? code : null;
	}
	return null;
}

export function planAbstractLangs(
	variants: readonly AbstractVariant[],
	langs: AbstractLangs,
): AbstractPlan {
	const writes: { lang: string; text: string }[] = [];
	const skipped: AbstractSkip[] = [];
	const taken = new Set<string>();

	for (const variant of variants) {
		if (variant.lang === null || variant.lang.trim() === '') continue;
		const target = resolveAbstractLang(variant.lang, langs);
		if (target === null) {
			skipped.push({ lang: variant.lang, reason: 'language_not_installed' });
		} else if (taken.has(target)) {
			skipped.push({ lang: variant.lang, reason: 'duplicate_language' });
		} else {
			taken.add(target);
			writes.push({ lang: target, text: variant.text });
		}
	}
	for (const variant of variants) {
		if (variant.lang !== null && variant.lang.trim() !== '') continue;
		if (taken.has(langs.current)) {
			skipped.push({ lang: null, reason: 'duplicate_language' });
		} else {
			taken.add(langs.current);
			writes.push({ lang: langs.current, text: variant.text });
		}
	}
	return { writes, skipped };
}
