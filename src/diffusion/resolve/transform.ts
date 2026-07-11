/**
 * Transform + column fan-out — DIFFUSION_SPEC §4.1 stage E and the per-column
 * half of stage F (DIFFUSION_PLAN D3-P1).
 *
 * This is the seam the legacy-fixture replay gate exercises: resolved value
 * atoms (MetaValueIR) run through the field's parser chain and land in a
 * per-column lang→string map (ColumnLangValues) that project/lang_ladder.ts
 * expands into per-lang rows. Behavior is a faithful port of the old engine's
 * PHASE 1 (oracle diffusion/api/v1/lib/diffusion_processor.ts:350-655) and its
 * parser-chain state machine (apply_parser_chain :873-1070):
 *
 * - chain steps with an `id` consume only the atoms whose ddo handle matches
 *   and park their result in per-id state; id-less steps consume the combined
 *   state (or the last unmapped result) — :896-938;
 * - the DEFAULT COMPLETION collapses array-valued results: column-aware
 *   merge() when every merge column is covered (:1017-1034), else per-lang
 *   join by the last parser's records_separator (:1036-1064);
 * - fields with merge columns and NO parser auto-apply merge(columns,
 *   merge:'string') (:457-502); fields with neither parser nor columns take
 *   the join_items_to_string default (:594-608, oracle parser_text.ts:33-60);
 * - the fan-out stringifies per output_format (json/int/string — :438-455,
 *   :548-584) and stores 'nolan' values only when non-null (:452-454,:614-618).
 *
 * Everything here is PURE (no I/O, no clock): the resolver hands atoms already
 * read from the matrix, terms already prefetched on chain links.
 */

import { toItems } from '../parsers/item_bridge.ts';
import { merge } from '../parsers/parser_helper.ts';
import { RUNTIME_PARSERS } from '../parsers/registry.ts';
import type { MetaValueIR, ParserContext, ParserItem, ValueMeta } from '../parsers/types.ts';
import type { ParserStepConfig } from '../plan/types.ts';
import type { ColumnLangValues } from '../project/lang_ladder.ts';
import { NOLAN_KEY } from '../project/lang_ladder.ts';

/** One merge column: a leaf source component (oracle ctx.columns entry). */
export interface MergeColumnRef {
	tipo: string;
	model: string;
}

/**
 * A step fn implemented OUTSIDE the runtime parser registry — the resolver
 * passes its rewriter implementations here so recovered full chains (rewriter
 * + runtime steps, original ontology order) execute through one machine.
 */
export type ExtraStepFn = (
	values: MetaValueIR[],
	options: Record<string, unknown>,
	ctx: ParserContext,
) => MetaValueIR[];

/** How one field's atoms become one column (compiled off FieldPlan). */
export interface FieldTransformSpec {
	/** Ordered chain steps (runtime + resolver-provided rewriter fns). */
	transform: ParserStepConfig[];
	/** 'json' | 'int' | undefined (string) — FieldPlan.outputFormat. */
	outputFormat?: string;
	/** Leaf source columns; presence switches on the column-aware paths. */
	mergeColumns?: MergeColumnRef[];
	/** Extra fn table consulted before RUNTIME_PARSERS (rewriters). */
	extraFns?: ReadonlyMap<string, ExtraStepFn>;
}

/** Read an atom's provenance bag (stamped by the resolver / replay adapter). */
function metaOf(value: MetaValueIR): ValueMeta | undefined {
	return value.meta;
}

/** Normalize an atom/item lang to a ladder key (null/'lg-nolan' → nolan). */
function langKeyOf(lang: string | null | undefined): string {
	return !lang || lang === 'lg-nolan' ? NOLAN_KEY : lang;
}

/** Oracle val_str per output format (diffusion_processor.ts:548-573). */
function formatItemValue(value: unknown, outputFormat: string | undefined): string | null {
	if (value === null || value === undefined) return null;
	if (outputFormat === 'int') {
		const parsed = String(Number.parseInt(String(value), 10));
		return parsed === 'NaN' ? '0' : parsed;
	}
	if (outputFormat === 'json') {
		// Already-string values pass through (oracle: avoid double-encoding).
		return typeof value === 'string' ? value : JSON.stringify(value);
	}
	return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Oracle join_items_to_string (parser_text.ts:33-60): the no-parser default. */
function joinItemsToString(items: ParserItem[]): string | null {
	if (items.length === 0) return null;
	const parts: string[] = [];
	for (const item of items) {
		const value = item.value;
		if (value === null || value === undefined) continue;
		if (Array.isArray(value)) {
			const joined = value
				.filter((entry) => entry !== null && entry !== undefined && entry !== '')
				.map((entry) => stringifyLoose(entry))
				.join(', ');
			if (joined) parts.push(joined);
		} else {
			const single = stringifyLoose(value);
			if (single) parts.push(single);
		}
	}
	return parts.length === 0 ? null : parts.join(' | ');
}

/** Oracle stringify_value shape for join contexts (item_bridge.stringifyValue twin). */
function stringifyLoose(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (Array.isArray(value)) return value.map((entry) => stringifyLoose(entry)).join(', ');
	if (typeof value === 'object' && value !== null) return JSON.stringify(value);
	return '';
}

/**
 * inject_columns_into_parser (oracle :839-860): merge columns + main_lang are
 * injected into every step's options — EXCEPT a merge(unique) step, which is a
 * value dedupe, not a column merge (injecting columns would derail it).
 */
function injectStepOptions(
	step: ParserStepConfig,
	spec: FieldTransformSpec,
	ctx: ParserContext,
): Record<string, unknown> {
	const options = step.options ?? {};
	if (spec.mergeColumns === undefined || spec.mergeColumns.length === 0) return options;
	if (step.fn === 'parser_helper::merge' && options.merge === 'unique') return options;
	const injected: Record<string, unknown> = { ...options, columns: spec.mergeColumns };
	if (ctx.mainLang) injected.main_lang = ctx.mainLang;
	return injected;
}

/** Resolve a step fn: resolver-provided rewriters first, then the registry. */
function stepFnOf(fn: string, spec: FieldTransformSpec): ExtraStepFn {
	const extra = spec.extraFns?.get(fn);
	if (extra !== undefined) return extra;
	const runtime = RUNTIME_PARSERS.get(fn);
	if (runtime !== undefined) return runtime as ExtraStepFn;
	// The plan compiler guarantees only registered fns survive; reaching here
	// means a recovered chain carries an unimplemented fn — fail loud.
	throw new Error(`diffusion transform: no implementation for parser fn '${fn}'`);
}

/**
 * The parser-chain state machine (oracle apply_parser_chain :873-1070) over
 * typed atoms. Returns null for the oracle's "no data" outcome.
 */
export function runFieldTransform(
	values: MetaValueIR[],
	spec: FieldTransformSpec,
	ctx: ParserContext,
): MetaValueIR[] | null {
	if (spec.transform.length === 0) return values;

	const state = new Map<string, MetaValueIR[]>();
	let lastUnmapped: MetaValueIR[] = values;
	let lastOptions: Record<string, unknown> = {};

	for (const step of spec.transform) {
		if (!step.fn) continue;

		let input: MetaValueIR[];
		if (step.id !== undefined && step.id !== '') {
			// id step: parked state wins, else the original atoms with that handle.
			input =
				state.get(step.id) ??
				values.filter((atom) => String(metaOf(atom)?.sourceId ?? '') === step.id);
		} else if (state.size > 0) {
			// Combine parked results (stamping their handle back) plus original
			// atoms with a handle never parked; null-handle atoms stay out
			// (oracle :904-934 — they were already visible to every id step).
			const combined: MetaValueIR[] = [];
			for (const [key, parked] of state) {
				for (const atom of parked) {
					combined.push({ ...atom, meta: { ...atom.meta, sourceId: key } });
				}
			}
			for (const atom of values) {
				const sourceId = metaOf(atom)?.sourceId;
				if (sourceId !== null && sourceId !== undefined && !state.has(String(sourceId))) {
					combined.push(atom);
				}
			}
			input = combined;
			state.clear();
		} else {
			input = lastUnmapped;
		}

		const fn = stepFnOf(step.fn, spec);
		// PHP datum contract for merge: a raw relation locator's entry VALUE is
		// null — its identity travels in provenance (process_datum :1204-1208).
		// The item bridge materializes chain links into values for the locator
		// projections; merge is NOT one of them, and a locator-array value would
		// corrupt its slots ('[object Object]' where the oracle emits '').
		const effectiveInput =
			step.fn === 'parser_helper::merge'
				? input.map((atom) =>
						atom.kind === 'chain'
							? ({ kind: 'scalar', value: null, lang: atom.lang, meta: atom.meta } as MetaValueIR)
							: atom,
					)
				: input;
		const result = fn(effectiveInput, injectStepOptions(step, spec, ctx), ctx);

		if (result.length === 0) {
			// oracle: null result on an id-less step aborts the whole chain.
			if (step.id === undefined || step.id === '') return null;
			continue;
		}
		lastOptions = step.options ?? {};
		if (step.id !== undefined && step.id !== '') {
			state.set(step.id, result);
		} else {
			lastUnmapped = result;
		}
	}

	// End of chain with parked state: combine + re-integrate (oracle :971-998).
	if (state.size > 0) {
		const combined: MetaValueIR[] = [];
		for (const [key, parked] of state) {
			for (const atom of parked) {
				combined.push({ ...atom, meta: { ...atom.meta, sourceId: key } });
			}
		}
		for (const atom of values) {
			const sourceId = metaOf(atom)?.sourceId;
			if (sourceId !== null && sourceId !== undefined && !state.has(String(sourceId))) {
				combined.push(atom);
			}
		}
		return combined;
	}

	return applyDefaultCompletion(lastUnmapped, spec, ctx, lastOptions);
}

/**
 * DEFAULT COMPLETION (oracle :1000-1067): array-valued results are collapsed —
 * column-aware merge when every merge column is covered by an output tipo,
 * else per-lang join with the last step's records_separator.
 */
function applyDefaultCompletion(
	current: MetaValueIR[],
	spec: FieldTransformSpec,
	ctx: ParserContext,
	lastOptions: Record<string, unknown>,
): MetaValueIR[] {
	if (current.length === 0) return current;
	const items = toItems(current);
	const hasArrayValues = items.some(
		(item) =>
			Array.isArray(item.value) &&
			item.value.length > 0 &&
			(typeof item.value[0] === 'string' ||
				(typeof item.value[0] === 'object' && item.value[0] !== null)),
	);
	if (!hasArrayValues) return current;

	const columns = spec.mergeColumns;
	if (columns !== undefined && columns.length > 0 && spec.outputFormat !== 'json') {
		const outputTipos = new Set(items.map((item) => item.tipo).filter(Boolean));
		const allCovered = columns.every((column) => outputTipos.has(column.tipo));
		if (allCovered) {
			const mergeOptions: Record<string, unknown> = { columns, merge: 'string' };
			if (ctx.mainLang) mergeOptions.main_lang = ctx.mainLang;
			const merged = merge(items, mergeOptions, ctx);
			if (merged !== null && merged.length > 0) return itemsToAtoms(merged);
			return current;
		}
	}

	// No columns (or not fully covered): group by lang, flatten array values,
	// join with the last parser's records_separator (json keeps the array).
	const langGroups = new Map<string, ParserItem[]>();
	for (const item of items) {
		const key = item.lang ?? '__nolan__';
		const group = langGroups.get(key);
		if (group === undefined) langGroups.set(key, [item]);
		else group.push(item);
	}
	const separator = (lastOptions.records_separator as string | undefined) ?? ' | ';
	const collapsed: ParserItem[] = [];
	for (const [key, group] of langGroups) {
		// Array entries stay RAW (oracle :1050-1053 spreads item.value verbatim):
		// json output must JSON.stringify locator OBJECTS, not their String()
		// form — coercing here turned dd_relations into '["[object Object]"]'.
		// Scalar values keep the oracle's String() coercion (:1055).
		const flat: unknown[] = [];
		for (const item of group) {
			if (Array.isArray(item.value)) {
				for (const entry of item.value) {
					if (entry !== null && entry !== undefined && entry !== '') flat.push(entry);
				}
			} else if (item.value !== null && item.value !== undefined && item.value !== '') {
				flat.push(String(item.value));
			}
		}
		const first = group[0] as ParserItem;
		collapsed.push({
			...first,
			lang: key === '__nolan__' ? null : key,
			value: spec.outputFormat === 'json' ? flat : flat.join(separator),
		});
	}
	return itemsToAtoms(collapsed);
}

/** Items back to atoms, keeping provenance (item_bridge.fromItems inline twin). */
function itemsToAtoms(items: ParserItem[]): MetaValueIR[] {
	return items.map((item) => {
		const lang = !item.lang || item.lang === 'lg-nolan' ? null : item.lang;
		const meta: ValueMeta = {};
		if (item.id !== null && item.id !== undefined) meta.sourceId = item.id;
		if (item.tipo !== null && item.tipo !== undefined) meta.tipo = item.tipo;
		if (item.section_id !== null && item.section_id !== undefined) meta.sectionId = item.section_id;
		if (item.section_tipo !== null && item.section_tipo !== undefined) {
			meta.sectionTipo = item.section_tipo;
		}
		const raw = item.value;
		const atom: MetaValueIR =
			raw === null ||
			raw === undefined ||
			typeof raw === 'string' ||
			typeof raw === 'number' ||
			typeof raw === 'boolean'
				? { kind: 'scalar', value: raw ?? null, lang }
				: { kind: 'json', value: raw, lang };
		if (Object.keys(meta).length > 0) atom.meta = meta;
		return atom;
	});
}

/**
 * One field's resolved atoms → its ColumnLangValues (the PHASE-1 outcome for
 * one column). The FOUR oracle paths, selected exactly like process_record:
 *
 * 1. parser chain present → runFieldTransform + per-item fan-out;
 * 2. merge columns, no parser, json output → direct fan-out (:467-475);
 * 3. merge columns, no parser → auto merge(columns, merge:'string') (:476-501);
 * 4. neither → per-lang join_items_to_string / int / json (:594-608).
 */
export function fieldValuesToColumn(
	values: MetaValueIR[],
	spec: FieldTransformSpec,
	ctx: ParserContext,
): ColumnLangValues {
	const langValues: ColumnLangValues = new Map();
	if (values.length === 0) return langValues;

	const setLangValue = (lang: string | null | undefined, value: string | null): void => {
		const key = langKeyOf(lang);
		// nolan is stored only when non-null: a nolan null would block the
		// main-lang fallback in the ladder (oracle :614-618).
		if (key !== NOLAN_KEY || value !== null) langValues.set(key, value);
	};

	if (spec.transform.length > 0) {
		const result = runFieldTransform(values, spec, ctx);
		if (result === null) return langValues;
		for (const atom of toItems(result)) {
			setLangValue(atom.lang, formatItemValue(atom.value, spec.outputFormat));
		}
		return langValues;
	}

	// NO-parser paths see the oracle wire shape: a relation/portal group's
	// VALUE is null — the locator lives in the item's provenance fields
	// (PHP datum contract; the bridge materializes links only for the locator
	// parsers). Without this, a bare relation field would join locator objects
	// instead of reproducing the oracle's empty slots.
	const items = toItems(values).map((item, index) =>
		values[index]?.kind === 'chain' ? { ...item, value: null } : item,
	);

	if (spec.mergeColumns !== undefined && spec.mergeColumns.length > 0) {
		if (spec.outputFormat === 'json') {
			// json + columns: fan out raw values; stringify preserves structure.
			for (const item of items) {
				if (item.value === null || item.value === undefined) continue;
				const value = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
				langValues.set(langKeyOf(item.lang), value);
			}
			return langValues;
		}
		const mergeOptions: Record<string, unknown> = { columns: spec.mergeColumns, merge: 'string' };
		if (ctx.mainLang) mergeOptions.main_lang = ctx.mainLang;
		const merged = merge(items, mergeOptions, ctx);
		if (merged !== null) {
			for (const item of merged) {
				setLangValue(item.lang, formatItemValue(item.value, spec.outputFormat));
			}
		}
		return langValues;
	}

	// Standard mode: the oracle parsed per lang group; without a parser the
	// grouping only decides which lang key each joined value lands under.
	const langGroups = new Map<string | null, ParserItem[]>();
	for (const item of items) {
		const key = !item.lang || item.lang === 'lg-nolan' ? null : item.lang;
		const group = langGroups.get(key);
		if (group === undefined) langGroups.set(key, [item]);
		else group.push(item);
	}
	for (const [lang, group] of langGroups) {
		let columnValue: string | null;
		if (spec.outputFormat === 'json') {
			columnValue = JSON.stringify(group.flatMap((item) => item.value));
		} else if (spec.outputFormat === 'int') {
			const parsed = String(Number.parseInt(String(group[0]?.value), 10));
			columnValue = parsed === 'NaN' ? '0' : parsed;
		} else {
			columnValue = joinItemsToString(group);
		}
		setLangValue(lang, columnValue);
	}
	return langValues;
}
