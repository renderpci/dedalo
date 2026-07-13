/**
 * dd_utils_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM from
 * api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 */

import { config } from '../../../config/config.ts';
import { login } from '../../security/auth.ts';
import { getPermissions } from '../../security/permissions.ts';
import { type ActionHandler, requirePrincipal } from '../handler_context.ts';
import { denied } from '../response.ts';

/** dd_utils_api action handlers, keyed by action (registered in dispatch.ts). */
export const utilsApiActions: Record<string, ActionHandler> = {
	update_lock_components_state: async (rqo, context) => {
		// Component soft-lock events (PHP dd_utils_api). Read permission on
		// the section is required to participate in its lock state (prevents
		// fabricating focus/blur on records the user cannot see).
		const principal = requirePrincipal(context);
		const options = (rqo.options ?? {}) as {
			section_id?: unknown;
			section_tipo?: string | null;
			component_tipo?: string | null;
			action?: string;
		};
		// Fail-closed (L4): section_tipo is required and the read gate runs
		// unconditionally — never skip it when the field is absent/falsy.
		if (!options.section_tipo) {
			return denied(400, 'update_lock_components_state: section_tipo is required');
		}
		{
			const level = await getPermissions(principal, options.section_tipo, options.section_tipo);
			if (level < 1) {
				return denied(403, 'Insufficient permissions to read');
			}
		}
		const { updateLockComponentsState } = await import('../../section/locks.ts');
		const outcome = await updateLockComponentsState({
			section_id: options.section_id ?? null,
			section_tipo: options.section_tipo ?? null,
			component_tipo: options.component_tipo ?? null,
			action: options.action ?? '',
			user_id: principal.userId,
			full_username: principal.userId < 0 ? 'Debug user' : (context.session?.username ?? ''),
		});
		return {
			status: 200,
			body: { ...outcome, dedalo_notification: null } as unknown as Record<string, unknown>,
		};
	},
	get_lock_status: async (rqo, context) => {
		// Read-only poll: is the component held by another user? (PHP parity.)
		const principal = requirePrincipal(context);
		const options = (rqo.options ?? {}) as {
			section_id?: unknown;
			section_tipo?: string | null;
			component_tipo?: string | null;
		};
		// Fail-closed (L4): section_tipo is required and the read gate runs
		// unconditionally — never skip it when the field is absent/falsy.
		if (!options.section_tipo) {
			return denied(400, 'get_lock_status: section_tipo is required');
		}
		{
			const level = await getPermissions(principal, options.section_tipo, options.section_tipo);
			if (level < 1) {
				return denied(403, 'Insufficient permissions to read');
			}
		}
		const { getLockStatus } = await import('../../section/locks.ts');
		const outcome = await getLockStatus({
			section_id: options.section_id ?? null,
			section_tipo: options.section_tipo ?? null,
			component_tipo: options.component_tipo ?? null,
			user_id: principal.userId,
		});
		return { status: 200, body: outcome as unknown as Record<string, unknown> };
	},
	get_dedalo_files: async (_rqo, _context) => {
		// The service-worker pre-cache manifest (PHP dd_utils_api::
		// get_dedalo_files). Authenticated read — the auth gate already ran
		// (not in NO_LOGIN_ACTIONS, matching PHP); CSRF-exempt like PHP (the
		// SW calls without the page's token). Body carries result +
		// dedalo_version + msg — the exact shape sw.js/worker_cache.js read.
		const { buildDedaloFilesResponse } = await import('../dedalo_files.ts');
		return {
			status: 200,
			body: buildDedaloFilesResponse() as unknown as Record<string, unknown>,
		};
	},
	get_job_events: async (rqo, context) => {
		// The NATIVE job status wire (core/api/job_stream.ts): the caller subscribes
		// to an in-process job by `job_id` and every state change is PUSHED as it
		// happens — no {pid, pfile} handle, no re-reading a file on a timer. The
		// stream ends on the terminal frame, whose `data` is the job's return value
		// (for an import, the full report). get_process_status below is the legacy
		// poll wire, kept for the AV transcode + backup consumers.
		const principal = requirePrincipal(context);
		const { getJobEvents } = await import('../job_stream.ts');
		return getJobEvents(rqo, principal);
	},
	get_process_status: async (rqo, context) => {
		// Background-process status SSE stream (PHP dd_utils_api::
		// get_process_status; audit S2-15/DEC-22a + S2-35): the copied client's
		// update_process_status polls media transcode / backup pfiles through
		// this. Session-gated; the pfile is reduced to a job-id basename inside
		// the processes dir (see core/api/process_status.ts).
		const principal = requirePrincipal(context);
		const { getUtilsProcessStatus } = await import('../process_status.ts');
		// The principal authorizes the poll: a job that carries user data (a tool's
		// background run) streams only to its owner — the ids are guessable.
		return getUtilsProcessStatus(rqo, principal);
	},
	get_system_info: async (_rqo, _context) => {
		// Upload/import/media-edit init call (PHP dd_utils_api::get_system_info).
		// Authenticated read (the router's session+CSRF gate already ran); returns
		// the upload-limit negotiation payload the client reads before transfer.
		const { buildSystemInfo } = await import('./system_info.ts');
		return {
			status: 200,
			body: { result: buildSystemInfo(), msg: 'OK. Request done' },
		};
	},
	join_chunked_files_uploaded: async (rqo, context) => {
		// Assemble a chunked upload (PHP dd_utils_api::join_chunked_files_uploaded).
		// The client posts every chunk to the multipart upload endpoint, then —
		// once its own counter (chunk_index/total_chunks) shows all arrived —
		// fires this JSON RQO to join them + re-sniff (SEC-066). Fail-closed:
		// anonymous → 404. State-changing: the router already enforced CSRF.
		if (context.session === null) {
			return { status: 404, body: { result: false, msg: 'Not found' } };
		}
		const options = (rqo.options ?? {}) as {
			file_data?: { key_dir?: unknown; tmp_name?: unknown; total_chunks?: unknown };
			files_chunked?: unknown[];
		};
		const fileData = options.file_data ?? {};
		const filesChunked = Array.isArray(options.files_chunked) ? options.files_chunked : [];
		// total_chunks: the dense files_chunked array length, or the echoed count.
		const totalChunks =
			filesChunked.length > 0 ? filesChunked.length : Number(fileData.total_chunks ?? 0);
		try {
			const { joinChunkedUpload } = await import('../../media/ingest/upload.ts');
			const joined = joinChunkedUpload(
				String(fileData.key_dir ?? ''),
				String(fileData.tmp_name ?? ''),
				totalChunks,
				context.session.userId,
			);
			return {
				status: 200,
				body: {
					result: true,
					msg: 'OK. Request done',
					file_data: {
						key_dir: fileData.key_dir ?? null,
						tmp_name: joined.tmpName ?? null,
						extension: joined.extension ?? null,
						chunked: false,
						complete: true,
					},
				},
			};
		} catch (error) {
			return {
				status: 200,
				body: { result: false, msg: 'Join failed', errors: [(error as Error).message] },
			};
		}
	},
	change_lang: async (rqo, context) => {
		// Persist the user's interface/data language choice (PHP dd_utils_api::
		// change_lang → $_SESSION['dedalo']['config']). The client's two menu
		// selectors both post here, then full-reload; every subsequent request
		// rebuilds with the stored language (see core/resolve/request_lang.ts).
		// State-changing + authenticated: the router already ran the CSRF gate,
		// and change_lang is NOT in NO_LOGIN_ACTIONS, so a session is guaranteed.
		const options = (rqo.options ?? {}) as {
			dedalo_application_lang?: unknown;
			dedalo_data_lang?: unknown;
		};
		const { isValidLang } = await import('../../concepts/ontology.ts');
		// Validate against the identifier allowlist BEFORE storing — the value
		// later flows into JSONB paths through the identifier gate (SEC §7.6),
		// so an invalid tag must never be persisted.
		const readLang = (raw: unknown): string | undefined => {
			if (typeof raw !== 'string' || raw === '') return undefined;
			const trimmed = raw.trim();
			return isValidLang(trimmed) ? trimmed : undefined;
		};
		let applicationLang = readLang(options.dedalo_application_lang);
		let dataLang = readLang(options.dedalo_data_lang);
		// DEDALO_DATA_LANG_SYNC (PHP change_lang): when the install couples the
		// two languages, a change to either drives the other. Off on this
		// install (page_globals.dedalo_data_lang_sync=false); replicated for parity.
		if (config.menu.dataLangSync === true) {
			if (applicationLang !== undefined) dataLang = applicationLang;
			else if (dataLang !== undefined) applicationLang = dataLang;
		}
		if (applicationLang === undefined && dataLang === undefined) {
			return { status: 200, body: { result: false, msg: 'No valid language supplied' } };
		}
		if (context.sessionToken) {
			const { setSessionLangs } = await import('../../security/session_store.ts');
			setSessionLangs(context.sessionToken, { applicationLang, dataLang });
		}
		const changed = [
			applicationLang !== undefined ? `dedalo_application_lang to ${applicationLang}` : null,
			dataLang !== undefined ? `dedalo_data_lang to ${dataLang}` : null,
		].filter(Boolean);
		return {
			status: 200,
			body: { result: true, msg: `OK. Request done. Changed ${changed.join(', ')}` },
		};
	},
	get_login_context: async (_rqo, _context) => {
		// The login form's own context request (PHP dd_utils_api::
		// get_login_context) — pre-auth by design (the form must render
		// before any session exists). Returns [login context].
		const { buildLoginContext } = await import('./login_context.ts');
		return {
			status: 200,
			body: { result: [await buildLoginContext()], msg: 'OK. Request done' },
		};
	},
	list_uploaded_files: async (_rqo, _context) => {
		// The dropzone service lists the user's pending chunked uploads (PHP
		// dd_utils_api::list_uploaded_files → scandir(DEDALO_UPLOAD_TMP_DIR/user)).
		// With nothing uploaded (the default test state) PHP returns an empty
		// array. The empty-dir result is the common case and, importantly, keeps
		// page_globals.api_errors EMPTY: an unhandled action here accumulates a
		// global error that makes the NEXT element's render bail before setting
		// status='rendered' (common.js:404) — which is what broke the sibling
		// service_tmp_section render in test_others_lifecycle. Full temp-dir scan
		// is uncovered scope; the shape ([{url,name,size}]) is honored.
		return { status: 200, body: { result: [], msg: 'OK. Request done' } };
	},
	get_install_context: async (_rqo, _context) => {
		// The installer's own context request (DEC-19 TS-native install). The
		// client build reads result.find(el => el.model===self.model), so result
		// is an ARRAY carrying the installer element. On a fresh machine there is
		// NO ontology to resolve, so this is a SYNTHETIC context built by hand
		// (buildInstallContext) carrying exactly the properties render_installer.js
		// reads — NOT buildStructureContext. The dispatch gate (Gate 1b) already
		// blocked this action pre-seal-only + IP-gated; post-seal it 404s.
		const { buildInstallContext } = await import('../../install/context.ts');
		return {
			status: 200,
			body: { result: [buildInstallContext()], msg: 'OK. Request done' },
		};
	},
	install: async (rqo, context) => {
		// The wizard step router (DEC-19). Every wizard step rides this one action
		// with the concrete step in options.action; the response is the TOP-LEVEL
		// envelope the client reads ({result, msg, ...extras}). The dispatch gate
		// (Gate 1b) already enforced unsealed + IP-allowed; record-writing steps
		// re-check the session here (login-gated even while unsealed).
		const { runInstallStep } = await import('../../install/engine.ts');
		return runInstallStep(rqo, context);
	},
	login: async (rqo, context) => {
		const options = (rqo.options ?? {}) as { username?: string; auth?: string };
		const outcome = await login(
			String(options.username ?? ''),
			String(options.auth ?? ''),
			context.clientIp,
		);
		if (!outcome.ok) {
			return { status: 200, body: { result: false, msg: outcome.message } };
		}
		// The fresh session's CSRF token must ship with the login response —
		// every subsequent non-exempt action requires it (PHP appends the
		// token to all responses; the session here is created mid-handler,
		// so the dispatch-level append cannot see it).
		const { getSession } = await import('../../security/session_store.ts');
		const freshSession = getSession(outcome.sessionToken as string);
		return {
			status: 200,
			body: {
				result: true,
				msg: 'ok',
				user_id: outcome.userId,
				csrf_token: freshSession?.csrfToken,
			},
			setSessionToken: outcome.sessionToken,
			// Media access control (Rule A). Undefined when the mode is false, so a
			// protection-off install emits exactly ONE Set-Cookie, as before.
			setMediaAuthCookie: outcome.mediaAuthCookieValue,
		};
	},
	quit: async (_rqo, context) => {
		// Log out (PHP dd_utils_api::quit → session teardown). The client's
		// menu quit button posts here; on result===true it purges its local
		// caches/service-worker and redirects (login.js quit()). Authenticated
		// + state-changing: the router already ran auth + CSRF gates, so the
		// session and its token are guaranteed here.
		const { destroySession } = await import('../../security/session_store.ts');
		if (context.sessionToken) {
			destroySession(context.sessionToken);
		}
		// No SAML on this install, so no saml_redirect (the client falls back to
		// the standard SW-cleanup + root redirect when the field is absent).
		return {
			status: 200,
			body: { result: true, msg: 'OK. Request done' },
			clearSessionCookie: true,
			// Clear the media-auth cookie too. UNCONDITIONAL, unlike PHP (which gated on
			// the mode): clearing an absent cookie costs nothing, while the conditional's
			// only real effect is to LEAVE a live authorization value in the browser of a
			// user who logs out just after an operator switched protection off — a value
			// that becomes valid again the moment it is switched back on.
			//
			// (!) This clears the BROWSER cookie only. It must NEVER unlink the auth
			// marker: the cookie value is install-global (every logged-in editor shares
			// today's value), so unlinking it on one user's logout would lock out all of
			// them until their next login.
			clearMediaAuthCookie: true,
		};
	},
	convert_search_object_to_sql_query: async (rqo, context) => {
		// SQO → SQL dev console (PHP dd_utils_api::convert_search_object_to_sql_query,
		// the sqo_test_environment maintenance widget). Global-admin only. The client
		// SQO is scrubbed by sanitizeClientSqo (the API-boundary security gate), built
		// to SQL by the standard search assembler, then executed. Response mirrors PHP:
		// msg = resolved SQL (params substituted), sql = template, ar_section_id =
		// distinct returned ids, db_data = rows.
		const principal = requirePrincipal(context);
		if (!principal.isGlobalAdmin) {
			return denied(403, 'Only global admins can use the SQO test environment');
		}
		const untrusted = (rqo.options ?? {}) as Record<string, unknown>;
		try {
			const { sanitizeClientSqo } = await import('../../concepts/sqo.ts');
			const { buildSearchSql } = await import('../../search/sql_assembler.ts');
			const { sql } = await import('../../db/postgres.ts');
			const sqo = sanitizeClientSqo(untrusted);
			const built = await buildSearchSql(sqo, { principal });
			// Human-readable SQL: substitute $N placeholders with their param values.
			// Iterate high→low so $1 never matches inside $10 (SEC: display only —
			// the executed query always uses the bound params below, not this string).
			let resolved = built.sql;
			for (let i = built.params.length; i >= 1; i--) {
				const param = built.params[i - 1];
				const literal =
					typeof param === 'number' ? String(param) : `'${String(param).replace(/'/g, "''")}'`;
				resolved = resolved.replaceAll(`$${i}`, literal);
			}
			const rows = (await sql.unsafe(built.sql, built.params as (string | number)[])) as Record<
				string,
				unknown
			>[];
			const arSectionId = [
				...new Set(
					rows.map((row) => row.section_id).filter((id) => id !== undefined && id !== null),
				),
			];
			return {
				status: 200,
				body: {
					result: true,
					msg: resolved,
					sql: built.sql,
					ar_section_id: arSectionId,
					db_data: rows,
				},
			};
		} catch (error) {
			return {
				status: 200,
				body: {
					result: false,
					msg: `Error: ${(error as Error).message}`,
					errors: [(error as Error).message],
				},
			};
		}
	},
	get_server_ready_status: async (rqo) => {
		// Remote reachability probe (PHP dd_utils_api::get_server_ready_status).
		// Machine-to-machine, pre-auth (NO_LOGIN + CSRF-exempt like PHP): the
		// only branch implemented is the ontology-server check; anything else
		// answers the PHP default refusal. Fail-closed on the config flag.
		const options = (rqo.options ?? {}) as { check?: unknown };
		if (options.check === 'ontology_server' && config.ontologyIo.isOntologyServer === true) {
			return {
				status: 200,
				body: { result: true, msg: 'OK. Ontology server is ready', errors: [] },
			};
		}
		if (options.check === 'code_server' && config.update.isCodeServer === true) {
			return {
				status: 200,
				body: { result: true, msg: 'OK. Code server is ready', errors: [] },
			};
		}
		return {
			status: 200,
			body: { result: false, msg: 'Error. This is not an accessible Server', errors: [] },
		};
	},
	get_ontology_update_info: async (rqo) => {
		// Ontology-update manifest (PHP dd_utils_api::get_ontology_update_info):
		// served ONLY when this instance is an ontology master, to callers
		// presenting a configured access code. PHP refusal bytes preserved.
		const options = (rqo.options ?? {}) as { version?: unknown; code?: unknown };
		const fail = (msg: string) => ({ status: 200, body: { result: false, msg, errors: [msg] } });
		if (config.ontologyIo.isOntologyServer !== true) {
			return fail('Error. Server is not an ontology server');
		}
		const versionRaw = typeof options.version === 'string' ? options.version : '';
		const parts = versionRaw.split('.');
		const major = Number(parts[0]);
		const minor = Number(parts[1]);
		if (!Number.isInteger(major) || !Number.isInteger(minor)) {
			return fail('Error. Invalid version number');
		}
		const validCodes = new Set(
			[
				config.ontologyIo.serverCode,
				...config.ontologyIo.servers.map((entry) => entry.code),
			].filter((code): code is string => typeof code === 'string' && code !== ''),
		);
		// The localhost pseudo-code is always honored on a master (the panel's
		// 'Local files' source posts it to our own API).
		validCodes.add('localhost');
		if (typeof options.code !== 'string' || !validCodes.has(options.code)) {
			return fail('Error. Invalid code');
		}
		const { getOntologyIoPath, buildOntologyUpdateInfo } = await import(
			'../../ontology/data_io_import.ts'
		);
		const ioPath = getOntologyIoPath(config.ops.ontologyDataIoDir, [major, minor]);
		if (ioPath === false) {
			return fail('Error. Invalid version number. This version does not contain ontology files. ');
		}
		const { readEnv } = await import('../../../config/env.ts');
		const protocol = (readEnv('DEDALO_PROTOCOL', 'http://') as string) ?? 'http://';
		const host = (readEnv('DEDALO_HOST', 'localhost') as string) ?? 'localhost';
		const publicBaseUrl = `${protocol}${host}/dedalo/install/import/ontology/${major}.${minor}`;
		return { status: 200, body: buildOntologyUpdateInfo(ioPath, publicBaseUrl) };
	},
	get_code_update_info: async (rqo) => {
		// Code-release manifest (PHP dd_utils_api::get_code_update_info): served
		// ONLY when this instance is a code master, to callers presenting a
		// configured CODE_SERVERS code. PHP refusal bytes preserved. Advertises
		// only built release archives on the caller's linear upgrade path.
		const options = (rqo.options ?? {}) as { version?: unknown; code?: unknown };
		const fail = (msg: string) => ({ status: 200, body: { result: false, msg, errors: [msg] } });
		if (config.update.isCodeServer !== true) {
			return fail('Error. Server is not an code server');
		}
		const versionRaw = typeof options.version === 'string' ? options.version : '';
		const { parseVersionString, DEDALO_VERSION_TRIPLE } = await import('../../update/version.ts');
		const clientVersion = parseVersionString(versionRaw);
		if (clientVersion.length < 3 || clientVersion.some((n) => !Number.isInteger(n))) {
			return fail('Error. Invalid version number');
		}
		const validCodes = new Set(
			config.update.codeServers
				.map((entry) => entry.code)
				.filter((code): code is string => typeof code === 'string' && code !== ''),
		);
		if (typeof options.code !== 'string' || !validCodes.has(options.code)) {
			return fail('Error. Invalid code');
		}
		const { buildCodeUpdateInfo } = await import('../../update/code_manifest.ts');
		const { readEnv } = await import('../../../config/env.ts');
		const protocol = (readEnv('DEDALO_PROTOCOL', 'http://') as string) ?? 'http://';
		const host = (readEnv('DEDALO_HOST', 'localhost') as string) ?? 'localhost';
		const info = buildCodeUpdateInfo({
			clientVersion,
			serverVersion: DEDALO_VERSION_TRIPLE,
			codeFilesDir: config.update.codeFilesDir,
			publicBaseUrl: `${protocol}${host}/dedalo/install/code`,
			info: {
				date: new Date().toISOString(),
				entity_id: config.identity.entityId,
				entity: config.entity,
				host: (readEnv('DEDALO_HOST', '') as string) ?? '',
			},
		});
		return { status: 200, body: { result: info, msg: 'OK. request done', errors: [] } };
	},
};
