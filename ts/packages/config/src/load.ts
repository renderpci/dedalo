/**
 * load.ts — `loadConfig(env)`: the pure, primary API.
 *
 * Takes a flat RawEnv (already host-layered, last-wins; see env.ts), coerces each
 * load-bearing DEDALO_* key to its catalog type, validates with Zod, and returns a
 * deeply-frozen typed Config. Catalog defaults (transcribed from the PHP domain
 * files) fill in keys the env omits; the only truly required key with no safe
 * default (the DB password SECRET) throws a clear, aggregated error when missing.
 *
 * Pure: it reads only the `env` argument — no process.env, no filesystem — so it
 * is trivially testable. File-reading wrappers live in load_files.ts.
 */

import { z } from 'zod';
import type { RawEnv } from './env.ts';
import {
	configSchema,
	zEnvBool,
	zEnvInt,
	zEnvStringList,
	zEnvStringMap,
	type Config,
} from './schema.ts';

/** Error thrown when required keys are missing or any value fails coercion/validation. */
export class ConfigError extends Error {
	public readonly issues: ReadonlyArray<string>;
	constructor(issues: ReadonlyArray<string>) {
		super(
			`Invalid @dedalo/config environment:\n` +
				issues.map((i) => `  - ${i}`).join('\n'),
		);
		this.name = 'ConfigError';
		this.issues = issues;
	}
}

/** Catalog defaults for keys that have a safe default (transcribed from domains/*.php). */
const DEFAULTS = {
	DEDALO_DB_TYPE: 'postgresql',
	DEDALO_HOSTNAME_CONN: 'localhost',
	DEDALO_DB_PORT_CONN: '5432',
	// Catalog defaults from domains/db.php (database ~41, username ~48). These are
	// NOT required in PHP, so TS must boot where PHP boots.
	DEDALO_DATABASE_CONN: 'dedalo_mydatabase',
	DEDALO_USERNAME_CONN: 'myusername',
	DB_BIN_PATH: '/usr/bin/',
	PHP_BIN_PATH: '/usr/bin/php',
	SLOW_QUERY_MS: '6000',
	DEDALO_DB_MANAGEMENT: 'true',
	MYSQL_DEDALO_HOSTNAME_CONN: 'localhost',
	MYSQL_DEDALO_DATABASE_CONN: 'web_dedalo',
	MYSQL_DEDALO_USERNAME_CONN: 'username',
	MYSQL_DEDALO_DB_PORT_CONN: '3306',
	MYSQL_DB_BIN_PATH: '/usr/bin/',
	DEDALO_STRUCTURE_LANG: 'lg-spa',
	DEDALO_APPLICATION_LANGS_DEFAULT: 'lg-eng',
	DEDALO_DATA_LANG_DEFAULT: 'lg-eng',
	DEDALO_ENTITY: 'my_entity_name',
	DEDALO_ENTITY_ID: '0',
	DEVELOPMENT_SERVER: 'false',
	DEDALO_INFORMATION: '',
	DEDALO_ROOT_WEB: '/dedalo',
	DEDALO_DIFFUSION_DOMAIN: 'default',
	DEDALO_DIFFUSION_RESOLVE_LEVELS: '2',
} as const satisfies Record<string, string>;

const DEFAULT_LANGS_JSON = JSON.stringify({
	'lg-eng': 'English',
	'lg-spa': 'Castellano',
});
const DEFAULT_PROJECTS_LANGS_JSON = JSON.stringify(['lg-spa', 'lg-cat', 'lg-eng', 'lg-fra']);
const DEFAULT_PREFIX_TIPOS_JSON = JSON.stringify([
	'dd',
	'rsc',
	'ontology',
	'hierarchy',
	'lg',
	'oh',
	'ich',
	'nexus',
	'actv',
]);
const DEFAULT_IMAGE_EXT_JSON = JSON.stringify([
	'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'psd', 'raw', 'webp', 'heic', 'avif',
]);
const DEFAULT_AV_EXT_JSON = JSON.stringify([
	'mp4', 'wave', 'wav', 'aiff', 'aif', 'mp3', 'mov', 'avi', 'mpg', 'mpeg', 'vob', 'zip', 'flv',
]);
const DEFAULT_PDF_EXT_JSON = JSON.stringify([
	'pdf', 'doc', 'pages', 'odt', 'ods', 'rtf', 'ppt',
]);

/**
 * Required keys (no safe default): missing → ConfigError.
 * Only DEDALO_PASSWORD_CONN is genuinely required — it is a SECRET with no
 * catalog default (db.php:51-57, scope SECRET, env-only). DEDALO_DATABASE_CONN
 * and DEDALO_USERNAME_CONN have catalog defaults (see DEFAULTS) so they are not
 * required.
 */
const REQUIRED = ['DEDALO_PASSWORD_CONN'] as const;

/**
 * Internal: collect issues while coercing one env value with a zEnv helper.
 *
 * The literal string `'null'` (case-insensitive, trimmed) coerces to a real
 * `null` for ANY key/type, mirroring PHP config_caster::cast (config_caster.php:
 * 24-25) which applies the 'null' marker before the per-type match. The caller
 * decides whether null is valid for a given field.
 */
function coerce<T>(
	issues: string[],
	key: string,
	raw: string | undefined,
	schema: z.ZodType<T, z.ZodTypeDef, string>,
	fallback: T,
): T | null {
	if (raw === undefined) {
		return fallback;
	}
	if (raw.trim().toLowerCase() === 'null') {
		return null;
	}
	const result = schema.safeParse(raw);
	if (!result.success) {
		const detail = result.error.issues.map((i) => i.message).join('; ');
		issues.push(`${key}: ${detail} (got ${JSON.stringify(raw)})`);
		return fallback;
	}
	return result.data;
}

/**
 * Validate a raw env map and produce a deeply-frozen, typed Config.
 * Throws `ConfigError` listing every missing-required-key and invalid value.
 */
export function loadConfig(env: RawEnv): Config {
	const issues: string[] = [];

	// Missing required keys (collected, not fail-fast, so the operator sees them all).
	for (const key of REQUIRED) {
		if (env[key] === undefined || env[key] === '') {
			issues.push(`${key} is required but missing`);
		}
	}

	const get = (key: keyof typeof DEFAULTS): string => env[key] ?? DEFAULTS[key];

	// PHP catalog types db.port as 'string' (db.php:23-29); keep it a string and
	// only resolve the 'null' marker to a real null (config_caster parity). An
	// empty string falls back to the catalog default.
	const dbPortRaw = env.DEDALO_DB_PORT_CONN;
	const dbPort: string | null =
		dbPortRaw === undefined || dbPortRaw === ''
			? DEFAULTS.DEDALO_DB_PORT_CONN
			: dbPortRaw.trim().toLowerCase() === 'null'
				? null
				: dbPortRaw;

	// MariaDB port stays an int (mariadb schema). The shared coerce now handles
	// the 'null' marker; an empty string falls back to the catalog default.
	const mysqlPortRaw = env.MYSQL_DEDALO_DB_PORT_CONN;
	const mysqlPort = coerce(
		issues,
		'MYSQL_DEDALO_DB_PORT_CONN',
		mysqlPortRaw === undefined || mysqlPortRaw === ''
			? DEFAULTS.MYSQL_DEDALO_DB_PORT_CONN
			: mysqlPortRaw,
		zEnvInt,
		3306,
	);

	const draft = {
		db: {
			type: get('DEDALO_DB_TYPE'),
			host: get('DEDALO_HOSTNAME_CONN'),
			port: dbPort,
			database: get('DEDALO_DATABASE_CONN'),
			user: get('DEDALO_USERNAME_CONN'),
			password: env.DEDALO_PASSWORD_CONN ?? '',
			...(env.DEDALO_SOCKET_CONN !== undefined ? { socket: env.DEDALO_SOCKET_CONN } : {}),
			binPath: get('DB_BIN_PATH'),
			phpBinPath: get('PHP_BIN_PATH'),
			slowQueryMs: coerce(issues, 'SLOW_QUERY_MS', get('SLOW_QUERY_MS'), zEnvInt, 6000),
			management: coerce(issues, 'DEDALO_DB_MANAGEMENT', get('DEDALO_DB_MANAGEMENT'), zEnvBool, true),
		},
		mariadb: {
			host: get('MYSQL_DEDALO_HOSTNAME_CONN'),
			port: mysqlPort,
			database: get('MYSQL_DEDALO_DATABASE_CONN'),
			user: get('MYSQL_DEDALO_USERNAME_CONN'),
			password: env.MYSQL_DEDALO_PASSWORD_CONN ?? '',
			...(env.MYSQL_DEDALO_SOCKET_CONN !== undefined
				? { socket: env.MYSQL_DEDALO_SOCKET_CONN }
				: {}),
			binPath: get('MYSQL_DB_BIN_PATH'),
		},
		langs: {
			default: get('DEDALO_APPLICATION_LANGS_DEFAULT'),
			dataDefault: get('DEDALO_DATA_LANG_DEFAULT'),
			structureLang: get('DEDALO_STRUCTURE_LANG'),
			available: coerce(
				issues,
				'DEDALO_APPLICATION_LANGS',
				env.DEDALO_APPLICATION_LANGS ?? DEFAULT_LANGS_JSON,
				zEnvStringMap,
				{},
			),
			projectsDefault: coerce(
				issues,
				'DEDALO_PROJECTS_DEFAULT_LANGS',
				env.DEDALO_PROJECTS_DEFAULT_LANGS ?? DEFAULT_PROJECTS_LANGS_JSON,
				zEnvStringList,
				[],
			),
		},
		entity: {
			name: get('DEDALO_ENTITY'),
			id: coerce(issues, 'DEDALO_ENTITY_ID', get('DEDALO_ENTITY_ID'), zEnvInt, 0),
			label: env.DEDALO_ENTITY_LABEL && env.DEDALO_ENTITY_LABEL !== ''
				? env.DEDALO_ENTITY_LABEL
				: get('DEDALO_ENTITY'),
		},
		secrets: {
			saltString: env.DEDALO_SALT_STRING ?? '',
			information: get('DEDALO_INFORMATION'),
		},
		paths: {
			...(env.DEDALO_ROOT_PATH !== undefined ? { root: env.DEDALO_ROOT_PATH } : {}),
			rootWeb: get('DEDALO_ROOT_WEB'),
		},
		media: {
			imageExtensions: coerce(
				issues,
				'DEDALO_IMAGE_EXTENSIONS_SUPPORTED',
				env.DEDALO_IMAGE_EXTENSIONS_SUPPORTED ?? DEFAULT_IMAGE_EXT_JSON,
				zEnvStringList,
				[],
			),
			imageAlternativeExtensions: coerce(
				issues,
				'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS',
				env.DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS ?? '[]',
				zEnvStringList,
				[],
			),
			avExtensions: coerce(
				issues,
				'DEDALO_AV_EXTENSIONS_SUPPORTED',
				env.DEDALO_AV_EXTENSIONS_SUPPORTED ?? DEFAULT_AV_EXT_JSON,
				zEnvStringList,
				[],
			),
			pdfExtensions: coerce(
				issues,
				'DEDALO_PDF_EXTENSIONS_SUPPORTED',
				env.DEDALO_PDF_EXTENSIONS_SUPPORTED ?? DEFAULT_PDF_EXT_JSON,
				zEnvStringList,
				[],
			),
		},
		diffusion: {
			domain: get('DEDALO_DIFFUSION_DOMAIN'),
			resolveLevels: coerce(
				issues,
				'DEDALO_DIFFUSION_RESOLVE_LEVELS',
				get('DEDALO_DIFFUSION_RESOLVE_LEVELS'),
				zEnvInt,
				2,
			),
		},
		development: coerce(issues, 'DEVELOPMENT_SERVER', get('DEVELOPMENT_SERVER'), zEnvBool, false),
		prefixTipos: coerce(
			issues,
			'DEDALO_PREFIX_TIPOS',
			env.DEDALO_PREFIX_TIPOS ?? DEFAULT_PREFIX_TIPOS_JSON,
			zEnvStringList,
			[],
		),
		raw: rawStrings(env),
	};

	if (issues.length > 0) {
		throw new ConfigError(issues);
	}

	const parsed = configSchema.safeParse(draft);
	if (!parsed.success) {
		throw new ConfigError(
			parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
		);
	}

	return deepFreeze(parsed.data);
}

/** Drop undefined values so `raw` is a clean Record<string,string>. */
function rawStrings(env: RawEnv): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of Object.keys(env)) {
		const value = env[key];
		if (value !== undefined) {
			out[key] = value;
		}
	}
	return out;
}

/** Recursively `Object.freeze` an object graph (config is immutable after load). */
export function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const key of Object.keys(value as Record<string, unknown>)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
	}
	return value;
}
