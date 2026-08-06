/**
 * TRIPWIRE — src/external has exactly ONE outbound door, and that door still
 * performs every step of its order.
 *
 * A second socket anywhere in the subsystem would be a request that skips the
 * kill switches, the host allowlist, the SSRF guard, the socket pin, the byte
 * ceiling, the breaker and the concurrency bound — all of which live in
 * transport.ts and nowhere else. The prose in that file's header is the design;
 * this file is the enforcement.
 *
 * A SOCKET, NOT A SPELLING. `fetch(` is only the obvious form; an alias
 * (`const send = globalThis.fetch`), a raw `node:net`/`node:tls`/`node:dgram`
 * socket, a `WebSocket`, an `EventSource` and `Bun.spawn(['curl', …])` all open
 * exactly the same hole, and none of them is written by an adversary — they are
 * written by whoever reaches for the handiest tool. Every one is banned, and
 * every one has a case below asserting it is CAUGHT, so the ban cannot rot into
 * a list of forms nobody uses. The legal spellings are asserted not to fire: a
 * gate that cries wolf is a gate somebody deletes.
 *
 * SCOPE. src/external/** only. The pre-existing outbound sites elsewhere in
 * src/ (media fetchers, AI providers, the diffusion targets) are a separate
 * burn-down and are deliberately NOT policed here — a gate that fails for
 * reasons outside its subsystem gets disabled.
 *
 * Comments are stripped before scanning, so this file's own prose (and
 * transport.ts's header, which names `fetch` repeatedly) stays legal. The
 * stripper is SHARED and string-literal-aware (test/helpers/strip_comments.ts);
 * the regex it replaced could be made to eat a whole line of real code.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { stripComments } from '../helpers/strip_comments.ts';

const EXTERNAL_DIR = join(import.meta.dir, '..', '..', 'src', 'external');
const DOOR = 'transport.ts';

function externalFiles(): { relative: string; code: string }[] {
	const files: { relative: string; code: string }[] = [];
	for (const relative of new Glob('**/*.ts').scanSync({ cwd: EXTERNAL_DIR })) {
		files.push({
			relative,
			code: stripComments(readFileSync(join(EXTERNAL_DIR, relative), 'utf8')),
		});
	}
	return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

/**
 * Every way a module could open a socket of its own — INCLUDING the indirect
 * ones, which is the whole point: a gate that only bans the obvious spelling
 * bans nothing, because the next `fetch` to appear here will not be written by
 * somebody trying to evade a test, it will be written by somebody who reached
 * for the handiest tool.
 *
 * `fetch` is banned as a NAME, not only as a call: `const send = globalThis.fetch`
 * and `const { fetch: send } = globalThis` are the same door with a different
 * sign on it. It is deliberately NOT a blanket `\bfetch\b` — that matches
 * `fetchExternalRows`, `fetchedAt` and the word in a message string, and a gate
 * that cries wolf is a gate somebody deletes.
 */
const OUTBOUND_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
	{ name: 'fetch(', pattern: /(?<![.\w$])fetch\s*\(/ },
	// `fetch` as a VALUE: after an operator or a bracket, and not called. String
	// literals survive the stripper on purpose (banning `'node:tls'` needs them),
	// so this must not be a blanket word match — `detail: 'the fetch failed'` is
	// prose, and a gate that fires on prose gets deleted rather than obeyed.
	{
		name: 'a bare `fetch` reference (aliasing)',
		pattern: /(?:=|,|\(|\[|\{|:|\breturn|\bawait)\s*fetch\s*(?![\w$(])/,
	},
	{ name: 'globalThis.fetch', pattern: /\bglobalThis\s*\.\s*fetch\b/ },
	{ name: 'Bun.fetch', pattern: /\bBun\s*\.\s*fetch\b/ },
	{ name: 'new Request(', pattern: /\bnew\s+Request\s*\(/ },
	{ name: 'node:http(s) request', pattern: /['"]node:https?['"]/ },
	// Raw sockets: one level below fetch, and none of them pass the door's steps.
	{ name: 'node:net / node:tls / node:dgram', pattern: /['"]node:(?:net|tls|dgram)['"]/ },
	{ name: 'Bun socket API', pattern: /\bBun\s*\.\s*(?:connect|listen|udpSocket)\b/ },
	{ name: 'new WebSocket(', pattern: /\bnew\s+WebSocket\s*\(/ },
	{ name: 'new EventSource(', pattern: /\bnew\s+EventSource\s*\(/ },
	// A subprocess is a socket with extra steps (`Bun.spawn(['curl', …])`).
	{ name: 'a subprocess', pattern: /\bBun\s*\.\s*spawn(?:Sync)?\s*\(|['"]node:child_process['"]/ },
];

describe('one outbound door (src/external/**)', () => {
	const files = externalFiles();

	test('the subsystem is actually being scanned', () => {
		expect(files.length).toBeGreaterThanOrEqual(9);
		expect(files.some((file) => file.relative === DOOR)).toBe(true);
	});

	test(`no outbound call outside ${DOOR}`, () => {
		const violations: string[] = [];
		for (const file of files) {
			if (file.relative === DOOR) continue;
			for (const { name, pattern } of OUTBOUND_PATTERNS) {
				if (pattern.test(file.code)) violations.push(`${file.relative}: ${name}`);
			}
		}
		expect(
			violations,
			`Outbound call outside the one door. Route it through fetchExternalJson (src/external/transport.ts) — it owns the kill switches, the host allowlist, the SSRF guard + socket pin, the byte ceiling, the retry policy, the breaker and the concurrency bound: ${violations.join(', ')}`,
		).toEqual([]);
	});
});

/**
 * A GATE IS ONLY WORTH ITS EVASIONS. Each case below is a form that opens a
 * socket while looking like something else; if the scan stops recognising one,
 * this fails long before the form appears in the subsystem.
 */
describe('the scan recognises the INDIRECT forms too', () => {
	const BYPASSES: readonly { name: string; source: string }[] = [
		{ name: 'aliasing through globalThis', source: 'const send = globalThis.fetch;\nsend(url);\n' },
		{ name: 'destructuring the global', source: 'const { fetch: send } = globalThis;\n' },
		{ name: 'a plain identifier alias', source: 'const send = fetch;\n' },
		{ name: 'a raw TLS socket', source: "import { connect } from 'node:tls';\n" },
		{ name: 'a raw TCP socket', source: "import net from 'node:net';\n" },
		{ name: 'a UDP socket', source: "const dgram = await import('node:dgram');\n" },
		{ name: 'a Bun socket', source: 'await Bun.connect({ hostname: h, port: 443 });\n' },
		{ name: 'a websocket', source: 'const ws = new WebSocket(remote);\n' },
		{ name: 'server-sent events', source: 'const stream = new EventSource(remote);\n' },
		{ name: 'curl in a subprocess', source: "Bun.spawn(['curl', remote]);\n" },
		{ name: 'child_process', source: "import { execFile } from 'node:child_process';\n" },
	];

	for (const { name, source } of BYPASSES) {
		test(`${name} is caught`, () => {
			const code = stripComments(source);
			const caught = OUTBOUND_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(
				({ name: patternName }) => patternName,
			);
			expect(caught, `no pattern catches: ${source.trim()}`).not.toEqual([]);
		});
	}

	test('the legal spellings are NOT caught (a gate that cries wolf gets deleted)', () => {
		const legal = [
			'import { fetchExternalJson } from "./transport.ts";',
			'const view = { fetchedAt: 0 };',
			'export async function prefetchExternalTargets() {}',
			"detail: 'the fetch failed'", // prose in an error message
		];
		for (const source of legal) {
			const code = stripComments(source);
			const caught = OUTBOUND_PATTERNS.filter(({ pattern }) => pattern.test(code));
			expect(
				caught.map((entry) => entry.name),
				`false positive on: ${source}`,
			).toEqual([]);
		}
	});
});

describe('the comment stripper cannot be used to hide code', () => {
	test('a `//` inside a string literal does not eat the rest of the line', () => {
		// The old regex stripper ate from the `//` to the newline unless a `:`
		// preceded it — so this line's `fetch(` vanished from the scan. That hid
		// ACCIDENTS, not just evasion.
		const code = stripComments("const separator = 'a//b';\nawait fetch(url);\n");
		expect(code).toContain('fetch(url)');
		expect(OUTBOUND_PATTERNS.some(({ pattern }) => pattern.test(code))).toBe(true);
	});

	test('a real comment naming a banned token is still stripped', () => {
		const code = stripComments('// this module must never call fetch(url)\nconst x = 1;\n');
		expect(OUTBOUND_PATTERNS.some(({ pattern }) => pattern.test(code))).toBe(false);
	});

	test('a URL in a comment still strips, and a regex literal survives', () => {
		expect(stripComments('const p = /https:\\/\\/x/;\nconst y = 2;')).toContain('https:');
		expect(stripComments('const y = 2; // see https://example.org/fetch(')).not.toContain(
			'example.org',
		);
	});
});

describe(`${DOOR} still performs every step of its order`, () => {
	const code = stripComments(readFileSync(join(EXTERNAL_DIR, DOOR), 'utf8'));

	const REQUIRED: readonly { step: string; pattern: RegExp }[] = [
		{ step: '1 — the kill switches', pattern: /assertServiceEnabled\s*\(/ },
		{ step: '2 — the circuit breaker', pattern: /checkBreaker\s*\(/ },
		{ step: '3 — the host allowlist', pattern: /isAllowedExternalHost\s*\(/ },
		{ step: '4 — the SSRF guard', pattern: /assertPublicUrl\b/ },
		{ step: '4 — the socket pin (vetted address)', pattern: /vetted\.addresses\[/ },
		{ step: '4 — the pin keeps SNI at the real host', pattern: /serverName/ },
		{ step: '5 — the credential, after vetting', pattern: /attachCredential\s*\(/ },
		{ step: "6 — redirect:'error'", pattern: /redirect:\s*'error'/ },
		{ step: '6 — an AbortSignal', pattern: /controller\.signal/ },
		{ step: '6 — a streamed byte cap', pattern: /readCapped\s*\(/ },
		{ step: '7 — retry classification', pattern: /isRetryable\s*\(/ },
		{ step: '8 — breaker outcome', pattern: /recordSuccess\s*\(|recordFailure\s*\(/ },
	];

	for (const { step, pattern } of REQUIRED) {
		test(`step ${step} is present`, () => {
			expect(pattern.test(code), `transport.ts no longer performs step ${step}`).toBe(true);
		});
	}

	test('the allowlist is consulted BEFORE the SSRF guard (which is the DNS step)', () => {
		// Ordering, statically: the only call to isAllowedExternalHost is inside
		// parseAllowedUrl, and parseAllowedUrl is called before `attempt` (which
		// owns assertPublicUrl). Assert the call order in fetchExternalJson.
		const entry = code.slice(code.indexOf('export async function fetchExternalJson'));
		const allowlistAt = entry.indexOf('parseAllowedUrl(');
		const attemptAt = entry.indexOf('attempt(options');
		expect(allowlistAt).toBeGreaterThan(-1);
		expect(attemptAt).toBeGreaterThan(-1);
		expect(allowlistAt).toBeLessThan(attemptAt);
	});

	test('the credential attach happens AFTER the guard, inside one attempt', () => {
		const body = code.slice(code.indexOf('async function attempt('));
		expect(body.indexOf('assertUrl(')).toBeLessThan(body.indexOf('attachCredential('));
	});

	test('the byte ceiling and the timeout come from the operator settings', () => {
		expect(/externalSettings\(\)\.maxBytes/.test(code)).toBe(true);
		expect(/externalSettings\(\)\.timeoutMs/.test(code)).toBe(true);
	});
});
