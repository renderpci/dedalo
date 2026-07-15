/**
 * The install step router (DEC-19). ONE entry point shared by the browser
 * handler (dd_utils_api `install`) and the CLI. It routes `options.action` to a
 * pure engine function and maps the result to the TOP-LEVEL response envelope
 * the wizard client reads (`{result, msg, ...extras}` — NOT nested under
 * `result`, unlike get_install_context).
 *
 * Per-step auth: the dispatch gate (Gate 1b) already enforced unsealed +
 * IP-allowed for the whole surface; the two record-writing steps
 * (install_hierarchies, register_tools) additionally require a session here —
 * the client only reaches them after the in-wizard login.
 */

import type { ApiRequestContext } from '../api/handler_context.ts';
import type { ApiResult } from '../api/response.ts';
import type { Rqo } from '../concepts/rqo.ts';

type StepOptions = { action?: string } & Record<string, unknown>;

/** A step result the router maps into the response body ({result, msg, extras}). */
export interface StepResult {
	result: boolean | unknown[] | Record<string, unknown>;
	msg?: string;
	[extra: string]: unknown;
}

function ok(body: Record<string, unknown>): ApiResult {
	return { status: 200, body };
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
			return ok({ result: false, msg: 'Update path not supported in the TS installer' });
		}

		case 'test_db_connection': {
			const { testDbConnection } = await import('./db_probe.ts');
			const r = await testDbConnection(options);
			return ok({ ...r });
		}

		case 'test_diffusion_connection': {
			const { testDiffusionConnection } = await import('./db_probe.ts');
			const r = await testDiffusionConnection(options);
			return ok({ ...r });
		}

		case 'check_directories': {
			const { checkDirectories } = await import('./directories.ts');
			const r = checkDirectories({ create: options.create === true });
			return ok({ ...r });
		}

		case 'persist_config': {
			const { persistConfig } = await import('./config_persist.ts');
			const r = await persistConfig(options);
			// Persisting config makes the current (install-mode) process obsolete —
			// schedule the restart AFTER the response flushes so it boots with real
			// config. No-op under DEDALO_INSTALL_NO_RESTART (tests/CLI).
			if (r.result === true) {
				const { scheduleServerRestart } = await import('./restart.ts');
				scheduleServerRestart('config persisted');
			}
			return ok({ ...r });
		}

		case 'verify_active_config': {
			const { verifyActiveConfig } = await import('./config_persist.ts');
			return ok({ ...(await verifyActiveConfig(options)) });
		}

		case 'install_db_from_default_file': {
			const { installDbFromSeed } = await import('./db_restore.ts');
			return ok({ ...(await installDbFromSeed()) });
		}

		case 'set_root_pw': {
			const { setRootPassword } = await import('./root_pw.ts');
			return ok({ ...(await setRootPassword(String(options.password ?? ''))) });
		}

		case 'install_hierarchies': {
			if (context.session === null) {
				return {
					status: 401,
					body: { result: false, msg: 'Authentication required', errors: ['unauthorized'] },
				};
			}
			const { installHierarchies } = await import('./hierarchy_import.ts');
			const tlds = Array.isArray(options.hierarchies) ? (options.hierarchies as string[]) : [];
			// The in-wizard root session owns the activation writes (registry flags,
			// the provisioned ontology records) — audited to a real actor, not to -1.
			return ok({ ...(await installHierarchies(tlds, undefined, context.session.userId)) });
		}

		case 'register_tools': {
			if (context.session === null) {
				return {
					status: 401,
					body: { result: false, msg: 'Authentication required', errors: ['unauthorized'] },
				};
			}
			const { registerInstallTools } = await import('./register_tools.ts');
			return ok({ ...(await registerInstallTools()) });
		}

		case 'install_finish': {
			const { installFinish } = await import('./finish.ts');
			return ok({ ...(await installFinish()) });
		}

		default:
			return ok({ result: false, msg: `Unknown install step '${step}'`, errors: ['unknown_step'] });
	}
}
