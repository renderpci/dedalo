/**
 * The expected media include of one publication host (src/core/publication_host/rules.ts).
 * Pins decision E9 of the phase-3 plan: `server` and `root` from the agent's status,
 * qualities from the registry override or getPublicQualities(), and the hash and text
 * CALLED from the phase-1 builders, never re-derived. Pure apart from config reads: no
 * agent, no registry file, no media tree.
 */

import { describe, expect, test } from 'bun:test';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { getPublicQualities } from '../../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	getPublicationHostConfigHash,
	normalizePublicationHostInput,
} from '../../src/core/media/publication_host_rules.ts';
import type { AgentStatus, MediaProbe } from '../../src/core/publication_host/agent_client.ts';
import type { PublicationHostRecord } from '../../src/core/publication_host/registry.ts';
import {
	expectedRulesForHost,
	expectedRulesOutcome,
} from '../../src/core/publication_host/rules.ts';

const ROOT = '/srv/dedalo_media_ro';
const QUALITIES = ['image/thumb', 'av/404'];

const RECORD: PublicationHostRecord = {
	name: 'pubtest',
	instance: 'test',
	fingerprint: 'f'.repeat(64),
	address: { kind: 'tls', host: 'agent.pub.test', port: 8443 },
	public_url: null,
	qualities: QUALITIES,
	probe: { published: null, unpublished: null },
	paired_at: '2026-10-03T10:00:00.000Z',
};

function agentStatus(server: string, media: Partial<MediaProbe> = {}): AgentStatus {
	return {
		agent_version: '0.1.0',
		bun_version: Bun.version,
		platform: 'linux-x64',
		instance_fingerprint: 'f'.repeat(64),
		apis: { v1: { current: null, previous: null }, v2: { current: null, previous: null } },
		rules: { server, hash: null },
		media: {
			mode: 'shared',
			root: ROOT,
			present: true,
			read_only: true,
			pub_readable: true,
			pub_markers: 0,
			problems: [],
			...media,
		},
		disk: { state_root_free_bytes: 1 },
	};
}

function refusal(fn: () => unknown): DedaloError {
	try {
		fn();
	} catch (error) {
		if (error instanceof DedaloError) return error;
		throw error;
	}
	throw new Error('expected a DedaloError refusal, got none');
}

describe('expectedRulesForHost', () => {
	test('apache: the phase-1 hash and the phase-1 text, embedding that same hash', () => {
		const rules = expectedRulesForHost(RECORD, agentStatus('apache'));
		const hash = getPublicationHostConfigHash(
			'apache',
			normalizePublicationHostInput({ root: ROOT, qualities: QUALITIES }),
		);
		expect(rules.server).toBe('apache');
		expect(rules.hash).toBe(hash);
		expect(rules.text).toBe(buildPublicationHostApacheConf({ root: ROOT, qualities: QUALITIES }));
		expect(rules.text).toContain(`# config-hash: ${hash}`);
		// an empty `dropped` means every fed quality was KEPT, never that none were read:
		// floor the feed, and the master-tier test below is the planted positive control
		expect(RECORD.qualities?.length).toBeGreaterThanOrEqual(2);
		expect(rules.dropped).toEqual([]);
	});

	test('nginx: its own builder and its own hash (server is part of the hash)', () => {
		const rules = expectedRulesForHost(RECORD, agentStatus('nginx'));
		expect(rules.server).toBe('nginx');
		expect(rules.text).toBe(buildPublicationHostNginxConf({ root: ROOT, qualities: QUALITIES }));
		expect(rules.text).toContain(`# config-hash: ${rules.hash}`);
		expect(rules.hash).not.toBe(expectedRulesForHost(RECORD, agentStatus('apache')).hash);
	});

	test('the root is the AGENT-reported mount root', () => {
		const other = '/mnt/pub_media';
		const rules = expectedRulesForHost(RECORD, agentStatus('apache', { root: other }));
		expect(rules.hash).toBe(
			getPublicationHostConfigHash(
				'apache',
				normalizePublicationHostInput({ root: other, qualities: QUALITIES }),
			),
		);
	});

	test('no registry override → the engine public qualities', () => {
		const rules = expectedRulesForHost({ ...RECORD, qualities: null }, agentStatus('apache'));
		expect(rules.hash).toBe(
			getPublicationHostConfigHash(
				'apache',
				normalizePublicationHostInput({ root: ROOT, qualities: getPublicQualities() }),
			),
		);
	});

	test('an override with a master tier renders without it and REPORTS it', () => {
		const record = { ...RECORD, qualities: ['image/thumb', 'image/original'] };
		const rules = expectedRulesForHost(record, agentStatus('apache'));
		expect(rules.dropped).toEqual(['image/original']);
		expect(rules.hash).toBe(
			getPublicationHostConfigHash(
				'apache',
				normalizePublicationHostInput({ root: ROOT, qualities: ['image/thumb'] }),
			),
		);
	});

	test.each([
		['a host without media', agentStatus('apache', { mode: 'none', root: null })],
		['an unknown web server', agentStatus('caddy')],
		['no reported root', agentStatus('apache', { root: null })],
		['a root the normalizer refuses', agentStatus('apache', { root: '/srv/../etc' })],
	])('%s is refused with request.invalid_options', (_label, status) => {
		expect(refusal(() => expectedRulesForHost(RECORD, status)).code).toBe(
			'request.invalid_options',
		);
	});
});

describe('expectedRulesOutcome', () => {
	test('ok carries the same hash and dropped list as expectedRulesForHost', () => {
		const status = agentStatus('nginx');
		const { hash, dropped } = expectedRulesForHost(RECORD, status);
		expect(expectedRulesOutcome(RECORD, status)).toEqual({ ok: true, hash, dropped });
	});

	test.each([
		['mode', agentStatus('apache', { mode: 'none', root: null })],
		['server', agentStatus('lighttpd')],
		['root', agentStatus('apache', { root: null })],
		['input', agentStatus('apache', { root: '/srv/../etc' })],
	] as const)('refusal reason %s, never a throw', (reason, status) => {
		expect(expectedRulesOutcome(RECORD, status)).toEqual({ ok: false, reason });
	});

	test('an override with nothing public left is an input refusal', () => {
		const record = { ...RECORD, qualities: ['image/original'] };
		expect(expectedRulesOutcome(record, agentStatus('apache'))).toEqual({
			ok: false,
			reason: 'input',
		});
	});
});
