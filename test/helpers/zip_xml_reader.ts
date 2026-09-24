/**
 * A STRICT, INDEPENDENT reader for the archives and XML the engine writes —
 * the gates' consumer, deliberately NOT sharing a line with the writer under
 * test (src/diffusion/writers/files.ts): it parses the central directory the
 * way APPNOTE says a reader must (ZIP64 end record via its locator, ZIP64
 * extras only for the fields that carry the 0xFFFFFFFF sentinel), checks every
 * local header against its central record, inflates, verifies every CRC-32 and
 * every data descriptor, and REFUSES (throws) anything inconsistent.
 *
 * `parseXml` is a small well-formedness parser (tag balance, attributes,
 * entities, XML 1.0 characters) — enough to prove the spreadsheet parts are
 * XML and to walk them; it throws on malformed input.
 */

import { crc32, inflateRawSync } from 'node:zlib';

export interface ZipReadEntry {
	name: string;
	flags: number;
	method: number;
	versionNeeded: number;
	crc: number;
	compressedSize: number;
	uncompressedSize: number;
	offset: number;
	/** Length of the LOCAL header's extra field. */
	localExtraLength: number;
	/** The central record carried a ZIP64 extra. */
	centralZip64: boolean;
	/** The local record carried a ZIP64 extra. */
	localZip64: boolean;
	/** The data descriptor was 8-byte-sized (only when bit 3). */
	wideDescriptor: boolean | null;
	data: Uint8Array;
}

export interface ZipReadResult {
	entries: ZipReadEntry[];
	/** A ZIP64 end record + locator were present. */
	zip64End: boolean;
	count: number;
}

function fail(message: string): never {
	throw new Error(`zip reader: ${message}`);
}

export function readZip(bytes: Uint8Array): ZipReadResult {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let eocd = -1;
	for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
		if (view.getUint32(at, true) === 0x06054b50) {
			eocd = at;
			break;
		}
	}
	if (eocd < 0) fail('no end of central directory');
	let count = view.getUint16(eocd + 10, true);
	let cdSize = view.getUint32(eocd + 12, true);
	let cdOffset = view.getUint32(eocd + 16, true);
	let zip64End = false;
	if (eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) {
		zip64End = true;
		const end64 = Number(view.getBigUint64(eocd - 12, true));
		if (view.getUint32(end64, true) !== 0x06064b50) fail('bad zip64 end record');
		if (end64 + 56 !== eocd - 20) fail('zip64 end record not adjacent to its locator');
		const count64 = Number(view.getBigUint64(end64 + 32, true));
		const size64 = Number(view.getBigUint64(end64 + 40, true));
		const offset64 = Number(view.getBigUint64(end64 + 48, true));
		// a 32/16-bit field either agrees or is the sentinel
		if (count !== 0xffff && count !== count64) fail('count disagrees with zip64 end');
		if (cdSize !== 0xffffffff && cdSize !== size64) fail('cd size disagrees with zip64 end');
		if (cdOffset !== 0xffffffff && cdOffset !== offset64) fail('cd offset disagrees');
		count = count64;
		cdSize = size64;
		cdOffset = offset64;
	} else if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
		fail('sentinel in end record without a zip64 end record');
	}
	const endOfData = zip64End ? eocd - 20 - 56 : eocd;
	if (cdOffset + cdSize !== endOfData) fail('central directory is not where the end says');

	const entries: ZipReadEntry[] = [];
	let at = cdOffset;
	const decoder = new TextDecoder('utf-8', { fatal: true });
	for (let n = 0; n < count; n++) {
		if (view.getUint32(at, true) !== 0x02014b50) fail(`bad central header #${n}`);
		const versionNeeded = view.getUint16(at + 6, true);
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const crc = view.getUint32(at + 16, true);
		let compressedSize = view.getUint32(at + 20, true);
		let uncompressedSize = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		let offset = view.getUint32(at + 42, true);
		const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
		const name = decoder.decode(nameBytes);
		if (nameBytes.some((byte) => byte > 0x7f) && !(flags & 0x0800)) {
			fail(`non-ASCII name '${name}' without the UTF-8 flag`);
		}
		let centralZip64 = false;
		let extraAt = at + 46 + nameLength;
		const extraEnd = extraAt + extraLength;
		while (extraAt < extraEnd) {
			const id = view.getUint16(extraAt, true);
			const size = view.getUint16(extraAt + 2, true);
			if (id === 0x0001) {
				centralZip64 = true;
				let field = extraAt + 4;
				const take = () => {
					if (field + 8 > extraAt + 4 + size) fail('short zip64 extra');
					const value = Number(view.getBigUint64(field, true));
					field += 8;
					return value;
				};
				if (uncompressedSize === 0xffffffff) uncompressedSize = take();
				if (compressedSize === 0xffffffff) compressedSize = take();
				if (offset === 0xffffffff) offset = take();
				if (field !== extraAt + 4 + size) fail('zip64 extra longer than its sentinels');
			}
			extraAt += 4 + size;
		}
		if (centralZip64 && versionNeeded < 45) fail('zip64 entry with version needed < 45');

		// the local header
		if (view.getUint32(offset, true) !== 0x04034b50) fail(`bad local header for '${name}'`);
		const localFlags = view.getUint16(offset + 6, true);
		const localMethod = view.getUint16(offset + 8, true);
		const localNameLength = view.getUint16(offset + 26, true);
		const localExtraLength = view.getUint16(offset + 28, true);
		if (localFlags !== flags || localMethod !== method) fail(`local/central mismatch '${name}'`);
		const localName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength));
		if (localName !== name) fail(`local name '${localName}' != central '${name}'`);
		let localZip64 = false;
		let localAt = offset + 30 + localNameLength;
		const localExtraEnd = localAt + localExtraLength;
		while (localAt < localExtraEnd) {
			if (view.getUint16(localAt, true) === 0x0001) localZip64 = true;
			localAt += 4 + view.getUint16(localAt + 2, true);
		}
		const streamed = (flags & 0x0008) !== 0;
		if (!streamed) {
			const localCrc = view.getUint32(offset + 14, true);
			if (localCrc !== crc) fail(`local crc mismatch '${name}'`);
			if (localZip64) {
				const extra = offset + 30 + localNameLength;
				if (Number(view.getBigUint64(extra + 4, true)) !== uncompressedSize)
					fail('local zip64 size');
				if (Number(view.getBigUint64(extra + 12, true)) !== compressedSize)
					fail('local zip64 csize');
			} else {
				if (view.getUint32(offset + 18, true) !== compressedSize) fail(`local csize '${name}'`);
				if (view.getUint32(offset + 22, true) !== uncompressedSize) fail(`local size '${name}'`);
			}
		}
		const dataStart = offset + 30 + localNameLength + localExtraLength;
		const raw = bytes.subarray(dataStart, dataStart + compressedSize);
		let wideDescriptor: boolean | null = null;
		if (streamed) {
			const d = dataStart + compressedSize;
			if (view.getUint32(d, true) !== 0x08074b50) fail(`no data descriptor for '${name}'`);
			if (view.getUint32(d + 4, true) !== crc) fail(`descriptor crc '${name}'`);
			// 8-byte sizes when the local header declared ZIP64; else whichever form matches
			const narrow =
				view.getUint32(d + 8, true) === compressedSize &&
				view.getUint32(d + 12, true) === uncompressedSize;
			const wide =
				d + 24 <= bytes.length &&
				Number(view.getBigUint64(d + 8, true)) === compressedSize &&
				Number(view.getBigUint64(d + 16, true)) === uncompressedSize;
			if (localZip64 && !wide) fail(`declared zip64 entry '${name}' without an 8-byte descriptor`);
			if (!narrow && !wide) fail(`descriptor sizes disagree for '${name}'`);
			wideDescriptor = localZip64 || !narrow;
		}
		let data: Uint8Array;
		if (method === 0) data = new Uint8Array(raw);
		else if (method === 8) data = new Uint8Array(inflateRawSync(raw));
		else fail(`unknown method ${method}`);
		if (data.length !== uncompressedSize) fail(`size mismatch '${name}'`);
		if (crc32(data) >>> 0 !== crc) fail(`crc mismatch '${name}'`);
		entries.push({
			name,
			flags,
			method,
			versionNeeded,
			crc,
			compressedSize,
			uncompressedSize,
			offset,
			localExtraLength,
			centralZip64,
			localZip64,
			wideDescriptor,
			data,
		});
		at += 46 + nameLength + extraLength + commentLength;
	}
	if (at !== cdOffset + cdSize) fail('central directory size mismatch');
	return { entries, zip64End, count };
}

export function zipText(result: ZipReadResult, name: string): string {
	const entry = result.entries.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`zip reader: no entry '${name}'`);
	return new TextDecoder('utf-8', { fatal: true }).decode(entry.data);
}

// ---------------------------------------------------------------- XML

export interface XmlElement {
	name: string;
	attrs: Record<string, string>;
	children: (XmlElement | string)[];
}

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, ref: string) => {
		if (ref === 'amp') return '&';
		if (ref === 'lt') return '<';
		if (ref === 'gt') return '>';
		if (ref === 'quot') return '"';
		if (ref === 'apos') return "'";
		const code =
			ref[1] === 'x' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
		return String.fromCodePoint(code);
	});
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting the characters XML forbids IS the check
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

/** Parse a whole document; throws on anything not well-formed. */
export function parseXml(source: string): XmlElement {
	if (FORBIDDEN.test(source)) throw new Error('xml: forbidden character');
	let at = 0;
	if (source.startsWith('<?xml')) {
		at = source.indexOf('?>') + 2;
	}
	const root: XmlElement = { name: '#document', attrs: {}, children: [] };
	const stack: XmlElement[] = [root];
	const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*"[^"<]*")*)\s*(\/?)>/y;
	const attr = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"<]*)"/g;
	while (at < source.length) {
		const lt = source.indexOf('<', at);
		const textEnd = lt === -1 ? source.length : lt;
		if (textEnd > at) {
			const raw = source.slice(at, textEnd);
			if (/&(?!(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);)/.test(raw) || raw.includes('>')) {
				// '>' is legal in text, but the writers always escape it: treat a raw one as a defect
				throw new Error(`xml: unescaped text near ${at}`);
			}
			(stack.at(-1) as XmlElement).children.push(decodeEntities(raw));
		}
		if (lt === -1) break;
		tag.lastIndex = lt;
		const match = tag.exec(source);
		if (!match) throw new Error(`xml: bad tag at ${lt}: ${source.slice(lt, lt + 60)}`);
		const [whole, closing, name, attrText, selfClosing] = match as unknown as string[];
		if (closing) {
			const open = stack.pop();
			if (!open || open.name !== name) throw new Error(`xml: </${name}> closes ${open?.name}`);
		} else {
			const attrs: Record<string, string> = {};
			for (const pair of (attrText ?? '').matchAll(attr)) {
				if (Object.hasOwn(attrs, pair[1] as string)) throw new Error('xml: duplicate attribute');
				attrs[pair[1] as string] = decodeEntities(pair[2] as string);
			}
			const element: XmlElement = { name: name as string, attrs, children: [] };
			(stack.at(-1) as XmlElement).children.push(element);
			if (!selfClosing) stack.push(element);
		}
		at = lt + (whole as string).length;
	}
	if (stack.length !== 1) throw new Error(`xml: unclosed <${stack.at(-1)?.name}>`);
	const elements = root.children.filter((child): child is XmlElement => typeof child !== 'string');
	if (elements.length !== 1) throw new Error('xml: not exactly one root element');
	return elements[0] as XmlElement;
}

/** Direct element children named `name`. */
export function childElements(element: XmlElement, name: string): XmlElement[] {
	return element.children.filter(
		(child): child is XmlElement => typeof child !== 'string' && child.name === name,
	);
}

/** Every descendant element named `name`, document order. */
export function descendants(element: XmlElement, name: string): XmlElement[] {
	const out: XmlElement[] = [];
	for (const child of element.children) {
		if (typeof child === 'string') continue;
		if (child.name === name) out.push(child);
		out.push(...descendants(child, name));
	}
	return out;
}
