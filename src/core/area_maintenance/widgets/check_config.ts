/**
 * check_config widget — TS-NATIVE: reports THIS server's config sources
 * (.env, ts_state.json, the session store) and DB status in the PHP panel's
 * shape; the PHP widget reports the PHP install's files, which this server
 * must not misreport as its own. State flags (maintenance/recovery/
 * notification) persist in the TS server-state store.
 */

import { sql } from '../../db/postgres.ts';
import { probeSchemaHealth } from '../../db/schema_probe.ts';
import {
	refuseAction,
	type WidgetHandler,
	type WidgetModule,
	type WidgetResponse,
} from './support.ts';

/** One catalog credential placeholder rule, as `CATALOG_PLACEHOLDERS` carries it. */
export interface CredentialPlaceholder {
	key: string;
	value: string;
	emptyIsValid: boolean;
}

/**
 * The db_status credential fold — PURE, taking the LIVE values as a parameter.
 *
 * The injection is a precondition, not a style choice: closing over `readEnv`
 * would make every assertion here a statement about THIS machine's
 * ../private/.env — green locally, undefined on a clone.
 *
 * Two arms the dashboard header depends on:
 *  - `emptyIsValid` (DB_PASSWORD): an EMPTY password is legitimate under
 *    peer/trust auth, so only the literal sample value fails. Invert it and
 *    every peer-auth install reports config_pw_check=false and a red header on
 *    a perfectly healthy database (GAP-3).
 *  - `global_status` is the AND of the folded credential checks, the
 *    connection probe and the write probe. Turn it into an OR and a broken
 *    database paints the header green.
 *
 * Key order is the client's wire shape (render_check_config.js reads each
 * `db_status.*_check` by name) — keep it.
 */
export function evaluateCredentialChecks(
	live: Record<string, string>,
	placeholders: readonly CredentialPlaceholder[],
	probes: { connection: boolean; writable: boolean },
): Record<string, boolean> {
	const stillOnSample = (key: string): boolean => {
		const rule = placeholders.find((entry) => entry.key === key);
		if (rule === undefined) return false;
		const value = live[key] ?? '';
		if (value === rule.value) return true;
		return value === '' && !rule.emptyIsValid;
	};
	const configDbNameCheck = !stillOnSample('DB_NAME');
	const configUserNameCheck = !stillOnSample('DB_USER');
	const configPwCheck = !stillOnSample('DB_PASSWORD');
	const configInformationCheck = !stillOnSample('DEDALO_ENTITY_LABEL');
	const configInfoKeyCheck = !stillOnSample('ENTITY');
	const configCheck =
		configDbNameCheck &&
		configUserNameCheck &&
		configPwCheck &&
		configInformationCheck &&
		configInfoKeyCheck;
	return {
		config_db_name_check: configDbNameCheck,
		config_user_name_check: configUserNameCheck,
		config_pw_check: configPwCheck,
		config_information_check: configInformationCheck,
		config_info_key_check: configInfoKeyCheck,
		config_check: configCheck,
		db_connection_check: probes.connection,
		db_writable_check: probes.writable,
		// PHP ANDs every field on the object (config_check already folds the five
		// credential checks, so this is: all credential checks && connection && writable).
		global_status: configCheck && probes.connection && probes.writable,
	};
}

/**
 * computeCheckConfig — config-source health + live DB probes. Returns the INNER
 * result payload the client stores as `self.value` (db_status + config_sources +
 * state) plus the soft errors that colour the envelope msg. Shared by getValue
 * (panel open) AND eagerValue (catalog pre-load), so the FOLDED dashboard card
 * and the OPENED panel paint from byte-identical data.
 */
/*
 * COVERAGE-EXEMPT for execution, this probe shell (coverage plan §5.1; reason
 * registered in engineering/crap_coverage_exempt.json): every remaining branch is
 * a FAIL-SOFT I/O probe (`SELECT 1`, a TEMP-table write, `existsSync`,
 * `probeSchemaHealth`) whose only decision is null-vs-value on its OWN result.
 * The one real decision, the credential-placeholder fold, is extracted to
 * `evaluateCredentialChecks` above — and this exemption is valid ONLY because
 * that extraction TAKES `live` AS A PARAMETER: without the injection its gate
 * would assert against this machine's ../private/.env and be undefined on a clone.
 */
async function computeCheckConfig(): Promise<{
	payload: {
		db_status: Record<string, boolean>;
		config_sources: { name: string; required: boolean; exists: boolean; readable: boolean }[];
		db_info: {
			identity: string;
			server: string | null;
			schema_ok: boolean | null;
			ontology_rows: number | null;
			matrix_tables: number | null;
			migration_level: number | null;
			migration_latest: string | null;
			pool: { in_use: number; max: number; waiters: number };
		} | null;
		runtime_mode: {
			maintenance: boolean;
			recovery: boolean;
			notification: boolean;
			diffusion_native: boolean;
			dev_mode: boolean;
		};
		state: unknown;
	};
	errors: string[];
}> {
	const { existsSync } = await import('node:fs');
	const { basename, join } = await import('node:path');
	// The ONE private-dir resolution (src/config/env.ts) — it honors
	// DEDALO_PRIVATE_DIR. This used to re-derive it as
	// `dirname(process.cwd()) + '/private'`, which ignored that variable and
	// reported a container's config sources against a directory that does not
	// exist (runtime-path census, 2026-08-23).
	const { privateDir, readEnv } = await import('../../../config/env.ts');
	const { readBool } = await import('../../../config/readers.ts');
	const errors: string[] = [];

	// --- database status (installer::get_db_status() OBJECT shape) ---
	// The client renderer (render_check_config.js) reads db_status as an OBJECT of
	// per-check booleans + global_status and paints every row/the card header from
	// them. A plain string here (the previous shape) reads as `undefined` on every
	// `db_status.*_check`, so the panel showed "Connection: Failed" and a red header
	// even on a healthy DB. Rebuild the PHP shape from THIS server's env-sourced
	// credentials plus a live connection + write probe.
	const dbName = readEnv('DB_NAME') ?? '';
	const dbUser = readEnv('DB_USER') ?? '';
	const dbPassword = readEnv('DB_PASSWORD') ?? '';
	const entityKey = readEnv('ENTITY') ?? '';
	const entityLabel = readEnv('DEDALO_ENTITY_LABEL') ?? entityKey;

	// Credential placeholder checks. "Is this install still on the sample values?" is only
	// an honest question if the shipped template literally CARRIES those values — so both
	// sides read ONE list, the catalog's `placeholder` fields, and the template that the
	// installer drops at ../private/sample.env is rendered from the same source. Before
	// this, these were five literals hardcoded here, next to a comment claiming a
	// sample.env that did not exist shipped them: an unfalsifiable claim.
	//
	// GAP-3 survives as `emptyIsValid` on DB_PASSWORD: an EMPTY password is legitimate
	// under peer/trust auth, so only the literal sample value fails; real auth is decided
	// by the connection probe below.
	const { CATALOG_PLACEHOLDERS } = await import('../../../config/catalog/index.ts');
	const live: Record<string, string> = {
		DB_NAME: dbName,
		DB_USER: dbUser,
		DB_PASSWORD: dbPassword,
		ENTITY: entityKey,
		DEDALO_ENTITY_LABEL: entityLabel,
	};
	// Live connection probe.
	let dbConnectionCheck = true;
	try {
		await sql.unsafe('SELECT 1', []);
	} catch (_error) {
		dbConnectionCheck = false;
		errors.push('Database connection failed');
	}

	// Write probe (PHP's CREATE/INSERT/DROP): a TEMP table is CONNECTION-scoped, so
	// the statements MUST run on one pinned connection — withTransaction reserves a
	// single connection and routes every `sql` through it. `ON COMMIT DROP` means
	// nothing persists. Fail-soft: any error just yields db_writable_check=false.
	let dbWritableCheck = false;
	if (dbConnectionCheck) {
		try {
			const { withTransaction } = await import('../../db/postgres.ts');
			await withTransaction(async () => {
				await sql.unsafe(
					'CREATE TEMP TABLE _dedalo_ts_write_probe (id serial PRIMARY KEY, val text NOT NULL) ON COMMIT DROP',
					[],
				);
				await sql.unsafe("INSERT INTO _dedalo_ts_write_probe (val) VALUES ('write_test')", []);
			});
			dbWritableCheck = true;
		} catch (_error) {
			dbWritableCheck = false;
		}
	}

	const dbStatus = evaluateCredentialChecks(live, CATALOG_PLACEHOLDERS, {
		connection: dbConnectionCheck,
		writable: dbWritableCheck,
	});

	// Config sources this SERVER actually reads, resolved through the SAME accessors
	// the runtime uses — so a DEDALO_TS_STATE_PATH / DEDALO_SESSION_DB_PATH relocation
	// is reported at its real path, not a guess. The session store's real filename is
	// `dedalo_ts_sessions.sqlite` (session_store.ts); the previous hardcoded
	// `sessions.sqlite` never existed, so the store was ALWAYS misreported as absent.
	const { statePath, getServerState } = await import('../../resolve/server_state.ts');
	const { SESSION_DB_PATH } = await import('../../security/session_store.ts');
	const stateFile = statePath();
	const sources = [
		{ name: '.env', path: join(privateDir, '.env'), required: true },
		{ name: basename(stateFile), path: stateFile, required: false },
		{ name: basename(SESSION_DB_PATH), path: SESSION_DB_PATH, required: false },
	];
	const configSources = sources.map((source) => {
		const exists = existsSync(source.path);
		if (source.required && !exists) {
			errors.push(`Required config source missing or unreadable: ${source.name}`);
		}
		return { name: source.name, required: source.required, exists, readable: exists };
	});

	// --- extended DB details (informational; the folded card's "am I on the right
	// database?" answer + engine/schema/migration/pool health). All fail-soft:
	// a probe failure leaves the field null and the client row is simply omitted. ---
	const { config } = await import('../../../config/config.ts');
	const { getPoolStats } = await import('../../db/postgres.ts');
	const poolStats = getPoolStats();
	let dbInfo: {
		identity: string;
		server: string | null;
		schema_ok: boolean | null;
		ontology_rows: number | null;
		matrix_tables: number | null;
		migration_level: number | null;
		migration_latest: string | null;
		pool: { in_use: number; max: number; waiters: number };
	} | null = null;
	{
		const identity = `${config.db.database}@${config.db.host}:${config.db.port}`;
		let server: string | null = null;
		let schemaOk: boolean | null = null;
		let ontologyRows: number | null = null;
		let matrixTables: number | null = null;
		let migrationLevel: number | null = null;
		let migrationLatest: string | null = null;
		if (dbConnectionCheck) {
			try {
				// One round-trip via db/schema_probe.ts (the raw-SQL home — the T3
				// ratchet forbids direct dd_ontology queries from widget code).
				const row = await probeSchemaHealth();
				if (row) {
					server = row.server;
					ontologyRows = row.onto_rows;
					matrixTables = row.matrix_tables;
					migrationLevel = row.mig_n;
					migrationLatest = row.mig_latest;
					schemaOk = row.onto === true && (row.matrix_tables ?? 0) > 0;
				}
			} catch (_error) {
				// fail-soft: leave the extended fields null (the client omits their rows)
			}
		}
		dbInfo = {
			identity,
			server,
			schema_ok: schemaOk,
			ontology_rows: ontologyRows,
			matrix_tables: matrixTables,
			migration_level: migrationLevel,
			migration_latest: migrationLatest,
			pool: { in_use: poolStats.inUse, max: poolStats.max, waiters: poolStats.waiters },
		};
	}

	// --- runtime mode strip: a read-only "what mode am I in" snapshot for EVERY
	// admin (the root-only forms only TOGGLE maintenance/recovery/notification). ---
	const state = getServerState();
	const runtimeMode = {
		maintenance: state.maintenance_mode === true,
		recovery: state.recovery_mode === true,
		notification:
			state.notification !== false && state.notification !== '' && state.notification != null,
		// readBool, not readEnv==='true': see diffusion_server_control — the
		// catalog default (true) must apply when the key was never written.
		diffusion_native: readBool('DEDALO_DIFFUSION_NATIVE'),
		dev_mode: readEnv('DEDALO_DEV_MODE') === 'true',
	};

	return {
		payload: {
			db_status: dbStatus,
			config_sources: configSources,
			db_info: dbInfo,
			runtime_mode: runtimeMode,
			state,
		},
		errors,
	};
}

/**
 * check_config.get_value — the panel-open probe (dispatched by get_widget_value).
 */
async function checkConfigGetValue(): Promise<WidgetResponse> {
	const { payload, errors } = await computeCheckConfig();
	return {
		data: payload,
		...(errors.length === 0 ? {} : { msg: 'Warning. Request done with errors', errors }),
	};
}

/**
 * check_config eagerValue (WC-027) — the catalog pre-loads THIS payload onto the
 * widget descriptor so the dashboard paints the header with REAL status while the
 * panel is still FOLDED. Before this, a folded card had no value: `db_status` was `{}`,
 * `global_status` read `undefined`, and render_check_config coloured the header
 * danger-red on a perfectly healthy install. Fail-soft: NEVER throw (a throwing
 * eagerValue blanks the whole dashboard read) — null just defers to the on-open
 * get_value fetch (which restores the old folded-red only on a genuine probe
 * failure, an honest "unknown" signal rather than a false alarm).
 */
async function checkConfigEagerValue(): Promise<Record<string, unknown> | null> {
	try {
		const { payload } = await computeCheckConfig();
		return payload as unknown as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** set_maintenance_mode / set_recovery_mode — boolean state flags (PHP contract). */
function checkConfigSetState(flag: 'maintenance_mode' | 'recovery_mode'): WidgetHandler {
	return async (options) => {
		const value = options.value;
		if (typeof value !== 'boolean') {
			refuseAction(`Error. Request failed. ${flag} value is not a boolean`, { flag });
		}
		const { setServerState } = await import('../../resolve/server_state.ts');
		const state = setServerState({ [flag]: value });
		return { data: true, extend: { state } };
	};
}

/** set_notification — a string message or false to disable (PHP contract). */
async function checkConfigSetNotification(
	options: Record<string, unknown>,
): Promise<WidgetResponse> {
	const value = options.value;
	if (typeof value !== 'string' && typeof value !== 'boolean') {
		refuseAction('Error. Request failed. value is not string or bool');
	}
	const { setServerState } = await import('../../resolve/server_state.ts');
	const state = setServerState({ notification: value });
	return { data: true, extend: { state } };
}

export const widget: WidgetModule = {
	spec: {
		id: 'check_config',
		category: 'config',
		class: 'success',
		label: { kind: 'label', key: 'check_config' },
	},
	apiActions: {
		set_maintenance_mode: checkConfigSetState('maintenance_mode'),
		set_recovery_mode: checkConfigSetState('recovery_mode'),
		set_notification: checkConfigSetNotification,
	},
	getValue: checkConfigGetValue,
	eagerValue: checkConfigEagerValue,
};
