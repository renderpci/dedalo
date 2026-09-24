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
 * STATE MACHINE: closed → (3 consecutive SERVICE failures) → open for the
 * cooldown → half-open, which admits EXACTLY ONE probe → the probe's success
 * closes it, the probe's service failure re-opens it for a fresh cooldown, and a
 * probe that got an ANSWER ABOUT ITS REQUEST (a 4xx) is released without a
 * verdict, so the next call probes. ONLY THE PROBE settles the probe
 * (recordFailure's `asProbe`, transport.ts): a call admitted while the circuit
 * was closed that ends after the probe was admitted must not free a second
 * probe nor log a second re-open line.
 *
 * WHAT COUNTS — `isServiceFailure`, the one evidence law (2026-09-24). The
 * breaker answers "is the REMOTE healthy?", so only evidence about the remote's
 * health may move it. The measured defect that fixed this law: a portal sent
 * three unpadded/local ids to Zenon, Zenon answered `400` three times — three
 * correct answers about three bad requests — and the circuit opened for EVERY
 * Zenon lookup on the install. Per ExternalErrorKind:
 *   - `timeout`, `transport`            COUNT — the remote did not answer.
 *   - `http_status` 5xx / 429 / 408     COUNT — the remote says IT is failing,
 *                                        overloaded, or timed out waiting.
 *   - `http_status` any other 4xx       NEUTRAL — an answer about the REQUEST
 *                                        (400 bad id, 404/410 gone, 401/403 our
 *                                        credential). Counting 401/403 would
 *                                        also hide a config error an operator
 *                                        must fix behind `circuit_open`.
 *   - `too_large`                        NEUTRAL — the remote answered 2xx with
 *                                        a body past OUR ceiling: one record.
 *   - `protocol`                         already a SUCCESS for the breaker (the
 *                                        socket delivered; transport.ts records
 *                                        it before decoding).
 *   - `blocked_host`, `bad_config`,     NEUTRAL — local verdicts (SSRF guard,
 *     `disabled`, `not_registered`,      credential declaration, switches):
 *     `circuit_open`, `not_found`        nothing was learned about the remote.
 * NEUTRAL means neither counted NOR reset: a 4xx proves the front door answered,
 * not that the service can serve records — a sick backend behind a healthy
 * validating proxy answers 400 instantly and 503 for everything else, and a
 * reset-on-4xx law would let one bad id in every three calls hold a sick
 * service's circuit closed forever. Only a SUCCESS (2xx delivered) resets.
 *
 * LOGGING — transitions once, refusals counted (2026-09-24). Opening (and a
 * failed probe's re-opening — at most one line per cooldown) logs ONE
 * `circuit_open` line through the one door naming the failure that tripped it
 * and the cooldown; closing logs one info line with how long it was open and how
 * many calls it refused — both for the LAST open period (a re-open line
 * reports its period's refusals and the count restarts). A refused call logs NOTHING: it bumps the entry's
 * `refused` (breakerSnapshot) and the process counter
 * `external_circuit_refusals` (GET /api/v1/counters), and logExternalError
 * drops `circuit_open` refusals by contract. A 20 000-record export against an
 * open circuit is two log lines and a number, not 20 000 stacks.
 */

import { incrementCounter } from '../core/api/counters.ts';
import {
	type ExternalServiceError,
	logExternalCircuitClosed,
	logExternalCircuitOpened,
} from './errors.ts';
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
	/** Calls refused (no socket) in the CURRENT open period — counted, never logged. */
	refused: number;
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
	// Half-open: exactly one probe is admitted, whatever the concurrency.
	if (now - state.openedAt >= cooldownMs() && !state.probeInFlight) {
		state.probeInFlight = true;
		return 'probe';
	}
	// A REFUSAL: counted, never logged (the opening was logged once).
	state.refused++;
	incrementCounter('external_circuit_refusals');
	return 'open';
}

/**
 * THE EVIDENCE LAW: does this classified failure say the REMOTE is unhealthy?
 * Only these count toward opening the circuit, and only these are retried (a
 * retry cannot change an answer about the request). See the header for the
 * per-kind justification.
 */
export function isServiceFailure(error: ExternalServiceError): boolean {
	if (error.kind === 'timeout' || error.kind === 'transport') return true;
	if (error.kind !== 'http_status') return false;
	const status = error.status ?? 0;
	return status >= 500 || status === 429 || status === 408;
}

/**
 * A completed, successful call: the circuit closes and its entry disappears. A
 * close of an OPEN circuit (the probe, or an in-flight call that outlived the
 * opening) is logged once.
 */
export function recordSuccess(service: string, origin: string, now: number = Date.now()): void {
	const key = keyOf(service, origin);
	const state = breakerStates.get(key);
	breakerStates.delete(key);
	if (state !== undefined && state.openedAt !== null) {
		logExternalCircuitClosed({
			service,
			origin,
			openForMs: Math.max(0, now - state.openedAt),
			refused: state.refused,
		});
	}
}

/**
 * A SERVICE failure (the caller has already applied `isServiceFailure` — a
 * neutral outcome settles a probe through releaseProbe instead). The third
 * consecutive one opens the circuit; THE PROBE's failure re-opens it for a fresh
 * cooldown (the probe told us the service is still sick). Both transitions log
 * ONE line naming `cause`; a failure landing on an already-open circuit (an
 * in-flight call that outlived the opening) extends the cooldown silently.
 *
 * `asProbe` — only the call that `checkBreaker` admitted as the probe may settle
 * the probe. A late non-probe failure that lands while the probe is still out
 * must neither clear `probeInFlight` (a second probe would be admitted) nor log a
 * second re-open line inside the same cooldown (2026-09-24).
 *
 * `refused` is PER OPEN PERIOD: a re-open line reports the refusals of the period
 * that just ended, then the count starts again (the closing line's `refused` is
 * the last period's, like its `open_for_ms`).
 */
export function recordFailure(
	service: string,
	origin: string,
	now: number = Date.now(),
	cause?: ExternalServiceError,
	asProbe = false,
): void {
	const key = keyOf(service, origin);
	const state = breakerStates.get(key) ?? {
		failures: 0,
		openedAt: null,
		probeInFlight: false,
		touchedAt: now,
		refused: 0,
	};
	state.failures++;
	state.touchedAt = now;
	const wasProbing = asProbe && state.probeInFlight;
	const wasOpen = state.openedAt !== null;
	if (wasProbing) state.probeInFlight = false;
	if (wasProbing || state.failures >= FAILURE_THRESHOLD) state.openedAt = now;
	breakerStates.set(key, state);
	if (wasProbing || (!wasOpen && state.openedAt !== null)) {
		logExternalCircuitOpened({
			service,
			origin,
			failures: state.failures,
			cooldownMs: cooldownMs(),
			reopened: wasProbing,
			refused: state.refused,
			...(cause === undefined ? {} : { cause }),
		});
		state.refused = 0;
	}
}

/**
 * Is the circuit for (service, origin) open — refusing, or half-open waiting
 * for its probe? NON-MUTATING (no refusal is counted, no probe admitted): the
 * transport asks it before a RETRY, because a call admitted while the circuit
 * was closed must not keep hammering a service the breaker has since judged
 * sick (2026-09-24 — a slow 503 let every queued call run its full retries).
 */
export function isCircuitOpen(service: string, origin: string): boolean {
	const state = breakerStates.get(keyOf(service, origin));
	return state !== undefined && state.openedAt !== null;
}

/**
 * Settle THE half-open probe (only the call checkBreaker admitted as the probe
 * may call this — a non-probe call that cleared the flag would let a second
 * probe through) when it produced NO verdict about the remote end — the
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

/** One circuit, as ops panels and the gates see it. */
export interface BreakerSnapshotEntry {
	readonly key: string;
	/** Consecutive SERVICE failures since the last success. */
	readonly failures: number;
	/** Inside the cooldown (refusing everything). */
	readonly open: boolean;
	/** Past the cooldown, admitting one probe at a time. */
	readonly halfOpen: boolean;
	/** Calls refused without a socket in the current open period — the counted-not-logged flood. */
	readonly refused: number;
}

/** Read-only view for tests and ops panels. */
export function breakerSnapshot(now: number = Date.now()): BreakerSnapshotEntry[] {
	return [...breakerStates].map(([key, state]) => ({
		key,
		failures: state.failures,
		open: state.openedAt !== null && now - state.openedAt < cooldownMs(),
		halfOpen: state.openedAt !== null && now - state.openedAt >= cooldownMs(),
		refused: state.refused,
	}));
}
