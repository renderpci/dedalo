/**
 * ONE OUTBOUND GUARD, AND NO NEW DOOR BESIDE IT (P1-26 / CARRY-10 / CARRY-14).
 *
 * `src/core/security/ssrf_guard.ts` is the hardened primitive: it RESOLVES the
 * hostname and vets every address, refuses redirects (a 3xx re-chooses the
 * target), and bounds both the wait and the read.
 *
 * Two doors carried private four-string blocklists — `localhost`, `127.0.0.1`,
 * `::1`, `169.254.169.254`, plus a private-range regex — and the transcriber's
 * file SAID it was a copy of the translator's ("duplicated here rather than
 * widening another module's surface"). Both missed `127.0.0.2`, `0.0.0.0`,
 * decimal-integer IPv4, `anything.localhost`, every DNS NAME that resolves
 * inward, and the redirect hop; their `::1` arm was DEAD CODE, because
 * `new URL('http://[::1]/').hostname` is `[::1]` WITH the brackets.
 *
 * A SOCKET, NOT A SPELLING — the lesson `external_outbound_tripwire` already
 * learned, relearned here the hard way. THE FIRST DRAFT OF THIS FILE pinned the
 * three literal spellings the deleted guards used, and an adversarial review
 * put the whole blocklist back with the variable renamed `host` → `h` and the
 * regex alternation reordered: 11 pass, 0 fail. That gate forbade one
 * historical spelling of the defect, not the defect. What a new outbound door
 * CANNOT avoid is opening a socket, so that is what is counted.
 *
 * SHRINK-ONLY, NOT A CLEAN BILL. The exempt list below is the burn-down CARRY-14
 * names, frozen: these sites predate the guard and most still lack its timeout,
 * byte ceiling and redirect refusal. Freezing them says "no NEW door", not "these
 * are fine". An entry may only be REMOVED.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { isLoopbackHost, isPrivateIp, isPublicUrl } from '../../src/core/security/ssrf_guard.ts';
// String-literal aware. The regex version this replaced ate 71 lines of
// dd_mcp_api.ts, because the literal 'image/*' opens a block comment that runs
// to the next `*/` — and a marker planted in that window scanned as absent.
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const GUARD = 'src/core/security/ssrf_guard.ts';

/**
 * An outbound CALL — `await fetch(`, `= fetch(`, `return fetch(`, `(fetch(`.
 * Deliberately not a bare `fetch(`: `Bun.serve({ fetch(request) {…} })` is a
 * handler DEFINITION — the INBOUND direction — and flagging it makes the gate
 * cry wolf in `src/server.ts`, which is how a gate gets deleted. Hence `[ \t]`
 * and not `\s`: an earlier draft spanned the newline after the preceding
 * property's comma and matched that handler anyway. `=>` is listed before `=`
 * so the arrow in `((t, i) => fetch(t, i))` — src/external's real door — is not
 * read as an assignment and missed.
 */
const OUTBOUND_CALL = /(?:await|return|=>|=|\(|\?\?)[ \t]*fetch[ \t]*\(/;

/**
 * The frozen burn-down (CARRY-14). Each reason says what the site talks to and
 * why it has not moved yet — never "it is safe".
 */
const EXEMPT: Record<string, string> = {
	'src/external/transport.ts':
		'THE external subsystem’s single door, and it already carries the fuller contract ' +
		'(kill switches, host allowlist, SSRF guard, socket pin, byte ceiling, breaker, ' +
		'concurrency bound). Policed by its own external_outbound_tripwire.',
	'tools/tool_sitebuilder/server/daemon_client.ts':
		'Speaks to the site_builder daemon over a UNIX SOCKET on this machine — there is no ' +
		'hostname to resolve and no network hop to guard. Operator-configured, never caller-supplied.',
	'src/core/area_maintenance/widgets/site_builder_status.ts':
		'Same site_builder daemon on this machine, same unix-socket transport, dialled from ' +
		'the maintenance widget. No hostname to resolve, no network hop to guard.',
	'src/core/update/smoke_boot.ts':
		'Dials the QUARANTINE server this process just spawned, over its own unix socket, at ' +
		'the literal http://localhost/health. Loopback is the entire purpose.',
	'src/core/ai/model_fetch.ts':
		'Model-weight downloads from the operator-configured hub. NOT YET on the guarded ' +
		'transport: needs the streamed byte ceiling and typed timeout (CARRY-14).',
	'src/core/geoip/download.ts':
		'GeoIP database download from a pinned vendor URL; already sets redirect:"error", but ' +
		'has no resolve-and-vet step. NOT YET on the guarded transport (CARRY-14).',
	'src/core/update/code_download.ts':
		'Release-archive download from the configured code server; already sets ' +
		'redirect:"error". NOT YET on the guarded transport (CARRY-14).',
	'src/core/ontology/data_io_import.ts':
		'Ontology/code import from a configured master. NOT YET on the guarded transport ' +
		'(CARRY-14) — the largest remaining one, since the URL is operator-entered.',
};

function sourceFiles(): { file: string; code: string }[] {
	const files: { file: string; code: string }[] = [];
	for (const dir of ['src', 'tools'] as const) {
		for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
			files.push({ file, code: stripComments(readFileSync(join(REPO_ROOT, file), 'utf8')) });
		}
	}
	return files.sort((a, b) => a.file.localeCompare(b.file));
}

describe('outbound SSRF: one guard', () => {
	const scanned = sourceFiles();
	const raw = scanned
		.filter((entry) => entry.file !== GUARD)
		.filter((entry) => OUTBOUND_CALL.test(entry.code))
		.map((entry) => entry.file);

	test('the scan actually sees the tree (anti-vacuity)', () => {
		// A glob that silently matched nothing would make every census below pass.
		expect(scanned.length).toBeGreaterThan(400);
		expect(scanned.some((entry) => entry.file === GUARD)).toBe(true);
		// And the stripper must not blind it: the file whose 'image/*' literal ate
		// 71 lines under the old regex stripper must still scan at full length.
		const mcp = scanned.find((e) => e.file.endsWith('dd_mcp_api.ts'));
		const rawText = readFileSync(join(REPO_ROOT, mcp?.file ?? GUARD), 'utf8');
		expect(mcp?.code.split('\n').length).toBe(rawText.split('\n').length);
	});

	test('no NEW module opens an outbound socket of its own', () => {
		const offenders = raw.filter((file) => EXEMPT[file] === undefined);
		expect(
			offenders,
			'A new outbound door skips the resolve-and-vet, the redirect refusal, the timeout ' +
				`and the byte cap. Route it through ${GUARD} (fetchGuardedText), or — if it ` +
				'genuinely cannot be (a unix socket, a deliberate loopback dial) — add it to ' +
				`EXEMPT with a reason saying so.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('the burn-down list may only SHRINK', () => {
		// An exemption for a file that no longer opens a socket is a hole nobody
		// is looking at any more — and hides that the debt was actually paid.
		const stale = Object.keys(EXEMPT).filter((file) => !raw.includes(file));
		expect(
			stale,
			'These files no longer make a raw outbound call — DELETE their exemptions.\n  ' +
				stale.join('\n  '),
		).toEqual([]);
		for (const [file, reason] of Object.entries(EXEMPT)) {
			expect(reason.length, `${file}: an exemption needs a real reason`).toBeGreaterThan(80);
		}
	});

	test('the two migrated doors went through the guard and stayed there', () => {
		for (const door of ['src/core/tools/translation.ts', 'src/core/tools/transcription_asr.ts']) {
			const code = stripComments(readFileSync(join(REPO_ROOT, door), 'utf8'));
			expect(code, `${door} no longer routes through fetchGuardedText`).toContain(
				'fetchGuardedText(',
			);
			expect(code, `${door} opened a raw socket again`).not.toMatch(OUTBOUND_CALL);
		}
	});

	test('the guard itself still resolves, refuses redirects and bounds the read', () => {
		const guard = readFileSync(join(REPO_ROOT, GUARD), 'utf8');
		expect(guard).toContain("redirect: 'error'");
		expect(guard).toContain('maxBytes');
		expect(guard).toContain('AbortController');
		expect(guard).toMatch(/lookup|resolve/);
	});
});

describe('isLoopbackHost: the bugs every hand-rolled copy carried', () => {
	test('bracketed IPv6 loopback matches (the dead-code arm)', () => {
		expect(new URL('http://[::1]/').hostname).toBe('[::1]');
		expect(isLoopbackHost(new URL('http://[::1]/').hostname)).toBe(true);
	});

	test('the whole loopback family, not just 127.0.0.1', () => {
		for (const host of [
			'127.0.0.1',
			'127.0.0.2', // every copy missed this
			'127.255.255.254',
			'0.0.0.0', // and this
			'',
			'localhost',
			'LOCALHOST',
			'localhost.', // the fully-qualified spelling of the same name
			'evil.localhost', // RFC 6761: the whole TLD is loopback
			'ip6-localhost',
			'[::]',
			'[::ffff:127.0.0.1]',
			'[::ffff:7f00:1]', // ...and the hex form the URL parser emits
			'[::1%lo0]',
		]) {
			expect(isLoopbackHost(host), `${host} must read as loopback`).toBe(true);
		}
	});

	test('a LAN origin stays VALID — it is private, but it is reachable', () => {
		// The over-block that would have broken the docker museum install, which
		// fetches its releases from the master over a LAN address. This is why the
		// question is loopback and NOT isPrivateIp.
		for (const host of [
			'192.168.1.40',
			'10.0.0.7',
			'master.dedalo.dev',
			'93.184.216.34',
			'127.0.0.1.evil.com',
			'notlocalhost',
		]) {
			expect(isLoopbackHost(host), `${host} must NOT read as loopback`).toBe(false);
		}
	});
});

describe('the IPv4-mapped IPv6 bypass (found 2026-08-31, pre-existing)', () => {
	test('the URL parser REWRITES the dotted form into hex', () => {
		// This is the whole mechanism: the guard checked only the dotted tail, and
		// no address arriving as a URL ever HAS a dotted tail.
		expect(new URL('http://[::ffff:127.0.0.1]/').hostname).toBe('[::ffff:7f00:1]');
	});

	test('isPrivateIp reads BOTH spellings of a mapped address', () => {
		for (const ip of [
			'::ffff:127.0.0.1',
			'::ffff:7f00:1', // loopback, hex — read as PUBLIC before the fix
			'::ffff:10.0.0.1',
			'::ffff:a00:1', // 10.0.0.1
			'::ffff:c0a8:1', // 192.168.0.1
			'::ffff:a9fe:a9fe', // 169.254.169.254 — the cloud metadata endpoint
		]) {
			expect(isPrivateIp(ip), `${ip} must be private`).toBe(true);
		}
		expect(isPrivateIp('::ffff:5db8:d822')).toBe(false); // 93.184.216.34, public
	});

	test('assertPublicUrl refuses the mapped-loopback URL end to end', async () => {
		for (const uri of [
			'http://[::ffff:127.0.0.1]/x',
			'http://[::ffff:7f00:1]/x',
			'http://[::ffff:a00:1]/x',
			'http://[::ffff:a9fe:a9fe]/latest/meta-data/',
		]) {
			expect(await isPublicUrl(uri), `${uri} must be refused`).toBe(false);
		}
	});
});
