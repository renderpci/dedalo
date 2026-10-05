/**
 * DIFFUSION FACADE — the media copy target (PUBLICATION_HOST_SPEC §5.2, phase 5).
 * The ONE legal door for server.ts (boot wiring) and core (the publication_hosts
 * widget, through the media_copy reconcile) to reach the copy worker
 * (boundary_seam_tripwire: facade-only).
 */

import { hostStatus } from '../../core/publication_host/agent_client.ts';
import { loadRegistry } from '../../core/publication_host/registry.ts';
import { loadRuntime } from '../../core/publication_host/runtime.ts';
import {
	type CopyPlan,
	planCopy,
	syncHost,
	withdrawNow,
} from '../targets/mediastore/media_copy.ts';
import {
	type CopyApplyReport,
	explicitCopyState,
	hostTakesCopy,
	type TakesCopyIo,
} from '../targets/mediastore/media_copy_apply.ts';
import {
	activeMediaCopyWorker,
	inMediaCopyLane,
	PUBLISH_DEBOUNCE_MS,
	startMediaCopyWorker,
} from '../targets/mediastore/media_copy_worker.ts';

export type { CopyApplyReport };
export { inMediaCopyLane };

/** Boot: start the worker on the registry's hosts. Returns its stop (shutdown drain). */
export function startMediaCopy(
	options: { afterSync?: (host: string, report: CopyApplyReport) => void } = {},
): () => void {
	return startMediaCopyWorker({
		listHosts: () => loadRegistry().hosts.map((host) => host.name),
		syncHost,
		withdrawNow,
		publishDebounceMs: PUBLISH_DEBOUNCE_MS,
		afterSync: options.afterSync,
	});
}

/**
 * One full copy round for `host`: through the started worker's lane when there is one
 * (it joins a queued sync), else directly (a CLI process — the advisory lock orders it
 * against the server).
 */
export function syncMediaCopyHost(host: string): Promise<CopyApplyReport | null> {
	const worker = activeMediaCopyWorker();
	return worker === null ? syncHost(host, []) : worker.sync(host);
}

export type MediaCopyHostPlan = { takesCopy: false } | { takesCopy: true; plan: CopyPlan };

/**
 * The DRY decision's copy-mode io: Task 9's rule (the agent's word; unreachable → the
 * last PROVEN runtime state) with NO n/a write — a dry reconcile must never change the
 * runtime file or the agent.
 */
const DRY_TAKES_COPY_IO: TakesCopyIo = {
	status: (name) => hostStatus(name),
	lastState: async (name) => explicitCopyState((await loadRuntime())[name]?.media_copy),
	markNotCopy: async () => {},
};

/** hostTakesCopy (no n/a write) + planCopy. Writes nothing but the local sha cache. */
export async function planMediaCopyHost(host: string): Promise<MediaCopyHostPlan> {
	if (!(await hostTakesCopy(host, DRY_TAKES_COPY_IO))) return { takesCopy: false };
	return { takesCopy: true, plan: await planCopy(host) };
}
