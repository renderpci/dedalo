/**
 * THE PRINCIPAL OF A LONG-LIVED JOB, RESOLVED NOW (closure Step 3, TOOLS-3).
 *
 * A session-bearing door is revoked by ending the account's sessions. A job that
 * OUTLIVES its request — a detached background poll that writes half an hour
 * after the enqueue — holds no session a revocation could end, so it must re-ask
 * the account itself before it acts, exactly as the MCP stdio server does per
 * call (ai/mcp/server.ts currentServicePrincipal):
 *
 *   - the dd131 account state FIRST (`readAccountStateById`): an `inactive`
 *     account (dd131 = No) and an `absent` one (the dd128 record deleted) are
 *     refused as `perm.denied` — a deactivation must stop the job even when the
 *     profile still grants the pair;
 *   - then the principal AFRESH (`resolvePrincipal`): the profile and admin flags
 *     as they stand now, for the write door the caller runs next.
 *
 * A MISSING dd131 datum is treated as active — the same measured decision the
 * login path takes (auth.ts isRefusedForInactivity), not a second rule.
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import { readAccountStateById } from './auth.ts';
import { type Principal, resolvePrincipal } from './permissions.ts';

/** The job's principal as it stands NOW. THROWS `perm.denied` for a deactivated or deleted account. */
export async function resolveLivePrincipal(userId: number, door: string): Promise<Principal> {
	const state = await readAccountStateById(userId);
	if (state === 'absent' || state === 'inactive') {
		throw new DedaloError('perm.denied', {
			message: `${door}: account ${userId} is ${state === 'absent' ? 'deleted' : 'deactivated'} — the job acts for nobody`,
			coordinates: { door, user_id: userId, account_state: state },
		});
	}
	return resolvePrincipal(userId);
}
