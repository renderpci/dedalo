/**
 * INT-CLEAN COPY ROWS — the record-address law (WC-2026-08-10-section-id-int-canonical:
 * "writers mint int") applied to COPY text a door loads into a matrix table OUTSIDE the
 * engine's own writers: the install seed compiler's sources (seed_build.ts — langs, the
 * hierarchy registry, the ontology packages, matrix_dd) and a thesaurus import
 * (hierarchy_import.ts). Those files were exported by PHP-era installations and carry the
 * repealed STRING form (`"section_id": "2"`); loaded verbatim, every fresh install and every
 * imported thesaurus was born with the residue the sweep (scripts/migrate_section_id_locators.ts)
 * exists to remove, and with no `section_id_int_normalize` marker
 * (WC-2026-10-21-seed-and-thesaurus-int-clean).
 *
 * ONE RULE, ONE KERNEL: every jsonb field of a row goes through the sweep's own kernel
 * (update/transform/section_id_intify.ts intifySectionIdsInValue — the shared conversion
 * vectors), re-encoded by THE matrix serializer (db/json_codec.ts encodeForJsonb) and the
 * COPY codec (db/copy_text.ts). Nothing is purged (no purge class) and no external tipo is
 * assumed: a CONVERTIBLE string converts on any tipo (the kernel's S0 rule — true remote ids
 * are never convertible), everything else stays verbatim.
 *
 * NEVER ALTERS ANYTHING ELSE. A field is rewritten only when the kernel converted something
 * in it AND every number token in its text survives a JavaScript round trip byte for byte:
 * a `40.0` (jsonb keeps the scale) or a digit run beyond 2^53 would come back as `40` or a
 * different integer, so such a field is KEPT VERBATIM and counted (`kept`) — a residue the
 * caller's census reports, never a silently changed value. Rows with no string-typed address
 * key are passed through untouched (no parse).
 *
 * PURE (no I/O): a line codec plus a streaming line transform over byte chunks.
 */

import { decodeCopyField, encodeCopyField } from '../db/copy_text.ts';
import { encodeForJsonb } from '../db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS } from '../db/matrix.ts';
import { intifySectionIdsInValue } from '../update/transform/section_id_intify.ts';

/** A string-typed address key in jsonb text (`"section_id": "…"`, `_key`, `parent_`). */
const STRING_ADDRESS = /"(?:section_id|section_id_key|parent_section_id)":\s*"/;

/** The kernel context of a load: no externality assumed, nothing purged (see the header). */
const LOAD_CONTEXT = Object.freeze({ externalTipos: new Set<string>() });

/** What one load converted. */
export interface CopySectionIdTally {
	/** Rows rewritten (at least one address converted). */
	rows: number;
	/** string → int conversions. */
	converted: number;
	/** Fields that carried a convertible address but were kept verbatim (a lossy number shape). */
	kept: number;
}

export function newCopySectionIdTally(): CopySectionIdTally {
	return { rows: 0, converted: 0, kept: 0 };
}

/** The indexes of the matrix jsonb columns in a COPY column list. */
export function jsonbColumnIndexes(columns: readonly string[]): number[] {
	const jsonb = new Set<string>(MATRIX_JSONB_COLUMNS);
	return columns.flatMap((column, index) => (jsonb.has(column) ? [index] : []));
}

/**
 * True when every NUMBER token of `json` (outside its strings) is what JavaScript
 * prints for it — i.e. JSON.parse + JSON.stringify returns that token unchanged.
 */
export function numbersSurviveJs(json: string): boolean {
	let index = 0;
	while (index < json.length) {
		const next = scanToken(json, index);
		if (next === null) return false;
		index = next;
	}
	return true;
}

/** Past the token at `index` (a string, a number, or one other character) — null for a lossy number. */
function scanToken(json: string, index: number): number | null {
	const char = json[index] as string;
	if (char === '"') return skipString(json, index + 1);
	if (char !== '-' && !(char >= '0' && char <= '9')) return index + 1;
	const end = numberEnd(json, index);
	const token = json.slice(index, end);
	return String(Number(token)) === token ? end : null;
}

/** The index just past the closing quote of a string whose body starts at `from`. */
function skipString(json: string, from: number): number {
	let index = from;
	while (index < json.length) {
		const char = json[index];
		if (char === '\\') index += 2;
		else if (char === '"') return index + 1;
		else index++;
	}
	return index;
}

function numberEnd(json: string, from: number): number {
	let index = from + 1;
	while (index < json.length && /[0-9.eE+-]/.test(json[index] as string)) index++;
	return index;
}

/** One jsonb field (raw COPY text) canonicalized, or null when it stays as it is. */
function canonicalField(raw: string, tally: CopySectionIdTally): string | null {
	if (!STRING_ADDRESS.test(raw)) return null;
	const text = decodeCopyField(raw);
	if (text === null) return null;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null; // not JSON: the load refuses it on its own, verbatim
	}
	const result = intifySectionIdsInValue(value, LOAD_CONTEXT);
	if (!result.changed) return null;
	if (!numbersSurviveJs(text)) {
		tally.kept++;
		return null;
	}
	tally.converted += result.converted;
	return encodeCopyField(encodeForJsonb(value));
}

/**
 * One COPY row (a line WITHOUT its newline) with every convertible record address of its
 * jsonb fields (`jsonbIndexes`) in the int form — the same line when nothing converts.
 */
export function canonicalCopyRow(
	line: string,
	jsonbIndexes: readonly number[],
	tally: CopySectionIdTally,
): string {
	if (!STRING_ADDRESS.test(line)) return line;
	const fields = line.split('\t');
	let changed = false;
	for (const index of jsonbIndexes) {
		const raw = fields[index];
		if (raw === undefined) continue;
		const canonical = canonicalField(raw, tally);
		if (canonical === null) continue;
		fields[index] = canonical;
		changed = true;
	}
	if (!changed) return line;
	tally.rows++;
	return fields.join('\t');
}

/**
 * STREAMING: COPY text bytes in, the same rows canonicalized out, every row
 * newline-terminated (a last row without its newline gets one). Memory is one
 * chunk plus one partial row — never the whole file.
 */
export async function* canonicalCopyChunks(
	source: AsyncIterable<Uint8Array>,
	jsonbIndexes: readonly number[],
	tally: CopySectionIdTally,
): AsyncGenerator<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let pending = '';
	for await (const chunk of source) {
		pending += decoder.decode(chunk, { stream: true });
		const cut = pending.lastIndexOf('\n');
		if (cut === -1) continue;
		const complete = pending.slice(0, cut);
		pending = pending.slice(cut + 1);
		const rows = complete.split('\n').map((line) => canonicalCopyRow(line, jsonbIndexes, tally));
		yield encoder.encode(`${rows.join('\n')}\n`);
	}
	pending += decoder.decode();
	if (pending !== '') yield encoder.encode(`${canonicalCopyRow(pending, jsonbIndexes, tally)}\n`);
}
