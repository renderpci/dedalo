/**
 * CHILD PROGRAM of test/unit/ops_runtime_pin.test.ts (bun#34069) — run as its own process
 * (`process.execPath <this file>`, stderr a PIPE, BUN_JSC_slowPathAllocsBetweenGCs=3), never
 * imported. Upstream's deterministic reproducer (oven-sh/bun PR #44581): three stderr writers
 * are finalized by a GC that runs INSIDE a Bun.spawnSync call; on a runtime with the defect
 * their release lands on spawnSync's own event loop, whose poll count then cancels the next
 * call's polls, and that call never polls (it runs into its timeout with no output).
 * Prints ONE JSON line: { collectedDuringCall, stdout, exitedDueToTimeout }.
 *
 * The globals below are THIS process's, which ends when the line is printed.
 */

// A module (top-level await), importing nothing.
export {};

// stderr is a pipe, so each writer registers a poll. On globalThis: a binding only written
// after the await is dead across it.
const scope = globalThis as unknown as { writers: unknown[] | null };
scope.writers = [];
const refs: WeakRef<object>[] = [];
for (let i = 0; i < 3; i++) {
	const writer = Bun.stderr.writer();
	writer.write('');
	writer.flush();
	scope.writers.push(writer);
	refs.push(new WeakRef(writer));
}
// A WeakRef keeps its target alive until the job that made it ends.
await Bun.sleep(0);
// maxBuffer is the last option spawnSync reads: the collection runs INSIDE the call.
Bun.spawnSync({
	cmd: ['true'],
	stdout: 'pipe',
	stderr: 'ignore',
	get maxBuffer() {
		Bun.gc(true);
		scope.writers = null;
		return undefined;
	},
});
let collectedDuringCall = 0;
for (const ref of refs) if (ref.deref() === undefined) collectedDuringCall++;
// The child outlives the registration of its polls, so the call has to poll for it.
const { stdout, exitedDueToTimeout } = Bun.spawnSync({
	cmd: ['sh', '-c', 'sleep 0.1; echo polled'],
	stdout: 'pipe',
	stderr: 'pipe',
	timeout: 2000,
});
console.log(JSON.stringify({ collectedDuringCall, stdout: stdout.toString(), exitedDueToTimeout }));
