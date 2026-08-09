/**
 * GEOIP DOWNLOAD — native contract gate (rewrite/CRAP_COVERAGE_PLAN.md §3.15).
 *
 * Gates the DECISION half of src/core/geoip/download.ts: URL policy, response
 * policy, the byte + stall ceilings of the pump, the zip-bomb caps of the
 * gunzip, the month-fallback candidate list, path confinement, and the
 * candidate loop of downloadCountryDb (with both byte-plumbing steps injected).
 *
 * NEVER hits the network: every Response is hand-built, and downloadCountryDb
 * always runs with a stub streamToFile.
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
	assertAcceptableResponse,
	candidateUrls,
	confinedPath,
	DB_BASENAME,
	downloadCountryDb,
	gunzipWithCaps,
	pumpToFile,
	validateDownloadUrl,
} from '../../src/core/geoip/download.ts';

const SCRATCH = mkdtempSync(join(tmpdir(), 'dd-geoip-dl-'));

afterAll(() => {
	rmSync(SCRATCH, { recursive: true, force: true });
});

/** A stream that emits the given chunks and closes. */
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	let i = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (i >= chunks.length) {
				controller.close();
				return;
			}
			controller.enqueue(chunks[i++]);
		},
	});
}

describe('validateDownloadUrl', () => {
	test('refuses http', () => {
		expect(() => validateDownloadUrl('http://download.db-ip.com/x.gz', true)).toThrow(
			/must be https/,
		);
	});

	test('refuses a foreign origin when pinned', () => {
		expect(() => validateDownloadUrl('https://evil.test/x.gz', true)).toThrow(/origin mismatch/);
	});

	test('refuses an unparseable URL', () => {
		expect(() => validateDownloadUrl('not a url', true)).toThrow(/invalid geoip download URL/);
	});

	test('accepts a foreign https origin when the pin is off (operator override)', () => {
		const parsed = validateDownloadUrl('https://evil.test/x.gz', false);
		expect(parsed.origin).toBe('https://evil.test');
		expect(parsed.href).toBe('https://evil.test/x.gz');
	});

	test('accepts the pinned DB-IP origin', () => {
		expect(
			validateDownloadUrl('https://download.db-ip.com/free/dbip-country-lite-2026-08.mmdb.gz', true)
				.pathname,
		).toBe('/free/dbip-country-lite-2026-08.mmdb.gz');
	});
});

describe('assertAcceptableResponse', () => {
	test('non-2xx is fatal with the server code in the message', () => {
		expect(() => assertAcceptableResponse(new Response('nope', { status: 500 }), 'u')).toThrow(
			/bad server response code: 500/,
		);
	});

	test('404 carries the notFound marker', () => {
		// quirk: pinned, not fixed — `notFound` is written and read NOWHERE
		// (downloadCountryDb falls through on ANY error). Dead state.
		let caught: unknown;
		try {
			assertAcceptableResponse(new Response('', { status: 404 }), 'u');
		} catch (error) {
			caught = error;
		}
		expect((caught as { notFound?: boolean }).notFound).toBe(true);
	});

	test('a null body is empty data', () => {
		expect(() => assertAcceptableResponse(new Response(null, { status: 200 }), 'u')).toThrow(
			/empty data/,
		);
	});

	test('a declared content-length over the cap is refused before a byte is read', () => {
		// Verified at authoring time: Bun preserves a contradicting content-length
		// header on a hand-built Response (the header is not recomputed).
		const response = new Response(streamOf([new Uint8Array(10)]), {
			headers: { 'content-length': '999999999' },
		});
		expect(response.headers.get('content-length')).toBe('999999999');
		expect(() => assertAcceptableResponse(response, 'u', 1000)).toThrow(/999999999 > 1000/);
	});

	test('returns the body stream when the response is acceptable', () => {
		const body = assertAcceptableResponse(new Response(streamOf([new Uint8Array(4)])), 'u', 1000);
		expect(body).toBeInstanceOf(ReadableStream);
	});
});

describe('pumpToFile', () => {
	test('trips the byte cap mid-stream', async () => {
		const dest = join(SCRATCH, 'cap.bin');
		const chunks = [new Uint8Array(100), new Uint8Array(100), new Uint8Array(100)];
		await expect(pumpToFile(streamOf(chunks), dest, 150)).rejects.toThrow(
			/exceeds the 150-byte cap/,
		);
	});

	test('writes every byte when under the cap', async () => {
		const dest = join(SCRATCH, 'ok.bin');
		const chunks = [new Uint8Array(100).fill(1), new Uint8Array(100).fill(2), new Uint8Array(100)];
		const total = await pumpToFile(streamOf(chunks), dest, 1000);
		expect(total).toBe(300);
		expect(statSync(dest).size).toBe(300);
	});

	test('a never-resolving pull trips the stall guard', async () => {
		const dest = join(SCRATCH, 'stall.bin');
		const body = new ReadableStream<Uint8Array>({
			pull() {
				return new Promise<void>(() => {}); // never settles
			},
		});
		await expect(pumpToFile(body, dest, 1000, 50)).rejects.toThrow(/download stalled/);
	}, 2000); // explicit short timeout: a deleted stall guard hangs rather than asserts

	test('an empty stream is empty data', async () => {
		const dest = join(SCRATCH, 'empty.bin');
		await expect(pumpToFile(streamOf([]), dest, 1000)).rejects.toThrow(/empty data/);
	});
});

describe('gunzipWithCaps', () => {
	test('round-trips a payload', async () => {
		const src = join(SCRATCH, 'rt.gz');
		const dest = join(SCRATCH, 'rt.out');
		const payload = Buffer.alloc(5000, 7);
		writeFileSync(src, gzipSync(payload));
		const out = await gunzipWithCaps(src, dest);
		expect(out).toBe(5000);
		expect(readFileSync(dest).equals(payload)).toBe(true);
	});

	test('the byte cap removes the partial output', async () => {
		const src = join(SCRATCH, 'big.gz');
		const dest = join(SCRATCH, 'big.out');
		writeFileSync(src, gzipSync(Buffer.alloc(5000, 7)));
		await expect(gunzipWithCaps(src, dest, { maxBytes: 1000 })).rejects.toThrow(
			/decompressed output exceeds 1000 bytes/,
		);
		await Bun.sleep(20); // settle — see the non-gzip case: the wait IS the detector
		expect(existsSync(dest)).toBe(false);
	});

	test('the ratio cap only applies above the floor — floor measured, not guessed', async () => {
		const src = join(SCRATCH, 'ratio.gz');
		const payload = Buffer.alloc(100_000, 0); // compresses ~800x
		writeFileSync(src, gzipSync(payload));
		const compressedSize = statSync(src).size;

		// Below the floor: the ratio guard is inert, the payload comes through.
		const underFloor = join(SCRATCH, 'ratio_underfloor.out');
		const out = await gunzipWithCaps(src, underFloor, {
			maxRatio: 10,
			ratioFloorBytes: compressedSize + 1,
		});
		expect(out).toBe(100_000);

		// Above the floor: the same payload trips the ratio guard.
		const overFloor = join(SCRATCH, 'ratio_overfloor.out');
		await expect(
			gunzipWithCaps(src, overFloor, { maxRatio: 10, ratioFloorBytes: compressedSize - 1 }),
		).rejects.toThrow(/decompression ratio exceeds 10x/);
		await Bun.sleep(20); // settle — see the non-gzip case: the wait IS the detector
		expect(existsSync(overFloor)).toBe(false);
	});

	/**
	 * THE SETTLING WAIT IS THE DETECTOR — DO NOT DELETE IT.
	 *
	 * `createWriteStream` opens its fd asynchronously. The bug this pins was that
	 * the catch's rmSync ran while that open was still pending, so the unlink hit
	 * nothing and the open then RE-CREATED the file a few ms later (27-45% of
	 * failures). Asserting immediately after the rejection therefore PASSES even
	 * when the bug is present — the file does not exist yet. Only after the loop
	 * settles does the leftover appear.
	 *
	 * Verified by mutation: drop the `await once(sink,'close')` in gunzipWithCaps
	 * and this test goes red WITH the wait, and stays green WITHOUT it.
	 */
	test('non-gzip input is rejected and leaves no destination file', async () => {
		const src = join(SCRATCH, 'plain.bin');
		writeFileSync(src, 'this is not gzip at all');
		// REPEATED because the race is probabilistic (~50% per attempt): a single
		// attempt would catch a regression only half the time. 20 attempts put that
		// at 1 - 0.5^20, i.e. effectively deterministic, for ~20ms of settling.
		const leftovers: string[] = [];
		for (let i = 0; i < 20; i++) {
			const dest = join(SCRATCH, `plain_${i}.out`);
			await expect(gunzipWithCaps(src, dest)).rejects.toThrow();
			if (existsSync(dest)) leftovers.push(`${i}:immediate`);
		}
		await Bun.sleep(20); // settle: a re-created file surfaces here, not before
		for (let i = 0; i < 20; i++) {
			if (existsSync(join(SCRATCH, `plain_${i}.out`))) leftovers.push(`${i}:settled`);
		}
		expect(leftovers).toEqual([]);
	});
});

describe('candidateUrls', () => {
	test('current month first, previous month second', () => {
		expect(candidateUrls(undefined, new Date(Date.UTC(2026, 7, 8)))).toEqual([
			'https://download.db-ip.com/free/dbip-country-lite-2026-08.mmdb.gz',
			'https://download.db-ip.com/free/dbip-country-lite-2026-07.mmdb.gz',
		]);
	});

	test('January wraps to the previous December', () => {
		expect(candidateUrls(undefined, new Date(Date.UTC(2026, 0, 3)))).toEqual([
			'https://download.db-ip.com/free/dbip-country-lite-2026-01.mmdb.gz',
			'https://download.db-ip.com/free/dbip-country-lite-2025-12.mmdb.gz',
		]);
	});

	test('an override is a single trimmed candidate', () => {
		expect(candidateUrls('  https://mirror.test/db.gz  ', new Date(Date.UTC(2026, 7, 8)))).toEqual([
			'https://mirror.test/db.gz',
		]);
	});

	test('a blank override falls back to the month logic', () => {
		expect(candidateUrls('   ', new Date(Date.UTC(2026, 7, 8))).length).toBe(2);
	});
});

describe('confinedPath', () => {
	test('rejects traversal, separators and NUL', () => {
		expect(confinedPath(SCRATCH, '../evil')).toBeNull();
		expect(confinedPath(SCRATCH, 'a/b')).toBeNull();
		expect(confinedPath(SCRATCH, 'a\0b')).toBeNull();
	});

	test('accepts a plain basename under the dir', () => {
		expect(confinedPath(SCRATCH, DB_BASENAME)).toBe(join(SCRATCH, DB_BASENAME));
	});
});

describe('downloadCountryDb', () => {
	afterEach(() => {
		// process-wide: never leave it set for the rest of the suite
		delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
	});

	test('walks the month candidates in order and returns the LAST error, without rejecting', async () => {
		const dir = join(SCRATCH, 'loop');
		const seen: string[] = [];
		const result = await downloadCountryDb(dir, undefined, {
			streamToFile: async (url) => {
				seen.push(url);
				throw new Error(seen.length === 1 ? 'first' : 'second');
			},
			gunzipWithCaps: async () => {
				throw new Error('must not decompress');
			},
		});
		expect(result).toEqual({ ok: false, error: 'second' });
		expect(seen.length).toBe(2);
		const ordinals = seen.map((url) => {
			const match = url.match(/lite-(\d{4})-(\d{2})\.mmdb\.gz$/);
			expect(match).not.toBeNull();
			const found = match as RegExpMatchArray;
			return Number(found[1]) * 12 + Number(found[2]);
		});
		expect(ordinals[0]).toBeDefined();
		expect((ordinals[0] as number) - (ordinals[1] as number)).toBe(1); // strictly month-descending
	});

	test('the second candidate can succeed after the first fails', async () => {
		const dir = join(SCRATCH, 'second_ok');
		let calls = 0;
		const result = await downloadCountryDb(dir, undefined, {
			streamToFile: async () => {
				calls += 1;
				if (calls === 1) throw new Error('404-ish');
				return 10;
			},
			gunzipWithCaps: async () => 20,
		});
		expect(result).toEqual({ ok: true, mmdbPath: join(dir, DB_BASENAME) });
		expect(calls).toBe(2);
	});

	test('an override is pin-free and tried once', async () => {
		const dir = join(SCRATCH, 'override');
		const seen: string[] = [];
		const result = await downloadCountryDb(dir, ' https://mirror.test/db.gz ', {
			streamToFile: async (url, _dest, pinToDbip) => {
				seen.push(`${url}|${pinToDbip}`);
				throw new Error('boom');
			},
		});
		expect(seen).toEqual(['https://mirror.test/db.gz|false']);
		expect(result.ok).toBe(false);
	});

	test('NODE_TLS_REJECT_UNAUTHORIZED=0 refuses before any transfer', async () => {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		let called = false;
		const result = await downloadCountryDb(join(SCRATCH, 'tls'), undefined, {
			streamToFile: async () => {
				called = true;
				return 1;
			},
		});
		expect(called).toBe(false);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/NODE_TLS_REJECT_UNAUTHORIZED=0/);
	});
});

describe('rewire proof — the inline copies are gone from download.ts', () => {
	const source = readFileSync(
		new URL('../../src/core/geoip/download.ts', import.meta.url).pathname,
		'utf8',
	);

	test('streamToFile no longer inlines the URL / response / pump logic', () => {
		// the URL policy lives in exactly one place now
		expect(source.match(/must be https/g)?.length).toBe(1);
		expect(source.match(/bad server response code/g)?.length).toBe(1);
		expect(source.match(/download stalled/g)?.length).toBe(1);
		// the composed shell delegates
		expect(source).toContain('const parsed = validateDownloadUrl(url, pinToDbip);');
		expect(source).toContain('const body = assertAcceptableResponse(remote, url);');
		expect(source).toContain('return await pumpToFile(body, destPath);');
		// and the hardcoded module constants are gone from the pump/gunzip bodies
		expect(source).not.toContain(
			"reject(new Error('download stalled')), DOWNLOAD_STALL_TIMEOUT_MS",
		);
		expect(source).not.toContain('MAX_DECOMPRESSION_RATIO}x');
		expect(source).not.toContain('total > MAX_DOWNLOAD_BYTES');
	});

	test('downloadCountryDb calls the injected seams, not the module locals', () => {
		expect(source).toContain('await fetchFile(url, gzPath, pinToDbip);');
		expect(source).toContain('await decompress(gzPath, mmdbPath);');
		expect(source).not.toContain('await streamToFile(url, gzPath, pinToDbip);');
		expect(source).not.toContain('await gunzipWithCaps(gzPath, mmdbPath);');
	});
});
