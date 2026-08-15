/**
 * STAGED-CONTENT VERIFIER — bounded-cost verification of an assembled upload.
 *
 * WHAT THIS REPLACES. The chunked join's SEC-066 re-sniff read only the leading
 * 8192 bytes of the assembled file. That bound was itself a deliberate fix
 * (DOS-03, 2026-07-28 audit): reading a multi-GB upload into RAM to sniff it
 * doubled RSS and could OOM the server. But a head-only check accepts a valid
 * JPEG/CSV header followed by ANY body — and once `tool_import_files` chunks by
 * default (DEDALO_UPLOAD_SERVICE_CHUNK_FILES=4), that head-only check is the
 * only content gate the whole media-ingest corpus passes through.
 *
 * ── THE RANKING THIS FILE IS WRITTEN TO (2026-08-03 revision) ────────────────
 *
 * The first version of this verifier was broader than the decoder ecosystem it
 * guards, and an adversarial review reproduced five classes of REAL, standards-
 * legal encoder output that it refused: an ffmpeg WAV written to a pipe (RIFF
 * size `0xFFFFFFFF`), an MP4 with 512 B of block-alignment zero padding, a JPEG
 * with a >1 MiB Motion-Photo/JUMBF trailer after EOI, a WAV with a trailing tag
 * outside the RIFF size, and a CSV carrying one `0x00` or `0x1A`. For an
 * archival ingest path that ordering is:
 *
 *     silently accepting corrupt bytes
 *       < refusing loudly and KEEPING the data
 *         <<< destroying a curator's completed upload
 *
 * So: **a narrower verifier that never false-rejects beats a broad one that
 * sometimes does.** This inverts the instinct of the first pass, and it is the
 * rule to apply when adding or tightening anything here. Concretely —
 *
 *   • When a real encoder's output and an invariant stated here disagree, the
 *     INVARIANT is wrong. Widen it or drop the format to `header`; do not
 *     "handle" the encoder as a special case.
 *   • A rule is only worth keeping if you can be SURE no legal file trips it.
 *     If you cannot be cheaply sure, the honest answer is `header` with a
 *     written reason — an exemption that is stated is not a silent narrowing.
 *   • What survives here is therefore almost entirely TRUNCATION detection: a
 *     container that declares more bytes than the file holds is an incomplete
 *     transfer, which is the actual failure mode a chunked join must catch.
 *     Trailing bytes a container does not account for are ACCEPTED everywhere,
 *     because every decoder accepts them and real files carry them.
 *   • Rejection is NOT destruction: `joinChunkedUpload` quarantines a refused
 *     transfer instead of deleting it (upload.ts). That is what makes a residual
 *     false reject survivable — it must stay that way.
 *
 * THE PROPERTY PRESERVED FROM DOS-03: peak memory is O(1) — never O(file size).
 * Nothing here allocates more than WINDOW_BYTES (1 MiB) at a time.
 *
 * WHAT IT COSTS (also revised): no rule reads the whole file any more. The
 * previous `full` depth ran a synchronous per-byte JS loop over every byte of a
 * text upload — measured at ~705 MiB/s, i.e. ~43 s of TOTAL single-threaded
 * server freeze for a 30 GB CSV, blocking every other user. That depth is gone
 * (see the `text` row below for why it was also wrong on the merits), so the
 * worst case here is now a bounded backward scan of the file's last TAIL_BYTES,
 * paid only by a file whose terminator is not near its end.
 *
 * WHAT IS VERIFIED, per content class (VERIFICATION_POLICY below is the machine-
 * readable statement of this, and `test/unit/media_engine.test.ts` fails if a
 * sniffable kind is missing from it — an unlisted format is a LOUD error at
 * runtime, never a silent pass):
 *
 *   structural  the container declares its own extent or terminator, and that
 *               declaration is checked against the real file size with bounded
 *               reads — and ONLY in the direction that means "the file is
 *               short". Unaccounted trailing bytes never reject.
 *   header      no invariant exists that is both bounded and certain not to
 *               refuse a real file; ONLY the 8192-byte signature is verified.
 *               Each one carries its reason — this is the named exemption, not
 *               a silent narrowing.
 *
 * WHAT IT STILL CANNOT DO: none of this is a decoder. A structurally valid MP4
 * whose media payload is hostile, a JPEG whose entropy-coded data is corrupt, a
 * ZIP whose members are malicious — all still pass. Proving a 30 GB video
 * decodes means decoding it, which is not something an upload request can do.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { sniffAndValidate, sniffBytes } from './mime.ts';

/** Bytes fed to the signature sniffer (the historic SEC-066 head bound). */
export const SNIFF_BYTES = 8192;

/** The whole memory budget: no read anywhere in this module exceeds it. */
const WINDOW_BYTES = 1 << 20;

/**
 * How far back from EOF a terminator may hide, scanned BACKWARD one window at a
 * time so the ordinary file (terminator at the very end) pays exactly one 1 MiB
 * read and only a pathological one pays the whole span.
 *
 * 16 MiB, not the previous 1 MiB, because 1 MiB false-rejected real material: a
 * Google/Samsung Motion Photo appends a whole MP4 after the JPEG's EOI (commonly
 * several MB), and a C2PA/JUMBF provenance manifest or a large XMP packet is the
 * same shape. Those are the files a heritage repository most wants to keep.
 */
const TAIL_BYTES = 16 << 20;

/**
 * How much unaccounted TRAILING ZERO padding a box chain may carry. Capture
 * cards and tape-out pipelines pad to a block boundary (512 B … 256 KB); 1 MiB
 * is far past any of them, and a region of zeros carries no smuggled payload
 * anyway — the bound exists to keep the scan cheap, not to catch anything.
 */
const TRAILING_PAD_BYTES = 1 << 20;

/** How deeply a content class can be verified without risking a false reject. */
export type VerificationDepth = 'structural' | 'header';

export interface VerificationPolicy {
	depth: VerificationDepth;
	/** Why this depth and not a deeper one. Required — an exemption must say so. */
	reason: string;
}

/**
 * The verification depth for every kind `sniffBytes` can return, plus the three
 * extension-only 3D formats it deliberately returns null for.
 *
 * ADDING A FORMAT TO `mime.ts` MEANS ADDING A ROW HERE. `verifyFileContent`
 * throws on a missing row and `test/unit/media_engine.test.ts` scans mime.ts for
 * `kind:` literals and fails if any is absent, so a new signature cannot land
 * with an unstated verification level.
 */
export const VERIFICATION_POLICY: Readonly<Record<string, VerificationPolicy>> = Object.freeze({
	// --- structural: the container declares its own extent or terminator ---
	jpeg: {
		depth: 'structural',
		reason:
			'JFIF ends at the EOI marker (FFD9), searched in the last 16 MiB so a Motion Photo / JUMBF / MPF trailer after EOI does not false-reject',
	},
	png: {
		depth: 'structural',
		reason:
			'PNG ends at the IEND chunk; the search window tolerates the trailing bytes non-conforming writers append, since every decoder does',
	},
	bmp: {
		depth: 'structural',
		reason:
			'the BITMAPFILEHEADER declares bfSize at offset 2; only a declaration LARGER than the file (a truncated transfer) is refused',
	},
	pdf: { depth: 'structural', reason: 'PDF ends at %%EOF after the trailer (or the last update)' },
	zip: {
		depth: 'structural',
		reason:
			'ZIP (and OOXML/ODF) ends at the End Of Central Directory record, which the spec pins within 64 KB + comment of EOF',
	},
	glb: {
		depth: 'structural',
		reason:
			'the glTF binary header declares the total length at offset 8; only a declaration LARGER than the file is refused',
	},
	webp: {
		depth: 'structural',
		reason:
			'the RIFF chunk chain must not declare more bytes than the file holds; the streaming sentinel and trailing tags are accepted',
	},
	wav: {
		depth: 'structural',
		reason:
			'the RIFF chunk chain must not declare more bytes than the file holds; the streaming sentinel and trailing tags are accepted',
	},
	avi: {
		depth: 'structural',
		reason:
			'the RIFF chunk chain (OpenDML AVIX chains included) must not declare more bytes than the file holds; the streaming sentinel and trailing tags are accepted',
	},
	mp4: {
		depth: 'structural',
		reason:
			'no ISO-BMFF top-level box may declare bytes past EOF; trailing zero block-padding is accepted',
	},
	mov: {
		depth: 'structural',
		reason:
			'no ISO-BMFF top-level box may declare bytes past EOF; trailing zero block-padding is accepted',
	},
	heic: {
		depth: 'structural',
		reason:
			'no ISO-BMFF top-level box may declare bytes past EOF; trailing zero block-padding is accepted',
	},
	avif: {
		depth: 'structural',
		reason:
			'no ISO-BMFF top-level box may declare bytes past EOF; trailing zero block-padding is accepted',
	},

	// --- header: NAMED EXEMPTIONS. No invariant that is both bounded and safe. ---
	//
	// The five text-class rows were `full` (every byte must be free of control
	// characters) until 2026-08-03. That rule was WRONG, not merely expensive: no
	// text consumer enforces it, and real archival material trips it — a DOS-era
	// export ends with 0x1A (CP/M EOF), a UTF-16→UTF-8 conversion leaves NULs, an
	// OCR transcription carries 0x7F. Rejecting those destroys exactly the legacy
	// material this system exists to preserve, in exchange for refusing a payload
	// appended to a CSV that nothing in the pipeline would ever execute.
	text: {
		depth: 'header',
		reason:
			'a byte-level predicate over a text file is not an invariant any parser enforces — a NUL, a DOS 0x1A EOF or a 0x7F in a legacy CSV/TXT is legible data, not corruption, and the 8192-byte prefix already fixed the classification',
	},
	svg: {
		depth: 'header',
		reason:
			'SVG is XML text, so it inherits the text reasoning; a trailing binary block makes a broken SVG that the renderer reports, not a reason to refuse the transfer',
	},
	gltf: {
		depth: 'header',
		reason:
			'glTF JSON is text, so it inherits the text reasoning; malformed JSON is caught by the consumer that parses it, with the file still on disk',
	},
	obj: {
		depth: 'header',
		reason:
			'Wavefront OBJ is accepted by extension only (no magic) and is text, so it inherits the text reasoning; there is nothing else bounded to check',
	},
	dae: {
		depth: 'header',
		reason:
			'COLLADA DAE is XML text accepted by extension only (no magic), so it inherits the text reasoning',
	},
	tiff: {
		depth: 'header',
		reason:
			'TIFF extent is only knowable by walking the IFD chain through arbitrary file offsets, which is a decoder-shaped traversal, not a bounded check',
	},
	psd: {
		depth: 'header',
		reason: 'PSD section lengths are only reachable by walking variable-length layer records',
	},
	mp3: {
		depth: 'header',
		reason:
			'MPEG audio is a bare frame stream with no container extent and no terminator (and legal ID3v1/APE trailers sit outside any of it)',
	},
	aiff: {
		depth: 'header',
		reason:
			'AIFF is IFF/FORM, not RIFF (big-endian chunk chain); the walker here is not written for it and guessing would be worse than saying so',
	},
	flv: { depth: 'header', reason: 'FLV tags form a stream with no declared total extent' },
	mpeg: {
		depth: 'header',
		reason: 'MPEG program/system streams are unbounded concatenations of packs with no terminator',
	},
	ole: {
		depth: 'header',
		reason: 'OLE compound-file extent requires walking the FAT sector chains',
	},
	rtf: {
		depth: 'header',
		reason: 'RTF may legally embed binary via \\bin, so the text predicate does not hold',
	},
	fbx: {
		depth: 'header',
		reason: 'FBX is accepted by extension only and exists in both binary and ASCII forms',
	},
	html: {
		depth: 'header',
		reason: 'HTML is refused outright by the sniffer (MEDIA-01) — nothing reaches this stage',
	},
});

/** Read up to `length` bytes at `position`. Never allocates more than requested. */
function readAt(fd: number, position: number, length: number): Uint8Array {
	if (length <= 0) return new Uint8Array(0);
	const buffer = new Uint8Array(Math.min(length, WINDOW_BYTES));
	const count = readSync(fd, buffer, 0, buffer.length, position);
	return buffer.subarray(0, count);
}

function reject(message: string): never {
	// PUBLIC: `message` is one of this module's own policy sentences (never the
	// file's bytes, a path or client text).
	const reason = `File content verification failed: ${message} — rejected`;
	throw new DedaloError('media.upload_rejected', { message: reason, publicMessage: reason });
}

function u32le(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] as number) |
			((bytes[offset + 1] as number) << 8) |
			((bytes[offset + 2] as number) << 16) |
			((bytes[offset + 3] as number) << 24)) >>>
		0
	);
}

function u32be(bytes: Uint8Array, offset: number): number {
	return (
		(((bytes[offset] as number) << 24) |
			((bytes[offset + 1] as number) << 16) |
			((bytes[offset + 2] as number) << 8) |
			(bytes[offset + 3] as number)) >>>
		0
	);
}

function isAscii(bytes: Uint8Array, offset: number, text: string): boolean {
	if (offset + text.length > bytes.length) return false;
	for (let i = 0; i < text.length; i++) {
		if (bytes[offset + i] !== text.charCodeAt(i)) return false;
	}
	return true;
}

/** Index of `needle` in `haystack`, or -1. */
function indexOfBytes(haystack: Uint8Array, needle: readonly number[]): number {
	outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) continue outer;
		}
		return i;
	}
	return -1;
}

/**
 * The file's terminator must appear within its last TAIL_BYTES. Scanned BACKWARD
 * in windows, stopping at the first hit, with a (needle-1)-byte overlap so a
 * terminator straddling a window boundary is still found.
 *
 * This detects a TRUNCATED transfer. It deliberately does not care what follows
 * the terminator: appending after it is legal in practice for every format that
 * reaches this function (see the `jpeg` policy row).
 */
function requireTerminator(
	fd: number,
	size: number,
	needle: readonly number[],
	label: string,
): void {
	const span = Math.min(size, TAIL_BYTES);
	const floor = size - span;
	const overlap = needle.length - 1;
	let end = size;
	while (end > floor) {
		const start = Math.max(floor, end - WINDOW_BYTES);
		const window = readAt(fd, start, end - start);
		if (window.length === 0) break;
		if (indexOfBytes(window, needle) !== -1) return;
		if (start === floor) break;
		end = start + overlap;
	}
	reject(`no ${label} in the last ${span} bytes (truncated, or a header bolted onto foreign data)`);
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/**
 * Accept the bytes from `offset` to EOF as trailing padding when they are ALL
 * ZERO and bounded by TRAILING_PAD_BYTES; refuse otherwise.
 *
 * This is what makes block-aligned container output survive: a capture card or a
 * tape-out pipeline pads an MP4 to a 512 B (or 64 KB, or 256 KB) boundary, which
 * the box chain cannot account for and every demuxer ignores.
 */
function acceptTrailingZeroPadding(fd: number, offset: number, size: number, what: string): void {
	const remaining = size - offset;
	if (remaining > TRAILING_PAD_BYTES) {
		reject(
			`${remaining} unaccounted bytes at offset ${offset} (${what}) — too large to be block padding`,
		);
	}
	let position = offset;
	while (position < size) {
		const window = readAt(fd, position, Math.min(WINDOW_BYTES, size - position));
		if (window.length === 0) reject(`unreadable trailing region at offset ${position}`);
		for (let i = 0; i < window.length; i++) {
			if (window[i] !== 0) {
				reject(
					`${remaining} unaccounted non-zero bytes at offset ${offset} (${what}) — appended payload`,
				);
			}
		}
		position += window.length;
	}
}

/**
 * RIFF: a chain of `<'RIFF'><u32 le size><payload>` chunks (a WebP/WAV is one;
 * an OpenDML AVI over 2 GB is several).
 *
 * Only ONE thing is refused: a chunk whose declared payload runs past EOF, i.e.
 * a truncated transfer. Two things that were refused and must not be:
 *
 *   • the STREAMING SENTINEL. `ffmpeg` writing a WAV to a pipe (or any other
 *     non-seekable sink) cannot go back and patch the size, so it writes
 *     `0xFFFFFFFF`. Every decoder reads that as "extends to EOF" and so does
 *     this now. The previous code recognised the sentinel explicitly and
 *     rejected it anyway on the grounds that "guessing is not an option" — but
 *     it is not a guess, it is what the format means in that position.
 *   • TRAILING BYTES that are not another RIFF chunk. A tag appended outside the
 *     RIFF size (ID3v1/APE after a WAV, a writer that forgot to update the
 *     header) is ordinary real-world output; the chain simply ends there.
 */
function verifyRiffChain(fd: number, size: number): void {
	let offset = 0;
	while (offset < size) {
		const header = readAt(fd, offset, 8);
		// Not (or no longer) a RIFF chunk: the chain has ended. Anything after it is
		// a trailing tag, which is accepted. (The head sniff already proved offset 0
		// IS 'RIFF', so this can only fire on genuine trailing data.)
		if (header.length < 8 || !isAscii(header, 0, 'RIFF')) return;
		const declared = u32le(header, 4);
		// The streaming sentinel: an unknown-length chunk that runs to EOF.
		if (declared === 0xffffffff) return;
		const payloadEnd = offset + 8 + declared;
		if (payloadEnd > size) {
			reject(
				`a RIFF chunk at offset ${offset} declares ${declared} bytes, past the end of a ${size}-byte file (truncated transfer)`,
			);
		}
		// A pad byte follows an odd-length chunk (RIFF alignment) — but the last
		// chunk of a file is frequently written without it, so it is clamped, never
		// required.
		const next = Math.min(payloadEnd + (declared % 2), size);
		if (next <= offset) reject(`a RIFF chunk at offset ${offset} makes no progress`);
		offset = next;
	}
}

/**
 * ISO-BMFF (mp4/mov/heic/avif): top-level boxes `<u32 be size><4cc type>` (with
 * the 64-bit `size==1` largesize form and the `size==0` extends-to-EOF form).
 * Reading only box headers means a 30 GB video costs a few dozen 16-byte reads.
 *
 * Refused: a box that declares bytes past EOF (a truncated transfer), and a
 * trailing region that is neither a parsable box nor zero padding.
 *
 * NOT refused (and this is the 2026-08-03 correction): trailing ZERO padding.
 * A block-aligned writer pads the file and the chain cannot tile it exactly; the
 * previous code called that "an appended payload" and refused genuine capture-
 * card and tape-out masters.
 */
function verifyBmffChain(fd: number, size: number): void {
	let offset = 0;
	while (offset < size) {
		const header = readAt(fd, offset, 16);
		if (header.length < 8) {
			acceptTrailingZeroPadding(fd, offset, size, 'a truncated box header');
			return;
		}
		// The 4CC type must be printable. This check runs BEFORE `size==0` is read as
		// 'extends to EOF', because otherwise a run of appended NUL bytes would parse
		// as a size-0 box and declare ITSELF the last box. A non-printable type is
		// therefore the padding/garbage branch, not a box.
		let printable = true;
		for (let i = 4; i < 8; i++) {
			const byte = header[i] as number;
			// 0xA9 is the legacy QuickTime '©' metadata prefix — tolerated, not required.
			if ((byte < 0x20 || byte > 0x7e) && byte !== 0xa9) printable = false;
		}
		if (!printable) {
			acceptTrailingZeroPadding(fd, offset, size, 'a non-printable ISO-BMFF box type');
			return;
		}
		let boxSize = u32be(header, 0);
		let headerSize = 8;
		if (boxSize === 1) {
			if (header.length < 16) reject(`truncated 64-bit box header at offset ${offset}`);
			const large = new DataView(header.buffer, header.byteOffset + 8, 8).getBigUint64(0, false);
			if (large > BigInt(Number.MAX_SAFE_INTEGER))
				reject('an ISO-BMFF box declares an absurd size');
			boxSize = Number(large);
			headerSize = 16;
		} else if (boxSize === 0) {
			// 'to end of file' — legal for the LAST box, and what a non-seekable muxer
			// writes for `mdat`. Everything from here on belongs to it.
			return;
		}
		if (boxSize < headerSize)
			reject(`an ISO-BMFF box at offset ${offset} declares an invalid size`);
		if (offset + boxSize > size) {
			reject(
				`an ISO-BMFF box at offset ${offset} declares ${boxSize} bytes, past the end of a ${size}-byte file (truncated transfer)`,
			);
		}
		offset += boxSize;
	}
}

/** Dispatch the bounded structural check for a container that declares its extent. */
function verifyStructure(fd: number, size: number, kind: string): void {
	switch (kind) {
		case 'jpeg':
			requireTerminator(fd, size, [0xff, 0xd9], 'JPEG EOI marker');
			return;
		case 'png':
			requireTerminator(fd, size, ascii('IEND'), 'PNG IEND chunk');
			return;
		case 'pdf':
			requireTerminator(fd, size, ascii('%%EOF'), 'PDF %%EOF trailer');
			return;
		case 'zip':
			requireTerminator(fd, size, [0x50, 0x4b, 0x05, 0x06], 'ZIP end-of-central-directory record');
			return;
		case 'bmp': {
			const declared = u32le(readAt(fd, 0, 6), 2);
			// ONE DIRECTION ONLY. Some writers leave bfSize at 0, some set it to the
			// pixel-array size, and some files carry trailing metadata — all of which
			// make `declared < size`, and all of which every decoder reads. Only a
			// declaration LARGER than the file means bytes are missing.
			if (declared > size) {
				reject(`the BMP header declares ${declared} bytes but the file holds only ${size}`);
			}
			return;
		}
		case 'glb': {
			const declared = u32le(readAt(fd, 0, 12), 8);
			// Same one-directional rule as bmp: exporters that pad the file to an
			// alignment boundary are legal, a short file is not.
			if (declared > size) {
				reject(`the glTF binary header declares ${declared} bytes but the file holds only ${size}`);
			}
			return;
		}
		case 'webp':
		case 'wav':
		case 'avi':
			verifyRiffChain(fd, size);
			return;
		case 'mp4':
		case 'mov':
		case 'heic':
		case 'avif':
			verifyBmffChain(fd, size);
			return;
		default:
			// Unreachable: VERIFICATION_POLICY and this switch are gated against each
			// other by test/unit/media_engine.test.ts. Loud rather than lenient.
			reject(`no structural verifier is wired for content kind '${kind}'`);
	}
}

/**
 * Verify a staged file on disk: re-sniff its signature against the declared
 * extension (the historic SEC-066 check, unchanged) AND verify the container to
 * the depth VERIFICATION_POLICY states for that content class. Returns the
 * normalized extension; throws on any failure. Peak memory is one window.
 *
 * A throw from here does NOT authorise deleting the file — see
 * `joinChunkedUpload`, which quarantines the transfer instead.
 */
export function verifyFileContent(path: string, declaredExtension: string): string {
	const fd = openSync(path, 'r');
	try {
		const size = fstatSync(fd).size;
		const head = readAt(fd, 0, SNIFF_BYTES);
		// The head sniff first: it is the cheapest rejection and it is what decides
		// which content class the rest of this function is allowed to assume.
		const extension = sniffAndValidate(head, declaredExtension);
		const sniffed = sniffBytes(head);
		// sniffBytes returns null for the extension-only 3D formats (obj/fbx/dae),
		// which sniffAndValidate accepts on the extension alone — key the policy on
		// the extension in exactly that case.
		const kind = sniffed === null ? extension : sniffed.kind;
		const policy = VERIFICATION_POLICY[kind];
		if (policy === undefined) {
			// Never silently narrow: an unlisted content class is refused, not waved
			// through with a head-only check.
			throw new Error(
				`File content kind '${kind}' has no verification policy (src/core/media/engine/verify_content.ts) — rejected`,
			);
		}
		if (policy.depth === 'structural') verifyStructure(fd, size, kind);
		return extension;
	} finally {
		closeSync(fd);
	}
}
