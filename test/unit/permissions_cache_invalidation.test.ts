/**
 * H4 gate: the per-user security caches (permissions table + projects) MUST be
 * invalidated on the relevant writes — before this fix the clearers existed but
 * were never called, so a revoked grant/project persisted for the whole process
 * lifetime.
 *
 * DB-safe & deterministic: it mutates NO record. It exploits the cache's array
 * IDENTITY — getUserProjects returns the SAME array instance on a cache hit and a
 * FRESH instance on a rebuild — so eviction is observable via reference equality.
 * A ghost user (no profile row) resolves to an empty projects list every rebuild.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
	clearPermissionsCache,
	clearUserProjectsCache,
	getUserProjects,
	invalidatePermissionsForWrite,
	invalidateSecurityCachesForSection,
} from '../../src/core/security/permissions.ts';

const GHOST = 999999; // no profile ⇒ empty projects, but a real cache entry

afterEach(() => {
	clearUserProjectsCache();
	clearPermissionsCache();
});

describe('permissions cache invalidation (H4)', () => {
	test('getUserProjects caches by reference; clear forces a rebuild', async () => {
		const a = await getUserProjects(GHOST);
		expect(await getUserProjects(GHOST)).toBe(a); // cache hit → same instance
		clearUserProjectsCache(GHOST);
		const c = await getUserProjects(GHOST);
		expect(c).not.toBe(a); // rebuilt after invalidation
		expect(c).toEqual(a); // same (empty) value, fresh instance
	});

	test('a dd170 (projects) write on THIS user evicts the projects cache', async () => {
		const a = await getUserProjects(GHOST);
		invalidatePermissionsForWrite('dd128', 'dd170', GHOST);
		expect(await getUserProjects(GHOST)).not.toBe(a);
	});

	test('an ordinary content write is a NO-OP for the caches', async () => {
		const a = await getUserProjects(GHOST);
		invalidatePermissionsForWrite('numisdata6', 'numisdata16', GHOST);
		expect(await getUserProjects(GHOST)).toBe(a); // still cached
	});

	test('a dd170 write for ANOTHER user does not evict this user', async () => {
		const a = await getUserProjects(GHOST);
		invalidatePermissionsForWrite('dd128', 'dd170', GHOST + 1);
		expect(await getUserProjects(GHOST)).toBe(a);
	});

	test('invalidateSecurityCachesForSection clears only on users/profiles sections', async () => {
		const a = await getUserProjects(GHOST);
		invalidateSecurityCachesForSection('numisdata6'); // not a security section → no-op
		expect(await getUserProjects(GHOST)).toBe(a);
		invalidateSecurityCachesForSection('dd234'); // profiles → clear-all
		expect(await getUserProjects(GHOST)).not.toBe(a);
	});
});
