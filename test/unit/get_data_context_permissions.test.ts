/**
 * Pure contracts of the per-element permission stamp helpers (2026-07-18):
 *
 * - inheritSubdatumPermission — PHP get_subdatum component-caller inheritance
 *   (class.common.php:2567-2575): floor-1 through an authorized caller,
 *   cap-1 under a read-only caller.
 * - resolveComponentContextPermission — PHP component_common::
 *   resolve_component_read_permission SEARCH branch
 *   (class.component_common.php:3512-3540): thesaurus / metadata tipos /
 *   synthetic 'search_<n>' ids grant level 2 to every logged user WITHOUT a
 *   matrix lookup (asserted here DB-free; the matrix fallthrough is covered by
 *   request_config_permission_gate.test.ts against the live dd774).
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). Install tipos
// were replaced by their twins from src/core/test_data/test_tld_tipo_map.json; the
// seed-shipped ones (rsc/dd/hierarchy/ontology/lg) have no twin and stay, because they
// ship with every installation.

import { describe, expect, test } from 'bun:test';
import {
	inheritSubdatumPermission,
	type Principal,
	resolveComponentContextPermission,
} from '../../src/core/security/permissions.ts';

const someUser: Principal = { userId: 424242, isGlobalAdmin: false, isDeveloper: false };

describe('inheritSubdatumPermission (PHP get_subdatum :2567-2575)', () => {
	test('level-0 child is FLOORED to read through the authorized caller', () => {
		expect(inheritSubdatumPermission(0, 2)).toBe(1);
		expect(inheritSubdatumPermission(0, 1)).toBe(1);
	});
	test('read-only caller CAPS a writable child at read', () => {
		expect(inheritSubdatumPermission(2, 1)).toBe(1);
		expect(inheritSubdatumPermission(3, 1)).toBe(1);
	});
	test('authorized levels pass through under a writable caller', () => {
		expect(inheritSubdatumPermission(1, 2)).toBe(1);
		expect(inheritSubdatumPermission(2, 2)).toBe(2);
		expect(inheritSubdatumPermission(2, 3)).toBe(2);
		expect(inheritSubdatumPermission(3, 3)).toBe(3);
	});
});

describe('resolveComponentContextPermission — search-mode special grants', () => {
	test('thesaurus section searches are level 2 for every logged user', async () => {
		expect(
			await resolveComponentContextPermission(someUser, 'hierarchy20', 'hierarchy45', 1, 'search'),
		).toBe(2);
	});
	test('metadata/section-info tipos are level 2 in search mode', async () => {
		for (const metadataTipo of ['dd197', 'dd199', 'dd200', 'dd201']) {
			expect(
				await resolveComponentContextPermission(someUser, 'test6813', metadataTipo, 1, 'search'),
			).toBe(2);
		}
	});
	test("synthetic 'search_<n>' / zero section_id grants level 2 (PHP (int) cast)", async () => {
		expect(
			await resolveComponentContextPermission(someUser, 'test6813', 'test6836', 'search_1', 'search'),
		).toBe(2);
		expect(await resolveComponentContextPermission(someUser, 'test6813', 'test6836', 0, 'search')).toBe(2);
	});
});
