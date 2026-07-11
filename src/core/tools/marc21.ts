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

const decoder = new TextDecoder('utf-8');

/** Parse one ISO 2709 record into its leader + fields. Throws on a malformed record. */
export function parseMarcRecord(bytes: Uint8Array): MarcRecord {
	if (bytes.length < 24) throw new Error('MARC record shorter than the 24-byte leader');
	const leader = decoder.decode(bytes.subarray(0, 24));
	const baseAddress = Number.parseInt(leader.slice(12, 17), 10);
	if (!Number.isFinite(baseAddress) || baseAddress <= 24 || baseAddress > bytes.length) {
		throw new Error('MARC leader has an invalid base address of data');
	}

	// Directory: 24 .. baseAddress-1, 12 bytes per entry, ends at a field terminator.
	const directoryBytes = bytes.subarray(24, baseAddress - 1);
	const fields: MarcField[] = [];
	for (let offset = 0; offset + 12 <= directoryBytes.length; offset += 12) {
		const entry = decoder.decode(directoryBytes.subarray(offset, offset + 12));
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
		fields.push(parseField(tag, fieldBytes));
	}
	return { leader, fields };
}

function parseField(tag: string, bytes: Uint8Array): MarcField {
	// Control fields (00X) have no indicators or subfields.
	if (tag < '010') {
		return { tag, value: decoder.decode(bytes) };
	}
	const indicator1 = bytes.length > 0 ? decoder.decode(bytes.subarray(0, 1)) : ' ';
	const indicator2 = bytes.length > 1 ? decoder.decode(bytes.subarray(1, 2)) : ' ';
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
		const code = decoder.decode(chunk.subarray(0, 1));
		const value = decoder.decode(chunk.subarray(1));
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
 * Apply a marc21_map to a parsed record → the per-component values + the matched
 * section_id (PHP process_marc21_field_mappings). Pure over the record + map.
 */
export function applyMarcMap(
	record: MarcRecord,
	map: readonly MarcMapEntry[],
	fieldToSectionId?: MarcValueSpec,
): MarcMappedRecord {
	let sectionId: number | null = null;
	if (fieldToSectionId !== undefined) {
		const idValues = extractMarcValues(record, fieldToSectionId);
		const parsed = Number.parseInt(idValues[0] ?? '', 10);
		sectionId = Number.isFinite(parsed) ? parsed : null;
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
