/**
 * `masterQualities` IS DERIVED FROM CONFIG — it must never hardcode 'modified'.
 *
 * Installs rename their quality tiers; that is exactly why protection.ts:316
 * forbids hardcoding these names. A hardcoded 'modified' would look perfectly
 * green on a default install and silently classify the RETOUCHED MASTER of a
 * renamed install as a derivative tier again — refusing its .tif uploads and
 * never building anything from it, which is the defect this whole change fixes.
 *
 * So the gate renames the tier in the config and watches the behaviour follow.
 *
 * OWN FILE ON PURPOSE: `mock.module` leaks across files in this suite, and this
 * one replaces the frozen config catalog wholesale. `concepts/media.ts` also
 * memoizes its specs in a module-level cache, so it is imported DYNAMICALLY,
 * after the mock is installed — a static import would resolve the real config
 * first and cache specs built from it.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import * as REAL_CONFIG_MODULE from '../../src/config/config.ts';

const REAL_CONFIG = REAL_CONFIG_MODULE.config;

/**
 * THE RESTORE MUST COME FROM A SNAPSHOT, NOT THE LIVE NAMESPACE (GATE-01).
 * `REAL_CONFIG_MODULE` is a LIVE module namespace: once `mock.module` has
 * replaced the module, that binding reflects the MOCK, so "restoring" from it
 * reinstalls the stub and hands it to every later file in the tier. This is a
 * spread COPY taken at import time, before any mock runs.
 */
const REAL_CONFIG_EXPORTS = { ...REAL_CONFIG_MODULE, config: REAL_CONFIG };

// mock.module leaks across files in this suite, and this one replaces the config
// catalog every other module reads. Put the REAL module back when the file ends.
afterAll(() => {
	mock.module('../../src/config/config.ts', () => REAL_CONFIG_EXPORTS);
});

/** The real catalog with the image tier names replaced — everything else intact. */
function configWithImageTiers(retouched: string, qualities: readonly string[]): unknown {
	return {
		...REAL_CONFIG,
		media: {
			...REAL_CONFIG.media,
			image: { ...REAL_CONFIG.media.image, qualities },
			imageQualityRetouched: retouched,
		},
	};
}

/**
 * Install a mocked config and load a FRESH copy of concepts/media.ts against it.
 * The `?case=` query defeats Bun's module cache so each case gets its own spec
 * cache — without it the first case's frozen specs would answer for all of them.
 */
async function mediaConceptsWith(
	retouched: string,
	qualities: readonly string[],
	cacheKey: string,
): Promise<typeof import('../../src/core/concepts/media.ts')> {
	// Spread the MODULE NAMESPACE (not the config object): every other export of
	// config.ts must survive the mock, only `config` is replaced.
	mock.module('../../src/config/config.ts', () => ({
		...REAL_CONFIG_MODULE,
		config: configWithImageTiers(retouched, qualities),
	}));
	return (await import(
		`../../src/core/concepts/media.ts?case=${cacheKey}`
	)) as typeof import('../../src/core/concepts/media.ts');
}

describe('masterQualities follows DEDALO_IMAGE_QUALITY_RETOUCHED', () => {
	test('a RENAMED retouched tier becomes the master — no literal is involved', async () => {
		const media = await mediaConceptsWith(
			'retocada',
			['original', 'retocada', '1.5MB', 'thumb'],
			'renamed',
		);
		const image = media.mediaTypeOf('component_image');

		// The renamed tier is the top master, in precedence order…
		expect(image?.masterQualities).toEqual(['retocada', 'original']);
		// …and the literal 'modified' is now just a name nothing knows about.
		expect(image?.masterQualities).not.toContain('modified');

		// The behaviour follows: a raw .tif is admitted by the RENAMED tier…
		expect(() => media.assertNormalizedExtensionForTier(image!, 'retocada', 'tif')).not.toThrow();
		// …and refused by the derivative tier, which names the renamed master.
		expect(() => media.assertNormalizedExtensionForTier(image!, '1.5MB', 'tif')).toThrow(
			/'retocada'/,
		);
	});

	test('a retouched tier ABSENT from the ladder is NOT a master', async () => {
		// An install may drop the tier from DEDALO_IMAGE_AR_QUALITY. Nothing can be
		// uploaded into it (assertIngestableQuality refuses an off-ladder quality)
		// and files_info never scans it, so treating it as a source would resolve
		// files nothing can ever put there.
		const media = await mediaConceptsWith(
			'modified',
			['original', '1.5MB', 'thumb'],
			'notinladder',
		);
		const image = media.mediaTypeOf('component_image');

		expect(image?.masterQualities).toEqual(['original']);
		// And with no second master, the tier is a derivative again: guarded.
		expect(() => media.assertNormalizedExtensionForTier(image!, 'modified', 'tif')).toThrow(
			/would be shadowed/,
		);
	});

	test('retouched === original collapses to ONE master, never a duplicate', async () => {
		const media = await mediaConceptsWith('original', ['original', '1.5MB', 'thumb'], 'collapsed');
		expect(media.mediaTypeOf('component_image')?.masterQualities).toEqual(['original']);
	});

	/**
	 * THE BELT. The two keys are INDEPENDENT and nothing ties them: `../private/.env`
	 * is append-only, so an install can empty or rename
	 * DEDALO_IMAGE_QUALITY_RETOUCHED and leave `modified` in DEDALO_IMAGE_AR_QUALITY.
	 * With a config-only read that tier — full of HUMAN-AUTHORED masters — becomes an
	 * ordinary derivative, and regenerateImage overwrites it on the next upload.
	 * MEASURED before the belt: the retouch's centre pixel went blue → red.
	 * protection.ts masterQualities() carries the same literals for the same class of
	 * reason.
	 */
	test("a tier literally named 'modified' is a master even when config forgets it", async () => {
		const media = await mediaConceptsWith(
			'',
			['original', 'modified', '1.5MB', 'thumb'],
			'driftempty',
		);
		const image = media.mediaTypeOf('component_image');
		expect(image?.masterQualities).toEqual(['modified', 'original']);
		// And it behaves as a master: raw uploads admitted, never shadowed-guarded.
		expect(() => media.assertNormalizedExtensionForTier(image!, 'modified', 'tif')).not.toThrow();
	});

	test('the CONFIGURED name still comes first — the belt does not take precedence', async () => {
		const media = await mediaConceptsWith(
			'retocada',
			['original', 'retocada', 'modified', '1.5MB', 'thumb'],
			'driftboth',
		);
		expect(media.mediaTypeOf('component_image')?.masterQualities).toEqual([
			'retocada',
			'modified',
			'original',
		]);
	});
});
