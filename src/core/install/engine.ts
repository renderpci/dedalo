/**
 * The install step router (DEC-19). ONE entry point shared by the browser
 * handler (dd_utils_api `install`) and the CLI. It routes `options.action` to a
 * pure engine function and maps the result onto ENVELOPE v2
 * (engineering/ERRORS_SPEC.md §3-4): the step's own boolean/payload is `data`,
 * and every other field it answers with (`msg`, `dirs`, `generated`,
 * `responses`, `report`, the db-probe booleans) rides as an EXTENSION KEY,
 * because render_installer.js reads them at the top level by name.
 *
 * TWO KINDS OF STEP, and the difference is the whole design here:
 *  - a PROBE/REPORT step (test_*_connection, check_directories,
 *    verify_active_config, install_hierarchies, register_tools) answers a
 *    question; "the server is unreachable" / "3 of 5 tlds failed" IS the
 *    answer, so it returns ok:true with the report as extension keys and the
 *    compat mirror puts the boolean back on `result` where the wizard reads it;
 *  - an ACTION step (persist_config, install_db_from_default_file, set_root_pw,
 *    install_finish) either does the thing or REFUSES — and a refusal THROWS a
 *    registered `install.*` code (./refuse.ts) that the dispatch catch converts.
 * Nothing here builds a failure body.
 *
 * Per-step auth: the dispatch gate (Gate 1b) already enforced unsealed +
 * IP-allowed for the whole surface; the two record-writing steps
 * (install_hierarchies, register_tools) additionally require a session here —
 * the client only reaches them after the in-wizard login.
 */

import type { ApiRequestContext } from '../api/handler_context.ts';
import type { ApiResult } from '../api/response.ts';
import type { Rqo } from '../concepts/rqo.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { ok } from '../errors/index.ts';

type StepOptions = { action?: string } & Record<string, unknown>;

/**
 * A step's answer. `ok` is the value the wizard reads as `result` (the compat
 * mirror of `data`); every other key is an extension key of the envelope.
 */
export interface StepOutcome {
	ok: boolean | unknown[] | Record<string, unknown>;
	msg?: string;
	[extra: string]: unknown;
}

/**
 * One step outcome → the v2 envelope (`data` = the step value, the rest =
 * extension keys). The parameter is the structural `{ ok }` (every step module
 * declares its own precise result interface, and an interface carries no index
 * signature) widened here to StepOutcome for the rest-spread.
 */
function stepResult(context: ApiRequestContext, outcome: { ok: unknown }): ApiResult {
	const { ok: value, ...extend } = outcome as StepOutcome;
	return { status: 200, body: ok(value, { requestId: context.requestId, extend }) };
}

/** Route one wizard step. */
export async function runInstallStep(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const options = (rqo.options ?? {}) as StepOptions;
	const step = options.action ?? '';

	switch (step) {
		case 'to_update': {
			// The TS installer supports no in-place v5/v6 data migration (the client
			// only shows the button when db_data_version[0] < 6, which we never
			// emit). Defensive: refuse rather than pretend.
			throw new DedaloError('engine.uncovered_scope', {
				message: 'Update path not supported in the TS installer',
			});
		}

		case 'test_db_connection': {
			const { testDbConnection } = await import('./db_probe.ts');
			return stepResult(context, await testDbConnection(options));
		}

		case 'test_diffusion_connection': {
			const { testDiffusionConnection } = await import('./db_probe.ts');
			return stepResult(context, await testDiffusionConnection(options));
		}

		case 'test_mailer_connection': {
			const { testMailerConnection } = await import('./mailer_probe.ts');
			return stepResult(context, await testMailerConnection(options));
		}

		case 'check_directories': {
			const { checkDirectories } = await import('./directories.ts');
			return stepResult(context, checkDirectories({ create: options.create === true }));
		}

		case 'persist_config': {
			const { persistConfig } = await import('./config_persist.ts');
			// A failure THROWS out of persistConfig, so reaching the next line means
			// the .env is written: persisting config makes the current (install-mode)
			// process obsolete — schedule the restart AFTER the response flushes so
			// it boots with real config. No-op under DEDALO_INSTALL_NO_RESTART
			// (tests/CLI).
			const persisted = await persistConfig(options);
			const { scheduleServerRestart } = await import('./restart.ts');
			scheduleServerRestart('config persisted');
			return stepResult(context, persisted);
		}

		case 'verify_active_config': {
			const { verifyActiveConfig } = await import('./config_persist.ts');
			return stepResult(context, await verifyActiveConfig(options));
		}

		case 'install_db_from_default_file': {
			const { installDbFromSeed } = await import('./db_restore.ts');
			return stepResult(context, await installDbFromSeed());
		}

		case 'set_root_pw': {
			const { setRootPassword } = await import('./root_pw.ts');
			return stepResult(context, await setRootPassword(String(options.password ?? '')));
		}

		case 'install_hierarchies': {
			if (context.session === null) throw new DedaloError('auth.not_logged');
			const { installHierarchies } = await import('./hierarchy_import.ts');
			const tlds = Array.isArray(options.hierarchies) ? (options.hierarchies as string[]) : [];
			// The in-wizard root session owns the activation writes (registry flags,
			// the provisioned ontology records) — audited to a real actor, not to -1.
			return stepResult(context, await installHierarchies(tlds, undefined, context.session.userId));
		}

		case 'register_tools': {
			if (context.session === null) throw new DedaloError('auth.not_logged');
			const { registerInstallTools } = await import('./register_tools.ts');
			return stepResult(context, await registerInstallTools());
		}

		case 'install_finish': {
			const { installFinish } = await import('./finish.ts');
			return stepResult(context, await installFinish());
		}

		default:
			throw new DedaloError('install.unknown_step', {
				message: `Unknown install step '${step}'`,
			});
	}
}
