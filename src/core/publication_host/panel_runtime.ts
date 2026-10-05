/**
 * THE PANEL'S ONE RUNTIME READ (publication host phases 4–6). The publication_hosts
 * get_value reads `<private>/publication_hosts_runtime.json` ONCE, here, and hands
 * the same map to every decorator in this fixed order:
 * rows → withMediaCopyCheck (phase 5) → attachProbe (phase 6), then api_lockstep (phase 4).
 *
 * A corrupt or locked runtime file (runtime.ts RuntimeStateError) must not take the
 * panel down — the operator needs the panel to SEE the problem. It degrades to an empty
 * map and a top-level `runtime_invalid: <reason>` the client shows red. Deleting the file
 * is safe (every field is re-derived). Any other error is a bug and propagates.
 *
 * ASYNC: runtime.ts reads with the atomic kernel's async reader (the panel is on the
 * request path). No module state.
 */

import { type HostRuntime, loadRuntime, RuntimeStateError } from './runtime.ts';

export interface PanelRuntime {
	runtime: Readonly<Record<string, HostRuntime>>;
	/** A RuntimeStateError reason (`invalid_json`, `locked`, …), or null when readable. */
	runtime_invalid: string | null;
}

export async function loadPanelRuntime(
	load: () => Promise<Record<string, HostRuntime>> = loadRuntime,
): Promise<PanelRuntime> {
	try {
		return { runtime: await load(), runtime_invalid: null };
	} catch (error) {
		if (!(error instanceof RuntimeStateError)) throw error;
		console.error(
			'[publication_host] runtime file unreadable — panel shows runtime_invalid:',
			error,
		);
		return { runtime: {}, runtime_invalid: error.reason };
	}
}
