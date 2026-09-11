import { USER_AGENT } from './user-agent.ts';

export { USER_AGENT };

interface RobotsRules {
	disallow: string[];
	crawlDelaySeconds: number | null;
}

const cache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Fetches and caches robots.txt for a host, returning the Disallow rules that apply to a
 * generic/unnamed user-agent ("*"). We only ever act on the "*" group - Biddr's robots.txt also
 * lists named-bot blocks (AhrefsBot,
 * SemrushBot, ...) which don't apply to an identifiable,
 * conservative client like this one.
 */
async function getRobotsRules(origin: string): Promise<RobotsRules> {
	const cached = cache.get(origin);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
		return cached.rules;
	}

	let rules: RobotsRules = { disallow: [], crawlDelaySeconds: null };
	try {
		const response = await fetch(new URL('/robots.txt', origin), {
			headers: { 'User-Agent': USER_AGENT },
			signal: AbortSignal.timeout(10_000),
		});
		if (response.ok) {
			rules = parseRobotsTxt(await response.text());
		}
	} catch {
		// Unreachable robots.txt does not imply permission to skip caution; default to no extra
		// disallow rules (empty), the caller still applies conservative rate limiting regardless.
	}

	cache.set(origin, { rules, fetchedAt: Date.now() });
	return rules;
}

function parseRobotsTxt(text: string): RobotsRules {
	const lines = text.split('\n').map((l) => l.trim());
	let inWildcardGroup = false;
	let groupSeenAgent = false;
	const disallow: string[] = [];
	let crawlDelaySeconds: number | null = null;

	for (const line of lines) {
		if (!line || line.startsWith('#')) continue;
		const [rawKey, ...rest] = line.split(':');
		const key = rawKey?.trim().toLowerCase();
		const value = rest.join(':').trim();
		if (!key) continue;

		if (key === 'user-agent') {
			// A new user-agent block starts; consecutive User-agent lines belong to the same group.
			if (!groupSeenAgent) inWildcardGroup = false;
			groupSeenAgent = true;
			inWildcardGroup = inWildcardGroup || value === '*';
			continue;
		}

		groupSeenAgent = false;

		if (inWildcardGroup && key === 'disallow' && value) {
			disallow.push(value);
		}
		if (inWildcardGroup && key === 'crawl-delay') {
			const seconds = Number.parseFloat(value);
			if (Number.isFinite(seconds)) crawlDelaySeconds = seconds;
		}
	}

	return { disallow, crawlDelaySeconds };
}

export async function isAllowedByRobots(url: URL): Promise<boolean> {
	const rules = await getRobotsRules(url.origin);
	return !rules.disallow.some((prefix) => url.pathname.startsWith(prefix));
}

export async function getCrawlDelayMs(url: URL): Promise<number | null> {
	const rules = await getRobotsRules(url.origin);
	return rules.crawlDelaySeconds !== null ? rules.crawlDelaySeconds * 1000 : null;
}
