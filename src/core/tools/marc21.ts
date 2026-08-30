/**
 * MARC21 / ISO 2709 record parser (PHP tool_import_marc21 uses the bundled PEAR
 * File_MARC; this is a from-scratch port — no 3rd-party lib, per the project
 * mandate). Parses the transmission format into fields + subfields so the import
 * mapping (marc21_map config → component tipos) can consume them.
 *
 * ISO 2709 layout: a 24-byte leader (record length 0–4, base address of data
 * 12–16), a directory of 12-byte entries (tag[3] + length[4] + start[5]) ending
 * with a field terminator, then the variable fields. Control fields (<010) have
 * no indicators/subfields; data fields carry 2 indicators + subfields delimited
 * by the subfield separator, each starting with a 1-char code.
 */

import { DedaloError } from '../errors/index.ts';

const FIELD_TERMINATOR = 0x1e;
const SUBFIELD_DELIMITER = 0x1f;
const RECORD_TERMINATOR = 0x1d;

export interface MarcSubfield {
	code: string;
	value: string;
}

export interface MarcField {
	tag: string;
	/** Control fields (tag < '010') carry a raw value and no subfields. */
	value?: string;
	indicator1?: string;
	indicator2?: string;
	subfields?: MarcSubfield[];
}

export interface MarcRecord {
	leader: string;
	fields: MarcField[];
}

/** Split a raw MARC21 stream into individual record byte-strings (record terminator). */
export function splitMarcRecords(bytes: Uint8Array): Uint8Array[] {
	const records: Uint8Array[] = [];
	let start = 0;
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === RECORD_TERMINATOR) {
			records.push(bytes.subarray(start, i + 1));
			start = i + 1;
		}
	}
	if (start < bytes.length) records.push(bytes.subarray(start));
	return records.filter((r) => r.length > 24);
}

/**
 * The leader is ASCII by the standard; windows-1252 is the total single-byte
 * reading of it, so a corrupt leader still yields 24 characters to inspect
 * instead of throwing inside the decoder before we can say what is wrong.
 */
const leaderDecoder = new TextDecoder('windows-1252');
/** Record content: STRICT — an invalid sequence must be reported, never substituted. */
const unicodeDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Which character encoding a record DECLARES, from leader position 09
 * (MARC21 "character coding scheme"): 'a' = Unicode/UTF-8, blank = MARC-8.
 *
 * DATA-09 (2026-08-26 audit): this module decoded EVERY record as UTF-8 with
 * `fatal:false` and never read position 09. A MARC-8 record — what most library
 * systems still export — decodes clean in its ASCII range and turns every
 * diacritic into U+FFFD, so `Ripollès` was imported as `Ripoll<FFFD>s` with a
 * green report. MARC-8 is not a single-byte encoding (it has combining
 * sequences and G0/G1 charset escapes), so there is no honest conversion to
 * make here: a record that declares a non-Unicode scheme AND carries non-ASCII
 * bytes is REFUSED, by record, into the door's error list. Its ASCII-only
 * siblings import exactly as before — the refusal is the smallest one that
 * cannot corrupt a value.
 */
function decodeRecordBytes(bytes: Uint8Array, leader: string): (part: Uint8Array) => string {
	const unicode = leader[9] === 'a';
	if (!unicode) {
		for (const byte of bytes) {
			if (byte >= 0x80) {
				throw new DedaloError('request.invalid_data', {
					message: `MARC record declares a non-Unicode character coding scheme (leader position 09 is '${leader[9] === ' ' ? 'blank, i.e. MARC-8' : leader[9]}') and carries non-ASCII bytes. Convert the file to UTF-8 (MARC-8 → Unicode) and import it again; nothing was read from this record.`,
					publicMessage:
						'MARC record is not UTF-8 (leader position 09 does not declare Unicode) and carries non-ASCII bytes. Convert the file to UTF-8 and import it again.',
				});
			}
		}
	}
	return (part: Uint8Array): string => {
		try {
			return unicodeDecoder.decode(part);
		} catch {
			throw new DedaloError('request.invalid_data', {
				message:
					'MARC record declares Unicode but is not valid UTF-8. Nothing was read from this record.',
				publicMessage:
					'MARC record declares Unicode but is not valid UTF-8. Nothing was read from this record.',
			});
		}
	};
}

/** Parse one ISO 2709 record into its leader + fields. Throws on a malformed record. */
export function parseMarcRecord(bytes: Uint8Array): MarcRecord {
	if (bytes.length < 24) {
		throw new DedaloError('request.invalid_data', {
			message: 'MARC record shorter than the 24-byte leader',
		});
	}
	const leader = leaderDecoder.decode(bytes.subarray(0, 24));
	const decode = decodeRecordBytes(bytes, leader);
	const baseAddress = Number.parseInt(leader.slice(12, 17), 10);
	if (!Number.isFinite(baseAddress) || baseAddress <= 24 || baseAddress > bytes.length) {
		throw new DedaloError('request.invalid_data', {
			message: 'MARC leader has an invalid base address of data',
		});
	}

	// Directory: 24 .. baseAddress-1, 12 bytes per entry, ends at a field terminator.
	const directoryBytes = bytes.subarray(24, baseAddress - 1);
	const fields: MarcField[] = [];
	for (let offset = 0; offset + 12 <= directoryBytes.length; offset += 12) {
		// The directory is structural ASCII (tag + two numbers); read it with the
		// total single-byte decoder so a corrupt entry is SKIPPED below, not thrown.
		const entry = leaderDecoder.decode(directoryBytes.subarray(offset, offset + 12));
		const tag = entry.slice(0, 3);
		const length = Number.parseInt(entry.slice(3, 7), 10);
		const startPos = Number.parseInt(entry.slice(7, 12), 10);
		if (!/^\d{3}$/.test(tag) || !Number.isFinite(length) || !Number.isFinite(startPos)) continue;

		const from = baseAddress + startPos;
		const to = from + length;
		if (to > bytes.length) continue;
		// Drop the trailing field terminator.
		let fieldBytes = bytes.subarray(from, to);
		if (fieldBytes.length > 0 && fieldBytes[fieldBytes.length - 1] === FIELD_TERMINATOR) {
			fieldBytes = fieldBytes.subarray(0, fieldBytes.length - 1);
		}
		fields.push(parseField(tag, fieldBytes, decode));
	}
	return { leader, fields };
}

function parseField(
	tag: string,
	bytes: Uint8Array,
	decode: (part: Uint8Array) => string,
): MarcField {
	// Control fields (00X) have no indicators or subfields.
	if (tag < '010') {
		return { tag, value: decode(bytes) };
	}
	const indicator1 = bytes.length > 0 ? decode(bytes.subarray(0, 1)) : ' ';
	const indicator2 = bytes.length > 1 ? decode(bytes.subarray(1, 2)) : ' ';
	const subfields: MarcSubfield[] = [];
	// Subfields start after the 2 indicators; each begins with the delimiter + code.
	const body = bytes.subarray(2);
	let start = 0;
	// Find each delimiter, split into (code, value) chunks.
	const chunks: Uint8Array[] = [];
	for (let i = 0; i < body.length; i++) {
		if (body[i] === SUBFIELD_DELIMITER) {
			if (i > start) chunks.push(body.subarray(start, i));
			start = i + 1;
		}
	}
	if (start < body.length) chunks.push(body.subarray(start));
	for (const chunk of chunks) {
		if (chunk.length === 0) continue;
		const code = decode(chunk.subarray(0, 1));
		const value = decode(chunk.subarray(1));
		subfields.push({ code, value });
	}
	return { tag, indicator1, indicator2, subfields };
}

/** A marc21_map entry (PHP config->main[]): which MARC field/subfield → component. */
export interface MarcMapEntry {
	component_tipo: string;
	/** MARC tag, e.g. '245'. */
	field: string;
	/** Subfield code; omit to join ALL subfields with subfield_separator. */
	subfield?: string;
	subfield_separator?: string;
	/** Guard: only extract when this subfield equals this value (PHP marc21_conditional). */
	marc21_conditional?: { subfield: string; value: string };
}

/** A single field/subfield spec (field_to_section_id.value or a map entry). */
export interface MarcValueSpec {
	field: string;
	subfield?: string;
	subfield_separator?: string;
	marc21_conditional?: { subfield: string; value: string };
}

/**
 * Extract the value(s) for a field/subfield spec from a record (PHP get_value).
 * One value per matching field occurrence: a control field's raw value, the named
 * subfield's value(s), or all subfields joined by subfield_separator. The
 * conditional guard skips occurrences whose guard subfield ≠ the expected value.
 */
export function extractMarcValues(record: MarcRecord, spec: MarcValueSpec): string[] {
	const separator = spec.subfield_separator ?? ' ';
	const values: string[] = [];
	for (const field of record.fields) {
		if (field.tag !== spec.field) continue;
		const conditional = spec.marc21_conditional;
		if (conditional !== undefined) {
			const guard = field.subfields?.find((s) => s.code === conditional.subfield);
			if (guard === undefined || guard.value !== conditional.value) continue;
		}
		if (field.value !== undefined) {
			values.push(field.value);
			continue;
		}
		const subfields = field.subfields ?? [];
		if (spec.subfield !== undefined) {
			for (const s of subfields) if (s.code === spec.subfield) values.push(s.value);
		} else {
			values.push(subfields.map((s) => s.value).join(separator));
		}
	}
	return values.filter((v) => v !== '');
}

/**
 * The rows a record maps to: the identifier the record CARRIES, plus the
 * per-component values.
 */
export interface MarcMappedRecord {
	/**
	 * The `field_to_section_id` value, trimmed but otherwise VERBATIM — a library
	 * control number ('.b12345678', 'ocm12345678', '42'). It is NOT an address:
	 * the tool door resolves it against the section's code component
	 * (tools/tool_import_marc21/server/index.ts, `resolveImportCodes`).
	 *
	 * Null when the config names no id field, or this record's id field is absent
	 * or blank — both mean "this record names no identifier", which the door
	 * reads as "create".
	 */
	code: string | null;
	fields: { component_tipo: string; values: string[] }[];
}

/** `907` / `907$a` — how a refusal names the field it read the identifier from. */
export function marcSpecLabel(spec: MarcValueSpec): string {
	return spec.subfield === undefined ? spec.field : `${spec.field}$${spec.subfield}`;
}

/**
 * Apply a marc21_map to a parsed record → the per-component values + the
 * identifier the record carries (PHP process_marc21_field_mappings, plus the
 * READ half of resolve_target_section). Pure over the record + map: it reaches
 * no database, and therefore decides NO record address.
 *
 * DATA-08, CLOSED HERE AND AT THE DOOR (2026-08-30): AN IMPORTED EXTERNAL
 * IDENTIFIER IS NOT A RECORD ADDRESS. This function used to read the id cell
 * with a record-id grammar and hand the number back as `sectionId`, which the
 * tool passed to the shared executor as the record to write. A MARC control
 * number of '42' therefore wrote onto record 42 of the target section —
 * whatever curated record already lived there — and when no such row existed,
 * `saveComponentData`'s upsert branch (save_component.ts :1064, PHP set_dato
 * parity) MINTED one at that meaningless id. Both outcomes were reported as
 * success. There was no existence check and no code lookup anywhere in the run.
 *
 * The frozen tool never did this: `resolve_target_section`
 * (class.tool_import_marc21.php :393-419) SEARCHED the value as a code
 * (`get_section_id_from_code` :1202 — an SQO `=<code>` over the component the
 * `id` map entry's ddo_map names) and created a record when the search found
 * none. The identifier was an identifier at both ends; only the port turned it
 * into an address.
 *
 * So the value now travels as `code` and the ADDRESS DECISION LIVES AT THE
 * DOOR, where the database is reachable — this module stays the leaf ISO 2709
 * parser whose only dependency is the error registry (an edge to the search
 * layer would make `parseMarc` unloadable whenever an unrelated config module
 * fails to parse; measured 2026-08-27).
 *
 * WITH THE ADDRESS GONE, SO IS THE ID GRAMMAR. `parseRecordIdCell` lived here
 * only to decide that address, and the DATA-22 refusal beside it ('12abc' →
 * record 12, the truncation corner) existed only because a cast happened at
 * all: nothing here casts any more, so both are deleted rather than kept
 * unused. The digits grammar remains at the CSV door
 * (src/core/tools/import_csv.ts `parseRecordIdCell`), where the `section_id`
 * COLUMN genuinely is a Dédalo address — that door is unchanged.
 */
export function applyMarcMap(
	record: MarcRecord,
	map: readonly MarcMapEntry[],
	fieldToSectionId?: MarcValueSpec,
): MarcMappedRecord {
	let code: string | null = null;
	if (fieldToSectionId !== undefined) {
		// Whitespace is the transmission format's padding (MARC pads its fixed
		// fields), never part of the identifier.
		const raw = (extractMarcValues(record, fieldToSectionId)[0] ?? '').trim();
		if (raw !== '') code = raw;
	}
	const fields = map
		.map((entry) => ({
			component_tipo: entry.component_tipo,
			values: extractMarcValues(record, entry),
		}))
		.filter((f) => f.values.length > 0);
	return { code, fields };
}

/** Parse a full MARC21 stream into records (skips malformed ones, collecting errors). */
export function parseMarc(bytes: Uint8Array): { records: MarcRecord[]; errors: string[] } {
	const records: MarcRecord[] = [];
	const errors: string[] = [];
	for (const [index, raw] of splitMarcRecords(bytes).entries()) {
		try {
			records.push(parseMarcRecord(raw));
		} catch (error) {
			errors.push(`record ${index}: ${(error as Error).message}`);
		}
	}
	return { records, errors };
}
