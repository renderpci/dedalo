/**
 * Workstream B gate: regenerateRecordsInDdOntology (PHP
 * ontology::regenerate_records_in_dd_ontology) — the destructive
 * backup→parse→delete→reinsert cycle whose rollback IS the dd_ontology_bk table.
 *
 * A scratch hierarchy (TLD 'zzr') is provisioned, then regenerated. Pins:
 *  - the tld's nodes are rebuilt identically (same tipo set) after regenerate;
 *  - dd_ontology_bk is LEFT BEHIND on success (PHP-pinned behavior);
 *  - a failure path (empty tld list) is refused with an error.
 * Everything (including the bk table) is torn down in afterAll.
 *
 * Runs TS-only (no PHP dependency for the protocol invariants) but is gated on DB
 * reachability via the same credential probe.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deleteTldNodes, dropBackupTable } from '../../src/core/db/dd_ontology.ts';
import { updateMatrixKeyData } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { generateVirtualSection } from '../../src/core/ontology/hierarchy_provision.ts';
import { regenerateRecordsInDdOntology } from '../../src/core/ontology/ontology_write.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { hasPhpCredentials } from './php_client.ts';

const TLD = 'zzr';
const REAL_SECTION = 'rsc167';
let hierarchyId = 0;
const captured: { before: string[]; after: string[]; bkLeft: boolean; emptyRefused: boolean } = {
	before: [],
	after: [],
	bkLeft: false,
	emptyRefused: false,
};

async function tldTipos(): Promise<string[]> {
	const rows = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE tld = $1 ORDER BY tipo', [
		TLD,
	])) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

async function bkTableExists(): Promise<boolean> {
	const rows = (await sql.unsafe(`SELECT to_regclass('dd_ontology_bk') AS reg`, [])) as {
		reg: string | null;
	}[];
	return rows[0]?.reg !== null && rows[0]?.reg !== undefined;
}

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	// Provision a scratch hierarchy so <tld>0 has matrix records to regenerate from.
	hierarchyId = await createSectionRecord('hierarchy1', -1);
	const w = (col: 'relation' | 'string', tipo: string, v: unknown): Promise<void> =>
		updateMatrixKeyData('matrix_hierarchy_main', 'hierarchy1', hierarchyId, col, tipo, v);
	await w('relation', 'hierarchy4', [
		{
			id: 1,
			type: 'dd151',
			section_tipo: 'dd64',
			section_id: '1',
			from_component_tipo: 'hierarchy4',
		},
	]);
	await w('string', 'hierarchy6', [{ id: 1, lang: 'lg-nolan', value: TLD }]);
	await w('string', 'hierarchy109', [{ id: 1, lang: 'lg-nolan', value: REAL_SECTION }]);
	await w('relation', 'hierarchy9', [
		{
			type: 'dd151',
			section_tipo: 'hierarchy13',
			section_id: '1',
			from_component_tipo: 'hierarchy9',
		},
	]);
	await w('string', 'hierarchy5', [{ id: 1, lang: 'lg-spa', value: `${TLD} test` }]);
	await generateVirtualSection({ section_id: hierarchyId, section_tipo: 'hierarchy1', userId: -1 });

	captured.before = await tldTipos();

	// Empty-list refusal (backup can't be made → early error).
	const empty = await regenerateRecordsInDdOntology([]);
	captured.emptyRefused = empty.result === false && empty.errors.length > 0;

	// Regenerate the scratch tld.
	const response = await regenerateRecordsInDdOntology([TLD]);
	captured.after = await tldTipos();
	captured.bkLeft = await bkTableExists();
	// keep 'response' referenced for clarity
	expect(response.result).toBe(true);
}, 180000);

afterAll(async () => {
	if (!hasPhpCredentials()) return;
	await dropBackupTable();
	await deleteTldNodes(TLD);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [`${TLD}0`]);
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	);
	if (hierarchyId > 0) {
		await sql.unsafe(
			`DELETE FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[hierarchyId],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[hierarchyId],
		);
	}
	await clearOntologyDerivedCaches();
});

describe.if(hasPhpCredentials())('regenerate differential (backup-table protocol)', () => {
	test('the tld nodes are rebuilt identically after regenerate', () => {
		if (!hasPhpCredentials()) return;
		expect(captured.after).toEqual(captured.before);
		expect(captured.after.length).toBeGreaterThan(0);
	});

	test('dd_ontology_bk is LEFT BEHIND on success (PHP-pinned)', () => {
		if (!hasPhpCredentials()) return;
		expect(captured.bkLeft).toBe(true);
	});

	test('an empty tld list is refused', () => {
		if (!hasPhpCredentials()) return;
		expect(captured.emptyRefused).toBe(true);
	});
});
