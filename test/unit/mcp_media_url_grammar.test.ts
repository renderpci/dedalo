/**
 * Regression gate for the review-diff S3: dedalo_get_media_info must build media
 * URLs from the single media-URL grammar (`/dedalo/${config.mediaDir}…`), NOT a
 * hardcoded `/dedalo/media` — which 404s on a legacy install where
 * DEDALO_MEDIA_DIR != 'media'.
 *
 * This is a SOURCE-level gate on purpose: on a default-mediaDir install a
 * runtime assertion cannot distinguish the bug (both the hardcoded and the
 * config-derived URL render '/dedalo/media/…'), so it would be a vacuous
 * green. Asserting the source uses config.mediaDir catches the regression class
 * on ANY install — the same technique the tripwire tests use.
 */
import { describe, expect, test } from 'bun:test';

const SRC = await Bun.file(new URL('../../src/ai/mcp/tools/media.ts', import.meta.url)).text();

describe('mcp media URL grammar (single source: config.mediaDir)', () => {
	test('the media URL is built from config.mediaDir', () => {
		expect(SRC).toContain('/dedalo/${config.mediaDir}');
	});

	test('no hardcoded /dedalo/media literal in URL construction', () => {
		// Allow the string in comments/docs; forbid it inside a template literal
		// that builds a URL (the `/dedalo/media${...}` regression shape).
		expect(SRC).not.toMatch(/`\/dedalo\/media\$\{/);
	});
});
