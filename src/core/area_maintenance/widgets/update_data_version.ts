/**
 * update_data_version widget — the data-version panel + the migration
 * EXECUTE (PHP widgets/update_data_version; UPDATE_PROCESS Phase 3).
 * Panel: the catalog-matched target version + wire descriptor (PHP shape —
 * the client derives its checkbox keys from it); with the EMPTY 7.x catalog
 * both stay null, byte-identical to the pre-Phase-3 panel.
 * EXECUTE: ownership-gated. Closed (coexisting) keeps the frozen behavior —
 * preconditions then the bespoke denial. Open runs the TS engine
 * (core/update/engine.ts): background_running=true submits an in-process
 * mediaJobs job (the client polls dd_utils_api:get_process_status with the
 * returned {pid,pfile} — PHP envelope bytes 'OK. Running publication <pid>'),
 * else the run is inline.
 */

import type { Principal } from '../../security/permissions.ts';
import { DEDALO_VERSION_TRIPLE } from '../../update/version.ts';
import { type WidgetModule, type WidgetResponse, gated } from './support.ts';

/**
 * update_data_version panel (PHP widgets/update_data_version::get_value):
 * {update_version, current_version_in_db, dedalo_version, updates}.
 * current_version_in_db is the shared matrix_updates value (byte-parity).
 * update_version/updates come from the TS catalog (core/update/catalog.ts)
 * — null while no 7.x migration exists, exactly the pre-catalog panel bytes.
 */
async function updateDataVersionGetValue(): Promise<WidgetResponse> {
	const { getCurrentDataVersion } = await import('../backup.ts');
	const { getMatchedDescriptor, getUpdateVersion, toWireDescriptor } = await import(
		'../../update/catalog.ts'
	);
	const current = await getCurrentDataVersion();
	const descriptor = getMatchedDescriptor(current);
	return {
		result: {
			update_version: getUpdateVersion(current),
			current_version_in_db: current,
			dedalo_version: DEDALO_VERSION_TRIPLE,
			updates: descriptor === null ? null : toWireDescriptor(descriptor),
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * The CLOSED (coexisting) branch — byte-frozen: PHP preconditions with the
 * PHP refusal messages, then the bespoke denial (migrations must run exactly
 * once, on the engine that owns the catalog — the PHP install's updates.php).
 */
async function updateDataVersionRun(
	_options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	// PHP preconditions (superuser + maintenance mode), refusal bytes verbatim.
	// backupWarn off: this response is byte-frozen (no warnings channel).
	const { checkUpdatePreconditions } = await import('../../update/preconditions.ts');
	const preconditions = checkUpdatePreconditions(principal, { backupWarn: false });
	if (!preconditions.ok && preconditions.refusal !== null) {
		return preconditions.refusal;
	}
	return {
		result: false,
		msg: 'Error. Data migrations are not runnable on this engine: the migration catalog (updates.php) belongs to the PHP install. Run the update from the PHP maintenance dashboard.',
		errors: ['engine_denied: update_data_version'],
	};
}

/**
 * The OPEN (owned) branch: the TS migration engine. Same preconditions,
 * then background (mediaJobs) or inline execution.
 */
async function updateDataVersionRunOwned(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { checkUpdatePreconditions } = await import('../../update/preconditions.ts');
	const preconditions = checkUpdatePreconditions(principal);
	if (!preconditions.ok && preconditions.refusal !== null) {
		return preconditions.refusal;
	}
	const updatesChecked = (options.updates_checked ?? {}) as Record<string, unknown>;
	const { updateVersion } = await import('../../update/engine.ts');

	if (options.background_running === true) {
		const { mediaJobs } = await import('../../media/jobs.ts');
		const record = mediaJobs.submit('update_data', async () => {
			// The final job payload IS the engine response (the client's last
			// SSE frame shows it; PHP: the final pfile line).
			return await updateVersion(updatesChecked);
		});
		return {
			result: true,
			// In-process job: the server process runs it (PHP returns the
			// detached CLI's pid; divergence ledgered in the engine header).
			pid: process.pid,
			pfile: `${record.id}.json`,
			msg: `OK. Running publication ${process.pid}`,
			errors: [],
		} as unknown as WidgetResponse;
	}

	const outcome = await updateVersion(updatesChecked);
	return {
		result: outcome.result,
		msg: outcome.msg.join('\n'),
		errors: [...preconditions.warnings, ...outcome.errors],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'update_data_version',
		category: 'data',
		class: 'success width_100',
		background: true,
		label: { kind: 'label_concat', keys: ['update', 'data'] },
	},
	apiActions: {
		// Ownership-gated (UPDATE_PROCESS Phase 3): closed = the frozen
		// preconditions + bespoke denial; open = the TS migration engine over
		// the (currently empty) core/update/catalog.ts.
		update_data_version: gated(
			'update_data_version.update_data_version',
			updateDataVersionRun,
			updateDataVersionRunOwned,
		),
	},
	getValue: updateDataVersionGetValue,
};
