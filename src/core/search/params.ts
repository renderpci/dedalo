/**
 * Search params model — positional prepared-statement values (spec §7.7).
 *
 * PHP reference: trait.utils.php get_placeholder (:567) and
 * trait.where.php parse_search_object_sql (:539).
 *
 * Contract:
 * - `params` is a 0-indexed sequential list; `$N` ↔ params[N-1].
 * - getPlaceholder DEDUPS with STRICT comparison (PHP array_search(…, true)):
 *   1 (number) never collapses with '1' (string) or true — distinct typed
 *   values must produce distinct placeholders.
 * - Component builders emit `sentence` fragments with named `_Q1_`/`_Q2_`
 *   tokens plus a token→value map; substitute() swaps tokens for `$N`
 *   placeholders, registering values in insertion order.
 */

export class ParamsCollector {
	private readonly values: unknown[] = [];

	/** Register a value (strict-dedup) and return its '$N' placeholder. */
	getPlaceholder(value: unknown): string {
		// Strict search: types must match exactly (mirrors PHP array_search strict).
		let index = this.values.findIndex((existing) => existing === value);
		if (index === -1) {
			this.values.push(value);
			index = this.values.length - 1;
		}
		return `$${index + 1}`;
	}

	/**
	 * Resolve a component fragment: replace each named token (e.g. '_Q1_')
	 * with a positional placeholder for its value. Token iteration follows the
	 * map's insertion order, which must match token order in the sentence
	 * (same contract as the PHP builders).
	 */
	substitute(sentence: string, tokenValues: Record<string, unknown>): string {
		let resolved = sentence;
		for (const [token, value] of Object.entries(tokenValues)) {
			resolved = resolved.replaceAll(token, this.getPlaceholder(value));
		}
		return resolved;
	}

	/** The bound values, in placeholder order ($1 first). */
	toArray(): unknown[] {
		return [...this.values];
	}
}
