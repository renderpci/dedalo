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
 * The query shapes this policy is calibrated for (see WC-044 + read_tm.ts):
 *  - Activity list: single-section, `ORDER BY section_id <dir> LIMIT n` (When
 *    → section_id; every other column is sortable:false). Served + deep-page
 *    flipped by (section_tipo, section_id DESC) + the UNIQUE (section_id,
 *    section_tipo) key. Dashboard 30-day rollup scans (timestamp, id).
 *  - TM list: bare browse `ORDER BY id`; record-history filtered by
 *    (section_tipo, section_id[, tipo, lang]); deep-page flip on the `id` PK.
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
		'using btree (section_tipo, section_id desc)', // list index + flip/late page scan
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
				'Primary list index — newest-first browse (section_id DESC) and the flip page scan, index-only.',
		},
		{
			signature: 'using btree ("timestamp", id) include (section_tipo, section_id)',
			disposition: 'keep',
			reason: 'Dashboard 30-day activity rollup (timestamp range), index-only via the INCLUDE.',
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
		// --- drop-dead (no emitted shape uses these; WC-044 rejected the jsonb
		//     component-sort / expression-index route for this insert-hot log) ----
		...[
			'data',
			'relation',
			'relation_search',
			'string',
			'date',
			'iri',
			'geo',
			'number',
			'media',
			'misc',
		].map(
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
		'using btree (section_tipo, section_id desc)', // record-history scope
	],
	entries: [
		// --- keep ----------------------------------------------------------------
		{
			signature: 'using btree (id)',
			disposition: 'keep',
			reason: 'PK — the bare browse orders by id; the deep-page flip page scan is on id.',
		},
		{
			signature: 'using btree (section_tipo, section_id desc)',
			disposition: 'keep',
			reason: 'Record-history scope: a record’s TM rows by (section_tipo, section_id).',
		},
		{
			signature: 'using btree (section_id)',
			disposition: 'keep',
			reason: 'section_id equality (cross-tipo record lookups).',
		},
		{
			signature: 'using btree (tipo, id desc)',
			disposition: 'keep',
			reason: 'Component-scoped history (filter by tipo).',
		},
		{
			signature: 'using btree ("timestamp", id desc)',
			disposition: 'keep',
			reason: 'Time-ordered TM scans.',
		},
		{
			signature: 'using btree (section_tipo, id desc)',
			disposition: 'keep',
			reason: 'Section-scoped newest-first TM listing.',
		},
		{
			signature: 'using btree (user_id)',
			disposition: 'keep',
			reason: 'Per-user audit history.',
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
		// --- review (plausibly useful; report, opt-in to drop) -------------------
		{
			signature: 'using btree (section_id, section_tipo, tipo, lang, "timestamp" desc)',
			disposition: 'review',
			reason:
				'The "search default" composite — oversized (multi-GB) for its scan count; confirm no history-search shape needs it before dropping.',
		},
		{
			signature: 'using btree (bulk_process_id)',
			disposition: 'review',
			reason:
				'Bulk-process inspection filter — semantically real but cold; operator opt-in to drop.',
		},
		{
			signature: 'using gin (((data)::text) gin_trgm_ops)',
			disposition: 'review',
			reason: 'Trigram search over TM data text — tiny; harmless to keep, opt-in to drop.',
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
