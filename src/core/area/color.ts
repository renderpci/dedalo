/**
 * Deterministic dashboard color per section tipo (PHP area_common::
 * get_dashboard_color, class.area_common.php:711). A CRC-32 of the tipo drives a
 * fixed-saturation/lightness HSL hue, converted to #rrggbb. Stable across
 * reloads and byte-identical to PHP (same crc32, same HSL→RGB, same rounding).
 */

let crcTable: Uint32Array | null = null;

/** IEEE 802.3 (reflected, poly 0xEDB88320) CRC-32 lookup table — same as PHP crc32/zlib. */
function crc32Table(): Uint32Array {
	if (crcTable !== null) return crcTable;
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	crcTable = table;
	return table;
}

/**
 * PHP crc32() of a string — unsigned 32-bit (64-bit PHP always returns positive).
 * Operates on the UTF-8 bytes; tipos are ASCII so this is byte-identical to PHP.
 */
export function crc32(input: string): number {
	const table = crc32Table();
	let crc = 0xffffffff;
	const bytes = new TextEncoder().encode(input);
	for (const byte of bytes) {
		crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] as number);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function hexByte(value: number): string {
	return value.toString(16).padStart(2, '0');
}

/** #rrggbb for a section tipo (PHP get_dashboard_color). */
export function dashboardColor(tipo: string): string {
	// stable hue 0-359 (crc32 is unsigned here, so abs()/%360 == %360)
	const hue = Math.abs(crc32(tipo) % 360);
	const saturation = 65 / 100;
	const lightness = 52 / 100;

	const h = hue / 360;
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = chroma * (1 - Math.abs(((h * 6) % 2) - 1));
	const m = lightness - chroma / 2;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 1 / 6) [r, g, b] = [chroma, x, 0];
	else if (h < 2 / 6) [r, g, b] = [x, chroma, 0];
	else if (h < 3 / 6) [r, g, b] = [0, chroma, x];
	else if (h < 4 / 6) [r, g, b] = [0, x, chroma];
	else if (h < 5 / 6) [r, g, b] = [x, 0, chroma];
	else [r, g, b] = [chroma, 0, x];

	// (v + m) * 255 is always >= 0, so Math.round matches PHP round (half away from zero).
	const to255 = (value: number): number => Math.round((value + m) * 255);
	return `#${hexByte(to255(r))}${hexByte(to255(g))}${hexByte(to255(b))}`;
}
