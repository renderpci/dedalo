/**
 * tool_export DATAFRAME fan-out differential — component_dataframe children
 * inside the relation-leaf fan-out (frame-by-locator-id pairing), landed
 * 2026-07-10 (formerly the loud `unresolved: component_dataframe` gap).
 *
 * Corpus (read-only): numisdata3 §15657 — its numisdata34 (Denomination,
 * stored model component_autocomplete → the TS fan-out path, NOT the WC-008
 * compact branch) carries 2 locators (object1 §99/§96) paired to 2
 * numisdata1449 frames (rsc1242 §502/§579, id_key 1/2); §1490 is the
 * frameless twin (pins empty-frame behavior AND the mid-stream column mint).
 *
 * Full projection equality vs live PHP across grid_value default/rows/
 * columns + value/default + dedalo_raw/default; plus the TS-only
 * declared-path loudness pin (PHP 500s on that shape — the pinned live
 * defect class, so only TS's clean error is assertable).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

registerSessionCleanup();

interface Grid {
	columns?: Record<string, unknown>[];
	rows?: Record<string, unknown>[];
	end?: { columns?: unknown };
	meta?: { total?: unknown };
}

const SECTION = 'numisdata3';
const COMPONENT = 'numisdata34'; // Denomination — autocomplete with dataframe numisdata1449
const FRAME_TIPO = 'numisdata1449';
const RECORD_WITH_FRAMES = '15657';
const RECORD_FRAMELESS = '1490';

const COMBOS: { format: string; breakdown: string }[] = [
	{ format: 'grid_value', breakdown: 'default' },
	{ format: 'grid_value', breakdown: 'rows' },
	{ format: 'grid_value', breakdown: 'columns' },
	{ format: 'value', breakdown: 'default' },
	{ format: 'dedalo_raw', breakdown: 'default' },
];

function buildRqo(format: string, breakdown: string, declaredFramePath = false) {
	const step = {
		section_tipo: SECTION,
		component_tipo: COMPONENT,
		model: 'component_autocomplete',
		name: 'Denomination',
	};
	const path = declaredFramePath
		? [
				step,
				{
					section_tipo: SECTION,
					component_tipo: FRAME_TIPO,
					model: 'component_dataframe',
					name: 'Uncertainty',
				},
			]
		: [step];
	return {
		action: 'tool_request',
		dd_api: 'dd_tools_api',
		prevent_lock: true,
		source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
		options: {
			section_tipo: SECTION,
			model: 'section',
			data_format: format,
			breakdown,
			fill_the_gaps: true,
			ar_ddo_to_export: [{ path }],
			sqo: {
				section_tipo: [SECTION],
				limit: 0,
				offset: 0,
				filter_by_locators: [
					{ section_tipo: SECTION, section_id: RECORD_FRAMELESS },
					{ section_tipo: SECTION, section_id: RECORD_WITH_FRAMES },
				],
			},
		},
	};
}

const colProjection = (column: Record<string, unknown>): Record<string, unknown> => ({
	i: column.i,
	key: column.key,
	group: column.group,
	label: column.label,
	ar_labels: column.ar_labels,
	cell_type: column.cell_type,
	model: column.model,
	after: column.after,
});
const rowProjection = (row: Record<string, unknown>): Record<string, unknown> => ({
	rec: String(row.rec),
	sub: row.sub,
	c: row.c,
});

let php: PhpApiClient;
let session: ReturnType<typeof getSession>;
let principal: Awaited<ReturnType<typeof resolvePrincipal>>;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	session = getSession(token);
	principal = await resolvePrincipal(-1);
});

async function tsCall(rqo: Record<string, unknown>) {
	return dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 'dataframe-diff',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
}

describe.if(hasPhpCredentials())('tool_export dataframe fan-out differential', () => {
	for (const combo of COMBOS) {
		test(`${combo.format}/${combo.breakdown} — frame cells byte-equal`, async () => {
			if (!hasPhpCredentials()) return;
			const rqo = buildRqo(combo.format, combo.breakdown);
			const phpGrid = ((
				(await php.call(structuredClone(rqo) as Record<string, unknown>)).body as {
					result?: Grid;
				}
			).result ?? {}) as Grid;
			const tsResult = await tsCall(rqo);
			const tsGrid = ((tsResult.body as { result?: Grid }).result ?? {}) as Grid;
			const tsErrors = (tsResult.body as { errors?: string[] }).errors ?? [];

			// The old loud gap must be GONE.
			expect(tsErrors.filter((error) => error.includes('component_dataframe'))).toEqual([]);
			// Non-vacuity: PHP produces columns and rows for this corpus.
			expect(phpGrid.columns?.length ?? 0).toBeGreaterThan(0);
			expect(phpGrid.rows?.length ?? 0).toBeGreaterThan(0);
			if (combo.format === 'grid_value') {
				// The frame chain actually minted a column and a frame VALUE flowed
				// (future data edits can't silently void the gate).
				expect(
					(phpGrid.columns ?? []).some((column) => String(column.key).includes(FRAME_TIPO)),
				).toBe(true);
				expect(JSON.stringify(phpGrid.rows)).toContain('incierto');
			}

			expect((tsGrid.columns ?? []).map(colProjection)).toEqual(
				(phpGrid.columns ?? []).map(colProjection),
			);
			expect((tsGrid.rows ?? []).map(rowProjection)).toEqual(
				(phpGrid.rows ?? []).map(rowProjection),
			);
			expect(tsGrid.end?.columns ?? null).toEqual(phpGrid.end?.columns ?? null);
			expect(tsGrid.meta?.total).toBe(phpGrid.meta?.total as number);
		}, 60000);
	}

	test('a DECLARED dataframe path step stays loud on TS (PHP 500s — not pinnable)', async () => {
		if (!hasPhpCredentials()) return;
		const tsResult = await tsCall(buildRqo('grid_value', 'default', true));
		const tsErrors = (tsResult.body as { errors?: string[] }).errors ?? [];
		expect(tsErrors.some((error) => error.includes('component_dataframe:declared-path'))).toBe(
			true,
		);
	});
});
