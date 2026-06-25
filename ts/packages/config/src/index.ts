/**
 * @dedalo/config — typed, frozen, process-global configuration.
 * Replaces PHP's DEDALO_* constants with a layered-env, Zod-validated Config.
 */

export {
	type Config,
	type DbConfig,
	type MariadbConfig,
	type LangsConfig,
	configSchema,
	zEnvInt,
	zEnvBool,
	zEnvStringList,
	zEnvStringMap,
} from './schema.ts';

export { loadConfig, deepFreeze, ConfigError } from './load.ts';
export { loadConfigFromFiles } from './load_files.ts';
export {
	type RawEnv,
	mergeEnv,
	sanitizeHostname,
	parseEnvFile,
} from './env.ts';
export {
	config,
	isConfigLoaded,
	setConfigForTesting,
	resetConfig,
} from './singleton.ts';
