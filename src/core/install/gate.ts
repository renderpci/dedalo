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
 * Normalize an address for comparison: trim, lowercase, and fold the IPv4-mapped
 * IPv6 form (`::ffff:203.0.113.10`) down to its v4 spelling. A dual-stack listener
 * reports a v4 peer in that mapped form, so without the fold a literal entry the
 * operator copied out of their own `ip addr` output would never match.
 */
function normalizeAddress(value: string): string {
	const trimmed = value.trim().toLowerCase();
	const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(trimmed);
	return mapped?.[1] ?? trimmed;
}

/** Pack a dotted-quad into 4 bytes, or null when it is not one. */
function packIpv4(value: string): Uint8Array | null {
	const parts = value.split('.');
	if (parts.length !== 4) return null;
	const bytes = new Uint8Array(4);
	for (let index = 0; index < 4; index++) {
		const part = parts[index] ?? '';
		if (!/^\d{1,3}$/.test(part)) return null;
		const byte = Number(part);
		if (byte > 255) return null;
		bytes[index] = byte;
	}
	return bytes;
}

/**
 * The hex groups of an IPv6 literal, split around the `::` elision, with any embedded
 * IPv4 tail already packed. Null when the literal is not one.
 *
 * Split out of `packIpv6` deliberately: PARSING an address and WRITING its bytes are two
 * jobs, and doing both in one function made it the most complex in this module — inside a
 * pre-auth security predicate, which is the last place a reader should have to hold two
 * problems at once. Every failure is a null, never a throw: a caller here decides whether
 * to admit an unauthenticated request, so "I could not parse it" must degrade to "no
 * match", not to an exception on the request path.
 */
function splitIpv6(value: string): {
	head: string[];
	tail: string[];
	v4Tail: Uint8Array | null;
} | null {
	const halves = ipv6Halves(value);
	if (halves === null) return null;
	const groups = [...halves.head, ...halves.tail];

	// An embedded v4 tail (`::ffff:203.0.113.10`) contributes TWO groups, not one.
	const last = groups[groups.length - 1] ?? '';
	const embedsV4 = last.includes('.');
	const v4Tail = embedsV4 ? packIpv4(last) : null;
	if (embedsV4 && v4Tail === null) return null;
	if (!ipv6GroupCountValid(groups.length + (embedsV4 ? 1 : 0), halves.elided)) return null;

	const hexGroups = embedsV4 ? groups.slice(0, -1) : groups;
	const headLength = halves.elided
		? Math.min(halves.head.length, hexGroups.length)
		: hexGroups.length;
	return { head: hexGroups.slice(0, headLength), tail: hexGroups.slice(headLength), v4Tail };
}

/** The groups either side of the `::` elision, or null when the literal is malformed. */
function ipv6Halves(value: string): { head: string[]; tail: string[]; elided: boolean } | null {
	if (!value.includes(':')) return null;
	const halves = value.split('::');
	if (halves.length > 2) return null;
	const expand = (half: string): string[] => (half === '' ? [] : half.split(':'));
	return {
		head: expand(halves[0] ?? ''),
		tail: halves.length === 2 ? expand(halves[1] ?? '') : [],
		elided: halves.length === 2,
	};
}

/**
 * Is this group count legal? Without an elision an address is EXACTLY 8 groups; with
 * one it must be fewer, since `::` stands for at least one zero group — a `::` that
 * elided nothing would be a second spelling of an address that already has one.
 */
function ipv6GroupCountValid(groupCount: number, elided: boolean): boolean {
	return elided ? groupCount <= 7 : groupCount === 8;
}

/** Write one 16-bit hex group at a byte offset. False when it is not a hex group. */
function writeIpv6Group(bytes: Uint8Array, group: string, at: number): boolean {
	if (!/^[0-9a-f]{1,4}$/.test(group)) return false;
	const numeric = Number.parseInt(group, 16);
	bytes[at] = (numeric >> 8) & 0xff;
	bytes[at + 1] = numeric & 0xff;
	return true;
}

/**
 * Pack an IPv6 literal into 16 bytes, or null when it is not one. Handles the `::`
 * elision and the embedded-v4 tail (`::ffff:203.0.113.10`, `64:ff9b::192.0.2.1`).
 * Returns null rather than throwing on anything it does not understand — every
 * caller here is a security predicate, so "I could not parse it" must degrade to
 * "no match", never to an exception on the request path.
 */
function packIpv6(value: string): Uint8Array | null {
	const parsed = splitIpv6(value);
	if (parsed === null) return null;

	const bytes = new Uint8Array(16);
	let cursor = 0;
	for (const group of parsed.head) {
		if (!writeIpv6Group(bytes, group, cursor)) return null;
		cursor += 2;
	}
	// The elision fills the gap with zero bytes; `bytes` is already zeroed, so the tail
	// simply starts at its right-aligned offset.
	const tailBytes = parsed.tail.length * 2 + (parsed.v4Tail === null ? 0 : 4);
	let tailCursor = 16 - tailBytes;
	if (tailCursor < cursor) return null;
	for (const group of parsed.tail) {
		if (!writeIpv6Group(bytes, group, tailCursor)) return null;
		tailCursor += 2;
	}
	if (parsed.v4Tail !== null) bytes.set(parsed.v4Tail, tailCursor);
	return bytes;
}

/** Pack an address of either family; the byte length IS the family (4 or 16). */
function packAddress(value: string): Uint8Array | null {
	return value.includes(':') ? packIpv6(value) : packIpv4(value);
}

/**
 * Is `ip` inside `cidr`? PURE, total, and FAIL-CLOSED: a malformed address, a
 * malformed or missing prefix length, a prefix wider than the family allows, or a
 * cross-family pair (a v4 address against a v6 block) all return false. It never
 * throws — this runs inside a pre-auth gate, where an exception on a hostile input
 * is itself the vulnerability.
 *
 * Comparison is bitwise on the packed address: whole bytes are compared directly,
 * and the straddling byte is masked to the remaining bits, so `/23` and `/25` mean
 * what they say instead of what a string-prefix comparison would guess.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
	const parsed = parseCidr(cidr);
	if (parsed === null) return false;
	const address = packAddress(normalizeAddress(ip));
	if (address === null) return false;
	if (parsed.network.length !== address.length) return false; // never match across families
	return sharesPrefix(parsed.network, address, parsed.prefixBits);
}

/** A CIDR's packed network address and prefix length, or null when it is not one. */
function parseCidr(cidr: string): { network: Uint8Array; prefixBits: number } | null {
	const slash = cidr.indexOf('/');
	if (slash < 0) return null;
	const prefixText = cidr.slice(slash + 1).trim();
	if (!/^\d{1,3}$/.test(prefixText)) return null;
	const network = packAddress(normalizeAddress(cidr.slice(0, slash)));
	if (network === null) return null;
	const prefixBits = Number(prefixText);
	// A prefix wider than the family is a typo, not a wildcard. Refusing it is what
	// keeps `/33` from silently meaning `/32`.
	if (prefixBits > network.length * 8) return null;
	return { network, prefixBits };
}

/**
 * Do two equal-length packed addresses agree on their first `prefixBits` bits?
 *
 * Bitwise, not by string prefix: whole bytes compare directly and the STRADDLING byte
 * is masked to the remaining bits, so `/23` and `/25` mean what they say rather than
 * what a textual comparison would guess.
 */
function sharesPrefix(network: Uint8Array, address: Uint8Array, prefixBits: number): boolean {
	const wholeBytes = prefixBits >> 3;
	for (let index = 0; index < wholeBytes; index++) {
		if (network[index] !== address[index]) return false;
	}
	const remainingBits = prefixBits & 7;
	if (remainingBits === 0) return true;
	const mask = (0xff << (8 - remainingBits)) & 0xff;
	return ((network[wholeBytes] ?? 0) & mask) === ((address[wholeBytes] ?? 0) & mask);
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
