/**
 * Tool configuration resolution (PHP tool_common::get_config / get_config_value
 * + tools_register::get_all_config / get_all_default_config / filter_client_config).
 *
 * A tool's effective configuration is resolved PER KEY with this precedence:
 *   1. the per-install config    (dd996 records, component dd999)
 *   2. the register default       (dd1324 records, component dd1633)
 *   3. the caller-supplied default
 * Both config blobs are stored as a json component: misc.<tipo>[0].value is the
 * config OBJECT keyed by option name. An option's value may be a bare scalar or
 * an object `{ value, client, ... }` — in the object form the effective value is
 * `.value` and `client === true` marks it as safe to expose to the browser.
 *
 * SECURITY: only keys flagged `"client": true` are returned by the *ClientConfig
 * helpers. Everything else (API keys, engine URIs, secrets) stays server-side.
 * The client filter is what a tool's context carries to the browser (per-tool),
 * NOT the environment payload — PHP does not put tool config in plain_vars.
 */

import { sql } from '../db/postgres.ts';
import { TIPO, TOOLS_CONFIG_SECTION_TIPO, TOOLS_REGISTER_SECTION_TIPO } from './ontology_map.ts';

/** A per-tool config object (option name → scalar or {value, client, …}). */
type ConfigObject = Record<string, unknown>;
/** name → config object (or null when the record has no config). */
type ConfigMap = Map<string, ConfigObject | null>;

let defaultConfigCache: ConfigMap | null = null;
let installConfigCache: ConfigMap | null = null;

/** Reset the config caches (called by invalidateAllToolCaches). */
export function resetConfigCache(): void {
	defaultConfigCache = null;
	installConfigCache = null;
}

/**
 * Read a config map from a matrix_tools section: {tool name → config object}.
 * `configTipo` is the json component holding the config (dd1633 for defaults on
 * dd1324, dd999 for install config on dd996).
 */
async function readConfigMap(sectionTipo: string, configTipo: string): Promise<ConfigMap> {
	const rows = (await sql`
		SELECT string->${TIPO.NAME} AS name_items, misc->${configTipo} AS config_items
		FROM matrix_tools
		WHERE section_tipo = ${sectionTipo}
	`) as {
		name_items: { value?: string }[] | null;
		config_items: { value?: unknown }[] | null;
	}[];
	const map: ConfigMap = new Map();
	for (const row of rows) {
		const name = row.name_items?.[0]?.value;
		if (name === undefined || name === '') continue;
		const value = row.config_items?.[0]?.value;
		map.set(name, value !== undefined && value !== null ? (value as ConfigObject) : null);
	}
	return map;
}

/** All tools' register default config (dd1324 / dd1633), cached. */
async function getAllDefaultConfig(): Promise<ConfigMap> {
	if (defaultConfigCache !== null) return defaultConfigCache;
	defaultConfigCache = await readConfigMap(TOOLS_REGISTER_SECTION_TIPO, TIPO.DEFAULT_CONFIG);
	return defaultConfigCache;
}

/** All tools' per-install config (dd996 / dd999), cached. */
async function getAllInstallConfig(): Promise<ConfigMap> {
	if (installConfigCache !== null) return installConfigCache;
	installConfigCache = await readConfigMap(TOOLS_CONFIG_SECTION_TIPO, TIPO.CONFIG);
	return installConfigCache;
}

/** The effective value of one config option (PHP: object → `.value ?? prop`). */
function resolveOption(config: ConfigObject | null, key: string): unknown {
	if (config === null || !Object.hasOwn(config, key)) return undefined;
	const prop = config[key];
	if (prop !== null && typeof prop === 'object' && 'value' in prop) {
		return (prop as { value: unknown }).value;
	}
	return prop;
}

/**
 * Resolve one tool config value (PHP get_config_value): install → register
 * default → caller default. Returns `fallback` when neither layer defines it.
 */
export async function getToolConfigValue<T = unknown>(
	toolName: string,
	key: string,
	fallback: T,
): Promise<T> {
	const install = resolveOption((await getAllInstallConfig()).get(toolName) ?? null, key);
	if (install !== undefined) return install as T;
	const registerDefault = resolveOption((await getAllDefaultConfig()).get(toolName) ?? null, key);
	if (registerDefault !== undefined) return registerDefault as T;
	return fallback;
}

/**
 * The whole effective config for a tool (PHP get_config): every key defined by
 * the register default or the install config, install winning per key, resolved
 * to effective values.
 */
export async function getToolConfig(toolName: string): Promise<Record<string, unknown>> {
	const defaults = (await getAllDefaultConfig()).get(toolName) ?? null;
	const install = (await getAllInstallConfig()).get(toolName) ?? null;
	const keys = new Set<string>([
		...(defaults !== null ? Object.keys(defaults) : []),
		...(install !== null ? Object.keys(install) : []),
	]);
	const merged: Record<string, unknown> = {};
	for (const key of keys) {
		const installValue = resolveOption(install, key);
		merged[key] = installValue !== undefined ? installValue : resolveOption(defaults, key);
	}
	return merged;
}

/**
 * The client-visible config as RAW prop objects (PHP filter_client_config, used
 * by the tool element context): each client:true key maps to its FULL
 * definition object `{ type, value, client, default, … }`, install winning per
 * key — NOT resolved to `.value`. Empty when the tool has no client config.
 */
export async function getToolClientConfigRaw(toolName: string): Promise<Record<string, unknown>> {
	const defaults = (await getAllDefaultConfig()).get(toolName) ?? null;
	const install = (await getAllInstallConfig()).get(toolName) ?? null;
	const keys = new Set<string>([
		...(defaults !== null ? Object.keys(defaults) : []),
		...(install !== null ? Object.keys(install) : []),
	]);
	const raw: Record<string, unknown> = {};
	for (const key of keys) {
		if (!isClientProp(install, key) && !isClientProp(defaults, key)) continue;
		raw[key] =
			install !== null && Object.hasOwn(install, key) ? install[key] : (defaults?.[key] ?? null);
	}
	return raw;
}

/** True when a config option is flagged client-visible (`client === true`). */
function isClientProp(config: ConfigObject | null, key: string): boolean {
	if (config === null) return false;
	const prop = config[key];
	return (
		prop !== null && typeof prop === 'object' && (prop as { client?: unknown }).client === true
	);
}

/**
 * The CLIENT-VISIBLE subset of a tool's config (PHP filter_client_config): only
 * options flagged `"client": true` in either layer, resolved (install winning).
 * This is what a tool's context may carry to the browser — never secrets.
 */
export async function getToolClientConfig(toolName: string): Promise<Record<string, unknown>> {
	const defaults = (await getAllDefaultConfig()).get(toolName) ?? null;
	const install = (await getAllInstallConfig()).get(toolName) ?? null;
	const keys = new Set<string>([
		...(defaults !== null ? Object.keys(defaults) : []),
		...(install !== null ? Object.keys(install) : []),
	]);
	const clientConfig: Record<string, unknown> = {};
	for (const key of keys) {
		// A key is client-visible if EITHER layer flags it client:true.
		if (!isClientProp(install, key) && !isClientProp(defaults, key)) continue;
		const installValue = resolveOption(install, key);
		clientConfig[key] = installValue !== undefined ? installValue : resolveOption(defaults, key);
	}
	return clientConfig;
}
