/**
 * Runtime parser contract (DIFFUSION_SPEC §5, DIFFUSION_PLAN D3-P1).
 *
 * The community compatibility surface of diffusion is the set of
 * `"class::method"` fn names stored in institution ontologies. At plan-compile
 * time those names SPLIT: rewriters are consumed into plan structure and never
 * execute, while the survivors here are genuine PURE value transforms run by
 * the record pipeline: `ValueIR[] in → ValueIR[] out`, no I/O, no clock, no DB.
 * Relation terms are prefetched by the resolver into chain links, so nothing
 * in this subtree may ever import from core/db or be async.
 */

import type { ValueIR } from '../resolve/record_ir.ts';

/** Per-run language configuration handed to every runtime parser. */
export interface ParserContext {
	/** Target output languages (old engine langs_config.langs). */
	langs: string[];
	/** Fallback language (old engine langs_config.main_lang), null = none. */
	mainLang: string | null;
}

/** A runtime parser: pure transform over typed value atoms. Empty array = "no data" (the oracle's null). */
export type RuntimeParserFn = (
	values: ValueIR[],
	options: Record<string, unknown>,
	ctx: ParserContext,
) => ValueIR[];

/**
 * Provenance the resolver stamps on atoms (as an extra `meta` property) so
 * parsers can zip and group values exactly like the old engine did with its
 * data_item fields. record_ir.ts deliberately does not know about this bag —
 * it is a parser-subsystem contract, invisible to projection and writers.
 */
export interface ValueMeta {
	/** The ddo placeholder id ('a','b',…) or dataframe id — oracle data_item.id. */
	sourceId?: string | number | null;
	/** Source component tipo — the column identity merge() groups by. */
	tipo?: string | null;
	/** Originating record section_id (relation/portal provenance). */
	sectionId?: string | number | null;
	/** Originating record section_tipo. */
	sectionTipo?: string | null;
}

/** A ValueIR atom possibly carrying parser provenance. */
export type MetaValueIR = ValueIR & { meta?: ValueMeta };

/**
 * The old engine's data_item working shape, used INSIDE parser bodies only.
 * Keeping the oracle field names (id/tipo/lang/section_id/section_tipo) makes
 * every ported body line-diffable against the old engine for parity review;
 * item_bridge.ts converts to/from ValueIR at the boundary.
 */
export interface ParserItem {
	id: string | number | null;
	value: unknown;
	tipo: string | null;
	lang: string | null;
	section_id: string | number | null;
	section_tipo: string | null;
}

/** An oracle-shaped parser body; null = "no data" (wrapped to [] by the bridge). */
export type ItemParserFn = (
	items: ParserItem[],
	options: Record<string, unknown>,
	ctx: ParserContext,
) => ParserItem[] | null;
