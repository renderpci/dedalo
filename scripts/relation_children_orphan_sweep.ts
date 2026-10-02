/**
 * ============================================================================
 * COMPONENT_RELATION_CHILDREN ORPHAN-BYTES SWEEP — CLI shell over
 * src/core/relations/children_orphan_sweep.ts
 * (WC-2026-10-02-relation-children-write-through).
 * ============================================================================
 *
 * Before 2026-10-02 a save on a Children field stored the client's links under
 * the children tipo in the parent record's own `relation` column — bytes no
 * read ever consults (the field's value is computed from the children's parent
 * links). This finds those leftover keys on the installation's database and,
 * with --apply, removes them through the write chokepoint. Nothing any read
 * serves changes.
 *
 * USAGE (dry-run is the default and prints every key with the bytes it holds —
 * keep that report: it is the record of what --apply removes):
 *
 *     bun scripts/relation_children_orphan_sweep.ts
 *     bun scripts/relation_children_orphan_sweep.ts --section hierarchy20
 *     bun scripts/relation_children_orphan_sweep.ts --apply
 */

import { sweepRelationChildrenOrphans } from '../src/core/relations/children_orphan_sweep.ts';
import { SUPERUSER_ID } from '../src/core/security/permissions.ts';

function argValues(flag: string): string[] {
	const values: string[] = [];
	process.argv.forEach((arg, index) => {
		const next = process.argv[index + 1];
		if (arg === flag && next !== undefined) values.push(next);
	});
	return values;
}

const apply = process.argv.includes('--apply');
const sections = argValues('--section');

const result = await sweepRelationChildrenOrphans({
	apply,
	actor: SUPERUSER_ID,
	onlySections: sections.length > 0 ? sections : undefined,
	log: (line) => console.log(line),
});

console.log(
	`\nTOTAL: ${result.found.length} leftover key(s) under ${result.childrenTipos.length} children tipo(s) across ${result.tables.length} table(s)${
		apply ? ` — ${result.removed} removed` : ' — dry-run, pass --apply to remove'
	}`,
);
if (result.skippedTables.length > 0) {
	console.log(`(not matrix record tables, not searched: ${result.skippedTables.join(', ')})`);
}
process.exit(0);
