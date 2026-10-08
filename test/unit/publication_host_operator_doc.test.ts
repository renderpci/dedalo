/**
 * The publication-host operator page (docs/install/publication_host.md) states what
 * `provision check` and `release.install` actually enforce: an operator who follows it
 * must not meet a refusal the page never warned about.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostDeclaration } from '../../publication/host_agent/src/provision/layout';
import { derive, LISTEN_HOST_PATTERN } from '../../publication/host_agent/src/provision/layout';
import { AGENT_TREE_WALK_CAP } from '../../publication/host_agent/src/provision/plan';

const repoRoot = join(import.meta.dir, '..', '..');
const page = readFileSync(join(repoRoot, 'docs/install/publication_host.md'), 'utf8');
const example = JSON.parse(
	readFileSync(
		join(repoRoot, 'publication/host_agent/deploy/examples/instance.example.json'),
		'utf8',
	),
) as { listen: { host: string; port: number } };

describe('publication host operator page', () => {
	test('every agent URL names an IPv4 literal the schema accepts (the cert SAN), never a hostname', () => {
		const hosts = [...page.matchAll(/https:\/\/([^/:\s]+):(\d+)\/publication\/host_agent/g)];
		expect(hosts.length).toBeGreaterThan(0);
		for (const [, host, port] of hosts) {
			expect(LISTEN_HOST_PATTERN.test(host!), `${host} is not a listen.host`).toBe(true);
			expect(`${host}:${port}`).toBe(`${example.listen.host}:${example.listen.port}`);
		}
	});

	test('step 3 says listen.host is an IPv4 address literal, no hostname, no wildcard', () => {
		expect(page).toMatch(/private IPv4\s+address/);
		expect(page).toMatch(/no hostname, no\s+wildcard/);
	});

	test('step 1 states the code-trust preconditions plan.ts refuses on', () => {
		expect(page).toMatch(/every parent directory/);
		expect(page).toMatch(/not a symbolic link/);
		expect(page).toContain('.test-tmp/');
		expect(page).toMatch(/a test scratch tree/);
	});

	test('step 2 declares BEFORE step 3 creates the accounts, and its declaration derives (one and two machines)', () => {
		expect(page.indexOf('### 2. Declare the instance')).toBeGreaterThan(0);
		expect(page.indexOf('### 3. Create the accounts')).toBeGreaterThan(
			page.indexOf('### 2. Declare the instance'),
		);
		const block = page.match(/### 2\. Declare the instance[\s\S]*?```json\n([\s\S]*?)\n```/);
		if (!block?.[1]) throw new Error('step 2 has no json declaration');
		const declared = JSON.parse(block[1]) as HostDeclaration;
		// Same keys as the committed one-machine example (derive() reads, the schema refuses unknown keys).
		const committed = JSON.parse(
			readFileSync(
				join(
					repoRoot,
					'publication/host_agent/deploy/examples/instance.single_machine.example.json',
				),
				'utf8',
			),
		) as Record<string, unknown>;
		expect(Object.keys(declared).sort()).toEqual(Object.keys(committed).sort());
		const one = derive(declared);
		const { engine_group: _socketOnly, ...rest } = declared;
		derive({ ...rest, listen: { kind: 'tls', host: '10.20.0.2', port: 8471 } });
		// Step 3's commands name exactly the accounts the declaration does.
		expect(page).toContain(`--user-group ${one.identity.agentUser}`);
		expect(page).toContain(`groupadd --system ${one.identity.v2Group}`);
		expect(page).toContain(`-g ${one.identity.v2Group} ${one.identity.v2User}`);
		expect(page).toMatch(
			new RegExp(`-g www-data -d /home/\\S+/httpdocs ${one.identity.v1User}\\b`),
		);
	});

	test('the shared API configuration step exists, with its refusal in troubleshooting', () => {
		expect(page).toMatch(/### \d+\. Create the API configuration files/);
		expect(page).toContain('publication_api/v2/shared/v2.env');
		expect(page).toMatch(/\| an API install is refused: `shared_config_missing` \|/);
	});

	test('the engine bundle step is marked two machines only (a socket listener issues none)', () => {
		expect(page).toMatch(
			/### \d+\. Carry the engine bundle to the work system \(two machines only\)/,
		);
	});

	test('step 3 does not claim the agent calls Bun (no named command runs BUN_BIN)', () => {
		expect(page).not.toMatch(/runtimes the agent calls/);
	});

	test('an unreachable agent is never told its withdrawn files already 404 (marker may remain)', () => {
		// media_copy_apply.ts records the pending marker BEFORE `media.mark false`; an
		// unreachable agent keeps its marker, so its gate still serves the files.
		const rows = page
			.split('\n')
			.filter((line) => line.startsWith('| a pending deletion turns red'));
		const unreachable = rows.find((line) => /could not be reached/.test(line));
		expect(unreachable).toBeDefined();
		expect(unreachable).toMatch(/STILL BE PUBLIC/);
		expect(unreachable).not.toMatch(/already answers "not found"/);
		expect(page).toMatch(
			/cannot be reached the marker stays, and the files are \*\*still public\*\*/,
		);
		const fragment = readFileSync(
			join(repoRoot, 'changes/unreleased/publication-host-lockstep-copy-probe.md'),
			'utf8',
		);
		expect(fragment).not.toMatch(/"not found" at once/);
	});

	test('the public check states the probe.ts verdict order: failure beats unknown', () => {
		expect(page).toMatch(/even when the other file could not be checked/);
		const spec = readFileSync(join(repoRoot, 'engineering/PUBLICATION_HOST_SPEC.md'), 'utf8');
		expect(spec).toMatch(
			/is `failed` \(red\), with both statuses recorded,\s+even when the other side is `unknown`/,
		);
	});

	test('the API push is promised after a CODE update/restore only; a database restore sends nothing', () => {
		// post_restore.ts runs publication_apis DRY; only boot_confirm (a code sentinel) pushes.
		const fragment = readFileSync(
			join(repoRoot, 'changes/unreleased/publication-host-lockstep-copy-probe.md'),
			'utf8',
		);
		for (const text of [page, fragment]) {
			expect(text).not.toMatch(/after every restore/i);
			expect(text).not.toMatch(/every code update or restore/i);
			expect(text).toMatch(/code update or code restore/);
			expect(text).toMatch(/database restore does not change the code/i);
		}
	});

	test('the agent_dir walk cap the page quotes IS plan.ts AGENT_TREE_WALK_CAP; the README names the constant', () => {
		// The operator sizes agent_dir by this number: a cap change must move the page with it.
		const quoted = [...page.matchAll(/(?:stops at|more than) (\d[\d,]*) entries/g)].map(([, n]) =>
			Number(n!.replaceAll(',', '')),
		);
		expect(quoted.length).toBeGreaterThanOrEqual(2);
		for (const n of quoted) expect(n).toBe(AGENT_TREE_WALK_CAP);
		const readme = readFileSync(join(repoRoot, 'publication/host_agent/README.md'), 'utf8');
		expect(readme).toContain('`AGENT_TREE_WALK_CAP`');
		expect(readme).not.toMatch(/\d{4,} entries/);
	});
});
