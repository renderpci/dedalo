/**
 * tool_numisdata_acquisition's pure dedup keys (tools/tool_numisdata_acquisition/server/lib/
 * acquisition/keys.ts): the rsc106 name lock-key fold must be COARSER than the engine's '=='
 * search equality (f_unaccent, case-sensitive) - never finer - and the per-lot source URL must
 * normalise to one stored/matched form. Pure: no DB, no network.
 */

import { describe, expect, test } from 'bun:test';
import {
	foldNameForLock,
	normalizeLotUrl,
} from '../../tools/tool_numisdata_acquisition/server/lib/acquisition/keys.ts';
import { aureoAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/aureo/adapter.ts';
import { biddrAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/biddr/adapter.ts';
import { jesusvicoAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/jesusvico/adapter.ts';
import { numisbidsAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/numisbids/adapter.ts';
import { sixbidAdapter } from '../../tools/tool_numisdata_acquisition/server/lib/sources/sixbid/adapter.ts';

describe('foldNameForLock', () => {
	test('folds accents (NFD combining marks)', () => {
		expect(foldNameForLock('Jesús Vico')).toBe(foldNameForLock('Jesus Vico'));
		expect(foldNameForLock('Aurèo & Calicó')).toBe('aureo & calico');
	});

	test('folds case - coarser than the case-sensitive == search', () => {
		expect(foldNameForLock('JESUS VICO')).toBe(foldNameForLock('jesus vico'));
		expect(foldNameForLock('Künker')).toBe('kunker');
	});

	test('folds the unaccent letters NFD leaves intact', () => {
		expect(foldNameForLock('Søren')).toBe('soren');
		expect(foldNameForLock('Łódź')).toBe('lodz');
		expect(foldNameForLock('Đorđe')).toBe('dorde');
		expect(foldNameForLock('Ærø')).toBe('aero');
		expect(foldNameForLock('Œuvre')).toBe('oeuvre');
		expect(foldNameForLock('Straße')).toBe('strasse');
		expect(foldNameForLock('Þór')).toBe('thor');
		// Capital sharp s lowercases to the mapped letter.
		expect(foldNameForLock('STRAẞE')).toBe('strasse');
	});

	test('maps before NFKD: l-with-middle-dot folds to a bare l, no stray middle dot', () => {
		// NFKD alone splits U+0140 into "l" + U+00B7 (not a combining mark); unaccent gives "l".
		expect(foldNameForLock('Coŀlecció')).toBe('collecci' + 'o');
		expect(foldNameForLock('ĿLEIDA')).toBe('lleida');
	});

	test('folds compatibility forms (ligature code points)', () => {
		expect(foldNameForLock('ﬁne')).toBe('fine');
	});

	test('trims, and keeps distinct names distinct', () => {
		expect(foldNameForLock('  Numismatica Ars Classica  ')).toBe('numismatica ars classica');
		expect(foldNameForLock('Roma Numismatics')).not.toBe(foldNameForLock('Nomos'));
	});

	test('output never contains uppercase or a combining mark', () => {
		const folded = foldNameForLock('ÀÉÎÕÜ ÇÑ Ǆ İ');
		expect(folded).toBe(folded.toLowerCase());
		expect(/[̀-ͯ]/.test(folded)).toBe(false);
	});
});

describe('normalizeLotUrl', () => {
	test('lowercases scheme and host, keeps path and query case', () => {
		expect(normalizeLotUrl('HTTPS://WWW.Biddr.COM/auctions/x/Browse?a=12&l=AbC')).toBe(
			'https://www.biddr.com/auctions/x/Browse?a=12&l=AbC',
		);
	});

	test('drops the fragment, including a bare "#"', () => {
		expect(normalizeLotUrl('https://jesusvico.com/lote/1/2#gallery')).toBe(
			'https://jesusvico.com/lote/1/2',
		);
		expect(normalizeLotUrl('https://jesusvico.com/lote/1/2#')).toBe(
			'https://jesusvico.com/lote/1/2',
		);
	});

	test('trims whitespace and drops a default port', () => {
		expect(normalizeLotUrl('  https://www.sixbid.com:443/en/a/1/b/2/c \n')).toBe(
			'https://www.sixbid.com/en/a/1/b/2/c',
		);
	});

	test('is idempotent', () => {
		const once = normalizeLotUrl('HTTPS://Example.com/Lot?id=5#x');
		expect(once).not.toBeNull();
		expect(normalizeLotUrl(once)).toBe(once);
	});

	test('rejects non-strings, empty, relative and non-http(s) values', () => {
		expect(normalizeLotUrl(null)).toBeNull();
		expect(normalizeLotUrl(42)).toBeNull();
		expect(normalizeLotUrl('   ')).toBeNull();
		expect(normalizeLotUrl('/lot/5')).toBeNull();
		expect(normalizeLotUrl('javascript:alert(1)')).toBeNull();
		expect(normalizeLotUrl('ftp://example.com/lot')).toBeNull();
	});
});

describe('lotSourceUrlIdentifiesLot', () => {
	// aureo has no per-lot URL: every lot carries its auction's page, so URL dedup there would
	// collapse a whole sale into its first lot.
	test('aureo opts out; the per-lot sources opt in', () => {
		expect(aureoAdapter.lotSourceUrlIdentifiesLot).toBe(false);
		for (const adapter of [biddrAdapter, jesusvicoAdapter, numisbidsAdapter, sixbidAdapter]) {
			expect(adapter.lotSourceUrlIdentifiesLot).toBe(true);
		}
	});
});
