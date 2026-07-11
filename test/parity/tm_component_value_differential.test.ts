/**
 * Time Machine COMPONENT-VALUE differential (tool_time_machine on a single
 * component) vs live PHP. Two surfaces the prior tm_read_differential never
 * covered — both were real bugs, byte-verified against the oracle:
 *
 *  1. LIST value column: the component-history grid shows one column with the
 *     component's value per snapshot. For a SELECT-family value (a publication
 *     flag) PHP renders the resolved LIST LABEL ("Sí"/"No"); TS used to leak the
 *     raw dd-locator, which the byte-identical client renders as "[object
 *     Object]" (read_tm.ts history-surface hardcoded mode 'tm' instead of 'list').
 *
 *  2. PREVIEW pane: the top-right pane loads ONE component from a specific
 *     matrix_time_machine row (source.data_source='tm' + source.matrix_id). TS
 *     used to ignore both and return the LIVE value, so every row previewed the
 *     same (last-saved) value regardless of the snapshot picked
 *     (readComponentData now honors the TM override, PHP component_common::
 *     get_data data_source='tm').
 *
 * Data-driven off the live rows (TM is append-only, so the history is stable):
 * the record + component are pinned; the matrix_ids are read back from the list
 * envelope so the gate follows the data instead of hardcoded PKs.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** A record with real rsc20 (component_publication, "public") TM history. */
const CALLER = { section_tipo: 'rsc170', section_id: '1' };
const VALUE_TIPO = 'rsc20';
const VALUE_MODEL = 'component_publication';

function tmDdo(id: string, tipo: string, model: string): Record<string, unknown> {
	return {
		id,
		tipo,
		type: 'component',
		typo: 'ddo',
		model,
		section_tipo: 'dd15',
		parent: 'dd15',
		mode: 'tm',
		view: 'mini',
	};
}

/** The component-history LIST rqo, including the actual value column. */
const LIST_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		typo: 'source',
		type: 'tm',
		model: 'section',
		tipo: 'dd15',
		section_tipo: 'dd15',
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		id: 'time_machine_temporal',
		mode: 'tm',
		section_tipo: [CALLER.section_tipo],
		limit: 6,
		offset: 0,
		order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
		skip_projects_filter: true,
		filter_by_locators: [{ ...CALLER, tipo: VALUE_TIPO, lang: 'lg-nolan' }],
	},
	show: {
		ddo_map: [
			tmDdo('when', 'dd559', 'component_date'),
			{ ...tmDdo('value', VALUE_TIPO, VALUE_MODEL), view: 'text' },
		],
	},
};

/** The single-component PREVIEW rqo for one matrix_time_machine row. */
function previewRqo(matrixId: number): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		source: {
			typo: 'source',
			type: 'component',
			action: 'get_data',
			model: VALUE_MODEL,
			tipo: VALUE_TIPO,
			section_tipo: CALLER.section_tipo,
			section_id: Number(CALLER.section_id),
			mode: 'edit',
			view: 'default',
			lang: 'lg-nolan',
			matrix_id: matrixId,
			data_source: 'tm',
		},
	};
}

let php: PhpApiClient;
let tsCtx: {
	requestId: string;
	clientIp: string;
	session: unknown;
	csrfCandidate: unknown;
	principal: unknown;
};

async function tsData(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const res = await dispatchRqo(structuredClone(rqo) as never, tsCtx as never);
	return ((res.body as { result?: { data?: unknown[] } }).result?.data ?? []) as Record<
		string,
		unknown
	>[];
}
async function phpData(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const res = await php.call(structuredClone(rqo));
	return ((res.body as { result?: { data?: unknown[] } }).result?.data ?? []) as Record<
		string,
		unknown
	>[];
}

/** The value item's entries, keyed by its TM row id (matrix_id). */
function valueEntriesByRow(rows: Record<string, unknown>[]): Map<number, unknown> {
	const map = new Map<number, unknown>();
	for (const row of rows) {
		if (row.tipo === VALUE_TIPO) map.set(Number(row.section_id), row.entries);
	}
	return map;
}

let phpList: Record<string, unknown>[] = [];
let tsList: Record<string, unknown>[] = [];

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsCtx = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	phpList = await phpData(LIST_RQO);
	tsList = await tsData(LIST_RQO);
});

describe.if(hasPhpCredentials())('time machine component-value differential', () => {
	test('LIST value column resolves to labels, matching PHP per snapshot (Error 2)', () => {
		if (!hasPhpCredentials()) return;
		const phpByRow = valueEntriesByRow(phpList);
		const tsByRow = valueEntriesByRow(tsList);
		expect(phpByRow.size).toBeGreaterThan(0);
		expect([...tsByRow.keys()].sort()).toEqual([...phpByRow.keys()].sort());
		for (const [rowId, phpEntries] of phpByRow) {
			// PHP emits label strings (["Sí"]/["No"]); a raw-locator regression would
			// surface here as an object entry (the "[object Object]" client symptom).
			expect(tsByRow.get(rowId)).toEqual(phpEntries);
			for (const entry of (phpEntries as unknown[]) ?? []) {
				expect(typeof entry).toBe('string');
			}
		}
	});

	test('PREVIEW returns each snapshot value per matrix_id, matching PHP (Error 1)', async () => {
		if (!hasPhpCredentials()) return;
		// Take the matrix_ids straight from the list envelope (append-only ⇒ stable).
		const envelope = phpList[0] as { entries?: { matrix_id?: number }[] };
		const matrixIds = (envelope.entries ?? [])
			.map((e) => Number(e.matrix_id))
			.filter((id) => Number.isFinite(id))
			.slice(0, 4);
		expect(matrixIds.length).toBeGreaterThan(1);

		const seen = new Set<string>();
		for (const matrixId of matrixIds) {
			const rqo = previewRqo(matrixId);
			const [phpRows, tsRows] = await Promise.all([phpData(rqo), tsData(rqo)]);
			const phpEntries = phpRows.find((r) => r.tipo === VALUE_TIPO)?.entries;
			const tsEntries = tsRows.find((r) => r.tipo === VALUE_TIPO)?.entries;
			expect(tsEntries).toEqual(phpEntries);
			seen.add(JSON.stringify(phpEntries));
		}
		// The chosen snapshots must NOT all carry the same value — otherwise a
		// "return the live value for every matrix_id" regression would pass
		// vacuously. This record alternates the publication flag, so >1 distinct.
		expect(seen.size).toBeGreaterThan(1);
	});
});
