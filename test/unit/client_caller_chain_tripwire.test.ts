/**
 * CLIENT CALLER-CHAIN TRIPWIRE — an ancestor is found by MODEL, never by DEPTH.
 *
 * WHY THIS EXISTS. Client instances form a chain through `.caller`, and the
 * DEPTH from a component to its owning section is NOT a constant:
 *
 *   edit mode : component → section_group  → section
 *   list mode : component → section_record → section
 *
 * and a portal-embedded component is deeper still, reaching an OUTER section that
 * owns a different record set. `tool_propagate_component_data` hard-coded
 * `self.caller.caller?.caller`, so it resolved a section_group in list mode and
 * refused to open — which is why the tool was unusable from a section list, in
 * this engine and in the PHP oracle before it. Two more sites had the same shape
 * (tool_import_rdf, the oh media_icons widget).
 *
 * `get_caller_by_model` (client/dedalo/core/common/js/utils/util.js) is the one
 * correct way to do this. It is also CYCLE-SAFE, which matters concretely rather
 * than theoretically: `tool_common`'s new-window path sets `caller.caller = self`,
 * so the chain really is circular there and a hand-rolled `while` would hang the
 * tab.
 *
 * WHAT THIS BANS. Only the SEARCH shape: a fixed-depth `.caller.caller` walk on a
 * statement that is reaching for a section (binds/compares something section-ish,
 * or immediately dereferences `.rqo` / `.sqo` / `.get_total(`).
 *
 * WHAT THIS DELIBERATELY ALLOWS. Two-level SHAPE checks — `ui.inside_dataframe`,
 * `events_subscription`'s time-machine check, `component_portal`'s dataframe
 * probe, `service_upload`'s parent test. Those assert an EXACT structural
 * relationship ("is my grandparent a dataframe?"); they are not searching for an
 * ancestor, and rewriting them with a model walk would change their meaning. They
 * pass the patterns below because they name no section. Do not widen the regexes
 * to catch them.
 *
 * HONEST LIMIT: this proves no NEW fixed-depth section walk ships. It cannot
 * prove an existing shape check is still correct.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '../..');
const SCAN_ROOTS = ['client/dedalo/core', 'tools'];

/**
 * Files allowed to keep a fixed-depth section walk, each with the reason.
 * EMPTY, and it should stay that way: the three known sites were migrated to
 * get_caller_by_model in the same change that introduced this gate.
 */
const FIXED_DEPTH_SECTION_WALK_ALLOWLIST: Record<string, string> = {};

/** Strip comments — prose about the anti-pattern must not trip the scan. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (full.endsWith('.js')) out.push(full);
	}
	return out;
}

/** A `.caller.caller` chain (optionally with `?.`) anywhere on the line. */
const FIXED_DEPTH = /\.caller\s*\??\.\s*caller/;

/**
 * The line is reaching for a SECTION: it binds or compares something named
 * section-ish, or immediately dereferences the section-only API surface.
 */
const REACHING_FOR_SECTION = [/\bsection\b/i, /\.\s*rqo\b/, /\.\s*sqo\b/, /\.\s*get_total\s*\(/];

describe('client caller chain — an ancestor is found by model, never by depth', () => {
	test('no NEW fixed-depth caller walk reaches for a section', () => {
		const violations: string[] = [];
		for (const root of SCAN_ROOTS) {
			for (const file of walk(join(ROOT, root))) {
				const relative = file.slice(ROOT.length + 1);
				if (FIXED_DEPTH_SECTION_WALK_ALLOWLIST[relative] !== undefined) continue;
				const source = stripComments(readFileSync(file, 'utf8'));
				for (const line of source.split('\n')) {
					if (!FIXED_DEPTH.test(line)) continue;
					if (!REACHING_FOR_SECTION.some((pattern) => pattern.test(line))) continue;
					violations.push(`${relative}: ${line.trim()}`);
				}
			}
		}
		expect(
			violations,
			`Fixed-depth caller walk reaching for a section. Use get_caller_by_model(instance,'section') from client/dedalo/core/common/js/utils/index.js — the depth differs between edit mode (section_group) and list mode (section_record), and a hand-rolled walk is not cycle-safe:\n${violations.join('\n')}`,
		).toEqual([]);
	});

	test('the allowlist is empty, and any future entry carries a substantive reason', () => {
		// An allowlist you may append to freely is not an allowlist. This asserts
		// the CURRENT state (empty) and the shape of any future exemption.
		expect(Object.keys(FIXED_DEPTH_SECTION_WALK_ALLOWLIST)).toEqual([]);
		for (const [file, reason] of Object.entries(FIXED_DEPTH_SECTION_WALK_ALLOWLIST)) {
			expect(reason.length, `${file} needs a substantive reason`).toBeGreaterThan(30);
		}
	});

	test('the canonical helper exists, is exported, and is cycle-safe', () => {
		// The ban above is only fair if the alternative is really available.
		const util = readFileSync(join(ROOT, 'client/dedalo/core/common/js/utils/util.js'), 'utf8');
		expect(util).toContain('export const get_caller_by_model');
		// The visited-Set is the cycle guard; without it tool_common's window path
		// (caller.caller = self) would spin forever.
		const body = util.slice(util.indexOf('export const get_caller_by_model'));
		expect(body.slice(0, 900)).toContain('visited');
		// And it must be reachable through the barrel every consumer imports.
		const barrel = readFileSync(join(ROOT, 'client/dedalo/core/common/js/utils/index.js'), 'utf8');
		expect(barrel).toContain('get_caller_by_model');
	});
});
