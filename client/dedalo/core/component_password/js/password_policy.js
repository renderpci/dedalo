// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
 * PASSWORD_POLICY
 * The ONE password policy of the engine — client AND server.
 *
 * A pure module (no DOM, no imports, no globals) so the same bytes run in the
 * browser (component_password live checklist, installer root password, login
 * recovery form) and in Bun (src/core/security/password_policy.ts, which refuses
 * a non-conforming plaintext on every write door before it is hashed). One
 * evaluator, so what the user sees ticked green is exactly what the server
 * accepts. Gate: test/unit/password_policy_native.test.ts.
 *
 * Length is counted in code points (not UTF-16 units) and the character classes
 * are Unicode-aware: a heritage institution's users type ñ, ç, ü, Ω…
 *
 * Each rule has a stable `id` (wire value of `validation.password_policy`
 * details.rule) and a `label` key in src/core/labels/master.json; `params` fill
 * the label's ${placeholders}.
 */
export const PASSWORD_POLICY = Object.freeze({
	min_length: 8,
	max_length: 64,
	// forbidden substrings, case-insensitive
	banned_words: Object.freeze([
		'password',
		'contraseña',
		'clave',
		'mynew2pass5k',
		'dios',
		'micontraseña',
	]),
	// forbidden characters
	banned_chars: Object.freeze(['&']),
	// runs of this many consecutive letters/digits (abcd, 1234) are refused
	sequence_length: 4,
});

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789'];

/**
 * PASSWORD_RULES
 * Ordered rule list. `test(pw, chars)` → true when the rule is met.
 * The order is the display order and the order the first failure is reported in.
 */
export const PASSWORD_RULES = Object.freeze([
	{
		id: 'length',
		label: 'password_rule_length',
		params: { min: PASSWORD_POLICY.min_length, max: PASSWORD_POLICY.max_length },
		test: (pw, chars) =>
			chars.length >= PASSWORD_POLICY.min_length && chars.length <= PASSWORD_POLICY.max_length,
	},
	{
		id: 'lower',
		label: 'password_rule_lower',
		test: (pw) => /\p{Ll}/u.test(pw),
	},
	{
		id: 'upper',
		label: 'password_rule_upper',
		test: (pw) => /\p{Lu}/u.test(pw),
	},
	{
		id: 'digit',
		label: 'password_rule_digit',
		test: (pw) => /\p{Nd}/u.test(pw),
	},
	{
		id: 'banned_chars',
		label: 'password_rule_banned_chars',
		params: { chars: PASSWORD_POLICY.banned_chars.join(' ') },
		test: (pw) => !PASSWORD_POLICY.banned_chars.some((c) => pw.includes(c)),
	},
	{
		id: 'banned_words',
		label: 'password_rule_banned_words',
		test: (pw) => {
			const lower = pw.toLowerCase();
			return !PASSWORD_POLICY.banned_words.some((w) => lower.includes(w));
		},
	},
	{
		id: 'sequence',
		label: 'password_rule_sequence',
		params: { n: PASSWORD_POLICY.sequence_length },
		test: (pw) => {
			const n = PASSWORD_POLICY.sequence_length;
			const lower = pw.toLowerCase();
			for (let i = 0; i + n <= lower.length; i++) {
				const chunk = lower.slice(i, i + n);
				if (SEQUENCES.some((seq) => seq.includes(chunk))) {
					return false;
				}
			}
			return true;
		},
	},
]);

/**
 * CHECK_PASSWORD
 * Evaluate every rule against a candidate plaintext.
 * An empty value is NOT evaluated here: whether "empty" means "no change" or
 * "remove the password" is the caller's decision, not the policy's.
 * @param {string} pw
 * @return {{valid: boolean, failed: string|null, rules: Array<{id: string, label: string, params: Object, ok: boolean}>}}
 */
export const check_password = function (pw) {
	const value = typeof pw === 'string' ? pw : '';
	const chars = Array.from(value);

	const rules = PASSWORD_RULES.map((rule) => ({
		id: rule.id,
		label: rule.label,
		params: rule.params || {},
		ok: rule.test(value, chars),
	}));
	const first_failed = rules.find((el) => el.ok === false);

	return {
		valid: !first_failed,
		failed: first_failed ? first_failed.id : null,
		rules: rules,
	};
}; //end check_password

// @license-end
