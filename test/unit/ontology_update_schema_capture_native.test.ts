/**
 * updateOntology — WHEN the schema-changes artifact's "before" side is captured
 * (CRAP defect D8, fixed 2026-08-09; WC-2026-08-09-simple-schema-changes-pre-import).
 *
 * `saveSimpleSchemaFile`'s pure differ is already gated in
 * `ontology_ingest.test.ts`. It stays green whatever the capture order, which is
 * exactly how the defect survived: the differ was correct and both of its inputs
 * were read AFTER the import, so the operator artifact was always `[]`.
 *
 * What must be gated is therefore the ORDER, and `updateOntology` offers no seam
 * to observe it — it is one function over the real ontology tables, and driving
 * it means performing a destructive import. This file gates the order the only
 * honest way available: over the module SOURCE (the shape
 * `database_info_consolidate_native.test.ts` already uses for its D14
 * provenance assertions), plus a behavioural check that the differ does report
 * additions when it is actually handed a pre-import schema.
 *
 * No DB writes, no filesystem writes outside a mkdtemp scratch dir.
 */

import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveSimpleSchemaFile } from '../../src/core/ontology/ontology_update.ts';

const SOURCE_FILE = new URL('../../src/core/ontology/ontology_update.ts', import.meta.url).pathname;
const workDir = mkdtempSync(join(tmpdir(), 'zzd2_schema_capture_'));

afterAll(() => {
	rmSync(workDir, { recursive: true, force: true });
});

test('oldSchema is captured BEFORE the destructive phase, newSchema after it (D8)', async () => {
	const source = readFileSync(SOURCE_FILE, 'utf8');

	const oldCapture = source.indexOf('const oldSchema = await getSimpleSchemaOfSections()');
	const newCapture = source.indexOf('const newSchema = await getSimpleSchemaOfSections()');
	const phaseB = source.indexOf('// Phase B — recovery snapshot');
	const phaseC = source.indexOf('// Phase C — import (destructive');

	expect(oldCapture).toBeGreaterThan(-1);
	expect(newCapture).toBeGreaterThan(-1);
	expect(phaseB).toBeGreaterThan(-1);
	expect(phaseC).toBeGreaterThan(-1);

	// the "before" side is read inside Phase B — after every refusal gate (so a
	// refused call pays for no ontology walk) and before the first destructive
	// statement, which is what makes the diff a real delta…
	expect(oldCapture).toBeGreaterThan(phaseB);
	expect(oldCapture).toBeLessThan(phaseC);
	// …and the "after" side is read once the imports have run.
	expect(newCapture).toBeGreaterThan(phaseC);

	// the fossil order this replaced must not creep back in.
	expect(source).not.toContain('PHP order: snapshot old schema AFTER import/reindex');
	// exactly two reads: one walk per side, never one per staged file.
	expect(source.split('await getSimpleSchemaOfSections()').length - 1).toBe(2);
});

test('the artifact carries the real additions when the pre-import schema is passed (D8)', () => {
	// Pre-import: zz1 had one child. Post-import: two more. Reading BOTH sides
	// after the import (the defect) makes before === after and the file `[]`.
	const before = { zz1: ['zz2'], zz9: ['zz10'] };
	const after = { zz1: ['zz2', 'zz3', 'zz4'], zz9: ['zz10'] };

	const saved = saveSimpleSchemaFile(before, after, workDir);
	expect(saved.result).toBe(true);
	const written = JSON.parse(readFileSync(saved.filepath as string, 'utf8'));
	expect(written).toEqual([{ tipo: 'zz1', children_added: ['zz3', 'zz4'] }]);

	// the defect's signature, for contrast: identical sides write two bytes.
	const vacuous = saveSimpleSchemaFile(after, after, workDir);
	expect(readFileSync(vacuous.filepath as string, 'utf8')).toBe('[]');
});
