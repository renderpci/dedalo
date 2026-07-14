/**
 * INSTALL MODE (DEC-19) — is this a fresh box, or a configured one?
 *
 * Lifted out of `config.ts` so the catalog readers can ask the question WITHOUT importing
 * the frozen config: building that object throws on a half-configured box, which is
 * precisely the box the install wizard runs on (and the box the docs generator runs on in
 * CI). This module depends on `env.ts` and nothing else.
 *
 * Install mode iff EVERY required key is unset AND the install is not sealed. If SOME but
 * not all required keys are present the server is MISCONFIGURED, not fresh — we return
 * false so the normal `requireEnv` path throws the precise "missing key" error. A sealed
 * install whose `.env` vanished also returns false: fail loud rather than silently re-enter
 * the wizard on live data.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateDir, readEnv } from './env.ts';

/**
 * The four keys whose absence means "nothing has been configured yet".
 *
 * FROZEN at four by `config_docs_tripwire`: widening the fresh-box test is a
 * security-shaped change (it decides when an unauthenticated wizard is served), never a
 * drive-by edit. The catalog marks the same four with `installGate: true`.
 */
export const REQUIRED_CONFIG_KEYS = ['ENTITY', 'DB_NAME', 'DB_HOST', 'DB_USER'] as const;

/**
 * Read the install seal WITHOUT importing the core state module (config is the lowest
 * layer and must not depend on src/core). Mirrors `core/resolve/server_state.ts`
 * `statePath()`: the DEDALO_TS_STATE_PATH override (tests) wins, else
 * <private>/ts_state.json. A missing or garbled file reads as not-sealed.
 */
function installIsSealed(): boolean {
	try {
		const override = readEnv('DEDALO_TS_STATE_PATH');
		const statePath = override ?? join(privateDir, 'ts_state.json');
		if (!existsSync(statePath)) return false;
		const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as { install_status?: string };
		return parsed.install_status === 'sealed';
	} catch {
		return false;
	}
}

function resolveInstallMode(): boolean {
	const setCount = REQUIRED_CONFIG_KEYS.filter((key) => {
		const value = readEnv(key);
		return value !== undefined && value !== '';
	}).length;
	if (setCount !== 0) return false; // configured, or partial → not install mode
	return !installIsSealed();
}

export const INSTALL_MODE: boolean = resolveInstallMode();
