/**
 * defaultPublicationValue — stored matrix data slice → typed ValueIR atoms
 * (DIFFUSION_SPEC §6, DIFFUSION_PLAN D3-P1 "component primitive").
 *
 * The TS successor of component_common::get_diffusion_data
 * (PHP class.component_common.php:3256-3368) for NON-relation models: typed
 * values straight from the stored slice, no formatting, no lang collapsing —
 * the transform/projection stages own all shaping. Relation-family models
 * never reach this module: the resolver walks their locators into chains.
 *
 * Per-model deviations ported from the PHP overrides:
 * - component_text_area (:2441-2453): html_entity_decode on every value;
 * - component_iri (:406-446): ONE atom whose value is the {iri,title} entry
 *   array with lang stripped (parser_iri::flat consumes exactly that);
 * - component_geolocation (:336-358): per-point `id` stripped;
 * - component_date / geolocation: typed 'date'/'geo' atoms (record_ir.ts);
 * - component_section_id: the record's own section_id scalar (pseudo-column).
 *
 * DESIGN NOTE (report-worthy): the per-model dispatch lives HERE as a switch
 * over the descriptor model — src/core/components/{types,registry}.ts stay
 * untouched. The optional `resolvePublicationValue` descriptor field the spec
 * sketches (§6) is not needed for P1: every model resolves from descriptor
 * metadata (column + model name) alone, so we prefer zero core edits.
 */

import { config } from '../../config/config.ts';
import { mediaTypeOf } from '../../core/concepts/media.ts';
import type { MatrixRecord } from '../../core/db/matrix.ts';
import { readComponentItems } from '../../core/resolve/component_data.ts';
import type { MetaValueIR, ValueMeta } from '../parsers/types.ts';

/** A stored literal item ({id?, value, lang?} — component_data.ts contract). */
interface StoredItem {
	id?: unknown;
	value?: unknown;
	lang?: string | null;
	[extra: string]: unknown;
}

/** Where the value was read from — stamped as parser provenance. */
export interface ValueProvenance {
	/** ddo handle ('a','b',…) parser patterns reference — ResolveStep.ddoId. */
	sourceId?: string;
	/** Source component tipo (merge groups by it). */
	tipo: string;
	/** Set ONLY for values read from linked records (relation provenance) —
	 * the oracle datum carried section identity only on relation-derived
	 * groups, and merge/text_format grouping depends on that distinction. */
	sectionId?: number | string;
	sectionTipo?: string;
}

/** Build the meta bag off a provenance descriptor. */
function metaFrom(provenance: ValueProvenance): ValueMeta {
	const meta: ValueMeta = { tipo: provenance.tipo };
	if (provenance.sourceId !== undefined) meta.sourceId = provenance.sourceId;
	if (provenance.sectionId !== undefined) meta.sectionId = provenance.sectionId;
	if (provenance.sectionTipo !== undefined) meta.sectionTipo = provenance.sectionTipo;
	return meta;
}

/** Stored lang → atom lang (null and 'lg-nolan' are both language-independent). */
function atomLangOf(lang: string | null | undefined): string | null {
	return !lang || lang === 'lg-nolan' ? null : lang;
}

/** Wrap a raw value as a scalar (primitives) or json (structures) atom. */
function rawToAtom(raw: unknown, lang: string | null, meta: ValueMeta): MetaValueIR {
	const atom: MetaValueIR =
		raw === null ||
		raw === undefined ||
		typeof raw === 'string' ||
		typeof raw === 'number' ||
		typeof raw === 'boolean'
			? { kind: 'scalar', value: raw ?? null, lang }
			: { kind: 'json', value: raw, lang };
	atom.meta = meta;
	return atom;
}

/**
 * Minimal html_entity_decode twin for the component_text_area override —
 * named core entities + numeric (decimal/hex) references, like PHP's default
 * ENT_QUOTES|ENT_HTML401 table for the entities editor content actually uses.
 */
export function decodeHtmlEntities(input: string): string {
	const named: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: ' ',
	};
	return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (full, entity: string) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const code = Number.parseInt(entity.slice(2), 16);
			return Number.isNaN(code) ? full : String.fromCodePoint(code);
		}
		if (entity.startsWith('#')) {
			const code = Number.parseInt(entity.slice(1), 10);
			return Number.isNaN(code) ? full : String.fromCodePoint(code);
		}
		return named[entity] ?? full;
	});
}

/**
 * Resolve one NON-relation component's publication atoms from a loaded matrix
 * record. `model` must be the canonical (alias-resolved) descriptor model.
 * Empty slice → empty array (the oracle's "no data").
 */
export function defaultPublicationValue(
	record: MatrixRecord,
	componentTipo: string,
	model: string,
	provenance: ValueProvenance,
): MetaValueIR[] {
	const meta = metaFrom(provenance);

	// component_section_id reads the structural column, not a JSONB slice.
	if (model === 'component_section_id') {
		return [rawToAtom(record.section_id, null, meta)];
	}

	const items = (readComponentItems(record, componentTipo, model) ?? []) as StoredItem[];
	if (items.length === 0) return [];

	// MEDIA models publish their FILE URL, not the stored dato object
	// (component_media_common::get_diffusion_data :453-580): external source
	// wins; else the DEFAULT quality + type extension entry of the stored
	// files_info must exist (file_exist), and the value is its public URL
	// (get_url → DEDALO_MEDIA_URL + grammar path == the stored file_path).
	// No matching published file → NO value (the PHP null dd-object outcome).
	const mediaSpec = mediaTypeOf(model);
	if (mediaSpec !== null) {
		const first = items[0] as StoredItem & {
			external_source?: unknown;
			files_info?: {
				quality?: string;
				extension?: string;
				file_exist?: boolean;
				file_path?: string;
			}[];
		};
		if (typeof first.external_source === 'string' && first.external_source !== '') {
			return [rawToAtom(first.external_source, null, meta)];
		}
		const found = (first.files_info ?? []).find(
			(entry) =>
				entry.quality === mediaSpec.defaultQuality &&
				entry.extension === mediaSpec.defaultExtension &&
				entry.file_exist === true &&
				typeof entry.file_path === 'string' &&
				entry.file_path !== '',
		);
		if (found === undefined) return [];
		return [rawToAtom(`/dedalo/${config.mediaDir}${found.file_path}`, null, meta)];
	}

	switch (model) {
		case 'component_iri': {
			// PHP: one object whose value is the entry array, lang stripped.
			const entries = items.map((item) => {
				const { lang: _stripped, ...clone } = item;
				return clone as Record<string, unknown>;
			});
			return [rawToAtom(entries, null, meta)];
		}

		case 'component_geolocation': {
			// PHP strips the editor point id; atoms are typed 'geo'.
			return items.map((item) => {
				const raw = item.value ?? item;
				let value = raw;
				if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
					const { id: _stripped, ...clone } = raw as Record<string, unknown>;
					value = clone;
				}
				return { kind: 'geo', value, lang: null, meta } as MetaValueIR;
			});
		}

		case 'component_date': {
			return items.map(
				(item) => ({ kind: 'date', value: item.value ?? item, lang: null, meta }) as MetaValueIR,
			);
		}

		case 'component_text_area': {
			return items.map((item) => {
				const raw = item.value;
				const decoded = typeof raw === 'string' ? decodeHtmlEntities(raw) : (raw ?? null);
				return rawToAtom(decoded, atomLangOf(item.lang), meta);
			});
		}

		default: {
			// Base default (:3330-3364): one atom per stored entry, entry lang
			// preserved, value = entry.value ?? entry (media/info/json slices
			// store bare objects without a .value wrapper).
			return items.map((item) => {
				const raw =
					item !== null && typeof item === 'object' && 'value' in item ? item.value : item;
				return rawToAtom(raw ?? null, atomLangOf(item.lang), meta);
			});
		}
	}
}
