/**
 * media.manifest WIRE (engine side) — the page parser and the cursor collector behind
 * hostMediaManifest (publication-host copy mode). Pure halves only: the network half
 * goes through the phase-3 door (transport.ts, whose query grammar the door gate pins)
 * and is exercised by the phase-5 drill.
 */

import { describe, expect, test } from 'bun:test';
import {
	collectMediaManifest,
	type MediaManifestPage,
	parseMediaManifestPage,
} from '../../src/core/publication_host/agent_client.ts';

const SHA = 'a'.repeat(64);

function codeOf(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
}

describe('parseMediaManifestPage', () => {
	test('a first page carries entries, irregular paths, markers and a cursor', () => {
		const body = {
			entries: [{ path: 'av/404/x_test3_1.mp4', size: 3, sha256: SHA }],
			irregular: ['av/404/link_test3_1.mp4'],
			markers: ['test3_1'],
			next: 'c1',
		};
		expect(parseMediaManifestPage(body, true)).toEqual(body);
	});

	test('markers on a later page are ignored (first page only, per the wire); irregular is kept on every page', () => {
		const page = parseMediaManifestPage(
			{ entries: [], irregular: ['image/.DS_Store'], markers: ['test3_1'], next: null },
			false,
		);
		expect(page.markers).toEqual([]);
		expect(page.irregular).toEqual(['image/.DS_Store']);
	});

	test('a malformed page is publication_host.failed', () => {
		const ok = { entries: [], irregular: [], markers: [], next: null };
		const bad: unknown[] = [
			null,
			'text',
			{},
			[],
			{ ...ok, entries: [{ path: 1, size: 1, sha256: SHA }] },
			{ ...ok, entries: [{ path: 'p', size: '1', sha256: SHA }] },
			{ ...ok, markers: [1] },
			{ ...ok, next: 5 },
			{ ...ok, next: 'bad cursor/with spaces' },
			{ ...ok, next: '' },
			{ entries: [], markers: [], next: null }, // irregular missing: a stray would vanish
			{ ...ok, irregular: [1] },
			{ entries: [], irregular: [], next: null }, // markers missing
		];
		expect(bad.length).toBeGreaterThan(10); // anti-vacuity: the refusal table is populated
		for (const body of bad) {
			expect(
				codeOf(() => parseMediaManifestPage(body, true)),
				JSON.stringify(body),
			).toBe('publication_host.failed');
		}
	});
});

describe('collectMediaManifest', () => {
	test('follows cursors to the end; markers come from the first page; irregular from all', async () => {
		const pages = new Map<string | null, MediaManifestPage>([
			[
				null,
				{
					entries: [{ path: 'a', size: 1, sha256: SHA }],
					irregular: ['a.lnk'],
					markers: ['test3_1'],
					next: 'c1',
				},
			],
			[
				'c1',
				{ entries: [{ path: 'b', size: 2, sha256: SHA }], irregular: [], markers: [], next: 'c2' },
			],
			['c2', { entries: [], irregular: ['z/.x'], markers: [], next: null }],
		]);
		const asked: (string | null)[] = [];
		const manifest = await collectMediaManifest(async (cursor) => {
			asked.push(cursor);
			return pages.get(cursor) as MediaManifestPage;
		});
		expect(asked).toEqual([null, 'c1', 'c2']);
		expect(manifest).toEqual({
			entries: [
				{ path: 'a', size: 1, sha256: SHA },
				{ path: 'b', size: 2, sha256: SHA },
			],
			irregular: ['a.lnk', 'z/.x'],
			markers: ['test3_1'],
		});
	});

	test('a repeated cursor is refused (an agent paging in a loop never hangs the reconcile)', async () => {
		await expect(
			collectMediaManifest(async () => ({ entries: [], irregular: [], markers: [], next: 'c1' })),
		).rejects.toMatchObject({ code: 'publication_host.failed' });
	});
});
