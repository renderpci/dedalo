import { DedaloError, type DedaloErrorCode } from '@dedalo/mcp-common';
import type { StructuredErr } from './output.js';

/**
 * Map a Dédalo error code to an actionable hint for the MCP client / LLM.
 */
function hintFor(code: DedaloErrorCode): string | undefined {
	switch (code) {
		case 'permissions_denied':
			return 'The logged Dédalo user does not have permission for this action. Switch to a user whose profile grants it, or ask an administrator to adjust the profile.';
		case 'not_logged':
			return 'The MCP session expired. It should auto-recover on the next call; if it persists, verify DEDALO_WORK_USERNAME and DEDALO_WORK_PASSWORD.';
		case 'csrf_failed':
			return 'CSRF token rejected. Retry the call; the client will fetch a fresh token automatically.';
		case 'invalid_action':
		case 'invalid_api_class':
			return 'The requested action is not exposed on this Dédalo instance. Discover valid actions with `dedalo_get_environment` and `dedalo_get_ontology_info`.';
		case 'login_failed':
			return 'Check DEDALO_WORK_USERNAME and DEDALO_WORK_PASSWORD. The user must exist in Dédalo and be allowed to log in.';
		case 'maintenance_mode':
			return 'Dédalo is in maintenance mode. Wait until the administrator exits maintenance mode.';
		case 'update_lock':
			return 'The record is locked by another session. Wait and retry, or use `dedalo_update_lock_state` to release the lock if you own it.';
		case 'db_connection_failed':
			return 'The Dédalo server could not reach its database. This is a server-side issue; check DB logs.';
		case 'network_error':
			return 'Could not reach the Dédalo server. Verify DEDALO_WORK_API_URL is correct and the server is running.';
		case 'invalid_request':
			return 'The request shape was rejected by Dédalo. Review the input against the tool schema.';
		default:
			return undefined;
	}
}

/**
 * Wrap any thrown value into a structured error payload for MCP tool output.
 */
export function wrapError(err: unknown): StructuredErr {
	if (err instanceof DedaloError) {
		const out: StructuredErr = {
			ok: false,
			error: {
				code: err.code,
				message: err.message,
			},
		};
		const hint = hintFor(err.code);
		if (hint) out.error.hint = hint;
		return out;
	}
	const message = err instanceof Error ? err.message : String(err);
	return {
		ok: false,
		error: {
			code: 'unknown',
			message,
		},
	};
}
