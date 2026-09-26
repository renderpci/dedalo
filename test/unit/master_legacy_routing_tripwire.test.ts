/**
 * TRIPWIRE — the official master serves PRE-7 installations, transparently, and
 * the two engines never converge on one url (engineering/MASTER_SERVER.md).
 *
 * master.dedalo.dev is the v7 engine now; the pre-7 engine moved to
 * v6.master.dedalo.dev. But every pre-7 installation in the world still calls
 * the HISTORICAL urls on master.dedalo.dev, and must keep updating its ontology
 * and its code without being touched. Their dialect is one this engine refuses
 * BY LAW (a form-encoded `rqo=` body; a top-level `result` key — ERRORS_SPEC
 * §3.0), so the split lives at the web server: deploy/apache.master_legacy_v6.conf
 * diverts exactly the legacy shapes and nothing else.
 *
 * That file is load-bearing in a way no unit test would otherwise reach — a
 * dropped rule does not fail here, it fails silently at a museum six time zones
 * away, months later, as "the update panel says the server is unreachable". So
 * this gate READS the shipped rules, EVALUATES them against a table of real
 * requests (the positive table: every leg of the census in MASTER_SERVER.md
 * §3.2; the negative table: every v7 route that must stay on the engine), and
 * pins the couplings the diversion silently depends on:
 *
 *   - the v7 door `/api/v1/json` is a real API path, so moving consumers there
 *     costs no engine change (and the samples point AT it);
 *   - the engine's release prefix stays `/dedalo/install/code/` and never
 *     becomes the pre-7 `/dedalo/code/` the overlay hands away;
 *   - the engine reads no `Host` header — the precondition that makes
 *     `ProxyPreserveHost Off` free;
 *   - a master with a role on and no DEDALO_HOST says so at boot, because every
 *     manifest it serves would otherwise advertise `localhost` to other machines.
 *
 * Honest limits: this proves the SHIPPED RULES say what we mean, not that the
 * deployed Apache loaded them, and not mod_rewrite's own semantics — the
 * evaluator below models the subset the overlay uses (accumulated RewriteCond
 * over %{HTTP:<header>} only, negation, [NC], a [P,L] RewriteRule),
 * which is why the overlay may use no other condition variable: an unmodelled
 * one fails loudly here rather than being skipped.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePathSourceFiles } from '../helpers/write_path_corpus.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const overlayPath = join(repoRoot, 'deploy/apache.master_legacy_v6.conf');
const overlay = readFileSync(overlayPath, 'utf8');

const V6_UPSTREAM = 'https://v6.master.dedalo.dev';
const MASTER_ORIGIN = 'https://master.dedalo.dev';

/**
 * Spellings that LOOK like request data but are CGI variables mod_rewrite cannot
 * see at translate-name time: each resolves to '' there, so a condition using one
 * is dead and the rule it guards never fires. Verified on httpd 2.4.68.
 */
const CGI_ONLY_VARIABLES: readonly string[] = ['%{CONTENT_TYPE}', '%{CONTENT_LENGTH}'];

const BEGIN = '# ===== BEGIN LEGACY-V6 DIVERSION';
const END = '# ===== END LEGACY-V6 DIVERSION';

/** The fenced diversion block — the only region rules may live in. */
function diversionBlock(): string {
	const from = overlay.indexOf(BEGIN);
	const to = overlay.indexOf(END);
	expect(from, 'the overlay carries the BEGIN marker').toBeGreaterThanOrEqual(0);
	expect(to, 'the overlay carries the END marker').toBeGreaterThan(from);
	return overlay.slice(from, to);
}

/** Directive lines only — Apache honours `#` at the START of a line, nowhere else. */
function directives(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'));
}

type Cond = {
	readonly variable: string;
	readonly pattern: string;
	readonly negated: boolean;
	readonly nocase: boolean;
};
type Rule = {
	readonly pattern: string;
	readonly target: string;
	readonly flags: string[];
	readonly conds: Cond[];
};

/** Parse the subset of mod_rewrite the overlay uses. Anything else throws. */
function parseRules(text: string): Rule[] {
	const rules: Rule[] = [];
	let pending: Cond[] = [];
	for (const line of directives(text)) {
		if (line === 'RewriteEngine On') continue;
		if (line.startsWith('RewriteCond')) {
			const m = /^RewriteCond\s+(\S+)\s+(!?)(\S+)(?:\s+\[([^\]]*)\])?$/.exec(line);
			if (m === null) throw new Error(`unparseable RewriteCond: ${line}`);
			pending.push({
				variable: m[1]!,
				negated: m[2] === '!',
				pattern: m[3]!,
				nocase: (m[4] ?? '').split(',').includes('NC'),
			});
			continue;
		}
		if (line.startsWith('RewriteRule')) {
			const m = /^RewriteRule\s+(\S+)\s+(\S+)\s+\[([^\]]*)\]$/.exec(line);
			if (m === null) throw new Error(`unparseable RewriteRule: ${line}`);
			rules.push({ pattern: m[1]!, target: m[2]!, flags: m[3]!.split(','), conds: pending });
			pending = [];
			continue;
		}
		throw new Error(`unexpected directive inside the diversion block: ${line}`);
	}
	expect(pending, 'no RewriteCond is left dangling without its RewriteRule').toEqual([]);
	return rules;
}

const rules = parseRules(diversionBlock());

type Probe = {
	readonly what: string;
	readonly path: string;
	readonly contentType?: string;
	readonly origin?: string;
};

/** Does this request divert? Returns the upstream url, or null for "stays on the engine". */
function route(probe: Probe): string | null {
	for (const rule of rules) {
		const condsHold = rule.conds.every((cond) => {
			// ONLY the `%{HTTP:<header>}` family is modelled, because that is the
			// family mod_rewrite actually resolves at translate-name time. A bare
			// `%{CONTENT_TYPE}` is a CGI variable that does not exist yet at that
			// point and resolves to '' — so the rule it guards NEVER FIRES. That
			// exact bug shipped in the first draft of this overlay (carried over from
			// an nginx `map $content_type` design) and this evaluator MODELLED IT AS
			// WORKING, so the positive table below passed against semantics Apache
			// does not have. Hence a named refusal, not a generic fallback.
			if (CGI_ONLY_VARIABLES.includes(cond.variable)) {
				throw new Error(
					`${cond.variable} is a CGI variable, not a mod_rewrite one: at translate-name ` +
						'time it resolves to the empty string and the rule never fires. Use %{HTTP:…}.',
				);
			}
			const header = /^%\{HTTP:([A-Za-z-]+)\}$/.exec(cond.variable);
			if (header === null) {
				throw new Error(
					`the evaluator models only %{HTTP:<header>} conditions; ${cond.variable} is ` +
						'unmodelled — model it explicitly or do not use it',
				);
			}
			const headerName = header[1]!.toLowerCase();
			let value: string;
			if (headerName === 'content-type') value = probe.contentType ?? '';
			else if (headerName === 'origin') value = probe.origin ?? '';
			else throw new Error(`the evaluator does not model the ${headerName} header`);
			const hit = new RegExp(cond.pattern, cond.nocase ? 'i' : '').test(value);
			return cond.negated ? !hit : hit;
		});
		if (!condsHold) continue;
		const m = new RegExp(rule.pattern).exec(probe.path);
		if (m === null) continue;
		return rule.target.replace(/\$(\d)/g, (_, d: string) => m[Number(d)] ?? '');
	}
	return null;
}

describe('master legacy routing tripwire', () => {
	test('no rewrite rule hides OUTSIDE the fence', () => {
		// The evaluator reads only the fenced block, so a RewriteRule added above or
		// below it would shape production while every table below stayed green — e.g.
		// a `RewriteRule ^/ - [F]` above the fence 403s the whole master.
		const block = diversionBlock();
		const outside = overlay.split(block).join('\n');
		const strays = directives(outside).filter((line) => /^Rewrite(Rule|Cond)\b/.test(line));
		expect(strays, 'every rewrite directive lives inside the fence, where it is modelled').toEqual(
			[],
		);
		// Floor: the fence itself must hold rules, or "no strays" is trivially true
		// of a file that has none at all.
		expect(directives(block).length).toBeGreaterThan(5);
	});

	test('the overlay declares the switches the hop depends on, and they are the EFFECTIVE values', () => {
		// Asserted as LAST-WINS, not as "appears somewhere": these are single-value
		// directives, so a later `ProxyPreserveHost On` appended below would silently
		// override the one we depend on while a `toContain` check stayed green.
		const effective = (name: string): string | undefined =>
			directives(overlay)
				.filter((line) => line.toLowerCase().startsWith(`${name.toLowerCase()} `))
				.at(-1);
		// TLS to the NAME, because v6 mints its own manifest urls from HTTP_HOST +
		// HTTPS: reached over a plain loopback port it would advertise
		// http://127.0.0.1:<port>/... to the world. See the overlay's header.
		expect(effective('SSLProxyEngine')).toBe('SSLProxyEngine On');
		// OFF, overriding deploy/apache.conf: with On the hop carries Host/SNI
		// master.dedalo.dev and loops back into the same vhost.
		expect(effective('ProxyPreserveHost')).toBe('ProxyPreserveHost Off');
		// The hop trusts the NAME; without this it would trust whatever answers it.
		expect(effective('SSLProxyVerify')).toBe('SSLProxyVerify require');
		expect(effective('SSLProxyCheckPeerName')).toBe('SSLProxyCheckPeerName on');
	});

	test('every diversion rule proxies to the v6 vhost BY NAME over https', () => {
		expect(rules.length, 'the five legacy families of MASTER_SERVER.md §3.2').toBe(5);
		for (const rule of rules) {
			expect(rule.flags, `${rule.pattern} is a proxy hop`).toContain('P');
			expect(rule.flags, `${rule.pattern} is terminal`).toContain('L');
			expect(
				rule.target.startsWith(`${V6_UPSTREAM}/`),
				`${rule.pattern} targets ${V6_UPSTREAM}`,
			).toBe(true);
			// An IP or a plain-http target would make v6 advertise that address to
			// every pre-7 installation on earth.
			expect(rule.target).not.toMatch(/^http:\/\//);
			expect(rule.target).not.toMatch(/\/\/\d+\.\d+\.\d+\.\d+/);
		}
	});

	test('the two API-path rules are pinned to the discriminators, not to the path alone', () => {
		const apiRules = rules.filter((rule) => rule.pattern.includes('api/v1/json'));
		expect(apiRules.length, 'one for the server-to-server dialect, one for the browser legs').toBe(
			2,
		);

		const byContentType = apiRules.find((rule) =>
			rule.conds.some((cond) => cond.variable === '%{HTTP:Content-Type}'),
		);
		expect(byContentType, 'a rule keyed on the form-encoded v6 body').toBeDefined();
		expect(byContentType!.conds).toHaveLength(1);
		expect(byContentType!.conds[0]!.pattern).toBe('^application/x-www-form-urlencoded');
		expect(byContentType!.conds[0]!.negated).toBe(false);

		const byOrigin = apiRules.find((rule) =>
			rule.conds.some((cond) => cond.variable === '%{HTTP:Origin}'),
		);
		expect(byOrigin, 'a rule keyed on a FOREIGN origin').toBeDefined();
		// Both halves are load-bearing: "Origin present" (so a server-side v7 JSON
		// probe with no Origin stays on the engine) AND "not this host" (so the
		// master's own client does).
		expect(byOrigin!.conds).toHaveLength(2);
		expect(
			byOrigin!.conds.every((cond) => cond.negated),
			'both conditions are negative',
		).toBe(true);
		expect(byOrigin!.conds.map((cond) => cond.pattern)).toEqual([
			'^$',
			'^https://master\\.dedalo\\.dev$',
		]);
		// No method condition: v6 answers its own CORS preflight, so the OPTIONS
		// must divert with the POST.
		for (const rule of apiRules) {
			expect(rule.conds.some((cond) => cond.variable === '%{REQUEST_METHOD}')).toBe(false);
		}
	});

	test('POSITIVE — every leg a pre-7 installation sends is diverted', () => {
		const legacy: Probe[] = [
			// The legacy structure server: pre-6.5 STRUCTURE_SERVER_URL + the backup probe.
			{
				what: 'str_manager',
				path: '/dedalo/core/extras/str_manager/index.php',
				contentType: 'application/x-www-form-urlencoded',
			},
			// Pre-7 ontology snapshots, incl. the 6.9 the deployed master serves today.
			{
				what: 'ontology 6.9 snapshot',
				path: '/dedalo/install/import/ontology/6.9/matrix_dd.copy.gz',
			},
			{ what: 'ontology 6.4 snapshot', path: '/dedalo/install/import/ontology/6.4/test.copy.gz' },
			// The server-to-server probes (ontology + code) and the backup `data=` probe.
			{
				what: 'rqo= probe',
				path: '/dedalo/core/api/v1/json/',
				contentType: 'application/x-www-form-urlencoded',
			},
			{
				what: 'rqo= probe, no trailing slash',
				path: '/dedalo/core/api/v1/json',
				contentType: 'application/x-www-form-urlencoded',
			},
			{
				what: 'rqo= probe, charset suffix',
				path: '/dedalo/core/api/v1/json/',
				contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			},
			// The browser manifests (ontology + code) and their preflight.
			{
				what: 'browser manifest',
				path: '/dedalo/core/api/v1/json/',
				contentType: 'application/json',
				origin: 'https://museum.example',
			},
			{
				what: 'browser preflight',
				path: '/dedalo/core/api/v1/json/',
				origin: 'https://museum.example',
			},
			// The code archives, in all three shapes a pre-7 install can ask for.
			{ what: 'code zip', path: '/dedalo/code/6/6.9/6.9.6_dedalo.zip' },
			{ what: 'development zip', path: '/dedalo/code/development/dedalo_development.zip' },
			{ what: 'legacy hard-coded zip', path: '/dedalo/code/dedalo6_code.zip' },
		];
		for (const probe of legacy) {
			expect(route(probe), `${probe.what} must reach the v6 engine`).toStartWith(V6_UPSTREAM);
		}
		// The hop must preserve the path it was called with, or v6 answers a
		// different request than the installation made.
		expect(route(legacy[1]!)).toBe(
			`${V6_UPSTREAM}/dedalo/install/import/ontology/6.9/matrix_dd.copy.gz`,
		);
		expect(route(legacy[8]!)).toBe(`${V6_UPSTREAM}/dedalo/code/6/6.9/6.9.6_dedalo.zip`);
	});

	test('NEGATIVE — every v7 route stays on the engine', () => {
		const v7: Probe[] = [
			// The v7 door, from a consumer's browser and from its server.
			{
				what: 'v7 door, cross-origin',
				path: '/api/v1/json',
				contentType: 'application/json',
				origin: 'https://consumer.example',
			},
			{ what: 'v7 door, server-side', path: '/api/v1/json', contentType: 'application/json' },
			{ what: 'v7 door, preflight', path: '/api/v1/json', origin: 'https://consumer.example' },
			// The master's OWN client, which is same-origin.
			{
				what: 'master UI',
				path: '/dedalo/core/api/v1/json',
				contentType: 'application/json',
				origin: MASTER_ORIGIN,
			},
			{
				what: 'master UI, trailing slash',
				path: '/dedalo/core/api/v1/json/',
				contentType: 'application/json',
				origin: MASTER_ORIGIN,
			},
			// A v7 server-side probe left on the legacy path: JSON, no Origin.
			{
				what: 'legacy path, no origin, json',
				path: '/dedalo/core/api/v1/json/',
				contentType: 'application/json',
			},
			// v7's own artifacts.
			{ what: '7.x ontology snapshot', path: '/dedalo/install/import/ontology/7.0/dd.copy.gz' },
			{ what: '7.x release archive', path: '/dedalo/install/code/7.0.1/7.0.1.zip' },
			{ what: '7.x release digest', path: '/dedalo/install/code/7.0.1/7.0.1.zip.sha256' },
			{ what: 'health', path: '/health' },
			{ what: 'media', path: '/dedalo/media/0/thumb/test99_1.jpg' },
			{ what: 'client asset', path: '/dedalo/core/page/css/main.css' },
		];
		for (const probe of v7) {
			expect(route(probe), `${probe.what} must stay on the v7 engine`).toBeNull();
		}
	});

	test('the evaluator is not vacuous — a planted miss is caught in both directions', () => {
		// If `route` answered null for everything the positive table would be a lie;
		// if it answered a url for everything the negative table would be.
		expect(route({ what: 'control hit', path: '/dedalo/code/x.zip' })).toStartWith(V6_UPSTREAM);
		expect(route({ what: 'control miss', path: '/dedalo/nothing/here' })).toBeNull();
	});

	test('COUPLING — the v7 door is a real API path and the samples point at it', async () => {
		const server = readFileSync(join(repoRoot, 'src/server.ts'), 'utf8');
		const apiPaths = /const API_PATHS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/.exec(
			server,
		);
		expect(apiPaths, 'API_PATHS is still a literal set').not.toBeNull();
		// Moving consumers to this door costs NO engine change only while it is served.
		expect(apiPaths![1]).toContain("'/api/v1/json'");
		// …and the legacy twin must stay served too: the master's own client posts there.
		expect(apiPaths![1]).toContain("'/dedalo/core/api/v1/json'");

		const catalog = readFileSync(join(repoRoot, 'src/config/catalog/maintenance.ts'), 'utf8');
		for (const key of ['CODE_SERVERS', 'ONTOLOGY_SERVERS']) {
			const sample = new RegExp(`${key}=\\[\\{[^\\n]*?"url":"([^"]+)"`).exec(catalog);
			expect(sample, `${key} still ships an official sample`).not.toBeNull();
			// Aimed at the legacy door on the official master, a v7 install reaches
			// the pre-7 engine — rule 4 sends it there — and fails visibly.
			expect(sample![1], `${key} points at the v7 door`).toBe(`${MASTER_ORIGIN}/api/v1/json`);
		}
	});

	test('COUPLING — the engine release prefix never becomes the pre-7 one', async () => {
		const { CODE_RELEASE_URL_PREFIX } = await import('../../src/core/update/code_serving.ts');
		// The overlay hands `/dedalo/code/` to v6 wholesale. If the engine ever
		// served its own archives from that prefix, every v7 code update would be
		// proxied into the retired engine.
		expect(CODE_RELEASE_URL_PREFIX).toBe('/dedalo/install/code/');
		const divertedPrefixes = rules.map((rule) => rule.pattern);
		for (const pattern of divertedPrefixes) {
			expect(new RegExp(pattern).test(`${CODE_RELEASE_URL_PREFIX}7.0.1/7.0.1.zip`)).toBe(false);
		}
	});

	test('COUPLING — the engine reads no Host header, which is what makes ProxyPreserveHost Off free', async () => {
		const offenders: string[] = [];
		const scanned: string[] = [];
		/**
		 * ENUMERATED, shrink-only. `new URL(x.url)` is only a Host read when `x` is an
		 * HTTP Request — Bun builds THAT url from the Host header. A lexical scan
		 * cannot see types, so a domain object with a `.url` field and a parameter
		 * named `request` reads identically. Each entry is re-proved below: the file
		 * must exist, must still match, and must still declare the parameter as the
		 * domain type — so the day it becomes a real Request, this turns red.
		 */
		const EXEMPT: readonly {
			readonly file: string;
			readonly declares: string;
			readonly reason: string;
		}[] = [
			{
				file: 'src/core/update/code_update.ts',
				declares: 'request: UpdateRequest',
				reason:
					'`request` is an UpdateRequest record, not an HTTP Request: its `.url` is the ' +
					'code-server url the operator configured, compared against CODE_SERVERS to pin ' +
					'the download origin. Nothing here touches a request header.',
			},
		];
		// The engine-process corpus (src/, tools/, scripts/) — the shared lister,
		// so this census cannot pick a narrower root than the code that serves.
		for (const rel of writePathSourceFiles()) {
			const text = readFileSync(join(repoRoot, rel), 'utf8');
			scanned.push(rel);
			// Two shapes, because `ProxyPreserveHost Off` applies to the WHOLE
			// vhost, not only the diverted hop: over the unix socket the engine
			// now sees `Host: localhost` for every request. Reading the header
			// directly is the obvious way to trip on that — and so is the
			// non-obvious way, since Bun builds `request.url` FROM the Host
			// header, so `new URL(request.url).origin` is a Host read wearing a
			// different hat. No engine path does either today (CORS keys on the
			// Origin HEADER, cors.ts; nothing builds an absolute url from
			// request.url), which is exactly what makes the directive free —
			// so both shapes are censused, not just the literal one.
			const read = /\.get\(\s*['"`](?:host|x-forwarded-host)['"`]\s*\)/i.exec(text);
			const fromUrl = /new URL\(\s*\w*[Rr]equest\.url\s*\)\s*\.\s*(?:origin|host|hostname)/.exec(
				text,
			);
			if (read !== null || fromUrl !== null) offenders.push(rel);
		}
		// A corpus floor, because "no offenders" is also what a scan that read
		// NOTHING reports — and this verdict licenses ProxyPreserveHost Off.
		expect(scanned.length, 'the census actually read the engine').toBeGreaterThan(600);
		// Positive controls: both matchers must SEE a reader when one exists.
		expect(
			/\.get\(\s*['"`](?:host|x-forwarded-host)['"`]\s*\)/i.test(
				"const h = request.headers.get('x-forwarded-host');",
			),
		).toBe(true);
		expect(
			/new URL\(\s*\w*[Rr]equest\.url\s*\)\s*\.\s*(?:origin|host|hostname)/.test(
				'const base = new URL(request.url).origin;',
			),
		).toBe(true);
		// Re-prove every exemption rather than trusting the list.
		for (const entry of EXEMPT) {
			const text = readFileSync(join(repoRoot, entry.file), 'utf8');
			expect(offenders, `${entry.file} still matches the census`).toContain(entry.file);
			expect(text, `${entry.file}: ${entry.reason}`).toContain(entry.declares);
			expect(entry.reason.length).toBeGreaterThan(60);
		}
		const unexplained = offenders.filter((file) => !EXEMPT.some((e) => e.file === file));
		expect(unexplained, 'a Host reader would be fed `localhost` by the socket hop').toEqual([]);
	});

	test('COUPLING — a master with no usable public name says so at boot', async () => {
		const server = readFileSync(join(repoRoot, 'src/server.ts'), 'utf8');
		// Gated on the ROLES, so an ordinary install stays quiet.
		expect(server).toMatch(/isOntologyServer\s*\|\|\s*config\.update\.isCodeServer/);
		// WARNED, not computed and dropped: `publicOriginIsLocal` had no caller at all
		// before this, which is the argument for gating the WIRING and not the value.
		expect(server).toMatch(/publicOriginIsLocal\(\)\s*\)\s*\{[\s\S]{0,600}?console\.warn\(/);

		// And the PREDICATE itself, by behaviour rather than by grepping source — the
		// first draft of this assertion searched a text window and matched the COMMENT
		// above the code, so removing the loopback branch left it green.
		const { publicOriginIsLocal } = await import('../../src/core/resolve/public_origin.ts');
		const withHost = async (host: string): Promise<boolean> => {
			const previous = process.env.DEDALO_HOST;
			process.env.DEDALO_HOST = host;
			try {
				return publicOriginIsLocal();
			} finally {
				if (previous === undefined) delete process.env.DEDALO_HOST;
				else process.env.DEDALO_HOST = previous;
			}
		};
		// Unset is local (the documented `localhost` fallback)…
		expect(await withHost('')).toBe(true);
		// …and so is an EXPLICIT loopback name: a master configured this way
		// advertises exactly the same useless urls as one that set nothing.
		for (const local of [
			'localhost',
			'LocalHost',
			'127.0.0.1',
			'127.1.2.3',
			'::1',
			'[::1]',
			'localhost:4001',
		]) {
			expect(await withHost(local), `${local} is not a public name`).toBe(true);
		}
		// A real name is not local — or every master would warn forever and the line
		// would be noise an operator learns to ignore.
		for (const real of [
			'master.dedalo.dev',
			'dedalo.example.org',
			'localhost.dedalo.dev',
			'10.0.0.5',
		]) {
			expect(await withHost(real), `${real} is a usable public name`).toBe(false);
		}
	});

	test('the overlay is documented where an operator will look', () => {
		// It is an overlay, not a second copy of the routing: apache.conf keeps the
		// single definition of every v7 route (the "link, never duplicate" law).
		expect(overlay).toContain('deploy/apache.conf');
		expect(overlay).toContain('engineering/MASTER_SERVER.md');
		const canon = readFileSync(join(repoRoot, 'engineering/MASTER_SERVER.md'), 'utf8');
		expect(canon).toContain('deploy/apache.master_legacy_v6.conf');
		// Nothing in the shipped v7 routing may reference the pre-7 zip prefix.
		expect(readFileSync(join(repoRoot, 'deploy/apache.conf'), 'utf8')).not.toContain(
			'/dedalo/code/',
		);
	});
});
