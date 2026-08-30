/**
 * P2-8(b) — THE AUTHORIZATION GATE OF tool_sitebuilder, action by action.
 *
 * THE HOLE THIS PINS SHUT. All fourteen actions declared `permission: null`, and
 * `assertPublisher` was called in exactly three places (publish, get_audit, and the
 * `purge_prod` branch of delete_site). Everything else stood on the tool grant alone, so
 * ANY authenticated user whose profile could open the tool could: create sites, drive an
 * autonomous coding agent across a site workspace on the installation's model credentials,
 * stop and read anybody's agent session, delete the workspace and preprod copy of any
 * site, and read the whole site inventory, its preview URLs and its build logs.
 *
 * WHAT THIS GATE ASSERTS, and why in this shape:
 *  1. ONE CASE PER ACTION, in BOTH directions — a non-privileged authenticated principal
 *     is refused AND the daemon is never contacted (the daemon executes whatever the
 *     engine sends, so a refusal that still made the call would have done the damage
 *     anyway); a privileged one reaches the daemon.
 *  2. THE ACTION LIST IS DISCOVERED from the module's own `apiActions` map, never typed
 *     out here. A gate that hand-lists its subjects stops covering the tool the moment
 *     somebody adds a fifteenth action — which is precisely how an ungated door gets
 *     shipped. An action with no case here is a LOUD failure, not a skip.
 *  3. SESSION OWNERSHIP: user A cannot message, stop or stream user B's session, and does
 *     not even see it in the history list — with both users PRIVILEGED, so the assertion
 *     is about ownership and not about the publisher grant leaking in.
 *
 * The daemon is a real in-test Bun.serve (the tool_sitebuilder.test.ts idiom): the config
 * module is mocked so daemon_client points at it, and every request it receives is
 * recorded — which is how "never contacted" can be asserted at all.
 *
 * DB: the ownership ledger is a real table on the SUITE database (assertTestDatabase
 * refuses anything else); the rows this file writes are its own scratch surface and are
 * deleted in afterAll.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import * as realConfigModule from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { instanceFingerprint } from '../../src/core/site_builder/pairing.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import type { ToolActionContext, ToolServerModule } from '../../src/core/tools/module.ts';
import {
	ensureSessionOwnerTable,
	readSessionOwner,
	recordSessionOwner,
	SESSION_OWNER_TABLE,
} from '../../tools/tool_sitebuilder/server/session_owner.ts';
import { refusalOf } from '../helpers/refusal.ts';

// Snapshot the real exports BEFORE mocking (the namespace object is a live view, so
// re-installing it in afterAll would re-install the mock into every later test file).
const REAL_CONFIG_MODULE = { ...realConfigModule };

/** The scratch site slug this file owns; every ledger row it writes carries it. */
const SLUG = 'authzdemo';
/** A second slug, so the delete case cannot sweep the ownership rows the others need. */
const DOOMED_SLUG = 'authzgone';

const OWNER_SESSION = 'authz-session-owner';
/**
 * An id minted by ANOTHER museum's daemon that happens to collide with one this engine is
 * asked about — the T4 case. Module-scoped because the mock daemon must be able to list it:
 * the engine's ownership filter is only exercised on ids the daemon actually returns.
 */
const COLLIDING_SESSION = 'authz-session-colliding-id';
const FOREIGN_SESSION = 'authz-session-foreign';

/** Privileged, non-admin: the developer half of the publisher grant. */
const DEV: Principal = { userId: 4101, isGlobalAdmin: false, isDeveloper: true };
/** A SECOND privileged user — the one who must not reach DEV's session. */
const OTHER_DEV: Principal = { userId: 4102, isGlobalAdmin: false, isDeveloper: true };
/** Privileged through the other flag: proves the gate is developer OR global admin. */
const ADMIN: Principal = { userId: 4103, isGlobalAdmin: true, isDeveloper: false };
/** The ordinary authenticated editor the finding was about. */
const PLAIN: Principal = { userId: 4104, isGlobalAdmin: false, isDeveloper: false };

let tool: ToolServerModule;
let server: ReturnType<typeof Bun.serve>;
let requestCount = 0;
const INSTANCE = 'authz-instance';
const siteBuilder = {
	url: '',
	socket: undefined,
	instance: INSTANCE,
	token: 'authz-token',
	timeoutMs: 3000,
} as {
	url: string | undefined;
	socket: string | undefined;
	instance: string | undefined;
	token: string | undefined;
	timeoutMs: number;
};

function ctx(principal: Principal, options: Record<string, unknown>): ToolActionContext {
	return { principal, userId: principal.userId, options, background: false };
}

beforeAll(async () => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			requestCount++;
			const url = new URL(req.url);
			const path = url.pathname;
			if (path === '/health') {
				// The mock daemon answers the pairing question the way a real one does, or
				// nothing below it would ever be reached: the engine proves the pairing before
				// it sends the first byte of any call (daemon_client.ts assertPaired).
				return Response.json({
					service: 'site-builder',
					drivers: [],
					instance_fingerprint: instanceFingerprint(INSTANCE, siteBuilder.token as string),
				});
			}
			if (path.endsWith('/sessions') && req.method === 'POST') {
				return Response.json({ session_id: 'authz-session-started' }, { status: 201 });
			}
			if (path.endsWith('/sessions') && req.method === 'GET') {
				// The daemon has no notion of ownership: it answers with EVERY session on
				// the site, which is exactly why the engine has to filter.
				return Response.json({
					data: [
						{ session_id: OWNER_SESSION, state: 'idle' },
						{ session_id: FOREIGN_SESSION, state: 'idle' },
						// A session id that also exists in the ledger under ANOTHER daemon's
						// instance, with this caller's own user_id on it. It is in the daemon's
						// answer so the engine's filter is actually asked about it — without it,
						// `ownedSessionIds` dropping its instance clause changes nothing
						// observable and the T4 listing gate is vacuous.
						{ session_id: COLLIDING_SESSION, state: 'idle' },
					],
				});
			}
			if (path.endsWith('/events')) {
				return new Response('data: {"seq":0}\n\n', {
					headers: { 'Content-Type': 'text/event-stream' },
				});
			}
			return Response.json({ ok: true });
		},
	});
	siteBuilder.url = `http://127.0.0.1:${server.port}`;

	mock.module('../../src/config/config.ts', () => ({
		...REAL_CONFIG_MODULE,
		config: { ...REAL_CONFIG_MODULE.config, siteBuilder },
	}));
	// Import AFTER the mock so daemon_client binds to the mocked config.
	({ tool } = await import('../../tools/tool_sitebuilder/server/index.ts'));

	await ensureSessionOwnerTable();
	await cleanLedger();
	await recordSessionOwner(OWNER_SESSION, SLUG, DEV.userId);
	await recordSessionOwner(FOREIGN_SESSION, SLUG, OTHER_DEV.userId);
});

afterAll(async () => {
	await cleanLedger();
	server.stop(true);
	mock.module('../../src/config/config.ts', () => REAL_CONFIG_MODULE);
	mock.restore();
});

/** Drop only this file's rows — its own scratch surface, on the marked suite DB. */
async function cleanLedger(): Promise<void> {
	await assertTestDatabase('tool_sitebuilder_authz.cleanLedger');
	await sql.unsafe(
		`DELETE FROM "${SESSION_OWNER_TABLE}" WHERE slug IN ($1, $2) OR session_id = $3`,
		[SLUG, DOOMED_SLUG, 'authz-session-started'],
	);
}

/**
 * The per-action fixture: options that are VALID for the action, so the only thing that
 * can refuse a privileged caller is the authorization decision under test. Keyed by wire
 * action name — but never used as the list of actions (see the discovery test).
 */
const CASES: Record<string, Record<string, unknown>> = {
	get_status: {},
	list_sites: {},
	// The domain is part of the minimal valid call: the daemon pairs a site with the webspace
	// the provisioner made for that hostname, so a create without one is refused before the
	// authorization question is even reached — which would make this file's "did it reach the
	// daemon?" assertions vacuously false for the wrong reason.
	create_site: { slug: SLUG, name: 'Authz demo', domain: 'authz-demo.example.org' },
	// A slug of its own: delete_site sweeps the site's ownership rows on success, and the
	// session cases below need theirs.
	delete_site: { slug: DOOMED_SLUG },
	session_start: { slug: SLUG, prompt: 'build me a page' },
	session_message: { session_id: OWNER_SESSION, message: 'carry on' },
	session_stop: { session_id: OWNER_SESSION },
	session_history: { slug: SLUG },
	session_stream: { session_id: OWNER_SESSION, after: -1 },
	build: { slug: SLUG },
	get_build: { slug: SLUG, build_id: 'b1' },
	preview: { slug: SLUG },
	publish: { slug: SLUG, confirm: true },
	get_audit: {},
};

/** The action names as the MODULE declares them — the subject list of this whole file. */
function actionNames(): string[] {
	return Object.keys(tool.apiActions).sort();
}

/** Run one action, releasing the stream body if it produced one. */
async function run(action: string, principal: Principal): Promise<unknown> {
	const spec = tool.apiActions[action];
	if (spec === undefined) throw new Error(`no such action: ${action}`);
	const response = await spec.handler(ctx(principal, { ...(CASES[action] as object) }));
	const stream = (response as { stream?: ReadableStream }).stream;
	if (stream !== undefined) await new Response(stream).text();
	return response;
}

describe('P2-8(b) — every tool_sitebuilder action is gated', () => {
	test('the subject list is DISCOVERED from apiActions, and every action has a case', () => {
		const names = actionNames();
		// Non-vacuity: a broken import would give an empty map and make every loop
		// below pass without asserting anything.
		expect(names.length, 'no actions discovered from the module').toBeGreaterThanOrEqual(14);
		const uncovered = names.filter((name) => CASES[name] === undefined);
		expect(
			uncovered,
			`tool_sitebuilder grew an action with no authorization case here: ${uncovered.join(', ')}. Add it — a new door must not reach production ungated because nobody typed it into the gate.`,
		).toEqual([]);
		// And the reverse: a case for an action that no longer exists is a stale fixture
		// pretending to cover something.
		const stale = Object.keys(CASES).filter((name) => !names.includes(name));
		expect(stale, `stale CASES entries: ${stale.join(', ')}`).toEqual([]);
	});

	test('a non-privileged authenticated user is REFUSED by every action, and the daemon is never contacted', async () => {
		for (const action of actionNames()) {
			const before = requestCount;
			const refusal = await refusalOf(run(action, PLAIN));
			expect(refusal.code, `${action} must refuse a plain user`).toBe('site_builder.rejected');
			expect(
				requestCount,
				`${action} reached the daemon despite refusing the caller — the daemon trusts the engine, so the effect would already have happened`,
			).toBe(before);
		}
	});

	test('a developer reaches the daemon on every action', async () => {
		for (const action of actionNames()) {
			const before = requestCount;
			await run(action, DEV);
			expect(requestCount, `${action} did not reach the daemon for a developer`).toBeGreaterThan(
				before,
			);
		}
	});

	test('a global admin reaches the daemon on every action (the grant is developer OR admin)', async () => {
		for (const action of actionNames()) {
			const before = requestCount;
			await run(action, ADMIN);
			expect(requestCount, `${action} did not reach the daemon for a global admin`).toBeGreaterThan(
				before,
			);
		}
	});
});

describe('P2-8(b) — session ownership', () => {
	/** The three actions that address an existing session by id. */
	const SESSION_ACTIONS = ['session_message', 'session_stop', 'session_stream'];

	test('the session actions under test are still the ones addressing a session id', () => {
		// Anti-drift: if a fourth id-addressed action appears, this list must grow with it.
		const idAddressed = actionNames().filter((name) =>
			Object.hasOwn(CASES[name] as object, 'session_id'),
		);
		expect(idAddressed.sort()).toEqual([...SESSION_ACTIONS].sort());
	});

	test('another privileged user cannot message, stop or stream a session they do not own', async () => {
		for (const action of SESSION_ACTIONS) {
			const before = requestCount;
			const refusal = await refusalOf(run(action, OTHER_DEV));
			expect(refusal.code, `${action} must refuse a foreign session`).toBe('site_builder.rejected');
			expect(refusal.publicMessage).toBe('This agent session belongs to another user.');
			expect(requestCount, `${action} reached the daemon for a foreign session`).toBe(before);
		}
	});

	test('the owner still reaches their own session', async () => {
		for (const action of SESSION_ACTIONS) {
			const before = requestCount;
			await run(action, DEV);
			expect(requestCount, `${action} refused its own owner`).toBeGreaterThan(before);
		}
	});

	test('an id with no recorded owner fails closed for an ordinary publisher', async () => {
		const refusal = await refusalOf(
			tool.apiActions.session_stop!.handler(ctx(DEV, { session_id: 'authz-unknown-session' })),
		);
		expect(refusal.code).toBe('site_builder.rejected');
	});

	test('a global admin passes ownership (the one named operator bypass)', async () => {
		const before = requestCount;
		await tool.apiActions.session_stop!.handler(ctx(ADMIN, { session_id: FOREIGN_SESSION }));
		expect(requestCount).toBeGreaterThan(before);
	});

	test('session_start records the caller as the owner, and ownership cannot be transferred', async () => {
		await tool.apiActions.session_start!.handler(
			ctx(DEV, { slug: SLUG, prompt: 'build me a page' }),
		);
		expect(await readSessionOwner('authz-session-started')).toBe(DEV.userId);
		// First writer wins: replaying a start for the same id must not re-own it.
		await recordSessionOwner('authz-session-started', SLUG, OTHER_DEV.userId);
		expect(await readSessionOwner('authz-session-started')).toBe(DEV.userId);
	});

	/**
	 * T4 — WHOSE DAEMON, NOT JUST WHOSE SESSION.
	 *
	 * A session id is minted by ONE daemon and is unique only there. So a row saying "user U
	 * owns session S" is an answer about a particular museum's daemon, and an engine
	 * re-pointed at another museum's — the copied-`../private/.env` failure the pairing
	 * tripwire exists for — would read this table's rows as answers about ITS sessions. Ids
	 * that collide then hand one museum's users `assertSessionOwner` over the other's running
	 * agents: typing into them, killing them mid-write, reading the whole transcript.
	 *
	 * The instance column is the only thing that stops it, and until now only the INSERT was
	 * held: dropping `AND instance = $2` from `readSessionOwner`, dropping the equivalent
	 * from `ownedSessionIds`, or making `pairedInstance()` return a constant each left the
	 * engine-side gates green — because every row this fixture wrote carried the one
	 * INSTANCE constant, so no test ever presented a row from another daemon.
	 *
	 * These do. The rows below are written directly, with another instance's name, which is
	 * exactly the state a re-pointed engine finds the table in.
	 */
	describe("a row from ANOTHER daemon is an unknown owner, not somebody else's row to trust", () => {
		const FOREIGN_INSTANCE = 'authz-other-museum';

		beforeAll(async () => {
			await ensureSessionOwnerTable();
			// The other museum's daemon minted this id and DEV happens to be its owner there.
			await sql.unsafe(
				`INSERT INTO "${SESSION_OWNER_TABLE}" (session_id, slug, user_id, instance)
				 VALUES ($1, $2, $3, $4) ON CONFLICT (session_id) DO NOTHING`,
				[COLLIDING_SESSION, SLUG, DEV.userId, FOREIGN_INSTANCE],
			);
		});

		test('the row really is there — so a null answer below is the instance check, not an empty table', async () => {
			const rows = (await sql.unsafe(
				`SELECT user_id, instance FROM "${SESSION_OWNER_TABLE}" WHERE session_id = $1`,
				[COLLIDING_SESSION],
			)) as { user_id: number; instance: string }[];
			expect(rows).toEqual([{ user_id: DEV.userId, instance: FOREIGN_INSTANCE }]);
		});

		test("readSessionOwner refuses to attribute another daemon's row", async () => {
			expect(await readSessionOwner(COLLIDING_SESSION)).toBeNull();
		});

		test('the ordinary caller is refused, and the daemon is never contacted', async () => {
			for (const action of SESSION_ACTIONS) {
				const before = requestCount;
				const refusal = await refusalOf(
					tool.apiActions[action]!.handler(ctx(DEV, { session_id: COLLIDING_SESSION })),
				);
				expect(refusal.code, `${action} must refuse a foreign-instance row`).toBe(
					'site_builder.rejected',
				);
				// BYTE-IDENTICAL to "not yours": the refusal may not tell a caller that the id
				// exists somewhere else.
				expect(refusal.publicMessage).toBe('This agent session belongs to another user.');
				expect(requestCount, `${action} reached the daemon`).toBe(before);
			}
		});

		test("a foreign-instance session is not listed as the caller's own either", async () => {
			const mine = (await tool.apiActions.session_history!.handler(ctx(DEV, { slug: SLUG }))) as {
				data: { data: { session_id: string }[] };
			};
			expect(mine.data.data.map((entry) => entry.session_id)).not.toContain(COLLIDING_SESSION);
		});

		test('an UNSTAMPED row (written before the column existed) fails closed the same way', async () => {
			// Not backfilled, deliberately: stamping the CURRENT instance onto an old row is
			// how a re-pointed engine would inherit another museum's sessions.
			const LEGACY_SESSION = 'authz-session-pre-instance-column';
			await sql.unsafe(
				`INSERT INTO "${SESSION_OWNER_TABLE}" (session_id, slug, user_id, instance)
				 VALUES ($1, $2, $3, NULL) ON CONFLICT (session_id) DO NOTHING`,
				[LEGACY_SESSION, SLUG, DEV.userId],
			);
			expect(await readSessionOwner(LEGACY_SESSION)).toBeNull();
			const refusal = await refusalOf(
				tool.apiActions.session_stop!.handler(ctx(DEV, { session_id: LEGACY_SESSION })),
			);
			expect(refusal.code).toBe('site_builder.rejected');
		});

		test('and the SAME id under THIS instance still resolves — the check is the instance, not a blanket denial', async () => {
			// Anti-vacuity: without this, every assertion above would pass against a
			// `readSessionOwner` that always returned null.
			expect(await readSessionOwner(OWNER_SESSION)).toBe(DEV.userId);
		});

		test('a row is stamped with the CONFIGURED instance, not with a constant', async () => {
			// The other half of the same defect, and the one the tests above cannot see: a
			// `pairedInstance()` that returned a fixed string would be self-consistent —
			// every row written and every row read would carry it — so a re-pointed engine
			// would once again inherit whatever the table held. The stamp is therefore
			// compared against the pairing this engine is actually configured with.
			const rows = (await sql.unsafe(
				`SELECT instance FROM "${SESSION_OWNER_TABLE}" WHERE session_id = $1`,
				[OWNER_SESSION],
			)) as { instance: string | null }[];
			expect(rows).toEqual([{ instance: siteBuilder.instance as string }]);
			expect(siteBuilder.instance).toBe(INSTANCE);
		});
	});

	test('session_history lists only the sessions the caller owns; an admin sees all', async () => {
		const mine = (await tool.apiActions.session_history!.handler(ctx(DEV, { slug: SLUG }))) as {
			data: { data: { session_id: string }[] };
		};
		expect(mine.data.data.map((entry) => entry.session_id)).toEqual([OWNER_SESSION]);

		const theirs = (await tool.apiActions.session_history!.handler(
			ctx(OTHER_DEV, { slug: SLUG }),
		)) as { data: { data: { session_id: string }[] } };
		expect(theirs.data.data.map((entry) => entry.session_id)).toEqual([FOREIGN_SESSION]);

		const all = (await tool.apiActions.session_history!.handler(ctx(ADMIN, { slug: SLUG }))) as {
			data: { data: { session_id: string }[] };
		};
		// The admin bypass returns the daemon's answer UNFILTERED — including the id whose
		// ledger row belongs to another daemon, which is right: an operator must be able to
		// stop a runaway agent, and the daemon's list is what is running on this host.
		expect(all.data.data.map((entry) => entry.session_id)).toEqual([
			OWNER_SESSION,
			FOREIGN_SESSION,
			COLLIDING_SESSION,
		]);
	});
});
