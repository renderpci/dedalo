/**
 * WHAT THE PRODUCTION HOST STEPS RENDER IS RIGHT, READ THE WAY ITS READER READS
 * IT (terminal installer phase 4, 2026-10-12; src/core/install/host/systemd/
 * render.ts, deploy/systemd/*@*, host/web/{nginx,apache}.ts, host/layout.ts).
 *
 * Every assertion is on the RENDERED bytes of real plans (every supported OS
 * row; nginx and Apache; Let's Encrypt and the institution's files), parsed —
 * never on the source spelling:
 *
 *  (a) THE EFFECTIVE UNITS: template + the instance's drop-in, merged with
 *      systemd's own rules (a list key's empty assignment resets it — what
 *      `systemctl cat` applies). Every Environment= value survives systemd's word
 *      split INTACT (campaign 2 L8: an unquoted `…STORES=matrix_db media private`
 *      silently became `matrix_db`), and the expected store list EQUALS the
 *      stores the active ExecStart lines back up (site builder on and off); the
 *      last store line runs `run --last`; the server runs the pinned root-owned
 *      Bun on the server entry and declares supervision. No `@@` placeholder
 *      survives a render.
 *  (b) THE WATCHDOG IS ARMED ONLY BY ITS STEP (campaign 2 L7): the instance
 *      template neither Wants= nor Also= the watchdog, and the watchdog timer
 *      waits (`OnActiveSec`) before its first check.
 *  (c) NOTHING ROOT RUNS IS THE INSTANCE'S (F2): every ExecStart a unit runs AS
 *      ROOT (no User=, or a `+` line) executes a file outside the instance's
 *      home and tree — the root-owned bin dir the runtime step fills, or a
 *      system binary — and every script it names is one the step copies there.
 *  (e) THE ENGINE'S MEDIA RULES REACH ROOT'S NGINX ONLY AS VALIDATED COPIES
 *      (deploy/dedalo-media-rules.sh, EXECUTED): every rule file the engine
 *      generates (protection.ts, every mode) is accepted and copied byte-equal;
 *      a file carrying anything else — include, a log path, a server block,
 *      a marker probe outside the instance's store, a map handing out a path,
 *      a second capture, an unterminated quote, a symlink — refuses the whole
 *      copy and installs nothing.
 *  (d) TWO INSTANCES SHARE NO NGINX NAME (upstream, rate-limit zone, log files),
 *      every nginx `location` that sets its own add_header carries the whole
 *      security set (L5/L55), `server_tokens off` (L76), and THE ROOT RULE: for
 *      every MEDIA_PATH the plan ACCEPTS, the URL the engine builds
 *      (`/dedalo/<DEDALO_MEDIA_DIR>/…`, default `media`) resolves to MEDIA_PATH
 *      through nginx's `root` and through Apache's media Alias.
 *
 * DB-FREE, pure renders (the hermetic tier runs it).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import type { HostPlanCtx } from '../../src/core/install/host/contract.ts';
import { OS_ROWS } from '../../src/core/install/host/os_support.ts';
import { stampOf } from '../../src/core/install/host/production/common.ts';
import { certificatePaths, siteText } from '../../src/core/install/host/production/web.ts';
import {
	backupStores,
	instanceDropins,
	ROOT_RUN_SCRIPTS,
	renderTemplate,
	siteBuilderBackupUnit,
	UNIT_TEMPLATES,
	type UnitTemplate,
} from '../../src/core/install/host/systemd/render.ts';
import { SECURITY_HEADERS } from '../../src/core/install/host/web/site.ts';
import { buildInstallPlan } from '../../src/core/install/install_plan.ts';
import { buildNginxConf, buildNginxMap } from '../../src/core/media/protection.ts';
import {
	HOST_VARIANTS,
	type HostVariant,
	mergedUnit,
	productionPlanCtx,
	productionRaw,
	REPO_ROOT,
	ROOT_PASSWORD,
	systemdTemplateNames,
	systemdWords,
	unitAssignments,
	unitEnvironment,
	variantName,
} from '../helpers/install_host_scratch.ts';

/** The effective unit of `template` for the instance of `ctx` (its drop-in, when it has one). */
function effective(ctx: HostPlanCtx, template: UnitTemplate): Map<string, string[]> {
	const dropins = instanceDropins(ctx.paths, ctx.row, ctx.answers, stampOf(ctx))
		.filter((dropin) =>
			dropin.path.includes(`/${template.replace('@', `@${ctx.paths.instance}`)}.d/`),
		)
		.map((dropin) => dropin.content);
	return mergedUnit(renderTemplate(template, ctx.row, ctx.source), dropins);
}

/** The store each active backup ExecStart line backs up (`dedalo-backup-step.sh run[ --last] <store> …`). */
function backedUpStores(lines: readonly string[]): string[] {
	return lines.map((line) => {
		const words = line.replace(/^[-+]/, '').split(/\s+/);
		const at = words.indexOf('run');
		return words[at + 1] === '--last' ? (words[at + 2] as string) : (words[at + 1] as string);
	});
}

const NGINX_LE = HOST_VARIANTS[0] as HostVariant;

// ── (a) the effective units ──────────────────────────────────────────────────

describe('the effective units (template + drop-in, as systemd merges them) (a)', () => {
	for (const row of OS_ROWS) {
		for (const siteBuilder of [false, true]) {
			test(`${row.id}, site builder ${siteBuilder ? 'on' : 'off'}: every Environment= intact; expected stores = the stores backed up`, () => {
				const ctx = productionPlanCtx({ os: row.id, web: 'nginx', tls: 'letsencrypt' }, REPO_ROOT, {
					backup_site_builder: siteBuilder,
				});
				const backup = effective(ctx, 'dedalo-backup@.service');
				// Every Environment= word is one KEY=value: nothing split off a value.
				for (const value of backup.get('Service.Environment') ?? []) {
					for (const word of systemdWords(value)) expect(word, value).toMatch(/^[A-Z_][A-Z0-9_]*=/);
				}
				const env = unitEnvironment(backup);
				const execs = backup.get('Service.ExecStart') ?? [];
				expect(execs.some((line) => line === '/bin/false')).toBe(false);
				const stores = backedUpStores(execs);
				expect(stores).toEqual(backupStores(ctx.paths, ctx.row).map((line) => line.store));
				expect(env.get('DEDALO_BACKUP_EXPECTED_STORES')?.split(' ')).toEqual(stores);
				// The ROOT store never rides the instance's set (its .env is the instance's).
				expect(stores.includes('site_builder')).toBe(false);
				expect(backup.get('Unit.Wants') ?? []).toEqual(
					siteBuilder ? [siteBuilderBackupUnit(ctx.paths.instance)] : [],
				);
				if (siteBuilder) {
					const root = effective(ctx, 'dedalo-backup-site-builder@.service');
					const rootExecs = root.get('Service.ExecStart') ?? [];
					expect(backedUpStores(rootExecs)).toEqual(['site_builder']);
					expect(unitEnvironment(root).get('DEDALO_BACKUP_EXPECTED_STORES')).toBe('site_builder');
					expect(root.get('Service.EnvironmentFile') ?? []).toEqual([]);
					expect(root.get('Service.User') ?? []).toEqual([]);
				}
				expect(env.get('DEDALO_BACKUP_STATE_DIR')).toBe(`${ctx.paths.backupDir}/state`);
				// Only the LAST line gives the aggregate verdict.
				expect(execs.map((line) => line.includes(' run --last '))).toEqual(
					execs.map((_line, index) => index === execs.length - 1),
				);
				// The database store dumps with the row's PostgreSQL 18 client (B5).
				expect(execs.find((line) => line.includes(' matrix_db '))).toContain(
					`--pg-dump ${row.pgBinDir}/pg_dump`,
				);
			});
		}

		test(`${row.id}: the server unit runs the pinned root-owned Bun on the server entry, supervised, after ${row.pgService}`, () => {
			const ctx = productionPlanCtx({ os: row.id, web: 'nginx', tls: 'letsencrypt' });
			const server = effective(ctx, 'dedalo-ts@.service');
			expect(server.get('Service.ExecStart')).toEqual([`${ctx.paths.bun} run src/server.ts`]);
			expect(ctx.paths.bun.startsWith('/opt/dedalo/bun/')).toBe(true);
			const env = unitEnvironment(server);
			expect(env.get('DEDALO_SUPERVISED')).toBe('true');
			expect(env.get('DEDALO_CLIENT_PUBLISH_DIR')).toBe(ctx.paths.clientPublish);
			expect(server.get('Unit.After')?.[0]).toContain(row.pgService);
		});

		test(`${row.id}: no @@ placeholder survives any template's render`, () => {
			for (const name of UNIT_TEMPLATES)
				expect(renderTemplate(name, row, REPO_ROOT), name).not.toContain('@@');
		});
	}

	test('positive control: the L8 spelling (an unquoted list) is caught by this reading', () => {
		const l8 = mergedUnit(
			'[Service]\nEnvironment=DEDALO_BACKUP_EXPECTED_STORES=matrix_db media private\n',
			[],
		);
		expect(unitEnvironment(l8).get('DEDALO_BACKUP_EXPECTED_STORES')).toBe('matrix_db');
		expect(
			systemdWords('DEDALO_BACKUP_EXPECTED_STORES=matrix_db media private').filter(
				(word) => !/^[A-Z_]+=/.test(word),
			),
		).toEqual(['media', 'private']);
		// …and an empty assignment resets a list, the way a drop-in replaces ExecStart.
		expect(
			mergedUnit('[Service]\nExecStart=/bin/false\n', [
				'[Service]\nExecStart=\nExecStart=/x\n',
			]).get('Service.ExecStart'),
		).toEqual(['/x']);
	});
});

// ── (b) the watchdog ─────────────────────────────────────────────────────────

describe('the watchdog is armed only by its step (b)', () => {
	test('the instance template neither Wants= nor Also= the watchdog; the timer waits before its first check', () => {
		const row = OS_ROWS[0] as (typeof OS_ROWS)[number];
		const server = unitAssignments(renderTemplate('dedalo-ts@.service', row, REPO_ROOT));
		expect(
			server.filter(
				(item) =>
					['Wants', 'Also', 'Requires', 'BindsTo'].includes(item.key) &&
					/watchdog/.test(item.value),
			),
		).toEqual([]);
		const timer = unitAssignments(renderTemplate('dedalo-ts-watchdog@.timer', row, REPO_ROOT));
		const onActive = timer.find((item) => item.section === 'Timer' && item.key === 'OnActiveSec');
		expect(Number(onActive?.value)).toBeGreaterThanOrEqual(60);
	});
});

// ── (c) root runs nothing the instance owns ──────────────────────────────────

describe('nothing a unit runs as root is a file the instance user can replace (c)', () => {
	test('every root-run ExecStart is outside the instance tree; every script it names is copied root-owned', () => {
		const ctx = productionPlanCtx(NGINX_LE, REPO_ROOT, { backup_site_builder: true });
		const rootRun: string[] = [];
		for (const name of UNIT_TEMPLATES.filter((unit) => unit.endsWith('.service'))) {
			const unit = effective(ctx, name);
			const user = unit.get('Service.User')?.[0];
			for (const line of unit.get('Service.ExecStart') ?? []) {
				if (user === undefined || line.startsWith('+'))
					rootRun.push(line.replace(/^[-+]/, '').replace(/%i/g, ctx.paths.instance));
			}
		}
		// The floor: the watchdog, the site-builder store run as root.
		expect(rootRun.length).toBeGreaterThanOrEqual(2);
		const binaries = rootRun.map((line) => line.split(/\s+/)[0] as string);
		expect(
			binaries.filter((path) => path.startsWith(ctx.paths.home) || path.startsWith('/home/')),
		).toEqual([]);
		const scripts = binaries.filter((path) => path.endsWith('.sh'));
		for (const path of scripts) {
			expect(path.startsWith(`${ctx.paths.binDir}/`), path).toBe(true);
			expect(ROOT_RUN_SCRIPTS as readonly string[]).toContain(
				path.slice(ctx.paths.binDir.length + 1),
			);
		}
		expect(scripts.length).toBeGreaterThanOrEqual(2);
	});

	test('no root-run line reads anything the instance writes: no EnvironmentFile under the instance, every backup root pinned', () => {
		for (const siteBuilder of [false, true]) {
			const ctx = productionPlanCtx(NGINX_LE, REPO_ROOT, { backup_site_builder: siteBuilder });
			for (const name of UNIT_TEMPLATES.filter((unit) => unit.endsWith('.service'))) {
				const unit = effective(ctx, name);
				const user = unit.get('Service.User')?.[0];
				const files = (unit.get('Service.EnvironmentFile') ?? []).map((file) =>
					file.replace(/^-/, '').replace(/%i/g, ctx.paths.instance),
				);
				const instanceFiles = files.filter(
					(file) => file.startsWith(`${ctx.paths.home}/`) || file.startsWith('/home/'),
				);
				for (const key of ['ExecStart', 'ExecStartPre', 'ExecStartPost', 'ExecCondition']) {
					for (const line of unit.get(`Service.${key}`) ?? []) {
						const root = user === undefined || /^[-@]*[+!]/.test(line);
						// systemd applies EnvironmentFile to EVERY Exec line, a `+` one included.
						expect({ name, line, instanceFiles: root ? instanceFiles : [] }).toEqual({
							name,
							line,
							instanceFiles: [],
						});
						// A root-run script that reads a backup root is GIVEN it: never resolved from .env.
						if (root && /dedalo-(ts-watchdog|code-rollback)\.sh/.test(line)) {
							expect(line, name).toContain(`--backup-root ${'/home/ded_%i/backups/code'}`);
						}
					}
				}
			}
		}
	});

	test('positive control: a `+` store line beside the instance .env is caught by that reading', () => {
		const merged = mergedUnit(
			'[Service]\nUser=ded_%i\nEnvironmentFile=/home/ded_%i/private/.env\nExecStart=+/opt/x.sh\n',
			[],
		);
		const line = merged.get('Service.ExecStart')?.[0] ?? '';
		expect(/^[-@]*[+!]/.test(line)).toBe(true);
		expect(merged.get('Service.EnvironmentFile')?.[0]?.startsWith('/home/')).toBe(true);
	});
});

// ── (d) the web site files ───────────────────────────────────────────────────

/** The direct directives of each nginx `location … {` block (nested blocks apart). */
function nginxLocations(text: string): { header: string; directives: string[] }[] {
	const out: { header: string; directives: string[] }[] = [];
	const stack: { header: string; directives: string[] }[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		const opens = /^location\s+(.+?)\s*\{(.*)$/.exec(line);
		if (opens) {
			const block = { header: opens[1] as string, directives: [] as string[] };
			const rest = (opens[2] as string).trim();
			if (rest.endsWith('}')) {
				block.directives.push(rest.slice(0, -1).trim());
				out.push(block);
				continue;
			}
			stack.push(block);
			out.push(block);
			continue;
		}
		if (line === '}') stack.pop();
		else if (line !== '') stack.at(-1)?.directives.push(line);
	}
	return out;
}

describe('the site files (d)', () => {
	const nginx = HOST_VARIANTS.filter((variant) => variant.web === 'nginx');

	test('two instances on one host share no nginx name: upstream, rate-limit zone, log files', () => {
		const names = (instance: string) => {
			const ctx = productionPlanCtx(NGINX_LE, REPO_ROOT, {
				instance,
				server_name: `${instance}.example.org`,
			});
			const text = siteText(ctx, certificatePaths(ctx));
			return new Set([
				...[...text.matchAll(/upstream\s+(\S+)/g)].map((m) => `upstream ${m[1]}`),
				...[...text.matchAll(/zone=([\w-]+)/g)].map((m) => `zone ${m[1]}`),
				...[...text.matchAll(/_log\s+(\S+)/g)].map((m) => `log ${m[1]}`),
			]);
		};
		const prado = names('prado');
		const goya = names('goya');
		expect(prado.size).toBeGreaterThanOrEqual(4);
		expect([...prado].filter((name) => goya.has(name))).toEqual([]);
	});

	for (const variant of nginx) {
		test(`${variantName(variant)}: every location with its own add_header carries the whole security set; server_tokens off`, () => {
			const ctx = productionPlanCtx(variant);
			const text = siteText(ctx, certificatePaths(ctx));
			const locations = nginxLocations(text);
			const withHeaders = locations.filter((block) =>
				block.directives.some((line) => line.startsWith('add_header ')),
			);
			expect(withHeaders.length).toBeGreaterThanOrEqual(2);
			for (const block of withHeaders) {
				for (const [name] of SECURITY_HEADERS) {
					expect(
						block.directives.some((line) => line.startsWith(`add_header ${name} `)),
						`${block.header}: ${name}`,
					).toBe(true);
				}
			}
			expect((text.match(/^\s*server_tokens off;$/gm) ?? []).length).toBe(2);
		});
	}

	test('positive control: a location that sets one header and drops the others is caught', () => {
		const blocks = nginxLocations('location /x/ {\n\tadd_header Cache-Control "no-cache";\n}\n');
		expect(
			blocks[0]?.directives.some((line) => line.startsWith('add_header X-Frame-Options')),
		).toBe(false);
	});

	const MEDIA_DIR = String(CONFIG_CATALOG.DEDALO_MEDIA_DIR?.default ?? '');

	test('THE ROOT RULE, for every MEDIA_PATH the plan accepts: the engine URL resolves to MEDIA_PATH (nginx root, Apache Alias)', () => {
		expect(MEDIA_DIR).toBe('media');
		const candidates = [
			'',
			'/data/demo/dedalo/media',
			'/srv/museo/web/dedalo/media',
			'/data/demo/dedalo/files',
			'/srv/dedalo/demo/media',
		];
		let accepted = 0;
		for (const media of candidates) {
			const extra = media === '' ? {} : { media_path: media };
			const plan = buildInstallPlan(
				{ ...productionRaw(NGINX_LE), ...extra },
				{ rootPassword: ROOT_PASSWORD, requireRootPassword: true },
			);
			if (plan.errors.length > 0) {
				expect(plan.errors.length, media).toBe(1);
				expect(plan.errors[0], media).toStartWith(`media_path '${media}'`);
				continue;
			}
			accepted += 1;
			const url = `/dedalo/${MEDIA_DIR}/image/thumb/x_test3_1.jpg`;
			const file = `${plan.answers.media_path}/image/thumb/x_test3_1.jpg`;
			for (const web of ['nginx', 'apache'] as const) {
				const ctx = productionPlanCtx({ ...NGINX_LE, web }, REPO_ROOT, extra);
				const text = siteText(ctx, certificatePaths(ctx));
				// nginx: the HTTPS server's root (the last `root` — the first is the ACME root).
				const root = [...text.matchAll(/^\s*root (\S+);$/gm)].at(-1)?.[1];
				const alias = /^\s*Alias \/dedalo\/(\S+) (\S+)$/m.exec(text);
				const resolved =
					web === 'nginx'
						? `${root}${url}`
						: alias?.[1] === MEDIA_DIR
							? url.replace(`/dedalo/${MEDIA_DIR}`, alias[2] as string)
							: `no Alias for /dedalo/${MEDIA_DIR}`;
				expect(resolved, `${web} ${media || '(default)'}`).toBe(file);
			}
		}
		expect(accepted).toBeGreaterThanOrEqual(3);
	});
});

// The repository's own templates are what the step writes (the source tree the root process reads).
test('the templates the step renders are the repository files (deploy/systemd/*@*)', () => {
	// Every template on disk is one the step renders: a new unit file that no step
	// installs (or a rendered one deleted from the tree) is red here.
	const onDisk = systemdTemplateNames();
	expect(onDisk.length).toBeGreaterThan(8);
	expect(onDisk).toEqual([...UNIT_TEMPLATES].sort());
	const row = OS_ROWS[2] as (typeof OS_ROWS)[number];
	for (const name of UNIT_TEMPLATES) {
		const source = readFileSync(join(REPO_ROOT, 'deploy/systemd', name), 'utf8');
		expect(renderTemplate(name, row, REPO_ROOT)).toBe(
			source.replace(/@@PG_SERVICE@@/g, row.pgService),
		);
	}
});

// ── (e) the media rules, copied validated (deploy/dedalo-media-rules.sh) ─────

describe("the engine's media rules reach root's nginx only as validated copies (e)", () => {
	const SCRIPT = join(REPO_ROOT, 'deploy/dedalo-media-rules.sh');
	const SERVER = 'dedalo_media_protection.nginx.conf';
	const MAP = 'dedalo_media_protection_map.nginx.conf';
	const base = mkdtempSync(join(tmpdir(), 'dedalo_media_rules_'));
	// The generated rules name the configured media root; the copy is validated against it.
	const generated = (mode: 'off' | 'private' | 'publication') =>
		buildNginxConf(mode, mode === 'publication' ? ['1.5MB', 'thumb', 'original'] : []);
	const root = /if \(!?-f (\S+)\/\.publication\//.exec(generated('private'))?.[1] ?? '';

	/** A scratch source dir (the media root's two files) and a destination; answers the run. */
	function copy(server: string, map: string, link = false) {
		const dir = mkdtempSync(join(base, 'case_'));
		const dest = join(dir, 'dest');
		const source = join(dir, 'source');
		mkdirSync(source);
		writeFileSync(join(dir, 'server.real'), server);
		if (link) symlinkSync(join(dir, 'server.real'), join(source, SERVER));
		else writeFileSync(join(source, SERVER), server);
		writeFileSync(join(source, MAP), map);
		const run = Bun.spawnSync(['sh', SCRIPT, '--source', source, '--dest', dest], {
			env: { PATH: '/usr/bin:/bin', TMPDIR: dir },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		return { code: run.exitCode, err: run.stderr.toString(), dest, source };
	}
	const forSource = (text: string, source: string) => text.split(root).join(source);

	test('the generated root is known (the marker probes name it)', () => {
		expect(root.startsWith('/')).toBe(true);
	});

	for (const mode of ['off', 'private', 'publication'] as const) {
		test(`every rule file the engine generates is accepted, copied byte-equal — mode ${mode}`, () => {
			const dir = mkdtempSync(join(base, 'ok_'));
			const source = join(dir, 'source');
			mkdirSync(source);
			const server = forSource(generated(mode), source);
			writeFileSync(join(source, SERVER), server);
			writeFileSync(join(source, MAP), buildNginxMap());
			const dest = join(dir, 'dest');
			const run = Bun.spawnSync(['sh', SCRIPT, '--source', source, '--dest', dest], {
				env: { PATH: '/usr/bin:/bin', TMPDIR: dir },
				stdout: 'pipe',
				stderr: 'pipe',
			});
			expect(run.exitCode, run.stderr.toString()).toBe(0);
			expect(readFileSync(join(dest, 'media_protection.conf'), 'utf8')).toBe(server);
			expect(readFileSync(join(dest, 'media_protection_map.conf'), 'utf8')).toBe(buildNginxMap());
		});
	}

	const SERVER_ATTACKS: [string, string][] = [
		['an include', 'include /etc/nginx/secrets.conf;'],
		['a log written as root', 'access_log /etc/ld.so.preload;'],
		['a log format', "log_format x '$request';"],
		['a second statement after a whitelisted one', 'add_header X "a" always; include /x;'],
		['a server block', 'server { listen 80; server_name other.example.org; }'],
		['an alias', 'location /x { alias /etc/; }'],
		[
			'a marker probe outside this instance',
			'if (-f /srv/dedalo/other/.publication/auth/$x) { set $dd_pass 1; }',
		],
		['an unterminated quote', 'add_header X "open'],
	];
	for (const [name, line] of SERVER_ATTACKS) {
		test(`server scope refused, nothing installed: ${name}`, () => {
			const dir = mkdtempSync(join(base, 'bad_'));
			const source = join(dir, 'source');
			mkdirSync(source);
			writeFileSync(join(source, SERVER), `${forSource(generated('private'), source)}${line}\n`);
			writeFileSync(join(source, MAP), buildNginxMap());
			const dest = join(dir, 'dest');
			const run = Bun.spawnSync(['sh', SCRIPT, '--source', source, '--dest', dest], {
				env: { PATH: '/usr/bin:/bin', TMPDIR: dir },
				stdout: 'pipe',
				stderr: 'pipe',
			});
			expect(run.exitCode).toBe(1);
			expect(run.stderr.toString()).toContain('REFUSED');
			expect(existsSync(join(dest, 'media_protection.conf'))).toBe(false);
		});
	}

	const MAP_ATTACKS: [string, string][] = [
		['a capture handed to the auth key (a path)', '"~^(?<h>.*)$"  $h;'],
		['a value that is a path', 'default "../../srv/dedalo/other/x";'],
		['another map variable', 'map $uri $dedalo_other {'],
	];
	for (const [name, line] of MAP_ATTACKS) {
		test(`map refused, nothing installed: ${name}`, () => {
			const result = copy('', `${buildNginxMap()}${line}\n`);
			expect(result.code).toBe(1);
			expect(existsSync(join(result.dest, 'media_protection_map.conf'))).toBe(false);
		});
	}

	test('a generated file that is a symbolic link: refused', () => {
		const result = copy('# x\n', buildNginxMap(), true);
		expect(result.code).toBe(1);
		expect(result.err).toContain('is a symbolic link');
	});

	afterAll(() => rmSync(base, { recursive: true, force: true }));
});
