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
 *  D3  production.md quotes the salt's read command the closing To-do prints.
 *
 * Proven red by reverting each page fix. DB-free, pure reads.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostCtx } from '../../src/core/install/host/contract.ts';
import { instancePaths } from '../../src/core/install/host/layout.ts';
import { OS_ROWS } from '../../src/core/install/host/os_support.ts';
import { host_engine } from '../../src/core/install/host/production/engine_delegate.ts';
import { backupStores } from '../../src/core/install/host/systemd/render.ts';
import { buildInstallPlan } from '../../src/core/install/install_plan.ts';
import { buildScreens } from '../../src/core/install/screen_model.ts';
import { modelInput } from '../helpers/install_plain_script.ts';

const ROOT = join(import.meta.dir, '..', '..');
const PRODUCTION = readFileSync(join(ROOT, 'docs/install/production.md'), 'utf8');
const MULTI = readFileSync(join(ROOT, 'docs/install/multi_instance.md'), 'utf8');

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
