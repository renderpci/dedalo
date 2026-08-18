/**
 * TOOL PICKER WIRING TRIPWIRE — the server's picker-link table
 * (`src/core/tools/picker_wiring.ts`) stays married to the client behaviour it
 * mirrors (`tools/<tool>/js/**`).
 *
 * WHY IT EXISTS. `relations/picker_constraint.ts` widens a WRITE gate from that
 * table: a section a tool wires into a relation component becomes a legitimate
 * target of that component even though its own request_config never names it
 * (WC-2026-08-14-relation-insert-target-validation, addendum 2026-08-17). The
 * fact being mirrored lives in the tool's JS, in the two spellings
 * {@link linkerRolesAssignedIn} reads. Two copies of a fact, one of which
 * decides what may be written, is the drift shape this codebase refuses to
 * leave ungated (DEC-12): a table entry the JS abandoned is a standing
 * over-grant nobody would notice, and a JS wiring with no entry is the
 * `off_target` refusal this whole change exists to remove — reappearing
 * silently for the next tool.
 *
 * WHAT IT PROVES, honestly. That the two SETS of roles agree, in both
 * directions, plus that every declared role name actually occurs in the tool's
 * code. It does NOT prove the JS publishes source→linker in the declared
 * DIRECTION — that would need to interpret the tool's control flow. The
 * behavioural twin is the write door's own gate
 * (`relation_insert_target_native.test.ts`, the tool-declared cases).
 *
 * Both failure directions were verified by mutation when this landed: deleting
 * the tool_cataloging entry, and pointing tool_indexation's three wirings at
 * another role, each reddens its own case.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_PICKER_WIRING } from '../../src/core/tools/picker_wiring.ts';

const TOOLS_DIR = join(import.meta.dir, '../../tools');

/** Every `.js` under a tool's js/ tree, recursively. */
function toolSources(toolName: string): { path: string; code: string }[] {
	const root = join(TOOLS_DIR, toolName, 'js');
	const files: { path: string; code: string }[] = [];
	const walk = (dir: string): void => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) walk(path);
			else if (entry.endsWith('.js')) files.push({ path, code: readFileSync(path, 'utf8') });
		}
	};
	walk(root);
	return files;
}

/** The tool directories that carry a js/ tree. */
function toolNames(): string[] {
	return readdirSync(TOOLS_DIR).filter((name) => {
		try {
			return statSync(join(TOOLS_DIR, name, 'js')).isDirectory();
		} catch {
			return false;
		}
	});
}

/** Comments out — the wiring is DESCRIBED in prose beside the real thing. */
function stripComments(code: string): string {
	return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every role a tool's JS publishes picks INTO. TWO spellings, both live and
 * both semantically the same wiring — binding one of them is not a gate for
 * the invariant:
 *   - the direct assignment, `<instance>.linker = self.<role>`
 *     (tool_indexation.js:501, :753);
 *   - the picker option, `attach_picker(area, { linker: self.<role> })`
 *     (tool_indexation.js:526, tool_cataloging.js:316 — and the comment there
 *     calls it "the same one wiring tool_indexation uses", i.e. the growing
 *     convention). This shape was invisible to the gate's first version, which
 *     left tool_cataloging wired-but-undeclared while the gate stayed green.
 * `\blinker` keeps `caller_linker`-style names out (an underscore is a word
 * character, so there is no boundary there).
 */
function linkerRolesAssignedIn(code: string): Set<string> {
	const roles = new Set<string>();
	for (const match of stripComments(code).matchAll(/\blinker\s*[:=]\s*self\.([A-Za-z_]\w*)/g)) {
		const role = match[1];
		if (role !== undefined) roles.add(role);
	}
	return roles;
}

describe('tool picker wiring — the table mirrors the tool JS', () => {
	test('every DECLARED linker role is actually wired in that tool’s JS', () => {
		for (const [toolName, pairs] of Object.entries(TOOL_PICKER_WIRING)) {
			const sources = toolSources(toolName);
			expect(
				sources.length,
				`${toolName}: declares picker wiring but has no js/ sources`,
			).toBeGreaterThan(0);
			const assigned = new Set<string>();
			for (const source of sources) {
				for (const role of linkerRolesAssignedIn(source.code)) assigned.add(role);
			}
			for (const pair of pairs) {
				expect(
					[...assigned],
					`${toolName}: picker_wiring declares linkerRole '${pair.linkerRole}', but no ` +
						`'linker = self.${pair.linkerRole}' wiring (assignment or attach_picker option) ` +
						`exists in tools/${toolName}/js. ` +
						'A table entry the JS abandoned is a standing write-target over-grant.',
				).toContain(pair.linkerRole);
			}
		}
	});

	test('every WIRED linker role is declared in the table', () => {
		let assignments = 0;
		for (const toolName of toolNames()) {
			const declared = new Set((TOOL_PICKER_WIRING[toolName] ?? []).map((pair) => pair.linkerRole));
			for (const source of toolSources(toolName)) {
				for (const role of linkerRolesAssignedIn(source.code)) {
					assignments += 1;
					expect(
						[...declared],
						`${source.path}: wires 'linker = self.${role}', which src/core/tools/picker_wiring.ts ` +
							`does not declare for '${toolName}'. The write door will refuse those picks ` +
							'(relation.insert_refused / off_target) unless the pair is declared.',
					).toContain(role);
				}
			}
		}
		// Anti-vacuity: the live tree HAS such wiring (tool_indexation). Zero
		// matches means the shape moved and this gate went blind.
		expect(
			assignments,
			'no `linker = self.<role>` wiring found in tools/ — regex stale?',
		).toBeGreaterThan(0);
	});

	test('every declared SOURCE role occurs in that tool’s CODE (not its prose)', () => {
		// The direction (source publishes INTO linker) is beyond a source scan;
		// what is provable is that the role name is one the tool actually reads.
		// Comments stripped here too — a role that survives only in documentation
		// is a stale declaration, even though its failure direction is safe (it
		// can only under-grant).
		for (const [toolName, pairs] of Object.entries(TOOL_PICKER_WIRING)) {
			const code = toolSources(toolName)
				.map((source) => stripComments(source.code))
				.join('\n');
			for (const pair of pairs) {
				expect(
					code.includes(pair.sourceRole),
					`${toolName}: picker_wiring declares sourceRole '${pair.sourceRole}', a role name that ` +
						'appears nowhere in the tool’s JS.',
				).toBe(true);
			}
		}
	});
});
