/**
 * Typed configuration catalog for the Dédalo TS server.
 *
 * This module plays the role the PHP config catalog (DEDALO_* constants) plays,
 * re-expressed as a frozen typed object built once at boot (spec §5).
 *
 * ENFORCED config rule (audit S2-21 — the honest version of the old "ONLY
 * module" claim, which the census falsified):
 *   - Raw `process.env` reads are BANNED outside src/config/ (tripwire:
 *     test/unit/config_env_tripwire.test.ts). The only exemptions are
 *     subprocess env passthrough (spawning children with the whole env) and
 *     the per-file deferred sites named in that tripwire's allowlist.
 *   - Every other module reads env through src/config/env.ts (`readEnv` /
 *     `requireEnv` / `envSnapshot`), which is what restores the documented
 *     precedence chain: real process env > ../private/.env.
 *   - This module is the PREFERRED typed home for boot-stable settings; a
 *     number of subsystems still read their keys via readEnv at call time
 *     (sessions/login, diffusion, RAG). Those shadow keys are being absorbed
 *     incrementally.
 *   - The KEY CENSUS is `src/config/catalog/` — one declaration per key (type,
 *     default, scope, operator prose), which GENERATES install/sample.env and
 *     docs/config/config.md and is gated byte-for-byte by config_docs_tripwire.
 *     (This header used to say the census "lives in ../private/sample.env,
 *     regenerated from source". Both halves were false: nothing regenerated it,
 *     and the file did not exist — the renderer was PHP machinery that was never
 *     ported at the cutover.)
 *
 * Multi-tenancy note: the PHP version routes one deployment to many databases
 * by entity (DEDALO_ENTITY → config_db routing). We start with a single-entity
 * config and keep `entity` in the shape so per-entity routing can be added in
 * the DB layer without changing call sites.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RETIRED_ENV_KEYS, privateDir, projectRoot, readEnv } from './env.ts';
import { INSTALL_MODE, REQUIRED_CONFIG_KEYS } from './install_mode.ts';
import {
	readBool,
	readJsonArray,
	readList,
	readMap,
	readMediaAccessMode,
	readNumber,
	readOptionalList,
	readServerList,
	readString,
	readToolRoots,
	requireList,
	requireMap,
	requireString,
} from './readers.ts';

/** PostgreSQL connection settings (system of record — same DB the PHP server uses). */
export interface DatabaseConfig {
	/** Database name, e.g. 'dedalo_mib_v7'. */
	readonly database: string;
	/**
	 * Host: either a TCP hostname ('localhost') or a unix-socket DIRECTORY
	 * (starts with '/', e.g. '/tmp' — Postgres appends .s.PGSQL.<port> itself).
	 */
	readonly host: string;
	readonly port: number;
	readonly user: string;
	/** Empty string means trust/peer auth (typical local dev over the socket). */
	readonly password: string;
}

export interface ServerConfig {
	/**
	 * Unix socket path Bun.serve listens on; the reverse proxy (Apache/Nginx)
	 * forwards API traffic here (spec §4). TCP is intentionally not offered —
	 * matching the production diffusion-engine pattern.
	 */
	readonly unixSocketPath: string;
}

/** Parity-harness settings: where the live PHP reference API answers. */
export interface PhpReferenceConfig {
	/** Base URL of the PHP JSON API, e.g. 'http://localhost/dedalo/lib/dedalo/core/api/v1/json/'. */
	readonly apiBaseUrl: string | undefined;
	/** Dev credentials used ONLY by the parity harness to log into the PHP server. */
	readonly username: string | undefined;
	readonly password: string | undefined;
}

/** Navigation-menu settings (PHP: area/menu constants, installation-specific). */
export interface MenuConfig {
	/** Label language for area/section titles (PHP DEDALO_APPLICATION_LANG). */
	readonly applicationLang: string;
	/** Default DATA language for component values (PHP DEDALO_DATA_LANG). */
	readonly dataLang: string;
	/**
	 * Couple the interface and data languages (PHP DEDALO_DATA_LANG_SYNC): when
	 * true, changing either language from the menu drives the other. Off by
	 * default (matches page_globals.dedalo_data_lang_sync=false on this install).
	 */
	readonly dataLangSync: boolean;
	/**
	 * Grouping tipos hidden from the menu but whose children are still shown,
	 * re-parented to the first non-skipped ancestor (PHP
	 * DEDALO_ENTITY_MENU_SKIP_TIPOS).
	 */
	readonly skipTipos: readonly string[];
	/** Area tipos removed from the menu entirely (PHP config `areas.deny`). */
	readonly areasDeny: readonly string[];
	/**
	 * Project languages (PHP DEDALO_PROJECTS_DEFAULT_LANGS) — the option set for
	 * component_select_lang and the diffusion langs. `lg-<code>` strings, order
	 * preserved from config (the datalist re-sorts by label).
	 */
	readonly projectsDefaultLangs: readonly string[];
}

/** One extra tools root: a filesystem path plus the same-origin URL it is served at. */
export interface ToolRootConfig {
	/** Absolute filesystem directory holding tool packages. */
	readonly path: string;
	/** Root-relative URL the tools under `path` are served at (e.g. '/custom_tools'). */
	readonly url: string;
}

/** Tools subsystem settings (PHP tool_paths + tools_register config). */
export interface ToolsConfig {
	/**
	 * Extra tool roots for third-party tools (PHP DEDALO_ADDITIONAL_TOOLS). The
	 * in-repo `tools/` root is always index 0 and wins name collisions.
	 */
	readonly additionalRoots: readonly ToolRootConfig[];
	/**
	 * When false (default), importTools runs DRY-RUN only and never writes the
	 * dd1324 registry that the live PHP install shares. Flip to true only after
	 * the registration parity gate is green (see engineering/TOOLS_SPEC.md).
	 */
	readonly enableRegistryImport: boolean;
	/**
	 * TTL (ms) for the registry reader cache. The PHP engine writes dd1324/dd996/
	 * dd234 without notifying us, so the reader cache expires on its own; the TS
	 * write paths still call invalidateAllToolCaches() for immediate freshness.
	 */
	readonly registryCacheTtlMs: number;
}

/** One configured code master (PHP CODE_SERVERS entry). */
export interface CodeServerEntry {
	readonly name: string;
	readonly url: string;
	readonly code: string;
}

/** Update-subsystem settings (rewrite/prompts/UPDATE_PROCESS.md). */
export interface UpdateConfig {
	// (The DEDALO_ENGINE_OWNS_INSTALL standalone-ownership opt-in was deleted
	// at the 2026-07-11 cutover: core/update/ownership.ts collapsed to `true`
	// — PHP engine retired, single-writer. The env key, if still present in
	// the append-only ../private/.env, is simply unread.)
	/** Remote code masters the code-update panel offers (PHP CODE_SERVERS). */
	readonly codeServers: readonly CodeServerEntry[];
	/**
	 * This instance serves code releases to other installations (PHP
	 * IS_A_CODE_SERVER): enables the code-manifest API action + the build twin.
	 * Default false (fail-closed).
	 */
	readonly isCodeServer: boolean;
	/** Directory holding built release archives (PHP DEDALO_CODE_FILES_DIR). */
	readonly codeFilesDir: string | undefined;
	/** Git checkout the build twin archives from (PHP DEDALO_CODE_SERVER_GIT_DIR). */
	readonly codeServerGitDir: string | undefined;
}

/** One configured ontology master (PHP ONTOLOGY_SERVERS entry). */
export interface OntologyServerEntry {
	readonly name: string;
	readonly url: string;
	readonly code: string;
}

/** Ontology update/exchange settings (PHP ONTOLOGY_* constants). */
export interface OntologyIoConfig {
	/** Remote masters the update panel offers (PHP ONTOLOGY_SERVERS). */
	readonly servers: readonly OntologyServerEntry[];
	/**
	 * This instance serves ontology snapshots to other installations (PHP
	 * IS_AN_ONTOLOGY_SERVER): enables the manifest API actions + the IO-dir
	 * file route + the 'Local files' panel entry. Default false (fail-closed).
	 */
	readonly isOntologyServer: boolean;
	/** Access code remote clients must present (PHP ONTOLOGY_SERVER_CODE). */
	readonly serverCode: string | undefined;
	/**
	 * Top-level domains of the ontologies active in this installation
	 * (PHP glossary: DEDALO_PREFIX_TIPOS / defaults.prefix_tipos).
	 */
	readonly activeOntologyTlds: readonly string[];
	/** PHP STRUCTURE_FROM_SERVER passthrough for the update panel (null = unset). */
	readonly structureFromServer: boolean | null;
}

/**
 * One media TYPE's catalog (PHP config domains media_image.php / media_av.php /
 * media_docs.php). Every value here is CONFIGURATION under the PHP `DEDALO_*`
 * key names, .env-overridable, PHP default when unset (engineering/MEDIA_SPEC.md §3).
 * `concepts/media.ts` is the typed accessor over this — modules never hardcode
 * a quality/extension/dimension string.
 */
export interface MediaTypeConfig {
	/** First path segment under the media root, WITH leading slash (DEDALO_*_FOLDER, e.g. '/image'). */
	readonly folder: string;
	/** Normalized default extension the type converts to (DEDALO_*_EXTENSION, e.g. 'jpg'). */
	readonly extension: string;
	/** Ordered quality ladder, high→low (DEDALO_*_AR_QUALITY). */
	readonly qualities: readonly string[];
	/** Default web-delivery quality (DEDALO_*_QUALITY_DEFAULT). */
	readonly defaultQuality: string;
	/** Original (source-of-truth) quality (DEDALO_*_QUALITY_ORIGINAL). */
	readonly originalQuality: string;
	/** Upload allowlist (DEDALO_*_EXTENSIONS_SUPPORTED). */
	readonly allowedExtensions: readonly string[];
	/** Extra derivative extensions built alongside the default (DEDALO_*_ALTERNATIVE_EXTENSIONS). */
	readonly alternateExtensions: readonly string[];
}

/** External media binaries (PHP paths.binary_base + the derived *_PATH consts). */
export interface MediaBinariesConfig {
	/** Platform base dir (PHP paths.binary_base; Darwin '/opt/homebrew/bin' else '/usr/bin'). */
	readonly base: string;
	readonly magick: string; // MAGICK_PATH.'magick'|'convert' (resolved in the adapter)
	readonly identify: string;
	readonly ffmpeg: string; // DEDALO_AV_FFMPEG_PATH
	readonly ffprobe: string; // DEDALO_AV_FFPROBE_PATH
	readonly qtFaststart: string; // DEDALO_AV_FASTSTART_PATH
	readonly pdftotext: string; // PDF_AUTOMATIC_TRANSCRIPTION_ENGINE
	readonly pdftohtml: string;
	readonly pdfinfo: string;
	readonly ocrmypdf: string; // PDF_OCR_ENGINE
	readonly file: string; // libmagic CLI fallback for ambiguous MIME sniffs
}

/** Upload service settings (PHP DEDALO_UPLOAD_SERVICE_* + DEDALO_UPLOAD_TMP_DIR). */
export interface MediaUploadConfig {
	/** Client chunk size in MB (DEDALO_UPLOAD_SERVICE_CHUNK_FILES); 0 = single-shot. */
	readonly chunkFilesMb: number;
	/** Client max concurrent chunk uploads (DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT). */
	readonly maxConcurrent: number;
	/** Staging subdir under the media root (PHP DEDALO_UPLOAD_TMP_DIR = media/upload/service_upload/tmp). */
	readonly tmpSubdir: string;
	/**
	 * Max accepted upload size in bytes, reported by dd_utils_api::get_system_info
	 * so the client can reject oversize files before transfer. PHP derives this
	 * from php.ini (min of post_max_size / upload_max_filesize); the Bun server has
	 * no such ini, so it is an explicit setting (DEDALO_UPLOAD_MAX_SIZE_BYTES).
	 */
	readonly maxSizeBytes: number;
	/** Session cache expiry in minutes, reported verbatim by get_system_info (DEDALO_SESSION_CACHE_EXPIRE). */
	readonly sessionCacheExpire: number;
}

/** The whole media catalog (engineering/MEDIA_SPEC.md §3). */
export interface MediaConfig {
	/**
	 * Absolute filesystem media root (PHP DEDALO_MEDIA_PATH; env MEDIA_PATH).
	 * DERIVED — `<projectRoot>/media` — unless MEDIA_PATH overrides it, mirroring
	 * the PHP constant, which is defined as DEDALO_ROOT_PATH + '/media' and which
	 * private/sample.env documents as "auto-derived; uncomment only to override".
	 * Null is therefore unreachable from env; the type keeps it only so a test can
	 * construct an unconfigured catalog and prove requireMediaRoot still throws.
	 */
	readonly rootPath: string | null;
	/** Absolute-URL prefix for export/relation cells (env DEDALO_MEDIA_BASE_URL). */
	readonly baseUrl: string | undefined;
	readonly image: MediaTypeConfig;
	readonly av: MediaTypeConfig;
	readonly pdf: MediaTypeConfig;
	readonly svg: MediaTypeConfig;
	readonly threeD: MediaTypeConfig; // 'component_3d' — property name can't start with a digit
	/** Shared thumbnail settings (DEDALO_QUALITY_THUMB / DEDALO_THUMB_EXTENSION / DEDALO_IMAGE_THUMB_*). */
	readonly thumb: {
		readonly quality: string;
		readonly extension: string;
		readonly width: number;
		readonly height: number;
	};
	/** AV posterframe + subtitles (DEDALO_AV_POSTERFRAME_EXTENSION / DEDALO_SUBTITLES_FOLDER / DEDALO_AV_SUBTITLES_EXTENSION). */
	readonly avExtras: {
		readonly posterframeExtension: string;
		readonly subtitlesFolder: string;
		readonly subtitlesExtension: string;
	};
	/** Image print DPI (DEDALO_IMAGE_PRINT_DPI). */
	readonly imagePrintDpi: number;
	/** Retouched-image twin quality (PHP DEDALO_IMAGE_QUALITY_RETOUCHED, default 'modified'). */
	readonly imageQualityRetouched: string;
	/**
	 * Rule-B public quality folders (PHP DEDALO_MEDIA_PUBLIC_QUALITIES): the folders an
	 * ANONYMOUS user may read when the record is published. `null` = derive them from
	 * this install's quality catalog (core/media/protection.ts getDefaultPublicQualities).
	 * Whatever is configured, master/work qualities are refused — see getPublicQualities().
	 */
	readonly publicQualities: readonly string[] | null;
	/**
	 * Raw Apache rewrite directives appended to the generated media/.htaccess just before
	 * the final deny (PHP MEDIA_HTACCESS_ADDONS, a JSON array of strings). The operator
	 * owns their syntax; the generator only places them.
	 */
	readonly htaccessAddons: readonly string[];
	readonly binaries: MediaBinariesConfig;
	readonly upload: MediaUploadConfig;
}

/** Install identity facts surfaced to the client (PHP identity.php domain). */
export interface IdentityConfig {
	/**
	 * Human-facing entity label (PHP DEDALO_ENTITY_LABEL — a DERIVED key that
	 * defaults to the entity name). Shown on the login form and About panels.
	 */
	readonly entityLabel: string;
	/** Entity id from the Dédalo registry (PHP DEDALO_ENTITY_ID, default 0). */
	readonly entityId: number;
	/** UI locale, e.g. 'es-ES' (PHP DEDALO_LOCALE). */
	readonly locale: string;
	/** Date component order: dmy|mdy|ymd (PHP DEDALO_DATE_ORDER). */
	readonly dateOrder: string;
}

/** Language catalog settings beyond the per-request langs (PHP lang.php domain). */
export interface LangConfig {
	/**
	 * Ontology structure lang (PHP DEDALO_STRUCTURE_LANG). Only lg-spa is
	 * accepted by upstream ontology exports; used as the label-term fallback.
	 */
	readonly structureLang: string;
	/**
	 * Available application langs, code → label map (PHP DEDALO_APPLICATION_LANGS).
	 * Order is preserved into the client language selector.
	 */
	readonly applicationLangs: Readonly<Record<string, string>>;
	/** Install default application lang (PHP DEDALO_APPLICATION_LANGS_DEFAULT). */
	readonly applicationLangsDefault: string;
	/** Default data lang used as untranslated-term fallback (PHP DEDALO_DATA_LANG_DEFAULT). */
	readonly dataLangDefault: string;
	/** Show/hide the data-lang selector menu (PHP DEDALO_DATA_LANG_SELECTOR). */
	readonly dataLangSelector: boolean;
}

/** Feature switches mirrored from the PHP features.php domain. */
export interface FeaturesConfig {
	/** Enable component locking while users edit fields (PHP DEDALO_LOCK_COMPONENTS). */
	readonly lockComponents: boolean;
	/** Send browser notifications, e.g. current locks (PHP DEDALO_NOTIFICATIONS). */
	readonly notifications: boolean;
	/** Ceiling applied to client-supplied SQO limits (PHP DEDALO_SEARCH_CLIENT_MAX_LIMIT). */
	readonly searchClientMaxLimit: number;
	/** Component tipos excluded from the security-access datalist (PHP DEDALO_AR_EXCLUDE_COMPONENTS). */
	readonly arExcludeComponents: readonly string[];
	/** IP geolocation API descriptor: {url, href, country_code}, $ip substituted (PHP IP_API). */
	readonly ipApi: Readonly<Record<string, string>>;
	/**
	 * Media file access control (PHP DEDALO_MEDIA_ACCESS_MODE resolved through
	 * media_protection::get_mode()): false | 'private' | 'publication'. The
	 * legacy DEDALO_PROTECT_MEDIA_FILES=true is honored as 'private'.
	 */
	readonly mediaAccessMode: 'private' | 'publication' | false;
	/** Default records per page when a read carries no limit (PHP DEDALO_MAX_ROWS_PER_PAGE). */
	readonly maxRowsPerPage: number;
	/** Default project section_id for the projects filter (PHP DEDALO_DEFAULT_PROJECT). */
	readonly defaultProject: number;
	/** Projects filter section tipo (PHP DEDALO_FILTER_SECTION_TIPO_DEFAULT; dd153 = Projects). */
	readonly filterSectionTipo: string;
}

/**
 * Operations posture (audit WS-E: S2-32/33/35/37, S2-17). Every key here is a
 * DEPLOYMENT knob with a safe default — see engineering/PRODUCTION.md for guidance.
 */
export interface OpsConfig {
	/** Emit one structured JSON access-log line per API request (DEDALO_ACCESS_LOG). */
	readonly accessLog: boolean;
	/** Requests slower than this log a warn line, 0 = off (DEDALO_SLOW_REQUEST_MS). */
	readonly slowRequestMs: number;
	/** DB statements slower than this log a warn line, 0 = off (DEDALO_SLOW_QUERY_MS).
	 * Consumed by the db layer (core/db/postgres.ts wiring is WS-A's). */
	readonly slowQueryMs: number;
	/** Postgres pool max per process (DB_POOL_MAX; cross-process budget in PRODUCTION.md). */
	readonly dbPoolMax: number;
	/** Max ms a query may QUEUE for a pooled connection before erroring, 0 = wait
	 * forever — the pre-audit behavior (DB_POOL_ACQUIRE_TIMEOUT_MS). */
	readonly dbAcquireTimeoutMs: number;
	/** Server-side statement_timeout ms, 0 = off (DB_STATEMENT_TIMEOUT_MS).
	 * PRODUCTION.md recommends a non-zero value in production. */
	readonly dbStatementTimeoutMs: number;
	/** Bun.serve idleTimeout SECONDS for both listeners (SERVER_IDLE_TIMEOUT_S).
	 * Bun's default 10 s killed any slow request on the TCP listener (S2-33);
	 * 255 is Bun's maximum. */
	readonly idleTimeoutSeconds: number;
	/** Graceful-shutdown drain budget in ms (SERVER_SHUTDOWN_GRACE_MS). */
	readonly shutdownGraceMs: number;
	/** Backup directory override (DEDALO_BACKUP_DIR); default derives from privateDir. */
	readonly backupDir: string | undefined;
	/** Directory holding pg_dump (DEDALO_PG_BIN_PATH); default probes Homebrew + PATH. */
	readonly pgBinPath: string | undefined;
	/** Min hours between backups — the make_backup throttle window (PHP DEDALO_BACKUP_TIME_RANGE). */
	readonly backupTimeRangeHours: number;
	/**
	 * Base directory of the ontology data IO exchange (PHP ONTOLOGY_DATA_IO_DIR
	 * = DEDALO_INSTALL_PATH.'/import/ontology'). A DERIVED key: defaults to the
	 * TS server's OWN install tree (<repo>/install/import/ontology — the TS
	 * port is self-contained, never the PHP install's dir). The versioned
	 * `<major>.<minor>` subdir is appended at write time by
	 * core/ontology/data_io.ts setOntologyIoPath().
	 */
	readonly ontologyDataIoDir: string;
	/**
	 * TS-owned home for the move_* transform definition JSON files
	 * (UPDATE_PROCESS Phase 5; PHP core/base/transform_definition_files).
	 * Defaults to <projectRoot>/install/transform_definition_files. undefined
	 * only if explicitly blanked.
	 */
	readonly transformDefinitionsDir: string | undefined;
}

/**
 * Error-report relay + intake (tool_error_report → the master installation;
 * WC-017/018/019). Sender side: masterApiUrl/token/relayTimeoutMs drive the
 * outbound relay. Receiver side (only the designated master): receiverEnabled/
 * allowedIps/token/retentionDays gate + bound the pre-auth intake action
 * (dd_error_report_api:receive_report — see src/core/error_report/).
 */
export interface ErrorReportConfig {
	/**
	 * Master installation JSON API endpoint the relay POSTs reports to
	 * (DEDALO_ERROR_REPORT_MASTER_URL, e.g. https://master.example/dedalo/core/api/v1/json/).
	 * Set ⇒ the sender relay is enabled (no separate flag). https-only; plain
	 * http is accepted for loopback dev targets.
	 */
	readonly masterApiUrl: string | undefined;
	/** Expose the pre-auth intake action on THIS server (DEDALO_ERROR_REPORT_RECEIVER).
	 * Default false — only the designated master flips it on. */
	readonly receiverEnabled: boolean;
	/**
	 * Optional shared per-master-deployment secret (DEDALO_ERROR_REPORT_TOKEN):
	 * the sender relays it as the X-Dedalo-Report-Token header; the receiver
	 * requires it when set. A spam filter, NEVER an authentication factor —
	 * every payload field stays untrusted regardless (SECURITY_DECISIONS).
	 */
	readonly token: string | undefined;
	/** Optional comma-separated intake IP allowlist (DEDALO_ERROR_REPORT_ALLOWED_IPS),
	 * install-gate style with a 'loopback' shorthand; unset = open (the intake is
	 * still throttled + size-capped). */
	readonly allowedIps: string | undefined;
	/** Outbound relay abort timeout in ms (DEDALO_ERROR_REPORT_TIMEOUT_MS, min 1000). */
	readonly relayTimeoutMs: number;
	/** Days received reports are retained before the opportunistic prune deletes
	 * older rows (DEDALO_ERROR_REPORT_RETENTION_DAYS, 0 = keep forever). */
	readonly retentionDays: number;
}

export interface DedaloConfig {
	/**
	 * INSTALL MODE (DEC-19 TS-native install): true when the server boots with
	 * NONE of the four required keys (ENTITY/DB_NAME/DB_HOST/DB_USER) set and the
	 * install is not yet sealed — a fresh, unconfigured machine. In this mode the
	 * required keys carry sentinels (no `.env` exists to satisfy `requireEnv`),
	 * the server serves ONLY the install wizard, and boot skips DB-dependent work.
	 * A PARTIAL config (some but not all required keys) still throws — that is an
	 * operator error, not a fresh install. Cleared (false) once `.env` is written
	 * and the process restarts. See src/core/install/ and engineering/PRODUCTION.md §7.
	 */
	readonly installMode: boolean;
	/** Instance identifier (PHP: DEDALO_ENTITY), e.g. 'mib'. */
	readonly entity: string;
	/** Default section the client lands on after login (PHP MAIN_FALLBACK_SECTION). */
	readonly mainSection: string;
	/**
	 * Media directory/URL folder name (PHP DEDALO_MEDIA_DIR, default 'media').
	 * DEDALO_MEDIA_URL derives from it: '/dedalo/<mediaDir>'. Legacy installs
	 * override it (e.g. 'media_mib') so diffused media URLs stay byte-identical.
	 */
	readonly mediaDir: string;
	/**
	 * Ontology tipo of the users section (PHP DEDALO_SECTION_USERS_TIPO, default
	 * 'dd128'). Holds user records incl. password hashes — the raw-view endpoint
	 * denies raw reads of it. Config-driven so a reconfigured install stays covered.
	 */
	readonly usersSectionTipo: string;
	/**
	 * Map tile backend for component_geolocation (PHP DEDALO_GEO_PROVIDER, default
	 * 'VARIOUS'). Emitted in the geolocation edit context as features.geo_provider;
	 * the client map widget selects its Leaflet tile layer from it. An instance
	 * properties.geo_provider overrides it per component.
	 */
	readonly geoProvider: string;
	/**
	 * IANA timezone all DB timestamps are stamped in (PHP DEDALO_TIMEZONE,
	 * identity.timezone catalog default 'Europe/Madrid'). PHP sets it via
	 * date_default_timezone_set at bootstrap; the TS twin is db/db_timestamp.ts
	 * — matrix_time_machine.timestamp text-sorts, so both engines MUST stamp
	 * the same wall clock.
	 */
	readonly timezone: string;
	readonly db: DatabaseConfig;
	readonly server: ServerConfig;
	readonly phpReference: PhpReferenceConfig;
	readonly menu: MenuConfig;
	readonly identity: IdentityConfig;
	readonly lang: LangConfig;
	readonly features: FeaturesConfig;
	readonly tools: ToolsConfig;
	readonly update: UpdateConfig;
	readonly ontologyIo: OntologyIoConfig;
	readonly media: MediaConfig;
	readonly ops: OpsConfig;
	readonly errorReport: ErrorReportConfig;
}

/**
 * The media catalog, built once from env with the PHP defaults (config domains
 * media_image.php / media_av.php / media_docs.php). engineering/MEDIA_SPEC.md §3.
 */
function buildMediaConfig(): MediaConfig {
	// MEDIA_PATH is a COMPUTED default in PHP, not an installer-written key: the
	// DEDALO_MEDIA_PATH constant is defined as DEDALO_ROOT_PATH + '/media', and
	// private/sample.env marks it "auto-derived; uncomment only to override" —
	// which is why no installer step writes it. The port dropped that derivation
	// and left rootPath null, so on EVERY fresh install the first read of a section
	// holding a media component threw "MEDIA_PATH is not configured" — and the media
	// test tier skips itself when the key is unset, so no gate ever saw it. The
	// literal 'media' matches PHP: the folder NAME config (DEDALO_MEDIA_DIR) drives
	// the URL, not this filesystem path.
	const mediaPath = readEnv('MEDIA_PATH');
	const mediaRoot =
		mediaPath !== undefined && mediaPath !== '' ? mediaPath : join(projectRoot, 'media');
	// The `bin(key, name)` helper is gone: each binary key now declares its own computed
	// default (`<DEDALO_BINARY_BASE>/<name>`) in src/config/catalog/media.ts, so the census
	// can print it and readString resolves it.
	return Object.freeze({
		rootPath: mediaRoot,
		baseUrl: readEnv('DEDALO_MEDIA_BASE_URL'),
		image: Object.freeze({
			folder: readString('DEDALO_IMAGE_FOLDER'),
			extension: readString('DEDALO_IMAGE_EXTENSION'),
			qualities: readList('DEDALO_IMAGE_AR_QUALITY'),
			defaultQuality: readString('DEDALO_IMAGE_QUALITY_DEFAULT'),
			originalQuality: readString('DEDALO_IMAGE_QUALITY_ORIGINAL'),
			allowedExtensions: readList('DEDALO_IMAGE_EXTENSIONS_SUPPORTED'),
			alternateExtensions: readList('DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS'),
		}),
		av: Object.freeze({
			folder: readString('DEDALO_AV_FOLDER'),
			extension: readString('DEDALO_AV_EXTENSION'),
			qualities: readList('DEDALO_AV_AR_QUALITY'),
			defaultQuality: readString('DEDALO_AV_QUALITY_DEFAULT'),
			originalQuality: readString('DEDALO_AV_QUALITY_ORIGINAL'),
			allowedExtensions: readList('DEDALO_AV_EXTENSIONS_SUPPORTED'),
			alternateExtensions: readList('DEDALO_AV_ALTERNATIVE_EXTENSIONS'),
		}),
		pdf: Object.freeze({
			folder: readString('DEDALO_PDF_FOLDER'),
			extension: readString('DEDALO_PDF_EXTENSION'),
			qualities: readList('DEDALO_PDF_AR_QUALITY'),
			defaultQuality: readString('DEDALO_PDF_QUALITY_DEFAULT'),
			originalQuality: readString('DEDALO_PDF_QUALITY_ORIGINAL'),
			allowedExtensions: readList('DEDALO_PDF_EXTENSIONS_SUPPORTED'),
			alternateExtensions: readList('DEDALO_PDF_ALTERNATIVE_EXTENSIONS'),
		}),
		svg: Object.freeze({
			folder: readString('DEDALO_SVG_FOLDER'),
			extension: readString('DEDALO_SVG_EXTENSION'),
			qualities: readList('DEDALO_SVG_AR_QUALITY'),
			defaultQuality: readString('DEDALO_SVG_QUALITY_DEFAULT'),
			originalQuality: readString('DEDALO_SVG_QUALITY_ORIGINAL'),
			allowedExtensions: readList('DEDALO_SVG_EXTENSIONS_SUPPORTED'),
			alternateExtensions: readList('DEDALO_SVG_ALTERNATIVE_EXTENSIONS'),
		}),
		threeD: Object.freeze({
			folder: readString('DEDALO_3D_FOLDER'),
			extension: readString('DEDALO_3D_EXTENSION'),
			qualities: readList('DEDALO_3D_AR_QUALITY'),
			defaultQuality: readString('DEDALO_3D_QUALITY_DEFAULT'),
			originalQuality: readString('DEDALO_3D_QUALITY_ORIGINAL'),
			allowedExtensions: readList('DEDALO_3D_EXTENSIONS_SUPPORTED'),
			alternateExtensions: readList('DEDALO_3D_ALTERNATIVE_EXTENSIONS'),
		}),
		thumb: Object.freeze({
			quality: readString('DEDALO_QUALITY_THUMB'),
			extension: readString('DEDALO_THUMB_EXTENSION'),
			width: readNumber('DEDALO_IMAGE_THUMB_WIDTH'),
			height: readNumber('DEDALO_IMAGE_THUMB_HEIGHT'),
		}),
		avExtras: Object.freeze({
			posterframeExtension: readString('DEDALO_AV_POSTERFRAME_EXTENSION'),
			subtitlesFolder: readString('DEDALO_SUBTITLES_FOLDER'),
			subtitlesExtension: readString('DEDALO_AV_SUBTITLES_EXTENSION'),
		}),
		imagePrintDpi: readNumber('DEDALO_IMAGE_PRINT_DPI'),
		imageQualityRetouched: readString('DEDALO_IMAGE_QUALITY_RETOUCHED'),
		// null (unset) is MEANINGFUL: it means "derive the defaults from this install's
		// quality catalog", which is not the same as an explicitly EMPTY list (= no folder
		// is public, so rule B allows nothing).
		publicQualities: readOptionalList('DEDALO_MEDIA_PUBLIC_QUALITIES'),
		// JSON-ONLY (never readListEnv): these are raw Apache directives, and a directive
		// legitimately contains commas — `RewriteRule ^ - [R=404,L]`. readListEnv falls back
		// to comma-splitting whenever JSON.parse throws, which it does on the natural
		// single-escaped regex (`^10\.0\.`), so a typo would shred one directive into two
		// garbage lines and write them verbatim into a LIVE .htaccess — 500-ing the whole
		// media directory. readJsonArrayEnv refuses and logs instead.
		htaccessAddons: readJsonArray('MEDIA_HTACCESS_ADDONS'),
		binaries: Object.freeze({
			base: readString('DEDALO_BINARY_BASE'),
			magick: readString('DEDALO_MAGICK_PATH'),
			identify: readString('DEDALO_IDENTIFY_PATH'),
			ffmpeg: readString('DEDALO_AV_FFMPEG_PATH'),
			ffprobe: readString('DEDALO_AV_FFPROBE_PATH'),
			qtFaststart: readString('DEDALO_AV_FASTSTART_PATH'),
			pdftotext: readString('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE'),
			pdftohtml: readString('DEDALO_PDFTOHTML_PATH'),
			pdfinfo: readString('DEDALO_PDFINFO_PATH'),
			ocrmypdf: readString('PDF_OCR_ENGINE'),
			file: readString('DEDALO_FILE_BIN_PATH'),
		}),
		upload: Object.freeze({
			chunkFilesMb: readNumber('DEDALO_UPLOAD_SERVICE_CHUNK_FILES'),
			maxConcurrent: readNumber('DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT'),
			tmpSubdir: readString('DEDALO_UPLOAD_TMP_SUBDIR'),
			maxSizeBytes: readNumber('DEDALO_UPLOAD_MAX_SIZE_BYTES'),
			sessionCacheExpire: readNumber('DEDALO_SESSION_CACHE_EXPIRE'),
		}),
	});
}

// A retired spelling configures NOTHING (see RETIRED_ENV_KEYS in env.ts): left in
// place it would silently fall back to the new key's default — e.g. an empty
// ACTIVE_ONTOLOGY_TLDS shrinks the update panel's manifest to ontology/
// ontologytype alone. Refuse to boot instead, naming the one line to edit.
for (const [retired, replacement] of Object.entries(RETIRED_ENV_KEYS)) {
	if (readEnv(replacement) === undefined && readEnv(retired) !== undefined) {
		throw new Error(
			`Config key '${retired}' is RETIRED: rename that line to '${replacement}' in ../private/.env. See private/sample.env.`,
		);
	}
}

/**
 * Build the config once at import time and freeze it. A boot failure here is a
 * feature: a misconfigured server must refuse to start, not limp along — UNLESS
 * it is a fresh, unconfigured machine (install mode), where the required keys
 * carry sentinels so the install wizard can boot.
 */
export const config: DedaloConfig = Object.freeze({
	installMode: INSTALL_MODE,
	entity: requireString('ENTITY'),
	mainSection: readString('MAIN_SECTION'),
	mediaDir: readString('DEDALO_MEDIA_DIR'),
	geoProvider: readString('DEDALO_GEO_PROVIDER'),
	timezone: readString('DEDALO_TIMEZONE'),
	usersSectionTipo: readString('DEDALO_SECTION_USERS_TIPO'),
	db: Object.freeze({
		database: requireString('DB_NAME'),
		host: requireString('DB_HOST'),
		port: Number(readString('DB_PORT')),
		user: requireString('DB_USER'),
		password: readString('DB_PASSWORD'),
	}),
	server: Object.freeze({
		unixSocketPath: readString('SERVER_UNIX_SOCKET'),
	}),
	phpReference: Object.freeze({
		apiBaseUrl: readEnv('PHP_API_BASE_URL'),
		username: readEnv('PHP_API_USERNAME'),
		password: readEnv('PHP_API_PASSWORD'),
	}),
	menu: Object.freeze({
		applicationLang: readString('APPLICATION_LANG'),
		dataLang: readString('DATA_LANG'),
		dataLangSync: readString('DATA_LANG_SYNC') === 'true',
		skipTipos: Object.freeze(readJsonArray('MENU_SKIP_TIPOS')),
		areasDeny: Object.freeze(readJsonArray('AREAS_DENY')),
		// Project languages are INSTALL configuration (owner rule 2026-07-09):
		// required from ../private/.env DEDALO_PROJECTS_DEFAULT_LANGS (must match
		// the PHP oracle's config), never a hardcoded list — the string-family
		// lang-fallback chain and the diffusion lang catalog derive from it.
		projectsDefaultLangs: requireList('PROJECTS_DEFAULT_LANGS'),
	}),
	identity: Object.freeze({
		// PHP derives the label from the entity name when unset — same here.
		entityLabel: readString('DEDALO_ENTITY_LABEL'),
		entityId: readNumber('DEDALO_ENTITY_ID'),
		locale: readString('DEDALO_LOCALE'),
		dateOrder: readString('DEDALO_DATE_ORDER'),
	}),
	lang: Object.freeze({
		structureLang: readString('DEDALO_STRUCTURE_LANG'),
		// LANGUAGE definitions are INSTALL configuration (owner rule 2026-07-09):
		// required from ../private/.env (PHP key names), never hardcoded lists.
		// The single-lang sentinels below exist ONLY for the pre-.env install
		// wizard boot; the wizard persists the real values.
		applicationLangs: requireMap('DEDALO_APPLICATION_LANGS'),
		applicationLangsDefault: requireString('DEDALO_APPLICATION_LANGS_DEFAULT'),
		dataLangDefault: requireString('DEDALO_DATA_LANG_DEFAULT'),
		dataLangSelector: readString('DEDALO_DATA_LANG_SELECTOR') === 'true',
	}),
	features: Object.freeze({
		lockComponents: readString('DEDALO_LOCK_COMPONENTS') === 'true',
		notifications: readString('DEDALO_NOTIFICATIONS') === 'true',
		searchClientMaxLimit: Math.max(1, readNumber('DEDALO_SEARCH_CLIENT_MAX_LIMIT')),
		arExcludeComponents: readList('DEDALO_AR_EXCLUDE_COMPONENTS'),
		ipApi: readMap('IP_API'),
		mediaAccessMode: readMediaAccessMode(),
		maxRowsPerPage: Math.max(1, readNumber('DEDALO_MAX_ROWS_PER_PAGE')),
		defaultProject: readNumber('DEDALO_DEFAULT_PROJECT'),
		filterSectionTipo: readString('DEDALO_FILTER_SECTION_TIPO_DEFAULT'),
	}),
	tools: Object.freeze({
		additionalRoots: Object.freeze(readToolRoots('DEDALO_ADDITIONAL_TOOLS')),
		enableRegistryImport: readString('TOOLS_ENABLE_REGISTRY_IMPORT') === 'true',
		registryCacheTtlMs: Number(readString('TOOLS_REGISTRY_CACHE_TTL_MS')),
	}),
	update: Object.freeze({
		codeServers: readServerList('CODE_SERVERS'),
		isCodeServer: readString('IS_A_CODE_SERVER') === 'true',
		codeFilesDir: readEnv('DEDALO_CODE_FILES_DIR'),
		codeServerGitDir: readEnv('DEDALO_CODE_SERVER_GIT_DIR'),
	}),
	ontologyIo: Object.freeze({
		servers: readServerList('ONTOLOGY_SERVERS'),
		isOntologyServer: readString('IS_AN_ONTOLOGY_SERVER') === 'true',
		serverCode: readEnv('ONTOLOGY_SERVER_CODE'),
		activeOntologyTlds: readList('ACTIVE_ONTOLOGY_TLDS'),
		structureFromServer: (() => {
			const raw = readEnv('STRUCTURE_FROM_SERVER');
			return raw === undefined ? null : raw === 'true';
		})(),
	}),
	media: buildMediaConfig(),
	ops: Object.freeze({
		accessLog: readString('DEDALO_ACCESS_LOG') === 'true',
		slowRequestMs: readNumber('DEDALO_SLOW_REQUEST_MS'),
		slowQueryMs: readNumber('DEDALO_SLOW_QUERY_MS'),
		dbPoolMax: Math.max(1, readNumber('DB_POOL_MAX')),
		dbAcquireTimeoutMs: Math.max(0, readNumber('DB_POOL_ACQUIRE_TIMEOUT_MS')),
		dbStatementTimeoutMs: Math.max(0, readNumber('DB_STATEMENT_TIMEOUT_MS')),
		idleTimeoutSeconds: Math.min(255, Math.max(1, readNumber('SERVER_IDLE_TIMEOUT_S'))),
		shutdownGraceMs: Math.max(0, readNumber('SERVER_SHUTDOWN_GRACE_MS')),
		backupDir: readEnv('DEDALO_BACKUP_DIR'),
		pgBinPath: readEnv('DEDALO_PG_BIN_PATH'),
		backupTimeRangeHours: Math.max(0, readNumber('DEDALO_BACKUP_TIME_RANGE')),
		ontologyDataIoDir: readString('ONTOLOGY_DATA_IO_DIR'),
		transformDefinitionsDir: readString('DEDALO_TRANSFORM_DEFINITIONS_DIR'),
	}),
	errorReport: Object.freeze({
		masterApiUrl: readEnv('DEDALO_ERROR_REPORT_MASTER_URL'),
		receiverEnabled: readString('DEDALO_ERROR_REPORT_RECEIVER') === 'true',
		token: readEnv('DEDALO_ERROR_REPORT_TOKEN'),
		allowedIps: readEnv('DEDALO_ERROR_REPORT_ALLOWED_IPS'),
		relayTimeoutMs: Math.max(1000, readNumber('DEDALO_ERROR_REPORT_TIMEOUT_MS')),
		retentionDays: Math.max(0, readNumber('DEDALO_ERROR_REPORT_RETENTION_DAYS')),
	}),
});
