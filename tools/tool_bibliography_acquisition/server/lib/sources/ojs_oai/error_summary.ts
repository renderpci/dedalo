/**
 * describeFailure — the one place a door-holding module in this source may turn an unknown caught
 * value into display text. Kept in its own file (imports NO outbound door) so acquisition.ts
 * (which imports harvestFetch) never itself carries a literal property read off an error/result
 * object in its own source — the tool-wide rule a door holder's file must honor
 * (ssrf_one_guard_tripwire, docs/development/tools/security.md item 7).
 */

import { toDedaloError, toErrorBody } from '../../../../../../src/core/errors/index.ts';

export function describeFailure(error: unknown): string {
	return toErrorBody(toDedaloError(error)).message;
}
