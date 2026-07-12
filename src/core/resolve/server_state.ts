/**
 * TS-NATIVE runtime state (the TS equivalent of PHP's config_core.php custom
 * overrides — DEDALO_MAINTENANCE_MODE_CUSTOM / DEDALO_NOTIFICATION_CUSTOM /
 * recovery mode). The PHP widgets write the PHP install's config file; a
 * coexisting TS server must not touch that, so the TS server keeps its OWN
 * state in <private>/ts_state.json and honors it in its own login flow:
 * maintenance mode refuses non-superuser logins.
 */

import { constants, accessSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readEnv } from '../../config/env.ts';

export interface ServerState {
	maintenance_mode: boolean;
	recovery_mode: boolean;
	/** Login-page notification message; false/'' disables it. */
	notification: string | boolean;
	/** Runtime area deny/allow lists; null = the static config defaults. */
	areas_deny: string[] | null;
	areas_allow: string[] | null;
	/** Runtime menu skip tipos; null = the static config defaults. */
	menu_skip_tipos: string[] | null;
	/**
	 * Runtime media access mode override (the TS-native equivalent of PHP's
	 * DEDALO_MEDIA_ACCESS_MODE_CUSTOM), written by the root-only media_control widget.
	 * It lives HERE and not in `.env` because `../private/.env` is append-only, so a
	 * UI-settable value cannot go there. `null` = no override → the .env value wins.
	 * `false` = protection explicitly OFF, which is NOT the same as "no override".
	 * Resolved by core/media/protection.ts `resolveMediaAccessMode()`.
	 */
	media_access_mode?: 'private' | 'publication' | false | null;
	/**
	 * TS-native install lifecycle (DEC-19; the TS equivalent of PHP's
	 * state.install_status). Absent/'unconfigured' on a fresh machine →
	 * 'configured' after persist_config writes .env → 'sealed' after
	 * install_finish. `sealed` makes the install surface 404 and the server
	 * behave as a normal configured instance. See src/core/install/.
	 */
	install_status?: 'unconfigured' | 'configured' | 'installing' | 'sealed';
	/** Install fingerprint captured at persist_config (PHP state.information). */
	information?: string;
	/** Install fingerprint key captured at persist_config (PHP state.info_key). */
	info_key?: string;
}

const DEFAULT_STATE: ServerState = {
	maintenance_mode: false,
	recovery_mode: false,
	notification: false,
	areas_deny: null,
	areas_allow: null,
	menu_skip_tipos: null,
	media_access_mode: null,
};

/** The EFFECTIVE deny list: runtime override, else the static config value. */
export function getEffectiveAreasDeny(staticDefault: readonly string[]): string[] {
	return getServerState().areas_deny ?? [...staticDefault];
}

/** The EFFECTIVE menu skip tipos: runtime override, else the static config value. */
export function getEffectiveMenuSkipTipos(staticDefault: readonly string[]): string[] {
	return getServerState().menu_skip_tipos ?? [...staticDefault];
}

/** The EFFECTIVE allow list: runtime override, else empty (no static config source). */
export function getEffectiveAreasAllow(): string[] {
	return getServerState().areas_allow ?? [];
}

/**
 * Can the state file be written (the TS analog of PHP config_local_writer::
 * is_writable, which the widgets surface as `writable` so the client disables
 * Save instead of failing it).
 */
export function isStateWritable(): boolean {
	const path = statePath();
	try {
		accessSync(existsSync(path) ? path : dirname(path), constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * State path (S1-18 precedent): the live file in <private>/ts_state.json by
 * default; the DEDALO_TS_STATE_PATH override exists so `bun test` (bunfig
 * [test].preload → test/preload/session_db.ts) points the WHOLE test process
 * at a per-run scratch file — a test flipping maintenance_mode must never put
 * the LIVE server into maintenance mode (and a killed run must not leave it
 * there).
 */
export function statePath(): string {
	const override = readEnv('DEDALO_TS_STATE_PATH');
	if (override !== undefined) return override;
	// The TS tree's private dir (same resolution the session store / backups use).
	const privateDir = join(dirname(String(process.cwd())), 'private');
	return join(existsSync(privateDir) ? privateDir : process.cwd(), 'ts_state.json');
}

export function getServerState(): ServerState {
	try {
		const raw = readFileSync(statePath(), 'utf8');
		return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<ServerState>) };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export function setServerState(patch: Partial<ServerState>): ServerState {
	const next = { ...getServerState(), ...patch };
	const path = statePath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(next, null, '\t')}\n`);
	return next;
}
