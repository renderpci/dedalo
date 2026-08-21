/**
 * CONCEPT GATE — concepts/section_id.ts (WC-2026-08-10-section-id-int-canonical).
 *
 * Pins: the brand's refusals, the coercion door (counter keys + observer),
 * the wire classifier's kinds INCLUDING the deliberate '' → absent divergence,
 * and NaN-ERA BRANCH PARITY — the classifier must sort exactly the inputs the
 * old `Number.isNaN` / `startsWith('search_')` sniffs sorted, into the same
 * behavioral buckets (record-read vs verbatim-echo/grant branches).
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { afterEach, describe, expect, test } from 'bun:test';
import {
	asSectionId,
	canonicalizeStoredSectionId,
	classifyWireSectionId,
	coerceSectionId,
	isConvertibleSectionIdString,
	isSectionId,
	registerSectionIdCoercionObserver,
	resetSectionIdCoercionStateForTests,
	type SectionId,
} from '../../src/core/concepts/section_id.ts';
import { SectionIdRefused } from '../../src/core/errors/families.ts';

afterEach(() => {
	resetSectionIdCoercionStateForTests();
});

describe('the brand', () => {
	test('safe integers pass, negatives included (-1 root, -666 activity)', () => {
		expect(isSectionId(7)).toBe(true);
		expect(isSectionId(0)).toBe(true);
		expect(isSectionId(-1)).toBe(true);
		expect(isSectionId(-666)).toBe(true);
		expect(isSectionId(Number.MAX_SAFE_INTEGER)).toBe(true);
	});

	test('non-ints refuse: strings, floats, unsafe range, NaN, null', () => {
		expect(isSectionId('7')).toBe(false);
		expect(isSectionId(7.5)).toBe(false);
		expect(isSectionId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
		expect(isSectionId(Number.NaN)).toBe(false);
		expect(isSectionId(null)).toBe(false);
	});

	test('asSectionId throws on anything not already an int — no silent coercion', () => {
		expect(asSectionId(7)).toBe(7 as SectionId);
		expect(() => asSectionId('7')).toThrow(SectionIdRefused);
		expect(() => asSectionId(7.5)).toThrow(SectionIdRefused);
		expect(refusalCode(() => asSectionId('7'))).toBe('section_id.not_an_address');
	});
});

/** The registry code a synchronous refusal carries. */
function refusalCode(fn: () => unknown): string | undefined {
	try {
		fn();
		return undefined;
	} catch (error) {
		return error instanceof SectionIdRefused ? error.code : undefined;
	}
}

describe('coerceSectionId (the boundary door)', () => {
	test('ints pass without touching the observer', () => {
		const seen: string[] = [];
		registerSectionIdCoercionObserver((source) => seen.push(source));
		expect(coerceSectionId(7, 'test.door')).toBe(7 as SectionId);
		expect(seen).toHaveLength(0);
	});

	test('convertible strings coerce and hit the per-source observer', () => {
		const seen: string[] = [];
		registerSectionIdCoercionObserver((source) => seen.push(source));
		expect(coerceSectionId('7', 'test.door')).toBe(7 as SectionId);
		expect(coerceSectionId('-1', 'other.door')).toBe(-1 as SectionId);
		expect(seen).toEqual(['test.door', 'other.door']);
	});

	test('leading zeros, tokens, empties and junk THROW — never guessed', () => {
		expect(() => coerceSectionId('007', 'test.door')).toThrow(SectionIdRefused);
		expect(() => coerceSectionId('', 'test.door')).toThrow(SectionIdRefused);
		expect(() => coerceSectionId('search_1', 'test.door')).toThrow(SectionIdRefused);
		expect(() => coerceSectionId(null, 'test.door')).toThrow(SectionIdRefused);
		expect(() => coerceSectionId(7.5, 'test.door')).toThrow(SectionIdRefused);
		expect(refusalCode(() => coerceSectionId('007', 'test.door'))).toBe(
			'section_id.not_an_address',
		);
	});
});

describe('canonicalizeStoredSectionId (the writer rule)', () => {
	test('convertible strings become ints; everything else passes verbatim', () => {
		expect(canonicalizeStoredSectionId('7')).toBe(7);
		expect(canonicalizeStoredSectionId(7)).toBe(7);
		expect(canonicalizeStoredSectionId('001338683')).toBe('001338683');
		expect(canonicalizeStoredSectionId('Q42')).toBe('Q42');
		expect(canonicalizeStoredSectionId(null)).toBeNull();
		expect(canonicalizeStoredSectionId(undefined)).toBeUndefined();
	});
});

describe('classifyWireSectionId — kinds + NaN-era branch parity', () => {
	// test6813 is a plain matrix section on the test playground; test3 is configured
	// as a zenon EXTERNAL section there (properties.api_config) — which gives
	// this gate a real external tipo to classify against.
	const TIPO = 'test6813';
	const EXTERNAL_TIPO = 'test3';

	test("absent: null, undefined and '' (the deliberate record-0 divergence)", async () => {
		expect(await classifyWireSectionId(null, TIPO, 't')).toEqual({ kind: 'absent' });
		expect(await classifyWireSectionId(undefined, TIPO, 't')).toEqual({ kind: 'absent' });
		// NaN era: Number('') === 0 → hasRecordId true → read record 0. Now: absent.
		expect(await classifyWireSectionId('', TIPO, 't')).toEqual({ kind: 'absent' });
	});

	test('record: ints (0 and negatives included) and convertible strings', async () => {
		expect(await classifyWireSectionId(7, TIPO, 't')).toEqual({
			kind: 'record',
			id: 7 as SectionId,
		});
		expect(await classifyWireSectionId(0, TIPO, 't')).toEqual({
			kind: 'record',
			id: 0 as SectionId,
		});
		expect(await classifyWireSectionId(-1, TIPO, 't')).toEqual({
			kind: 'record',
			id: -1 as SectionId,
		});
		expect(await classifyWireSectionId('5', TIPO, 't')).toEqual({
			kind: 'record',
			id: 5 as SectionId,
		});
	});

	test('BRANCH PARITY: every NaN-era "not a number" input classifies synthetic', async () => {
		// These all made Number(x) NaN and took the verbatim-echo / grant branch.
		for (const token of ['search_1', 'search_25', 'tmp_export_2', 'self', 'list_a', 'tmp']) {
			expect(await classifyWireSectionId(token, TIPO, 't')).toEqual({
				kind: 'synthetic',
				token,
			});
		}
	});

	test('numeric-shaped non-addresses on a matrix tipo THROW loudly (WC-noted divergence)', async () => {
		// NaN era silently read Number('007') === 7 — a wrong record. Now: refusal.
		await expect(classifyWireSectionId('007', TIPO, 't')).rejects.toThrow(SectionIdRefused);
		await expect(classifyWireSectionId('9007199254740992', TIPO, 't')).rejects.toThrow(
			SectionIdRefused,
		);
		await expect(classifyWireSectionId('007', TIPO, 't')).rejects.toMatchObject({
			code: 'section_id.numeric_shaped',
		});
	});

	test('unusable raw types (bool, object) THROW', async () => {
		await expect(classifyWireSectionId(true, TIPO, 't')).rejects.toThrow(SectionIdRefused);
		await expect(classifyWireSectionId({}, TIPO, 't')).rejects.toMatchObject({
			code: 'section_id.unusable_type',
		});
		// the refusal is a DedaloError family, never a builtin — catch sites key on the domain
		await expect(classifyWireSectionId({}, TIPO, 't')).rejects.not.toBeInstanceOf(TypeError);
	});

	test('string coercion through the classifier feeds the same observer', async () => {
		const seen: string[] = [];
		registerSectionIdCoercionObserver((source) => seen.push(source));
		await classifyWireSectionId('5', TIPO, 'door.x');
		expect(seen).toEqual(['door.x']);
	});

	test('a plain matrix tipo never classifies external-ref', async () => {
		const classified = await classifyWireSectionId('123', TIPO, 't');
		expect(classified.kind).toBe('record');
	});

	test('external tipo: NON-convertible strings echo verbatim as external-ref; convertible strings are RECORDS on any tipo', async () => {
		// The remote-id forms — zero-padded, opaque — classify external-ref.
		for (const remoteId of ['001338683', 'Q42']) {
			expect(await classifyWireSectionId(remoteId, EXTERNAL_TIPO, 't')).toEqual({
				kind: 'external-ref',
				remoteId,
			});
		}
		// (!) S0 rule (adversarial 2026-08-10): a CONVERTIBLE numeric string is a
		// record address ON ANY TIPO. Sections carrying legacy api_config residue
		// (rsc205) hold thousands of real records — classifying their ids
		// external-ref silently dropped writes into the never-write echo branch.
		// True external remote ids are never convertible, so nothing is lost.
		expect(await classifyWireSectionId('1338683', EXTERNAL_TIPO, 't')).toEqual({
			kind: 'record',
			id: 1338683 as SectionId,
		});
		expect(await classifyWireSectionId(7, EXTERNAL_TIPO, 't')).toEqual({
			kind: 'record',
			id: 7 as SectionId,
		});
	});
});

describe('isConvertibleSectionIdString edge pins', () => {
	test("'0' converts; '-0' does not; whitespace and signs are not forgiven", () => {
		expect(isConvertibleSectionIdString('0')).toBe(true);
		expect(isConvertibleSectionIdString('-0')).toBe(false);
		expect(isConvertibleSectionIdString(' 7')).toBe(false);
		expect(isConvertibleSectionIdString('+7')).toBe(false);
		expect(isConvertibleSectionIdString('7.0')).toBe(false);
	});
});
