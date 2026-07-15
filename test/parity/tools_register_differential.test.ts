/**
 * Registration parity gate (the shared-DB safety check). The dd1324 registry is
 * SHARED with the live PHP install, which has already imported every tool. This
 * asserts that a TS dry-run import would be a NO-OP on that PHP-populated
 * registry: every seeded tool validates, is present in the registry, and its
 * declared identity matches the registry row (empty diff) — proving TS write
 * parity WITHOUT writing anything. If this ever fails, the TS import model has
 * diverged from what PHP writes; fix the model, do not loosen the gate.
 *
 * TS_ONLY_TOOLS (WC-019): tools that exist ONLY in this engine's tools/ tree —
 * PHP never imported them, so "present in the registry" cannot hold until the
 * TS-side registration runs (Register tools widget + TOOLS_ENABLE_REGISTRY_
 * IMPORT). They must still VALIDATE, and once registered they must still be
 * diff-free; only the in-registry requirement is carved out. PHP must never
 * re-import tools (the tool_assistant COEXISTENCE rule), so a TS-written row
 * is stable.
 */

import { describe, expect, test } from 'bun:test';
import { importTools } from '../../src/core/tools/register.ts';

/** TS-only tool packages with no PHP twin (each cites its WC ledger line). */
const TS_ONLY_TOOLS: ReadonlySet<string> = new Set([
	'tool_error_report', // WC-019
	'tool_sitebuilder', // TS-native: proxies the standalone Site Builder daemon; no PHP oracle
]);

describe('tools_register dry-run parity (no-op vs the PHP-imported dd1324)', () => {
	test('every seeded tool is valid, in the registry, and diff-free', async () => {
		const report = await importTools({ dryRun: true });

		expect(report.length).toBeGreaterThanOrEqual(34);

		const invalid = report.filter((item) => !item.valid);
		expect(invalid.map((i) => `${i.name}: ${i.errors.join('; ')}`)).toEqual([]);

		// TS-only tools may legitimately be absent (registered by the TS widget,
		// never by PHP); every PHP-seeded tool must be present.
		const missing = report
			.filter((item) => !item.inRegistry && !TS_ONLY_TOOLS.has(item.name))
			.map((i) => i.name);
		expect(missing).toEqual([]);

		// Diff-free applies to EVERY in-registry tool, TS-only ones included —
		// once registered, the disk identity must keep matching the row.
		const changed = report
			.filter((item) => item.inRegistry && item.diff.length > 0)
			.map((i) => `${i.name}: [${i.diff.join(',')}]`);
		expect(changed).toEqual([]);
	});

	test('TS_ONLY_TOOLS stays honest — every entry exists on disk (staleness self-test)', async () => {
		const report = await importTools({ dryRun: true });
		const names = new Set(report.map((item) => item.name));
		const stale = [...TS_ONLY_TOOLS].filter((name) => !names.has(name));
		expect(
			stale,
			`Stale TS_ONLY_TOOLS entries — no such tool package on disk: ${stale.join(', ')}`,
		).toEqual([]);
	});

	test('dry-run writes nothing (report is flagged dryRun)', async () => {
		const report = await importTools({ dryRun: true });
		expect(report.every((item) => item.dryRun)).toBe(true);
	});
});
