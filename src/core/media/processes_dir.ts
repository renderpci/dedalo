/**
 * THE ONE DERIVATION of the job-registry (processes) directory — a PURE leaf
 * (node:path only, no config, no env, no IO).
 *
 * Two callers ask the same question and must get the same answer:
 *  - src/core/media/jobs.ts processesDir() (via test_media_root.ts
 *    resolveProcessesDir, which feeds it the frozen `config.media.testRoot`);
 *  - src/core/install/runtime_paths.ts `media_processes_dir` (the updater's
 *    census, which must stay config-free and cycle-free, so it feeds it the
 *    env values itself).
 * Both used to spell the rule independently and had already drifted (an empty
 * DEDALO_MEDIA_PROCESSES_DIR was "unset" to the census but the path '' to the
 * job manager). One function, both callers — gate: test_media_root_tripwire
 * RULE 8 (the census and the job manager agree under every seam state).
 */

import { resolve } from 'node:path';

/** The suite's processes directory for a test media root: its sibling `<root>.processes`. */
export function testProcessesDirFor(testRoot: string): string {
	return `${resolve(testRoot)}.processes`;
}

/**
 * Explicit DEDALO_MEDIA_PROCESSES_DIR wins; else, with the test seam armed
 * (`testRoot` non-null), the suite sibling; else the installation default.
 * An empty explicit value is UNSET, exactly as the typed readers treat it.
 */
export function deriveProcessesDir(
	explicit: string | null | undefined,
	testRoot: string | null,
	installDefault: string,
): string {
	if (explicit !== undefined && explicit !== null && explicit !== '') return explicit;
	return testRoot !== null ? testProcessesDirFor(testRoot) : installDefault;
}
