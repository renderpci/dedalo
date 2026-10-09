/**
 * build_database_version widget — install/recovery dump machinery. The
 * INSTALL SEED compiler (build_install_version) builds this tree's vendored
 * seed from the repository's own sources in a marked scratch database and
 * proves it by a fresh install before writing it (core/install/seed_build.ts);
 * it reads no installation's database. The dd_ontology RECOVERY pair is
 * ownership-gated (UPDATE_PROCESS Phase 2): the recovery file is the safety
 * net the ontology update leans on (core/ontology/recovery_file.ts).
 * build_matrix_hierarchy_main_sql stays closed: its PHP output file
 * (install/import/matrix_hierarchy_main.sql) has no consumer here — the seed
 * builder filters the hierarchy registry itself.
 */

import type { WidgetModule, WidgetResponse } from './support.ts';
import { engineDenied, fromOutcome, gated } from './support.ts';

/*
 * COVERAGE-EXEMPT, all four functions in this file — buildRecoveryOwned,
 * restoreRecoveryOwned, buildInstallOwned, buildDatabaseVersionGetValue
 * (coverage plan §5.2; reason registered in engineering/crap_coverage_exempt.json):
 * single-expression delegations to core/ontology/recovery_file.ts and
 * core/install/seed_build.ts, gated THERE (including the truncated-recovery-file
 * case; the seed build through its source/outFile seam). `buildInstallOwned`
 * OVERWRITES this checkout's vendored install seed and its manifest (compiled from
 * the repository's sources — no database is read). `restoreDdOntologyRecoveryFromFile` REPLACES the
 * shared `dd_ontology` wholesale — the single most destructive action in the
 * maintenance area — and has no scratch equivalent.
 */
async function buildRecoveryOwned(): Promise<WidgetResponse> {
	const { buildRecoveryVersionFile } = await import('../../ontology/recovery_file.ts');
	return fromOutcome(await buildRecoveryVersionFile());
}

async function restoreRecoveryOwned(): Promise<WidgetResponse> {
	const { restoreDdOntologyRecoveryFromFile } = await import('../../ontology/recovery_file.ts');
	return fromOutcome(await restoreDdOntologyRecoveryFromFile());
}

async function buildInstallOwned(): Promise<WidgetResponse> {
	const { buildInstallVersion } = await import('../../install/seed_build.ts');
	// A refused compile THROWS maintenance.action_failed with its readout in
	// `extend`; a finished one answers its sentence, findings and readout.
	const result = await buildInstallVersion();
	return {
		data: true,
		msg: result.msg,
		...(result.findings.length === 0 ? {} : { errors: result.findings }),
		extend: { steps: result.steps, file_size: result.file_size },
	};
}

/**
 * get_widget_value panel load (PHP build_database_version::get_value): what the
 * seed is compiled FROM (repo sources — never a database), the scratch database
 * it is compiled in, and the seed file it lands in — the compiler's own
 * constants, never a parallel spelling.
 */
async function buildDatabaseVersionGetValue(): Promise<WidgetResponse> {
	const { relative } = await import('node:path');
	const { projectRoot } = await import('../../../config/env.ts');
	const { SEED_DUMP_PATH, SEED_SOURCES_DIR } = await import('../../install/paths.ts');
	const { ONTOLOGY_RELEASE_DIR } = await import('../../install/seed_sources.ts');
	return {
		data: {
			source_db: `${relative(projectRoot, SEED_SOURCES_DIR)} + ${relative(projectRoot, ONTOLOGY_RELEASE_DIR)}`,
			target_db: 'dedalo_seed_build_<pid>',
			target_file: relative(projectRoot, SEED_DUMP_PATH),
		},
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'build_database_version',
		category: 'data',
		label: { kind: 'label', key: 'build_database_version' },
	},
	// A whole-dd_ontology dump / restore: maintenance (PERF-11).
	unboundedActions: ['build_recovery_version_file', 'restore_dd_ontology_recovery_from_file'],
	getValue: buildDatabaseVersionGetValue,
	apiActions: {
		// Ownership-gated like the recovery pair: closed keeps the frozen denial.
		build_install_version: gated(
			'build_database_version.build_install_version',
			engineDenied(
				'build_database_version.build_install_version',
				'it writes install/ SQL dumps into the PHP tree',
			),
			buildInstallOwned,
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
