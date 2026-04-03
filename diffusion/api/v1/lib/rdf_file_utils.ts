/**
 * RDF_FILE_UTILS
 * Utilities for merging per-record RDF/XML strings into a single
 * consolidated .rdf file and zipping all individual files together.
 *
 * Merge strategy (Option A):
 *   Each raw XML part is a full RDF/XML document with its own
 *   <?xml?> declaration and <rdf:RDF> wrapper.
 *   We extract the content between the opening and closing <rdf:RDF> tags
 *   from every part, emit one shared header + wrapper, then concatenate
 *   all inner blocks.
 */

import { writeFileSync } from 'fs';
import path              from 'path';



// =====================================================
// TYPES
// =====================================================

export interface consolidation_result {
	merged_file_path: string;
	merged_url:       string;
	zip_file_path:    string;
	zip_url:          string;
}



// =====================================================
// MERGE
// =====================================================

/**
 * EXTRACT_RDF_INNER
 * Extracts the body content that sits between the outermost <rdf:RDF …>
 * and </rdf:RDF> tags.  Returns an empty string when the tag is absent.
 */
function extract_rdf_inner(xml: string): string {
	const open_match  = xml.match(/<rdf:RDF[^>]*>/s);
	const close_index = xml.lastIndexOf('</rdf:RDF>');

	if (!open_match || close_index === -1) return '';

	const body_start = (open_match.index ?? 0) + open_match[0].length;
	return xml.slice(body_start, close_index);
}

/**
 * EXTRACT_RDF_OPENING_TAG
 * Returns the full opening <rdf:RDF …> tag (with namespace declarations)
 * from the first non-empty raw XML part.
 * Falls back to a minimal valid wrapper if no match is found.
 */
function extract_rdf_opening_tag(xml: string): string {
	const match = xml.match(/<rdf:RDF[^>]*>/s);
	return match ? match[0] : '<rdf:RDF>';
}

/**
 * MERGE_RDF_PARTS
 * Combines an array of complete RDF/XML document strings into a single
 * valid RDF/XML document.
 * - XML declaration and namespace wrapper are taken from the first part.
 * - Inner <rdf:Description> blocks from all parts are concatenated.
 *
 * @param raw_parts - Array of full RDF/XML document strings (one per record)
 * @returns Single merged RDF/XML string
 */
export function merge_rdf_parts(raw_parts: string[]): string {
	const non_empty = raw_parts.filter(p => p && p.trim().length > 0);
	if (non_empty.length === 0) return '';
	if (non_empty.length === 1) return non_empty[0];

	const opening_tag = extract_rdf_opening_tag(non_empty[0]);

	const inner_blocks = non_empty
		.map(part => extract_rdf_inner(part).trim())
		.filter(block => block.length > 0)
		.join('\n\n');

	return `<?xml version="1.0" encoding="utf-8"?>\n${opening_tag}\n\n${inner_blocks}\n\n</rdf:RDF>\n`;
}



// =====================================================
// ZIP
// =====================================================

/**
 * CREATE_ZIP
 * Creates a ZIP archive containing all given filesystem paths.
 * Uses Bun's native `Bun.zip` (available since Bun ≥ 1.1).
 * Each entry is added with just its basename to keep the archive flat.
 *
 * @param file_paths - Absolute filesystem paths to include in the ZIP
 * @param zip_path   - Absolute destination path for the .zip file
 */
export async function create_zip(file_paths: string[], zip_path: string): Promise<void> {
	const entries: Record<string, Uint8Array> = {};

	for (const fp of file_paths) {
		try {
			const file = Bun.file(fp);
			const buf  = await file.arrayBuffer();
			entries[path.basename(fp)] = new Uint8Array(buf);
		} catch (err) {
			console.warn(`[rdf_file_utils] Skipping missing file in zip: ${fp}`, err);
		}
	}

	if (Object.keys(entries).length === 0) {
		throw new Error('create_zip: no valid files to include');
	}

	// Use Bun.zip when available, otherwise fall back to manual ZIP creation
	if (typeof (Bun as any).zip === 'function') {
		const zip_bytes: Uint8Array = await (Bun as any).zip(entries);
		writeFileSync(zip_path, zip_bytes);
	} else {
		await create_zip_fallback(entries, zip_path);
	}
}



// =====================================================
// ZIP FALLBACK (manual PKZIP minimal implementation)
// =====================================================

/**
 * CREATE_ZIP_FALLBACK
 * Minimal PKZip writer used when Bun.zip is not available.
 * Stores entries without compression (method = 0 / STORE).
 */
async function create_zip_fallback(
	entries: Record<string, Uint8Array>,
	zip_path: string
): Promise<void> {
	const parts: Uint8Array[] = [];
	const central_dir: Uint8Array[] = [];
	let   offset = 0;

	const enc = new TextEncoder();

	for (const [name, data] of Object.entries(entries)) {
		const name_bytes = enc.encode(name);
		const crc        = crc32(data);
		const size       = data.byteLength;

		// Local file header (signature 0x04034b50)
		const local_header = new DataView(new ArrayBuffer(30 + name_bytes.length));
		local_header.setUint32(0,  0x04034b50, true); // signature
		local_header.setUint16(4,  20,         true); // version needed
		local_header.setUint16(6,  0,          true); // flags
		local_header.setUint16(8,  0,          true); // method (STORE)
		local_header.setUint16(10, 0,          true); // mod time
		local_header.setUint16(12, 0,          true); // mod date
		local_header.setUint32(14, crc,        true); // crc-32
		local_header.setUint32(18, size,       true); // compressed size
		local_header.setUint32(22, size,       true); // uncompressed size
		local_header.setUint16(26, name_bytes.length, true); // filename len
		local_header.setUint16(28, 0,          true); // extra len
		new Uint8Array(local_header.buffer).set(name_bytes, 30);

		const local_bytes = new Uint8Array(local_header.buffer);
		parts.push(local_bytes, data);

		// Central directory record (signature 0x02014b50)
		const cd_entry = new DataView(new ArrayBuffer(46 + name_bytes.length));
		cd_entry.setUint32(0,  0x02014b50, true);
		cd_entry.setUint16(4,  20,         true);
		cd_entry.setUint16(6,  20,         true);
		cd_entry.setUint16(8,  0,          true);
		cd_entry.setUint16(10, 0,          true);
		cd_entry.setUint16(12, 0,          true);
		cd_entry.setUint16(14, 0,          true);
		cd_entry.setUint32(16, crc,        true);
		cd_entry.setUint32(20, size,       true);
		cd_entry.setUint32(24, size,       true);
		cd_entry.setUint16(28, name_bytes.length, true);
		cd_entry.setUint16(30, 0,          true);
		cd_entry.setUint16(32, 0,          true);
		cd_entry.setUint16(34, 0,          true);
		cd_entry.setUint16(36, 0,          true);
		cd_entry.setUint32(40, 0,          true);
		cd_entry.setUint32(42, offset,     true);
		new Uint8Array(cd_entry.buffer).set(name_bytes, 46);

		central_dir.push(new Uint8Array(cd_entry.buffer));
		offset += local_bytes.length + size;
	}

	// End of central directory (signature 0x06054b50)
	const count     = Object.keys(entries).length;
	const cd_bytes  = concat_uint8(central_dir);
	const eocd      = new DataView(new ArrayBuffer(22));
	eocd.setUint32(0,  0x06054b50, true);
	eocd.setUint16(4,  0,          true);
	eocd.setUint16(6,  0,          true);
	eocd.setUint16(8,  count,      true);
	eocd.setUint16(10, count,      true);
	eocd.setUint32(12, cd_bytes.length, true);
	eocd.setUint32(16, offset,     true);
	eocd.setUint16(20, 0,          true);

	const all = concat_uint8([...parts, cd_bytes, new Uint8Array(eocd.buffer)]);
	writeFileSync(zip_path, all);
}



// =====================================================
// HELPERS
// =====================================================

function concat_uint8(arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((s, a) => s + a.length, 0);
	const out   = new Uint8Array(total);
	let   off   = 0;
	for (const a of arrays) {
		out.set(a, off);
		off += a.length;
	}
	return out;
}

function crc32(data: Uint8Array): number {
	// Standard CRC-32 table lookup
	const TABLE = (() => {
		const t = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
			t[i] = c;
		}
		return t;
	})();

	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc = TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
