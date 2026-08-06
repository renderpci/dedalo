/**
 * CIRCUIT BREAKER, per (service, ORIGIN).
 *
 * WHY NOT THE CACHE FACTORY. `createOntologyCache` registers a clearer that
 * fires after EVERY dd_ontology write (ontology/cache_factory.ts). A breaker
 * built on it would be reset by an unrelated cataloguing save — the circuit
 * would re-open the flood at the worst possible moment, and the harder the
 * install is being used, the more often it would happen. Breaker state derives
 * from a REMOTE SERVER'S LIVENESS, which no local write invalidates, so neither
 * factory lifecycle applies (the diffusion `probeStatusMemo` precedent).
 *
 * LIFECYCLE of the one module-level map (its ALLOWLISTED_MODULE_MAPSET
 * justification, and the contract external_isolation_tripwire pins):
 *   - KEYED by `${service}|${origin}` — a service on a host. NEVER by session,
 *     user, principal, lang, section or record: none of those change whether a
 *     remote host is answering.
 *   - CLEARED BY TIME ONLY: a success deletes its entry, and every access
 *     prunes entries untouched for `PRUNE_AFTER_FACTOR` cooldowns. Nothing
 *     else may clear it — that is the invariant.
 *
 * WHAT v6 DID, and why this shape exists. v6 kept a single
 * `$_SESSION['zenon_is_available']` boolean: one empty response poisoned EVERY
 * entity for a whole session, it was request-identity state (so under a
 * persistent worker it bleeds between users), and it could not distinguish two
 * hosts or two services. Keying by (service, origin) and holding it in
 * process-wide, time-cleared state fixes all three at once.
 *
 * STATE MACHINE: closed → (3 consecutive failures) → open for the cooldown →
 * half-open, which admits EXACTLY ONE probe → the probe's success closes it,
 * the probe's failure re-opens it for a fresh cooldown.
 */

import { externalSettings } from './settings.ts';

/** Consecutive failures that open the circuit. */
const FAILURE_THRESHOLD = 3;

/** An untouched entry is pruned after this many cooldowns (bounded map). */
const PRUNE_AFTER_FACTOR = 10;

/** Floor for the prune horizon, so a cooldown of 0 cannot prune instantly. */
const MIN_PRUNE_MS = 60_000;

interface BreakerState {
	/** Consecutive failures since the last success. */
	failures: number;
	/** Epoch ms the circuit opened, or null while it is closed. */
	openedAt: number | null;
	/** True while the single half-open probe is outstanding. */
	probeInFlight: boolean;
	/** Epoch ms of the last read or write, for pruning only. */
	touchedAt: number;
}

/**
 * The ONE piece of module-level mutable state in src/external. See the header
 * for its lifecycle contract; external_isolation_tripwire asserts nothing else
 * mutable joins it outside the documented set.
 */
const breakerStates = new Map<string, BreakerState>();

/** The admission verdict for one outbound attempt. */
export type BreakerVerdict = 'closed' | 'open' | 'probe';

function keyOf(service: string, origin: string): string {
	return `${service}|${origin}`;
}

function cooldownMs(): number {
	return externalSettings().breakerCooldownMs;
}

/** Drop entries nobody has touched for a long time — the map stays bounded. */
function prune(now: number): void {
	const horizon = Math.max(MIN_PRUNE_MS, cooldownMs() * PRUNE_AFTER_FACTOR);
	for (const [key, state] of breakerStates) {
		if (now - state.touchedAt > horizon) breakerStates.delete(key);
	}
}

/**
 * May this attempt open a socket?
 *   `closed` — normal traffic.
 *   `open`   — refuse WITHOUT a socket (the caller raises `circuit_open`).
 *   `probe`  — the single half-open trial; the caller MUST settle it through
 *              recordSuccess / recordFailure / releaseProbe. An unsettled probe
 *              is NOT self-healing: `probeInFlight` stays true, every later
 *              check refreshes `touchedAt` so the prune never reaps the entry,
 *              and the origin answers `open` forever (see releaseProbe).
 */
export function checkBreaker(
	service: string,
	origin: string,
	now: number = Date.now(),
): BreakerVerdict {
	prune(now);
	const state = breakerStates.get(keyOf(service, origin));
	if (state === undefined || state.openedAt === null) return 'closed';
	state.touchedAt = now;
	if (now - state.openedAt < cooldownMs()) return 'open';
	// Half-open: exactly one probe is admitted, whatever the concurrency.
	if (state.probeInFlight) return 'open';
	state.probeInFlight = true;
	return 'probe';
}

/** A completed, successful call: the circuit closes and its entry disappears. */
export function recordSuccess(service: string, origin: string): void {
	breakerStates.delete(keyOf(service, origin));
}

/**
 * A failed call. The third consecutive failure opens the circuit; a failure
 * while half-open re-opens it for a fresh cooldown (the probe told us the
 * service is still sick).
 */
export function recordFailure(service: string, origin: string, now: number = Date.now()): void {
	const key = keyOf(service, origin);
	const state = breakerStates.get(key) ?? {
		failures: 0,
		openedAt: null,
		probeInFlight: false,
		touchedAt: now,
	};
	state.failures++;
	state.touchedAt = now;
	const wasProbing = state.probeInFlight;
	state.probeInFlight = false;
	if (wasProbing || state.failures >= FAILURE_THRESHOLD) state.openedAt = now;
	breakerStates.set(key, state);
}

/**
 * Settle a half-open probe that produced NO verdict about the remote end — the
 * attempt died locally (an unclassified throw on the way to the socket, or a
 * decode failure after a successful call), so nobody learned anything about the
 * origin's liveness. Clears `probeInFlight` and nothing else.
 *
 * WHY NOT recordFailure. A local defect is hit on EVERY request, so counting it
 * would open the circuit for a perfectly healthy origin after three of them and
 * report `circuit_open` — hiding the real `bad_config`/programming error behind
 * a fake outage. The state machine only moves on evidence about the REMOTE end.
 *
 * A missing entry is a no-op: a success between the probe and this call already
 * deleted it, and re-creating one here would invent state.
 */
export function releaseProbe(service: string, origin: string, now: number = Date.now()): void {
	const state = breakerStates.get(keyOf(service, origin));
	if (state === undefined) return;
	state.probeInFlight = false;
	state.touchedAt = now;
}

/**
 * Forget the circuit for one (service, origin) — the targeted ops escape hatch.
 *
 * NOTE ON api_url CHANGES: a changed origin needs NO reset, because the origin
 * is IN the key — the new origin lands on a fresh, closed circuit by
 * construction, and the old one prunes itself out. This exists for the
 * SAME-origin case: an operator who has just fixed the remote end wants the
 * next request to try, not to wait out the cooldown. Blanket-clearing on
 * ontology writes would reproduce exactly the v6 defect described in the
 * header, so nothing does it.
 */
export function resetBreakerForOrigin(service: string, origin: string): void {
	breakerStates.delete(keyOf(service, origin));
}

/** Read-only view for tests and ops panels. */
export function breakerSnapshot(): { key: string; failures: number; open: boolean }[] {
	const now = Date.now();
	return [...breakerStates].map(([key, state]) => ({
		key,
		failures: state.failures,
		open: state.openedAt !== null && now - state.openedAt < cooldownMs(),
	}));
}
