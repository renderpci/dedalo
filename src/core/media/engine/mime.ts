/**
 * MIME SNIFFER — closed-world magic-byte detection, no third-party library.
 *
 * The upload allowlist is a small, closed universe (engineering/MEDIA_SPEC.md §3), so
 * we sniff by well-known file signatures rather than pulling in a MIME library
 * or trusting the client's Content-Type (never trusted — PHP uses finfo on the
 * temp file). This is finfo-parity and stronger: our signature DB is exactly the
 * allowlist, so anything unrecognized fails closed.
 *
 * PHP references: dd_utils_api::upload finfo sniff (:1079), get_known_mime_types
 * (:3035), chunked re-sniff SEC-066 (:1481-1498).
 */

/** A sniffed file kind (the coarse family) + the extensions it maps to. */
export interface SniffResult {
	/** Canonical family label. */
	kind: string;
	/** Extensions this signature legitimately corresponds to (lowercase, no dot). */
	extensions: readonly string[];
}

/** Read bytes at an offset and compare to a signature (numbers or null=wildcard). */
function matchAt(
	bytes: Uint8Array,
	offset: number,
	signature: readonly (number | null)[],
): boolean {
	if (offset + signature.length > bytes.length) return false;
	for (let i = 0; i < signature.length; i++) {
		const expected = signature[i];
		if (expected !== null && bytes[offset + i] !== expected) return false;
	}
	return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
	if (offset + text.length > bytes.length) return false;
	for (let i = 0; i < text.length; i++) {
		if (bytes[offset + i] !== text.charCodeAt(i)) return false;
	}
	return true;
}

/**
 * Sniff a buffer to a media kind. Returns null when the signature is unknown —
 * the caller MUST fail closed. Order matters (container checks before generic).
 */
export function sniffBytes(bytes: Uint8Array): SniffResult | null {
	// --- Images ---
	if (matchAt(bytes, 0, [0xff, 0xd8, 0xff])) return { kind: 'jpeg', extensions: ['jpg', 'jpeg'] };
	if (matchAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		return { kind: 'png', extensions: ['png'] };
	if (matchAt(bytes, 0, [0x42, 0x4d])) return { kind: 'bmp', extensions: ['bmp'] };
	if (matchAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || matchAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a]))
		return { kind: 'tiff', extensions: ['tif', 'tiff'] };
	if (matchAt(bytes, 0, [0x38, 0x42, 0x50, 0x53])) return { kind: 'psd', extensions: ['psd'] };
	// RIFF containers: WEBP (image) and WAV/AVI (av) share the RIFF header.
	if (asciiAt(bytes, 0, 'RIFF')) {
		if (asciiAt(bytes, 8, 'WEBP')) return { kind: 'webp', extensions: ['webp'] };
		if (asciiAt(bytes, 8, 'WAVE')) return { kind: 'wav', extensions: ['wav', 'wave'] };
		if (asciiAt(bytes, 8, 'AVI ')) return { kind: 'avi', extensions: ['avi'] };
	}
	// ISO-BMFF (ftyp box): heic/avif (image) and mp4/mov (av) — dispatch on the brand.
	if (asciiAt(bytes, 4, 'ftyp')) {
		const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
		if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1')
			return { kind: 'heic', extensions: ['heic'] };
		if (brand.startsWith('avif') || brand === 'avis') return { kind: 'avif', extensions: ['avif'] };
		if (brand === 'qt  ') return { kind: 'mov', extensions: ['mov'] };
		// isom/mp42/mp41/M4V/dash… → mp4 family
		return { kind: 'mp4', extensions: ['mp4', 'mov', 'm4v'] };
	}

	// --- Audio/Video ---
	if (asciiAt(bytes, 0, 'FORM') && (asciiAt(bytes, 8, 'AIFF') || asciiAt(bytes, 8, 'AIFC')))
		return { kind: 'aiff', extensions: ['aiff', 'aif'] };
	if (
		matchAt(bytes, 0, [0x49, 0x44, 0x33]) ||
		matchAt(bytes, 0, [0xff, 0xfb]) ||
		matchAt(bytes, 0, [0xff, 0xf3])
	)
		return { kind: 'mp3', extensions: ['mp3'] };
	if (asciiAt(bytes, 0, 'FLV')) return { kind: 'flv', extensions: ['flv'] };
	// MPEG program stream (VOB/MPG/MPEG): pack header 00 00 01 BA, or sequence 00 00 01 B3.
	if (matchAt(bytes, 0, [0x00, 0x00, 0x01, 0xba]) || matchAt(bytes, 0, [0x00, 0x00, 0x01, 0xb3]))
		return { kind: 'mpeg', extensions: ['mpg', 'mpeg', 'vob'] };

	// --- Documents ---
	if (asciiAt(bytes, 0, '%PDF-')) return { kind: 'pdf', extensions: ['pdf'] };
	// OLE compound file (legacy .doc/.ppt)
	if (matchAt(bytes, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
		return { kind: 'ole', extensions: ['doc', 'ppt'] };
	// ZIP (also OOXML docx/pptx, ODF odt/ods, iWork .pages, some 3D .zip)
	if (matchAt(bytes, 0, [0x50, 0x4b, 0x03, 0x04]) || matchAt(bytes, 0, [0x50, 0x4b, 0x05, 0x06]))
		return { kind: 'zip', extensions: ['zip', 'odt', 'ods', 'pages', 'ppt', 'doc'] };

	// --- 3D ---
	if (asciiAt(bytes, 0, 'glTF')) return { kind: 'glb', extensions: ['glb'] };

	// --- SVG / text-based (XML) ---
	if (looksLikeSvg(bytes)) return { kind: 'svg', extensions: ['svg'] };
	if (looksLikeGltfJson(bytes)) return { kind: 'gltf', extensions: ['gltf'] };

	return null;
}

/** SVG = XML text whose first significant tag is <svg (allowing BOM / <?xml / comments). */
function looksLikeSvg(bytes: Uint8Array): boolean {
	const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512)).toLowerCase();
	if (!head.includes('<svg')) return false;
	// Must look like XML/SVG start, not an HTML doc that merely mentions svg.
	const trimmed = head.replace(/^﻿/, '').trimStart();
	return trimmed.startsWith('<?xml') || trimmed.startsWith('<svg') || trimmed.startsWith('<!--');
}

/** glTF JSON = a JSON object carrying an "asset" with a "version". */
function looksLikeGltfJson(bytes: Uint8Array): boolean {
	const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512));
	const trimmed = head.replace(/^﻿/, '').trimStart();
	return trimmed.startsWith('{') && /"asset"\s*:/.test(head);
}

/**
 * Sniff a file and confirm the signature is consistent with the declared
 * extension. Returns the normalized extension on success, throws on mismatch or
 * unknown signature (fail-closed). Text-based 3D formats (obj/fbx/dae) have no
 * reliable magic — they are accepted by extension ONLY when the buffer is not a
 * recognized OTHER binary (prevents a .jpg renamed to .obj sneaking through).
 */
const TEXT_3D_EXTENSIONS: ReadonlySet<string> = new Set(['obj', 'fbx', 'dae']);

export function sniffAndValidate(bytes: Uint8Array, declaredExtension: string): string {
	const ext = declaredExtension.toLowerCase().replace(/^\./, '');
	const result = sniffBytes(bytes);
	if (result === null) {
		// Unknown signature. Allow only the extension-only text 3D formats, and
		// only when the bytes are not a recognized binary of another family.
		if (TEXT_3D_EXTENSIONS.has(ext)) return ext;
		throw new Error(`Unrecognized file signature (declared '.${ext}') — rejected`);
	}
	if (!result.extensions.includes(ext)) {
		// The bytes ARE a known type but not the declared extension.
		throw new Error(
			`File signature (${result.kind}) does not match declared extension '.${ext}' — rejected`,
		);
	}
	return ext;
}
