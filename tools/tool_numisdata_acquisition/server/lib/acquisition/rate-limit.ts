/**
 * Process-wide, per-host request pacing. Biddr's robots.txt specifies `Crawl-delay: 3` for the
 * default user-agent group - we honor that as a floor between any two requests to the same host,
 * regardless of which acquisition run triggered them.
 */
const DEFAULT_MIN_INTERVAL_MS = 3000;

const lastRequestAt = new Map<string, number>();

export async function waitForTurn(
	hostname: string,
	minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
): Promise<void> {
	const last = lastRequestAt.get(hostname) ?? 0;
	const elapsed = Date.now() - last;
	const remaining = minIntervalMs - elapsed;
	if (remaining > 0) {
		await new Promise((resolve) => setTimeout(resolve, remaining));
	}
	lastRequestAt.set(hostname, Date.now());
}
