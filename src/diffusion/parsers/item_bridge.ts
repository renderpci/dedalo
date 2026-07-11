/**
 * ValueIR ⇄ ParserItem bridge (DIFFUSION_SPEC §5).
 *
 * The parity strategy for the ~2 dozen runtime parsers is: keep each ported
 * body structurally identical to the old engine (oracle
 * diffusion/api/v1/lib/parsers/*), which operated on `data_item` objects.
 * This module is the ONLY place that knows how the oracle shape maps onto
 * typed ValueIR atoms:
 *
 * - scalar/json/date/geo atoms → item.value verbatim, lang preserved;
 * - chain atoms → item.value becomes the oracle locator array
 *   ({section_tipo, section_id} per ResolvedLink) so the locator projections
 *   (get_section_id & co) run their oracle logic unchanged;
 * - the resolver-stamped ValueMeta bag ⇄ the oracle data_item fields
 *   (id/tipo/section_id/section_tipo).
 *
 * Outputs never contain chains: every parser result is a scalar or a json
 * atom, so valueIrToString()'s "unprojected chain" tripwire stays meaningful.
 */

import type { ValueIR } from '../resolve/record_ir.ts';
import type { ItemParserFn, MetaValueIR, ParserItem, RuntimeParserFn, ValueMeta } from './types.ts';

/** Read the optional provenance bag off an atom. */
function metaOf(value: ValueIR): ValueMeta | undefined {
	return (value as MetaValueIR).meta;
}

/** ValueIR[] → oracle-shaped items the ported parser bodies consume. */
export function toItems(values: ValueIR[]): ParserItem[] {
	return values.map((atom) => {
		const meta = metaOf(atom);
		const base = {
			id: meta?.sourceId ?? null,
			tipo: meta?.tipo ?? null,
			lang: atom.lang,
			section_id: meta?.sectionId ?? null,
			section_tipo: meta?.sectionTipo ?? null,
		};
		if (atom.kind === 'chain') {
			// Chains arrive fully resolved; project each link down to the oracle
			// locator shape the old parser bodies expect. Terms are prefetched on
			// the links but none of the surviving runtime parsers reads them
			// (term-consuming fns like parser_locator::parents are rewriters).
			return {
				...base,
				value: atom.links.map((link) => ({
					section_tipo: link.sectionTipo,
					section_id: link.sectionId,
				})),
			};
		}
		return { ...base, value: atom.value };
	});
}

/** Build the meta bag from an item's oracle fields; undefined when empty. */
function metaFromItem(item: ParserItem): ValueMeta | undefined {
	const meta: ValueMeta = {};
	if (item.id !== null && item.id !== undefined) meta.sourceId = item.id;
	if (item.tipo !== null && item.tipo !== undefined) meta.tipo = item.tipo;
	if (item.section_id !== null && item.section_id !== undefined) meta.sectionId = item.section_id;
	if (item.section_tipo !== null && item.section_tipo !== undefined) {
		meta.sectionTipo = item.section_tipo;
	}
	return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Oracle-shaped results → ValueIR[]. Primitives become scalar atoms; arrays
 * and objects become json atoms (the projection layer stringifies them).
 * The oracle's 'lg-nolan' and null both mean language-independent → lang null.
 */
export function fromItems(items: ParserItem[]): ValueIR[] {
	return items.map((item) => {
		const lang = !item.lang || item.lang === 'lg-nolan' ? null : item.lang;
		const meta = metaFromItem(item);
		const raw = item.value;
		const atom: MetaValueIR =
			raw === null ||
			raw === undefined ||
			typeof raw === 'string' ||
			typeof raw === 'number' ||
			typeof raw === 'boolean'
				? { kind: 'scalar', value: raw ?? null, lang }
				: { kind: 'json', value: raw, lang };
		if (meta) atom.meta = meta;
		return atom;
	});
}

/** Wrap an oracle-shaped body as a RuntimeParserFn (oracle null → empty array). */
export function asRuntimeParser(fn: ItemParserFn): RuntimeParserFn {
	return (values, options, ctx) => {
		const out = fn(toItems(values), options ?? {}, ctx);
		return out === null || out.length === 0 ? [] : fromItems(out);
	};
}

/**
 * Oracle stringify_value (parser_text.ts:330-341): the shared scalar-to-string
 * coercion used by the text parsers. Arrays join with ", ", objects JSON.
 */
export function stringifyValue(val: unknown): string {
	if (typeof val === 'string') return val;
	if (typeof val === 'number') return String(val);
	if (typeof val === 'boolean') return val ? 'true' : 'false';
	if (Array.isArray(val)) {
		return val.map((v) => stringifyValue(v)).join(', ');
	}
	if (typeof val === 'object' && val !== null) {
		return JSON.stringify(val);
	}
	return '';
}
