/**
 * dd_tools_api.tool_request dispatch (PHP dd_tools_api::tool_request).
 *
 * PHP loads the tool class file and reflects a static method behind ten ordered
 * gates. The TS engine keeps the same ORDER and semantics, but the reflection
 * gates (class-file resolve, public+static, signature) are structural: a tool's
 * server module is discovered by an allowlisted scan (loader.ts) and its actions
 * are typed functions, so "the method exists and is callable" is a Map lookup,
 * not runtime reflection.
 *
 * Gate order:
 *  1. options must be an object;
 *  2. the tool name must match ^tool_[a-z0-9_]+$ (reject before any lookup);
 *  3+4. the tool must be ACTIVE in dd1324 AND authorized for the calling user
 *       (admins get every active tool; non-admins the profile-granted dd1067 set
 *       plus always_active tools — PHP get_user_tools);
 *  5. the tool must have a loaded server module (PHP: class file resolves +
 *     realpath-confined require);
 *  6. the method must be in the module's apiActions (PHP API_ACTIONS allowlist);
 *  7. the action's declarative permission gate must pass — BEFORE any background
 *     fork (PHP invariant);
 *  8. execute: direct, or (background_running) via the background executor,
 *     which additionally enforces the BACKGROUND_RUNNABLE allowlist.
 *
 * The tool response REPLACES the API envelope wholesale — so it IS the API
 * envelope (envelope v2, engineering/ERRORS_SPEC.md §4): every gate here
 * REFUSES BY THROWING a registered `tool.*` / `perm.*` / `request.*` code
 * (converted by the dispatch chokepoint), and a tool action returns
 * `ok(data, {requestId, extend?})` — a body without `ok` is a bug the
 * dispatcher refuses (the P1-era legacy_body_adapter is DELETED).
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import { LEGACY_TOKEN_MAP } from '../errors/registry.ts';
import type { Principal } from '../security/permissions.ts';
import { scheduleBackground } from './background.ts';
import {
	BACKGROUND_JOB_STATUS_ACTION,
	BACKGROUND_JOBS_ACTION,
	backgroundJobStatusResponse,
	backgroundJobsResponse,
} from './job_status.ts';
import { getLoadedTool } from './loader.ts';
import type { ToolResponse } from './module.ts';
import { getUserTools } from './registry.ts';
import { assertActionPermission, resolveAction } from './security.ts';

const TOOL_NAME_PATTERN = /^tool_[a-z0-9_]+$/;

/** Gates 3+4: an admin sees every active tool, so for them an unknown name IS an invalid name. */
function unknownTool(principal: Principal, toolName: string): DedaloError {
	return new DedaloError(principal.isGlobalAdmin ? 'tool.invalid_name' : 'tool.not_authorized', {
		coordinates: { tool: toolName },
	});
}

/**
 * Gate 7: security.ts still answers with a legacy token (`unauthorized` →
 * perm.denied / `invalid_request` → request.invalid); mapped here until its
 * own sweep makes it throw.
 */
function permissionRefusal(
	permission: { msg: string; errors: string[] },
	toolName: string,
	toolMethod: string,
): DedaloError {
	const token = permission.errors[0];
	return new DedaloError(LEGACY_TOKEN_MAP[token ?? ''] ?? 'perm.denied', {
		publicMessage: permission.msg,
		coordinates: { tool: toolName, method: toolMethod },
	});
}

/**
 * Dispatch one tool_request RQO through all gates. `source.model` names the
 * tool, `source.action` the method, `options` are the method arguments.
 */
export async function dispatchToolRequest(
	principal: Principal,
	userId: number,
	source: { model?: unknown; action?: unknown },
	options: unknown,
	clientIp?: string,
): Promise<ToolResponse> {
	// Gate 1: options must be an object (PHP rejects non-object overrides).
	if (options !== undefined && (typeof options !== 'object' || options === null)) {
		throw new DedaloError('request.invalid_options', { publicMessage: 'Invalid options type' });
	}
	const toolName = typeof source.model === 'string' ? source.model : '';
	const toolMethod = typeof source.action === 'string' ? source.action : '';

	// Gate 2: strict tool-name shape before ANY lookup (path/injection guard).
	if (!TOOL_NAME_PATTERN.test(toolName)) {
		throw new DedaloError('tool.invalid_name', { coordinates: { tool: toolName } });
	}

	// Gates 3 + 4: ACTIVE in dd1324 AND authorized for the calling user.
	const userTools = await getUserTools(userId, principal.isGlobalAdmin);
	// An admin sees every active tool, so for them an unknown name IS an
	// invalid name; a non-admin is refused authorization (no existence leak).
	if (!userTools.some((tool) => tool.name === toolName)) throw unknownTool(principal, toolName);

	// Framework status action (S2-16/DEC-22a): poll a background job started on
	// this tool. Served here — after the active+authorized gates, before the
	// module lookup — so every backgroundRunnable tool gets the wire without
	// per-module registration. The name is RESERVED (see job_status.ts).
	if (toolMethod === BACKGROUND_JOB_STATUS_ACTION) {
		return backgroundJobStatusResponse(
			toolName,
			principal,
			userId,
			(options ?? {}) as Record<string, unknown>,
		);
	}

	// The companion framework action: LIST the caller's jobs for this tool. It is
	// what lets a reloading client re-attach to a running job WITHOUT having
	// persisted its id (see job_status.ts BACKGROUND_JOBS_ACTION). Same reserved
	// name + same gates as the status action above.
	if (toolMethod === BACKGROUND_JOBS_ACTION) {
		return backgroundJobsResponse(
			toolName,
			principal,
			userId,
			(options ?? {}) as Record<string, unknown>,
		);
	}

	// Gate 5: the tool must have a loaded server module (PHP class-file resolve).
	const loaded = await getLoadedTool(toolName);
	if (loaded === undefined) {
		throw new DedaloError('tool.no_server_module', { coordinates: { tool: toolName } });
	}

	// Gate 6: explicit action registry (the TS API_ACTIONS allowlist).
	const spec = resolveAction(loaded.module, toolMethod);
	if (spec === null) {
		throw new DedaloError('tool.method_not_allowed', {
			details: { method: toolMethod },
			coordinates: { tool: toolName },
		});
	}

	// Gate 7: declarative permission gate BEFORE the handler / background fork.
	const optionRecord = (options ?? {}) as Record<string, unknown>;
	const permission = await assertActionPermission(spec, optionRecord, principal);
	if (!permission.ok) {
		throw permissionRefusal(permission, toolName, toolMethod);
	}

	// Gate 8: execute. A background request runs through the executor (which
	// enforces the BACKGROUND_RUNNABLE allowlist); otherwise run synchronously.
	if (optionRecord.background_running === true) {
		return scheduleBackground(loaded, toolMethod, spec, optionRecord, principal, userId, clientIp);
	}
	return spec.handler({ principal, userId, options: optionRecord, background: false, clientIp });
}
