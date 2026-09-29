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
import { INSTALL_MODE } from '../../config/install_mode.ts';
import { getServerState } from '../resolve/server_state.ts';
import { ipInCidr, normalizeAddress } from '../security/ip_address.ts';

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
 * Is the pre-auth install surface reachable AT ALL? (OPS-01, 2026-07-28 audit.)
 *
 * It opens ONLY on a genuinely fresh box (`INSTALL_MODE` — every required
 * config key unset) or one whose TS wizard is mid-flight (`installInProgress`),
 * and NEVER once sealed. The prior gate keyed on `!isSealed()` ALONE, which
 * FAILED OPEN on every PHP-migrated / coexistence instance: those have their DB
 * keys set (so `INSTALL_MODE` is false) yet carry no `install_status` (the
 * v6→v7 config migration drops `DEDALO_INSTALL_STATUS` and `DEFAULT_STATE`
 * omits it), so `isSealed()` returned false and the UNAUTHENTICATED installer —
 * `persist_config` (rewrites `.env` + forces a restart) and `test_db_connection`
 * (spawns psql) — was exposed to anyone who could reach the port.
 *
 * This is the SAME wizard-vs-app predicate the get_install_context handler
 * already applies (`dd_core_api`: `config.installMode || installInProgress()`);
 * the dispatch gate had simply been weaker than the handler it fronts. Reading
 * `INSTALL_MODE` (a load-time const over env only, not the frozen `config`
 * object) keeps this callable on a half-configured box without throwing.
 */
export function installSurfaceReachable(): boolean {
	if (isSealed()) return false;
	return INSTALL_MODE || installInProgress();
}

/**
 * ── The install-window address allowlist ──────────────────────────────────
 *
 * FAIL-CLOSED SINCE 2026-08-24 (audit P2-6;
 * `engineering/wire_contract/WC-2026-08-24-install-ip-gate-fail-closed.md`).
 *
 * What sits behind this predicate is an UNAUTHENTICATED installer: `persist_config`
 * rewrites `../private/.env` and then exits so the supervisor restarts the process
 * into that configuration, and `test_db_connection` spawns psql. Until 2026-08-24 an
 * UNSET `DEDALO_INSTALL_ALLOWED_IPS` left all of that open to every address that
 * could reach the port — a default that is only ever right on a laptop, and that is
 * silently wrong on exactly the deployments where the wizard is used over a network
 * (a container stack, a VM, a hosted box). A default may not be the difference
 * between a safe install and a takeover, so the default is now LOOPBACK ONLY and
 * opening the surface is an explicit, written act (`any`).
 *
 * Entry spellings, in the one grammar this file defines:
 *   `loopback`       the local machine — the exact spellings in LOOPBACK_SPELLINGS
 *   `203.0.113.10`   a literal address (v4 or v6)
 *   `10.0.0.0/24`    a CIDR block (v4 or v6), matched bitwise by ipInCidr
 *   `any`            EVERY address. The one opt-out, never a default.
 *
 * HONEST LIMIT, and it is load-bearing: `clientIp` is what the dispatcher resolved
 * (server.ts clientIpFromRequest), which is the trusted-hop entry of
 * `X-Forwarded-For` — and a request that carries NO such header resolves to the
 * sentinel `'local'`, whatever socket it actually arrived on. So this gate is a
 * real lock on every deployment that runs behind the reverse proxy the production
 * guide prescribes (the proxy always appends the peer), and on a bare
 * `SERVER_TCP_PORT` listener with no proxy in front it still admits a remote peer,
 * because the engine is not told who that peer is. Closing that hole means teaching
 * the server to fall back to the real socket peer address instead of `'local'`,
 * which is a change in server.ts and NOT in this module; documented here rather
 * than left implicit, per "never silently narrow scope".
 */

/**
 * The spellings of "this machine" the `loopback` token admits. `'local'` is the
 * dispatcher's own sentinel for a request that carried no `X-Forwarded-For` (a unix
 * socket, the CLI installer, a direct dev request) — without it a fresh box locks
 * its own operator out of the wizard, which is the failure mode opposite to the one
 * this gate exists for. Exact spellings only: `127.0.0.2` is loopback to the kernel
 * but is not a spelling anything in this engine produces, and an allowlist that
 * guesses is an allowlist that surprises. Typed ReadonlySet — a constant table, not
 * a cache (module_state_tripwire).
 */
export const LOOPBACK_SPELLINGS: ReadonlySet<string> = new Set([
	'local',
	'127.0.0.1',
	'::1',
	'::ffff:127.0.0.1',
]);

/**
 * The policy in force when the operator has said nothing: the local machine, and
 * nobody else. Frozen and exported so the gate that guards this decision asserts
 * against the SAME array the engine runs on — in particular that `any` never
 * appears in it.
 */
export const DEFAULT_INSTALL_ALLOW_ENTRIES: readonly string[] = Object.freeze(['loopback']);

/** The token that opens the surface to every address. Written by an operator, never defaulted. */
export const INSTALL_ALLOW_ANY = 'any';

/** Where the entries in force came from — `'default'` means the key is unset/empty. */
export type InstallAllowSource = 'default' | 'env';

export interface InstallAllowPolicy {
	/** The parsed entries in force, in order. Never empty. */
	entries: readonly string[];
	/** `'env'` when DEDALO_INSTALL_ALLOWED_IPS supplied them, `'default'` otherwise. */
	source: InstallAllowSource;
}

/**
 * The address policy in force RIGHT NOW. Reads env at call time (readEnv, the
 * sanctioned reader) rather than the boot-frozen config object, because the install
 * gate must answer on a half-configured box that has no frozen config yet.
 *
 * An unset key, an empty value, and a value that is nothing but separators and
 * whitespace all mean "the operator said nothing" — they collapse to the default.
 * That matters: the previous shape treated an empty value as "open", so a
 * `DEDALO_INSTALL_ALLOWED_IPS=` line left behind by a template was indistinguishable
 * from a deliberate decision to expose the installer.
 */
export function installAllowPolicy(): InstallAllowPolicy {
	const raw = readEnv('DEDALO_INSTALL_ALLOWED_IPS');
	const entries =
		raw === undefined
			? []
			: raw
					.split(',')
					.map((entry) => entry.trim())
					.filter((entry) => entry !== '');
	if (entries.length === 0) return { entries: DEFAULT_INSTALL_ALLOW_ENTRIES, source: 'default' };
	return { entries, source: 'env' };
}

/**
 * One line naming the policy in force, for the boot banner next to INSTALL MODE.
 * An operator who cannot reach their own wizard must be able to read WHY off the
 * log rather than guess at an env key, and an operator who wrote `any` must see
 * that they did. Deliberately says nothing a log reader could not already read out
 * of the configuration — this string is for the console, never for a response body.
 */
export function describeInstallAllowPolicy(): string {
	const { entries, source } = installAllowPolicy();
	const suffix =
		source === 'default'
			? ' (default — DEDALO_INSTALL_ALLOWED_IPS is unset; the wizard answers ONLY the local machine)'
			: entries.includes(INSTALL_ALLOW_ANY)
				? ' (DEDALO_INSTALL_ALLOWED_IPS — OPEN TO EVERY ADDRESS)'
				: ' (DEDALO_INSTALL_ALLOWED_IPS)';
	return `install allowlist: ${entries.join(', ')}${suffix}`;
}

/**
 * Is the caller's IP allowed to reach the install surface?
 *
 * The refusal is `install.ip_denied` (403), thrown by the dispatcher's Gate 1b.
 * Deliberately, the refusal carries NO details: the caller is unauthenticated, and
 * echoing back either the address the engine resolved for them or which policy is
 * in force would hand a prober two facts they do not otherwise have (whether they
 * are seen through a proxy, and whether the operator has configured the key at
 * all). The operator gets the same information from the boot banner
 * (describeInstallAllowPolicy), where it is already theirs. See the WC entry.
 */
export function installIpAllowed(clientIp: string): boolean {
	const { entries } = installAllowPolicy();
	return entries.some((entry) => allowEntryMatches(entry, clientIp));
}

/**
 * Does ONE allowlist entry admit this address? The four spellings, in one place.
 *
 * Shared with the error-report intake gate (`src/core/error_report/gate.ts`), which
 * reads a different key with a different DEFAULT but the same entry grammar. Two
 * hand-written copies of an address-matching rule in two security predicates is how
 * one of them quietly stops understanding CIDR, or keeps admitting a spelling the
 * other dropped — so there is exactly one, and `127.0.0.1` is written in neither
 * caller.
 *
 * `any` is honoured HERE rather than per-caller because it is a spelling of the
 * grammar, not a policy: a caller that does not want it simply never puts it in its
 * entry list (the error-report key is operator-written, and an operator who writes
 * `any` there means it).
 */
export function allowEntryMatches(entry: string, clientIp: string): boolean {
	const address = normalizeAddress(clientIp);
	if (entry === INSTALL_ALLOW_ANY) return true;
	if (entry === 'loopback') return LOOPBACK_SPELLINGS.has(address);
	if (entry.includes('/')) return ipInCidr(address, entry);
	return normalizeAddress(entry) === address;
}
