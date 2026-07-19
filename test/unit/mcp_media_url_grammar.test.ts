/**
 * Regression gate for the review-diff S3: dedalo_get_media_info must build media
 * URLs from the single media-URL grammar — since WC-042 that is
 * `config.media.webBase` (DEDALO_MEDIA_WEB_BASE, defaulting to
 * `/dedalo/<DEDALO_MEDIA_DIR>`), NOT a hardcoded `/dedalo/media` — which 404s on
 * a legacy install where DEDALO_MEDIA_DIR != 'media' and on any split-origin
 * install where media is served away from the app origin.
 *
 * This is a SOURCE-level gate on purpose: on a default-config install a
 * runtime assertion cannot distinguish the bug (both the hardcoded and the
 * config-derived URL render '/dedalo/media/…'), so it would be a vacuous
 * green. Asserting the source uses the config base catches the regression class
 * on ANY install — the same technique the tripwire tests use.
 */
import { describe, expect, test } from 'bun:test';

const SRC = await Bun.file(new URL('../../src/ai/mcp/tools/media.ts', import.meta.url)).text();

describe('mcp media URL grammar (single source: config.media.webBase)', () => {
	test('the media URL is built from config.media.webBase', () => {
		expect(SRC).toContain('${config.media.webBase}');
	});

	test('no hardcoded /dedalo/media literal in URL construction', () => {
		// Allow the string in comments/docs; forbid it inside a template literal
		// that builds a URL (the `/dedalo/media${...}` regression shape).
		expect(SRC).not.toMatch(/`\/dedalo\/media\$\{/);
	});
});
