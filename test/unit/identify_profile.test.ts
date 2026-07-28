/**
 * Identification profiles are CURATORIAL data — authored by hand, edited as a
 * collection is studied. So the gate is that a wrong profile is refused loudly
 * rather than quietly doing less than it claims.
 *
 * The failure this file exists to prevent: a criterion whose path no longer
 * resolves being skipped instead of raised. Ranked output hides that perfectly —
 * scores still come out, still look plausible, and are simply computed from
 * fewer features than the curator configured.
 */

import { describe, expect, test } from 'bun:test';
import {
	MAX_PATH_HOPS,
	ProfileError,
	parseProfile,
	validateProfilePaths,
	validateProfilePreviewComponent,
} from '../../src/core/identify/profile.ts';

const PATH = [{ section_tipo: 'test3', component_tipo: 'test145' }];

/** A minimal valid profile; each test perturbs one thing. */
function profile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'coins',
		label: 'Coins',
		sectionTipos: ['test3'],
		criteria: [{ id: 'legend', label: 'Legend', path: PATH, role: 'identifying', weight: 2 }],
		...overrides,
	};
}

describe('parseProfile', () => {
	test('parses a minimal profile and applies defaults', () => {
		const parsed = parseProfile(profile());
		expect(parsed.criteria[0]?.mode).toBe('same_locator');
		expect(parsed.criteria[0]?.required).toBe(false);
		expect(parsed.thresholds).toEqual({ sameType: 0.85, candidate: 0.5 });
		expect(parsed.exactSetIdentity).toBe(false);
		expect(parsed.typeSectionTipo).toBeNull();
		// no picture declared is the normal case, and it is a NULL, not a ''
		expect(parsed.previewComponent).toBeNull();
	});

	test('keeps the declared previewComponent', () => {
		expect(parseProfile(profile({ previewComponent: 'test99' })).previewComponent).toBe('test99');
		expect(parseProfile(profile({ previewComponent: null })).previewComponent).toBeNull();
		expect(() => parseProfile(profile({ previewComponent: '' }))).toThrow(ProfileError);
	});

	test('refuses a profile with no identifying criterion', () => {
		// Every candidate would score identically — the profile could only ever
		// say "everything matches equally".
		expect(() =>
			parseProfile(
				profile({
					criteria: [{ id: 'weight', path: PATH, role: 'descriptive' }],
				}),
			),
		).toThrow(ProfileError);
	});

	test('refuses unknown roles and match modes', () => {
		expect(() =>
			parseProfile(profile({ criteria: [{ id: 'x', path: PATH, role: 'sort_of' }] })),
		).toThrow(/unknown role/);
		expect(() =>
			parseProfile(
				profile({ criteria: [{ id: 'x', path: PATH, role: 'identifying', mode: 'vibes' }] }),
			),
		).toThrow(/unknown match mode/);
	});

	test('refuses a tolerance-based mode with no tolerance', () => {
		// 'within tolerance' with no tolerance is not a comparison at all.
		expect(() =>
			parseProfile(
				profile({
					criteria: [{ id: 'w', path: PATH, role: 'identifying', mode: 'numeric_tolerance' }],
				}),
			),
		).toThrow(/sets no tolerance/);
	});

	test('refuses duplicate criterion ids', () => {
		expect(() =>
			parseProfile(
				profile({
					criteria: [
						{ id: 'dup', path: PATH, role: 'identifying' },
						{ id: 'dup', path: PATH, role: 'identifying' },
					],
				}),
			),
		).toThrow(/duplicate criterion id/);
	});

	test('refuses thresholds that can never be satisfied', () => {
		expect(() => parseProfile(profile({ thresholds: { sameType: 0.4, candidate: 0.9 } }))).toThrow(
			/nothing could ever be a candidate/,
		);
		expect(() => parseProfile(profile({ thresholds: { sameType: 1.5 } }))).toThrow(/within 0\.\.1/);
	});

	test('refuses an empty, missing or absurdly deep path', () => {
		expect(() => parseProfile(profile({ criteria: [{ id: 'x', role: 'identifying' }] }))).toThrow(
			/no field path/,
		);
		expect(() =>
			parseProfile(profile({ criteria: [{ id: 'x', path: [], role: 'identifying' }] })),
		).toThrow(/no field path/);
		const deep = Array.from({ length: MAX_PATH_HOPS + 2 }, () => PATH[0]);
		expect(() =>
			parseProfile(profile({ criteria: [{ id: 'x', path: deep, role: 'identifying' }] })),
		).toThrow(new RegExp(`max ${MAX_PATH_HOPS}`));
	});

	test('the parse gate and the walker cap the same thing: HOPS, not steps', () => {
		// One definition, two gates (profile.ts re-exports MAX_PATH_HOPS from the
		// walker). A path of N steps performs N-1 hops, so the deepest ACCEPTABLE
		// path has MAX_PATH_HOPS + 1 steps — refusing it here would mean parse-time
		// refusing a path the reader would happily walk.
		const atCap = Array.from({ length: MAX_PATH_HOPS + 1 }, () => PATH[0]);
		expect(
			parseProfile(profile({ criteria: [{ id: 'x', path: atCap, role: 'identifying' }] }))
				.criteria[0]?.path,
		).toHaveLength(MAX_PATH_HOPS + 1);
	});

	test('refuses a profile that applies to nothing', () => {
		expect(() => parseProfile(profile({ sectionTipos: [] }))).toThrow(/applies to no section/);
	});

	test('refuses a negative weight', () => {
		expect(() =>
			parseProfile(
				profile({ criteria: [{ id: 'x', path: PATH, role: 'identifying', weight: -1 }] }),
			),
		).toThrow(/must not be negative/);
	});
});

describe('validateProfilePaths', () => {
	test('accepts a path whose every hop exists', async () => {
		await expect(validateProfilePaths(parseProfile(profile()))).resolves.toBeUndefined();
	});

	test('throws on a component that does not exist — never skips it', async () => {
		const parsed = parseProfile(
			profile({
				criteria: [
					{
						id: 'gone',
						path: [{ section_tipo: 'test3', component_tipo: 'test999999' }],
						role: 'identifying',
					},
				],
			}),
		);
		await expect(validateProfilePaths(parsed)).rejects.toThrow(/does not exist/);
	});

	test('throws when a component exists but lives in ANOTHER section', async () => {
		// The silent-failure case this catches: test52 is real, but declared here
		// under dd64 (langs), whose matrix table has no such column-key — the read
		// would resolve nothing and the criterion would score as "not recorded"
		// forever, with no error anywhere.
		const parsed = parseProfile(
			profile({
				criteria: [
					{
						id: 'misplaced',
						path: [{ section_tipo: 'dd64', component_tipo: 'test52' }],
						role: 'identifying',
					},
				],
			}),
		);
		await expect(validateProfilePaths(parsed)).rejects.toThrow(/does not contain it/);
	});

	test('throws when a path tries to continue through a non-relation', async () => {
		// test145 is a component_date: a field, not a route to one.
		const parsed = parseProfile(
			profile({
				criteria: [
					{
						id: 'through_a_date',
						path: [...PATH, ...PATH],
						role: 'identifying',
					},
				],
			}),
		);
		await expect(validateProfilePaths(parsed)).rejects.toThrow(/cannot continue through it/);
	});
});

describe('validateProfilePreviewComponent', () => {
	test('accepts a media component of the profile section', async () => {
		// test99 is test3's component_image — the picture a candidate is shown by.
		await expect(
			validateProfilePreviewComponent(parseProfile(profile({ previewComponent: 'test99' }))),
		).resolves.toBeUndefined();
	});

	test('a profile with no preview component is valid', async () => {
		await expect(validateProfilePreviewComponent(parseProfile(profile()))).resolves.toBeUndefined();
	});

	test('refuses a component that does not exist', async () => {
		await expect(
			validateProfilePreviewComponent(parseProfile(profile({ previewComponent: 'test999999' }))),
		).rejects.toThrow(/does not exist/);
	});

	test('refuses a non-media component', async () => {
		// The silent failure it prevents: a text component produces no thumb ever,
		// and "this record has no photograph" looks exactly the same on screen.
		await expect(
			validateProfilePreviewComponent(parseProfile(profile({ previewComponent: 'test52' }))),
		).rejects.toThrow(/not a media component/);
	});

	test('refuses a media component none of the profile sections holds', async () => {
		await expect(
			validateProfilePreviewComponent(
				parseProfile(profile({ sectionTipos: ['dd64'], previewComponent: 'test99' })),
			),
		).rejects.toThrow(/not held by any/);
	});
});
