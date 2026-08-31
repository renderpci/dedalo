/**
 * TRIPWIRE — a TLS install cannot lose its TLS (P1-6, closes OPS-02 + OPS-04).
 *
 * `install.sh` puts the whole TLS decision into `.dedalo.env` — which compose
 * reads ONLY when handed `--env-file`, and which is deliberately not named
 * `.env` because the engine's own loader auto-loads that from the working
 * directory. The script's `compose()` helper always passed the flag. Every
 * operator-facing command OUTSIDE that helper omitted it: the guided path's own
 * printed "Logs:" and "Stop:" lines, and `docs/install/quickstart.md`'s
 * everyday commands including `up -d`.
 *
 * Run any of them on a TLS install and compose resolves the defaults instead:
 * plain HTTP on 80 with no `listen 443` at all, and an empty certbot renewal
 * profile. On a museum server HTTPS disappears, everything is in clear text,
 * and the certificate expires unrenewed within 90 days. Nothing says so.
 *
 * AND THE DEFAULTS CONTRADICTED THEMSELVES (OPS-04). `docker-compose.simple.yml`
 * defaulted `SESSION_COOKIE_SECURE` to `true` while defaulting the proxy to the
 * PLAIN-HTTP `nginx.simple.conf` — against its own header, 78 lines above,
 * saying "no TLS — plain HTTP, so SESSION_COOKIE_SECURE must be false". A
 * browser silently discards a `Secure` cookie over http://, so an operator
 * completed the wizard, chose a root password, and could never log in.
 *
 * CENSUS: TOTAL over `install.sh` and `docs/install/**` — install.sh is
 * otherwise unlinted and untested, so this is the first gate that reads it.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const INSTALL_SH = 'install.sh';
const SIMPLE_STACK = 'docker-compose.simple.yml';

/** The env file install.sh writes, and the flag that makes compose read it. */
const ENV_FILE = '.dedalo.env';

/**
 * Invocations that must NOT carry the env file, each with the reason. The
 * no-certificate variant is the one honest bare form: there is no install to
 * lose, and the compose defaults (plain HTTP + non-Secure cookie) are a working
 * pair — which is exactly what the second half of this gate enforces.
 */
const BARE_BY_DESIGN: {
	file: string;
	rawLine: string;
	underHeading: string;
	reason: string;
}[] = [
	{
		file: 'docs/install/quickstart.md',
		// THE EXACT RAW LINE, indentation included — not a substring. The four
		// spaces put it inside the "no-certificate variant" admonition, and that
		// is the whole distinction: the UNINDENTED everyday command with the same
		// text is the OPS-02 defect. Measured — a substring match excused it.
		rawLine: '    docker compose -f docker-compose.simple.yml up -d',
		// ...and it must live under THIS heading. Anchoring on text alone let the
		// excused line be MOVED: a reviewer deleted it from the admonition and
		// re-added the byte-identical line inside the everyday-commands section,
		// which is the OPS-02 defect wearing the exemption's clothes.
		underHeading: '??? tip "The no-certificate variant"',
		reason:
			'The "no-certificate variant" — a laptop look with no install.sh run, so there is no ' +
			'.dedalo.env to pass and the plain-HTTP defaults are correct here.',
	},
];

/**
 * Is this line inside the section that starts at `heading`? A section ends at
 * the next line that starts a heading or admonition at the same level.
 */
function isUnderHeading(file: string, targetLine: number, heading: string): boolean {
	const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n');
	let inside = false;
	for (const [index, raw] of lines.entries()) {
		if (raw.trimEnd() === heading) {
			inside = true;
			continue;
		}
		if (inside && /^(#{1,6} |\?{3} |!{3} )/.test(raw)) inside = false;
		if (index + 1 === targetLine) return inside;
	}
	return false;
}

function docsInstallFiles(): string[] {
	return readdirSync(join(REPO_ROOT, 'docs', 'install'))
		.filter((name) => name.endsWith('.md'))
		.map((name) => join('docs', 'install', name))
		.sort();
}

/**
 * The OTHER places that drive this stack. The first census called itself TOTAL
 * over install.sh + docs/install and was not: `deploy/dedalo-image-update.sh`
 * (the update path PRODUCTION.md and the engine's own refusal instruct an
 * operator to run), `deploy/dedalo-tls-rotate.sh` and `scripts/update_probe.ts`
 * all drove the simple stack bare. The image-update one is the worst of them —
 * it recreates ONLY the `dedalo` service, so nginx keeps serving HTTPS while the
 * engine comes back with the plain-HTTP defaults and the session cookie quietly
 * loses its Secure flag on a live TLS site.
 */
function deployAndScriptFiles(): string[] {
	return [
		'deploy/dedalo-image-update.sh',
		'deploy/dedalo-tls-rotate.sh',
		'scripts/update_probe.ts',
	];
}

/**
 * Join backslash-continued lines and `&&`-chains before scanning.
 *
 * The first version of this census was LINE-GRANULAR, and a review planted three
 * realistic evasions it could not see: a command split across lines with `\`, a
 * `cmd && docker compose …` chain, and the compose file arriving through a shell
 * variable. A rule that only reads one physical line at a time is a rule about
 * formatting, not about commands.
 */
function logicalLines(source: string): { line: number; text: string; raw: string }[] {
	const physical = source.split('\n');
	const out: { line: number; text: string; raw: string }[] = [];
	let buffer = '';
	let start = 0;
	for (const [index, raw] of physical.entries()) {
		if (buffer === '') start = index + 1;
		const trimmedEnd = raw.trimEnd();
		if (trimmedEnd.endsWith('\\')) {
			buffer += `${trimmedEnd.slice(0, -1).trim()} `;
			continue;
		}
		const joined = buffer + raw.trim();
		out.push({ line: start, text: joined, raw: buffer === '' ? raw : joined });
		buffer = '';
	}
	if (buffer !== '') out.push({ line: start, text: buffer.trim(), raw: buffer.trim() });
	return out;
}

/** Every line mentioning the simple stack by name — the stack install.sh writes for. */
function simpleStackInvocations(file: string): { line: number; text: string; raw: string }[] {
	const found: { line: number; text: string; raw: string }[] = [];
	const source = readFileSync(join(REPO_ROOT, file), 'utf8');
	for (const entry of logicalLines(source)) {
		// SEGMENT the line: `… --env-file X stop && docker compose -f … up -d` used
		// to pass, because `--env-file` appeared SOMEWHERE on it and the bare half
		// rode the compliant half's flag. Each command is judged on its own.
		for (const text of entry.text.split(/&&|\|\||;/)) {
			if (!/docker'?,?\s*'?compose|docker compose/.test(text)) continue;
			// install.sh and the deploy scripts name the file through a variable; the
			// docs and the TS probe spell it out.
			if (
				!text.includes(SIMPLE_STACK) &&
				!text.includes('$COMPOSE_FILE') &&
				!text.includes('COMPOSE_BASE')
			) {
				continue;
			}
			// `docker compose version` is a capability probe, not a stack invocation.
			if (/docker compose version/.test(text)) continue;
			found.push({ line: entry.line, text: text.trim(), raw: entry.raw });
		}
	}
	return found;
}

describe('a TLS install cannot lose its TLS', () => {
	const targets = [INSTALL_SH, ...docsInstallFiles(), ...deployAndScriptFiles()];

	test('the census actually finds invocations (anti-vacuity)', () => {
		// A matcher that found nothing would make the rule below pass forever.
		const total = targets.flatMap((file) => simpleStackInvocations(file));
		expect(total.length).toBeGreaterThan(8);
		expect(simpleStackInvocations(INSTALL_SH).length).toBeGreaterThan(3);
	});

	test('every simple-stack invocation carries the env file', () => {
		const offenders: string[] = [];
		for (const file of targets) {
			for (const { line, text, raw } of simpleStackInvocations(file)) {
				// The exact file, not any file: `--env-file .env` names the one file
				// install.sh says must never be used, because the engine's own loader
				// auto-loads that from the working directory.
				if (text.includes(`--env-file ${ENV_FILE}`) || text.includes(`'${ENV_FILE}'`)) continue;
				// install.sh and the deploy scripts pass it through their own variable.
				// The variable's VALUE is pinned by its own test below, so this is not
				// a hole: `--env-file .env` — the one file install.sh says must never
				// be used — still fails, because it matches none of these.
				// Any quoting: install.sh builds some messages by concatenating a
				// single-quoted string with a double-quoted expansion, so the flag can
				// read `--env-file '"$ENV_FILE"'`.
				if (/--env-file\s+['"]*\$\{?ENV_FILE\}?/.test(text)) continue;
				// The sanctioned SHELL idiom for "pass it when it exists", used by the
				// deploy scripts which also serve the full stack (no such file there).
				if (text.includes('ENV_FILE_ARGS')) continue;
				// The TS probe passes it as an argv element.
				if (text.includes('COMPOSE_ENV_FILE')) continue;
				const excused = BARE_BY_DESIGN.some(
					(entry) =>
						entry.file === file &&
						entry.rawLine === raw &&
						isUnderHeading(file, line, entry.underHeading),
				);
				if (!excused) offenders.push(`${file}:${line}  ${text}`);
			}
		}
		expect(
			offenders,
			`A compose command without --env-file ${ENV_FILE} resolves the BUILT-IN defaults: ` +
				'plain HTTP, no listen 443, no certbot renewal. On a TLS install that silently ' +
				'removes HTTPS and lets the certificate expire. Add the flag, or add the line to ' +
				`BARE_BY_DESIGN with the reason it must stay bare.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('each BARE_BY_DESIGN exemption is still present and still reasoned', () => {
		// A stale exemption silently re-opens the hole it documents.
		for (const entry of BARE_BY_DESIGN) {
			expect(
				entry.reason.length,
				`${entry.file}: an exemption needs a real reason`,
			).toBeGreaterThan(80);
			const lines = readFileSync(join(REPO_ROOT, entry.file), 'utf8').split('\n');
			const matches = lines.filter(
				(line, index) =>
					line === entry.rawLine && isUnderHeading(entry.file, index + 1, entry.underHeading),
			).length;
			expect(
				matches,
				`${entry.file} must contain the excused line EXACTLY ONCE (found ${matches}). ` +
					'Zero means the exemption is stale and must be deleted; more than one means a ' +
					'second bare invocation is riding this excuse.',
			).toBe(1);
		}
	});

	test('the two compose defaults are ONE decision and agree', () => {
		// The OPS-04 shape: a Secure cookie over the plain-HTTP proxy this file's
		// own header says must not have one. Read the DEFAULTS, not the comments.
		const stack = readFileSync(join(REPO_ROOT, SIMPLE_STACK), 'utf8');
		const proxyDefault = stack.match(/\$\{DEDALO_NGINX_CONF:-([\w.]+)\}/)?.[1];
		const cookieDefault = stack.match(
			/SESSION_COOKIE_SECURE:\s*\$\{SESSION_COOKIE_SECURE:-(\w+)\}/,
		)?.[1];
		expect(
			proxyDefault,
			'DEDALO_NGINX_CONF default not found — has the stack changed shape?',
		).toBeString();
		expect(cookieDefault, 'SESSION_COOKIE_SECURE default not found').toBeString();

		// The plain-HTTP conf is the one WITHOUT a TLS listener. Decide from the
		// file, not from its name: a rename must not silently flip the meaning.
		// COMMENTS STRIPPED. A raw match turned a doc line saying "this stack does
		// NOT listen 443" into proof that it does, reddening the gate while nothing
		// about the stack had changed.
		const proxyConf = readFileSync(join(REPO_ROOT, 'deploy', proxyDefault ?? ''), 'utf8')
			.split('\n')
			.filter((line) => !line.trimStart().startsWith('#'))
			.join('\n');
		const servesTls = /listen\s+443/.test(proxyConf);
		expect(
			cookieDefault,
			`${SIMPLE_STACK} defaults the proxy to ${proxyDefault} (TLS: ${servesTls}) but defaults ` +
				`SESSION_COOKIE_SECURE to ${cookieDefault}. A browser silently DISCARDS a Secure ` +
				'cookie over http://, so every login appears to succeed and then does nothing — the ' +
				'operator finishes the wizard, chooses a root password, and can never log in. These ' +
				'two defaults are one decision.',
		).toBe(String(servesTls));
	});

	test('install.sh writes both keys, paired, for every TLS mode it offers', () => {
		// The default agreeing is not enough: the file install.sh WRITES must pair
		// them too, or the guided path reintroduces the contradiction.
		const script = readFileSync(join(REPO_ROOT, INSTALL_SH), 'utf8');
		expect(script).toContain('DEDALO_NGINX_CONF=$NGINX_CONF_NAME');
		expect(script).toContain('SESSION_COOKIE_SECURE=$COOKIE_SECURE');
		// Every branch that sets one must set the other.
		// PAIRED PER BRANCH, not counted. Counting let one branch lose its cookie
		// assignment while another gained a duplicate — totals equal, one TLS mode
		// choosing a proxy without choosing a cookie policy.
		const lines = script.split('\n');
		const unpaired: string[] = [];
		for (const [index, raw] of lines.entries()) {
			if (!/^\s*NGINX_CONF_NAME=/.test(raw)) continue;
			// The two belong together: the pairing is a WINDOW, not a file-wide count.
			const window = lines.slice(Math.max(0, index - 3), index + 4).join('\n');
			if (!/^\s*COOKIE_SECURE=/m.test(window))
				unpaired.push(`install.sh:${index + 1} ${raw.trim()}`);
		}
		expect(
			unpaired,
			'A branch sets the nginx configuration without setting the cookie policy beside it. ' +
				'They are ONE decision: a TLS proxy needs a Secure cookie, a plain-HTTP proxy must ' +
				`not have one.\n  ${unpaired.join('\n  ')}`,
		).toEqual([]);
	});

	test('the env file every invocation names is really .dedalo.env', () => {
		// The flag test accepts $ENV_FILE, so the VALUE has to be pinned here or
		// `ENV_FILE=.env` would satisfy the census while naming the exact file
		// install.sh's own comment says must not be used — compose would read it,
		// but so would the engine's loader from the working directory.
		const script = readFileSync(join(REPO_ROOT, INSTALL_SH), 'utf8');
		expect(script).toContain(`readonly ENV_FILE='${ENV_FILE}'`);
		expect(
			script,
			'install.sh must not name .env as its compose env file — the engine auto-loads that',
		).not.toMatch(/readonly ENV_FILE='\.env'/);
	});
});
