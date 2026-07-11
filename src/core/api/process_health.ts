/**
 * Process-poison latch — production hardening for the first-load TDZ class.
 *
 * Bun caches a FAILED module evaluation: when a lazily-imported module's first
 * evaluation dies in a temporal-dead-zone ReferenceError ("Cannot access 'X'
 * before initialization"), every later import of that module rethrows the same
 * error for the WHOLE process life. Observed once (2026-07-07, dev): a
 * concurrent first-request burst poisoned the read path — 1114 identical
 * `dd_core_api::read` failures — while /health (DB-only) stayed green, so the
 * watchdog never restarted the process.
 *
 * This latch closes the detection gap: the dispatch catch marks the process
 * poisoned when it sees a TDZ-shaped ReferenceError, /health turns 503, and
 * the S2-38 watchdog cadence (engineering/PRODUCTION.md §2) recycles the process
 * within ~30 s. The boot warm-up (server.ts warmCoreModuleGraph) makes the
 * trigger itself near-impossible — this is the defense-in-depth layer behind
 * it, not the primary fix.
 *
 * Module-level mutable state is deliberate and request-INDEPENDENT (process
 * lifecycle, same class as server.ts dbHealth) — module_state_tripwire posture.
 */

const poisonState = {
	poisoned: false,
	reason: '',
	occurrences: 0,
};

/**
 * True when `error` looks like a temporal-dead-zone ReferenceError — the
 * signature of a poisoned (failed-evaluation) module. Bun TDZ errors carry NO
 * stack frames, so the message text is the only available discriminator.
 */
export function isModulePoisonError(error: unknown): boolean {
	return error instanceof ReferenceError && /before initialization/.test(error.message);
}

/**
 * Flip the process into the poisoned state (idempotent; counts every
 * occurrence). The FIRST call logs the operational consequence loudly.
 */
export function markProcessPoisoned(reason: string): void {
	poisonState.occurrences++;
	if (poisonState.poisoned) return;
	poisonState.poisoned = true;
	poisonState.reason = reason;
	console.error(
		`[FATAL] process POISONED: ${reason} — Bun caches the failed module evaluation for the whole process life, so every request through that module now fails identically. /health answers 503 from here on; the watchdog (engineering/PRODUCTION.md §2) must recycle this process. If unsupervised: restart the server.`,
	);
}

/** Snapshot of the poison latch for /health and the counters endpoint. */
export function getProcessPoison(): { poisoned: boolean; reason: string; occurrences: number } {
	return { ...poisonState };
}

/**
 * TEST-ONLY reset. The latch is process-global by design; a test that flips it
 * (test/unit/process_health.test.ts) MUST reset it or every later /health
 * assertion in the same run answers 503 — the cross-file leak class the AI-01
 * mock.module fix just retired. Production code never calls this: a poisoned
 * process is only ever healed by a restart.
 */
export function resetProcessPoisonForTests(): void {
	poisonState.poisoned = false;
	poisonState.reason = '';
	poisonState.occurrences = 0;
}
