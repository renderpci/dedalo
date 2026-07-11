/**
 * Tripwire (DEC-12): MATRIX_COPY_COLUMNS is an EXPLICIT literal (mirroring PHP
 * matrix_db_manager::get_columns_name() column order) consumed by the ontology
 * data-IO psql `\copy` export. Its header says "do NOT derive it" — so nothing
 * mechanically keeps it in lockstep with the real matrix schema. Without this
 * gate, a future migration that adds a jsonb column to MATRIX_JSONB_COLUMNS
 * (and the matrix DML) but forgets this literal would silently OMIT that column
 * from every <tld>.copy.gz / matrix_dd.copy.gz dump — a later PHP
 * import_from_copy_file restore would then misalign or drop that column's data
 * with no error. The identity columns (section_id, section_tipo) lead; the rest
 * MUST equal the jsonb column set in order.
 */

import { describe, expect, test } from 'bun:test';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';

describe('MATRIX_COPY_COLUMNS drift tripwire', () => {
	test('equals the two identity columns followed by every jsonb column, in order', () => {
		expect(MATRIX_COPY_COLUMNS).toEqual(['section_id', 'section_tipo', ...MATRIX_JSONB_COLUMNS]);
	});
});
