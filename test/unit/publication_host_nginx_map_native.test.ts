/**
 * THE HOST-WIDE NGINX MAP, ENGINE SIDE (provision init §13.4, §13.8).
 *
 *  1. ROOT'S RENDERER AGREES WITH THE ENGINE BYTE FOR BYTE: the agent package's renderHostMap
 *     over the one contribution parsed from buildNginxMap() IS buildNginxMap(), and its hash is
 *     nginxMapConfigHash() — so a host where every instance runs this engine serves exactly the
 *     engine's map. A change to the engine's comment lines or entry spelling is red HERE (bump
 *     the agent's renderer with it).
 *  2. THE apply_rules ORDER, through the REAL widget (loadDefaultDeps) over the scratch
 *     publication-hosts stores and the loopback mock agent (test/helpers/publication_host_mock_agent.ts):
 *     map before include; a map failure stops the include; an nginx agent without `rules.map`
 *     is refused before anything is sent; `managed:false` skips the map.
 *
 * HERMETIC: no database, no real nginx (the syntax gate is publication_host_nginx_map_syntax).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
	contributionOf,
	isMapRefusal,
	parseNginxMap,
} from '../../publication/host_agent/src/rules/directives.ts';
import {
	planHostMap,
	renderEntries,
	renderHostMap,
} from '../../publication/host_agent/src/rules/host_map.ts';
import { widget } from '../../src/core/area_maintenance/widgets/publication_hosts.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { buildNginxMap, nginxMapConfigHash } from '../../src/core/media/protection.ts';
import { forgetPairing } from '../../src/core/publication_host/agent_client.ts';
import { saveRegistry } from '../../src/core/publication_host/registry.ts';
import { writeHostSecrets } from '../../src/core/publication_host/secrets.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	mintTestPki,
	useScratchPublicationHostsBase,
} from '../helpers/publication_host_fixtures.ts';
import {
	MOCK_MANAGED_MAP,
	type MockAgent,
	mockFingerprint,
	mockNginxStatus,
	mockProblem,
	startMockAgent,
} from '../helpers/publication_host_mock_agent.ts';

const ROOT: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const INSTANCE = 'test';
const TOKEN = `token-map-${'m'.repeat(40)}`;
const HOST = 'zzmap_pub';
const B = '/publication/host_agent';

describe('root renderer ≡ engine map', () => {
	test('renderHostMap([parse(buildNginxMap())]) is buildNginxMap(), its hash nginxMapConfigHash()', () => {
		const text = buildNginxMap();
		const parsed = parseNginxMap(text);
		if (isMapRefusal(parsed))
			throw new Error(`the engine map fails the agent grammar: ${parsed.why}`);
		expect(parsed.hash).toBe(nginxMapConfigHash());
		const contribution = contributionOf(parsed, 'test');
		if (typeof contribution === 'string') throw new Error(contribution);
		const rendered = renderHostMap([contribution]);
		expect(rendered.text).toBe(text);
		expect(rendered.hash).toBe(nginxMapConfigHash());
	});

	test("through root's decision as well: one declared instance, the same bytes", () => {
		const parsed = parseNginxMap(buildNginxMap());
		if (isMapRefusal(parsed)) throw new Error(parsed.why);
		const contribution = contributionOf(parsed, 'alpha');
		if (typeof contribution === 'string') throw new Error(contribution);
		const plan = planHostMap({
			entries: [
				{
					name: 'alpha.json',
					facts: { type: 'file', uid: 1001, size: 2 },
					json: { ...contribution },
				},
			],
			identities: { alpha: 1001 },
			bindings: {},
			previous: null,
		});
		if (plan.kind !== 'render') throw new Error('refused');
		expect(renderEntries(plan.kept).text).toBe(buildNginxMap());
	});
});

describe('apply_rules against the mock agent', () => {
	let mock: MockAgent;
	let scratch: { dispose: () => void };
	let logSpy: ReturnType<typeof spyOn>;
	let infoSpy: ReturnType<typeof spyOn>;
	const fp = mockFingerprint(INSTANCE, TOKEN);

	beforeAll(() => {
		logSpy = spyOn(console, 'warn').mockImplementation(() => {});
		infoSpy = spyOn(console, 'info').mockImplementation(() => {});
		scratch = useScratchPublicationHostsBase();
		const pki = mintTestPki();
		mock = startMockAgent({ kind: 'tls', pki }, INSTANCE, TOKEN);
		saveRegistry({
			version: 1,
			hosts: [
				{
					name: HOST,
					instance: INSTANCE,
					fingerprint: fp,
					address: { kind: 'tls', host: '127.0.0.1', port: mock.port },
					public_url: null,
					qualities: null,
					probe: { published: null, unpublished: null },
					paired_at: '2026-10-08T00:00:00.000Z',
				},
			],
		});
		writeHostSecrets(HOST, TOKEN, pki.bundlePem);
	}, 60_000);

	beforeEach(() => {
		mock.reset();
		forgetPairing(HOST);
	});

	afterAll(() => {
		mock?.stop();
		scratch?.dispose();
		logSpy?.mockRestore();
		infoSpy?.mockRestore();
	});

	async function applyRules(): Promise<{ data: Record<string, unknown>; msg?: string }> {
		const handler = widget.apiActions?.apply_rules;
		if (handler === undefined) throw new Error('apply_rules is not registered');
		return (await handler({ name: HOST }, ROOT)) as { data: Record<string, unknown>; msg?: string };
	}

	const posts = () =>
		mock.requests.filter((r) => r.method === 'POST').map((r) => r.path.slice(B.length));

	test('nginx, managed: rules.map with the engine map BEFORE rules.apply', async () => {
		mock.reply('GET', '/v1/status', { status: 200, body: mockNginxStatus(fp) });
		const outcome = await applyRules();
		expect(posts()).toEqual(['/v1/rules/map', '/v1/rules/apply']);
		const sent = mock.requests.find((r) => r.path === `${B}/v1/rules/map`);
		expect(JSON.parse(new TextDecoder().decode(sent?.body))).toEqual({
			text: buildNginxMap(),
			hash: nginxMapConfigHash(),
		});
		expect(sent?.actor).toBe('dedalo_user:-1');
		expect(outcome.data.map).toEqual({
			state: 'pushed',
			hash: nginxMapConfigHash(),
			host_hash: nginxMapConfigHash(),
			contributions: 1,
		});
		const include = mock.requests.find((r) => r.path === `${B}/v1/rules/apply`);
		expect(JSON.parse(new TextDecoder().decode(include?.body)).server).toBe('nginx');
	});

	test('a map failure stops the include', async () => {
		mock.reply('GET', '/v1/status', { status: 200, body: mockNginxStatus(fp) });
		mock.reply(
			'POST',
			'/v1/rules/map',
			mockProblem(409, 'conflict', 'Conflict', 'newer', { reason: 'map_contribution_newer' }),
		);
		const error = await applyRules().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(DedaloError);
		expect((error as DedaloError).code).toBe('publication_host.rejected');
		expect((error as DedaloError).details).toEqual({ reason: 'map_contribution_newer' });
		expect(posts()).toEqual(['/v1/rules/map']);
	});

	test('an nginx agent without rules.map predates the host map: refused, nothing sent', async () => {
		mock.reply('GET', '/v1/status', { status: 200, body: mockNginxStatus(fp, 'absent') });
		const error = await applyRules().catch((e: unknown) => e);
		expect((error as DedaloError).code).toBe('maintenance.action_refused');
		// Floor: the agent WAS asked (its status answered the refusal) — an empty POST list
		// from a run that never reached the mock would prove nothing.
		expect(mock.requests.filter((r) => r.method === 'GET').length).toBeGreaterThan(0);
		expect(posts()).toEqual([]);
	});

	test('managed:false skips the map; the include goes', async () => {
		mock.reply('GET', '/v1/status', { status: 200, body: mockNginxStatus(fp, { managed: false }) });
		const outcome = await applyRules();
		expect(posts()).toEqual(['/v1/rules/apply']);
		expect(outcome.data.map).toEqual({ state: 'not_applicable' });
	});

	test('the agent reports the engine map loaded: no re-push', async () => {
		const loaded = {
			...MOCK_MANAGED_MAP,
			hash: nginxMapConfigHash(),
			host_hash: nginxMapConfigHash(),
			contributions: 1,
		};
		mock.reply('GET', '/v1/status', { status: 200, body: mockNginxStatus(fp, loaded) });
		await applyRules();
		expect(posts()).toEqual(['/v1/rules/apply']);
	});

	test('apache: no map step at all', async () => {
		await applyRules();
		expect(posts()).toEqual(['/v1/rules/apply']);
	});
});
