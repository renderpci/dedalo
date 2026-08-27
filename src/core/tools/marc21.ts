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

/** The rows a record maps to: {section_id? (from field_to_section_id), fields:[{tipo, values}]}. */
export interface MarcMappedRecord {
	sectionId: number | null;
	fields: { component_tipo: string; values: string[] }[];
}

/**
 * The record id an id cell names, or null when it names none: A RUN OF DECIMAL
 * DIGITS, bounded by `Number.isSafeInteger`. The cell must arrive trimmed.
 *
 * SECOND IMPLEMENTATION OF ONE LAW, ON PURPOSE — the CSV door's
 * `parseRecordIdCell` (src/core/tools/import_csv.ts) is the same four lines, and
 * importing it here is the wrong trade TODAY: this module is a leaf ISO 2709
 * parser whose only dependency is the error registry, while the CSV planner
 * pulls the conform facets, the ontology resolver and through them the config
 * layer. That edge makes `parseMarc` unloadable whenever an unrelated config
 * module fails to parse — measured, not imagined, while this fix was being
 * written. The durable fix is the `src/core/db/sql_identifier.ts` precedent (and
 * `phpTrim`'s standing debt at this same door): ONE leaf module both doors
 * import. Until it exists the two copies are held equal by EXECUTION, not by
 * hope — `test/unit/csv_parser_conformance_native.test.ts` runs both over the
 * same corpus and asserts 0 divergences, and asserts the corpus distinguishes
 * the grammar from the reader it replaced.
 */
export function parseRecordIdCell(cell: string): number | null {
	// Grammar FIRST, arithmetic second: isSafeInteger still guards a digit run
	// too long to be an exact JS integer.
	const parsed = Number(cell);
	if (/^[0-9]+$/.test(cell) && Number.isSafeInteger(parsed) && parsed > 0) return parsed;
	return null;
}

/** `907` / `907$a` — how the refusal below names the field it read the id from. */
function specLabel(spec: MarcValueSpec): string {
	return spec.subfield === undefined ? spec.field : `${spec.field}$${spec.subfield}`;
}

/**
 * Apply a marc21_map to a parsed record → the per-component values + the matched
 * section_id (PHP process_marc21_field_mappings). Pure over the record + map.
 *
 * DATA-22 AT THE MARC DOOR (closed 2026-08-27). The id was read with
 * `Number.parseInt`, which STOPS at the first non-digit and ignores the tail: a
 * `907$a` of '12abc' resolved to record 12, and the whole record was written
 * over A RECORD THE OPERATOR NEVER NAMED — the same silent wrong-record write
 * the CSV door was fixed for, on the door beside it ('1e3' → record 1, '0x10' →
 * record 0, '-5' → record -5, each equally arbitrary). The grammar that decides
 * is the CSV door's — a run of decimal digits — held equal to it by execution
 * (`parseRecordIdCell` above).
 *
 * TWO DIFFERENT THINGS REACH THIS FIELD, and the grammar is what tells them
 * apart:
 *
 *   - a DÉDALO RECORD ID — digits — which updates that record;
 *   - a FOREIGN control number ('REC-1', 'ocm12345678', a Millennium
 *     '.b12345678'). The frozen tool never used this value as a section_id at
 *     all: `resolve_target_section` SEARCHED it as a code
 *     (`get_section_id_from_code`) and created a record when the search found
 *     none. That lookup is not ported (see this tool's module header), so a
 *     value that is not a record id has always meant "create" here. Unchanged —
 *     a ledgered degraded port, not this fix's business.
 *
 * WHAT IS REFUSED is the dangerous middle: a value that is not a record id but
 * that the old reader TURNED INTO one (`parseInt` returned a number). It named a
 * record and we cannot tell which, so neither answer is honest — writing over
 * record 12, or quietly creating a duplicate where an update was intended. The
 * refusal names the field, the subfield and the cell, because the repair is in
 * the file or in the map.
 *
 * WHY THE REFUSAL IS A THROW: this mapper has no per-record report channel
 * (`MarcMappedRecord` is values + id, and `null` there MEANS "create"). The
 * caller maps every record of every staged file BEFORE the executor writes
 * anything, so throwing refuses the RUN with nothing written and nothing
 * half-imported — the CSV door's "a shape we cannot trust is not imported at
 * all", one file bigger.
 */
export function applyMarcMap(
	record: MarcRecord,
	map: readonly MarcMapEntry[],
	fieldToSectionId?: MarcValueSpec,
): MarcMappedRecord {
	let sectionId: number | null = null;
	if (fieldToSectionId !== undefined) {
		const idValues = extractMarcValues(record, fieldToSectionId);
		// Whitespace is the transmission format's padding, never part of the id
		// (the CSV door trims before the same grammar, with PHP's charlist).
		const raw = (idValues[0] ?? '').trim();
		if (raw !== '') {
			sectionId = parseRecordIdCell(raw);
			// Not an id, but the OLD reader made one out of it: refuse by name.
			// `Number.parseInt` is quoted here on purpose — this line's job is to
			// answer "would the frozen behaviour have written a record?", so it must
			// keep asking with the frozen behaviour's own reader.
			if (sectionId === null && Number.isFinite(Number.parseInt(raw, 10))) {
				const sentence = `marc21 field_to_section_id ${specLabel(fieldToSectionId)} is '${raw}', which is not a record id (a record id is a run of digits). Nothing was imported — fix the file, or point field_to_section_id at the field that carries the Dédalo record id.`;
				throw new DedaloError('request.invalid_data', {
					message: sentence,
					publicMessage: sentence,
				});
			}
		}
	}
	const fields = map
		.map((entry) => ({
			component_tipo: entry.component_tipo,
			values: extractMarcValues(record, entry),
		}))
		.filter((f) => f.values.length > 0);
	return { sectionId, fields };
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
