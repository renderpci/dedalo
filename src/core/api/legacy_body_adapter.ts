/**
 * TRANSITIONAL — DELETED AT P1 EXIT.
 *
 * The bridge between the P1 chokepoint (every JSON body is envelope v2, made
 * by src/core/errors/convert.ts) and the handler bodies the call-site sweep
 * has not converted yet (`{result, msg, errors}` — the PHP fossil). It exists
 * so the chokepoint can land BEFORE the ~150 handler sweeps, and it is what
 * the P1-exit wire_envelope tripwire deletes: once no handler returns a
 * legacy body this file has no caller and is removed with its shells in
 * response.ts.
 *
 *  - a body that already carries `ok` passes through untouched;
 *  - a legacy FAILURE (`result === false`) becomes a THROW of the registered
 *    code (`LEGACY_TOKEN_MAP[errors[0]]`, else the status default, else
 *    `request.invalid`) — the dispatch catch converts it, so the wire is
 *    converter-made even for an unswept handler; the legacy `msg` is offered
 *    as `publicMessage` (reaches the wire ONLY for public-disclosure codes)
 *    and the rest of the body rides as extension keys (`start`'s
 *    `environment` on a refusal);
 *  - a legacy SUCCESS becomes `ok(data, {extend})`: `data` = the legacy top-
 *    level `data` when present (`{result:true, data}` bodies), else `result`;
 *    every other key (`msg` included — some clients read it) is an extension
 *    key; an EMPTY `errors: []` is dropped, a non-empty one is kept (a partial
 *    refusal such as delete's "has children" skip reasons — information the
 *    client reads today; its code, `record.delete_children_refused`, is the sweep's).
 *
 * Every conversion is LOGGED (error for failures, warn under DEDALO_DEV_MODE
 * for successes) with `<class>::<action>` so the sweep backlog is visible in
 * the console, never silent. No module-level state (module_state_tripwire).
 */

import { readEnv } from '../../config/env.ts';
import { ok } from '../errors/convert.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { type ErrorCode, LEGACY_TOKEN_MAP, specOf } from '../errors/registry.ts';
import type { ApiResult } from './response.ts';

export interface LegacyAdapterContext {
	readonly requestId: string;
	readonly apiClass: string;
	readonly action: string;
}

/**
 * The status a legacy refusal carried → the generic code of that category.
 * Used ONLY when `errors[0]` is not a LEGACY_TOKEN_MAP token.
 */
const STATUS_DEFAULT_CODE: Readonly<Record<number, ErrorCode>> = {
	400: 'request.invalid',
	401: 'auth.not_logged',
	403: 'perm.denied',
	404: 'resource.not_found',
	409: 'resource.conflict',
	429: 'rate.limited',
	500: 'internal.unexpected',
};

/**
 * `LEGACY_TOKEN_MAP[token]` — unless the legacy body carried a NON-2xx status
 * that disagrees with the token's registry status, in which case the status
 * wins (`unauthorized` at 401 meant "not logged" in install/engine.ts, at 403
 * "no permission": the map records the dominant meaning, the status the site's).
 * Then the status default; then `request.invalid`.
 */
export function legacyCodeFor(token: unknown, status: number): ErrorCode {
	const mapped = mappedToken(token);
	if (mapped !== undefined && statusAgrees(mapped, status)) return mapped;
	return STATUS_DEFAULT_CODE[status] ?? mapped ?? 'request.invalid';
}

function mappedToken(token: unknown): ErrorCode | undefined {
	return typeof token === 'string' ? LEGACY_TOKEN_MAP[token] : undefined;
}

/** A 2xx legacy status carries no information; a non-2xx one must match the code's. */
function statusAgrees(code: ErrorCode, status: number): boolean {
	return status < 300 || specOf(code).status === status;
}

function isLegacyBody(body: unknown): body is Record<string, unknown> {
	return typeof body === 'object' && body !== null && !Object.hasOwn(body, 'ok');
}

function firstToken(errors: unknown): unknown {
	return Array.isArray(errors) ? errors[0] : undefined;
}

/** A legacy `{result:false, msg, errors}` → the typed throw the catch converts. */
function throwLegacyFailure(
	status: number,
	body: Record<string, unknown>,
	ctx: LegacyAdapterContext,
): never {
	const { result: _result, msg, errors, ...rest } = body;
	const token = firstToken(errors);
	const code = legacyCodeFor(token, status);
	console.error(
		`[dispatch] LEGACY error body from ${ctx.apiClass}::${ctx.action} — sweep pending ` +
			`(status ${status}, token ${JSON.stringify(token ?? null)} → ${code}, msg ${JSON.stringify(msg ?? null)}) [req ${ctx.requestId}]`,
	);
	throw new DedaloError(code, {
		publicMessage: typeof msg === 'string' ? msg : undefined,
		extend: rest,
	});
}

/** A legacy success body → `ok(data, {extend})` (see the header for the data rule). */
function wrapLegacySuccess(
	body: Record<string, unknown>,
	ctx: LegacyAdapterContext,
): ApiResult['body'] {
	if (readEnv('DEDALO_DEV_MODE') === 'true') {
		console.warn(
			`[dispatch] LEGACY success body from ${ctx.apiClass}::${ctx.action} — sweep pending [req ${ctx.requestId}]`,
		);
	}
	const { result: legacyResult, errors, ...rest } = body;
	if (Array.isArray(errors) && errors.length > 0) rest.errors = errors;
	if (!Object.hasOwn(rest, 'data'))
		return ok(legacyResult, { requestId: ctx.requestId, extend: rest });
	const { data, ...extension } = rest;
	return ok(data, { requestId: ctx.requestId, extend: extension });
}

/**
 * Bring a handler's ApiResult onto envelope v2. Envelope bodies and streamed
 * results (the body is not serialized) pass through unchanged.
 */
export function adaptLegacyBody(result: ApiResult, ctx: LegacyAdapterContext): ApiResult {
	const body: unknown = result.body;
	if (result.stream !== undefined || !isLegacyBody(body)) return result;
	if (body.result === false) throwLegacyFailure(result.status, body, ctx);
	return { ...result, body: wrapLegacySuccess(body, ctx) };
}
