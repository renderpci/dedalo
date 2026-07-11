/**
 * Data-migration catalog (UPDATE_PROCESS Phase 3) — the TS twin of PHP
 * core/base/update/updates.php. One descriptor per reachable upgrade,
 * matched on `updateFrom*` against the INSTALLED data version
 * (matrix_updates), strictly linear (no skipping — PHP parity).
 *
 * THE CATALOG STARTS EMPTY: 7.0.0 is the current data version and no 7.x
 * migration exists yet. The v6→v7 content (updates.php $v=700, class.v6_to_v7,
 * dataframe_v7_migration) is PHP-OWNED and deliberately NOT carried — that
 * migration runs exactly once, on the engine that owns its catalog
 * (rewrite/prompts/UPDATE_PROCESS.md §8).
 *
 * Scripts are TS-native: `scriptId` keys into SCRIPT_REGISTRY (update/engine.ts)
 * — never a dynamic class/method lookup. On the WIRE the descriptor is
 * serialized into the PHP key shape (`SQL_update`, `run_scripts` with
 * script_class/script_method, …) because the byte-identical client derives
 * its checkbox keys from those names (render_update_data_version.js:
 * `key + '_' + i`, 0-based).
 */

import { compareVersionArrays } from './version.ts';

/** One catalog script step (PHP run_scripts/run_pre_scripts entry). */
export interface UpdateScriptStep {
	info: string;
	/** SCRIPT_REGISTRY key (the TS twin of script_class::script_method). */
	scriptId: string;
	stopOnError: boolean;
	scriptVars?: readonly unknown[];
}

/** One upgrade descriptor (PHP updates.php $updates->{NNN} shape). */
export interface UpdateDescriptor {
	versionMajor: number;
	versionMedium: number;
	versionMinor: number;
	updateFromMajor: number;
	updateFromMedium: number;
	updateFromMinor: number;
	/** false = code-only release: skipped by getUpdateVersion (PHP parity). */
	updateData?: boolean;
	/** Consumed by the CODE update widget only (PHP parity). */
	forceUpdateMode?: 'clean' | null;
	runPreScripts?: readonly UpdateScriptStep[];
	/** Raw SQL statements (PHP SQL_update — hard-abort on failure). */
	sqlUpdate?: readonly string[];
	/** Component model names (PHP components_update). See engine.ts — loud. */
	componentsUpdate?: readonly string[];
	runScripts?: readonly UpdateScriptStep[];
	/** PHP execution_order (default SQL_update → components_update → run_scripts). */
	executionOrder?: readonly ('SQL_update' | 'components_update' | 'run_scripts')[];
}

/**
 * The catalog, keyed by concatenated target version (PHP `$updates->700`
 * convention: '701' = 7.0.1). EMPTY until the first 7.x data migration.
 */
export const UPDATE_CATALOG: Readonly<Record<string, UpdateDescriptor>> = Object.freeze({});

/** Key for a descriptor's target version (PHP implode('', [7,0,1]) = '701'). */
export function catalogKeyOf(descriptor: UpdateDescriptor): string {
	return `${descriptor.versionMajor}${descriptor.versionMedium}${descriptor.versionMinor}`;
}

/**
 * The target version triple for the INSTALLED version, or null (PHP
 * update::get_update_version): first descriptor whose updateFrom* equals the
 * current triple, skipping updateData===false code-only releases.
 */
export function getUpdateVersion(
	current: readonly number[],
	catalog: Readonly<Record<string, UpdateDescriptor>> = UPDATE_CATALOG,
): number[] | null {
	if (current.length === 0) return null;
	for (const descriptor of Object.values(catalog)) {
		const from = [
			descriptor.updateFromMajor,
			descriptor.updateFromMedium,
			descriptor.updateFromMinor,
		];
		if (compareVersionArrays(current, from) !== 0) continue;
		if (descriptor.updateData === false) continue;
		return [descriptor.versionMajor, descriptor.versionMedium, descriptor.versionMinor];
	}
	return null;
}

/** The matched descriptor for the installed version (PHP $updates->{key}). */
export function getMatchedDescriptor(
	current: readonly number[],
	catalog: Readonly<Record<string, UpdateDescriptor>> = UPDATE_CATALOG,
): UpdateDescriptor | null {
	const target = getUpdateVersion(current, catalog);
	if (target === null) return null;
	return catalog[`${target[0]}${target[1]}${target[2]}`] ?? null;
}

/**
 * Serialize a descriptor into the PHP wire shape the byte-identical client
 * renders (render_update_data_version.js iterates SQL_update /
 * components_update / run_scripts / alert_update; other keys are inert).
 */
export function toWireDescriptor(descriptor: UpdateDescriptor): Record<string, unknown> {
	const wireScript = (step: UpdateScriptStep) => ({
		info: step.info,
		script_class: 'ts_script',
		script_method: step.scriptId,
		stop_on_error: step.stopOnError,
		script_vars: step.scriptVars ?? [],
	});
	const wire: Record<string, unknown> = {
		version_major: descriptor.versionMajor,
		version_medium: descriptor.versionMedium,
		version_minor: descriptor.versionMinor,
		update_from_major: descriptor.updateFromMajor,
		update_from_medium: descriptor.updateFromMedium,
		update_from_minor: descriptor.updateFromMinor,
	};
	if (descriptor.forceUpdateMode !== undefined) wire.force_update_mode = descriptor.forceUpdateMode;
	if (descriptor.runPreScripts !== undefined) {
		wire.run_pre_scripts = descriptor.runPreScripts.map(wireScript);
	}
	if (descriptor.sqlUpdate !== undefined) wire.SQL_update = [...descriptor.sqlUpdate];
	if (descriptor.componentsUpdate !== undefined) {
		wire.components_update = [...descriptor.componentsUpdate];
	}
	if (descriptor.runScripts !== undefined) wire.run_scripts = descriptor.runScripts.map(wireScript);
	if (descriptor.executionOrder !== undefined)
		wire.execution_order = [...descriptor.executionOrder];
	return wire;
}
