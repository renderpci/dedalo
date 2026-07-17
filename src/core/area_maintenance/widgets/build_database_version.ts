/**
 * build_database_version widget — install/recovery dump machinery. The
 * install-image builders stay closed-by-design (they write install/ SQL dumps
 * a coexisting PHP tree owns); the dd_ontology RECOVERY pair is
 * ownership-gated (UPDATE_PROCESS Phase 2): on a standalone TS install the
 * recovery file lives in THIS tree's install/db/ and is the safety net the
 * ontology update leans on (core/ontology/recovery_file.ts).
 */

import type { WidgetModule, WidgetResponse } from './support.ts';
import { engineDenied, gated } from './support.ts';

async function buildRecoveryOwned(): Promise<WidgetResponse> {
	const { buildRecoveryVersionFile } = await import('../../ontology/recovery_file.ts');
	return (await buildRecoveryVersionFile()) as unknown as WidgetResponse;
}

async function restoreRecoveryOwned(): Promise<WidgetResponse> {
	const { restoreDdOntologyRecoveryFromFile } = await import('../../ontology/recovery_file.ts');
	return (await restoreDdOntologyRecoveryFromFile()) as unknown as WidgetResponse;
}

/**
 * get_widget_value panel load. Mirrors the PHP oracle
 * (build_database_version::get_value): the live DB name, the ephemeral install DB
 * name, and where the compressed dump lands. Without this the client rendered the
 * info line with `undefined` for all three. build_install_version itself stays
 * engineDenied (it writes into the PHP tree) — these values are informational.
 */
async function buildDatabaseVersionGetValue(): Promise<WidgetResponse> {
	const { readEnv } = await import('../../../config/env.ts');
	const sourceDb = readEnv('DB_NAME') ?? '';
	// PHP installer::$db_install_name — the ephemeral clone target the install
	// dump is built from (hard-coded there; kept in parity here).
	const targetDb = 'dedalo7_install';
	return {
		result: {
			source_db: sourceDb,
			target_db: targetDb,
			target_file: `/install/db/${targetDb}.pgsql.gz`,
		},
		msg: 'ok',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'build_database_version',
		category: 'data',
		label: { kind: 'label', key: 'build_database_version' },
	},
	getValue: buildDatabaseVersionGetValue,
	apiActions: {
		build_install_version: engineDenied(
			'build_database_version.build_install_version',
			'it writes install/ SQL dumps into the PHP tree',
		),
		build_matrix_hierarchy_main_sql: engineDenied(
			'build_database_version.build_matrix_hierarchy_main_sql',
			'it writes install/ SQL dumps into the PHP tree',
		),
		// Ownership-gated (UPDATE_PROCESS Phase 2): closed keeps the frozen denial.
		build_recovery_version_file: gated(
			'build_database_version.build_recovery_version_file',
			engineDenied(
				'build_database_version.build_recovery_version_file',
				'it writes recovery files into the PHP tree',
			),
			buildRecoveryOwned,
		),
		restore_dd_ontology_recovery_from_file: gated(
			'build_database_version.restore_dd_ontology_recovery_from_file',
			engineDenied(
				'build_database_version.restore_dd_ontology_recovery_from_file',
				'it replaces the shared dd_ontology from a PHP-tree recovery file',
			),
			restoreRecoveryOwned,
		),
	},
};
