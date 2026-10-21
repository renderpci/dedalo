/**
 * TRIPWIRE — the installer and the container do not create world-writable
 * private state, and do not race /tmp (P2-15 / OPS-05, OPS-06, OPS-14).
 *
 * THE UMASK. The Dockerfile ENTRYPOINT set `umask 0000` for the whole engine
 * process for its whole life. The stated reason was narrow and correct —
 * connecting to a unix socket needs WRITE permission on it and the proxy
 * container runs as a different user, so a default umask makes every request a
 * 502 — but the SCOPE was everything. Every file created without an explicit
 * mode landed 0666: the session store and its -wal/-shm, process and job
 * records, media derivatives, and `ts_state.json`.
 *
 * ts_state.json is not inert. It carries `media_access_mode`, which WINS over
 * .env, and `install_status` — writing any value but `sealed` into it makes the
 * next boot REFUSE to start (src/config/install_state.ts): a world-writable state
 * file is a one-write denial of service. Named volumes bound
 * this in the shipped stacks; an operator bind-mounting /private, which the
 * Dockerfile's own comments contemplate, is where it bites.
 *
 * Measured 2026-08-31: under `umask 0027` Bun creates the socket 0750, and the
 * explicit chmod brings it to 0666 — so the narrow umask plus one targeted
 * grant gives the proxy exactly what it needs and nothing else.
 *
 * THE /tmp RACE. install.sh downloaded Docker's installer to the fixed path
 * `/tmp/dedalo_get-docker.sh` and executed it AS ROOT — CWE-377 on sticky /tmp,
 * where an unprivileged local user pre-creates the name and owns the window
 * between `curl -o` and the root exec. Since the terminal installer (phase 4)
 * the bootstrap installs no Docker at all (told, owner Q5) and downloads only
 * into its own 0700 cache — executed here in library mode.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('private state is not world-writable, and /tmp is not raced', () => {
	test('the container umask is not a blanket 0000', () => {
		const dockerfile = read('Dockerfile');
		// FROM THE ENTRYPOINT LINE, not from anywhere in the file. The comment
		// above it explains the change and therefore CONTAINS both the old and the
		// new number — an unanchored match read the prose and passed while the
		// ENTRYPOINT itself said 0000. Measured.
		const entrypoint = /^ENTRYPOINT\s+\[.*$/m.exec(dockerfile)?.[0] ?? '';
		expect(entrypoint, 'no ENTRYPOINT line found').toContain('umask');
		const umask = /umask\s+(\d{3,4})/.exec(entrypoint)?.[1];
		expect(umask, 'the ENTRYPOINT sets no umask at all any more').toBeDefined();
		expect(
			umask,
			'`umask 0000` makes EVERY file the engine writes world-writable for the life of the ' +
				'process — including ts_state.json, whose media_access_mode wins over .env and whose ' +
				'install_status decides whether the server starts. Grant the socket its mode explicitly instead.',
		).not.toBe('0000');
		// It must actually deny world-write: the last digit is the `other` mask.
		expect(Number((umask as string).slice(-1)) & 0o2).toBe(0o2);
	});

	test('the socket gets its permission explicitly, where the file is known', () => {
		const server = read('src/server.ts');
		expect(
			server,
			'nothing grants the unix socket write permission — with a narrow umask every proxy ' +
				'request becomes a 502',
		).toMatch(/chmodSync\(socketPath, 0o666\)/);
		// And it must not be fatal: a platform refusing chmod on a socket still serves.
		const grant = server.slice(server.indexOf('chmodSync(socketPath'));
		expect(grant.slice(0, 400)).toMatch(/catch/);
	});

	test('the installer does not download to a predictable /tmp path (nor install Docker at all)', () => {
		// Phase 4 (2026-10-12): install.sh is a bootstrap. It downloads only Bun and the
		// release, into its OWN cache — created 0700 (root: under the 0755 state root,
		// its subdirectories 0700) — and never Docker's installer: Docker missing is
		// TOLD (owner Q5), so no third-party script ever runs as root. EXECUTED: the
		// bootstrap's own functions, in library mode, against a scratch HOME.
		const installer = read('install.sh');
		const code = installer.split('\n').filter((line) => !/^\s*#/.test(line));
		expect(code.length).toBeGreaterThan(100);
		expect(code.filter((line) => line.includes('/tmp'))).toEqual([]);
		expect(code.filter((line) => /get\.docker\.com|get-docker/.test(line))).toEqual([]);
		const home = mkdtempSync(join(tmpdir(), 'dedalo_bootstrap_cache_'));
		try {
			const run = Bun.spawnSync(
				[
					'sh',
					'-c',
					'set -- --lib; . "$0"; dir=$(cache_root 1000); prepare_cache "$dir" 1000; private_dir "$dir/bun/1.0.0"; echo "$dir"; fetch http://example.org/x "$dir/x" 10',
					join(REPO_ROOT, 'install.sh'),
				],
				{ env: { HOME: home, PATH: '/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' },
			);
			const cache = run.stdout.toString().trim();
			expect(cache).toBe(join(home, '.cache', 'dedalo-install'));
			expect(statSync(cache).mode & 0o777).toBe(0o700);
			expect(statSync(join(cache, 'bun', '1.0.0')).mode & 0o777).toBe(0o700);
			// A non-https download is refused (exit 3), the file never created.
			expect(run.exitCode).toBe(3);
			expect(run.stderr.toString()).toContain('refusing a non-https download');
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test('the .env write sets its mode on the TARGET', () => {
		// OPS-14 residual: the durable write creates its temp 0600 and carries it through the rename,
		// but an install predating that change keeps whatever mode its .env was
		// created with until something re-chmods it. This file holds the database
		// password and the session secret.
		const persist = read('src/core/install/config_persist.ts');
		const commit = persist.slice(persist.indexOf('writeFileDurably(target, body'));
		expect(commit.slice(0, 600)).toMatch(/chmodSync\(target, 0o600\)/);
	});

	test('anti-vacuity: each file was actually read and matched', () => {
		// Every assertion above is a substring test on a file read by path. A moved
		// or emptied file would make several of them pass by absence.
		expect(read('Dockerfile')).toContain('ENTRYPOINT');
		expect(read('install.sh')).toContain('prepare_cache "$CACHE"');
		expect(read('src/server.ts')).toContain('unix: socketPath');
		expect(read('src/core/install/config_persist.ts')).toContain('writeFileDurably(target, body');
	});
});
