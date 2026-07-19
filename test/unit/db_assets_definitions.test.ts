/**
 * db_pg_definitions.json + db_assets applier invariants (2026-07-19).
 *
 * THE CASCADE TRAP: executing an ar_function entry's `DROP … CASCADE` on a
 * routine rebuild silently destroys every dependent object. Measured in the
 * wild: a standalone rebuild_db_functions cascade-dropped all 96
 * data_relations_flat_* functional GIN indexes (+ the ontology trigram
 * index), turning inverse-relation lookups into ~8s seq scans — record edit
 * views took 18s until the 97 indexes were rebuilt.
 *
 * The contract pinned here (owner-directed): the drop DDL STAYS RECORDED in
 * the entries — it is the deliberate-teardown definition — but routine
 * rebuilds are ADD-ONLY, which is safe exactly because every non-empty add
 * is IDEMPOTENT (CREATE OR REPLACE / IF NOT EXISTS). Entries with an empty
 * add are pure cleanups whose drop IS the action.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import definitions from '../../src/core/db/db_pg_definitions.json';

interface Entry {
	tables?: string[];
	add: string;
	drop: string;
	name: string;
}

const functions = definitions.ar_function as Entry[];
const tables = definitions.ar_table as Entry[];
const triggers = definitions.ar_trigger as Entry[];

describe('db_pg_definitions invariants', () => {
	test('every non-empty function add is idempotent (CREATE OR REPLACE) — add-only rebuilds stay safe', () => {
		for (const entry of functions) {
			if (entry.add === '') continue; // cleanup entries: the drop is the action
			expect(entry.add, `${entry.name} add must be OR REPLACE`).toContain(
				'CREATE OR REPLACE FUNCTION',
			);
		}
	});

	test('every non-empty table add is idempotent (IF NOT EXISTS) — a rebuild can never wipe a derived store', () => {
		for (const entry of tables) {
			expect(entry.add, `${entry.name} add must be IF NOT EXISTS`).toContain(
				'CREATE TABLE IF NOT EXISTS',
			);
		}
	});

	test('the appliers route functions/tables through the add-only path (no drop on routine rebuilds)', () => {
		const source = readFileSync(join(import.meta.dir, '../../src/core/db/db_assets.ts'), 'utf-8');
		// rebuildFunctions/rebuildTables must delegate to applyIdempotentEntries —
		// reintroducing a drop-then-add loop there reopens the cascade trap.
		expect(source).toContain('function applyIdempotentEntries');
		const functionsBody = source.split('export async function rebuildFunctions')[1] ?? '';
		expect(functionsBody.slice(0, 300)).toContain('applyIdempotentEntries');
		const tablesBody = source.split('export function rebuildTables')[1] ?? '';
		expect(tablesBody.slice(0, 300)).toContain('applyIdempotentEntries');
	});

	test('search-store trigger and table stay named consistently with the engine gate', () => {
		// search_store.ts probes '<table>_string_search_sync' and builder_string
		// emits 'FROM matrix_string_search' — renaming either side must redden.
		expect(tables.some((t) => t.name === 'matrix_string_search')).toBe(true);
		const trigger = triggers.find((t) => t.name === 'all_matrix_string_search_sync');
		expect(trigger).toBeDefined();
		expect(trigger?.add).toContain('{$table}_string_search_sync');
		expect(trigger?.add).toContain('EXECUTE FUNCTION matrix_string_search_sync()');
	});
});
