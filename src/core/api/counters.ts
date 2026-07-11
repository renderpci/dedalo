/**
 * In-process operational counters + the admin counters endpoint (audit S2-37).
 *
 * A tiny process-lifetime counter registry (no persistence, no cardinality —
 * plain named integers) plus GET /api/v1/counters, which aggregates the gauges
 * that already exist piecemeal across subsystems: diffusion queue depths, the
 * media job manager's headroom, background tool jobs, request totals/latency
 * from the access-log path, and the DB-pool saturation counter (fed by the db
 * layer via recordPoolWait — wiring inside core/db/postgres.ts is WS-A's).
 *
 * SECURITY: the endpoint is session-gated AND global-admin-only — counters
 * leak operational shape (job names, load), never record data. Fail-closed
 * 404 like every other admin surface (no existence leak).
 */

import { SESSION_COOKIE, getSession } from '../security/session_store.ts';
import { getProcessPoison } from './process_health.ts';

const counters = new Map<string, number>();

/**
 * Named gauge providers, registered at BOOT by the subsystems that own them
 * (the cache_invalidation inversion pattern): core/api must not import
 * src/diffusion — the diffusion boundary tripwire allows exactly two seams —
 * so startServer's diffusion boot chain registers the diffusion gauge here.
 */
type GaugeProvider = () => Promise<Record<string, unknown>> | Record<string, unknown>;
const gaugeProviders = new Map<string, GaugeProvider>();

export function registerOpsGauge(name: string, provider: GaugeProvider): void {
	gaugeProviders.set(name, provider);
}

/** Request latency aggregate (count/total/max — enough for "is it slow now"). */
const latency = { count: 0, totalMs: 0, maxMs: 0 };

export function incrementCounter(name: string, by = 1): void {
	counters.set(name, (counters.get(name) ?? 0) + by);
}

/** Feed one finished request into the aggregates (called by access_log.ts). */
export function observeRequest(status: number, ms: number): void {
	incrementCounter('requests_total');
	if (status >= 500) incrementCounter('requests_5xx');
	else if (status >= 400) incrementCounter('requests_4xx');
	latency.count += 1;
	latency.totalMs += ms;
	if (ms > latency.maxMs) latency.maxMs = ms;
}

/**
 * DB pool saturation hook (S2-32): the db layer calls this whenever a query
 * had to WAIT for a pooled connection. Exposed here so postgres.ts (WS-A's
 * file) can wire it with a one-line import.
 */
export function recordPoolWait(waitedMs: number): void {
	incrementCounter('db_pool_waits');
	incrementCounter('db_pool_wait_ms_total', Math.round(waitedMs));
}

/** Snapshot of the plain counters (tests + endpoint). */
export function getCounters(): Record<string, number> {
	return Object.fromEntries(counters.entries());
}

/** Reset (tests only). */
export function resetCountersForTests(): void {
	counters.clear();
	latency.count = 0;
	latency.totalMs = 0;
	latency.maxMs = 0;
}

/** The full aggregated payload served by the endpoint. */
export async function collectOpsCounters(): Promise<Record<string, unknown>> {
	const payload: Record<string, unknown> = {
		ts: new Date().toISOString(),
		pid: process.pid,
		uptime_s: Math.round(process.uptime()),
		rss_bytes: process.memoryUsage().rss,
		// TDZ poison latch (process_health.ts): poisoned=true means /health is
		// already 503 and the watchdog is about to recycle this process.
		process_poison: getProcessPoison(),
		counters: getCounters(),
		requests: {
			count: latency.count,
			avg_ms: latency.count > 0 ? Math.round((latency.totalMs / latency.count) * 10) / 10 : 0,
			max_ms: Math.round(latency.maxMs * 10) / 10,
		},
	};
	// Each gauge source is best-effort: a broken subsystem must not take the
	// diagnostics endpoint down with it (that is when it is needed most).
	for (const [name, provider] of gaugeProviders) {
		try {
			payload[name] = await provider();
		} catch (error) {
			payload[name] = { error: (error as Error).message };
		}
	}
	try {
		const { mediaJobs } = await import('../media/jobs.ts');
		payload.media_jobs = { has_headroom: mediaJobs.hasHeadroom() };
	} catch (error) {
		payload.media_jobs = { error: (error as Error).message };
	}
	try {
		const { getBackgroundJobStats } = await import('../tools/background.ts');
		payload.background_jobs = getBackgroundJobStats();
	} catch (error) {
		payload.background_jobs = { error: (error as Error).message };
	}
	return payload;
}

/**
 * GET /api/v1/counters — session-gated, global-admin-only diagnostics.
 * Anything short of an admin session answers a plain 404 (fail-closed).
 */
export async function handleCountersRequest(request: Request): Promise<Response> {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const token = cookieHeader
		.split(';')
		.map((pair) => pair.trim())
		.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
		?.slice(SESSION_COOKIE.length + 1);
	const session = token !== undefined ? getSession(token) : null;
	if (session === null || session.isGlobalAdmin !== true) {
		return new Response(JSON.stringify({ result: false, msg: 'Not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	return new Response(JSON.stringify(await collectOpsCounters(), null, '\t'), {
		status: 200,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}
