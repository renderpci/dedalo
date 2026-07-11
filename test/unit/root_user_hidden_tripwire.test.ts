/**
 * TRIPWIRE — the root user record (Users dd128, section_id -1) is hidden from
 * every list/search door, while the direct-fetch label paths keep resolving it.
 *
 * PHP hides root from lists for safety but still resolves its name from stored
 * locators (activity "who", created_by/modified_by, time machine). Two
 * mechanical layers enforce the TS mirror, keyed on config.usersSectionTipo:
 *
 *   1. buildSearchSql ANDs `section_id > 0` into the main WHERE whenever the
 *      MAIN section is Users (PHP search::build_main_where,
 *      core/search/trait.where.php:100-103) — closing list rows, full_count,
 *      autocomplete typeahead, client filter_by_locators pins and
 *      isRecordInScope in one clause, for EVERY caller incl. admins.
 *   2. principalCanAccessRecord refuses any non-positive section_id BEFORE the
 *      global-admin bypass, for ALL sections (PHP security::
 *      user_can_access_record, class.security.php:1007-1009) — closing
 *      get_data, the MCP write tools and the AI change-plan.
 *
 * The EXEMPTIONS are as load-bearing as the filters: readMatrixRecord,
 * resolveLocatorLabels, getDatalist (PHP edit-mode include_negative datalists)
 * and the resolve_data injected-chip path must still reach -1, or the client
 * silently loses the "who = root" labels. Both directions are pinned here.
 */

import { describe, expect, test } from 'bun:test';
import '../../src/core/components/registry.ts';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getDatalist, resolveLocatorLabels } from '../../src/core/relations/datalist.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import { resolveSearchData } from '../../src/core/section/read.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { isRecordInScope, principalCanAccessRecord } from '../../src/core/security/record_scope.ts';

const USERS = 'dd128';
const ROOT_LOCATOR = { section_tipo: USERS, section_id: '-1' };

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** Synthetic non-admin with NO projects — the strictest scoped caller. */
const NO_PROJECTS: Principal = { userId: 987654321, isGlobalAdmin: false, isDeveloper: false };

/** Explicit-config properties targeting Users, dd132 (Username) as label ddo. */
const USERS_LABEL_PROPERTIES = {
	source: {
		request_config: [
			{
				api_engine: 'dedalo',
				sqo: { section_tipo: [USERS] },
				show: {
					ddo_map: [
						{
							tipo: 'dd132',
							model: 'component_input_text',
							section_tipo: USERS,
							parent: USERS,
						},
					],
				},
			},
		],
	},
};

/** Same target, NO label ddos — enumeration-only datalist (fast). */
const USERS_ENUM_PROPERTIES = {
	source: {
		request_config: [
			{
				api_engine: 'dedalo',
				sqo: { section_tipo: [USERS] },
				show: { ddo_map: [] },
			},
		],
	},
};

describe('root user record is hidden from every search door', () => {
	test('the filter keys on config.usersSectionTipo = dd128', () => {
		expect(config.usersSectionTipo).toBe(USERS);
	});

	test('buildSearchSql ANDs section_id > 0 into a Users list query', async () => {
		const { sql } = await buildSearchSql({ section_tipo: [USERS], limit: 10 });
		expect(sql).toContain('section_id > 0');
	});

	test('the full_count query carries the same exclusion (root never counted)', async () => {
		const { sql } = await buildSearchSql({ section_tipo: [USERS], full_count: true });
		expect(sql).toContain('full_count');
		expect(sql).toContain('section_id > 0');
	});

	test('a sanitized client SQO pinning (dd128,-1) via filter_by_locators is ANDed empty', async () => {
		const sqo = sanitizeClientSqo({
			section_tipo: [USERS],
			filter_by_locators: [ROOT_LOCATOR],
			limit: 1,
		});
		const built = await buildSearchSql(sqo);
		// The pin survives sanitize (it is a legitimate client key) but the
		// mandatory clause ANDs with it: section_id = -1 AND section_id > 0.
		expect(built.params).toContain(-1);
		expect(built.sql).toContain('section_id > 0');
	});

	test('control: a non-Users section gets NO section_id > 0 clause', async () => {
		const { sql } = await buildSearchSql({ section_tipo: ['test2'], limit: 10 });
		expect(sql).not.toContain('section_id > 0');
	});

	test('principalCanAccessRecord refuses non-positive ids BEFORE the admin bypass, all sections', async () => {
		expect(await principalCanAccessRecord(USERS, -1, SUPERUSER)).toBe(false);
		expect(await principalCanAccessRecord(USERS, 0, SUPERUSER)).toBe(false);
		expect(await principalCanAccessRecord('test2', -1, SUPERUSER)).toBe(false);
		// The bypass itself stays intact for positive ids.
		expect(await principalCanAccessRecord(USERS, 5, SUPERUSER)).toBe(true);
	});

	test('isRecordInScope(dd128,-1) is false even though the row physically exists', async () => {
		// The contrast is the proof: the direct fetch below sees the record, so
		// the scoped-search false comes from the assembler filter, not absence.
		expect(await isRecordInScope(USERS, -1, NO_PROJECTS)).toBe(false);
	});
});

describe('root user record stays resolvable by the direct-fetch paths (requires shared DB)', () => {
	test('readMatrixRecord reaches (dd128,-1) — the exemption every label path builds on', async () => {
		const record = await readMatrixRecord('matrix_users', USERS, -1);
		expect(record).not.toBeNull();
	});

	test('resolveLocatorLabels resolves the -1 locator to the seeded username', async () => {
		const labels = await resolveLocatorLabels(
			'zzroottrip1',
			USERS_LABEL_PROPERTIES,
			USERS,
			'lg-nolan',
			[ROOT_LOCATOR],
		);
		expect(labels).toContain('root');
	});

	test('getDatalist still enumerates -1 (PHP edit-mode include_negative parity)', async () => {
		const items = await getDatalist('zzroottrip2', USERS_ENUM_PROPERTIES, USERS, 'lg-nolan');
		expect(items.some((item) => item.section_id === '-1')).toBe(true);
	});

	test('resolve_data keeps the root chip for a NON-admin while still dropping out-of-scope records', async () => {
		// Without the read.ts exemption, the AUTHZ-02 loop would now drop the
		// root chip (isRecordInScope is false post-filter) and "who = root"
		// would silently vanish for non-admins. The gated numisdata267 record
		// doubles as the control: AUTHZ-02 still drops what it always dropped.
		const rqo = {
			source: {
				action: 'resolve_data',
				tipo: 'dd578', // 'Who' — component_autocomplete → dd128
				section_tipo: 'dd15',
				lang: 'lg-nolan',
				value: [ROOT_LOCATOR, { section_tipo: 'numisdata267', section_id: '1' }],
			},
		} as unknown as Rqo;
		const data = await resolveSearchData(rqo, NO_PROJECTS);
		const emitted = JSON.stringify(data);
		expect(emitted).toContain('"-1"');
		expect(emitted).not.toContain('numisdata267');
	});
});
