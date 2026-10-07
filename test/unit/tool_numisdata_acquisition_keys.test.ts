/**
 * tool_numisdata_acquisition's dedup keys:
 *  - the CANONICAL lot URL (tools/tool_numisdata_acquisition/server/lib/acquisition/keys.ts, via
 *    SourceAdapter.canonicalLotUrl): one spelling per lot, rebuilt from the lot's own identity -
 *    the same key whatever URL variant carried the lot in, and NO key (never a shared one) when the
 *    lot's identity cannot be established. Pure.
 *  - the advisory lock (lib/acquisition/lock.ts): two spellings the engine's '==' equality
 *    (f_unaccent, case-sensitive) treats as one value must contend for ONE lock - measured on the
 *    database, by a second transaction timing out on it. No writes.
 */

import { describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { acquireDedupLock } from '../../tools/tool_numisdata_acquisition/server/lib/acquisition/lock.ts';
import { aureoAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/aureo/adapter.ts';
import { biddrAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/biddr/adapter.ts';
import { jesusvicoAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/jesusvico/adapter.ts';
import { numisbidsAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/numisbids/adapter.ts';
import { sixbidAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/sixbid/adapter.ts';
import type {
	LotKeyFields,
	SourceAdapter,
} from '../../tools/tool_numisdata_acquisition/server/lib/sources/types.ts';

function keyOf(adapter: SourceAdapter, lot: Partial<LotKeyFields>): string | null {
	const canonical = adapter.canonicalLotUrl;
	if (canonical === undefined) throw new Error(`${adapter.id} has no canonicalLotUrl`);
	return canonical({
		lotIdentifier: undefined,
		lotNumber: undefined,
		sourceUrl: undefined,
		...lot,
	});
}

/** Every canonical key is an https URL the adapter itself reads back as that single lot. */
function expectRoundTrip(adapter: SourceAdapter, key: string | null, lotIdentity: string): void {
	expect(key).not.toBeNull();
	expect(key?.startsWith('https://')).toBe(true);
	expect(adapter.matchesUrl(key as string)).toBe(true);
	expect(adapter.parseAuctionIdentifier(key as string)).toBe(lotIdentity);
}

describe('canonicalLotUrl - jesusvico (identity from the parsed lotIdentifier)', () => {
	const lotIdentifier = 'jesusvico:180:215';

	test('one key whatever URL carried the lot, round-trips as that lot', () => {
		const pasted = keyOf(jesusvicoAdapter, {
			lotIdentifier,
			sourceUrl: 'http://jesusvico.com/es/lote/I180-001/215-x-denario?utm_source=mail#g',
		});
		const card = keyOf(jesusvicoAdapter, {
			lotIdentifier,
			sourceUrl: 'https://www.jesusvico.com/en/lot/I180-001/215-y-denarius',
		});
		expect(pasted).toBe(card);
		expectRoundTrip(jesusvicoAdapter, pasted, 'lot-180-215');
	});

	test('a broken card href (resolving to the listing page) cannot make two lots share a key', () => {
		const listing = 'https://www.jesusvico.com/es/subasta-180-coleccion_I180-001';
		const a = keyOf(jesusvicoAdapter, { lotIdentifier: 'jesusvico:180:215', sourceUrl: listing });
		const b = keyOf(jesusvicoAdapter, { lotIdentifier: 'jesusvico:180:216', sourceUrl: listing });
		expect(a).not.toBeNull();
		expect(a).not.toBe(b);
	});

	test('no key without the identity', () => {
		expect(keyOf(jesusvicoAdapter, {})).toBeNull();
		expect(keyOf(jesusvicoAdapter, { lotIdentifier: '' })).toBeNull();
		expect(keyOf(jesusvicoAdapter, { lotIdentifier: 'jesusvico::215' })).toBeNull();
		expect(keyOf(jesusvicoAdapter, { lotIdentifier: 42 })).toBeNull();
	});
});

describe('canonicalLotUrl - biddr (lot id l under auction a)', () => {
	test('tracking params, scheme, host and path spellings collapse to one key', () => {
		const a = keyOf(biddrAdapter, {
			lotIdentifier: '5551',
			sourceUrl: 'http://biddr.com/auctions/nomos/browse?a=12&l=5551&utm_campaign=x#top',
		});
		const b = keyOf(biddrAdapter, {
			lotIdentifier: '5551',
			sourceUrl: 'https://www.biddr.com/auctions/Nomos/Browse?l=5551&a=12',
		});
		expect(a).toBe(b);
		expectRoundTrip(biddrAdapter, a, 'lot-5551');
	});

	test('no key from a listing/search URL, or from a URL naming another lot', () => {
		const listing = 'https://www.biddr.com/auctions/nomos/browse?a=12';
		expect(keyOf(biddrAdapter, { lotIdentifier: '5551', sourceUrl: listing })).toBeNull();
		expect(
			keyOf(biddrAdapter, { lotIdentifier: '5551', sourceUrl: `${listing}&l=9999` }),
		).toBeNull();
		expect(keyOf(biddrAdapter, { lotIdentifier: '', sourceUrl: `${listing}&l=5551` })).toBeNull();
		expect(keyOf(biddrAdapter, { lotIdentifier: '5551' })).toBeNull();
	});
});

describe('canonicalLotUrl - numisbids (sale + lot number from the lot page URL)', () => {
	test('scheme, host and query variants collapse to one key', () => {
		const a = keyOf(numisbidsAdapter, {
			lotIdentifier: 'numisbids:777',
			lotNumber: '5',
			sourceUrl: 'http://numisbids.com/sale/1234/lot/5?ref=list',
		});
		const b = keyOf(numisbidsAdapter, {
			lotIdentifier: 'numisbids:777',
			sourceUrl: 'https://www.numisbids.com/sale/1234/lot/5',
		});
		expect(a).toBe(b);
		expectRoundTrip(numisbidsAdapter, a, 'lot-1234-5');
	});

	test('no key from the sale (listing) URL, a contradicting lot number, or an id-less lot', () => {
		expect(
			keyOf(numisbidsAdapter, {
				lotIdentifier: 'numisbids:777',
				sourceUrl: 'https://www.numisbids.com/sale/1234',
			}),
		).toBeNull();
		expect(
			keyOf(numisbidsAdapter, {
				lotIdentifier: 'numisbids:777',
				lotNumber: '6',
				sourceUrl: 'https://www.numisbids.com/sale/1234/lot/5',
			}),
		).toBeNull();
		expect(
			keyOf(numisbidsAdapter, { sourceUrl: 'https://www.numisbids.com/sale/1234/lot/5' }),
		).toBeNull();
	});
});

describe('canonicalLotUrl - sixbid (global lotId, slugs dropped)', () => {
	test('slug and host variants collapse to one key', () => {
		const a = keyOf(sixbidAdapter, {
			lotIdentifier: 'sixbid:12399926',
			sourceUrl:
				'https://www.sixbid.com/en/heritage-auctions-inc/13977/argentina/12399926/la-rioja',
		});
		const b = keyOf(sixbidAdapter, {
			lotIdentifier: 'sixbid:12399926',
			sourceUrl: 'http://sixbid.com/de/Heritage-Auctions-Inc/13977/argentinien/12399926/x?utm=1',
		});
		expect(a).toBe(b);
		expectRoundTrip(sixbidAdapter, a, 'lot-12399926');
	});

	test('no key from an auction URL or a URL naming another lot', () => {
		expect(
			keyOf(sixbidAdapter, {
				lotIdentifier: 'sixbid:12399926',
				sourceUrl: 'https://www.sixbid.com/en/heritage-auctions-inc/13977/page/1/perPage/100',
			}),
		).toBeNull();
		expect(
			keyOf(sixbidAdapter, {
				lotIdentifier: 'sixbid:12399926',
				sourceUrl: 'https://www.sixbid.com/en/heritage-auctions-inc/13977/argentina/1/x',
			}),
		).toBeNull();
		expect(keyOf(sixbidAdapter, { lotIdentifier: 'sixbid:12399926' })).toBeNull();
	});
});

describe('canonicalLotUrl - aureo', () => {
	// aureo has no per-lot URL: every lot carries its auction's page, so URL dedup there would
	// collapse a whole sale into its first lot.
	test('aureo has no canonical lot URL; the per-lot sources all do', () => {
		expect(aureoAdapter.canonicalLotUrl).toBeUndefined();
		for (const adapter of [biddrAdapter, jesusvicoAdapter, numisbidsAdapter, sixbidAdapter]) {
			expect(typeof adapter.canonicalLotUrl).toBe('function');
		}
	});
});

describe('acquireDedupLock - never finer than the == equality (DB, no writes)', () => {
	/** Holds `scope+held` in one transaction while a second one tries `scope+probe` with a short
	 * lock_timeout. Resolves true when the probe was BLOCKED (same lock), false when it got in. */
	async function probeBlocked(scope: string, held: string, probe: string): Promise<boolean> {
		let release: () => void = () => {};
		const holding = new Promise<void>((resolve) => {
			release = resolve;
		});
		let locked: () => void = () => {};
		const isLocked = new Promise<void>((resolve) => {
			locked = resolve;
		});
		const holder = withTransaction(async () => {
			await acquireDedupLock(scope, held);
			locked();
			await holding;
		});
		await isLocked;
		let blocked = false;
		try {
			await withTransaction(async () => {
				await sql.unsafe("SET LOCAL lock_timeout = '300ms'");
				await acquireDedupLock(scope, probe);
			});
		} catch {
			blocked = true;
		} finally {
			release();
			await holder;
		}
		return blocked;
	}

	test('a spelling unaccent equates (typographic apostrophe, accents) takes the SAME lock', async () => {
		const scope = `zz_numisdata_acq_test:${process.pid}:`;
		// U+2019 right single quotation mark vs ASCII apostrophe, plus accents: one value to
		// f_unaccent, so one lock - the case the old JS fold got wrong.
		expect(await probeBlocked(scope, 'D’Arcy Muñoz', "D'Arcy Munoz")).toBe(true);
		// Coarser than the case-sensitive search is fine (and intended).
		expect(await probeBlocked(scope, 'Jesús Vico', 'JESUS VICO')).toBe(true);
	});

	test('an unrelated name is not blocked (the probe is not vacuous)', async () => {
		const scope = `zz_numisdata_acq_test:${process.pid}:`;
		expect(await probeBlocked(scope, 'Jesus Vico', 'Nomos')).toBe(false);
	});
});
