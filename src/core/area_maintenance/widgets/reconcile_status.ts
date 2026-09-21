/**
 * reconcile_status widget — the ONE maintenance door onto the reconcile
 * registry (core/reconcile/registry.ts, audit 2026-08-26 S-10).
 *
 * Lists every registered cross-store reconcile (name, the two stores, schedule,
 * last run + drift from this process's gauge) and runs one — DRY BY DEFAULT.
 * `apply:true` repairs; the widget never decides that, the operator does, with
 * the dry report in view. The per-subsystem doors that predate the registry
 * (counters_status.reconcile_media_counters, media_control's index status, the
 * CLI shells) keep working; they wrap the same definitions.
 */

import { DedaloError } from '../../errors/dedalo_error.ts';
import { registerAllReconciles } from '../../reconcile/catalog.ts';
import {
	lastReconcileRun,
	type ReconcileDefinition,
	type ReconcileScope,
	runReconcile,
} from '../../reconcile/registry.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** One listing row — the wire shape the client renders. */
export interface ReconcileStatusRow {
	name: string;
	stores: [string, string];
	description: string;
	scope_label: string | null;
	schedule: ReconcileDefinition['schedule'];
	auto_apply: string | null;
	last_run: ReturnType<typeof lastReconcileRun>;
}

function rowOf(definition: ReconcileDefinition): ReconcileStatusRow {
	return {
		name: definition.name,
		stores: [definition.stores[0], definition.stores[1]],
		description: definition.description,
		scope_label: definition.scopeLabel,
		schedule: definition.schedule,
		auto_apply: definition.autoApply?.reason ?? null,
		last_run: lastReconcileRun(definition.name),
	};
}

async function reconcileStatusGetValue(): Promise<WidgetResponse> {
	const rows = (await registerAllReconciles()).map(rowOf);
	return { data: { reconciles: rows } };
}

/**
 * reconcile_status.run_reconcile — run ONE registered reconcile.
 * options: { name, apply?: boolean (default false), scope?: string[] }.
 */
async function reconcileStatusRunReconcile(
	options: Record<string, unknown>,
): Promise<WidgetResponse> {
	await registerAllReconciles();
	const name = typeof options.name === 'string' ? options.name : '';
	const apply = options.apply === true;
	let scope: ReconcileScope | undefined;
	if (options.scope !== undefined && options.scope !== null) {
		if (!Array.isArray(options.scope) || !options.scope.every((v) => typeof v === 'string')) {
			throw new DedaloError('request.invalid', {
				publicMessage: 'scope must be an array of strings',
				coordinates: { widget_action: 'reconcile_status.run_reconcile' },
			});
		}
		scope = options.scope as string[];
	}
	let outcome: Awaited<ReturnType<typeof runReconcile>>;
	try {
		outcome = await runReconcile(name, { apply, ...(scope === undefined ? {} : { scope }) });
	} catch (error) {
		if (error instanceof DedaloError && error.code === 'resource.not_found') {
			return { data: false, msg: `Error. Unknown reconcile '${name}'` };
		}
		throw error;
	}
	const { report, record } = outcome;
	const rows = (await registerAllReconciles()).map(rowOf);
	return {
		data: true,
		msg:
			report.drift === 0
				? `OK. ${name}: the two stores agree (drift 0)`
				: apply
					? `${name}: drift ${report.drift}, applied ${report.applied}`
					: `${name}: drift ${report.drift} — dry run, nothing written. Run with apply to repair`,
		extend: { report, record, reconciles: rows },
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'reconcile_status',
		category: 'integrity',
		label: { kind: 'literal', text: 'Reconcile' },
	},
	apiActions: {
		run_reconcile: reconcileStatusRunReconcile,
	},
	getValue: reconcileStatusGetValue,
};
