/**
 * ONTOLOGY IDENTIFIERS — the report and repair of dd_ontology rows that break
 * the identifier grammar (SURF-1, owner decision 2026-09-30: NOT VALID + report
 * + repair tool).
 *
 * WHY THIS EXISTS. Migration `0013_dd_ontology_identifier_grammar.sql` adds six
 * CHECK constraints on dd_ontology's identifier columns (db/dd_ontology.ts
 * header: the grammar). They are added NOT VALID, because an installed database
 * may already hold violating rows and a validating ADD would brick the boot
 * migration. Such a row is dangerous where it stands — the search engine and
 * the tree read it as an identifier — and it also blocks writes of itself (the
 * CHECK re-checks a legacy row on any UPDATE). This reconcile finds those rows,
 * says what it would do with each, and on an operator APPLY does it, then
 * VALIDATEs every constraint whose rule is clean.
 *
 * THE REPAIR CLASSES (one per row, decided by the TS predicate):
 *   - `rebuild` — the tipo is valid and its letter prefix is a safe tld that
 *     HAS source records: the row is a projection, so the fix is to re-derive
 *     it. `rebuildOntology(tld, {reclaimIds})` wipes the tld (plus the row by
 *     id, when it is filed under another tld) and re-parses its source in ONE
 *     transaction; the parser never projects an invalid reference (parser.ts
 *     OntologyNodeDefect), so the row comes back clean or not at all, and a
 *     source that is still bad is named in `invalidReferenceRecords`.
 *   - `delete` — everything else: a non-grammar tipo, or a prefix with no
 *     source to re-derive from. No request gate can address such a row (a
 *     tipo that is not a tipo is refused by every door), so it is deleted —
 *     FIRST, before any rebuild could wipe it unrecorded — and returned WHOLE
 *     in `detail.deleted` and in the log (one JSON-escaped line per row). A
 *     VALIDATE that fails afterwards never costs that record: the report
 *     still returns, with `validation_error`. There is no
 *     quarantine table (the Dédalo way: no bespoke tables); the report is the
 *     record of what went.
 * Deletion happens ONLY on an operator apply: the scheduled boot run is DRY
 * (no autoApply) — it reports, so an install carrying violators says so at
 * every boot.
 *
 * Registered through src/core/reconcile/catalog.ts (name `ontology_identifiers`).
 */

import {
	type DdOntologyIdentifierRow,
	type DeletedDdOntologyRow,
	ddOntologyConstraintStates,
	deleteDdOntologyRowsReturning,
	scanDdOntologyIdentifierRows,
	validateDdOntologyIdentifierConstraints,
} from '../db/dd_ontology.ts';
import type { ReconcileDefinition, ReconcileReport } from '../reconcile/registry.ts';
import {
	type OntologyWriteResult,
	rebuildOntology,
	tldHasSourceRecords,
} from './ontology_state.ts';
import { getTldFromTipo, safeTld } from './tld.ts';

/** What the repair would do (or did) with one violating row. */
export type IdentifierRepairAction = 'rebuild' | 'delete';

/** One violating row in the report. */
export interface IdentifierRepairRow {
	id: number;
	tipo: string;
	tld: string | null;
	/** `<rule>:<reason>` per broken rule. */
	violations: string[];
	action: IdentifierRepairAction;
	/** `rebuild` only: the tld whose rebuild re-derives the row. */
	rebuildTld?: string;
}

/** The tld whose rebuild can re-derive `row`, or null when none can. */
async function rebuildTldOf(
	row: DdOntologyIdentifierRow,
	sourced: Map<string, boolean>,
): Promise<string | null> {
	if (row.violations.some((violation) => violation.column === 'tipo')) return null;
	const prefix = getTldFromTipo(row.tipo);
	const tld = prefix === null ? null : safeTld(prefix);
	if (tld === null) return null;
	if (!sourced.has(tld)) sourced.set(tld, await tldHasSourceRecords(tld));
	return sourced.get(tld) === true ? tld : null;
}

/** The planned action for every violating row. */
async function planRepair(
	rows: readonly DdOntologyIdentifierRow[],
): Promise<IdentifierRepairRow[]> {
	const sourced = new Map<string, boolean>();
	const plan: IdentifierRepairRow[] = [];
	for (const row of rows) {
		const rebuildTld = await rebuildTldOf(row, sourced);
		plan.push({
			id: row.id,
			tipo: row.tipo,
			tld: row.tld,
			violations: row.violations.map((violation) => `${violation.column}:${violation.reason}`),
			action: rebuildTld === null ? 'delete' : 'rebuild',
			...(rebuildTld === null ? {} : { rebuildTld }),
		});
	}
	return plan;
}

/** Group the `rebuild` rows by the tld that re-derives them: tld → row ids. */
function rebuildGroups(plan: readonly IdentifierRepairRow[]): Map<string, number[]> {
	const groups = new Map<string, number[]>();
	for (const row of plan) {
		if (row.action !== 'rebuild' || row.rebuildTld === undefined) continue;
		groups.set(row.rebuildTld, [...(groups.get(row.rebuildTld) ?? []), row.id]);
	}
	return groups;
}

/** The cap on one deleted row's JSON in the log line (the report carries it uncut). */
const DELETED_ROW_LOG_CAP = 8192;

/**
 * One log line per deleted row, carrying the WHOLE row JSON-escaped (a planted
 * value never reaches the log raw; capped so one huge `properties` cannot flood
 * it). The log is the record that outlives a report the caller never received.
 */
function logDeleted(row: DeletedDdOntologyRow): void {
	console.warn(
		`[ontology_identifiers] deleted dd_ontology row id=${row.id} — it broke the identifier grammar and no rebuild could re-derive it; the whole row: ${JSON.stringify(row).slice(0, DELETED_ROW_LOG_CAP)}`,
	);
}

/** The outcome of the final VALIDATE: the validation, or (never thrown) why it failed. */
type ValidationStep =
	| { validation: Awaited<ReturnType<typeof validateDdOntologyIdentifierConstraints>> }
	| { validationError: string };

/**
 * The final VALIDATE, which must never lose the report: the rows are already
 * deleted by then, and a throw here would drop `detail.deleted` on the floor.
 * The failure goes to the log; the report carries a deliberate sentence.
 * Nothing else is queried here — inside a caller's transaction a failed
 * statement leaves it aborted.
 */
async function validateAfterRepair(): Promise<ValidationStep> {
	try {
		return { validation: await validateDdOntologyIdentifierConstraints() };
	} catch (error) {
		console.error('[ontology_identifiers] VALIDATE after the repair failed', error);
		return {
			validationError:
				'VALIDATE after the repair failed (see the server log) — the repair above is done; re-run reconcile ontology_identifiers to validate',
		};
	}
}

/** What an APPLY did. */
interface RepairOutcome {
	/** Original violators now gone or clean (on a failed VALIDATE: the deleted rows only). */
	applied: number;
	rebuilt: Record<string, Pick<OntologyWriteResult, 'ok' | 'msg' | 'errors'>>;
	deleted: DeletedDdOntologyRow[];
	step: ValidationStep;
}

/**
 * APPLY: delete the unaddressable rows FIRST (each captured whole — a row a tld
 * rebuild wiped first would be gone without a record), then rebuild, then
 * VALIDATE.
 */
async function applyRepair(plan: readonly IdentifierRepairRow[]): Promise<RepairOutcome> {
	const deleted = await deleteDdOntologyRowsReturning(
		plan.filter((row) => row.action === 'delete').map((row) => row.id),
	);
	for (const row of deleted) logDeleted(row);
	const rebuilt: RepairOutcome['rebuilt'] = {};
	for (const [tld, reclaimIds] of rebuildGroups(plan)) {
		const outcome = await rebuildOntology(tld, -1, { reclaimIds });
		rebuilt[tld] = { ok: outcome.ok, msg: outcome.msg, errors: outcome.errors };
	}
	const step = await validateAfterRepair();
	if (!('validation' in step)) return { applied: deleted.length, rebuilt, deleted, step };
	const remaining = new Set(step.validation.violators.map((row) => row.id));
	const applied = plan.filter((row) => !remaining.has(row.id)).length;
	return { applied, rebuilt, deleted, step };
}

/** The report detail of the final VALIDATE step. */
function validationDetail(
	step: ValidationStep,
	before: Record<string, string>,
): Record<string, unknown> {
	if (!('validation' in step)) {
		return { constraints: before, validation_error: step.validationError };
	}
	return {
		constraints: step.validation.states,
		validated: step.validation.validated,
		blocked: step.validation.blocked,
	};
}

/**
 * The registry shape (core/reconcile/registry.ts): dd_ontology's identifier
 * columns versus the identifier grammar. Dry = the violating rows, each with
 * its planned action, plus the six constraint states. Apply = the repair
 * classes above, then VALIDATE. Operator-only apply (destructive).
 */
export const ONTOLOGY_IDENTIFIERS_RECONCILE: ReconcileDefinition = {
	name: 'ontology_identifiers',
	stores: [
		'dd_ontology identifier columns',
		'the identifier grammar (concepts/ontology.ts + 0013 CHECKs)',
	],
	description:
		'Find dd_ontology rows whose tipo / parent / model_tipo / tld / properties.alias_of break the identifier grammar (the six CHECKs are NOT VALID while any exist); apply re-derives each from its tld source where one exists, deletes the unaddressable rest (returned whole in the report), then VALIDATEs every clean constraint.',
	scopeLabel: null,
	schedule: 'boot',
	sources: ['src/core/ontology/identifier_grammar.ts', 'src/core/db/dd_ontology.ts'],
	async run({ apply }): Promise<ReconcileReport> {
		const plan = await planRepair(await scanDdOntologyIdentifierRows());
		const constraints = await ddOntologyConstraintStates();
		if (!apply) {
			return { drift: plan.length, applied: 0, detail: { rows: plan, constraints } };
		}
		const { applied, rebuilt, deleted, step } = await applyRepair(plan);
		return {
			drift: plan.length,
			applied,
			detail: {
				rows: plan,
				constraints_before: constraints,
				rebuilt,
				deleted,
				...validationDetail(step, constraints),
			},
		};
	},
};
