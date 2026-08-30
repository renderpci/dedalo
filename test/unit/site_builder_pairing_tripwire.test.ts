/**
 * SITE-BUILDER PAIRING TRIPWIRE (DEC-12: every documented invariant has a mechanical gate).
 *
 * ONE MUSEUM, ONE ENGINE, ONE DAEMON — and this file is what makes that sentence checkable
 * rather than aspirational.
 *
 * THE FAILURE IT GUARDS. The engine's half of the pairing is three lines in
 * `../private/.env`, and a private env file is the single most copy-pasted artifact an
 * operator owns. Carried from museum A's server to museum B's — or corrected on the socket
 * line while the token line was left behind — it points A's engine at B's site-builder
 * daemon. Within one fleet that arrangement does not fail: it WORKS, which means A's
 * curators driving an agent inside B's workspace, spending B's provider budget, publishing
 * onto B's public domain. There is no undo for a published site, so the only useful moment
 * to catch it is before the first byte is sent.
 *
 * WHAT IS PINNED HERE, in the order the rules appear below:
 *
 *   1. THE FIVE KEYS EXIST, in the catalog, classified, and surfaced on config.siteBuilder.
 *      A key the catalog does not carry is a line `../private/.env` refuses to document and
 *      an operator cannot debug; a key config does not read is a setting that does nothing.
 *   2. THE TWO SIDES COMPUTE THE SAME FINGERPRINT. The recipe is spelled twice — the engine
 *      in src/core/site_builder/pairing.ts, the daemon in
 *      publication/site_builder/src/security/pairing.ts — because they are separate
 *      deployables sharing no module. Both are import-free enough to load here, so the
 *      equality is PROVED by running both, not asserted by reading both.
 *   3. THE TRANSPORT RESOLVES ONE WAY. A socket wins over a URL, a half-configured pairing
 *      is no pairing, and the default base path is the daemon's own default.
 *   4. THE ENGINE REFUSES BEFORE IT SENDS. A mock daemon that publishes the wrong
 *      fingerprint gets exactly one request — the unauthenticated /health probe — and never
 *      the token, the actor or the call itself.
 *   5. THE REFUSAL IS ONE REFUSAL. Wrong instance, unknown instance and wrong token are
 *      BYTE-IDENTICAL to the caller. A refusal that distinguished them would be an
 *      enumeration oracle: anyone who can reach the tool could ask a host which museums it
 *      serves, or confirm a guessed token, one call at a time.
 *   6. THE TWO SIDES OF THE PAIRING FRAGMENT AGREE. The daemon RENDERS the lines that
 *      scripts/site_builder_pair.ts CONSUMES; one spelling of every key, and one spelling
 *      of the placeholder that stands where the token would be.
 *
 * HERMETIC BY CONSTRUCTION: no database, no ../private, no sibling tree. The mock daemon is
 * a loopback Bun.serve on an ephemeral port, and the config module is swapped with
 * mock.module (snapshotted and restored — the convention the other tool_sitebuilder gates
 * follow, so nothing leaks into a full-suite run).
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// The DAEMON's own copy of the recipe, imported straight out of the other package. It
// imports nothing, which is exactly what makes this comparison possible.
import { instanceFingerprint as daemonFingerprint } from '../../publication/site_builder/src/security/pairing.ts';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import type { SiteBuilderConfig } from '../../src/config/config.ts';
import * as realConfigModule from '../../src/config/config.ts';
import {
	DEFAULT_DAEMON_BASE_PATH,
	fingerprintMatches,
	instanceFingerprint,
	PAIRING_FINGERPRINT_PREFIX,
	resolveSiteBuilderTransport,
} from '../../src/core/site_builder/pairing.ts';
import { refusalOf } from '../helpers/refusal.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

/** Snapshot the real exports BEFORE any mock.module runs (mock_isolation convention). */
const REAL_CONFIG_MODULE = { ...realConfigModule };

/** The five keys that ARE the pairing. Nothing else configures the site builder. */
const PAIRING_KEYS = [
	'DEDALO_SITE_BUILDER_URL',
	'DEDALO_SITE_BUILDER_SOCKET',
	'DEDALO_SITE_BUILDER_INSTANCE',
	'DEDALO_SITE_BUILDER_TOKEN',
	'DEDALO_SITE_BUILDER_TIMEOUT_MS',
] as const;

const INSTANCE = 'pairing-gate';
const TOKEN = 'pairing-gate-token-000000000000000000';

// ---------------------------------------------------------------------------
// Rule 1 — the five keys: catalogued, classified, surfaced
// ---------------------------------------------------------------------------

describe('the five DEDALO_SITE_BUILDER_* keys are real configuration', () => {
	test('every one is in the config catalog with operator-facing prose', () => {
		for (const key of PAIRING_KEYS) {
			const entry = CONFIG_CATALOG[key];
			expect(entry, `${key} is not in src/config/catalog/`).toBeDefined();
			// `operator` and `secret` are the two scopes that reach the generated manual and
			// install/sample.env; anything else would document the key nowhere.
			expect(['operator', 'secret']).toContain(entry?.scope ?? '');
			expect((entry?.doc ?? '').length, `${key} has no doc prose`).toBeGreaterThan(80);
			expect((entry?.heading ?? '').length, `${key} has no heading`).toBeGreaterThan(0);
		}
	});

	test('the token is classified SECRET and the other four are not', () => {
		// The scope drives what install/sample.env prints and what scripts may echo: a token
		// whose scope slipped to `operator` would be rendered as a value in a shipped
		// template and logged verbatim by scripts/site_builder_pair.ts.
		expect(CONFIG_CATALOG.DEDALO_SITE_BUILDER_TOKEN?.scope).toBe('secret');
		for (const key of PAIRING_KEYS.filter((k) => k !== 'DEDALO_SITE_BUILDER_TOKEN')) {
			expect(CONFIG_CATALOG[key]?.scope, `${key} must not be scoped secret`).toBe('operator');
		}
	});

	test('every one is classified in src/config/migration_map.ts', () => {
		// The census gate (config_census_tripwire) proves the map is TOTAL over the keys the
		// engine reads. This asserts the same thing from the other end, so a pairing key
		// dropped from the map fails with a message that names the pairing.
		const map = read('src/config/migration_map.ts');
		for (const key of PAIRING_KEYS) {
			expect(map, `${key} is unclassified in migration_map.ts`).toContain(`'${key}'`);
		}
	});

	test('every one is READ by src/config/config.ts and surfaced on config.siteBuilder', () => {
		const source = read('src/config/config.ts');
		for (const key of PAIRING_KEYS) {
			expect(source, `${key} is never read into config`).toContain(`'${key}'`);
		}
		// The shape the whole subsystem reads. Exact, in both directions: a field added
		// without a key (or a key surfaced under a name nothing reads) is red here.
		expect(Object.keys(REAL_CONFIG_MODULE.config.siteBuilder).sort()).toEqual([
			'instance',
			'socket',
			'timeoutMs',
			'token',
			'url',
		]);
	});

	test('an install that configures nothing has no transport (this env is that install)', () => {
		// Anti-vacuity for every "unconfigured" assertion in this file and its siblings: the
		// unit env sets no site-builder key, and the resolver must agree.
		expect(resolveSiteBuilderTransport(REAL_CONFIG_MODULE.config.siteBuilder)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Rule 2 — the two implementations of one recipe
// ---------------------------------------------------------------------------

describe('the engine and the daemon compute the same pairing fingerprint', () => {
	test('identical output on every shape either side can produce', () => {
		const cases: [string, string][] = [
			[INSTANCE, TOKEN],
			['a', 'b'],
			// The separator's whole job: `ab` + `cde` must not collide with `abc` + `de`.
			['ab', 'cde'],
			['abc', 'de'],
			['museum-with-a-long-hyphenated-name', 'x'.repeat(64)],
		];
		for (const [instance, token] of cases) {
			expect(instanceFingerprint(instance, token)).toBe(daemonFingerprint(instance, token));
		}
	});

	test('the separator makes the encoding unambiguous (the collision it prevents)', () => {
		expect(instanceFingerprint('ab', 'cde')).not.toBe(instanceFingerprint('abc', 'de'));
	});

	test('either half changing changes the hex — the property the refusal rests on', () => {
		const base = instanceFingerprint(INSTANCE, TOKEN);
		expect(instanceFingerprint('other-museum', TOKEN)).not.toBe(base);
		expect(instanceFingerprint(INSTANCE, `${TOKEN}x`)).not.toBe(base);
		expect(base).toMatch(/^[0-9a-f]{64}$/);
	});

	test('the domain-separation prefix is one literal, spelled the same on both sides', () => {
		expect(PAIRING_FINGERPRINT_PREFIX).toBe('dedalo-site-instance:');
		// Read from the daemon's SOURCE rather than imported, so a rename on that side that
		// happened to keep the value would still be visible here as the same bytes.
		expect(read('publication/site_builder/src/security/pairing.ts')).toContain(
			`= '${PAIRING_FINGERPRINT_PREFIX}'`,
		);
	});

	test('fingerprintMatches refuses everything that is not the exact hex', () => {
		const expected = instanceFingerprint(INSTANCE, TOKEN);
		expect(fingerprintMatches(expected, expected)).toBe(true);
		expect(fingerprintMatches(instanceFingerprint('elsewhere', TOKEN), expected)).toBe(false);
		// A daemon too old to publish the field is a MISMATCH, never a pass: "answer nothing
		// and be trusted" is a downgrade any wrong daemon could take.
		expect(fingerprintMatches(undefined, expected)).toBe(false);
		expect(fingerprintMatches(null, expected)).toBe(false);
		expect(fingerprintMatches('', expected)).toBe(false);
		expect(fingerprintMatches(expected.slice(0, -1), expected)).toBe(false);
		expect(fingerprintMatches(expected.toUpperCase(), expected)).toBe(false);
		expect(fingerprintMatches({ toString: () => expected }, expected)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Rule 3 — one resolution of "where the daemon is"
// ---------------------------------------------------------------------------

describe('the transport resolves one way', () => {
	const complete: SiteBuilderConfig = {
		url: undefined,
		socket: '/run/dedalo-sites/pairing-gate/daemon.sock',
		instance: INSTANCE,
		token: TOKEN,
		timeoutMs: 10000,
	};

	test('a socket alone is a complete transport, under the daemon default base path', () => {
		const transport = resolveSiteBuilderTransport(complete);
		expect(transport?.unixSocket).toBe(complete.socket);
		expect(transport?.base.endsWith(DEFAULT_DAEMON_BASE_PATH)).toBe(true);
	});

	test('the socket WINS over a URL that is also set; the URL keeps the prefix and host', () => {
		const transport = resolveSiteBuilderTransport({
			...complete,
			url: 'https://sites.example.org/publication/site_builder/',
		});
		// Dialling the network when a socket is configured would swap an access decision made
		// by file ownership for one made by a firewall rule.
		expect(transport?.unixSocket).toBe(complete.socket);
		expect(transport?.base).toBe('https://sites.example.org/publication/site_builder');
	});

	test('a URL alone is a network transport', () => {
		const transport = resolveSiteBuilderTransport({
			...complete,
			socket: undefined,
			url: 'https://sites.example.org/publication/site_builder',
		});
		expect(transport?.unixSocket).toBeUndefined();
		expect(transport?.base).toBe('https://sites.example.org/publication/site_builder');
	});

	test('PARTIAL IS UNCONFIGURED — every missing half fails closed', () => {
		// The one that matters most: a transport and a token with NO instance name is an
		// engine that cannot prove which museum's daemon it reached. It must not connect.
		expect(resolveSiteBuilderTransport({ ...complete, instance: undefined })).toBeNull();
		expect(resolveSiteBuilderTransport({ ...complete, instance: '' })).toBeNull();
		expect(resolveSiteBuilderTransport({ ...complete, token: undefined })).toBeNull();
		expect(resolveSiteBuilderTransport({ ...complete, token: '' })).toBeNull();
		expect(
			resolveSiteBuilderTransport({ ...complete, socket: undefined, url: undefined }),
		).toBeNull();
	});

	test("the default base path is the DAEMON's own default, not a guess", () => {
		// Two packages, two literals, no shared module — so the agreement is read out of the
		// daemon's config schema. A BASE_PATH default changed there without changing it here
		// would make every socket-paired engine 404 against a running daemon.
		expect(read('publication/site_builder/src/config.ts')).toContain(
			`BASE_PATH: z.string().default('${DEFAULT_DAEMON_BASE_PATH}')`,
		);
	});
});

// ---------------------------------------------------------------------------
// Rules 4 and 5 — the refusal, and its indistinguishability
// ---------------------------------------------------------------------------

/** What the mock daemon publishes as its identity. Swapped per case. */
let published: unknown = null;
/** Every path the mock daemon was asked for, in order. */
let requested: string[] = [];

const siteBuilder = {
	url: '',
	socket: undefined,
	instance: INSTANCE,
	token: TOKEN,
	timeoutMs: 3000,
} as {
	url: string | undefined;
	socket: string | undefined;
	instance: string | undefined;
	token: string | undefined;
	timeoutMs: number;
};

let server: ReturnType<typeof Bun.serve>;
let daemonJson: typeof import('../../tools/tool_sitebuilder/server/daemon_client.ts')['daemonJson'];
/** The tool's OWN availability decision — the thing defect 4 was about. */
let toolIsAvailable: () => boolean;
/** Its action handlers, by name, discovered from the module rather than typed out here. */
let toolActions: Record<string, (ctx: unknown) => Promise<unknown>>;

beforeAll(async () => {
	server = Bun.serve({
		port: 0,
		fetch(req) {
			const url = new URL(req.url);
			requested.push(url.pathname);
			if (url.pathname === '/health') {
				return Response.json({
					service: 'dedalo-site-builder',
					drivers: [],
					...(published === null ? {} : { instance_fingerprint: published }),
				});
			}
			// Reaching anything else means the engine sent a real call to a daemon that never
			// proved who it was. The assertions below turn that into a named failure.
			return Response.json({ data: [] });
		},
	});
	siteBuilder.url = `http://127.0.0.1:${server.port}`;

	mock.module('../../src/config/config.ts', () => ({
		...REAL_CONFIG_MODULE,
		config: { ...REAL_CONFIG_MODULE.config, siteBuilder },
	}));
	// Import AFTER the mock so daemon_client binds to the mocked config.
	({ daemonJson } = await import('../../tools/tool_sitebuilder/server/daemon_client.ts'));
	// The tool module itself, for the same reason: `isAvailable` is asked, not read.
	const { tool: descriptor } = (await import('../../tools/tool_sitebuilder/server/index.ts')) as {
		tool: { isAvailable?: () => boolean };
	};
	if (typeof descriptor?.isAvailable !== 'function') {
		throw new Error(
			'tool_sitebuilder exports no isAvailable() — the availability gate below cannot run, ' +
				'and defect 4 (the tool hiding itself on a socket-paired install) is unheld.',
		);
	}
	toolIsAvailable = descriptor.isAvailable;
	toolActions = Object.fromEntries(
		Object.entries(
			(descriptor as unknown as { apiActions: Record<string, { handler: unknown }> }).apiActions,
		).map(([name, action]) => [name, action.handler as (ctx: unknown) => Promise<unknown>]),
	);
});

afterAll(() => {
	server.stop(true);
	mock.module('../../src/config/config.ts', () => REAL_CONFIG_MODULE);
	mock.restore();
});

const ACTOR = { user_id: 42, username: 'curator' };

/** The refusal, reduced to the bytes a CALLER could ever observe. */
async function refusalShape(): Promise<Record<string, unknown>> {
	requested = [];
	const error = await refusalOf(daemonJson('GET', '/v1/sites', ACTOR));
	return {
		code: error.code,
		message: error.message,
		publicMessage: error.publicMessage ?? null,
		details: error.details ?? null,
		name: error.name,
	};
}

describe('the engine refuses an unproved daemon BEFORE it sends anything', () => {
	test('a wrong fingerprint is site_builder.instance_mismatch, and only /health was called', async () => {
		published = instanceFingerprint('another-museum', TOKEN);
		const shape = await refusalShape();
		expect(shape.code).toBe('site_builder.instance_mismatch');
		// THE LOAD-BEARING ASSERTION. The bearer token, the acting user's name and the
		// request itself never left this process: the only thing the daemon was asked is the
		// unauthenticated question "who are you".
		expect(requested).toEqual(['/health']);
	});

	test('a daemon that publishes NO fingerprint is refused too (no silent downgrade)', async () => {
		published = null;
		const shape = await refusalShape();
		expect(shape.code).toBe('site_builder.instance_mismatch');
		expect(requested).toEqual(['/health']);
	});

	test('the matching daemon is NOT refused — the gate is not vacuous', async () => {
		published = instanceFingerprint(INSTANCE, TOKEN);
		requested = [];
		const answer = (await daemonJson('GET', '/v1/sites', ACTOR)) as { data: unknown[] };
		expect(answer.data).toEqual([]);
		expect(requested).toEqual(['/health', '/v1/sites']);
	});

	test('a proved pairing is remembered: the second call does not re-probe', async () => {
		// The pairing is a fact about this process and a fixed address; re-asking on every
		// call would put a round trip in front of every list, message and build.
		published = instanceFingerprint(INSTANCE, TOKEN);
		await daemonJson('GET', '/v1/sites', ACTOR);
		requested = [];
		await daemonJson('GET', '/v1/sites', ACTOR);
		expect(requested).toEqual(['/v1/sites']);
	});
});

describe('the refusal is not an enumeration oracle', () => {
	test('wrong instance, unknown instance and wrong token are BYTE-IDENTICAL', async () => {
		// NONE of the three cases may reuse the pairing an earlier test already PROVED
		// (INSTANCE + TOKEN): a proven pairing is remembered for the process, so reusing it
		// would make the call succeed and this gate pass vacuously.

		// Case A — WRONG INSTANCE: a real daemon, belonging to another museum on this host.
		siteBuilder.instance = 'museum-a';
		siteBuilder.token = TOKEN;
		published = instanceFingerprint('museum-b', TOKEN);
		const wrongInstance = await refusalShape();

		// Case B — UNKNOWN INSTANCE: this engine names a museum that exists nowhere.
		siteBuilder.instance = 'no-such-museum-anywhere';
		siteBuilder.token = TOKEN;
		published = instanceFingerprint('museum-b', TOKEN);
		const unknownInstance = await refusalShape();

		// Case C — WRONG TOKEN: the right daemon, a credential that does not match.
		siteBuilder.instance = 'museum-a';
		siteBuilder.token = 'a-different-token-0000000000000000000';
		published = instanceFingerprint('museum-a', TOKEN);
		const wrongToken = await refusalShape();

		siteBuilder.instance = INSTANCE;
		siteBuilder.token = TOKEN;

		// Same code, same message, same absent publicMessage, same absent details. If any of
		// these ever differed, a caller could ask this action which museums a host serves, or
		// confirm a guessed token, one call at a time.
		expect(unknownInstance).toEqual(wrongInstance);
		expect(wrongToken).toEqual(wrongInstance);
		expect(wrongInstance.code).toBe('site_builder.instance_mismatch');
		// Operator disclosure: the sentence a browser could ever see is the registry's, and
		// nothing here offers a publicMessage that would replace it.
		expect(wrongInstance.publicMessage).toBeNull();
		// And nothing in it names either half of the pairing.
		const serialized = JSON.stringify(wrongInstance);
		expect(serialized).not.toContain(TOKEN);
		expect(serialized).not.toContain('museum-a');
		expect(serialized).not.toContain('museum-b');
	});

	test('an UNREACHABLE daemon is a different refusal (a network fact is not a config fact)', async () => {
		// Anti-vacuity for the equality above: not everything collapses into one code, so the
		// three cases agreeing means something.
		const previous = siteBuilder.url;
		siteBuilder.url = 'http://127.0.0.1:1';
		requested = [];
		const error = await refusalOf(daemonJson('GET', '/v1/sites', ACTOR));
		expect(error.code).toBe('site_builder.unreachable');
		siteBuilder.url = previous;
	});

	test('an unconfigured install refuses without probing at all', async () => {
		const previous = siteBuilder.instance;
		siteBuilder.instance = undefined;
		requested = [];
		const error = await refusalOf(daemonJson('GET', '/v1/sites', ACTOR));
		expect(error.code).toBe('site_builder.unconfigured');
		expect(requested).toEqual([]);
		siteBuilder.instance = previous;
	});
});

// ---------------------------------------------------------------------------
// Rule 6 — the fragment the daemon renders is the fragment this engine consumes
// ---------------------------------------------------------------------------

describe('the pairing fragment has ONE spelling on both sides', () => {
	const RENDERER = 'publication/site_builder/src/provision/render/engine_fragment.ts';

	test('every key the renderer assigns is a key this engine documents', () => {
		const source = read(RENDERER);
		// ENGINE_KEYS on that side is the daemon's only vocabulary for this engine's config.
		// Each one must be a catalogued key here, or the fragment writes a line the engine
		// ignores and an operator cannot debug.
		const rendered = [...source.matchAll(/'(DEDALO_SITE_BUILDER_[A-Z_]+)'/g)].map((m) => m[1]);
		expect(rendered.length).toBeGreaterThan(0);
		for (const key of new Set(rendered)) {
			expect(CONFIG_CATALOG[key as string], `${key} is rendered but not catalogued`).toBeDefined();
		}
	});

	test('the token placeholder is the same literal on both sides', () => {
		// scripts/site_builder_pair.ts REFUSES to append this value (the .env is append-only,
		// so "paste over the placeholder later" is not available to an operator). If the two
		// literals drifted, that refusal would stop firing and installs would silently be
		// paired with a token that is a sentence.
		const rendererSource = read(RENDERER);
		const placeholder = /TOKEN_PLACEHOLDER = '([^']+)'/.exec(rendererSource)?.[1];
		expect(placeholder, 'the renderer no longer declares TOKEN_PLACEHOLDER').toBeDefined();
		expect(read('scripts/site_builder_pair.ts')).toContain(
			`const TOKEN_PLACEHOLDER = '${placeholder}'`,
		);
	});

	test('the pairing script writes only site-builder keys, and only catalogued ones', () => {
		const script = read('scripts/site_builder_pair.ts');
		// Both refusals are the whole reason this script exists rather than a `cat >>`.
		expect(script).toContain('CONFIG_CATALOG[key] === undefined');
		expect(script).toContain("const KEY_PREFIX = 'DEDALO_SITE_BUILDER_'");
		// It appends; it never rewrites a line. `writeFileSync` appears once, over
		// `existingText + block`.
		expect(script).toContain('`${existingText}${separator}${block}`');
	});
});

/**
 * THE TOOL IS AVAILABLE ON THE TOPOLOGY THE PROVISIONER DELIVERS.
 *
 * `isAvailable` decided configuration for itself — `url && token` — while the provisioner's
 * rendered engine fragment sets DEDALO_SITE_BUILDER_SOCKET and no URL at all. So a correctly
 * provisioned, correctly paired install hid the tool from every toolbar, which is the one
 * symptom an operator cannot debug: the feature simply is not there. It must ask the same
 * resolver every other consumer asks.
 */
describe('tool availability follows the resolver, not a second opinion', () => {
	const SOCKET_PAIRED = {
		url: undefined,
		socket: '/run/dedalo-sites/example/daemon.sock',
		instance: 'example',
		token: 'x'.repeat(32),
		timeoutMs: 10_000,
	} as const;

	test('a socket-only pairing resolves to a transport', () => {
		expect(resolveSiteBuilderTransport({ ...SOCKET_PAIRED })).not.toBeNull();
	});

	/**
	 * DEFECT 4, HELD AS BEHAVIOUR RATHER THAN AS A LITERAL.
	 *
	 * This test used to assert that the tool's SOURCE contained the exact string
	 * `isAvailable: () => resolveSiteBuilderTransport(config.siteBuilder) !== null`. That is
	 * the same shape as the dotfile gate that pinned `(?!well-known)` and missed the missing
	 * trailing slash: it holds a spelling, not a property. Measured — moving the required
	 * literal into a comment and restoring the old `url && token` test left this file at 28
	 * pass / 0 fail, with the defect fully back: a socket-paired install hides the tool from
	 * every toolbar again.
	 *
	 * `isAvailable` is an exported, callable function. So it is CALLED, on the topology the
	 * provisioner now makes primary — a rendered engine fragment that sets
	 * DEDALO_SITE_BUILDER_SOCKET and no URL at all.
	 */
	test('the tool is AVAILABLE on a socket-only pairing — the topology the provisioner delivers', async () => {
		const restore = { url: siteBuilder.url, socket: siteBuilder.socket };
		try {
			// Exactly what the rendered fragment gives an engine on a provisioned host.
			siteBuilder.url = undefined;
			siteBuilder.socket = '/run/dedalo-sites/example/daemon.sock';
			expect(toolIsAvailable()).toBe(true);
		} finally {
			Object.assign(siteBuilder, restore);
		}
	});

	/**
	 * BELT AND BRACES, HELD AS THE OUTCOME.
	 *
	 * `isAvailable` is the braces (the tool does not appear at all); the `isConfigured()`
	 * pre-check inside `proxy()` and `sessionStream()` is the belt, so an action reached
	 * DESPITE `isAvailable` still fails closed. Defect 4 was exactly those two disagreeing.
	 *
	 * HONEST LIMIT, stated because the rule for this phase is that a gate says what it
	 * holds: removing the pre-check alone is NOT observable from here — `requireTransport()`
	 * throws the same registered code one layer down, so the caller sees the same refusal.
	 * What this holds is the outcome both guards exist for: on an unconfigured install every
	 * action refuses with `site_builder.unconfigured` and NOTHING is sent. That reddens if
	 * both are removed, and it is the property a museum actually has.
	 */
	/**
	 * A PUBLISHER, NOT AN ADMIN — deliberately. A global admin bypasses the session
	 * ownership check, so with an admin the session doors would answer the same whether the
	 * unconfigured pre-check ran before that check or not. An ordinary publisher owns none
	 * of these ids, which is what makes the ORDER observable: pre-check first is
	 * `site_builder.unconfigured`; ownership first is `site_builder.rejected`.
	 */
	const PUBLISHER = { userId: 1, isGlobalAdmin: false, isDeveloper: true };

	test('an unconfigured install refuses every action, and sends nothing', async () => {
		const restore = { ...siteBuilder };
		const before = requested.length;
		try {
			siteBuilder.url = undefined;
			siteBuilder.socket = undefined;
			// `get_status` is the ONE action that ANSWERS on an unconfigured install instead of
			// refusing — the ops panel has to be able to render "not configured here" — and it
			// is named as the exception rather than skipped silently.
			const status = (await (toolActions.get_status as (ctx: unknown) => Promise<unknown>)({
				principal: PUBLISHER,
				userId: 1,
				options: {},
				background: false,
			})) as { data: { configured: boolean; reachable: boolean } };
			expect(status.data).toMatchObject({ configured: false, reachable: false });

			// EVERY OTHER action, discovered from the module — a gate that hand-listed them
			// would stop covering the tool the moment a fifteenth action was added.
			const names = Object.keys(toolActions).filter((name) => name !== 'get_status');
			expect(names.length).toBeGreaterThan(10);
			for (const action of names) {
				const handler = toolActions[action] as (ctx: unknown) => Promise<unknown>;
				const refusal = await refusalOf(
					handler({
						principal: PUBLISHER,
						userId: 1,
						options: { slug: 'anything', session_id: 'anything', prompt: 'x' },
						background: false,
					}),
				);
				expect({ action, code: refusal.code }).toEqual({
					action,
					code: 'site_builder.unconfigured',
				});
			}
			expect(requested.length, 'an unconfigured install still reached the daemon').toBe(before);
		} finally {
			Object.assign(siteBuilder, restore);
		}
	});

	test('and UNAVAILABLE when the pairing is half-configured — availability is not "always true"', async () => {
		const restore = { url: siteBuilder.url, socket: siteBuilder.socket, token: siteBuilder.token };
		try {
			siteBuilder.url = undefined;
			siteBuilder.socket = undefined;
			expect(toolIsAvailable()).toBe(false);

			// An address but no credential is not a pairing either.
			siteBuilder.socket = '/run/dedalo-sites/example/daemon.sock';
			siteBuilder.token = undefined;
			expect(toolIsAvailable()).toBe(false);
		} finally {
			Object.assign(siteBuilder, restore);
		}
	});

	test('and a half-configured pairing still resolves to nothing', () => {
		// Anti-vacuity: availability must not become "always true".
		expect(resolveSiteBuilderTransport({ ...SOCKET_PAIRED, instance: undefined })).toBeNull();
		expect(resolveSiteBuilderTransport({ ...SOCKET_PAIRED, token: undefined })).toBeNull();
	});
});
