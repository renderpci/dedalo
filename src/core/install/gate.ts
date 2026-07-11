/**
 * Install-window gate (DEC-19 TS-native install).
 *
 * The install API surface (`get_install_context` + the `install` step router)
 * is reachable WITHOUT a session, but ONLY on a fresh, not-yet-sealed instance
 * and ONLY from an allowed address. This module owns those two predicates; the
 * dispatcher (core/api/dispatch.ts) wires them into the gate chain, and the
 * `start` handler / `get_install_context` read `isSealed()` to decide whether to
 * serve the wizard or the app.
 *
 * SEAL is the terminal install state, written to <private>/ts_state.json by
 * install_finish. Once sealed, the install surface returns 404 (gone) and the
 * server behaves as a normal configured instance.
 */

import { readEnv } from '../../config/env.ts';
import { getServerState } from '../resolve/server_state.ts';

/** The (class:action) pairs that make up the pre-auth install surface. */
export const INSTALL_ACTION_KEYS: ReadonlySet<string> = new Set([
	'dd_utils_api:install',
	'dd_utils_api:get_install_context',
]);

/** True once install_finish has sealed the instance (terminal state). */
export function isSealed(): boolean {
	return getServerState().install_status === 'sealed';
}

/**
 * True while a TS-native install is mid-flight — config has been written
 * (persist_config → 'configured') but the install is not yet sealed. The server
 * has ALREADY restarted out of install mode by this point, so `config.installMode`
 * is false; the wizard must still resume on a reload (verify → DB restore → root
 * pw → finish). Deliberately does NOT fire for `undefined`/`unconfigured` status,
 * so an EXISTING (PHP-provisioned, coexistence) deployment that never ran the TS
 * installer keeps serving the normal login — never the wizard.
 */
export function installInProgress(): boolean {
	const status = getServerState().install_status;
	return status === 'configured' || status === 'installing';
}

/**
 * Is the caller's IP allowed to reach the install surface? Parses
 * `DEDALO_INSTALL_ALLOWED_IPS` (comma-separated; the token `loopback` matches
 * the local/loopback addresses). When the key is UNSET the surface is open
 * (dev default, PHP parity) — an operator locks it down by setting the key
 * before exposing a fresh install to a network.
 *
 * `clientIp` is the dispatcher's already-resolved trusted-hop address
 * (server.ts clientIpFromRequest); a request with no XFF resolves to 'local'.
 */
export function installIpAllowed(clientIp: string): boolean {
	const raw = readEnv('DEDALO_INSTALL_ALLOWED_IPS');
	if (raw === undefined || raw.trim() === '') return true; // unset → open (dev)
	const loopback = new Set(['local', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
	const allowed = raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
	for (const entry of allowed) {
		if (entry === 'loopback' && loopback.has(clientIp)) return true;
		if (entry === clientIp) return true;
	}
	return false;
}
