/**
 * TRIPWIRE — consultation-only (read-only) sections are unwritable by EVERY
 * door, and stay so as the set grows.
 *
 * Some sections are for consultation only from a user's point of view: the
 * system logs (Activity dd542, Time Machine dd15) and any future section marked
 * strictly read-only. "The user can never modify the information" is the
 * directive; this test pins the two mechanical layers that enforce it, keyed on
 * the single source of truth CONSULTATION_ONLY_SECTIONS:
 *
 *   1. getSectionPermissions caps the SECTION-level permission at read (1),
 *      even for the superuser — so the create/duplicate/delete API gates
 *      (level >= 2) refuse and the client renders the section read-only. This
 *      MUST NOT leak into getPermissions itself, which stays a faithful mirror
 *      of PHP common::get_permissions (the differential parity contract).
 *   2. the write ENGINES (createSectionRecord / duplicateSectionRecord /
 *      deleteSectionRecord / deleteSectionData / saveComponentData) hard-refuse
 *      a write to these sections BEFORE touching the DB — the belt covering the
 *      MCP tools, the agent, and any future caller that reaches the engine
 *      directly.
 *
 * These assertions are pure (no DB, no PHP oracle): the superuser permission
 * path and every engine guard resolve before any I/O.
 */

import { describe, expect, test } from 'bun:test';
// Preload the component-model registry so buildStructureContext can resolve
// component models (the resolver requires it; server/test-preload entrypoints do).
import '../../src/core/components/registry.ts';
import {
	CONSULTATION_ONLY_SECTIONS,
	isConsultationOnlySection,
} from '../../src/core/concepts/section.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { readSection } from '../../src/core/section/read.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	deleteSectionData,
	deleteSectionRecord,
} from '../../src/core/section/record/delete_record.ts';
import { duplicateSectionRecord } from '../../src/core/section/record/duplicate_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	type Principal,
	getPermissions,
	getSectionPermissions,
} from '../../src/core/security/permissions.ts';

// The superuser (user_id -1) resolves to level 3 WITHOUT any DB read — the ideal
// probe for the cap: the raw level is the maximum, so a capped value proves the
// cap fired rather than an absent grant.
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: false };

describe('consultation-only sections are read-only for every door', () => {
	test('the registry is non-empty and includes Activity (dd542) + Time Machine (dd15)', () => {
		expect(CONSULTATION_ONLY_SECTIONS.size).toBeGreaterThanOrEqual(2);
		expect(isConsultationOnlySection('dd542')).toBe(true);
		expect(isConsultationOnlySection('dd15')).toBe(true);
		expect(isConsultationOnlySection('oh1')).toBe(false);
	});

	test('getSectionPermissions caps every consultation-only section at read (1), even for the superuser', async () => {
		for (const sectionTipo of CONSULTATION_ONLY_SECTIONS) {
			expect(await getSectionPermissions(SUPERUSER, sectionTipo)).toBeLessThanOrEqual(1);
		}
	});

	test('the cap does NOT leak into getPermissions (PHP common::get_permissions fidelity)', async () => {
		// dd15 is separately hard-capped inside getPermissions (admin-only rule),
		// so probe fidelity with Activity, which getPermissions must NOT cap:
		// the superuser still reads level 3 there. The section-level cap lives
		// only in getSectionPermissions.
		expect(await getPermissions(SUPERUSER, 'dd542', 'dd542')).toBe(3);
		// A non-consultation section is never capped by getSectionPermissions.
		expect(await getSectionPermissions(SUPERUSER, 'oh1')).toBe(3);
	});

	test('createSectionRecord refuses a consultation-only section before any DB access', async () => {
		for (const sectionTipo of CONSULTATION_ONLY_SECTIONS) {
			expect(createSectionRecord(sectionTipo, 1)).rejects.toThrow(/consultation-only/);
		}
	});

	test('duplicateSectionRecord refuses a consultation-only section', async () => {
		for (const sectionTipo of CONSULTATION_ONLY_SECTIONS) {
			expect(duplicateSectionRecord(sectionTipo, 1, 1)).rejects.toThrow(/consultation-only/);
		}
	});

	test('deleteSectionRecord / deleteSectionData refuse a consultation-only section', async () => {
		for (const sectionTipo of CONSULTATION_ONLY_SECTIONS) {
			expect(deleteSectionRecord(sectionTipo, 1, 1)).rejects.toThrow(/consultation-only/);
			expect(deleteSectionData(sectionTipo, 1, 1)).rejects.toThrow(/consultation-only/);
		}
	});

	test('buildStructureContext caps client editability at read for a consultation-only section, even when handed admin level 3', async () => {
		// The record read path (section/read.ts, resolve/read_tm.ts) stamps a
		// COARSE per-request permission (3 for admins). This is the single
		// chokepoint that makes the client render the section read-only — every
		// element emitted for a consultation-only section must come back <= 1, so
		// the client's `disabled_component` path fires (permission < 2). This is
		// the assertion that would have caught the "'Who' column still editable"
		// regression (the section-level cap alone did not stop it).
		const activitySection = await buildStructureContext({
			tipo: 'dd542',
			sectionTipo: 'dd542',
			mode: 'list',
			lang: 'lg-nolan',
			permissions: 3,
		});
		expect(activitySection?.permissions).toBe(1);
		const activityWho = await buildStructureContext({
			tipo: 'dd132', // 'Who' — the exact component reported as editable
			sectionTipo: 'dd542',
			mode: 'list',
			lang: 'lg-nolan',
			permissions: 3,
		});
		expect(activityWho?.permissions).toBe(1);
		// Control: a NON-consultation section keeps the level it was handed —
		// the cap is scoped, not a blanket downgrade.
		const normal = await buildStructureContext({
			tipo: 'dd132',
			sectionTipo: 'dd64',
			mode: 'list',
			lang: 'lg-nolan',
			permissions: 3,
		});
		expect(normal?.permissions).toBe(3);
	});

	test('readSection emits NO editable element for a consultation-only section, including cross-section portal subdatum', async () => {
		// End-to-end: read the Activity (dd542) list as the superuser and assert
		// EVERY emitted ddo is <= 1. This covers the section's own columns AND the
		// 'Who' portal's username subdatum (dd132, whose own section is dd128/Users
		// and would otherwise inherit the admin-3 stamp and render editable — the
		// reported "section list still editable" bug). Requires the shared DB.
		const superuser: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: false };
		const rqo = {
			source: { tipo: 'dd542', section_tipo: 'dd542', mode: 'list' },
			sqo: { section_tipo: ['dd542'], limit: 5, offset: 0 },
		} as never;
		const { context } = await readSection(rqo, superuser);
		const ddos = (context as { typo?: string; tipo?: string; permissions?: number }[]).filter(
			(c) => c.typo === 'ddo',
		);
		expect(ddos.length).toBeGreaterThan(1); // real coverage, not a vacuous pass
		const editable = ddos.filter((c) => (c.permissions ?? 0) > 1);
		expect(editable).toEqual([]);
	});

	test('saveComponentData refuses a real-record save to a consultation-only section', async () => {
		for (const sectionTipo of CONSULTATION_ONLY_SECTIONS) {
			const result = await saveComponentData({
				componentTipo: 'dd577',
				sectionTipo,
				sectionId: 1,
				lang: 'lg-nolan',
				changedData: [],
				userId: 1,
			});
			expect(result.ok).toBe(false);
			expect(result.message).toMatch(/read-only/);
		}
	});
});
