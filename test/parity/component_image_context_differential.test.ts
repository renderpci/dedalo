/**
 * component_image (rsc29) context + data differential vs the LIVE PHP oracle.
 *
 * Regression gate for the 2026-07-10 component_image review, which found the
 * TS read diverging from PHP on:
 *  - features.allowed_extensions / alternative_extensions (media_features
 *    hardcoded the sample defaults instead of config.media — the install
 *    overrides DEDALO_IMAGE_EXTENSIONS_SUPPORTED/_ALTERNATIVE_EXTENSIONS),
 *  - tools[].tool_config + properties.tool_config ddo_map enrichment (the
 *    'self' sentinels + model/translatable/label — PHP
 *    class.common.php:1868-1916 → tool_common::create_tool_simple_context;
 *    without it the client's tool_common.js builds a synthetic single-entry
 *    ddo_map and tool_transcription never gets its components),
 *  - legacy_model (PHP emits the raw stored model name unconditionally).
 *
 * The DATA layer is asserted as a projection (entry identity + files_info);
 * the blank-image defect itself (SVG envelope served attachment/sandboxed) is
 * gated in test/unit/media_serving.test.ts — it is a header bug, invisible to
 * the JSON wire.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		typo: 'source',
		type: 'section',
		action: 'search',
		model: 'section',
		tipo: 'rsc170',
		section_tipo: 'rsc170',
		section_id: 1,
		mode: 'edit',
		view: null,
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['rsc170'],
		limit: 1,
		offset: 0,
		filter_by_locators: [{ section_tipo: 'rsc170', section_id: 1 }],
	},
};

describe.if(hasPhpCredentials())('component_image rsc29 differential (edit read)', () => {
	let phpContext: Record<string, unknown> | undefined;
	let tsContext: Record<string, unknown> | undefined;
	let phpData: Record<string, unknown> | undefined;
	let tsData: Record<string, unknown> | undefined;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(READ_RQO));
		const phpResult = body.result as {
			context: Record<string, unknown>[];
			data: Record<string, unknown>[];
		};
		phpContext = phpResult.context.find((entry) => entry.tipo === 'rsc29');
		phpData = phpResult.data.find((item) => item.tipo === 'rsc29');
		const tsResult = await readSection(READ_RQO as unknown as Rqo);
		tsContext = (tsResult.context as unknown as Record<string, unknown>[]).find(
			(entry) => entry.tipo === 'rsc29',
		);
		tsData = (tsResult.data as unknown as Record<string, unknown>[]).find(
			(item) => item.tipo === 'rsc29',
		);
	});

	test('media features match the oracle (install-config extensions included)', () => {
		if (!hasPhpCredentials()) return;
		expect(phpContext).toBeDefined();
		expect(tsContext).toBeDefined();
		// The whole features object is the contract — allowed_extensions and
		// alternative_extensions come from the install's DEDALO_IMAGE_* overrides,
		// not the sample defaults.
		expect(tsContext?.features).toEqual(phpContext?.features);
	});

	test('legacy_model is the raw stored model name (emitted unconditionally)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsContext?.legacy_model).toBe(phpContext?.legacy_model as string);
	});

	test('tool_transcription tool_config is enriched on the TOOL context', () => {
		if (!hasPhpCredentials()) return;
		const findTool = (entry: Record<string, unknown> | undefined) =>
			((entry?.tools ?? []) as Record<string, unknown>[]).find(
				(tool) => tool.name === 'tool_transcription',
			);
		const phpTool = findTool(phpContext);
		const tsTool = findTool(tsContext);
		expect(phpTool).toBeDefined();
		expect(tsTool).toBeDefined();
		// The enriched ddo_map ('self' resolved + model/translatable/label) is what
		// the client builds the tool's components from.
		expect(tsTool?.tool_config).toEqual(phpTool?.tool_config);
	});

	test('properties.tool_config mirrors the enrichment (PHP shared-object mutation)', () => {
		if (!hasPhpCredentials()) return;
		const configOf = (entry: Record<string, unknown> | undefined) =>
			((entry?.properties ?? {}) as { tool_config?: Record<string, unknown> }).tool_config
				?.tool_transcription;
		expect(configOf(tsContext)).toEqual(configOf(phpContext));
	});

	test('data entry projection matches (identity + files_info + names)', () => {
		if (!hasPhpCredentials()) return;
		const project = (item: Record<string, unknown> | undefined) => {
			const entries = (item?.entries ?? []) as Record<string, unknown>[];
			return {
				lang: item?.lang,
				external_source: item?.external_source ?? null,
				base_svg_url: item?.base_svg_url ?? null,
				entries: entries.map((entry) => ({
					id: entry.id,
					original_file_name: entry.original_file_name ?? null,
					files_info: ((entry.files_info ?? []) as Record<string, unknown>[]).map((info) => ({
						quality: info.quality,
						extension: info.extension,
						file_name: info.file_name,
						file_path: info.file_path,
						file_exist: info.file_exist,
					})),
				})),
			};
		};
		expect(phpData).toBeDefined();
		expect(tsData).toBeDefined();
		expect(project(tsData)).toEqual(project(phpData));
	});
});
