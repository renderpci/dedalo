/**
 * THE AUTHORIZATION DENIAL — one code, one status, converter-made
 * (WC-2026-08-12-authorization-denial-token, restated on envelope v2 —
 * engineering/ERRORS_SPEC.md §3-4).
 *
 * A user opening a page they hold no grant for used to be told
 * "Not retry-able HTTP error 403" over a blank panel. Three things made that
 * the best the client could do: the refusal put the HUMAN sentence in the
 * machine channel (`denied(403, 'Insufficient permissions to read')`); the
 * client's fetch layer threw every non-401 status away unparsed; and `start`
 * is the client's FIRST call, so a refusal there left it without `get_label`.
 *
 * Envelope v2 makes the fix structural, and this gate has three parts:
 *
 *  1. THE ENVELOPE — the refusal is `perm.denied` (403, category permission,
 *     label `no_access_page`), made by the ONE converter: `error.code` is the
 *     machine channel; the compat mirror is `errors:['perm.denied']`; the
 *     message names nothing (it is shown to the REFUSED user).
 *  2. THE SOURCE RATCHET — response.ts BUILDS NO BODY (every helper THROWS),
 *     and the transitional throwing shells (`denied(`/`notAuthorized(`/
 *     `notLogged(`) may only DISAPPEAR: the count is frozen at today's
 *     measurement and the P1-exit gate sets it to 0 and deletes the shells.
 *  3. THE LIVE REFUSAL — through the real gate chain with real grants: 403 +
 *     `perm.denied`, and the environment (labels) rides the refusal as an
 *     extension key, because `start` has no other source of labels.
 *
 * The client half (data_manager's body-first parse, the policy table, the
 * no-access page render) is owned by client_error_contract_tripwire.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { notAuthorized } from '../../src/core/api/response.ts';
import { toErrorEnvelope } from '../../src/core/errors/convert.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { ERROR_REGISTRY } from '../../src/core/errors/registry.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_NON_ADMIN_USER_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
/** dd88 (maintenance): granted to the fixture admin, refused to the non-admin. */
const ADMIN_ONLY_AREA = 'dd88';
/** The section the non-admin DOES hold a read grant on. */
const GRANTED_SECTION = 'test3';

/**
 * THE SHELL RATCHET (shrink-only). Measured 2026-08-15 at the P1 chokepoint
 * landing, over src/ + tools/ minus response.ts itself, comments and string
 * contents stripped: `denied(` 60 + `notAuthorized(` 39 + `notLogged(` 7.
 * The call-site sweep lowers it; the P1-exit gate sets it to 0 and deletes
 * the shells from response.ts. It may NEVER be raised.
 */
const SHELL_CALL_SITES_MAX = 106;

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf-8');
}

function thrownBy(fn: () => never): DedaloError {
	try {
		fn();
	} catch (error) {
		if (error instanceof DedaloError) return error;
		throw error;
	}
	throw new Error('expected a throw');
}

describe('perm.denied — the envelope', () => {
	test('403 + error.code perm.denied; compat mirror errors:[code], result:false', () => {
		const { status, body } = toErrorEnvelope(new DedaloError('perm.denied'), {
			requestId: 'zzden',
		});
		expect(status).toBe(403);
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('perm.denied');
		expect(body.error.category).toBe('permission');
		expect(body.error.label_key).toBe('no_access_page');
		expect(body.result).toBe(false);
		expect(body.errors).toEqual(['perm.denied']);
		expect(body.msg).toBe('Insufficient permissions');
	});

	test('the message names nothing — it is shown to the REFUSED user (disclosure operator)', () => {
		// Naming the element someone cannot reach tells them it exists: the
		// registry says `operator`, so a site's publicMessage never reaches the wire.
		expect(ERROR_REGISTRY['perm.denied'].disclosure).toBe('operator');
		const { body } = toErrorEnvelope(
			new DedaloError('perm.denied', { publicMessage: 'no read on secret_section' }),
			{ requestId: 'zzden' },
		);
		expect(JSON.stringify(body)).not.toContain('secret_section');
		expect(body.error.message).toBe('Insufficient permissions');
	});

	test('the transitional notAuthorized shell THROWS perm.denied (it builds no body)', () => {
		const error = thrownBy(() => notAuthorized('Insufficient permissions to read'));
		expect(error.code).toBe('perm.denied');
		expect(error.publicMessage).toBe('Insufficient permissions to read');
	});

	test('the label is defined in the master catalog', () => {
		const master = JSON.parse(read('src/core/labels/master.json')) as Record<string, string>;
		expect(master.no_access_page).toBe("You don't have permission to access this page");
	});
});

describe('the ratchet: response.ts builds no body; the shells only disappear', () => {
	test('response.ts contains no failure-body literal (result:false / errors:) — every helper throws', () => {
		const source = stripComments(read('src/core/api/response.ts'));
		expect(source).not.toMatch(/result:\s*false/);
		expect(source).not.toMatch(/errors:\s*\[/);
		expect(source).not.toMatch(/msg:/);
		// and every exported function is typed `never` (a throw, not a builder)
		for (const match of source.matchAll(/export function (\w+)\([^)]*\):\s*(\w+)/g)) {
			expect({ helper: match[1], returns: match[2] }).toEqual({
				helper: match[1],
				returns: 'never',
			});
		}
	});

	test(`shell call sites in src/ + tools/ ≤ ${SHELL_CALL_SITES_MAX} (shrink-only; P1 exit sets 0)`, () => {
		let total = 0;
		const perFile: Record<string, number> = {};
		for (const dir of ['src', 'tools']) {
			for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
				if (match.endsWith('.test.ts')) continue;
				const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
				if (file === 'src/core/api/response.ts') continue;
				const source = stripComments(read(file), { blankStrings: true });
				const count = (source.match(/\b(denied|notAuthorized|notLogged)\(/g) ?? []).length;
				if (count > 0) perFile[file] = count;
				total += count;
			}
		}
		expect(total, JSON.stringify(perFile, null, 1)).toBeLessThanOrEqual(SHELL_CALL_SITES_MAX);
	});
});

describe.if(DB_READY)('the live refusal (dispatch, real grants)', () => {
	let adminContext: unknown;
	let nonAdminContext: unknown;

	function contextFor(userId: number, isGlobalAdmin: boolean, principal: unknown) {
		const token = createSession(userId, `zzden_${userId}`, isGlobalAdmin);
		const session = getSession(token);
		return {
			requestId: 'zzden',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		};
	}

	const startRqo = (tipo: string) => ({
		action: 'start',
		dd_api: 'dd_core_api',
		options: { search_obj: { tipo, mode: 'list' }, menu: true },
	});

	beforeAll(async () => {
		await installAclIdentityFixture();
		adminContext = contextFor(ACL_ADMIN_USER_ID, true, await resolvePrincipal(ACL_ADMIN_USER_ID));
		nonAdminContext = contextFor(
			ACL_NON_ADMIN_USER_ID,
			false,
			await resolvePrincipal(ACL_NON_ADMIN_USER_ID),
		);
	});

	afterAll(removeAclIdentityFixture);

	test('a refused page start answers 403 + perm.denied', async () => {
		const refused = await dispatchRqo(startRqo(ADMIN_ONLY_AREA) as never, nonAdminContext as never);
		expect(refused.status).toBe(403);
		expect(refused.body.ok).toBe(false);
		expect((refused.body.error as { code: string }).code).toBe('perm.denied');
		expect(refused.body.errors).toEqual(['perm.denied']);
		expect(refused.body.request_id).toBe('zzden');
	});

	test('THE LOCALIZATION CONTRACT: the refusal carries the environment (start has no other source of labels)', async () => {
		const refused = await dispatchRqo(startRqo(ADMIN_ONLY_AREA) as never, nonAdminContext as never);
		const environment = (refused.body as { environment?: { result?: Record<string, unknown> } })
			.environment;
		const labels = environment?.result?.get_label as Record<string, string> | undefined;
		// Without this the panel can only render in the master source language,
		// whatever interface language the operator chose.
		expect(labels?.no_access_page).toBeDefined();
		// …and it carries no context/data for the element that was refused.
		expect(refused.body.result).toBe(false);
		expect('data' in refused.body).toBe(false);
	});

	test('the same start for the identity that HOLDS the grant is 200 (non-vacuity)', async () => {
		const allowed = await dispatchRqo(startRqo(ADMIN_ONLY_AREA) as never, adminContext as never);
		expect(allowed.status).toBe(200);
		expect(allowed.body.ok).toBe(true);
		expect(allowed.body.errors).toBeUndefined();
	});

	test('a section the non-admin DOES hold is not refused either', async () => {
		const allowed = await dispatchRqo(startRqo(GRANTED_SECTION) as never, nonAdminContext as never);
		expect(allowed.status).toBe(200);
	});
});
