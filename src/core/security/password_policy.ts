/**
 * PASSWORD POLICY — the server's enforcement of the ONE policy.
 *
 * The rules and their evaluator live in a pure client module
 * (`client/dedalo/core/component_password/js/password_policy.js`) so the browser's
 * live checklist and this refusal run the SAME bytes: a password the user sees
 * ticked green is exactly one the engine accepts. Until 2026-09-30 the policy was
 * client-only (any API/MCP/import write stored whatever arrived) and three doors
 * disagreed on the minimum (component 6, installer 8, recovery 8).
 *
 * Applied to NEW PLAINTEXT only — never to a stored Argon2 hash replayed verbatim,
 * never to a legacy v6 value being re-hashed (legacy_password.ts): an existing
 * credential is not re-judged, a new one is.
 *
 * Gate: test/unit/password_policy_native.test.ts.
 */
import { check_password } from '../../../client/dedalo/core/component_password/js/password_policy.js';
import { DedaloError } from '../errors/index.ts';

export {
	check_password,
	PASSWORD_POLICY,
} from '../../../client/dedalo/core/component_password/js/password_policy.js';

/** The id of the first rule `plaintext` breaks, or null when it conforms. */
export function passwordPolicyFailure(plaintext: string): string | null {
	return check_password(plaintext).failed;
}

/**
 * Throw `validation.password_policy` (details.rule = the first broken rule id)
 * unless `plaintext` conforms.
 */
export function assertPasswordPolicy(plaintext: string): void {
	const failed = passwordPolicyFailure(plaintext);
	if (failed !== null) {
		throw new DedaloError('validation.password_policy', { details: { rule: failed } });
	}
}
