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

export const widget: WidgetModule = {
	spec: {
		id: 'build_database_version',
		category: 'data',
		label: { kind: 'label', key: 'build_database_version' },
	},
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
