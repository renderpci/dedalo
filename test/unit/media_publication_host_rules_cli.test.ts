/**
 * The publication-host rules CLI (scripts/media_publication_host_rules.ts), driven
 * in-process through runPublicationHostRulesCli: exit codes, server selection, and the
 * Review-Focus #1 rule that a refused quality is NAMED on stderr, never silently dropped.
 */

import { describe, expect, test } from 'bun:test';
import { runPublicationHostRulesCli } from '../../scripts/media_publication_host_rules.ts';
import { buildNginxMap } from '../../src/core/media/protection.ts';

const ROOT = ['--root', '/srv/dedalo_media_ro'];

describe('media:publication-host-rules', () => {
	test('apache is the default server', () => {
		const r = runPublicationHostRulesCli([...ROOT, '--qualities', 'image/thumb']);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain('<Directory "/srv/dedalo_media_ro">');
	});

	test('--server nginx renders the server{} include', () => {
		const r = runPublicationHostRulesCli([
			...ROOT,
			'--server',
			'nginx',
			'--qualities',
			'image/thumb',
		]);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain('alias /srv/dedalo_media_ro/$dd_path;');
	});

	test('--server nginx-map renders the shared http{} map and needs no root', () => {
		const r = runPublicationHostRulesCli(['--server', 'nginx-map']);
		expect(r.code).toBe(0);
		expect(r.stdout).toBe(buildNginxMap());
	});

	test('a refused master quality is NAMED on stderr while the rest still renders', () => {
		const r = runPublicationHostRulesCli([...ROOT, '--qualities', 'image/thumb,image/original']);
		expect(r.code).toBe(0);
		expect(r.stderr).toContain('image/original');
		expect(r.stdout).not.toContain('image/original');
	});

	test('nothing public left = exit 1 with the reason', () => {
		const r = runPublicationHostRulesCli([...ROOT, '--qualities', 'image/original']);
		expect(r.code).toBe(1);
		expect(r.stdout).toBe('');
		expect(r.stderr).toContain('at least one public quality');
	});

	test('a bad root = exit 1, nothing rendered', () => {
		const r = runPublicationHostRulesCli(['--root', '/', '--qualities', 'image/thumb']);
		expect(r.code).toBe(1);
		expect(r.stdout).toBe('');
	});

	test('missing --root, unknown --server, unknown flag = exit 2 with usage', () => {
		for (const argv of [
			['--qualities', 'image/thumb'],
			[...ROOT, '--server', 'iis'],
			[...ROOT, '--bogus'],
		]) {
			const r = runPublicationHostRulesCli(argv);
			expect(r.code).toBe(2);
			expect(r.stderr).toContain('Usage:');
		}
	});
});
