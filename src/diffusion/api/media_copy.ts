/**
 * DIFFUSION FACADE — the media copy target (PUBLICATION_HOST_SPEC §5.2, phase 5).
 * The ONE legal door for server.ts (boot wiring) and core (the publication_hosts
 * widget) to reach the copy worker (boundary_seam_tripwire: facade-only).
 */

import { loadRegistry } from '../../core/publication_host/registry.ts';
import { syncHost, withdrawNow } from '../targets/mediastore/media_copy.ts';
import type { CopyApplyReport } from '../targets/mediastore/media_copy_apply.ts';
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
