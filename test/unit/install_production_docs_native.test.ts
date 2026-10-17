/**
 * THE PRODUCTION PAGES SAY WHAT THE INSTALLER DOES (install campaign 3c,
 * 2026-10-14 — the production-manual package). Each leg compares a page with
 * the code that decides the fact, never with a sentence typed here:
 *
 *  D13 production.md's screen table lists each screen's questions in the order
 *      the screen model asks them (Identity, Web server & TLS, Ontologies —
 *      campaign 3d C3d-F4: the update servers come first).
 *  D14 a Verify command of production.md that reads INSIDE a directory only
 *      root and the service account may enter (the 0750 install folder, the
 *      0750 socket dir, the 0750 instance web root), or asks SELinux's
 *      privileged tools, is typed with `sudo` — an admin pastes it as is.
 *  D15 multi_instance.md's removal list: step 1 says where the backup unit
 *      writes (the plan's default backup dir and the stores the unit runs) and
 *      warns that step 7 deletes it; step 9 takes every row's web user out of
 *      the group (host_web_site adds it) before `userdel`, then `groupdel`.
 *  D16 (C3g-F1/F2, VM run C3gR1_ubuntu26) step 7 removes the instance's Bun
 *      (layout.ts bunDir) only when the documented registry grep finds no
 *      entry naming its pin — the grep is RUN against an entry written by
 *      registry.ts updateEntry (it must match that pin, not another); step 9
 *      says the gpasswd exit an --abort leaves (web.ts GPASSWD_NOT_A_MEMBER)
 *      is harmless.
 *  D3  production.md quotes the salt's read command the closing To-do prints.
 *  D17 (local CA on production, 2026-10-16) every table and sentence of
 *      docs/install that lists the certificate modes of a route lists exactly
 *      the modes the route ACCEPTS — measured by asking the plan validator
 *      (buildInstallPlan) and the screen model (the tls_mode options it offers),
 *      which must agree with each other; no page says the local CA is
 *      Docker-only while production accepts it.
 *  D18 production.md's Done section says what host_tls's closing To-do tells
 *      for a local CA (tls.ts localCaTold): the authority's file, the curl
 *      check, and per system a trust row whose every `command` and *menu item*
 *      is in the told line for that system — and no told system lacks a row.
 *
 * Proven red by reverting each page fix. DB-free, pure reads.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostCtx } from '../../src/core/install/host/contract.ts';
import type { HostFs } from '../../src/core/install/host/fs.ts';
import { instancePaths } from '../../src/core/install/host/layout.ts';
import { OS_ROWS } from '../../src/core/install/host/os_support.ts';
import { host_engine } from '../../src/core/install/host/production/engine_delegate.ts';
import { bunCacheDir } from '../../src/core/install/host/production/runtime.ts';
import { localCaTold } from '../../src/core/install/host/production/tls.ts';
import { GPASSWD_NOT_A_MEMBER } from '../../src/core/install/host/production/web.ts';
import { updateEntry } from '../../src/core/install/host/registry.ts';
import { backupStores } from '../../src/core/install/host/systemd/render.ts';
import { buildInstallPlan } from '../../src/core/install/install_plan.ts';
import { buildScreens } from '../../src/core/install/screen_model.ts';
import { docsPages } from '../helpers/docs_corpus.ts';
import {
	INSTANCE,
	LOCAL_CA_VARIANTS,
	productionPlanCtx,
	SERVER_NAME,
} from '../helpers/install_host_scratch.ts';
import { modelInput } from '../helpers/install_plain_script.ts';

const ROOT = join(import.meta.dir, '..', '..');
const PRODUCTION = readFileSync(join(ROOT, 'docs/install/production.md'), 'utf8');
const MULTI = readFileSync(join(ROOT, 'docs/install/multi_instance.md'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'docs/install/index.md'), 'utf8');
const DOCKER = readFileSync(join(ROOT, 'docs/install/docker.md'), 'utf8');
const REFERENCE = readFileSync(join(ROOT, 'docs/install/installer_reference.md'), 'utf8');

/** The question keys a production screen asks, in order. */
function askedKeys(screenId: string, raw: Record<string, unknown>): string[] {
	const screen = buildScreens(modelInput({ route: 'production', instance: 'museo', ...raw })).find(
		(item) => item.id === screenId,
	);
	return (screen?.questions ?? []).flatMap((question) =>
		question.key === null ? [] : [question.key],
	);
}

/** The table row of a screen in production.md's "The screens ask, in order" table. */
function tableRow(title: string): string {
	return PRODUCTION.split('\n').find((line) => line.startsWith(`| **${title}** |`)) ?? '';
}

/** The positions of `phrases` in `row`, in the order `keys` are asked (each phrase once). */
function phraseOrder(row: string, keys: readonly string[], phrases: Record<string, string>) {
	const named = [...new Set(keys.map((key) => phrases[key]).filter((p) => p !== undefined))];
	return named.map((phrase) => ({ phrase, at: row.indexOf(phrase as string) }));
}

function inOrder(positions: readonly { phrase: string | undefined; at: number }[]): boolean {
	return positions.every(
		(item, index) => item.at >= 0 && (index === 0 || item.at > (positions[index - 1]?.at ?? 0)),
	);
}

describe('D13: the screen table lists the questions in the order they are asked', () => {
	test('Identity: … the time zone, then the locale', () => {
		const keys = askedKeys('identity', {});
		expect(keys.indexOf('timezone')).toBeGreaterThan(-1);
		const order = phraseOrder(tableRow('Identity'), keys, {
			timezone: 'the time zone',
			locale: 'the locale',
		});
		expect(order.length).toBe(2);
		expect(inOrder(order), JSON.stringify(order)).toBe(true);
	});

	test('Web server & TLS: the web server, the address, the certificate, the ports', () => {
		const keys = askedKeys('web_tls', { tls_mode: 'letsencrypt' });
		const order = phraseOrder(
			tableRow('Web server &amp; TLS') || tableRow('Web server & TLS'),
			keys,
			{
				web_server: 'nginx or Apache',
				server_name: 'the public address',
				tls_mode: 'the certificate',
				http_port: 'the HTTP and HTTPS ports',
				https_port: 'the HTTP and HTTPS ports',
			},
		);
		expect(order.length).toBe(4);
		expect(inOrder(order), JSON.stringify(order)).toBe(true);
	});

	test('Web server & TLS with a local CA: the certificate, then its other addresses, then the ports', () => {
		const keys = askedKeys('web_tls', { tls_mode: 'local_ca' });
		expect(keys).toContain('tls_extra_names');
		const order = phraseOrder(
			tableRow('Web server &amp; TLS') || tableRow('Web server & TLS'),
			keys,
			{
				server_name: 'the public address',
				tls_mode: 'the certificate',
				tls_extra_names: 'a local CA and its other addresses',
				http_port: 'the HTTP and HTTPS ports',
			},
		);
		expect(order.length).toBe(4);
		expect(inOrder(order), JSON.stringify(order)).toBe(true);
	});

	test('Ontologies: whether to use the official update servers, then the domain ontologies (C3d-F4)', () => {
		const keys = askedKeys('ontologies', {});
		expect(keys).toContain('update_servers');
		expect(keys).toContain('ontologies');
		const order = phraseOrder(tableRow('Ontologies'), keys, {
			update_servers: 'the official update servers',
			ontologies: 'the domain ontologies',
		});
		expect(order.length).toBe(2);
		expect(inOrder(order), JSON.stringify(order)).toBe(true);
	});
});

/** The Verify items of a page: each `- **Verify:**` bullet up to the next bullet of its list. */
function verifyItems(page: string): string[] {
	const lines = page.split('\n');
	const items: string[] = [];
	lines.forEach((line, index) => {
		if (!line.startsWith('- **Verify:**')) return;
		const end = lines.findIndex((next, at) => at > index && /^(- \*\*|#)/.test(next));
		items.push(lines.slice(index, end === -1 ? undefined : end).join('\n'));
	});
	return items;
}

/** Every command a Verify item prints: its inline code spans and its shell-block lines. */
function verifyCommands(page: string): string[] {
	return verifyItems(page).flatMap((item) => {
		const blocks = [...item.matchAll(/```shell\n([\s\S]*?)```/g)].flatMap((match) =>
			(match[1] ?? '').split('\n').map((line) => line.replace(/\s+#.*$/, '').trim()),
		);
		const prose = item.replace(/```shell\n[\s\S]*?```/g, '');
		const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => (match[1] ?? '').trim());
		return [...blocks, ...spans].filter((line) => line !== '');
	});
}

/** Paths only root and the service account can enter (a 0750/0700 directory's INSIDE). */
const GUARDED = [/<dir>\//, /\/run\/dedalo-<i>\//, /\/srv\/dedalo\/<i>\/dedalo/];
const READERS = /^(stat|ls|cat|semanage|semodule)\b/;

/** A command an admin cannot run without sudo, typed without it. */
function needsSudo(command: string): boolean {
	if (!READERS.test(command)) return false;
	return /^sem(anage|odule)\b/.test(command) || GUARDED.some((path) => path.test(command));
}

describe('D14: a Verify command that reads inside a guarded directory is typed with sudo', () => {
	test('production.md', () => {
		const commands = verifyCommands(PRODUCTION);
		expect(commands.length).toBeGreaterThan(20);
		expect(commands.filter(needsSudo)).toEqual([]);
	});

	test('the rule sees the C3c lines (anti-vacuity)', () => {
		expect(
			needsSudo("stat -c '%a %U:%G %n' <dir> <dir>/private /srv/dedalo/<i>/dedalo/media"),
		).toBe(true);
		expect(needsSudo('ls -l /run/dedalo-<i>/dedalo_ts.sock')).toBe(true);
		expect(needsSudo('ls -ld /run/dedalo-<i>')).toBe(false);
		expect(needsSudo('sudo ls -l /run/dedalo-<i>/dedalo_ts.sock')).toBe(false);
	});
});

/** The numbered step `n` of multi_instance.md's removal list. */
function removalStep(n: number): string {
	const section = MULTI.slice(MULTI.indexOf('## Removing an instance'));
	return section.split('\n').find((line) => line.startsWith(`${n}. `)) ?? '';
}

describe('D15: the removal list names the backup, its owner trap and the web user in the group', () => {
	test('step 1: where the backup unit writes — the default backup dir and every store — and that step 7 deletes it', () => {
		const answers = buildInstallPlan({ route: 'production', instance: 'museo' }).answers;
		expect(answers.backup_dir).toBe(`${answers.install_dir}/backups`);
		const step = removalStep(1);
		expect(step).toContain('`<dir>/backups/`');
		const paths = instancePaths({ ...answers, backup_dir: '<dir>/backups' } as never, '1.4.2');
		for (const line of backupStores(paths, OS_ROWS[0] as (typeof OS_ROWS)[number])) {
			const dest = line.args.find((arg) => arg.startsWith('<dir>/backups/')) ?? '';
			const store = dest.replace('<dir>/backups/', '');
			expect(store, line.store).not.toBe('');
			expect(step, line.store).toContain(`\`${store}/\``);
		}
		expect(step).toContain('Step 7 deletes');
		expect(step).not.toContain('cp -a <');
	});

	test("step 9: every row's web user leaves the group before userdel, then groupdel", () => {
		const step = removalStep(9);
		const users = new Set(OS_ROWS.flatMap((row) => [row.web.nginx.user, row.web.apache.user]));
		for (const user of users) expect(step, user).toContain(`\`${user}\``);
		const gpasswd = step.indexOf('gpasswd -d <web user> <group>');
		expect(gpasswd).toBeGreaterThan(-1);
		expect(step.indexOf('userdel <user>')).toBeGreaterThan(gpasswd);
		expect(step.indexOf('groupdel <group>')).toBeGreaterThan(step.indexOf('userdel <user>'));
	});
});

describe("D16: the removal list removes the instance's Bun when unused, and a gpasswd after an --abort is harmless", () => {
	const answers = buildInstallPlan({ route: 'production', instance: 'museo' }).answers;

	test("step 7: the Bun dir, and the registry grep that finds the pin's remaining users", () => {
		const step = removalStep(7);
		const paths = instancePaths(answers as never, '<pin>');
		expect(step).toContain(`\`${paths.bunDir}/\``);
		expect(step).toContain(`\`sudo rm -rf ${paths.bunDir}\``);
		const grep = new RegExp(`sudo grep -rl '([^']+)' ${paths.registryDir}/`).exec(step);
		expect(grep, 'the registry grep').not.toBeNull();
		// The grep, run against what the installer writes into an instance's entry.
		const written = new Map<string, string>();
		const fs = {
			readText: (path: string) => written.get(path) ?? null,
			write: (path: string, content: string) => written.set(path, content),
		} as unknown as HostFs;
		const real = instancePaths(answers as never, '1.4.3');
		updateEntry(fs, real, { bun_pin: '1.4.3' });
		const entry = written.get(real.registry) ?? '';
		const pattern = (pin: string): string => (grep?.[1] ?? '').replace('<pin>', pin);
		expect(entry.includes(pattern('1.4.3')), entry).toBe(true);
		expect(entry.includes(pattern('1.4.2'))).toBe(false);
		expect(step.indexOf('sudo grep -rl')).toBeGreaterThan(
			step.indexOf(`${paths.registryDir}/<i>.json`),
		);
	});

	// C3h-F1 (VM run C3hR1): the installer's per-pin Bun caches were left unnamed.
	test("step 7: the installer's per-pin Bun caches (runtime.ts + install.sh), keep or remove", () => {
		const step = removalStep(7);
		const script = readFileSync(join(ROOT, 'install.sh'), 'utf8');
		const root = /^ROOT_CACHE=(\S+)$/m.exec(script)?.[1];
		const shared = /mkdir -p "\$2\/([\w-]+)\/\$3"/.exec(script)?.[1];
		expect(root, 'install.sh ROOT_CACHE').toBeDefined();
		expect(shared, 'install.sh shared_bun dir').toBeDefined();
		expect(bunCacheDir('<pin>').startsWith(`${root}/`)).toBe(true);
		for (const dir of [bunCacheDir('<pin>'), `${root}/${shared}/<pin>`]) {
			expect(step).toContain(`\`${dir}/\``);
			expect(step).toContain(` ${dir}`);
		}
	});

	test('step 9: the gpasswd exit an --abort leaves is named harmless', () => {
		const step = removalStep(9);
		expect(step).toContain('After an `--abort` the web user is already out of the group');
		expect(step).toContain(`exits ${GPASSWD_NOT_A_MEMBER}, which is harmless`);
	});
});

describe('D3: production.md quotes the salt read command the closing To-do prints', () => {
	test('the command, for the page’s own placeholder', async () => {
		const lines = (await host_engine.afterComplete?.({
			paths: { privateDir: '<install folder>/private' },
			created: { salt_shown: true },
		} as unknown as HostCtx)) as string[];
		const command = /read it with: (.+)$/.exec(lines.join('\n'))?.[1];
		expect(command).toBeDefined();
		expect(PRODUCTION).toContain(`\`${command}\``);
		expect(PRODUCTION).toContain('Every run that completes the install');
	});
});

// ── D17: the certificate modes a page lists are the modes the route accepts ──

/** Every mode a route could name (trial's `none` included: a page must not offer it elsewhere). */
const TLS_UNIVERSE = ['letsencrypt', 'local_ca', 'files', 'none'] as const;
type TlsMode = (typeof TLS_UNIVERSE)[number];

/** The modes the plan validator accepts on `route` (no `tls_mode must be …` refusal). */
function acceptedModes(route: 'production' | 'docker'): TlsMode[] {
	return TLS_UNIVERSE.filter(
		(mode) =>
			!buildInstallPlan({
				route,
				instance: 'museo',
				server_name: 'museo.example.org',
				tls_mode: mode,
			}).errors.some((error) => error.startsWith('tls_mode must be')),
	);
}

/** The tls_mode options the screen model offers on `route`'s certificate screen. */
function offeredModes(route: 'production' | 'docker', screenId: string): string[] {
	const screen = buildScreens(
		modelInput({ route, instance: 'museo', server_name: 'museo.example.org' }),
	).find((item) => item.id === screenId);
	const question = screen?.questions.find((item) => item.key === 'tls_mode');
	return (question?.options ?? []).map((option) => option.value);
}

/** A table row of `page` starting with `start`, or ''. */
function rowOf(page: string, start: string): string {
	return page.split('\n').find((line) => line.startsWith(start)) ?? '';
}

/** How each page names a mode (null: the page has no word for it — it must never be accepted there). */
const PAGE_WORDS: Record<string, Record<TlsMode, RegExp | null>> = {
	'index.md route table': {
		letsencrypt: /Let's Encrypt/,
		local_ca: /local certificate authority/,
		files: /institution's certificate|your own certificate/,
		none: /none: plain HTTP/,
	},
	'production.md certificate table': {
		letsencrypt: /^\| \*\*Let's Encrypt\*\*/m,
		local_ca: /^\| \*\*Local CA\*\*/m,
		files: /^\| \*\*Your institution's certificate\*\*/m,
		none: /^\| \*\*None\*\*/m,
	},
	'docker.md screen table': {
		letsencrypt: /\*\*Let's Encrypt\*\*/,
		local_ca: /\*\*local certificate authority\*\*/,
		files: /\*\*files\*\*/,
		none: /plain HTTP/,
	},
};

/** production.md's "The certificate" table (between its header and the next blank line). */
function certificateTable(): string {
	const lines = PRODUCTION.split('\n');
	const start = lines.indexOf('| Choice | What you need |');
	const end = lines.findIndex((line, at) => at > start && line.trim() === '');
	return start === -1 ? '' : lines.slice(start, end).join('\n');
}

/** The modes a page fragment names, by its words. */
function namedModes(fragment: string, words: Record<TlsMode, RegExp | null>): TlsMode[] {
	return TLS_UNIVERSE.filter((mode) => words[mode]?.test(fragment) === true);
}

describe('D17: every list of certificate modes in docs/install is the set the route accepts', () => {
	const production = acceptedModes('production');
	const docker = acceptedModes('docker');

	test('the validator and the screen model agree (the source the pages are compared with)', () => {
		expect(production.length).toBeGreaterThan(0);
		expect(offeredModes('production', 'web_tls').sort()).toEqual([...production].sort());
		expect(offeredModes('docker', 'tls_address').sort()).toEqual([...docker].sort());
	});

	test("index.md's route table: the TLS cell of Production and Docker", () => {
		const cell = (route: string) => rowOf(INDEX, `| **${route}** |`).split('|')[5] ?? '';
		expect(cell('Production')).not.toBe('');
		expect(namedModes(cell('Production'), PAGE_WORDS['index.md route table']!)).toEqual(production);
		expect(namedModes(cell('Docker'), PAGE_WORDS['index.md route table']!)).toEqual(docker);
	});

	test("production.md's certificate table has one row per accepted mode", () => {
		const table = certificateTable();
		expect(table).not.toBe('');
		expect(namedModes(table, PAGE_WORDS['production.md certificate table']!)).toEqual(production);
	});

	test("docker.md's TLS & address screen row names every accepted mode", () => {
		const row = rowOf(DOCKER, '| **TLS &');
		expect(row).not.toBe('');
		expect(namedModes(row, PAGE_WORDS['docker.md screen table']!)).toEqual(docker);
	});

	test("installer_reference.md's --tls row names every mode either route accepts", () => {
		const row = rowOf(REFERENCE, '| `--tls` |');
		expect(row).not.toBe('');
		for (const mode of new Set([...production, ...docker])) expect(row).toContain(`\`${mode}\``);
	});

	test('no page under docs/install says the local CA is Docker-only while production accepts it', () => {
		expect(production).toContain('local_ca');
		const localCa = /local (certificate authority|CA)|local_ca/i;
		const dockerOnly =
			/Docker only|only on the Docker|on the Docker route, a local|never offered on (this route|`production`)/i;
		const offending: string[] = [];
		// Every page of the install manual, from the manual's one lister (a page added later is read too).
		const pages = docsPages().filter((path) => path.startsWith('docs/install/'));
		expect(pages.length).toBeGreaterThan(10);
		for (const page of pages) {
			const text = readFileSync(join(ROOT, page), 'utf8');
			for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
				if (localCa.test(sentence) && dockerOnly.test(sentence))
					offending.push(`${page}: ${sentence}`);
			}
		}
		expect(offending).toEqual([]);
	});
});

// ── D18: the Done section says what the local CA's closing To-do tells ───────

/** The production Done section (up to the next ## heading). */
function doneSection(): string {
	const start = PRODUCTION.indexOf('\n## Done\n');
	const end = PRODUCTION.indexOf('\n## ', start + 1);
	return start === -1 ? '' : PRODUCTION.slice(start, end === -1 ? undefined : end);
}

/** The page's trust row for a system the told line names (told label → row label). */
const TRUST_ROWS: Record<string, string> = {
	Windows: '| Windows |',
	macOS: '| macOS |',
	'Debian/Ubuntu': '| Debian, Ubuntu |',
	'Fedora/RHEL': '| Fedora, RHEL family |',
	Firefox: '| Firefox',
};

describe("D18: production.md's Done section says what host_tls tells for a local CA", () => {
	const variant = LOCAL_CA_VARIANTS[0];
	if (variant === undefined) throw new Error('no local-CA fixture variant');
	// The told lines need no file on disk: an unreadable authority names the openssl command instead.
	const told = localCaTold({
		...productionPlanCtx(variant),
		fs: { readText: () => null },
	} as unknown as HostCtx);
	const done = doneSection();
	const generic = (line: string) =>
		line
			.replaceAll(`/instances/${INSTANCE}/`, '/instances/<i>/')
			.replaceAll(SERVER_NAME, '<address>');

	test("the authority's file and the curl check, in the page's placeholders", () => {
		const file = /the local certificate authority is (\S+)/.exec(told[0] ?? '')?.[1];
		expect(file).toBeDefined();
		expect(done).toContain(`\`${generic(file as string)}\``);
		const curl = /(curl --cacert \S+ https:\/\/\S+)/.exec(told.join('\n'))?.[1];
		expect(curl).toBeDefined();
		expect(done).toContain(`\`${generic(curl as string)}\``);
	});

	test('every told system has a row, and every command and menu item of a row is in its told clause', () => {
		const trust = told.find((line) => line.startsWith('trust it ONCE')) ?? '';
		const clauses = trust.slice(trust.indexOf(': ') + 2).split('; ');
		expect(clauses.length).toBe(Object.keys(TRUST_ROWS).length);
		for (const clause of clauses) {
			const system = Object.keys(TRUST_ROWS).find((label) => clause.startsWith(label));
			expect(system, clause).toBeDefined();
			const row = rowOf(done.slice(1), TRUST_ROWS[system as string] as string);
			expect(row, system).not.toBe('');
			const spans = [...row.matchAll(/`([^`]+)`|\*([^*|]+)\*/g)].map((m) => m[1] ?? m[2] ?? '');
			expect(spans.length, system).toBeGreaterThan(0);
			for (const span of spans) expect(clause, `${system}: ${span}`).toContain(span);
		}
	});
});
