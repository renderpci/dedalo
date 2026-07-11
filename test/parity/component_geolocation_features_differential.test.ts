/**
 * component_geolocation edit context (2026-07-04, user-reported: the map rendered
 * as an empty blue box in the client). PHP appends a `features` object carrying
 * geo_provider to the FULL edit context (component_geolocation_json.php:106-115);
 * the client map widget reads context.features.geo_provider to select its Leaflet
 * tile backend. TS omitted it, so the map could not initialise a tile layer.
 *
 * This gate drives the section read (the client render path) and asserts the
 * geolocation context carries features.geo_provider matching PHP. Fixture:
 * test3/1 component test100. See rewrite/STATUS.md "component_geolocation features".
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SECTION_READ_RQO = {
	action: 'read',
	source: {
		type: 'section',
		model: 'section',
		tipo: 'test3',
		section_tipo: 'test3',
		section_id: 1,
		mode: 'edit',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['test3'],
		limit: 1,
		offset: 0,
		filter_by_locators: [{ section_tipo: 'test3', section_id: 1 }],
	},
};

describe.if(hasPhpCredentials())('component_geolocation features (edit context)', () => {
	let phpFeatures: unknown;
	let tsFeatures: unknown;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(SECTION_READ_RQO));
		phpFeatures = (
			(body.result as { context: { tipo: string; features?: unknown }[] }).context ?? []
		).find((c) => c.tipo === 'test100')?.features;
		const ts = await readSection(SECTION_READ_RQO as unknown as Rqo);
		tsFeatures = (ts.context as { tipo: string; features?: unknown }[]).find(
			(c) => c.tipo === 'test100',
		)?.features;
		// S3-70: explicit hook budget — under full-suite load PHP serializes
		// parity requests and the default 5 s hook timeout flaked this file
		// (the run1↔run2 wobble); 60 s matches the other differentials.
	}, 60000);

	test('geolocation edit context carries features.geo_provider matching PHP', () => {
		if (!hasPhpCredentials()) return;
		expect(phpFeatures).toBeDefined(); // PHP always appends it (full context)
		expect(tsFeatures).toEqual(phpFeatures);
		expect((tsFeatures as { geo_provider?: unknown })?.geo_provider).toBeDefined();
	});
});
