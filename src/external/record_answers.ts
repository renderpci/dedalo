/**
 * THE RECORD-ENDPOINT WATCH — when "this record is not there" stops being
 * believable (2026-09-24).
 *
 * A record-path 400/404/410/422 is read as THAT RECORD's `not_found`
 * (cache.ts, WC-2026-09-24-external-record-4xx-is-not-found): the service
 * answered about one id. The breaker ignores it (breaker.ts evidence law), and
 * the export does not record it as degraded. Each of those readings is right for
 * ONE record. Together they hid a whole-endpoint failure: a wrong `api_url`
 * path, a moved or removed record route, or a changed id format answers 4xx for
 * EVERY id. Every cell then says "not found", nothing is logged or counted, the
 * circuit stays closed, and an export of 20 000 records reports itself complete
 * with every external column empty.
 *
 * THE RULE. Per (service, record endpoint), count the record-path 4xx answers
 * since the endpoint last DELIVERED a record answer (a 2xx, whatever it held).
 * Below `SUSPECT_STREAK` a 4xx keeps its per-record reading. At the streak the
 * endpoint is SUSPECT:
 *   - one line through the one door (`external.http_status`, with the streak and
 *     the statuses seen), repeated at most once per `REPORT_EVERY_MS` while the
 *     streak lasts, and the counter `external_record_endpoint_suspect`;
 *   - every further 4xx on that endpoint is read as the SOURCE failing
 *     (`unavailable`, reason `http_status` — retryable, not negative-cached), so
 *     a cell, a list and an export say "could not be read" instead of "not
 *     found", and the export is marked incomplete.
 * One delivered answer ends the episode: the endpoint demonstrably serves
 * records, so a 4xx is again about its record.
 *
 * WHY A STREAK AND NOT A RATIO. A missing record is ordinary; twenty in a row
 * with nothing delivered in between is not how a working catalogue answers.
 * Nothing is lost by the heuristic being wrong once: the cell says "could not be
 * read" and a re-run asks again — it never OPENS the circuit (a config error
 * behind `circuit_open` is what the breaker law forbids).
 *
 * THE KEY is the service + the endpoint's scheme, host and PATH (never the
 * query: it holds the id, the fields and possibly a credential). The path is in
 * it because a wrong path is one of the failures it exists for, and two sections
 * binding the same host through different paths must not share a verdict.
 *
 * LIFECYCLE of the one module-level map (module_state_tripwire +
 * external_isolation_tripwire allowlists): keyed by service + endpoint — never
 * session, user, principal or lang; an entry is DELETED by a delivered answer,
 * and every access PRUNES entries untouched for `PRUNE_AFTER_MS`. NOT factory
 * built: an ontology write says nothing about whether an endpoint answers
 * (a changed api_url lands on a new key by construction).
 */

import { incrementCounter } from '../core/api/counters.ts';
import { logExternalRecordEndpointSuspect } from './errors.ts';

/** Consecutive record-path 4xx answers, nothing delivered, that make an endpoint suspect. */
export const SUSPECT_STREAK = 20;

/** While an endpoint stays suspect, its line is repeated at most this often. */
const REPORT_EVERY_MS = 10 * 60_000;

/** An entry untouched this long is forgotten (bounded map). */
const PRUNE_AFTER_MS = 60 * 60_000;

interface EndpointStreak {
	/** Record-path 4xx answers since the last delivered one. */
	streak: number;
	/** How many of them per status. */
	statuses: Map<number, number>;
	/** Epoch ms the suspect line was last logged, or null (not yet). */
	reportedAt: number | null;
	touchedAt: number;
}

const recordAnswerStreaks = new Map<string, EndpointStreak>();

function keyOf(service: string, endpoint: string): string {
	return `${service}|${endpoint}`;
}

function prune(now: number): void {
	for (const [key, entry] of recordAnswerStreaks) {
		if (now - entry.touchedAt > PRUNE_AFTER_MS) recordAnswerStreaks.delete(key);
	}
}

/** How to read one record-path 4xx answer. */
export type RecordAnswerReading = 'record' | 'endpoint';

/**
 * One record-path 4xx answer from `endpoint`. Returns `'record'` while the
 * answer can be read as being about its record, `'endpoint'` once the endpoint
 * is suspect (the caller then reports the SOURCE as failing).
 */
export function noteRecordAnswer(
	service: string,
	endpoint: string,
	status: number,
	now: number = Date.now(),
): RecordAnswerReading {
	prune(now);
	const key = keyOf(service, endpoint);
	const entry = recordAnswerStreaks.get(key) ?? {
		streak: 0,
		statuses: new Map<number, number>(),
		reportedAt: null,
		touchedAt: now,
	};
	entry.streak++;
	entry.statuses.set(status, (entry.statuses.get(status) ?? 0) + 1);
	entry.touchedAt = now;
	recordAnswerStreaks.set(key, entry);
	if (entry.streak < SUSPECT_STREAK) return 'record';
	if (entry.reportedAt === null || now - entry.reportedAt >= REPORT_EVERY_MS) {
		entry.reportedAt = now;
		incrementCounter('external_record_endpoint_suspect');
		logExternalRecordEndpointSuspect({
			service,
			endpoint,
			streak: entry.streak,
			statuses: [...entry.statuses].sort(([a], [b]) => a - b),
		});
	}
	return 'endpoint';
}

/** The endpoint delivered a record answer (a 2xx): the episode, if any, ends. */
export function noteRecordDelivered(service: string, endpoint: string): void {
	recordAnswerStreaks.delete(keyOf(service, endpoint));
}

/** Test seam: forget every streak, so a gate starts from "nothing seen". */
export function resetRecordAnswersForTests(): void {
	recordAnswerStreaks.clear();
}

/** Read-only view for the gates and ops panels. */
export function recordAnswerSnapshot(): { key: string; streak: number; suspect: boolean }[] {
	return [...recordAnswerStreaks].map(([key, entry]) => ({
		key,
		streak: entry.streak,
		suspect: entry.streak >= SUSPECT_STREAK,
	}));
}
