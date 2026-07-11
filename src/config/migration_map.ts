/**
 * v6 → v7 CONFIG MIGRATION MAP — the single source of truth for both
 * `scripts/migrate_v6_config.ts` and the change-reference table in
 * `docs/config/whats_changed_v7.md`.
 *
 * A v6 install declares ~200 `define()` constants in `<dedalo>/config/`. The TS
 * engine reads env keys from `../private/.env`. Every legacy constant lands in
 * exactly one class:
 *
 *   SAME     the TS engine reads this exact name — copy the value across
 *   ALIAS    TS has its own name and honors the PHP one as a fallback
 *            (`PHP_KEY_ALIASES`); we emit the TS-native name, the canonical one
 *   RENAMED  the name changed and the old spelling is RETIRED — emitting it
 *            would refuse the boot (`RETIRED_ENV_KEYS`)
 *   RESHAPED name and/or VALUE SHAPE differ; a transform runs
 *   DROPPED  no TS consumer — always with a reason, printed in the report
 *
 * ALIAS and RENAMED are DERIVED from the tables in `env.ts` rather than
 * restated, so a future rename cannot fall out of step with the migration.
 * `test/unit/config_census_tripwire.test.ts` proves the rest: every legacy
 * constant is classified, and every non-DROPPED target is a key the engine
 * actually reads.
 *
 * NOTE this module imports `env.ts` but NEVER `config.ts` — building the frozen
 * config throws on a partially-configured box, which is precisely the box a
 * migration runs on.
 */

import { PHP_KEY_ALIASES, RETIRED_ENV_KEYS } from './env.ts';

export type MigrationClass = 'SAME' | 'ALIAS' | 'RENAMED' | 'RESHAPED' | 'DROPPED';

export interface MigrationRule {
	readonly cls: MigrationClass;
	/** The v7 env key to write. Absent for DROPPED. */
	readonly target?: string;
	/** Value rewrite (v6 shape → v7 shape). Identity when absent. */
	readonly transform?: (value: unknown) => unknown;
	/** DROPPED only — why, shown verbatim in the migration report. */
	readonly reason?: string;
}

// ---------------------------------------------------------------------------
// SAME — the v6 constant name IS the v7 env key (85).
// ---------------------------------------------------------------------------

const SAME_KEYS: readonly string[] = [
	// identity / locale
	'DEDALO_ENTITY_ID',
	'DEDALO_ENTITY_LABEL',
	'DEDALO_LOCALE',
	'DEDALO_TIMEZONE',
	'DEDALO_DATE_ORDER',
	'DEDALO_HOST',
	'DEDALO_PROTOCOL',
	// languages
	'DEDALO_APPLICATION_LANGS',
	'DEDALO_APPLICATION_LANGS_DEFAULT',
	'DEDALO_DATA_LANG_DEFAULT',
	'DEDALO_DATA_LANG_SELECTOR',
	'DEDALO_STRUCTURE_LANG',
	// app defaults / features
	'DEDALO_MAX_ROWS_PER_PAGE',
	'DEDALO_DEFAULT_PROJECT',
	'DEDALO_FILTER_SECTION_TIPO_DEFAULT',
	'DEDALO_LOCK_COMPONENTS',
	'DEDALO_NOTIFICATIONS',
	'DEDALO_AR_EXCLUDE_COMPONENTS',
	'DEDALO_GEO_PROVIDER',
	'IP_API',
	// media — image
	'DEDALO_IMAGE_FOLDER',
	'DEDALO_IMAGE_EXTENSION',
	'DEDALO_IMAGE_EXTENSIONS_SUPPORTED',
	'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS',
	'DEDALO_IMAGE_AR_QUALITY',
	'DEDALO_IMAGE_QUALITY_DEFAULT',
	'DEDALO_IMAGE_QUALITY_ORIGINAL',
	'DEDALO_IMAGE_QUALITY_RETOUCHED',
	'DEDALO_IMAGE_PRINT_DPI',
	'DEDALO_IMAGE_THUMB_WIDTH',
	'DEDALO_IMAGE_THUMB_HEIGHT',
	// media — av
	'DEDALO_AV_FOLDER',
	'DEDALO_AV_EXTENSION',
	'DEDALO_AV_EXTENSIONS_SUPPORTED',
	'DEDALO_AV_AR_QUALITY',
	'DEDALO_AV_QUALITY_DEFAULT',
	'DEDALO_AV_QUALITY_ORIGINAL',
	'DEDALO_AV_POSTERFRAME_EXTENSION',
	'DEDALO_AV_SUBTITLES_EXTENSION',
	'DEDALO_SUBTITLES_FOLDER',
	'DEDALO_AV_FFMPEG_PATH',
	'DEDALO_AV_FFPROBE_PATH',
	'DEDALO_AV_FASTSTART_PATH',
	// media — pdf / svg / 3d / thumb
	'DEDALO_PDF_FOLDER',
	'DEDALO_PDF_EXTENSION',
	'DEDALO_PDF_EXTENSIONS_SUPPORTED',
	'DEDALO_PDF_ALTERNATIVE_EXTENSIONS',
	'DEDALO_PDF_AR_QUALITY',
	'DEDALO_PDF_QUALITY_DEFAULT',
	'DEDALO_PDF_QUALITY_ORIGINAL',
	'PDF_AUTOMATIC_TRANSCRIPTION_ENGINE',
	'PDF_OCR_ENGINE',
	'DEDALO_SVG_FOLDER',
	'DEDALO_SVG_EXTENSION',
	'DEDALO_SVG_EXTENSIONS_SUPPORTED',
	'DEDALO_SVG_AR_QUALITY',
	'DEDALO_SVG_QUALITY_DEFAULT',
	'DEDALO_SVG_QUALITY_ORIGINAL',
	'DEDALO_3D_FOLDER',
	'DEDALO_3D_EXTENSION',
	'DEDALO_3D_EXTENSIONS_SUPPORTED',
	'DEDALO_3D_AR_QUALITY',
	'DEDALO_3D_QUALITY_DEFAULT',
	'DEDALO_3D_QUALITY_ORIGINAL',
	'DEDALO_QUALITY_THUMB',
	'DEDALO_THUMB_EXTENSION',
	// media — access + upload
	'DEDALO_PROTECT_MEDIA_FILES',
	'DEDALO_UPLOAD_SERVICE_CHUNK_FILES',
	'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT',
	// ops / backup
	'DEDALO_BACKUP_PATH',
	'DEDALO_BACKUP_TIME_RANGE',
	'UPDATE_LOG_FILE',
	// ontology io + code update
	'ONTOLOGY_SERVERS',
	'ONTOLOGY_SERVER_CODE',
	'IS_AN_ONTOLOGY_SERVER',
	'ONTOLOGY_DATA_IO_DIR',
	'STRUCTURE_FROM_SERVER',
	'CODE_SERVERS',
	'IS_A_CODE_SERVER',
	'DEDALO_CODE_FILES_DIR',
	'DEDALO_CODE_SERVER_GIT_DIR',
	'DEDALO_SOURCE_VERSION_LOCAL_DIR',
	// diffusion
	'DEDALO_DIFFUSION_DOMAIN',
	'DEDALO_DIFFUSION_LANGS',
	'DEDALO_DIFFUSION_RESOLVE_LEVELS',
];

// ---------------------------------------------------------------------------
// RESHAPED — name and/or value shape change.
// ---------------------------------------------------------------------------

/** v6 ships binary DIRECTORIES with a trailing slash; v7 wants the executable's full path. */
const asBinary =
	(exe: string) =>
	(value: unknown): unknown => {
		const raw = String(value ?? '').trim();
		if (raw === '') return raw;
		return raw.endsWith('/') ? `${raw}${exe}` : raw;
	};

/** v6 ships a directory with a trailing slash; v7 wants it bare. */
const asDir = (value: unknown): unknown => String(value ?? '').replace(/\/+$/, '');

/**
 * NOT a rename of SERVER_PROXY → TRUSTED_PROXY_HOPS. They point in opposite
 * directions: v6's SERVER_PROXY was an OUTBOUND egress proxy (host:port) handed to
 * curl when Dédalo FETCHES from an ontology/code master; v7's TRUSTED_PROXY_HOPS is
 * INBOUND — how many reverse-proxy hops sit in front of us, so the right
 * X-Forwarded-For entry is taken as the client IP. Converting one to the other would
 * be a security bug, not a migration.
 */
const RESHAPED: Readonly<Record<string, MigrationRule>> = {
	// The MariaDB (diffusion) connection moved to its own DEDALO_DIFFUSION_DB_* family:
	// in v7 the Bun engine — not PHP — owns MariaDB.
	MYSQL_DEDALO_HOSTNAME_CONN: { cls: 'RESHAPED', target: 'DEDALO_DIFFUSION_DB_HOST' },
	MYSQL_DEDALO_DB_PORT_CONN: { cls: 'RESHAPED', target: 'DEDALO_DIFFUSION_DB_PORT' },
	MYSQL_DEDALO_SOCKET_CONN: { cls: 'RESHAPED', target: 'DEDALO_DIFFUSION_DB_SOCKET' },
	MYSQL_DEDALO_USERNAME_CONN: { cls: 'RESHAPED', target: 'DEDALO_DIFFUSION_DB_USER' },
	MYSQL_DEDALO_PASSWORD_CONN: { cls: 'RESHAPED', target: 'DEDALO_DIFFUSION_DB_PASSWORD' },

	// Binary paths: v6 = a directory ('/usr/bin/'), v7 = the executable itself.
	MAGICK_PATH: { cls: 'RESHAPED', target: 'DEDALO_MAGICK_PATH', transform: asBinary('magick') },
	DB_BIN_PATH: { cls: 'RESHAPED', target: 'DEDALO_PG_BIN_PATH', transform: asDir },
};

// ---------------------------------------------------------------------------
// DROPPED — no TS consumer. Every entry carries the reason the report prints.
// ---------------------------------------------------------------------------

const DERIVED_PATH = 'derived: the v7 engine computes this path/URL itself';
const PHP_ONLY = 'PHP-only: the TS engine has no such subsystem';
const TS_STATE = 'runtime state: lives in ../private/ts_state.json, not .env';
const NO_CONSUMER = 'no TS consumer (see the "NOT HONORED" block of sample.env)';

const dropped = (names: readonly string[], reason: string): Record<string, MigrationRule> =>
	Object.fromEntries(names.map((n) => [n, { cls: 'DROPPED' as const, reason }]));

const DROPPED: Readonly<Record<string, MigrationRule>> = {
	// Paths and URLs the engine derives from its own location / the request.
	...dropped(
		[
			'DEDALO_ROOT_PATH',
			'DEDALO_ROOT_WEB',
			'DEDALO_CONFIG',
			'DEDALO_CONFIG_PATH',
			'DEDALO_CORE',
			'DEDALO_CORE_PATH',
			'DEDALO_CORE_URL',
			'DEDALO_SHARED',
			'DEDALO_SHARED_PATH',
			'DEDALO_SHARED_URL',
			'DEDALO_TOOLS',
			'DEDALO_TOOLS_PATH',
			'DEDALO_TOOLS_URL',
			'DEDALO_LIB',
			'DEDALO_LIB_PATH',
			'DEDALO_LIB_URL',
			'DEDALO_WIDGETS_PATH',
			'DEDALO_WIDGETS_URL',
			'DEDALO_EXTRAS_PATH',
			'DEDALO_EXTRAS_URL',
			'DEDALO_INSTALL_PATH',
			'DEDALO_INSTALL_URL',
			'DEDALO_API_URL',
			'DEDALO_MEDIA_URL',
			'DEDALO_IMAGE_FILE_URL',
			'DEDALO_CODE_FILES_URL',
			'DEDALO_TOOL_EXPORT_FOLDER_URL',
			'DEDALO_TOOL_EXPORT_FOLDER_PATH',
			'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',
			'DEDALO_UPLOAD_TMP_DIR',
			'DEDALO_UPLOAD_TMP_URL',
			'ONTOLOGY_DATA_IO_URL',
			'ONTOLOGY_DOWNLOAD_DIR',
			'DEDALO_BACKUP_PATH_DB',
			'DEDALO_BACKUP_PATH_ONTOLOGY',
			'DEDALO_BACKUP_PATH_TEMP',
			'DEDALO_BACKUP_PATH_STRUCTURE',
			'DEDALO_BACKUP_PATH_USERS',
			'COLOR_PROFILES_PATH',
			'DEDALO_IMAGE_WEB_FOLDER',
			'DEDALO_SOURCE_VERSION_URL',
			'STRUCTURE_DOWNLOAD_JSON_FILE',
			'CONFIG_DEFAULT_FILE_PATH',
			// present in real installs (not in the shipped sample)
			'DEDALO_DIFFUSION_PATH',
			'DEDALO_DIFFUSION_URL',
			'DEDALO_DIFFUSION_API_URL',
		],
		DERIVED_PATH,
	),

	// Subsystems that simply do not exist in the TS engine.
	...dropped(
		[
			'DEDALO_SESSION_HANDLER',
			'DEDALO_SESSIONS_PATH',
			'DEDALO_SESSION_SAVE_PATH',
			'DEDALO_CACHE_MANAGER',
			'LOGGER_LEVEL',
			'ENCRYPTION_MODE',
			'PHP_BIN_PATH',
			'MYSQL_DB_BIN_PATH',
			'DEDALO_DB_TYPE',
			'DEDALO_DB_MANAGEMENT',
			'DEDALO_NODEJS',
			'DEDALO_NODEJS_PM2',
			'DEDALO_TRANSLATOR_URL',
			'DEDALO_PERMISSIONS_ROOT',
			'DEDALO_STRUCTURE_CSS',
			'DEDALO_ADITIONAL_CSS',
			'DEDALO_MCP_PROXY_URL',
			'DEDALO_API_URL_UNIT_TEST',
			'API_WEB_USER_CODE_MULTIPLE',
			'GEONAMES_ACCOUNT_USERNAME',
			'DEDALO_RECOVERY_KEY',
			'DEDALO_BACKUP_ON_LOGIN',
			'DEDALO_PROFILE_DEFAULT',
			'USE_CDN',
			'JQUERY_LIB_URL_JS',
			'JQUERY_UI_URL_JS',
			'JQUERY_UI_URL_CSS',
			'JQUERY_TABLESORTER_JS',
			'TEXT_EDITOR_URL_JS',
			'PAPER_JS_URL',
			'LEAFLET_JS_URL',
			'D3_URL_JS',
			'NVD3_URL_JS',
			'NVD3_URL_CSS',
			'BOOTSTRAP_CSS_URL',
			'BOOTSTRAP_JS_URL',
			'TEXT_SUBTITLES_ENGINE',
			'DEDALO_IMAGE_LIB',
			'MAGICK_CONFIG',
			'DEDALO_PDF_RENDERER',
			'DEDALO_AV_FFMPEG_SETTINGS',
			'DEDALO_AV_RECOMPRESS_ALL',
			'DEDALO_AV_WATERMARK_FILE',
			'DEDALO_AV_STREAMER',
			'DEDALO_3D_GLTFPACK_PATH',
			'DEDALO_3D_FBX2GLTF_PATH',
			'DEDALO_3D_COLLADA2GLTF_PATH',
			'DEDALO_HTML_FILES_FOLDER',
			'DEDALO_HTML_FILES_EXTENSION',
			'DEDALO_IMAGE_BEST_EXTENSIONS',
			'DEDALO_AV_BEST_EXTENSIONS',
		],
		PHP_ONLY,
	),

	// Media type/mime constants: v7 derives the MIME from the extension.
	...dropped(
		[
			'DEDALO_IMAGE_MIME_TYPE',
			'DEDALO_IMAGE_TYPE',
			'DEDALO_AV_MIME_TYPE',
			'DEDALO_AV_TYPE',
			'DEDALO_PDF_MIME_TYPE',
			'DEDALO_PDF_TYPE',
			'DEDALO_SVG_MIME_TYPE',
			'DEDALO_3D_MIME_TYPE',
			'DEDALO_3D_THUMB_DEFAULT',
		],
		'derived: v7 resolves the media type from the file extension',
	),

	// Machine-written runtime state — never config.
	...dropped(
		[
			'DEDALO_INSTALL_STATUS',
			'DEDALO_MAINTENANCE_MODE',
			'DEDALO_NOTIFICATION',
			'DEDALO_TEST_INSTALL',
			// the *_CUSTOM twins a real install's config_core.php carries
			'DEDALO_MAINTENANCE_MODE_CUSTOM',
			'DEDALO_NOTIFICATION_CUSTOM',
		],
		TS_STATE,
	),

	// Never really CONFIG in v6: derived per REQUEST from the logged user —
	// SHOW_DEBUG = "is the superuser", SHOW_DEVELOPER = the user's is_developer flag
	// in the database. The client flags of the same name still exist in v7 (the
	// client reads them in ~470 files); the server now derives them from ONE env key,
	// DEDALO_DEV_MODE, instead of from the user. Nothing to carry across — but the
	// capability is NOT gone, so do not call this "PHP-only".
	SHOW_DEBUG: {
		cls: 'DROPPED',
		reason:
			'per-user in v6 (superuser only); in v7 the client SHOW_DEBUG flag is driven server-wide by DEDALO_DEV_MODE=true',
	},
	SHOW_DEVELOPER: {
		cls: 'DROPPED',
		reason:
			'per-user in v6 (the is_developer DB flag); in v7 the client SHOW_DEVELOPER flag is driven server-wide by DEDALO_DEV_MODE=true',
	},
	DEVELOPMENT_SERVER: {
		cls: 'DROPPED',
		reason: 'in v7 the client DEVELOPMENT_SERVER flag is derived from DEDALO_DEV_MODE',
	},

	// v6 did not HASH passwords — it reversibly AES-encrypted them, keyed by
	// md5(md5(DEDALO_INFORMATION)) with the IV seeded from DEDALO_INFO_KEY
	// (component_password::encrypt_password → dedalo_encrypt_openssl). v7 stores
	// Argon2id hashes (Bun.password), whose per-password salt is embedded in the hash
	// string, so neither key has any meaning here. Carrying them over would only
	// preserve the ability to DECRYPT old passwords — exactly what we do not want.
	// The lockout consequence is warned about by the CLI (LEGACY PASSWORD HASHES).
	DEDALO_INFORMATION: {
		cls: 'DROPPED',
		reason:
			'v6 password-encryption key: v7 stores Argon2id hashes (per-password salt embedded) and never decrypts — see the legacy-password warning',
	},
	DEDALO_INFO_KEY: {
		cls: 'DROPPED',
		reason:
			'v6 password-encryption IV seed: not used by Argon2id — see the legacy-password warning',
	},
	// v6 used the salt ONLY to seed a session token (login::Login salt_secure), never
	// for passwords. v7 has its own session store.
	DEDALO_SALT_STRING: {
		cls: 'DROPPED',
		reason: 'v6 session-token seed (never a password salt); v7 manages its own session secrets',
	},

	// The OUTBOUND egress proxy v6 handed to curl for its ontology/code-master fetches.
	// v7 still makes those fetches — it just has no Dédalo-level key for the proxy,
	// because Bun's fetch honors the STANDARD proxy env vars. (NOT the same thing as
	// TRUSTED_PROXY_HOPS, which is about proxies in front of us — see RESHAPED above.)
	SERVER_PROXY: {
		cls: 'DROPPED',
		reason:
			'no Dédalo key in v7: set the standard HTTPS_PROXY / HTTP_PROXY in the server environment instead (Bun fetch honors them)',
	},

	// v7 takes the diffusion TARGET database per publication (the SectionPlan carries
	// it, and a database-less session is a loud error — diffusion/targets/mariadb/db.ts),
	// so there is no single configured database name. NOTE: config_persist.ts:126 still
	// WRITES DEDALO_DIFFUSION_DB_NAME, but nothing reads it — a dead key, not a target.
	MYSQL_DEDALO_DATABASE_CONN: {
		cls: 'DROPPED',
		reason: 'v7 resolves the diffusion target database per publication, not from config',
	},

	// Read by nothing in the TS engine today.
	...dropped(
		[
			'DEDALO_SOCKET_CONN',
			'DEDALO_SECTION_ID_TEMP',
			'NUMERICAL_MATRIX_VALUE_YES',
			'NUMERICAL_MATRIX_VALUE_NO',
			'DEDALO_FILTER_USER_RECORDS_BY_ID',
			'DEDALO_ENTITY_MEDIA_AREA_TIPO',
			'DEDALO_PUBLICATION_CLEAN_URL',
			'DEDALO_PUBLICATION_ALERT',
			'DIFFUSION_CUSTOM',
			'EXCLUDE_DIFFUSION_ELEMENTS',
			'DEDALO_DIFFUSION_SERVICE_CMD',
			'DEDALO_DIFFUSION_SOCKET_PATH',
			'DEDALO_DIFFUSION_INTERNAL_TOKEN',
			'STRUCTURE_SERVER_URL',
			'STRUCTURE_SERVER_CODE',
		],
		NO_CONSUMER,
	),
};

// ---------------------------------------------------------------------------
// The assembled map
// ---------------------------------------------------------------------------

function build(): Readonly<Record<string, MigrationRule>> {
	const map: Record<string, MigrationRule> = {};

	for (const name of SAME_KEYS) map[name] = { cls: 'SAME', target: name };

	// ALIAS — derived from env.ts (TS-native key → PHP spelling). We invert it and
	// emit the TS-native name: both work, but the native one is canonical.
	for (const [tsKey, phpKey] of Object.entries(PHP_KEY_ALIASES)) {
		map[phpKey] = { cls: 'ALIAS', target: tsKey };
	}

	// RENAMED — derived from env.ts. Emitting the old spelling would REFUSE the boot.
	for (const [retired, replacement] of Object.entries(RETIRED_ENV_KEYS)) {
		map[retired] = { cls: 'RENAMED', target: replacement };
	}

	Object.assign(map, RESHAPED, DROPPED);
	return Object.freeze(map);
}

export const V6_MIGRATION: Readonly<Record<string, MigrationRule>> = build();

/**
 * Env keys the v7 engine reads that have NO v6 origin — nothing to migrate, but
 * they must be declared so the census is complete: together with the non-DROPPED
 * targets of V6_MIGRATION these are exactly the keys the engine reads, and
 * `config_census_tripwire` proves it against a scan of `src/`. A new key added to
 * the engine without a line here fails that gate — which is the point: it is also
 * the moment to document it.
 */
export const NEW_IN_V7: readonly string[] = [
	// server / runtime
	'SERVER_UNIX_SOCKET',
	'SERVER_TCP_PORT',
	'SERVER_MAX_BODY_BYTES',
	'SERVER_IDLE_TIMEOUT_S',
	'SERVER_SHUTDOWN_GRACE_MS',
	'TRUSTED_PROXY_HOPS',
	'DEDALO_DEV_MODE',
	'DEDALO_DEBUG_API_ERRORS',
	'DEDALO_ACCESS_LOG',
	'DEDALO_SLOW_REQUEST_MS',
	'DEDALO_SUPERVISED',
	// systemd facts (read, not configured — they detect supervision)
	'INVOCATION_ID',
	'JOURNAL_STREAM',
	// postgres pool
	'DB_POOL_MAX',
	'DB_POOL_ACQUIRE_TIMEOUT_MS',
	'DB_STATEMENT_TIMEOUT_MS',
	// sessions / login / permissions (the TS-native auth stack)
	'SESSION_TTL_SECONDS',
	'SESSION_ABSOLUTE_TTL_SECONDS',
	'SESSION_COOKIE_SECURE',
	'DEDALO_SESSION_DB_PATH',
	'DEDALO_SESSION_CACHE_EXPIRE',
	'LOGIN_MAX_ATTEMPTS',
	'LOGIN_ATTEMPT_WINDOW',
	'LOGIN_LOCKOUT_SECONDS',
	'LOGIN_ACCOUNT_MAX_ATTEMPTS',
	'PERMISSIONS_CACHE_TTL_SECONDS',
	// menu / areas / defaults
	'AREAS_DENY',
	'APPLICATION_LANGS',
	'DEDALO_SECTION_USERS_TIPO',
	'DEDALO_SEARCH_CLIENT_MAX_LIMIT',
	// media (v7-native knobs)
	'DEDALO_MEDIA_DIR',
	'DEDALO_MEDIA_BASE_URL',
	'DEDALO_MEDIA_ACCESS_MODE',
	'DEDALO_BINARY_BASE',
	'DEDALO_IDENTIFY_PATH',
	'DEDALO_PDFTOHTML_PATH',
	'DEDALO_PDFINFO_PATH',
	'DEDALO_FILE_BIN_PATH',
	'DEDALO_MEDIA_JOB_CONCURRENCY',
	'DEDALO_MEDIA_PROCESSES_DIR',
	'MEDIA_DEV_ROUTE_ENABLED',
	'DEDALO_UPLOAD_TMP_SUBDIR',
	'DEDALO_UPLOAD_MAX_SIZE_BYTES',
	// v6 shipped *_ALTERNATIVE_EXTENSIONS only for image and pdf; v7 has all five.
	'DEDALO_AV_ALTERNATIVE_EXTENSIONS',
	'DEDALO_SVG_ALTERNATIVE_EXTENSIONS',
	'DEDALO_3D_ALTERNATIVE_EXTENSIONS',
	// ops
	'DEDALO_BACKUP_DIR',
	'DEDALO_TRANSFORM_DEFINITIONS_DIR',
	'DEDALO_TS_STATE_PATH',
	// tools
	'DEDALO_ADDITIONAL_TOOLS',
	'TOOLS_ENABLE_REGISTRY_IMPORT',
	'TOOLS_REGISTRY_CACHE_TTL_MS',
	// install
	'DEDALO_INSTALL_ALLOWED_IPS',
	'DEDALO_INSTALL_NO_RESTART',
	'DEDALO_INSTALL_PRIVATE_DIR',
	// diffusion (the native engine)
	'DEDALO_DIFFUSION_NATIVE',
	'DEDALO_DIFFUSION_NATIVE_ELEMENTS',
	'DEDALO_DIFFUSION_FILES_ROOT',
	'DEDALO_DIFFUSION_MAX_RUNNERS',
	'DEDALO_DIFFUSION_SCHEDULER_ENABLED',
	'DEDALO_DIFFUSION_BATCH_ROWS',
	'DEDALO_DIFFUSION_BATCH_RECORDS',
	// error report (WC-017/018/019)
	'DEDALO_ERROR_REPORT_MASTER_URL',
	'DEDALO_ERROR_REPORT_RECEIVER',
	'DEDALO_ERROR_REPORT_TOKEN',
	'DEDALO_ERROR_REPORT_ALLOWED_IPS',
	'DEDALO_ERROR_REPORT_TIMEOUT_MS',
	'DEDALO_ERROR_REPORT_RETENTION_DAYS',
	// RAG / AI / MCP — wholly new subsystems
	'DEDALO_RAG_ENABLED',
	'DEDALO_RAG_DB_HOSTNAME_CONN',
	'DEDALO_RAG_DB_PORT_CONN',
	'DEDALO_RAG_DB_SOCKET_CONN',
	'DEDALO_RAG_DB_USERNAME_CONN',
	'DEDALO_RAG_DB_PASSWORD_CONN',
	'RAG_DB_NAME',
	'DEDALO_RAG_BATCH_SIZE',
	'DEDALO_RAG_PROVIDER_TIMEOUT',
	'DEDALO_RAG_EMBEDDABLE_MODELS',
	'DEDALO_RAG_CHUNK_STRATEGY',
	'DEDALO_RAG_CHUNK_TOKENS',
	'DEDALO_RAG_CHUNK_MIN_TOKENS',
	'DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD',
	'DEDALO_RAG_RRF_K',
	'DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS',
	'ANTHROPIC_API_KEY',
	'AGENT_MODEL',
	'DEDALO_AGENT_MODELS',
	'DEDALO_AGENT_MAX_TOKENS',
	'DEDALO_AGENT_HTTP_ENABLED',
	'DEDALO_AGENT_ALLOW_WRITE',
	'DEDALO_AGENT_WRITE_SECTIONS',
	'DEDALO_AGENT_SYSTEM_PROMPT_APPEND',
	'DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT',
	'DEDALO_MCP_USER_ID',
	'DEDALO_MCP_ALLOW_WRITE',
	'DEDALO_MCP_WRITE_SECTIONS',
	'DEDALO_MCP_MEDIA_IMPORT_DIR',
	'DEDALO_MCP_MEDIA_MAX_BYTES',
	// harness-only (never operator config)
	'PHP_API_BASE_URL',
	'PHP_API_USERNAME',
	'PHP_API_PASSWORD',
	'DIFFUSION_JOBS_TABLE',
	'DIFFUSION_ACTIVITY_TABLE',
	'DIFFUSION_RUNNER_STUB_DELAY_MS',
	// refused at runtime (an anti-pattern guard, not a setting)
	'NODE_TLS_REJECT_UNAUTHORIZED',
];

/** The rule for a legacy constant, or undefined when it is UNKNOWN to the map. */
export function classifyLegacyKey(name: string): MigrationRule | undefined {
	return V6_MIGRATION[name];
}

/**
 * Encode a resolved PHP value for the `.env` line format.
 * Returns null when the key must be SKIPPED (a PHP `null` = "unset", so writing
 * it would pin an empty string over the engine's own default).
 *
 * Arrays and maps go out as JSON: `readListEnv` accepts JSON or a comma list,
 * while `readJsonArray`/`readJsonMap`/`readServerList` accept ONLY JSON — so JSON
 * is the one encoding every v7 reader understands.
 */
export function encodeEnvValue(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return value;
	if (typeof value === 'object') return JSON.stringify(value);
	return null;
}
