/**
 * Language projection — the 5-level fallback ladder (DIFFUSION_SPEC §4.4).
 *
 * Tabular diffusion emits ONE row per configured language; each column falls
 * back through: exact lang → nolan (language-independent) → main_lang → any
 * available lang → null. Business-critical and pinned against the old
 * engine's PHASE-2 expansion (diffusion_processor.ts:683-760), including its
 * two field policies:
 * - emptyToString: empty results ('' / '[]' / 'null' / '{}' / null) emit ''
 * - defaultValue: empty results (null / '' / '[]' / 'null' — deliberately NOT
 *   '{}', oracle behavior) emit the configured constant
 *
 * Everything here is pure — the resolver hands per-column lang→value maps,
 * this module hands back per-lang rows. Writers never reimplement any of it.
 */

/** Language-independent values are keyed under this sentinel (oracle 'nolan'). */
export const NOLAN_KEY = 'nolan';

/** Per-column resolved values: lang (or NOLAN_KEY) → final string value. */
export type ColumnLangValues = Map<string, string | null>;

export interface LangPolicy {
	/** Target output languages; empty = single row with lang null. */
	langs: string[];
	/** Fallback language (priority 3); empty/null disables that rung. */
	mainLang: string | null;
}

export interface FieldProjectionPolicy {
	emptyToString?: boolean;
	defaultValue?: string;
}

export interface ProjectedRow {
	sectionId: number | string;
	lang: string | null;
	columns: Record<string, string | null>;
}

/** First inserted value of the map (oracle get_first_value — insertion order). */
function firstValue(langValues: ColumnLangValues): string | null | undefined {
	for (const [, value] of langValues) return value;
	return undefined;
}

/**
 * One column, one target lang: the 5-level ladder (oracle priorities 1-5).
 * Exported standalone so the table-driven gate enumerates every rung.
 */
export function resolveColumnForLang(
	langValues: ColumnLangValues,
	lang: string,
	mainLang: string | null,
): string | null {
	if (langValues.has(lang)) return langValues.get(lang) ?? null; // 1 exact
	if (langValues.has(NOLAN_KEY)) return langValues.get(NOLAN_KEY) ?? null; // 2 nolan
	if (mainLang !== null && mainLang !== '' && langValues.has(mainLang)) {
		return langValues.get(mainLang) ?? null; // 3 main lang
	}
	const any = firstValue(langValues); // 4 any available
	if (any !== undefined) return any;
	return null; // 5 no data
}

/** Field policies applied AFTER the ladder (oracle apply_ets, one place only). */
export function applyFieldPolicy(
	value: string | null,
	policy: FieldProjectionPolicy | undefined,
): string | null {
	if (policy === undefined) return value;
	if (
		policy.emptyToString === true &&
		(value === null || value === '' || value === '[]' || value === 'null' || value === '{}')
	) {
		return '';
	}
	if (
		policy.defaultValue !== undefined &&
		(value === null || value === '' || value === '[]' || value === 'null')
	) {
		return policy.defaultValue;
	}
	return value;
}

/**
 * Project one record's resolved columns into per-lang rows (oracle PHASE 2).
 * No configured langs → a single row with lang null taking nolan-or-first
 * (the oracle's degenerate branch).
 */
export function projectRecordRows(
	sectionId: number | string,
	columnValues: Map<string, ColumnLangValues>,
	langPolicy: LangPolicy,
	fieldPolicies?: Map<string, FieldProjectionPolicy>,
): ProjectedRow[] {
	const policyOf = (column: string): FieldProjectionPolicy | undefined =>
		fieldPolicies?.get(column);

	if (langPolicy.langs.length === 0) {
		const columns: Record<string, string | null> = {};
		for (const [columnName, langValues] of columnValues) {
			const raw = langValues.get(NOLAN_KEY) ?? firstValue(langValues) ?? null;
			columns[columnName] = applyFieldPolicy(raw, policyOf(columnName));
		}
		return [{ sectionId, lang: null, columns }];
	}

	const rows: ProjectedRow[] = [];
	for (const lang of langPolicy.langs) {
		const columns: Record<string, string | null> = {};
		for (const [columnName, langValues] of columnValues) {
			const resolved = resolveColumnForLang(langValues, lang, langPolicy.mainLang);
			columns[columnName] = applyFieldPolicy(resolved, policyOf(columnName));
		}
		rows.push({ sectionId, lang, columns });
	}
	return rows;
}
