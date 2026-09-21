/**
 * RETENTION SCHEDULER — applies the configured windows by itself: once shortly
 * after boot, then daily (registry.ts + prune.ts, audit 2026-08-26 P2-9).
 *
 * SCHEDULED RUNS APPLY, unlike the reconcile scheduler's dry default, and that
 * asymmetry is deliberate: a reconcile REPAIRS drift between two stores and an
 * operator wants to see it before it happens, while a retention window is a
 * decision already taken — the operator set the number of days. A scheduler that
 * only reported would mean the window did nothing until someone remembered to
 * run a command, which is the state P2-9 exists to end.
 *
 * With every window at its default (0 = keep everything) this does nothing at
 * all, so it is safe to leave armed; DEDALO_RETENTION_SCHEDULER_ENABLED=false is
 * for an instance sharing a database it does not own.
 *
 * Fire-and-forget and NON-FATAL, like every boot chore.
 */

import { listRetentions, runRetention } from './registry.ts';
import './prune.ts';

/** One pass over every registered store. Exported for the operator surfaces. */
export async function runRetentionPass(options: { apply: boolean }): Promise<void> {
	for (const definition of listRetentions()) {
		if (definition.policy.kind === 'forever') continue;
		try {
			const report = await runRetention(definition.name, { apply: options.apply });
			if (report.deleted > 0 || report.candidates > 0) {
				console.log(
					`[retention] ${definition.name}: ${report.candidates} candidate(s), ${report.deleted} removed`,
				);
			}
		} catch (error) {
			// A store that cannot be pruned must not stop the others, and must
			// never take the server with it.
			console.warn(`[retention] ${definition.name} failed`, error);
		}
	}
}

// Process-lifetime timer handle (module_state_tripwire allowlisted): armed by
// startRetentionScheduler, released by stopRetentionScheduler (SIGTERM).
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

const DAILY_MS = 24 * 60 * 60 * 1000;
/** Let the server finish booting before the first pass touches the database. */
const FIRST_PASS_DELAY_MS = 60_000;

export function startRetentionScheduler(): void {
	if (started) return;
	started = true;
	const first = setTimeout(() => void runRetentionPass({ apply: true }), FIRST_PASS_DELAY_MS);
	first.unref?.();
	timer = setInterval(() => void runRetentionPass({ apply: true }), DAILY_MS);
	timer.unref?.();
}

export function stopRetentionScheduler(): void {
	if (timer !== null) clearInterval(timer);
	timer = null;
	started = false;
}
