/**
 * The publication-host panel status (src/core/publication_host/host_status.ts): PURE, so
 * every input is built here, no agent, no registry file, no config. Pins the check
 * vocabulary per state, the "unproved agent says nothing" law (phase-3 Review Focus 1),
 * the registry-invalid line (Review Focus 2), that no secret or agent prose reaches a row
 * (Review Focus 5), that every `publication_host.*` code is classified, and that the
 * lockstep compares against DEDALO_VERSION (untagged), never the tagged engine version.
 */

import { describe, expect, test } from 'bun:test';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { ERROR_CODES } from '../../src/core/errors/registry.ts';
import type { AgentStatus, MediaProbe } from '../../src/core/publication_host/agent_client.ts';
import {
	buildHostChecks,
	buildHostPanelRow,
	HOST_CHECK_IDS,
	type HostCheck,
	type HostStatusInput,
	PAIRING_ON_FAILURE,
	REACHABLE_ON_FAILURE,
	registryInvalidCheck,
	statusOutcomeFromError,
} from '../../src/core/publication_host/host_status.ts';
import { publicationHostFingerprint } from '../../src/core/publication_host/pairing.ts';
import type { PublicationHostRecord } from '../../src/core/publication_host/registry.ts';
import { DEDALO_VERSION } from '../../src/core/update/version.ts';

const TOKEN = 'publication-host-status-token-000000000000';
/** Stands in for key material (never a PEM-shaped literal: the secret scanner would flag it). */
const KEY_SENTINEL = 'engine-bundle-key-material-sentinel';
const FINGERPRINT = publicationHostFingerprint('test', TOKEN);
const OTHER_FINGERPRINT = publicationHostFingerprint('test', `${TOKEN}-rotated`);
const ENGINE = '9.1.0';
const RELEASE = `${ENGINE}_a1b2c3d`;
const HASH = 'a'.repeat(64);

const RECORD: PublicationHostRecord = {
	name: 'pubtest',
	instance: 'test',
	fingerprint: FINGERPRINT,
	address: { kind: 'tls', host: 'agent.pub.test', port: 8443 },
	public_url: 'https://www.pub.test',
	qualities: null,
	probe: { published: null, unpublished: null },
	paired_at: '2026-10-03T10:00:00.000Z',
};

const UNIX_RECORD: PublicationHostRecord = {
	...RECORD,
	name: 'pubtest_local',
	address: { kind: 'unix', socket: '/run/dedalo-pubhost/test.sock' },
};

interface StatusPatch {
	media?: Partial<MediaProbe>;
	rules?: Partial<AgentStatus['rules']>;
	apis?: Partial<AgentStatus['apis']>;
	instance_fingerprint?: string;
}

function agentStatus(patch: StatusPatch = {}): AgentStatus {
	return {
		agent_version: '0.1.0',
		bun_version: Bun.version,
		platform: 'linux-x64',
		instance_fingerprint: patch.instance_fingerprint ?? FINGERPRINT,
		apis: {
			v1: { current: RELEASE, previous: null },
			v2: { current: RELEASE, previous: null },
			...patch.apis,
		},
		rules: { server: 'apache', hash: HASH, ...patch.rules },
		media: {
			mode: 'shared',
			root: '/srv/dedalo_media_ro',
			present: true,
			read_only: true,
			pub_readable: true,
			pub_markers: 3,
			problems: [],
			...patch.media,
		},
		disk: { state_root_free_bytes: 1_000_000 },
	};
}

function healthy(patch: Partial<HostStatusInput> = {}): HostStatusInput {
	return {
		record: RECORD,
		secrets: { token_present: true, bundle_present: true, refused: null },
		status: { ok: true, status: agentStatus() },
		expected: { ok: true, hash: HASH, dropped: [] },
		engineVersion: ENGINE,
		...patch,
	};
}

function withStatus(patch: StatusPatch, expectedHash = HASH): HostStatusInput {
	return healthy({
		status: { ok: true, status: agentStatus(patch) },
		expected: { ok: true, hash: expectedHash, dropped: [] },
	});
}

function byId(checks: HostCheck[]): Record<string, Omit<HostCheck, 'id'>> {
	return Object.fromEntries(checks.map(({ id, ...rest }) => [id, rest]));
}

function checkOf(input: HostStatusInput, id: HostCheck['id']): Omit<HostCheck, 'id'> | undefined {
	return byId(buildHostChecks(input))[id];
}

const AGENT_DERIVED = [
	'agent_version',
	'media_mode',
	'media_mount',
	'media_read_only',
	'rules_hash',
	'api_v1',
	'api_v2',
] as const;

describe('buildHostChecks: a healthy shared host', () => {
	test('every check is present, in HOST_CHECK_IDS order, and ok', () => {
		const checks = buildHostChecks(healthy());
		expect(checks.map((entry) => entry.id)).toEqual([...HOST_CHECK_IDS]);
		expect(checks.filter((entry) => entry.state !== 'ok')).toEqual([]);
	});

	test('details are facts: paired_at, agent version, mode, marker count, hash prefix, release', () => {
		expect(byId(buildHostChecks(healthy()))).toEqual({
			registry: { state: 'ok', detail: RECORD.paired_at },
			secrets: { state: 'ok' },
			reachable: { state: 'ok' },
			pairing: { state: 'ok' },
			agent_version: { state: 'ok', detail: '0.1.0' },
			media_mode: { state: 'ok', detail: 'shared' },
			media_mount: { state: 'ok', detail: '3' },
			media_read_only: { state: 'ok', detail: 'read_only' },
			rules_hash: { state: 'ok', detail: HASH.slice(0, 12) },
			api_v1: { state: 'ok', detail: RELEASE },
			api_v2: { state: 'ok', detail: RELEASE },
		});
	});
});

describe('pairing and transport (Review Focus 1)', () => {
	test('pairing_mismatch: the agent answered, the proof failed, and nothing it says is read', () => {
		const input = healthy({
			status: { ok: false, code: 'publication_host.pairing_mismatch' },
			expected: null,
		});
		const checks = byId(buildHostChecks(input));
		expect(checks.reachable).toEqual({ state: 'ok', detail: 'publication_host.pairing_mismatch' });
		expect(checks.pairing).toEqual({
			state: 'blocked',
			detail: 'publication_host.pairing_mismatch',
		});
		for (const id of AGENT_DERIVED) {
			expect(checks[id]).toEqual({ state: 'unknown', detail: 'status_unavailable' });
		}
		const row = buildHostPanelRow(input);
		expect(row.pairing_proved).toBe(false);
		expect(row.rules).toEqual({ expected: null, reported: null });
	});

	test('a status body whose fingerprint is not the registry one is NOT trusted', () => {
		const input = withStatus({ instance_fingerprint: OTHER_FINGERPRINT });
		const checks = byId(buildHostChecks(input));
		expect(checks.pairing).toEqual({ state: 'blocked', detail: 'status_fingerprint' });
		for (const id of AGENT_DERIVED) {
			expect(checks[id]).toEqual({ state: 'unknown', detail: 'status_unavailable' });
		}
		const row = buildHostPanelRow(input);
		expect(row.pairing_proved).toBe(false);
		expect(row.rules).toEqual({ expected: null, reported: null });
		expect(row.apis).toEqual({
			v1: { current: null, previous: null },
			v2: { current: null, previous: null },
		});
	});

	test('a non-hex fingerprint in the body is a mismatch, never a pass', () => {
		expect(checkOf(withStatus({ instance_fingerprint: 'not-a-fingerprint' }), 'pairing')).toEqual({
			state: 'blocked',
			detail: 'status_fingerprint',
		});
	});

	test.each([
		['publication_host.unreachable', 'blocked', 'unknown'],
		['publication_host.timeout', 'blocked', 'unknown'],
		['publication_host.unconfigured', 'unknown', 'unknown'],
		['publication_host.registry_invalid', 'unknown', 'unknown'],
		['publication_host.auth', 'ok', 'blocked'],
		['publication_host.failed', 'ok', 'ok'],
		['publication_host.busy', 'ok', 'ok'],
		['publication_host.rejected', 'ok', 'ok'],
		['internal.unexpected', 'unknown', 'unknown'],
	] as const)('%s → reachable %s, pairing %s', (code, reachable, pairing) => {
		const checks = byId(buildHostChecks(healthy({ status: { ok: false, code }, expected: null })));
		expect(checks.reachable).toEqual({ state: reachable, detail: code });
		expect(checks.pairing).toEqual({ state: pairing, detail: code });
	});

	test('every publication_host.* code in the error registry is classified on BOTH checks', () => {
		const family = ERROR_CODES.filter((code) => code.startsWith('publication_host.')).sort();
		expect(family.length).toBeGreaterThanOrEqual(9);
		expect([...REACHABLE_ON_FAILURE.keys()].sort()).toEqual(family);
		expect([...PAIRING_ON_FAILURE.keys()].sort()).toEqual(family);
	});
});

describe('secrets', () => {
	test('a TLS host needs the token AND the engine bundle', () => {
		expect(
			checkOf(
				healthy({ secrets: { token_present: false, bundle_present: false, refused: null } }),
				'secrets',
			),
		).toEqual({ state: 'blocked', detail: 'token,engine_bundle' });
		expect(
			checkOf(
				healthy({ secrets: { token_present: true, bundle_present: false, refused: null } }),
				'secrets',
			),
		).toEqual({ state: 'blocked', detail: 'engine_bundle' });
	});

	test('a unix-socket host needs only the token (no mTLS on a local socket)', () => {
		const secrets = { token_present: true, bundle_present: false, refused: null };
		expect(checkOf(healthy({ record: UNIX_RECORD, secrets }), 'secrets')).toEqual({ state: 'ok' });
		expect(
			checkOf(
				healthy({
					record: UNIX_RECORD,
					secrets: { token_present: false, bundle_present: false, refused: null },
				}),
				'secrets',
			),
		).toEqual({ state: 'blocked', detail: 'token' });
	});

	test('a present but REFUSED secret is blocked with the refusal reason, never read as absence', () => {
		const refused = { token_present: false, bundle_present: true, refused: 'bad_mode' as const };
		expect(checkOf(healthy({ secrets: refused }), 'secrets')).toEqual({
			state: 'blocked',
			detail: 'bad_mode',
		});
		expect(checkOf(healthy({ record: UNIX_RECORD, secrets: refused }), 'secrets')).toEqual({
			state: 'blocked',
			detail: 'bad_mode',
		});
	});

	test('a refusal blocks even when both presence flags read true', () => {
		const secrets = { token_present: true, bundle_present: true, refused: 'bad_owner' as const };
		expect(checkOf(healthy({ secrets }), 'secrets')).toEqual({
			state: 'blocked',
			detail: 'bad_owner',
		});
	});
});

describe('media', () => {
	test('a writable shared mount is blocked: the public host could rewrite the work media', () => {
		expect(checkOf(withStatus({ media: { read_only: false } }), 'media_read_only')).toEqual({
			state: 'blocked',
			detail: 'writable',
		});
	});

	test('a copy root must be writable, and a read-only one is blocked', () => {
		const copy = { mode: 'copy' as const, pub_readable: null, pub_markers: null };
		expect(
			checkOf(withStatus({ media: { ...copy, read_only: false } }), 'media_read_only'),
		).toEqual({
			state: 'ok',
			detail: 'writable',
		});
		expect(checkOf(withStatus({ media: { ...copy, read_only: true } }), 'media_read_only')).toEqual(
			{
				state: 'blocked',
				detail: 'read_only',
			},
		);
	});

	test('copy mode warns until the engine has a copy target (phase 5 flips this)', () => {
		const input = withStatus({ media: { mode: 'copy', read_only: false, pub_readable: null } });
		expect(checkOf(input, 'media_mode')).toEqual({ state: 'warn', detail: 'copy' });
		expect(checkOf(input, 'media_mount')).toEqual({ state: 'ok', detail: 'present' });
		expect(checkOf(input, 'rules_hash')).toEqual({ state: 'ok', detail: 'not_applicable' });
	});

	test('an unmeasured read-only state is unknown, never assumed', () => {
		expect(checkOf(withStatus({ media: { read_only: null } }), 'media_read_only')).toEqual({
			state: 'unknown',
			detail: 'unmeasured',
		});
	});

	test('an absent root and an unreadable marker store are blocked', () => {
		expect(
			checkOf(withStatus({ media: { present: false, read_only: null } }), 'media_mount'),
		).toEqual({ state: 'blocked', detail: 'absent' });
		expect(checkOf(withStatus({ media: { pub_readable: false } }), 'media_mount')).toEqual({
			state: 'blocked',
			detail: 'pub_unreadable',
		});
	});

	test('mode none: a warning, and nothing to mount, measure or gate', () => {
		const checks = byId(
			buildHostChecks(
				withStatus({
					media: { mode: 'none', root: null, present: false, read_only: null, pub_readable: null },
				}),
			),
		);
		expect(checks.media_mode).toEqual({ state: 'warn', detail: 'none' });
		expect(checks.media_mount).toEqual({ state: 'ok', detail: 'none' });
		expect(checks.media_read_only).toEqual({ state: 'ok', detail: 'none' });
		expect(checks.rules_hash).toEqual({ state: 'ok', detail: 'not_applicable' });
	});
});

describe('rules_hash', () => {
	test('no include applied is blocked', () => {
		expect(checkOf(withStatus({ rules: { hash: null } }), 'rules_hash')).toEqual({
			state: 'blocked',
			detail: 'none',
		});
	});

	test('a reported hash that is not the expected one is blocked as drift', () => {
		expect(checkOf(withStatus({}, 'b'.repeat(64)), 'rules_hash')).toEqual({
			state: 'blocked',
			detail: 'drift',
		});
	});

	test('a match whose override dropped a quality warns and names it', () => {
		const input = healthy({ expected: { ok: true, hash: HASH, dropped: ['image/original'] } });
		expect(checkOf(input, 'rules_hash')).toEqual({
			state: 'warn',
			detail: 'dropped:image/original',
		});
	});

	test.each(['mode', 'server', 'root', 'input'] as const)(
		'an expected-rules refusal (%s) is blocked with its reason',
		(reason) => {
			expect(checkOf(healthy({ expected: { ok: false, reason } }), 'rules_hash')).toEqual({
				state: 'blocked',
				detail: reason,
			});
		},
	);

	test('a shared host with no expected outcome computed is blocked, not ok', () => {
		expect(checkOf(healthy({ expected: null }), 'rules_hash')).toEqual({
			state: 'blocked',
			detail: 'not_computed',
		});
	});
});

describe('API lockstep (spec §3)', () => {
	test('no release installed warns', () => {
		expect(
			checkOf(withStatus({ apis: { v1: { current: null, previous: null } } }), 'api_v1'),
		).toEqual({ state: 'warn', detail: 'none' });
	});

	test('a release of another engine version warns with both versions', () => {
		expect(
			checkOf(
				withStatus({ apis: { v2: { current: '9.0.9_a1b2c3d', previous: RELEASE } } }),
				'api_v2',
			),
		).toEqual({ state: 'warn', detail: `9.0.9_a1b2c3d != ${ENGINE}` });
	});

	test('engineVersion is DEDALO_VERSION (no tag): a prerelease-tagged version would warn for ever', () => {
		expect(DEDALO_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
		const release = `${DEDALO_VERSION}_a1b2c3d`;
		const apis = {
			v1: { current: release, previous: null },
			v2: { current: release, previous: null },
		};
		const base = healthy({ status: { ok: true, status: agentStatus({ apis }) } });
		expect(checkOf({ ...base, engineVersion: DEDALO_VERSION }, 'api_v1')).toEqual({
			state: 'ok',
			detail: release,
		});
		// What passing DEDALO_ENGINE_VERSION (`${DEDALO_VERSION}.dev`) on a dev build would do:
		expect(checkOf({ ...base, engineVersion: `${DEDALO_VERSION}.dev` }, 'api_v1')).toEqual({
			state: 'warn',
			detail: `${release} != ${DEDALO_VERSION}.dev`,
		});
	});
});

describe('registry and outcomes', () => {
	test('an invalid registry is one loud blocked line naming the reason (Review Focus 2)', () => {
		expect(registryInvalidCheck('invalid_json')).toEqual({
			id: 'registry',
			state: 'blocked',
			detail: 'invalid_json',
		});
	});

	test('statusOutcomeFromError keeps the typed code and drops every message', () => {
		const typed = new DedaloError('publication_host.failed', { message: `agent said: ${TOKEN}` });
		expect(statusOutcomeFromError(typed)).toEqual({ ok: false, code: 'publication_host.failed' });
		const untyped = statusOutcomeFromError(new Error(`boom ${KEY_SENTINEL}`));
		expect(untyped).toEqual({ ok: false, code: 'internal.unexpected' });
		expect(JSON.stringify(untyped)).not.toContain(KEY_SENTINEL);
	});
});

describe('buildHostPanelRow', () => {
	test('the row of a healthy host', () => {
		expect(buildHostPanelRow(healthy())).toEqual({
			name: 'pubtest',
			address_label: 'agent.pub.test:8443',
			public_url: 'https://www.pub.test',
			checks: buildHostChecks(healthy()),
			rules: { expected: HASH, reported: HASH },
			apis: { v1: { current: RELEASE, previous: null }, v2: { current: RELEASE, previous: null } },
			token_present: true,
			bundle_present: true,
			pairing_proved: true,
		});
	});

	test('a unix host is labelled by its socket', () => {
		expect(buildHostPanelRow(healthy({ record: UNIX_RECORD })).address_label).toBe(
			'unix:/run/dedalo-pubhost/test.sock',
		);
	});

	test('no secret, no agent prose and no extra agent field reaches the row (Review Focus 5)', () => {
		const status = agentStatus({
			media: { problems: [`cannot write ${TOKEN}`, KEY_SENTINEL] },
		}) as AgentStatus & { apis: { v1: { leaked?: string } } };
		status.apis.v1.leaked = TOKEN;
		const row = buildHostPanelRow(healthy({ status: { ok: true, status } }));
		const serialized = JSON.stringify(row);
		expect(serialized).not.toContain(TOKEN);
		expect(serialized).not.toContain(KEY_SENTINEL);
		expect(serialized).not.toContain(FINGERPRINT);
		expect(Object.keys(row.apis.v1).sort()).toEqual(['current', 'previous']);
	});
});
