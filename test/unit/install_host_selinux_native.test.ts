/**
 * SELINUX ON THE RHEL FAMILY: THE CONTEXTS, THE ONE POLICY RULE, AND WHOSE
 * MODULE IT IS (terminal installer phase 4, 2026-10-12; src/core/install/host/
 * production/selinux.ts, deploy/selinux/dedalo_engine.cil.tpl).
 *
 * Run through the real executor on a scratch EL 10 host (recording runner,
 * SELinux enforcing — test/helpers/install_host_scratch.ts):
 *
 *  (a) THE FILE CONTEXTS: the socket directory by its `/var/run` spelling
 *      (the form `semanage fcontext` keeps — campaign 2 L48) as
 *      httpd_var_run_t, the instance's /srv tree (media AND the published
 *      client — critique B13: nothing the web server reads lives under /home)
 *      and the ACME webroot (Let's Encrypt only) as httpd_sys_content_t; each
 *      relabelled with restorecon; nothing under /home is labelled.
 *  (b) THE MODULE: exactly the template's ONE rule (httpd_t → the engine's
 *      socket, connectto — L12), stamped, written 0600 root, loaded with
 *      `semodule -X 400 -i`; no home-directory rule, no boolean (`setsebool`
 *      is never run).
 *  (c) A FOREIGN MODULE of the same name (loaded, but not the bytes this
 *      installer writes) is REFUSED, never replaced.
 *  (d) REFCOUNTED UNDO: --abort removes this instance's contexts; the module
 *      only when this install loaded it AND no other instance on the host
 *      still uses it (the host registry).
 *  (e) Off the RHEL family (and with SELinux disabled) the step runs nothing.
 *
 * DB-FREE, network-free (the hermetic tier runs it).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hostFs } from '../../src/core/install/host/fs.ts';
import type { RecordedResponse } from '../../src/core/install/host/runner.ts';
import {
	BUN_PIN,
	freshRequest,
	HOST_VARIANTS,
	type HostVariant,
	hostFiles,
	hostResponses,
	INSTANCE,
	laterRequest,
	loggedCommands,
	mintCertificate,
	productionPlan,
	REPO_ROOT,
	runHost,
	SCRATCH_DIR,
	type ScratchHost,
	SERVER_NAME,
	sourceFiles,
	variantName,
} from '../helpers/install_host_scratch.ts';

const scratchBase = mkdtempSync(join(tmpdir(), 'dedalo_install_host_selinux_'));
afterAll(() => rmSync(scratchBase, { recursive: true, force: true }));

const CERT = mintCertificate(SERVER_NAME);
const MODULE = '/var/lib/dedalo-install/selinux/dedalo_engine.cil';
const TEMPLATE = readFileSync(join(REPO_ROOT, 'deploy/selinux/dedalo_engine.cil.tpl'), 'utf8');
const OURS = TEMPLATE.replace('@@STAMP@@', 'dedalo-install');

const EL = (tls: 'letsencrypt' | 'files', web: 'nginx' | 'apache' = 'nginx') =>
	HOST_VARIANTS.find(
		(variant) => variant.os === 'el10' && variant.web === web && variant.tls === tls,
	) as HostVariant;

/** Write `files` under `base` (a path ending in `/` is a directory). */
function plant(base: string, files: ReadonlyMap<string, string>): void {
	for (const [path, content] of files) {
		const real = join(base, path);
		if (path.endsWith('/')) {
			mkdirSync(real, { recursive: true });
			continue;
		}
		mkdirSync(dirname(real), { recursive: true });
		writeFileSync(real, content);
	}
}

let counter = 0;

function scratchHost(
	variant: HostVariant,
	options: { files?: ReadonlyMap<string, string>; responses?: readonly RecordedResponse[] } = {},
): ScratchHost {
	counter += 1;
	const base = join(scratchBase, `h${counter}`);
	const root = join(base, 'root');
	const source = join(base, 'source');
	plant(root, hostFiles(variant, CERT));
	plant(source, sourceFiles());
	plant(root, options.files ?? new Map());
	mkdirSync(join(root, SCRATCH_DIR), { recursive: true });
	writeFileSync(
		join(root, SCRATCH_DIR, 'responses.json'),
		JSON.stringify([...(options.responses ?? []), ...hostResponses(variant)]),
	);
	return { root, source };
}

/** The SELinux commands a run logged (semanage, restorecon, semodule, setsebool). */
function selinuxLog(host: ScratchHost, from = 0): string[] {
	return loggedCommands(host.root)
		.slice(from)
		.filter((line) => /\/(semanage|restorecon|semodule|setsebool) /.test(line))
		.filter((line) => !/ -l( -C)?$/.test(line));
}

/** Another instance on the host that uses the module (the registry entry). */
function otherInstance(selinuxModule: boolean): Map<string, string> {
	return new Map([
		[
			'/var/lib/dedalo-install/instances/other.json',
			`${JSON.stringify({ instance: 'other', bun_pin: BUN_PIN, templates: false, selinux_module: selinuxModule, nginx_map_owner: false, media: '/srv/dedalo/other/dedalo/media' }, null, '\t')}\n`,
		],
	]);
}

describe('SELinux contexts and the one policy rule (a, b)', () => {
	for (const variant of [EL('letsencrypt'), EL('files', 'apache')]) {
		test(`${variantName(variant)}: the contexts, the relabel, the stamped module — nothing under /home, no boolean`, async () => {
			const host = scratchHost(variant);
			const { planFile } = productionPlan(variant);
			expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
			const acme = variant.tls === 'letsencrypt';
			expect(selinuxLog(host)).toEqual([
				`/usr/sbin/semanage fcontext -a -t httpd_var_run_t /var/run/dedalo-${INSTANCE}(/.*)?`,
				`/usr/sbin/semanage fcontext -a -t httpd_sys_content_t /srv/dedalo/${INSTANCE}(/.*)?`,
				...(acme
					? [
							`/usr/sbin/semanage fcontext -a -t httpd_sys_content_t /var/lib/dedalo-install/acme/${INSTANCE}(/.*)?`,
						]
					: []),
				`/usr/sbin/restorecon -RF /srv/dedalo/${INSTANCE}`,
				...(acme ? [`/usr/sbin/restorecon -RF /var/lib/dedalo-install/acme/${INSTANCE}`] : []),
				`/usr/sbin/semodule -X 400 -i ${MODULE}`,
			]);
			const fs = hostFs(host.root, join(host.root, SCRATCH_DIR, 'owners.json'));
			expect(fs.readText(MODULE)).toBe(OURS);
			expect(fs.stat(MODULE)?.mode).toBe(0o600);
			expect(fs.stat(MODULE)?.owner).toBe('root');
			// The ONE rule, and nothing that widens httpd into the homes.
			const rules = OURS.split('\n').filter((line) => line.startsWith('('));
			expect(rules).toEqual([
				'(allow httpd_t unconfined_service_t (unix_stream_socket (connectto)))',
			]);
			expect(OURS).toContain('; stamp: dedalo-install');
			expect(OURS).not.toContain('@@');
			expect(
				loggedCommands(host.root).filter(
					(line) => /setsebool|\/home\//.test(line) && /semanage|restorecon|setsebool/.test(line),
				),
			).toEqual([]);
		});
	}
});

describe('a foreign module of the same name is refused (c)', () => {
	test('dedalo_engine loaded, but not the bytes this installer writes: refused, never replaced', async () => {
		const variant = EL('letsencrypt');
		const foreign = '(allow httpd_t user_home_t (dir (read)))\n';
		const host = scratchHost(variant, {
			files: new Map([[MODULE, foreign]]),
			responses: [{ match: '/usr/sbin/semodule -l', stdout: 'dedalo_engine\n' }],
		});
		const { planFile } = productionPlan(variant);
		const { outcome } = await runHost(host, freshRequest(planFile));
		expect(outcome.failedStep).toBe('host_selinux');
		expect(outcome.message).toContain(
			'an SELinux module named dedalo_engine is loaded that this installer did not write',
		);
		expect(selinuxLog(host).filter((line) => line.includes('semodule -X 400 -i'))).toEqual([]);
		expect(readFileSync(join(host.root, MODULE), 'utf8')).toBe(foreign);
	});
});

describe('refcounted undo (d)', () => {
	test('this install loaded the module and is alone: --abort removes its contexts AND the module', async () => {
		const variant = EL('letsencrypt');
		const host = scratchHost(variant);
		const { plan, planFile } = productionPlan(variant);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		const before = loggedCommands(host.root).length;
		expect((await runHost(host, laterRequest('abort', plan))).outcome.result).toBe('aborted');
		const undone = selinuxLog(host, before);
		expect(undone.filter((line) => line.includes('fcontext -d')).length).toBe(3);
		expect(undone).toContain('/usr/sbin/semodule -X 400 -r dedalo_engine');
		expect(() => readFileSync(join(host.root, MODULE))).toThrow();
	});

	test("another instance came to use the module since: --abort removes only this instance's contexts", async () => {
		const variant = EL('letsencrypt');
		const host = scratchHost(variant);
		const { plan, planFile } = productionPlan(variant);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		plant(host.root, otherInstance(true));
		const before = loggedCommands(host.root).length;
		expect((await runHost(host, laterRequest('abort', plan))).outcome.result).toBe('aborted');
		const undone = selinuxLog(host, before);
		expect(undone.filter((line) => line.includes('fcontext -d')).length).toBe(3);
		expect(undone.filter((line) => line.includes('semodule -X 400 -r'))).toEqual([]);
		expect(readFileSync(join(host.root, MODULE), 'utf8')).toBe(OURS);
	});

	test('the module was there before this install (another instance loaded it): never removed by this one', async () => {
		const variant = EL('files');
		const host = scratchHost(variant, {
			files: new Map([...otherInstance(true), [MODULE, OURS]]),
			responses: [{ match: '/usr/sbin/semodule -l', stdout: 'dedalo_engine\n' }],
		});
		const { plan, planFile } = productionPlan(variant);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		const before = loggedCommands(host.root).length;
		plant(host.root, otherInstance(false));
		expect((await runHost(host, laterRequest('abort', plan))).outcome.result).toBe('aborted');
		expect(selinuxLog(host, before).filter((line) => line.includes('semodule -X 400 -r'))).toEqual(
			[],
		);
		expect(readFileSync(join(host.root, MODULE), 'utf8')).toBe(OURS);
	});
});

describe('off the RHEL family, or with SELinux disabled, nothing runs (e)', () => {
	test('Debian: no SELinux command at all', async () => {
		const variant = HOST_VARIANTS.find((item) => item.os === 'debian13') as HostVariant;
		const host = scratchHost(variant);
		const { planFile } = productionPlan(variant);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		expect(selinuxLog(host)).toEqual([]);
	});

	test('EL with SELinux disabled: no SELinux command at all', async () => {
		const variant = EL('files');
		const host = scratchHost(variant, {
			responses: [{ match: '/usr/sbin/getenforce', stdout: 'Disabled\n' }],
		});
		const { planFile } = productionPlan(variant);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		expect(selinuxLog(host)).toEqual([]);
	});
});
