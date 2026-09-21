/**
 * SEED DIFFUSION VOCABULARY REWRITE — the operator-importable ontology packages
 * (install/import/ontology/7.0/<tld>.copy.gz) must speak the engine's
 * `properties.diffusion.type`, not the retired v6 `class_name`
 * (audit 2026-08-26, PUB-04 / P1-13).
 *
 * WHY A SCRIPT AND NOT ONLY THE MIGRATION. install/db/migrations/0008 corrects
 * the rows an install ALREADY HOLDS, once, at boot. The packages under
 * install/import/ontology/7.0/ are a different door: a museum pulls them LATER
 * through the ontology-update manifest (dd_utils_api get_ontology_update_info →
 * data_io_import), and an import re-parses matrix_ontology into dd_ontology —
 * so a package that still says `class_name` re-introduces the retired key on a
 * database the migration has already corrected and will never revisit. The
 * packages are shipped bytes; the correction has to be IN the bytes.
 *
 * WHAT IT DOES, per package, per row (matrix_ontology COPY text, one record a
 * line, `misc` the 11th column):
 *   - `ontology18` (the v7 properties dataframe): every diffusion block whose
 *     `class_name` is in DIFFUSION_TYPE_BY_CLASS_NAME gets `type` and loses
 *     `class_name`; every other key of the block is kept;
 *   - a row with NO `ontology18` block but a mapped `class_name` in the v5
 *     `ontology19` gets the `ontology18` entry ported from it (minus the key);
 *   - `ontology19` is LEFT BYTE-IDENTICAL — a v5 text blob is history, not
 *     configuration; the engine never reads it;
 *   - a `class_name` outside the mapping (`diffusion_section_stats`, dd60 — a
 *     v6 renderer with no v7 format) is left exactly as it is and REPORTED.
 * The SAME mapping, and the same two shapes, as the migration: the vocabulary
 * tripwire (test/unit/diffusion_seed_vocabulary_tripwire.test.ts) holds the
 * SQL's VALUES list equal to the map exported here, so the two cannot drift.
 *
 * BYTE DISCIPLINE. A COPY line is decoded (`\\t`/`\\n`/`\\\\`… → bytes), the
 * jsonb column parsed, and re-serialized in jsonb's OWN canonical text form
 * (keys ordered shorter-first then bytewise, `": "` and `", "` separators) —
 * and the script REFUSES to write a package unless every UNTOUCHED row of it
 * round-trips byte-identically through decode → parse → serialize → encode.
 * That self-check is what makes the touched rows trustworthy: the serializer is
 * proven faithful on the file's own rows before a modified row is written.
 *
 * IDEMPOTENT: a rewritten package has nothing left to map; a second run
 * reports zero rows and leaves the bytes alone (`--check` only reports and
 * exits non-zero when a rewrite is pending — what the tripwire calls).
 *
 * Usage:  bun run scripts/seed_diffusion_type_rewrite.ts [--check] [dir]
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** The retired v6 output-format spellings and the v7 `type` each one IS. */
export const DIFFUSION_TYPE_BY_CLASS_NAME: Readonly<Record<string, string>> = Object.freeze({
	diffusion_mysql: 'sql',
	diffusion_rdf: 'rdf',
	diffusion_socrata: 'socrata',
});

/** Default package directory (this repo's vendored ontology seeds). */
export const ONTOLOGY_PACKAGE_DIR = resolve(
	import.meta.dir,
	'..',
	'install',
	'import',
	'ontology',
	'7.0',
);

/** `misc` is the 11th column of the ontology COPY export (matrix_write.ts MATRIX_COPY_COLUMNS). */
export const COPY_MISC_COLUMN_INDEX = 10;

// ---------------------------------------------------------------------------
// COPY text format — decode / encode one field
// ---------------------------------------------------------------------------

const COPY_DECODE: Record<string, string> = {
	b: '\b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
	'\\': '\\',
};

/** Decode one COPY text field (`\N` = SQL NULL → null). */
export function decodeCopyField(field: string): string | null {
	if (field === '\\N') return null;
	let out = '';
	for (let i = 0; i < field.length; i += 1) {
		const ch = field[i] as string;
		if (ch !== '\\') {
			out += ch;
			continue;
		}
		const next = field[i + 1] as string;
		const decoded = COPY_DECODE[next];
		if (decoded === undefined) {
			throw new Error(`unsupported COPY escape '\\${next}'`);
		}
		out += decoded;
		i += 1;
	}
	return out;
}

/** Encode one field for COPY text (null → `\N`). */
export function encodeCopyField(value: string | null): string {
	if (value === null) return '\\N';
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll('\b', '\\b')
		.replaceAll('\f', '\\f')
		.replaceAll('\n', '\\n')
		.replaceAll('\r', '\\r')
		.replaceAll('\t', '\\t')
		.replaceAll('\v', '\\v');
}

// ---------------------------------------------------------------------------
// jsonb canonical text — what psql prints for a jsonb column
// ---------------------------------------------------------------------------

/** jsonb object key order: shorter key first, then bytewise. */
function jsonbKeyCompare(a: string, b: string): number {
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ab.length !== bb.length) return ab.length - bb.length;
	return Buffer.compare(ab, bb);
}

/**
 * Serialize a parsed jsonb value the way Postgres prints it. Numbers are kept
 * as JSON.stringify prints them — the round-trip self-check below is what
 * proves that is faithful for the rows at hand (numeric text like `1.0` or
 * `1e5` would not survive, and such a row makes the script refuse).
 */
export function serializeJsonb(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) {
		return `[${value.map((item) => serializeJsonb(item)).join(', ')}]`;
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record).sort(jsonbKeyCompare);
		return `{${keys.map((key) => `${JSON.stringify(key)}: ${serializeJsonb(record[key])}`).join(', ')}}`;
	}
	return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// The rewrite of ONE record's `misc`
// ---------------------------------------------------------------------------

type DataframeEntry = { value?: unknown } & Record<string, unknown>;

/** The diffusion block of a dataframe entry, when it is an object. */
function diffusionBlockOf(entry: unknown): Record<string, unknown> | null {
	if (entry === null || typeof entry !== 'object') return null;
	const value = (entry as DataframeEntry).value;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const diffusion = (value as Record<string, unknown>).diffusion;
	if (diffusion === null || typeof diffusion !== 'object' || Array.isArray(diffusion)) return null;
	return diffusion as Record<string, unknown>;
}

/** Rename `class_name` → `type` in place, every other key kept. */
function retypeDiffusionBlock(
	block: Record<string, unknown>,
	type: string,
): Record<string, unknown> {
	const { class_name: _retired, ...rest } = block;
	return rest.type === undefined ? { ...rest, type } : rest;
}

export interface MiscRewrite {
	misc: Record<string, unknown>;
	changed: boolean;
	/** `class_name` values met that are NOT in the mapping (left as they are). */
	unmapped: string[];
}

/** Apply the vocabulary to one record's `misc`. Pure. */
export function rewriteMisc(misc: Record<string, unknown>): MiscRewrite {
	const unmapped: string[] = [];
	let changed = false;
	const out: Record<string, unknown> = { ...misc };

	const v7 = out.ontology18;
	let hasV7Block = false;
	if (Array.isArray(v7)) {
		out.ontology18 = v7.map((entry) => {
			const block = diffusionBlockOf(entry);
			if (block === null) return entry;
			hasV7Block = true;
			const className = block.class_name;
			if (typeof className !== 'string') return entry;
			const type = DIFFUSION_TYPE_BY_CLASS_NAME[className];
			if (type === undefined) {
				unmapped.push(className);
				return entry;
			}
			changed = true;
			const value = (entry as DataframeEntry).value as Record<string, unknown>;
			return {
				...(entry as DataframeEntry),
				value: { ...value, diffusion: retypeDiffusionBlock(block, type) },
			};
		});
	}
	if (!hasV7Block) {
		// Shape (b): no v7 diffusion block at all — `ontology18` absent, or
		// present with an EMPTY value (`[{"id": 1, "value": {}}]`, which the
		// parser folds to properties NULL) — the block only in the v5 entry.
		const v5 = out.ontology19;
		const first = Array.isArray(v5) ? v5[0] : undefined;
		const block = diffusionBlockOf(first);
		const className = block?.class_name;
		if (block !== null && typeof className === 'string') {
			const type = DIFFUSION_TYPE_BY_CLASS_NAME[className];
			if (type === undefined) {
				unmapped.push(className);
			} else {
				changed = true;
				const ported = retypeDiffusionBlock(block, type);
				const current = Array.isArray(out.ontology18) ? out.ontology18 : [];
				const head = current[0] as DataframeEntry | undefined;
				const headValue = head?.value;
				out.ontology18 =
					headValue !== null &&
					headValue !== undefined &&
					typeof headValue === 'object' &&
					!Array.isArray(headValue)
						? [
								{
									...head,
									value: { ...(headValue as Record<string, unknown>), diffusion: ported },
								},
								...current.slice(1),
							]
						: [{ id: 1, value: { diffusion: ported } }];
			}
		}
	}
	return { misc: out, changed, unmapped };
}

// ---------------------------------------------------------------------------
// One package
// ---------------------------------------------------------------------------

export interface PackageRewrite {
	file: string;
	rows: number;
	rewritten: number;
	unmapped: string[];
	/** The rewritten COPY text (gunzipped); equals the input when nothing changed. */
	text: string;
}

/** Parse the `misc` column of one COPY line: null for SQL NULL. */
export function miscOfCopyLine(line: string): Record<string, unknown> | null {
	const fields = line.split('\t');
	const raw = decodeCopyField(fields[COPY_MISC_COLUMN_INDEX] ?? '\\N');
	if (raw === null) return null;
	const parsed = JSON.parse(raw) as unknown;
	return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: null;
}

/** Rewrite one package's COPY text. Pure; refuses on a non-faithful round-trip. */
export function rewritePackageText(file: string, text: string): PackageRewrite {
	const lines = text.split('\n');
	const unmapped: string[] = [];
	let rows = 0;
	let rewritten = 0;
	const outLines = lines.map((line, index) => {
		if (line === '') return line;
		rows += 1;
		const fields = line.split('\t');
		const rawField = fields[COPY_MISC_COLUMN_INDEX];
		if (rawField === undefined) {
			throw new Error(`${file}:${index + 1}: fewer than ${COPY_MISC_COLUMN_INDEX + 1} columns`);
		}
		const raw = decodeCopyField(rawField);
		if (raw === null) return line;
		const parsed = JSON.parse(raw) as unknown;
		// The self-check: the serializer must reproduce psql's bytes for THIS row
		// before it is trusted to write a modified one.
		const roundTrip = encodeCopyField(serializeJsonb(parsed));
		if (roundTrip !== rawField) {
			throw new Error(
				`${file}:${index + 1}: jsonb round-trip is not byte-identical — refusing to rewrite (serializer not faithful for this row)`,
			);
		}
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return line;
		const result = rewriteMisc(parsed as Record<string, unknown>);
		unmapped.push(...result.unmapped);
		if (!result.changed) return line;
		rewritten += 1;
		fields[COPY_MISC_COLUMN_INDEX] = encodeCopyField(serializeJsonb(result.misc));
		return fields.join('\t');
	});
	return { file, rows, rewritten, unmapped, text: outLines.join('\n') };
}

/** Every `<tld>.copy.gz` ontology package in a directory (hierarchy files are elsewhere). */
export function ontologyPackageFiles(dir: string = ONTOLOGY_PACKAGE_DIR): string[] {
	return readdirSync(dir)
		.filter((name) => /^[a-z_]+\.copy\.gz$/.test(name))
		.sort()
		.map((name) => join(dir, name));
}

/** Rewrite (or, with `write: false`, only judge) every package of a directory. */
export function rewriteOntologyPackages(options: {
	dir?: string;
	write: boolean;
}): PackageRewrite[] {
	const results: PackageRewrite[] = [];
	for (const file of ontologyPackageFiles(options.dir)) {
		const text = gunzipSync(readFileSync(file)).toString('utf8');
		const result = rewritePackageText(file, text);
		results.push(result);
		if (options.write && result.rewritten > 0) {
			writeFileSync(file, gzipSync(Buffer.from(result.text, 'utf8'), { level: 9 }));
		}
	}
	return results;
}

function main(argv: string[]): number {
	const check = argv.includes('--check');
	const dir = argv.find((arg) => !arg.startsWith('--')) ?? ONTOLOGY_PACKAGE_DIR;
	const results = rewriteOntologyPackages({ dir, write: !check });
	let pending = 0;
	for (const result of results) {
		if (result.rewritten === 0 && result.unmapped.length === 0) continue;
		pending += result.rewritten;
		console.log(
			`${check ? 'PENDING' : 'REWRITTEN'} ${result.file}: ${result.rewritten} of ${result.rows} rows` +
				(result.unmapped.length > 0
					? ` (left as is, no v7 format: ${result.unmapped.join(', ')})`
					: ''),
		);
	}
	console.log(
		`${results.length} packages scanned, ${pending} rows ${check ? 'pending' : 'rewritten'}`,
	);
	return check && pending > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
