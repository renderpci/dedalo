/**
 * THE RUNNING JOB'S CANCELLATION SCOPE.
 *
 * A background job already owns an `AbortController` (media/jobs.ts) and hands
 * its signal to the worker. That signal reached exactly as far as the worker
 * body chose to carry it: an awaited outbound call three frames down — an ASR
 * sidecar, an embedding server, an authority lookup — built its OWN controller
 * and never learned the job had been cancelled or had blown its deadline. So a
 * "stopped" job kept a socket open and a lane held.
 *
 * The scope is an AsyncLocalStorage carrying that signal across every await in
 * the worker's dynamic extent, so the transport door (security/ssrf_guard.ts
 * `fetchBoundedText`) can compose it with its own timeout without a signal
 * parameter being threaded through every provider signature. AsyncLocalStorage,
 * never a module-level `let`: one Bun process runs many jobs concurrently and a
 * module global would hand job B the signal of job A (the isolation law,
 * engineering/REQUEST_ISOLATION.md).
 *
 * LIMIT, stated rather than discovered: this reaches AWAITED JavaScript work.
 * Child processes (`Bun.spawn` — ffmpeg, pg_dump, the transcriber) do not
 * observe it; their kill path is their own subprocess handle, and wiring it is
 * a separate change with its own gate (named, not silently absent — see the
 * `job.deadline` note in media/jobs.ts).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const jobSignalStore = new AsyncLocalStorage<AbortSignal>();

/** Run `fn` with `signal` as the ambient job cancellation signal. */
export function runWithJobSignal<T>(signal: AbortSignal, fn: () => T): T {
	return jobSignalStore.run(signal, fn);
}

/** The running job's signal, or undefined outside a job (a plain request). */
export function currentJobSignal(): AbortSignal | undefined {
	return jobSignalStore.getStore();
}
