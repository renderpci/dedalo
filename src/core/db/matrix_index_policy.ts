/**
 * MATRIX INDEX POLICY — the single source of truth for which indexes the two
 * append-only log tables (matrix_activity = dd542 Activity, matrix_time_machine
 * = dd15 Time Machine) SHOULD carry, and which are dead weight to prune.
 *
 * WHY THIS EXISTS. Both tables reach production scale (mdcat: activity 32.9M
 * rows / 85 GB, TM 50.5M rows / 46 GB) and have accreted indexes over the PHP
 * era — mdcat carried ~9.8 GB of indexes on activity and ~13 GB on TM, much of
 * it never chosen by the planner for the query shapes this TS engine actually
 * emits. Every one of those indexes is maintained on the HOTTEST insert path in
 * the system (every save appends a TM row; many append an activity row) — pure
 * write amplification. This module states, per table and per index SIGNATURE
 * (not name — names vary by install), what to keep and why. The executor is
 * db_assets.pruneMatrixIndexes, run against the ACTIVE database as the first
 * step of the Database-info widget's "Optimize tables" action (WC-046).
 *
 * The query shapes this policy is calibrated for (see WC-044/WC-054 + read_tm.ts):
 *  - Activity list: single-section, insertion order (When → section_id; the
 *    dd549 default → id; every other column is sortable:false). WC-054 emits
 *    ALL of them as `"timestamp" <dir>, id <dir>`, so the ("timestamp", id)
 *    INCLUDE index serves the list, the deep-page late-lookup/flip page scan
 *    AND the dashboard 30-day rollup. The UNIQUE (section_id, section_tipo) key
 *    still enables the flatten + the 1:1 join back; (section_tipo, section_id
 *    DESC) now backs the bare-browse count rather than the list order.
 *  - TM list: bare browse `ORDER BY id`; record-history filtered by
 *    (section_tipo, section_id[, tipo, lang]) and ALSO ordered by `id` — the
 *    scope and the sort key must live in ONE index or the planner has only
 *    losing plans (see the record-history entry); deep-page flip on the `id` PK.
 *
 * DISPOSITIONS.
 *  - keep           load-bearing for a shape above; never drop.
 *  - drop-redundant strictly covered by a kept index (a prefix/superset, or —
 *                   when the table holds ONE section_tipo — an alias of the
 *                   list index). Dropped even if it shows scans: the scans
 *                   migrate to the covering index.
 *  - drop-dead      no emitted shape uses it; drop ONLY when idx_scan = 0 (the
 *                   tool downgrades to a warning if the DB proves it used).
 *  - review         plausibly-useful but currently cold / oversized; the tool
 *                   REPORTS it and drops only with an explicit opt-in.
 * An index whose signature is not listed here is 'unclassified' — left in place
 * and reported, never dropped (installs may carry bespoke indexes).
 *
 * DIRECTION (why several `(col, id DESC)` indexes below can NEVER serve their
 * own ORDER BY). read_tm.ts emits the tiebreaker in the SAME direction as the
 * sort column — `ORDER BY <col> <dir>, id <dir>`. A btree is only readable
 * forwards or backwards, so `(col ASC, id DESC)` serves `col ASC, id DESC` or
 * `col DESC, id ASC` — never `col ASC, id ASC`. Every composite here is
 * `(col, id DESC)`, so the sort always degrades to an Incremental Sort over a
 * full index scan. That is cheap when the leading column's groups are tiny
 * (timestamp) and ruinous when they are huge (bulk_process_id 20 s, data 15 s
 * even straight after a REINDEX). The fix is a sort POLICY, not more indexes:
 * TIME_MACHINE_SORTABLE_TIPOS (concepts/section.ts) carries the full
 * bloated-vs-reindexed measurement table and the reasoning; WC-044 did the same
 * for dd542 Activity.
 *
 * STATS CAVEAT (2026-07-25, PostgreSQL 18). The 'drop-dead' disposition is
 * gated on `idxScan > 0` — "drop only if the DB agrees it is unused". That
 * gate reads pg_stat_user_indexes, whose CUMULATIVE counters are LOST on crash
 * recovery and on a pg_upgrade (this cluster came up with stats_reset NULL and
 * every TM index back at ~0 scans while the table still held 50.5M rows). On a
 * freshly restarted or upgraded server every index therefore looks unused and
 * the gate silently stops protecting. Never run a prune to decide "dead" on a
 * server whose stats have just been reset — check
 * `pg_stat_database.stats_reset` / postmaster uptime first. The dispositions
 * here are derived from TRACED EMITTERS (call sites in this repo), not from
 * scan counts, precisely so the policy survives a stats wipe.
 */

export type IndexDisposition = 'keep' | 'drop-redundant' | 'drop-dead' | 'review';

export interface IndexPolicyEntry {
	/** Normalized definition tail (normalizeIndexDef output): `using <method> (…)`. */
	readonly signature: string;
	readonly disposition: IndexDisposition;
	readonly reason: string;
	/**
	 * A 'drop-redundant' claim that holds ONLY while the table stores a single
	 * section_tipo (then (section_tipo, X) ≡ (X)). The tool verifies distinct
	 * section_tipo = 1 before honoring it; otherwise it downgrades to 'review'.
	 */
	readonly requiresSingleTipo?: boolean;
}

export interface MatrixTablePolicy {
	readonly table: string;
	/**
	 * Signatures the read/flip code STRUCTURALLY depends on — every one must be
	 * present as a 'keep' entry (self-checked by matrix_index_policy.test.ts). A
	 * prune run that cannot find one of these on a live DB warns loudly.
	 */
	readonly requiredSignatures: readonly string[];
	readonly entries: readonly IndexPolicyEntry[];
}

/**
 * Normalize `pg_get_indexdef(oid)` to a stable, name-independent signature: the
 * canonical tail from `USING` onward, lowercased with whitespace collapsed.
 * Postgres regenerates this text deterministically, so the same logical index
 * yields the same signature on every install (that is what makes the policy
 * portable). Returns '' if the def has no USING clause (never expected).
 */
export function normalizeIndexDef(indexDef: string): string {
	const usingAt = indexDef.toLowerCase().indexOf(' using ');
	if (usingAt === -1) return '';
	return indexDef
		.slice(usingAt + 1)
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

const ACTIVITY: MatrixTablePolicy = {
	table: 'matrix_activity',
	requiredSignatures: [
		'using btree (section_id, section_tipo)', // UNIQUE key: flatten + deep-page flip enabler
		'using btree (section_tipo, section_id desc)', // bare-browse count + asset-provisioned
		'using btree ("timestamp", id) include (section_tipo, section_id)', // THE list order (WC-054)
	],
	entries: [
		// --- keep (load-bearing) -------------------------------------------------
		{
			signature: 'using btree (section_id, section_tipo)',
			disposition: 'keep',
			reason:
				'UNIQUE key — enables the WC-044 flattened SQL and the deep-page order-flip; the flip/late page scan is index-only on it.',
		},
		{
			signature: 'using btree (section_tipo, section_id desc)',
			disposition: 'keep',
			reason:
				'Was the primary list index; since WC-054 the list orders on the (timestamp, id) index instead. Kept because it is the narrowest index for the bare-browse count (index-only) and is asset-provisioned for every matrix table (db_pg_definitions.json all_matrix_section_tipo_section_id_desc_idx), so pruning it would only have recreateDbAssets put it back.',
		},
		{
			signature: 'using btree ("timestamp", id) include (section_tipo, section_id)',
			disposition: 'keep',
			reason:
				'THE dd542 list index since WC-054, not just the dashboard 30-day rollup: every dd542 sort is insertion order, emitted as `"timestamp" <dir>, id <dir>`, which this index serves outright with NO sort node — including the deep-page late-lookup/flip page scan, and including a When date filter, where the previous key-ordered shape flipped the planner into an abort-early backward PK walk (>300 s for a one-month range vs 6.1 ms here). The INCLUDE keeps the rollup and the page scan index-only. Load-bearing on the LIST path now: dropping it does not degrade the browse, it breaks it.',
		},
		// --- drop-redundant (covered by a kept index) ----------------------------
		{
			signature: 'using btree (section_tipo, section_id desc, "timestamp")',
			disposition: 'drop-redundant',
			reason:
				'Prefix-superset of the (section_tipo, section_id DESC) list index; the trailing timestamp serves no emitted shape.',
		},
		{
			signature: 'using btree (section_tipo, "timestamp", section_id)',
			disposition: 'drop-redundant',
			requiresSingleTipo: true,
			reason:
				'Single-tipo table ⇒ ≡ (timestamp, section_id); the (timestamp, id) INCLUDE index already covers timestamp-ordered scans.',
		},
		{
			signature: 'using btree (section_id desc nulls last)',
			disposition: 'drop-redundant',
			requiresSingleTipo: true,
			reason: 'Single-tipo table ⇒ an alias of the (section_tipo, section_id DESC) list index.',
		},
		{
			signature: 'using gin (relation jsonb_path_ops)',
			disposition: 'keep',
			reason:
				'RESTORED 2026-07-27 (WC-056) — it was classified drop-dead on the reasoning that "the forced section_id ordering makes the planner pick the ordered btree + Filter, never this GIN". That described the SYMPTOM of the ordering trap, not a dead index, and the drop-dead gate (idxScan > 0) could not object because this cluster came up with stats_reset NULL (the STATS CAVEAT in this file, realized). The traced emitter is every relation-column search on the log — dd543 Who, dd545 What (builder_relation containment) — and without it a search for a RARE value has no plan but a full ordered walk: >300 s for an actor last seen in 2016, 12.5 ms with the GIN. It is also asset-provisioned for every matrix table (db_pg_definitions.json all_matrix_relation_gin_idx), so dropping it here only had recreateDbAssets put it back. 434 MB, 96 s to build on the 32.9M-row mdcat log. NOTE it fixes only the rare-value case — a HEAVY value keeps the ordered walk (correctly), and a heavy-but-OLD value needs the expression index below.',
		},
		{
			// Verbatim normalizeIndexDef output — an expression column is rendered
			// with an EXTRA paren layer, so this cannot be hand-derived from the
			// CREATE INDEX text; it was read back from pg_get_indexdef.
			signature:
				"using btree (((((relation -> 'dd543'::text) -> 0) ->> 'section_id'::text)), ((((relation -> 'dd543'::text) -> 0) ->> 'section_tipo'::text)), \"timestamp\" desc, id desc)",
			disposition: 'keep',
			reason:
				'The dd543 Who search (WC-056): leading actor equality + the trailing ("timestamp", id) sort key means one index answers the filter AND the order, so a page is O(LIMIT) for EVERY actor — 1.1-4.3 ms measured across 1k / 52k / 206k / 8.1M-row actors, where containment ranged from 90 ms to >300 s and no static plan choice was right for all of them. Requires the matching emitter (builder_relation buildActivityWhoFragment): a containment predicate cannot use it.',
		},
		// --- drop-dead (no emitted shape uses these; WC-044 rejected the jsonb
		//     component-sort / expression-index route for this insert-hot log) ----
		...['data', 'relation_search', 'string', 'date', 'iri', 'geo', 'number', 'media', 'misc'].map(
			(col): IndexPolicyEntry => ({
				signature: `using gin (${col} jsonb_path_ops)`,
				disposition: 'drop-dead',
				reason: `GIN on ${col}: the forced section_id ordering makes the planner pick the ordered btree + Filter, never this GIN — pure write amplification.`,
			}),
		),
		{
			signature: 'using brin ("timestamp")',
			disposition: 'drop-dead',
			reason: 'BRIN(timestamp): superseded by the (timestamp, id) btree; never chosen.',
		},
		{
			signature: 'using brin (date("timestamp"))',
			disposition: 'drop-dead',
			reason: 'BRIN(date(timestamp)): no emitted shape orders/filters on date(timestamp).',
		},
	],
};

const TIME_MACHINE: MatrixTablePolicy = {
	table: 'matrix_time_machine',
	// TM is MULTI-tipo (no UNIQUE (section_id, section_tipo) key) and its list
	// orders by the `id` PK; the flip page scan is on the PK. Record history
	// narrows by (section_tipo, section_id).
	requiredSignatures: [
		'using btree (id)', // PK: bare list order + deep-page flip page scan
		'using btree (section_tipo, section_id desc, id desc)', // record-history scope + its id order
		'using btree (section_tipo, section_id desc)', // asset-layer all-matrix index
	],
	entries: [
		// --- keep ----------------------------------------------------------------
		{
			signature: 'using btree (id)',
			disposition: 'keep',
			reason: 'PK — the bare browse orders by id; the deep-page flip page scan is on id.',
		},
		{
			signature: 'using btree (section_tipo, section_id desc, id desc)',
			disposition: 'keep',
			reason:
				'Record-history scope AND its sort key. The inspector history is `WHERE section_tipo=? AND section_id=? ORDER BY id DESC LIMIT n` (read_tm.ts queryTmRows): with both leading columns equality-bound the trailing id DESC IS the requested order, so the page is 40 index entries + 10 heap fetches. Without it no index gives that order and the planner has only losers — read the record’s WHOLE history and top-N sort it, or walk the section’s whole log filtering section_id. Measured on dd655/236 (113k-row history), with → without: 0.29 ms → 4 216 ms on the bloated indexes that produced the original 11.5 s incident report, and 1.5 ms → 302 ms straight after a REINDEX. Bloat sets the magnitude; the SHAPE is what matters and does not change — without this index the query reads all 113 251 rows to return 10, so its cost tracks the record’s history size instead of the page size (verified flat to a 433 895-row history: 0.37 ms). The trailing DESC on section_id makes it a strict superset of the all-matrix (section_tipo, section_id DESC) index, so the section-scoped `ORDER BY section_id DESC` path (TM_ORDER_COLUMN) is served by this one too.',
		},
		{
			signature: 'using btree (section_tipo, section_id desc)',
			disposition: 'keep',
			reason:
				'Record-history SCOPE without the sort key — a strict prefix of the index above, so it never serves the ROW read. It stays for two reasons: the scoped pagination COUNT (tmReadSource.count) is index-ONLY on it and this is the narrowest index that can serve that (measured 9.5 ms over 113k entries; the wider record-history index would read ~4x the pages), and it is provisioned for EVERY matrix table by the asset layer (db_pg_definitions.json all_matrix_section_tipo_section_id_desc_idx), so pruning it here would only have recreateDbAssets put it back.',
		},
		{
			signature: 'using btree (section_id, section_tipo, tipo, lang, "timestamp" desc)',
			disposition: 'keep',
			reason:
				'WRITE-PATH index, not a search one — that is why its scan count dwarfs every other index here. The save/delete backfill probe `WHERE section_tipo=? AND section_id=? AND tipo=? AND lang=? LIMIT 1` (observers.ts, delete_record.ts x2) binds all four leading columns, so this is the only index that answers it index-only. Measured on es1/1: MISS (the case the probe exists to detect) 1.3 ms with it, 24 941 ms without — a 25 s stall on a save. Also scopes the portalize TM relocation UPDATE. Was classified "review" (operator opt-in to DROP) on scan-count-vs-size grounds; the audit that asked its own question — "confirm no history-search shape needs it" — found the consumer is the write path.',
		},
		{
			signature: 'using btree (section_id)',
			disposition: 'keep',
			reason:
				'Backs the bare dd15 browse sorted by the Section id column (`ORDER BY section_id`, TM_ORDER_COLUMN dd1212) — the only sortable dd15 column whose order an index serves outright (measured cost 1.36 for a page). NOT "section_id equality": no emitted shape filters section_id alone.',
		},
		{
			signature: 'using btree (tipo, id desc)',
			disposition: 'keep',
			reason:
				'The record-snapshot LIST (`WHERE tipo = ? ORDER BY id DESC`, buildTmWhere tipoColumnFilter) — leading equality + trailing id DESC exactly matches, 0.19 ms a page. Also the prefix for the lang-transform census/UPDATE (`WHERE tipo=? AND lang=?`, update/transform/lang.ts).',
		},
		{
			signature: 'using btree ("timestamp", id desc)',
			disposition: 'keep',
			reason:
				'Date predicates from the dd15 search panel (dd559 → tm_filter timestamp) and the bare browse sorted by When: `ORDER BY "timestamp" DESC, id DESC` cannot be served outright (see the DIRECTION note in the header) but incremental-sorts over this index in 10 ms because timestamp groups are tiny.',
		},
		{
			signature: 'using btree (section_tipo, id desc)',
			disposition: 'keep',
			reason:
				'Section-tipo predicate from the dd15 search panel (dd1772 → tm_filter section_tipo) with the default id order. NOTE: it does NOT serve the record history — that needs section_id bound too (see the record-history index); the scans it accumulated before that index existed were the planner picking it as the least-bad option, at 6 s a page.',
		},
		{
			signature: 'using btree (user_id)',
			disposition: 'keep',
			reason:
				'The Who EQUALITY filter on the bare dd15 search panel: dd578 conforms to `user_id = ?` / `IS [NOT] NULL` (tm_filter emitRelation). NOT the ORDER BY — a Who SORT is 7.9 s even with this index (it cannot serve `user_id <dir>, id <dir>`) and is disallowed by the dd15 sort policy. The read_tm.ts note that the dd578 relation filter is "ignored" is scoped to the LOCATOR/tipo surfaces, where sqo.filter is not conformed at all; on the bare list it reaches conformTmFilter.',
		},
		// --- drop-dead -----------------------------------------------------------
		{
			signature: 'using btree (section_id, bulk_process_id, section_tipo, tipo, lang)',
			disposition: 'drop-dead',
			reason: 'No emitted shape leads on this column order; the biggest cold index on the table.',
		},
		{
			signature: 'using btree (section_id desc nulls last)',
			disposition: 'drop-dead',
			reason: 'TM never orders by section_id DESC; equality is served by (section_id).',
		},
		{
			signature: 'using btree (lang)',
			disposition: 'drop-dead',
			reason:
				'A standalone lang index is far too low-selectivity to be chosen; lang narrows only alongside (section_tipo, section_id).',
		},
		{
			signature: 'using brin (date("timestamp"))',
			disposition: 'drop-dead',
			reason: 'No emitted shape orders/filters on date(timestamp).',
		},
		{
			signature: 'using btree (bulk_process_id)',
			disposition: 'keep',
			reason:
				'The ONLY index for bulk_revert’s batch read (`WHERE bulk_process_id = $1`, tool_time_machine/server/bulk_revert.ts) and for the Process equality filter on the dd15 search panel (dd1371 → tm_filter emitNumber). Its scan count is ~0 because bulk reverts are rare, NOT because the shape is dead — dropping it turns every bulk revert into a 50M-row seq scan. Cold ≠ unused: this is exactly the case idx_scan cannot see.',
		},
		// --- review (plausibly useful; report, opt-in to drop) -------------------
		{
			signature: 'using gin (((data)::text) gin_trgm_ops)',
			disposition: 'review',
			reason:
				'Trigram search over TM data text — no emitted shape uses it, and on mdcat it is INVALID + not-ready (a failed CONCURRENTLY build), so it is not even maintained on insert. Zero-cost dead metadata; opt-in to drop.',
		},
	],
};

export const MATRIX_INDEX_POLICIES: readonly MatrixTablePolicy[] = [ACTIVITY, TIME_MACHINE];

/** The policy for a table, or undefined if this table is not policy-governed. */
export function policyForTable(table: string): MatrixTablePolicy | undefined {
	return MATRIX_INDEX_POLICIES.find((policy) => policy.table === table);
}

export interface LiveIndex {
	readonly name: string;
	readonly indexDef: string;
	/** True for PK / UNIQUE-CONSTRAINT-backed indexes — never DROP INDEX-able. */
	readonly isConstraint: boolean;
	readonly idxScan: number;
	readonly sizeBytes: number;
}

export type PruneAction = 'keep' | 'drop' | 'review' | 'unclassified';

export interface ClassifiedIndex {
	readonly index: LiveIndex;
	readonly signature: string;
	readonly disposition: IndexDisposition | 'unclassified';
	readonly action: PruneAction;
	readonly reason: string;
}

/**
 * Classify one live index against the table policy, given whether the table is
 * currently single-tipo (gates the single-tipo redundancy claims) and whether
 * 'review' entries are opted in. Pure — the tool does the DB I/O and the DROP.
 */
export function classifyIndex(
	entry: LiveIndex,
	policy: MatrixTablePolicy,
	options: { singleTipo: boolean; includeReview: boolean },
): ClassifiedIndex {
	const signature = normalizeIndexDef(entry.indexDef);
	// A constraint-backed index cannot be dropped with DROP INDEX and is always
	// load-bearing (PK / UNIQUE) — never touch it, whatever the policy says.
	if (entry.isConstraint) {
		return {
			index: entry,
			signature,
			disposition: 'keep',
			action: 'keep',
			reason: 'constraint-backed (PK/UNIQUE) — not DROP INDEX-able.',
		};
	}
	const match = policy.entries.find((policyEntry) => policyEntry.signature === signature);
	if (match === undefined) {
		return {
			index: entry,
			signature,
			disposition: 'unclassified',
			action: 'unclassified',
			reason: 'not in policy — left in place for review.',
		};
	}
	const disposition = match.disposition;
	// A single-tipo-only redundancy on a multi-tipo table is not actually
	// redundant — downgrade to a report instead of an unsafe drop.
	if (
		disposition === 'drop-redundant' &&
		match.requiresSingleTipo === true &&
		!options.singleTipo
	) {
		return {
			index: entry,
			signature,
			disposition: 'review',
			action: 'review',
			reason: `${match.reason} (DOWNGRADED: table is not single-tipo, so this is not redundant.)`,
		};
	}
	if (disposition === 'keep')
		return { index: entry, signature, disposition, action: 'keep', reason: match.reason };
	if (disposition === 'drop-redundant')
		return { index: entry, signature, disposition, action: 'drop', reason: match.reason };
	if (disposition === 'drop-dead') {
		// Only drop a "dead" index if the DB agrees it is unused; a nonzero scan
		// count means an emitted shape we did not model relies on it.
		if (entry.idxScan > 0) {
			return {
				index: entry,
				signature,
				disposition,
				action: 'review',
				reason: `${match.reason} (KEPT: ${entry.idxScan} scans on this DB — unexpectedly used.)`,
			};
		}
		return { index: entry, signature, disposition, action: 'drop', reason: match.reason };
	}
	// review
	return {
		index: entry,
		signature,
		disposition,
		action: options.includeReview ? 'drop' : 'review',
		reason: match.reason,
	};
}
