/**
 * THE PER-COMPONENT HALF OF IDENTIFICATION'S ACCESS CONTROL.
 *
 * Every identification answer QUOTES other records' values back — a match
 * outcome says "both 'Athena'", a proposal names the neighbours that voted, a
 * cluster states what its members agree on. The record-level gate
 * (`security/record_scope.ts` scopeRecordHits) only says the caller may OPEN
 * that record; dd774 grants are per-(section, component), and a criterion path
 * reads a specific component, frequently in a different section entirely (a
 * coin's legend lives on its Type). So the record gate is necessary and not
 * sufficient, and the second question has to be asked per criterion.
 *
 * It lives HERE, in core, rather than inside one consumer, because there are now
 * two of them (`ai/identify/propose.ts`'s vote and `ai/identify/cluster.ts`'s
 * consensus) and a duplicated security gate is the exact shape of rule that
 * rots: one copy gets a fix, the other keeps leaking. One definition, one place
 * to audit, one place to tighten.
 */

import { getPermissions, type Principal } from '../security/permissions.ts';
import type { Criterion } from './types.ts';

/**
 * Per-(section, component) read level — `getPermissions` in production, a fake
 * in tests. Injected so the RULE can be tested without a permissions fixture.
 */
export type ComponentGrant = (
	principal: Principal,
	sectionTipo: string,
	componentTipo: string,
) => Promise<number>;

/**
 * May this principal read the components this criterion actually touches on this
 * record?
 *
 * TWO checks, because a criterion path LEAVES the record: the ENTRY component
 * (the one stored on the record itself — the hop out) and the LEAF component
 * (the one whose value would be quoted). A single-step path is both, and is
 * checked once. Intermediate hops are not re-checked: reaching them is the
 * entry component's own disclosure, and the value that travels is the leaf's.
 *
 * An empty path is a refusal, not a pass — fail closed.
 */
export async function criterionReadableOn(
	criterion: Criterion,
	record: { sectionTipo: string },
	principal: Principal,
	grant: ComponentGrant = getPermissions,
): Promise<boolean> {
	const entry = criterion.path[0];
	if (entry === undefined) return false;
	if ((await grant(principal, record.sectionTipo, entry.component_tipo)) < 1) return false;

	const leaf = criterion.path[criterion.path.length - 1];
	if (leaf === undefined || leaf === entry) return true;
	return (await grant(principal, leaf.section_tipo, leaf.component_tipo)) >= 1;
}
