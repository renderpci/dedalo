/**
 * API JSON responses are gzip-negotiated, and compression is a TRANSPORT
 * concern that never changes the wire SHAPE.
 *
 * The invariant that matters is the last one: whatever the negotiation decides,
 * the bytes the client ends up parsing must be byte-identical to the bytes the
 * uncompressed door would have sent. A compression change that alters the JSON
 * is a wire divergence, not an optimization.
 *
 * Measured motivation (numisdata3/1 edit read, 297,174 B of JSON):
 * level 1 → 31,831 B in 0.86 ms; level 9 → 21,734 B in 2.61 ms. Level 1 buys
 * 89% of the level-9 win for a third of the CPU. On a Fast-4G link (~200 KB/s
 * effective) the 265 KB it removes is over a second PER RECORD OPEN.
 */

import { describe, expect, test } from 'bun:test';
import { MIN_GZIP_BYTES } from '../../src/core/api/static_asset.ts';
import { jsonApiResponse } from '../../src/server.ts';

/** A body whose JSON comfortably exceeds the threshold, with realistic redundancy. */
function largeBody(): Record<string, unknown> {
	return {
		result: Array.from({ length: 400 }, (_, index) => ({
			section_tipo: 'numisdata3',
			section_id: index,
			tools: ['tool_time_machine', 'tool_export', 'tool_import'],
			label: 'Repeated label text that compresses extremely well',
		})),
		msg: 'OK',
		csrf_token: 'a'.repeat(64),
	};
}

const requestWith = (accept: string | null): Request =>
	new Request('http://localhost/dedalo/core/api/v1/json/', {
		method: 'POST',
		headers: accept === null ? {} : { 'accept-encoding': accept },
	});

const freshHeaders = () => new Headers({ 'Content-Type': 'application/json' });

describe('API response gzip negotiation', () => {
	test('a large body IS gzipped when the client offers gzip', async () => {
		const body = largeBody();
		const response = jsonApiResponse(body, 200, freshHeaders(), requestWith('gzip, deflate, br'));

		expect(response.headers.get('Content-Encoding')).toBe('gzip');
		expect(response.headers.get('Vary')).toContain('Accept-Encoding');

		// The decompressed bytes must equal the plain JSON exactly.
		const compressed = new Uint8Array(await response.arrayBuffer());
		const restored = new TextDecoder().decode(Bun.gunzipSync(compressed));
		expect(restored).toBe(JSON.stringify(body));
		expect(compressed.byteLength).toBeLessThan(
			new TextEncoder().encode(JSON.stringify(body)).byteLength,
		);
	});

	test('a large body is NOT gzipped when the client does not offer it', async () => {
		const body = largeBody();
		const response = jsonApiResponse(body, 200, freshHeaders(), requestWith(null));

		expect(response.headers.get('Content-Encoding')).toBeNull();
		expect(await response.text()).toBe(JSON.stringify(body));
	});

	test('a body at or below MIN_GZIP_BYTES is never compressed', async () => {
		const body = { result: 'x'.repeat(200), msg: 'OK' };
		expect(new TextEncoder().encode(JSON.stringify(body)).byteLength).toBeLessThan(MIN_GZIP_BYTES);
		const response = jsonApiResponse(body, 200, freshHeaders(), requestWith('gzip'));

		expect(response.headers.get('Content-Encoding')).toBeNull();
		expect(response.headers.get('Vary')).toBeNull();
		expect(await response.text()).toBe(JSON.stringify(body));
	});

	test('the threshold is measured in ENCODED BYTES, not JS string length', async () => {
		// Multibyte content: a string SHORTER than the threshold in JS characters
		// but LONGER once UTF-8 encoded. A length-based check would skip gzip here.
		const body = { result: 'éñ中'.repeat(200), msg: 'OK' };
		const json = JSON.stringify(body);
		const encoded = new TextEncoder().encode(json).byteLength;
		expect(encoded).toBeGreaterThan(MIN_GZIP_BYTES);

		const response = jsonApiResponse(body, 200, freshHeaders(), requestWith('gzip'));
		expect(response.headers.get('Content-Encoding')).toBe('gzip');
		const restored = new TextDecoder().decode(
			Bun.gunzipSync(new Uint8Array(await response.arrayBuffer())),
		);
		expect(restored).toBe(json);
	});

	test('status and caller headers survive negotiation (no-store is not dropped)', async () => {
		const headers = freshHeaders();
		headers.set('Cache-Control', 'no-store');
		const response = jsonApiResponse(largeBody(), 403, headers, requestWith('gzip'));

		expect(response.status).toBe(403);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(response.headers.get('Content-Encoding')).toBe('gzip');
	});
});
