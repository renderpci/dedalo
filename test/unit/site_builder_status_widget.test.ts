/**
 * site_builder_status — the native twin gate for a TS-only widget (WC-031).
 *
 * The widget is normalized OUT of the widgets differential (no PHP oracle twin), so
 * without this file nothing would assert its catalog shape or its fail-soft probe. This
 * pins what the parity gate cannot: registration, the `publication` category, the
 * display-only surface (no apiActions), and the eagerValue's unconfigured shape — the
 * state every bare install (and this test env, which sets no DEDALO_SITE_BUILDER_URL)
 * is in, so the probe path must return without touching the network.
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { ALL_WIDGET_MODULES } from '../../src/core/area_maintenance/widgets/registry.ts';
import { widget } from '../../src/core/area_maintenance/widgets/site_builder_status.ts';

describe('site_builder_status widget (TS-only, WC-031)', () => {
	test('is registered in the widget catalog with the publication category', () => {
		const registered = ALL_WIDGET_MODULES.find((m) => m.spec.id === 'site_builder_status');
		expect(registered).toBe(widget);
		expect(widget.spec.category).toBe('publication');
		expect(widget.spec.label).toEqual({ kind: 'literal', text: 'Site builder' });
	});

	test('is display-only: an eagerValue and no execute actions', () => {
		expect(typeof widget.eagerValue).toBe('function');
		expect(widget.apiActions).toBeUndefined();
	});

	test('eagerValue reports unconfigured fail-soft when the engine has no daemon keys', async () => {
		// The unit-test env sets no DEDALO_SITE_BUILDER_URL/TOKEN; assert that premise so a
		// future test-env change fails loudly here instead of silently probing a URL.
		expect(config.siteBuilder.url).toBeUndefined();

		const value = await widget.eagerValue?.();
		expect(value).toEqual({
			configured: false,
			reachable: false,
			url_host: null,
			drivers: [],
			last_publishes: [],
		});
	});
});
