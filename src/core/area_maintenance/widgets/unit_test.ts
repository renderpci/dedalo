/**
 * unit_test widget — reset matrix_test to the canonical test3 playground
 * (src/core/test_data/: TRUNCATE + sequence restart + insert the canonical
 * records + exact-set counter).
 *
 * (!) Deliberate divergence WC-021: the PHP twin is live-defective — its
 * test_data.json still carries V6 column shapes AND re-appends the explicit
 * section_id/section_tipo columns, so the PHP reset TRUNCATEs and then DIES
 * ('column "section_id" specified more than once'), leaving the table EMPTY.
 * TS implements the restorative INTENT from the single verified source. The
 * PHP failure mode stays pinned in
 * test/parity/widget_request_differential.test.ts.
 */

import { resetTestSection } from '../../test_data/seed.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

async function unitTestCreateTestRecord(): Promise<WidgetResponse> {
	await resetTestSection();
	return { result: true, msg: 'OK. Request done unit_test::create_test_record', errors: [] };
}

export const widget: WidgetModule = {
	spec: { id: 'unit_test', category: 'dev', label: { kind: 'literal', text: 'Unit test area' } },
	apiActions: {
		create_test_record: unitTestCreateTestRecord,
	},
};
