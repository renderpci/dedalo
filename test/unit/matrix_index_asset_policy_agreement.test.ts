/**
 * The asset layer and the prune policy must AGREE (WC-056).
 *
 * Two independent sources decide which indexes a policy-governed log carries:
 *   - db_pg_definitions.json `ar_index` — what `recreateDbAssets` CREATES;
 *   - matrix_index_policy.ts — what `pruneMatrixIndexes` DROPS, as the first
 *     step of the Database-info widget's "Optimize tables".
 * When they disagree the install oscillates: Optimize drops an index, the next
 * asset rebuild recreates it, and nobody notices except as a slow search.
 *
 * That is not hypothetical — it is how the dd542 Who search came to have NO
 * index on `relation`. `all_matrix_relation_gin_idx` is asset-provisioned for
 * every matrix table, while the policy classified `gin (relation jsonb_path_ops)`
 * as `drop-dead`; the prune won, and a Who search for an actor who had left the
 * organization stopped returning at all (>300 s on the 32.9M-row mdcat log).
 * The `drop-dead` gate that should have objected (idxScan > 0) was blind because
 * the cluster's cumulative stats had been reset — the STATS CAVEAT recorded in
 * the policy file, realized.
 *
 * SIGNATURES ARE NOT HAND-WRITABLE, which is the second thing this gate exists
 * for. A policy signature is `pg_get_indexdef` output, and Postgres renders an
 * EXPRESSION column with an extra paren layer:
 *     CREATE INDEX … ((relation->'dd543'->0->>'section_id'), …)
 *   → using btree (((((relation -> 'dd543'::text) -> 0) ->> 'section_id'::text)), …)
 * A signature transcribed from the CREATE statement matches nothing, so the
 * entry silently becomes dead text and the index reverts to 'unclassified'. The
 * only trustworthy source is the live catalog, so this gate reads it.
 *
 * Scope: the policy-governed tables only (matrix_activity, matrix_time_machine).
 * The indexes are created IF NOT EXISTS on the test database — tiny there.
 */

import { describe, expect, test } from 'bun:test';
import definitions from '../../src/core/db/db_pg_definitions.json';
import {
	classifyIndex,
	MATRIX_INDEX_POLICIES,
	normalizeIndexDef,
} from '../../src/core/db/matrix_index_policy.ts';
import { sql } from '../../src/core/db/postgres.ts';

interface AssetIndexEntry {
	tables?: string[];
	add: string;
	name: string;
}

const GOVERNED = MATRIX_INDEX_POLICIES.map((policy) => policy.table);

/**
 * KNOWN, UNRESOLVED contradictions — a RATCHET, not an approval.
 *
 * These per-column GINs are provisioned for every matrix table by the shared
 * `all_matrix_<col>_gin_idx` asset entries, while the policy calls them
 * drop-dead on this log. Both sides have a case, and picking one is a decision
 * with install-wide blast radius that this gate deliberately does not make:
 *   - the POLICY looks right for the emitted shapes. The json/iri builders match
 *     with `jsonb_path_query(...)` inside an EXISTS, which a jsonb_path_ops GIN
 *     cannot serve at all, so on this insert-hot log they are pure write
 *     amplification — exactly WC-046's argument.
 *   - the ASSET entries are SHARED with every ordinary section, so removing
 *     them here means either scoping them away from the governed logs or
 *     dropping them everywhere, and the second needs proof that no emitted
 *     shape anywhere uses `@>`/`@?` on these columns.
 * Until that is settled each Optimize/rebuild cycle drops and recreates them.
 * `relation` was on this list in spirit and is what made the dd543 Who search
 * unusable — which is why the list is now WATCHED: the assertion below fails on
 * any contradiction NOT named here, so a new one cannot join them silently.
 */
const ACKNOWLEDGED_CONTRADICTIONS: ReadonlySet<string> = new Set([
	'using gin (misc jsonb_path_ops)',
	'using gin (date jsonb_path_ops)',
	'using gin (iri jsonb_path_ops)',
	'using gin (relation_search jsonb_path_ops)',
	'using gin (geo jsonb_path_ops)',
	'using gin (number jsonb_path_ops)',
	'using gin (string jsonb_path_ops)',
]);

/** ar_index entries the asset layer would create on a policy-governed table. */
function assetEntriesFor(table: string): AssetIndexEntry[] {
	return (definitions.ar_index as AssetIndexEntry[]).filter(
		(entry) => (entry.tables ?? []).includes(table) && entry.add.trim() !== '',
	);
}

describe('asset-provisioned indexes are never classified as droppable', () => {
	for (const table of GOVERNED) {
		const policy = MATRIX_INDEX_POLICIES.find((candidate) => candidate.table === table);
		if (policy === undefined) throw new Error(`policy missing for ${table}`);

		test(`${table}: every ar_index entry survives pruneMatrixIndexes`, async () => {
			const entries = assetEntriesFor(table);
			expect(entries.length, `no ar_index entries target ${table}`).toBeGreaterThan(0);

			// Materialize them so the CANONICAL definition comes from Postgres
			// rather than from the CREATE text (see the header).
			for (const entry of entries) {
				await sql.unsafe(entry.add.replaceAll('{$table}', table), []);
			}

			const live = (await sql.unsafe(
				`SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS def,
				        (con.oid IS NOT NULL) AS is_constraint
				 FROM pg_index i
				 JOIN pg_class c ON c.oid = i.indexrelid
				 LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid
				 WHERE i.indrelid = $1::regclass`,
				[table],
			)) as { name: string; def: string; is_constraint: boolean }[];

			const provisioned = new Set(
				entries.map((entry) => entry.name.replace('{$table}', table)).map((name) => name),
			);
			// ar_index names are templated as `{$table}_suffix` OR carry an
			// all_matrix_* logical name; match on the concrete relation names the
			// CREATE statements produced.
			const checked: string[] = [];
			const acknowledged: string[] = [];
			for (const index of live) {
				const createdByAssets =
					provisioned.has(index.name) ||
					entries.some((entry) =>
						entry.add.replaceAll('{$table}', table).includes(` ${index.name} `),
					);
				if (!createdByAssets) continue;
				const verdict = classifyIndex(
					{
						name: index.name,
						indexDef: index.def,
						isConstraint: index.is_constraint,
						idxScan: 0, // the worst case: the DB cannot vouch for it (stats wipe)
						sizeBytes: 1,
					},
					policy,
					{ singleTipo: true, includeReview: false },
				);
				checked.push(index.name);
				const signature = normalizeIndexDef(index.def);
				if (verdict.action === 'drop' && ACKNOWLEDGED_CONTRADICTIONS.has(signature)) {
					acknowledged.push(signature);
					continue;
				}
				expect(
					verdict.action,
					`${index.name} is asset-provisioned but the prune would ${verdict.action} it — ` +
						`asset layer and policy disagree. Signature: ${signature}`,
				).not.toBe('drop');
			}
			expect(checked.length, `no asset index matched a live index on ${table}`).toBeGreaterThan(0);
			// Ratchet the other way too: an acknowledged contradiction that has been
			// RESOLVED must be removed from the list, or it silently exempts a
			// future regression with the same signature.
			for (const signature of ACKNOWLEDGED_CONTRADICTIONS) {
				if (table !== 'matrix_activity') continue;
				expect(
					acknowledged,
					`'${signature}' is on the acknowledged-contradiction list but no longer contradicts — remove it`,
				).toContain(signature);
			}
		}, 120000);
	}
});

describe('hand-written policy signatures match the live catalog', () => {
	test('the dd543 Who expression signature is exactly what Postgres renders', async () => {
		const rows = (await sql.unsafe(
			`SELECT pg_get_indexdef(indexrelid) AS def FROM pg_index
			 WHERE indrelid = 'matrix_activity'::regclass
			   AND indexrelid::regclass::text = 'matrix_activity_who_ts_idx'`,
			[],
		)) as { def: string }[];
		expect(rows.length, 'matrix_activity_who_ts_idx not present on the test DB').toBe(1);

		const signature = normalizeIndexDef(rows[0]?.def ?? '');
		const policy = MATRIX_INDEX_POLICIES.find((entry) => entry.table === 'matrix_activity');
		const match = policy?.entries.find((entry) => entry.signature === signature);
		expect(
			match,
			`no policy entry matches the live signature — the hand-written one has drifted:\n  live: ${signature}`,
		).toBeDefined();
		expect(match?.disposition).toBe('keep');
	}, 60000);

	test('the restored relation GIN signature matches too', async () => {
		const rows = (await sql.unsafe(
			`SELECT pg_get_indexdef(indexrelid) AS def FROM pg_index
			 WHERE indrelid = 'matrix_activity'::regclass
			   AND indexrelid::regclass::text = 'matrix_activity_relation_gin_idx'`,
			[],
		)) as { def: string }[];
		expect(rows.length).toBe(1);
		const signature = normalizeIndexDef(rows[0]?.def ?? '');
		const policy = MATRIX_INDEX_POLICIES.find((entry) => entry.table === 'matrix_activity');
		const match = policy?.entries.find((entry) => entry.signature === signature);
		expect(match, `relation GIN signature drifted:\n  live: ${signature}`).toBeDefined();
		expect(match?.disposition).toBe('keep');
	}, 60000);
});
