/**
 * RECONCILE SCHEDULER — runs the registry's `boot` and `{everyMs}` reconciles
 * by themselves (registry.ts, S-10). `operator` ones never run here.
 *
 * A scheduled run REPORTS (dry) unless the definition carries `autoApply`
 * with its reason — today only `media_index`, whose boot apply this replaces
 * (server.ts used to fire `reconcileMediaIndex()` directly). Every outcome
 * goes through `runReconcile`, so the `reconcile` gauge on /api/v1/counters
 * shows the last drift of each, whether an operator or the clock ran it.
 *
 * Fire-and-forget and NON-FATAL, like every boot chore: a failing reconcile is
 * logged and recorded (`last_error` in the gauge), never blocks serving.
 * Gated by DEDALO_RECONCILE_SCHEDULER_ENABLED (an ephemeral/smoke instance must
 * not heal a shared store from the wrong media root).
 */

import { listReconciles, type ReconcileDefinition, runReconcile } from './registry.ts';

// Process-lifetime timer handles (module_state_tripwire allowlisted): armed by
// startReconcileScheduler, released by stopReconcileScheduler (SIGTERM).
const timers = new Set<ReturnType<typeof setInterval>>();
let started = false;

async function runScheduled(definition: ReconcileDefinition, when: string): Promise<void> {
	const apply = definition.autoApply !== undefined;
	try {
		const { report } = await runReconcile(definition.name, { apply });
		if (report.drift > 0) {
			console.warn(
				`[reconcile] ${when} ${definition.name}: drift ${report.drift}${apply ? `, applied ${report.applied}` : ' (reported, not applied)'}`,
			);
		}
	} catch {
		// Already logged and recorded (last_error in the gauge) by runReconcile;
		// a scheduled run is non-fatal by contract.
	}
}

/** Arm the schedule: boot-class once (next tick), interval-class on their period. */
export function startReconcileScheduler(): void {
	if (started) return;
	started = true;
	for (const definition of listReconciles()) {
		const schedule = definition.schedule;
		if (schedule === 'operator') continue;
		if (schedule === 'boot') {
			void runScheduled(definition, 'boot');
			continue;
		}
		const timer = setInterval(() => void runScheduled(definition, 'interval'), schedule.everyMs);
		timer.unref?.();
		timers.add(timer);
	}
}

export function stopReconcileScheduler(): void {
	for (const timer of timers) clearInterval(timer);
	timers.clear();
	started = false;
}
