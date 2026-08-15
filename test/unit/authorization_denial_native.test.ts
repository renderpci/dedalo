/**
 * THE AUTHORIZATION DENIAL — one shape, one machine token, one message
 * (WC-2026-08-12-authorization-denial-token).
 *
 * A user opening a page they hold no grant for used to be told
 * "Not retry-able HTTP error 403" over a blank panel offering to check the
 * server log. Three things made that the best the client could do:
 *
 *  1. `denied(403, 'Insufficient permissions to read')` put the HUMAN sentence
 *     in `errors`, the machine channel — so nothing could dispatch on it (the
 *     same defect WC-051 fixed for 401);
 *  2. the client's fetch layer classified every non-401 non-ok status as a
 *     transport failure, threw, and never let the envelope reach `.json()`;
 *  3. `start` is the client's FIRST call, so a refusal there left it without
 *     `get_label` — it could not have rendered a localized message even if it
 *     had one.
 *
 * Each of the three has a gate here. The source scans are the ratchet: the
 * token is worth nothing if the NEXT 403 goes back to putting prose in
 * `errors`, or the next fetch refactor drops the exemption.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { denied, notAuthorized } from '../../src/core/api/response.ts';
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

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf-8');
}

describe('notAuthorized — the envelope', () => {
	test('403 + the machine token in errors, the human sentence in msg', () => {
		const result = notAuthorized('Insufficient permissions to read');
		expect(result.status).toBe(403);
		expect(result.body.result).toBe(false);
		expect(result.body.errors).toEqual(['not_authorized']);
		expect(result.body.msg).toBe('Insufficient permissions to read');
	});

	test('the default message names nothing — it is shown to the REFUSED user', () => {
		// Naming the element someone cannot reach tells them it exists.
		const result = notAuthorized();
		expect(result.body.msg).toBe('Insufficient permissions');
		expect(result.body.errors).toEqual(['not_authorized']);
	});

	test('denied() still puts its message in errors — which is why 403 may not use it', () => {
		// The contrast that makes the scan below meaningful: `denied` is for
		// validation refusals, where the sentence IS the machine detail.
		const result = denied(400, 'bad request');
		expect(result.body.errors).toEqual(['bad request']);
	});
});

describe('the ratchet: no authorization refusal may go back to denied(403)', () => {
	test('src/ and tools/ contain no denied(403 call', () => {
		const offenders: string[] = [];
		for (const dir of ['src', 'tools']) {
			for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
				if (match.endsWith('.test.ts')) continue;
				const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
				if (stripComments(read(file)).includes('denied(403')) offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});
});

describe('the client reads the refusal instead of throwing it away', () => {
	const dataManager = 'client/dedalo/core/common/js/data_manager.js';

	test('both fetch layers exempt every ANSWERED status, not only 401', () => {
		const source = read(dataManager);
		// handle_errors: the response is returned unparsed so the caller's
		// .json() sees the envelope and api_response_errors publishes.
		expect(source).toContain('response.status === 401 || response.status === 403');
		// The retry/timeout layer: an ANSWER about the request's subject is never a
		// transport error. 401 (re-login) and 403 (authorization,
		// WC-2026-08-12-authorization-denial-token) were the first two; 409 joined
		// them for the picker's named "no active hierarchy is configured for this
		// component target" — thrown here it never reached .json(), so the reason
		// the server took care to state was replaced by a generic red transport
		// error. Retrying any of the three is meaningless.
		expect(source).toContain('const answered_statuses = [401, 403, 409]');
		expect(source).toContain('!response?.ok && !answered_statuses.includes(response?.status)');
		// and nothing may reintroduce the old blanket throw
		expect(source).not.toContain('!response?.ok && response?.status !== 401)');
	});

	test('the page turns the token into its own error type, and the renderer has that case', () => {
		expect(read('client/dedalo/core/page/js/page.js')).toContain(
			"api_response?.errors?.includes('not_authorized')",
		);
		expect(read('client/dedalo/core/common/js/render_common.js')).toContain(
			"case 'not_authorized':",
		);
	});

	test('the message is a LABEL, defined in the master catalog', () => {
		const master = JSON.parse(read('src/core/labels/master.json')) as Record<string, string>;
		expect(master.no_access_page).toBe("You don't have permission to access this page");
		expect(read('client/dedalo/core/page/js/page.js')).toContain('get_label.no_access_page');
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

	test('a refused page start answers 403 + not_authorized', async () => {
		const refused = await dispatchRqo(startRqo(ADMIN_ONLY_AREA) as never, nonAdminContext as never);
		expect(refused.status).toBe(403);
		expect(refused.body.errors).toEqual(['not_authorized']);
		expect(refused.body.msg).toBe('Insufficient permissions to read');
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
		expect((refused.body as { result?: unknown }).result).toBe(false);
	});

	test('the same start for the identity that HOLDS the grant is 200 (non-vacuity)', async () => {
		const allowed = await dispatchRqo(startRqo(ADMIN_ONLY_AREA) as never, adminContext as never);
		expect(allowed.status).toBe(200);
		expect(allowed.body.errors).toBeUndefined();
	});

	test('a section the non-admin DOES hold is not refused either', async () => {
		const allowed = await dispatchRqo(startRqo(GRANTED_SECTION) as never, nonAdminContext as never);
		expect(allowed.status).toBe(200);
	});
});
