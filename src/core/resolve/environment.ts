/**
 * Client environment payload (PHP dd_core_api::get_environment) — the
 * {page_globals, plain_vars, get_label} object the copied client injects at
 * boot via set_environment() (see rewrite/client_seam.md):
 * - plain_vars   → window[key] = value (JS globals: urls, flags, DD_TIPOS);
 * - page_globals → Object.assign(page_globals, value) (auth state, langs,
 *   media defaults, feature flags);
 * - get_label    → the localized UI label dictionary.
 *
 * Labels are DB-derived (every dd_ontology node with model 'label': key =
 * properties.name, value = term in the requested lang with the PHP fallback) —
 * exact parity with PHP. The scalar values mirror the install configuration;
 * anything marked [install] is configuration the PHP side reads from its
 * config files — mirrored here (env-overridable where it varies per deploy)
 * and kept honest by the differential gate.
 */

import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import { sql } from '../db/postgres.ts';
import { resolveMediaAccessMode } from '../media/protection.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import type { Principal } from '../security/permissions.ts';
import type { Session } from '../security/session_store.ts';
import { getAdditionalToolsUrlMap } from '../tools/paths.ts';
import { DEDALO_ENGINE_VERSION, DEDALO_VERSION_TRIPLE } from '../update/version.ts';
import { currentApplicationLang, currentDataLang } from './request_lang.ts';
import { getServerState } from './server_state.ts';

/**
 * Dev-mode signal (L5): drives the SHOW_DEBUG / SHOW_DEVELOPER / DEVELOPMENT_SERVER
 * client flags instead of hardcoding them true. Defaults FALSE (production posture);
 * set DEDALO_DEV_MODE=true on a development deployment. Still gated by isLogged so
 * anonymous callers never learn the posture.
 */
const DEV_MODE = readEnv('DEDALO_DEV_MODE', 'false') === 'true';

/** Structure/fallback lang for label terms (PHP DEDALO_STRUCTURE_LANG). */
const STRUCTURE_LANG = config.lang.structureLang;

// Engine version strings come from the ONE source (core/update/version.ts) so
// page_globals/plain_vars and other consumers (the error-report relay stamps
// DEDALO_ENGINE_VERSION, WC-017) cannot drift apart.

/**
 * The DD_TIPOS constant map exposed to the client (PHP get_js_plain_vars —
 * ontology constants client modules resolve by name).
 */
const DD_TIPOS: Readonly<Record<string, string>> = {
	DEDALO_RELATION_TYPE_INDEX_TIPO: 'dd96',
	DEDALO_SECTION_INFO_INVERSE_RELATIONS: 'dd1596',
	DEDALO_RELATION_TYPE_LINK: 'dd151',
	DEDALO_SECTION_RESOURCES_IMAGE_TIPO: 'rsc170',
	DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO: 'rsc29',
};

/** Label dictionary cache per lang (labels change only with ontology updates). */
const labelsCache = createOntologyCache<string, Record<string, string>>();

export function clearEnvironmentCache(): void {
	labelsCache.clear();
}
registerOntologyCacheClearer(clearEnvironmentCache);

/**
 * The localized UI label dictionary. PHP get_lang_labels serves the
 * PRE-GENERATED file core/common/js/lang/<lang>.js (written by
 * backup::write_lang_file from the ontology label terms) — our client sync
 * copies that file, so reading it gives parity by construction, including
 * labels newer than this DB's ontology snapshot. Fallback when the file is
 * absent: rebuild from the DB (every dd_ontology node with model 'label' →
 * {properties.name: term[lang]}, PHP term fallback requested → structure →
 * first non-empty).
 */
export async function getLabels(lang: string): Promise<Record<string, string>> {
	const cached = labelsCache.get(lang);
	if (cached !== undefined) return cached;

	// 1. The generated lang file from the copied client (PHP-served source).
	const langFile = Bun.file(
		new URL(`../../../client/dedalo/core/common/js/lang/${lang}.js`, import.meta.url).pathname,
	);
	if (await langFile.exists()) {
		try {
			const labels = (await langFile.json()) as Record<string, string>;
			labelsCache.set(lang, labels);
			return labels;
		} catch {
			// malformed file — fall through to the DB rebuild
		}
	}

	// 2. DB rebuild (PHP write_lang_file semantics).
	const rows = (await sql`
		SELECT properties->>'name' AS name, term
		FROM dd_ontology
		WHERE model = 'label'
	`) as { name: string | null; term: Record<string, string> | null }[];

	const labels: Record<string, string> = {};
	for (const row of rows) {
		// PHP skips misconfigured label terms (no properties.name) with a log.
		if (row.name === null || row.name === '' || row.term === null) continue;
		const value =
			row.term[lang] ||
			row.term[STRUCTURE_LANG] ||
			Object.values(row.term).find((candidate) => candidate !== '') ||
			null;
		if (value !== null) labels[row.name] = value;
	}
	labelsCache.set(lang, labels);
	return labels;
}

/**
 * JS plain globals (PHP get_js_plain_vars). URL layout matches the PHP deploy.
 * `isLogged` gates the developer/debug flags: an unauthenticated caller (the login
 * form) must not be told the server runs in debug/developer/dev-server mode.
 */
export function buildPlainVars(isLogged: boolean): Record<string, unknown> {
	// DIFFUSION CUTOVER LEVER (DIFFUSION_PLAN P5, spec §2.3): the copied
	// tool_diffusion client calls DEDALO_DIFFUSION_API_URL when defined and
	// falls back to the MAIN API otherwise. While a deployment still routes
	// publications through the OLD engine the key is emitted (PHP parity);
	// setting DEDALO_DIFFUSION_NATIVE=true suppresses it, flipping the
	// byte-identical client onto the native dd_diffusion_api actions with
	// zero client edits. Removal of the old proxy route + internal token
	// follows this flag per-deployment (cutover step 3).
	const nativeDiffusion = readEnv('DEDALO_DIFFUSION_NATIVE') === 'true';
	const serverState = getServerState();
	return {
		DEDALO_ENVIRONMENT: true,
		DEDALO_API_URL: '/dedalo/core/api/v1/json/',
		...(nativeDiffusion ? {} : { DEDALO_DIFFUSION_API_URL: '/dedalo/diffusion/api/v1/' }),
		DEDALO_CORE_URL: '/dedalo/core',
		DEDALO_ROOT_WEB: '/dedalo',
		DEDALO_MEDIA_URL: `/dedalo/${config.mediaDir}`, // PHP: DEDALO_ROOT_WEB . '/' . DEDALO_MEDIA_DIR
		DEDALO_TOOLS_URL: '/dedalo/tools',
		// Additional-root tools only (name → base URL); primary-root tools are
		// absent and fall back to /dedalo/tools/<name> in the client (instances.js).
		DEDALO_TOOLS_URLS: getAdditionalToolsUrlMap(),
		// Developer/debug flags — config-driven (DEDALO_DEV_MODE, default false).
		// SHOW_DEBUG/SHOW_DEVELOPER stay authenticated-only (never advertise the
		// debug posture to anonymous callers). DEVELOPMENT_SERVER must be exposed
		// pre-auth like PHP (get_js_plain_vars emits it unconditionally): the login
		// form reads it BEFORE authentication to pick the no-service-worker cache
		// path on dev servers — gating it on isLogged stalls every dev login
		// (S1-19 register; the flag only reveals dev-vs-prod posture, not debug data).
		SHOW_DEBUG: isLogged && DEV_MODE,
		SHOW_DEVELOPER: isLogged && DEV_MODE,
		DEVELOPMENT_SERVER: DEV_MODE,
		DEDALO_UPLOAD_SERVICE_CHUNK_FILES: config.media.upload.chunkFilesMb,
		DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT: config.media.upload.maxConcurrent,
		DEDALO_LOCK_COMPONENTS: config.features.lockComponents,
		DEDALO_MAINTENANCE_MODE: serverState.maintenance_mode,
		DEDALO_NOTIFICATION:
			typeof serverState.notification === 'string' && serverState.notification !== ''
				? serverState.notification
				: null,
		DEDALO_RR_WORKER: false,
		DD_TIPOS,
	};
}

/**
 * Application langs for the client selector (PHP DEDALO_APPLICATION_LANGS map
 * → [{label, value}] in map order, dd_core_api::get_page_globals shape).
 */
const APPLICATION_LANGS: { label: string; value: string }[] = Object.entries(
	config.lang.applicationLangs,
).map(([value, label]) => ({ label, value }));

/**
 * The page_globals object (PHP get_page_globals): auth state from the session,
 * entity/lang/media configuration from the install.
 */
export async function buildPageGlobals(
	session: Session | null,
	principal: Principal | null,
): Promise<Record<string, unknown>> {
	const isLogged = session !== null;
	// Projects default langs: language metadata rows (PHP caches this list; it
	// comes from the lang catalog — mirrored lazily from the projects config).
	const projectsDefaultLangs = await getProjectsDefaultLangs();
	const serverState = getServerState();

	return {
		dedalo_last_error: null,
		is_logged: isLogged,
		is_global_admin: principal?.isGlobalAdmin ?? false,
		is_developer: principal?.isDeveloper ?? false,
		is_root: (session?.userId ?? null) === -1,
		user_id: session?.userId ?? null,
		username: session?.username ?? null,
		full_username: isLogged ? '' : null, // root has no full name on this install
		dedalo_entity: config.entity, // DEDALO_ENTITY
		dedalo_entity_id: config.identity.entityId, // DEDALO_ENTITY_ID
		// API-03: version strings only for authenticated callers.
		dedalo_version: isLogged ? DEDALO_ENGINE_VERSION : null,
		dedalo_build: isLogged ? '2026-03-14T13:52:19+02:00' : null, // [install]
		mode: 'list',
		// dedalo_application_langs_default is the INSTALL default (PHP
		// DEDALO_APPLICATION_LANGS_DEFAULT); the two live langs reflect the
		// caller's session choice (PHP change_lang → $_SESSION), resolved through
		// the request-scoped language context.
		dedalo_application_langs_default: config.lang.applicationLangsDefault,
		dedalo_application_lang: currentApplicationLang(),
		dedalo_data_lang: currentDataLang(),
		dedalo_data_lang_selector: config.lang.dataLangSelector,
		dedalo_data_lang_sync: config.menu.dataLangSync,
		dedalo_data_nolan: readEnv('DATA_NOLAN', 'lg-nolan'),
		dedalo_application_langs: APPLICATION_LANGS,
		dedalo_projects_default_langs: projectsDefaultLangs,
		dedalo_image_quality_default: config.media.image.defaultQuality,
		dedalo_av_quality_default: config.media.av.defaultQuality,
		dedalo_quality_thumb: config.media.thumb.quality,
		tag_id: null,
		// PHP: media_protection::get_mode()!==false ? 1 : 0. Resolved through the media
		// protection module, NOT read straight off the frozen catalog: the root user can
		// change the mode at runtime from the media_control widget (ts_state.json), and
		// this Bun process lives for weeks — the catalog value would stay stale until a
		// restart and the client would advertise the wrong posture.
		dedalo_protect_media_files: resolveMediaAccessMode() !== false ? 1 : 0,
		DEDALO_NOTIFICATIONS: config.features.notifications ? 1 : 0,
		ip_api: config.features.ipApi,
		fallback_image: '/dedalo/core/themes/default/default.svg',
		locale: config.identity.locale, // DEDALO_LOCALE
		dedalo_date_order: config.identity.dateOrder, // DEDALO_DATE_ORDER
		component_active: null,
		stream_readers: [],
		maintenance_mode: serverState.maintenance_mode,
		dedalo_notification:
			typeof serverState.notification === 'string' && serverState.notification !== ''
				? serverState.notification
				: false,
		recovery_mode: serverState.recovery_mode,
		data_version: DEDALO_VERSION_TRIPLE,
		// Reconnaissance-sensitive engine facts (DB name, exact PG/runtime version,
		// process memory) — AUTHENTICATED callers only. An unauthenticated get_environment
		// must not hand out the database name and precise version strings for targeted
		// CVE selection. Null for the login form (parity with dedalo_version above).
		dedalo_db_name: isLogged ? config.db.database : null,
		pg_version: isLogged ? await getPgVersion() : null,
		php_version: isLogged ? `Bun ${Bun.version}` : null,
		php_memory: isLogged ? `${Math.round(process.memoryUsage().rss / (1024 * 1024))}M rss` : null,
		dedalo_root_path: null,
	};
}

/**
 * Installation diagnostics for the menu About/info panel (PHP
 * menu::get_info_data) — the header info bar prefers these over page_globals.
 * TS-runtime values under the client's field names.
 */
export async function buildInfoData(): Promise<Record<string, unknown>> {
	return {
		dedalo_version: DEDALO_ENGINE_VERSION,
		dedalo_build: '2026-03-14T13:52:19+02:00', // [install]
		dedalo_db_name: config.db.database,
		pg_version: await getPgVersion(),
		php_version: `Bun ${Bun.version}`,
		memory: `${Math.round(process.memoryUsage().rss / (1024 * 1024))}M rss`,
		php_sapi_name: 'bun',
		entity: config.identity.entityLabel, // DEDALO_ENTITY_LABEL (defaults to the entity name)
		php_user: null,
		php_session_handler: 'sqlite',
		pg_db: await getPgVersion(),
		server_software: `Bun.serve ${Bun.version}`,
		ip_server: null,
	};
}

/** PostgreSQL server version (cached — it cannot change under a live pool). */
let pgVersionCache: string | null = null;
async function getPgVersion(): Promise<string> {
	if (pgVersionCache !== null) return pgVersionCache;
	const rows = (await sql`SHOW server_version`) as { server_version: string }[];
	pgVersionCache = rows[0]?.server_version ?? 'unknown';
	return pgVersionCache;
}

/** [install] projects default langs, mirrored from the live capture shape. */
let projectsLangsCache: { label: string; value: string; tld2: string }[] | null = null;
async function getProjectsDefaultLangs(): Promise<
	{ label: string; value: string; tld2: string }[]
> {
	if (projectsLangsCache !== null) return projectsLangsCache;
	// The PHP list is DEDALO_PROJECTS_DEFAULT_LANGS resolved through the lang
	// catalog. Mirrored statically for the mib install (see the gate).
	projectsLangsCache = [
		{ label: 'Nepali', value: 'lg-nep', tld2: 'ne' },
		{ label: 'English', value: 'lg-eng', tld2: 'en' },
		{ label: 'German', value: 'lg-deu', tld2: 'de' },
		{ label: 'French', value: 'lg-fra', tld2: 'fr' },
		{ label: 'Valencià', value: 'lg-vlca', tld2: 'ca' },
		{ label: 'Arabic Cluster', value: 'lg-ara', tld2: 'ar' },
		{ label: 'Catalan', value: 'lg-cat', tld2: 'ca' },
		{ label: 'Greek', value: 'lg-ell', tld2: 'el' },
		{ label: 'Basque', value: 'lg-eus', tld2: 'eu' },
		{ label: 'Italian', value: 'lg-ita', tld2: 'it' },
		{ label: 'Portuguese', value: 'lg-por', tld2: 'pt' },
		{ label: 'Castellano', value: 'lg-spa', tld2: 'es' },
	];
	return projectsLangsCache;
}

/** The full environment response block (PHP get_environment → {result,msg,errors}). */
export async function buildEnvironment(
	session: Session | null,
	principal: Principal | null,
): Promise<Record<string, unknown>> {
	return {
		result: {
			page_globals: await buildPageGlobals(session, principal),
			plain_vars: buildPlainVars(session !== null),
			get_label: await getLabels(currentApplicationLang()),
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}
