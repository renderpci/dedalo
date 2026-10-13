/**
 * THE STEP RUNS — the `run` half of every install step (install_plan.ts
 * INSTALL_STEP_IDS → the engine call that performs it). The terminal executor
 * reaches them through the ONE step table (steps.ts, whose every `run` IS the
 * entry here) and adds its executor-only policy (accept, verify, undo).
 *
 * Kept apart from steps.ts: the run bodies read nothing themselves — every step
 * module is imported lazily — while the policy half reads the run files.
 */

import type { InstallStepId } from './install_plan.ts';
import type { OntologyCatalog, OntologyInstallRequest } from './ontology_choice.ts';

/** What a step's `run` needs — the answers plus the per-step extras. */
export interface InstallStepInputs {
	/** The plan's answers + its secrets, in memory only. */
	readonly posted: Readonly<Record<string, unknown>>;
	/** check_directories: create the missing directories (the installer's create pass). */
	readonly createDirectories: boolean;
	/** persist_config: the already-resolved catalog (fetched once). */
	readonly ontologyCatalog?: OntologyCatalog;
	/** stage_ontologies: what to stage (required there). */
	readonly ontologyRequest?: OntologyInstallRequest;
	/** install_hierarchies: the thesauri to import (required there). */
	readonly hierarchies?: readonly string[];
	/** The audited actor: -1 (the terminal installer). */
	readonly actorUserId: number;
	/** set_root_pw. */
	readonly rootPassword?: string;
	/**
	 * install_db_from_default_file: the terminal install's id — the seed is
	 * STAMPED with it and a database carrying it is completed instead of refused
	 * (db_restore.ts installDbFromSeedForInstall). Without it the restore refuses
	 * any seeded database.
	 */
	readonly installId?: string;
}

/** A step's raw engine outcome; `ok`/`msg` are what the executor reads. */
export interface StepRawOutcome {
	ok: unknown;
	msg?: string;
	[extra: string]: unknown;
}

/** EXHAUSTIVE over InstallStepId: a new step id fails to compile until it has a run. */
export const STEP_RUNS: {
	readonly [K in InstallStepId]: (inputs: InstallStepInputs) => Promise<StepRawOutcome>;
} = Object.freeze({
	test_db_connection: async (inputs) => {
		const { testDbConnection } = await import('./db_probe.ts');
		return { ...(await testDbConnection({ ...inputs.posted })) };
	},
	test_diffusion_connection: async (inputs) => {
		const { testDiffusionConnection } = await import('./db_probe.ts');
		return { ...(await testDiffusionConnection({ ...inputs.posted })) };
	},
	test_mailer_connection: async (inputs) => {
		const { testMailerConnection } = await import('./mailer_probe.ts');
		return { ...(await testMailerConnection({ ...inputs.posted })) };
	},
	persist_config: async (inputs) => {
		const { persistConfig } = await import('./config_persist.ts');
		return {
			...(await persistConfig({ ...inputs.posted }, { ontologyCatalog: inputs.ontologyCatalog })),
		};
	},
	check_directories: async (inputs) => {
		const { checkDirectories } = await import('./directories.ts');
		return { ...checkDirectories({ create: inputs.createDirectories }) };
	},
	stage_ontologies: async (inputs) => {
		const { stageOntologies } = await import('./ontology_install.ts');
		const request = inputs.ontologyRequest;
		if (request === undefined) {
			const { refuseInstall } = await import('./refuse.ts');
			return refuseInstall(
				'install.invalid_input',
				'the ontology choice did not resolve to an install request',
			);
		}
		return { ...(await stageOntologies(request)) };
	},
	install_db_from_default_file: async (inputs) => {
		const { installDbFromSeed, installDbFromSeedForInstall } = await import('./db_restore.ts');
		return {
			...(inputs.installId === undefined
				? await installDbFromSeed()
				: await installDbFromSeedForInstall(inputs.installId)),
		};
	},
	install_ontologies: async (inputs) => {
		const { installOntologies } = await import('./ontology_install.ts');
		return { ...(await installOntologies({ userId: inputs.actorUserId })) };
	},
	set_root_pw: async (inputs) => {
		const { setRootPassword } = await import('./root_pw.ts');
		return { ...(await setRootPassword(inputs.rootPassword ?? '')) };
	},
	install_hierarchies: async (inputs) => {
		const { installHierarchies } = await import('./hierarchy_import.ts');
		return {
			...(await installHierarchies([...(inputs.hierarchies ?? [])], undefined, inputs.actorUserId)),
		};
	},
	register_tools: async () => {
		const { registerInstallTools } = await import('./register_tools.ts');
		return { ...(await registerInstallTools()) };
	},
	install_finish: async () => {
		const { installFinish } = await import('./finish.ts');
		return { ...(await installFinish()) };
	},
});
