/**
 * DEDALO_MEDIA_WEB_BASE — the client/wire media URL base (config.media.webBase).
 *
 * Default (key unset or '', which the suite preload PINS): the same-origin
 * relative `/dedalo/<mediaDir>` — the harvest-era wire shape every unit golden
 * and parity fixture asserts. Set to an absolute URL, every media URL the
 * client receives is built on it (split-origin dev: app on the Bun port, media
 * on the web server). The override branch needs a FRESH config import (config
 * freezes at first import), so it runs in a subprocess with the env injected.
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { subtitlesUrl } from '../../src/core/media/path.ts';

describe('media web base (DEDALO_MEDIA_WEB_BASE)', () => {
	test('suite default is the same-origin relative base', () => {
		expect(config.media.webBase).toBe(`/dedalo/${config.mediaDir}`);
	});

	test('URL builders are rooted on webBase (subtitles as the canary)', () => {
		const url = subtitlesUrl(
			{ componentTipo: 'rsc36', sectionTipo: 'rsc170', sectionId: 1, lang: null },
			'lg-spa',
		);
		expect(url.startsWith(`${config.media.webBase}/`)).toBe(true);
	});

	test('absolute override wins and its trailing slash is stripped (fresh import)', () => {
		const probe = Bun.spawnSync(
			[
				'bun',
				'-e',
				'const { config } = await import("./src/config/config.ts"); console.log(config.media.webBase);',
			],
			{
				cwd: `${import.meta.dir}/../..`,
				env: { ...process.env, DEDALO_MEDIA_WEB_BASE: 'http://localhost:8080/dedalo/media/' },
			},
		);
		expect(probe.stdout.toString().trim()).toBe('http://localhost:8080/dedalo/media');
	});
});
