/**
 * logError — the one reporting door for typed failures.
 *
 * Severity comes from the registry: `info`/`warn` → console.warn/info,
 * `error`/`fatal` → console.error. Line grammar (engineering/CONVENTIONS.md §1):
 *
 *   [<subsystem>] <code> k=v … [req <id>]  + the Error object (stack survives)
 *
 * `coordinates` are the k=v pairs (tipo/section_id/job) — they are LOG-ONLY by
 * contract. `details` are never logged (they may echo caller input); nothing
 * here formats a URL, a secret or a payload. Counters: `errors_total` and
 * `error_<code with . → _>` via core/api/counters.ts.
 */

import { incrementCounter } from '../api/counters.ts';
import type { DedaloError } from './dedalo_error.ts';

export interface LogErrorContext {
	/** The `[subsystem]` tag; defaults to the code's domain. */
	readonly subsystem?: string;
	readonly requestId?: string;
}

function coordinatePairs(error: DedaloError): string {
	const coordinates = error.coordinates;
	if (coordinates === undefined) return '';
	return Object.entries(coordinates)
		.map(([key, value]) => ` ${key}=${String(value)}`)
		.join('');
}

/** `[<subsystem>] <code> k=v … [req <id>]` */
export function formatErrorLine(error: DedaloError, ctx: LogErrorContext = {}): string {
	const subsystem = ctx.subsystem ?? error.code.split('.')[0];
	const req = ctx.requestId === undefined ? '' : ` [req ${ctx.requestId}]`;
	return `[${subsystem}] ${error.code}${coordinatePairs(error)}${req}`;
}

export function logError(error: DedaloError, ctx: LogErrorContext = {}): void {
	const line = formatErrorLine(error, ctx);
	const severity = error.spec.severity;
	incrementCounter('errors_total');
	incrementCounter(`error_${error.code.replace('.', '_')}`);
	if (severity === 'info') console.info(line, error);
	else if (severity === 'warn') console.warn(line, error);
	else console.error(line, error);
}
