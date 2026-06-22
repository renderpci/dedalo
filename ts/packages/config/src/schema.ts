/**
 * schema.ts — the typed Config Zod schema.
 *
 * Models the load-bearing keys of the PHP config catalog
 * (core/base/config/catalog/domains/*.php), grouped into a nested, typed shape.
 * Each leaf coerces a raw env STRING to its catalog type (int / bool / string /
 * list / map), reproducing PHP's `config_key->type` coercion. Keys we did not
 * promote to first-class fields still survive verbatim in `raw` (escape hatch),
 * so consumers can read any DEDALO_* value during the migration.
 *
 * Coercion rules (matching the PHP catalog + env_loader semantics):
 *   int    : numeric string → number (rejects non-numeric).
 *   bool   : 'true'/'1'/'on'/'yes' → true, 'false'/'0'/'off'/'no'/'' → false.
 *   string : passthrough.
 *   list   : JSON array string → string[].
 *   map    : JSON object string → Record<string,string>.
 */

import { z } from 'zod';

/**
 * Coerce an env string to an integer (PHP `int` type).
 *
 * Note: returns a JS `number` (PHP's `(int)` cast). Values beyond
 * Number.MAX_SAFE_INTEGER lose precision; the promoted int keys (ports, ms,
 * levels, entity id) are all small, so this is not a concern in practice. Use a
 * string-typed key + raw escape hatch if a true bigint is ever needed.
 */
export const zEnvInt = z
	.string()
	.trim()
	.refine((s) => s !== '' && /^[+-]?\d+$/.test(s), {
		message: 'expected an integer string',
	})
	.transform((s) => Number.parseInt(s, 10));

/** Coerce an env string to a boolean (PHP `bool` type — DEVELOPMENT_SERVER etc.). */
export const zEnvBool = z
	.string()
	.trim()
	.transform((s) => s.toLowerCase())
	.pipe(
		z.enum(['true', '1', 'on', 'yes', 'false', '0', 'off', 'no', '']).catch('false'),
	)
	.transform((s) => s === 'true' || s === '1' || s === 'on' || s === 'yes');

/**
 * Coerce a JSON-array env string to string[] (PHP `list` type).
 *
 * Matches PHP config_caster::to_array (config_caster.php:35-44): malformed JSON
 * (or a non-array decode) yields `[]` and the load continues — it never throws.
 */
export const zEnvStringList = z
	.string()
	.transform((s): unknown => {
		try {
			return JSON.parse(s);
		} catch {
			return [];
		}
	})
	.pipe(z.array(z.string()).catch([]));

/**
 * Coerce a JSON-object env string to Record<string,string> (PHP `map` type).
 *
 * Matches PHP config_caster::to_array: malformed JSON (or a non-object decode)
 * yields `{}` and the load continues — it never throws.
 */
export const zEnvStringMap = z
	.string()
	.transform((s): unknown => {
		try {
			return JSON.parse(s);
		} catch {
			return {};
		}
	})
	.pipe(z.record(z.string(), z.string()).catch({}));

/**
 * The typed config schema. Built by `loadConfig` from a RawEnv via `.transform`
 * on the raw env object, so each section pulls the env keys it needs and coerces
 * them. Optional fields use `.optional()` (exactOptionalPropertyTypes-safe: we
 * only set them when the source key is present).
 */
export const dbSchema = z.object({
	type: z.string(),
	host: z.string(),
	// PHP catalog db.php:23-29 declares DEDALO_DB_PORT_CONN type 'string'
	// default '5432'. Keep it a string to match (and tolerate a literal null
	// from the 'null' marker, mirroring config_caster).
	port: z.string().nullable(),
	database: z.string(),
	user: z.string(),
	password: z.string(),
	socket: z.string().optional(),
	binPath: z.string(),
	phpBinPath: z.string(),
	slowQueryMs: z.number().int(),
	management: z.boolean(),
});

export const mariadbSchema = z.object({
	host: z.string(),
	port: z.number().int().nullable(),
	database: z.string(),
	user: z.string(),
	password: z.string(),
	socket: z.string().optional(),
	binPath: z.string(),
});

export const langsSchema = z.object({
	default: z.string(),
	dataDefault: z.string(),
	structureLang: z.string(),
	available: z.record(z.string(), z.string()),
	projectsDefault: z.array(z.string()),
});

export const entitySchema = z.object({
	name: z.string(),
	id: z.number().int(),
	label: z.string(),
});

export const secretsSchema = z.object({
	saltString: z.string(),
	information: z.string(),
});

export const pathsSchema = z.object({
	root: z.string().optional(),
	rootWeb: z.string(),
});

export const mediaSchema = z.object({
	imageExtensions: z.array(z.string()),
	imageAlternativeExtensions: z.array(z.string()),
	avExtensions: z.array(z.string()),
	pdfExtensions: z.array(z.string()),
});

export const diffusionSchema = z.object({
	domain: z.string(),
	resolveLevels: z.number().int(),
});

export const configSchema = z.object({
	db: dbSchema,
	mariadb: mariadbSchema,
	langs: langsSchema,
	entity: entitySchema,
	secrets: secretsSchema,
	paths: pathsSchema,
	media: mediaSchema,
	diffusion: diffusionSchema,
	development: z.boolean(),
	prefixTipos: z.array(z.string()),
	/** Escape hatch: every raw env string, verbatim. Extensible without schema churn. */
	raw: z.record(z.string(), z.string()),
});

export type Config = z.infer<typeof configSchema>;
export type DbConfig = z.infer<typeof dbSchema>;
export type MariadbConfig = z.infer<typeof mariadbSchema>;
export type LangsConfig = z.infer<typeof langsSchema>;
