/**
 * TRIPWIRE: human-tool write handlers scope-check EVERY record they write
 * (TOOLS-01, 2026-07-28 audit) — the human-registry counterpart of
 * mcp_write_scope_tripwire.
 *
 * tool_propagate_component_data checks a permission gate ONCE against the
 * client-declared (section_tipo, component_tipo), then writes to whatever rows a
 * separate client SQO returns — rows that can address a DIFFERENT, non-projects-
 * gated section (dd128 users) which buildSearchSql does not narrow. Without a
 * per-ROW authorization a tool-granted editor writes an arbitrary component
 * (dd515 developer, dd133 password) onto records they cannot reach → admin.
 *
 * A true behavioural proof needs a partial-grant principal + a cross-section
 * fixture; this is pinned as a SOURCE INVARIANT (deterministic + credless, the
 * pattern the audit remediations use): the write loop must authorize each row
 * (principalCanAccessRecord) BEFORE the persistRecordKeys write. Deleting the
 * security lines fails here, not in production.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('TOOLS-01 — propagate_component_data authorizes every write target', () => {
	const src = read('tools/tool_propagate_component_data/server/index.ts');

	test('the write loop scope-checks each row before persistRecordKeys', () => {
		// Scope to the per-row loop body: an earlier persistRecordKeys writes the
		// tool's OWN bulk-process bookkeeping record (createBulkProcess), not a
		// user-targeted data write — the loop over `rows` is the vulnerable write.
		const loopSrc = src.slice(src.indexOf('for (const row of rows)'));
		const scopeAt = loopSrc.indexOf('principalCanAccessRecord(row.section_tipo');
		const writeAt = loopSrc.indexOf('persistRecordKeys(');
		expect(
			scopeAt,
			'per-row principalCanAccessRecord(row…) must exist in the loop',
		).toBeGreaterThan(-1);
		expect(writeAt, 'the data write persistRecordKeys must exist in the loop').toBeGreaterThan(-1);
		// The scope check precedes the data write in source order (same loop body).
		expect(scopeAt).toBeLessThan(writeAt);
	});

	test('the write loop re-checks component write-permission on the ROW section', () => {
		// getPermissions(principal, row.section_tipo, componentTipo) — the ACTUAL
		// target section, not the client-declared section_tipo.
		expect(src.includes('getPermissions(principal, row.section_tipo, componentTipo)')).toBe(true);
	});
});

describe('TOOLS-02 — export applies the read ACL before it reads records', () => {
	const src = read('src/diffusion/export/grid.ts');

	test('read permission (Gate A+B) is checked BEFORE buildSearchSql', () => {
		// The tool gate only checks the DECLARED section; the export reads whatever
		// options.sqo targets and emits whatever ddo paths ask for. Without this,
		// dd133 password hashes / dd996 API keys (not projects-gated) leak.
		const gateAt = src.indexOf('getPermissions(context.principal, targetSectionTipo');
		const readAt = src.indexOf('buildSearchSql(sqo');
		expect(gateAt, 'per-SQO-section getPermissions must exist').toBeGreaterThan(-1);
		expect(readAt, 'buildSearchSql read must exist').toBeGreaterThan(-1);
		expect(gateAt).toBeLessThan(readAt);
	});

	test('every exported ddo-path component is permission-checked', () => {
		expect(
			src.includes('getPermissions(context.principal, seg.section_tipo, seg.component_tipo)'),
		).toBe(true);
	});
});
