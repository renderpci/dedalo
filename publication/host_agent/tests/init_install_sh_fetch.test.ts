/**
 * THE TRAMPOLINE'S DOWNLOADS HAVE DEADLINES (closure review cross-diffusion r4/r5, S3: "install.sh
 * Bun download has no deadline"). deploy/install.sh fetched the Bun archive and SHASUMS256.txt with
 * a SIZE cap only: a mirror (or GitHub) that accepted the connection and then stalled — in the TLS
 * handshake or mid-body — hung a root install forever, holding its install lock, with no line for
 * the operator to act on.
 *
 * WHAT IS ASSERTED — outcomes, against a real local HTTPS server (self-signed, trusted through
 * CURL_CA_BUNDLE so curl runs with the shipped TLS flags unchanged) and a TCP listener that never
 * speaks TLS:
 *   1. ONE DOOR: every curl invocation of the file is fetch_https's, and main downloads only
 *      through it, each call passing a named total deadline;
 *   2. MAIN'S OWN fetch statements (read out of main, run with the library sourced and the
 *      deadline constants shortened): a body that stalls dies (exit 3) at the total deadline, a
 *      server that never completes the TLS handshake dies at the connect deadline — never a hang;
 *   3. the door's verdicts: a whole download returns 0 with the bytes written; curl's timeout
 *      (28) dies naming the deadline and the ways on (--mirror, --offline); any other failure
 *      dies naming curl's exit;
 *   4. the production deadlines are positive and ordered (connect < sums <= archive).
 * Needs `curl` and `openssl` on the host (the CI image has both): missing, the gate is RED.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const INSTALL_SH = join(import.meta.dir, '..', 'deploy', 'install.sh');
const TEXT = readFileSync(INSTALL_SH, 'utf8');
/** A fetch still running after this has no deadline the gate can shorten (every leg's bound is <= 2 s). */
const HANG_MS = 10_000;
const BODY = 'bun-bytes\n';

/** main's body, from `main() {` to its closing brace. */
const MAIN = (() => {
	const start = TEXT.indexOf('\nmain() {');
	expect(start, 'install.sh has no main()').toBeGreaterThan(-1);
	return TEXT.slice(start, TEXT.indexOf('\n}\n', start));
})();
/** main's download statements (one line each). */
const MAIN_FETCHES = MAIN.split('\n')
	.map((line) => line.trim())
	.filter((line) => /^fetch_https\s/.test(line));

function shInt(name: string): number {
	const found = new RegExp(`^${name}=(\\d+)$`, 'm').exec(TEXT);
	if (found === null) throw new Error(`install.sh has no integer constant ${name}`);
	return Number(found[1]);
}

let scratch: string;
let caBundle: string;
let tls: ReturnType<typeof Bun.serve>;
let silent: { port: number; stop: (closeActive?: boolean) => void };

beforeAll(() => {
	for (const tool of ['curl', 'openssl']) {
		expect(
			spawnSync('sh', ['-c', `command -v ${tool}`]).status,
			`${tool} is required by this gate`,
		).toBe(0);
	}
	scratch = mkdtempSync(join(realpathSync(tmpdir()), 'dd_install_sh_fetch_'));
	caBundle = join(scratch, 'cert.pem');
	const key = join(scratch, 'key.pem');
	const made = spawnSync(
		'openssl',
		[
			'req',
			'-x509',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-keyout',
			key,
			'-out',
			caBundle,
			'-days',
			'1',
			'-subj',
			'/CN=127.0.0.1',
			'-addext',
			'subjectAltName=IP:127.0.0.1',
		],
		{ encoding: 'utf8' },
	);
	expect(made.status, made.stderr).toBe(0);
	tls = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		tls: { cert: Bun.file(caBundle), key: Bun.file(key) },
		fetch(request) {
			const path = new URL(request.url).pathname;
			if (path.startsWith('/missing/')) return new Response('no', { status: 404 });
			if (path.startsWith('/stall/')) {
				// The handshake and the headers complete, a few bytes arrive, then nothing.
				return new Response(
					new ReadableStream({
						async start(controller) {
							controller.enqueue(new TextEncoder().encode('partial'));
							await Bun.sleep(60_000);
							controller.close();
						},
					}),
					{ headers: { 'content-length': '1000000' } },
				);
			}
			return new Response(BODY);
		},
	});
	// Accepts the TCP connection, never answers the ClientHello.
	silent = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
});

afterAll(() => {
	tls?.stop(true);
	silent?.stop(true);
	if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
});

/** Runs `body` with install.sh sourced in library mode and the deadlines shortened. */
async function run(
	body: string,
	deadlines: { connect: number; zip: number; sums: number },
): Promise<{ code: number | null; err: string; ms: number; hung: boolean }> {
	const script = [
		'script=$0; set -- --lib; . "$script"',
		`FETCH_CONNECT_S=${deadlines.connect} BUN_ZIP_MAX_S=${deadlines.zip} BUN_SUMS_MAX_S=${deadlines.sums}`,
		body,
	].join('\n');
	const startedAt = Date.now();
	const child = Bun.spawn(['sh', '-c', script, INSTALL_SH], {
		env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C', CURL_CA_BUNDLE: caBundle },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const hung = await Promise.race([
		child.exited.then(() => false),
		Bun.sleep(HANG_MS).then(() => true),
	]);
	if (hung) child.kill('SIGKILL');
	await child.exited;
	// A hung run's curl (sh's child) may still hold stderr open: never wait on it.
	const err = hung ? '' : await new Response(child.stderr).text();
	return { code: child.exitCode, err, ms: Date.now() - startedAt, hung };
}

/** main's variables around one of its fetch statements. */
function mainStatement(statement: string, base: string): string {
	return [
		`BASE='${base}' PIN=9.9.9 ASSET=bun-linux-x64`,
		`ZIP='${join(scratch, 'bun.zip')}' SUMS='${join(scratch, 'SHASUMS256.txt')}'`,
		statement,
	].join('\n');
}

describe('install.sh: every download has a connect and a total deadline', () => {
	test('1. one door: every curl invocation is fetch_https, and main downloads only through it', () => {
		const code = TEXT.split('\n').filter((line) => !/^\s*#/.test(line));
		const curls = code.filter((line) => /\bcurl\s+-/.test(line));
		expect(curls).toHaveLength(1);
		const doorStart = TEXT.indexOf('\nfetch_https() {');
		expect(doorStart, 'install.sh has no fetch_https()').toBeGreaterThan(-1);
		const door = TEXT.slice(doorStart, TEXT.indexOf('\n}\n', doorStart));
		expect(door).toContain(curls[0]?.trim() ?? '\0');
		expect(MAIN).not.toMatch(/\bcurl\s+-/);
		// The archive and the sums, each with its own named total deadline.
		expect(MAIN_FETCHES).toHaveLength(2);
		expect(MAIN_FETCHES[0]).toMatch(/\$ASSET\.zip" "\$ZIP" \d+ "\$BUN_ZIP_MAX_S"$/);
		expect(MAIN_FETCHES[1]).toMatch(/SHASUMS256\.txt" "\$SUMS" \d+ "\$BUN_SUMS_MAX_S"$/);
	});

	test("2a. a body that stalls: each of main's fetches dies at its total deadline", async () => {
		expect(MAIN_FETCHES).toHaveLength(2); // anti-vacuity: the loop below runs main's two fetches
		for (const statement of MAIN_FETCHES) {
			const result = await run(mainStatement(statement, `https://127.0.0.1:${tls.port}/stall`), {
				connect: 5,
				zip: 2,
				sums: 2,
			});
			expect(
				result.hung,
				`still downloading after ${HANG_MS} ms from a stalled body — no total deadline:\n${statement}`,
			).toBe(false);
			expect(result.code, result.err).toBe(3);
			expect(result.err).toContain('timed out');
		}
	}, 60_000);

	test("2b. a server that never completes the TLS handshake: each of main's fetches dies at the connect deadline", async () => {
		expect(MAIN_FETCHES).toHaveLength(2); // anti-vacuity: the loop below runs main's two fetches
		for (const statement of MAIN_FETCHES) {
			// The total deadline is far away: only the connect deadline can end it inside HANG_MS.
			const result = await run(mainStatement(statement, `https://127.0.0.1:${silent.port}`), {
				connect: 1,
				zip: 60,
				sums: 60,
			});
			expect(
				result.hung,
				`still connecting after ${HANG_MS} ms to a silent server — no connect deadline:\n${statement}`,
			).toBe(false);
			expect(result.code, result.err).toBe(3);
			expect(result.err).toContain('timed out');
		}
	}, 60_000);

	test('3a. a whole download returns 0 and writes the bytes', async () => {
		const out = join(scratch, 'ok.bin');
		const result = await run(
			`fetch_https 'https://127.0.0.1:${tls.port}/ok/x.zip' '${out}' 1000000 5`,
			{ connect: 5, zip: 5, sums: 5 },
		);
		expect(result.code, result.err).toBe(0);
		expect(existsSync(out) && readFileSync(out, 'utf8')).toBe(BODY);
	});

	test('3b. a timeout dies naming the deadline and the ways on; another failure names curl exit', async () => {
		const timedOut = await run(
			`fetch_https 'https://127.0.0.1:${tls.port}/stall/x.zip' '${join(scratch, 'a')}' 1000000 1`,
			{ connect: 5, zip: 5, sums: 5 },
		);
		expect(timedOut.code).toBe(3);
		expect(timedOut.err).toContain(
			`download of https://127.0.0.1:${tls.port}/stall/x.zip timed out`,
		);
		expect(timedOut.err).toContain('--mirror');
		expect(timedOut.err).toContain('--offline');
		const missing = await run(
			`fetch_https 'https://127.0.0.1:${tls.port}/missing/x.zip' '${join(scratch, 'b')}' 1000000 5`,
			{ connect: 5, zip: 5, sums: 5 },
		);
		expect(missing.code).toBe(3);
		expect(missing.err).toContain('failed (curl exit 22)');
	}, 30_000);

	test('4. the production deadlines are positive and ordered', () => {
		const connect = shInt('FETCH_CONNECT_S');
		const sums = shInt('BUN_SUMS_MAX_S');
		const zip = shInt('BUN_ZIP_MAX_S');
		expect(connect).toBeGreaterThan(0);
		expect(connect).toBeLessThan(sums);
		expect(sums).toBeLessThanOrEqual(zip);
	});
});
