/**
 * ONE OUTBOUND GUARD, AND NO NEW DOOR BESIDE IT (P1-26 / CARRY-10 / CARRY-14).
 *
 * `src/core/security/ssrf_guard.ts` is the hardened primitive: it RESOLVES the
 * hostname and vets every address, and bounds both the wait and the read. What
 * it does with a redirect depends on the door (engineering/OUTBOUND_SPEC.md):
 * the single-call door (`fetchGuardedText`) REFUSES one, because a 3xx
 * re-chooses the target; the pinned hop (`fetchPinnedHop`) RETURNS it unread,
 * so the harvesting door (`src/core/harvest/`) can put the new target through
 * the whole policy again before a socket opens to it.
 *
 * WHO MAY HOLD WHICH DOOR is censused here too, by IMPORT GRAPH: the pinned hop
 * has exactly one production importer (the harvest redirect loop), that loop
 * (`followVetted`) exactly two (`harvestFetch` and the robots.txt fetch), and a tool
 * reaches a raw door only by a written, reasoned exemption — a tool harvests
 * through `harvestFetch`. Before this census both rules were prose.
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

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { basename, dirname, join as joinPosix, normalize as normalizePosix } from 'node:path/posix';
import { parse } from '@babel/parser';
import { Glob } from 'bun';
import {
	isLoopbackHost,
	isPrivateIp,
	isPublicUrl,
	SSRF_REFUSAL_KINDS,
} from '../../src/core/security/ssrf_guard.ts';
// String-literal aware. The regex version this replaced ate 71 lines of
// dd_mcp_api.ts, because the literal 'image/*' opens a block comment that runs
// to the next `*/` — and a marker planted in that window scanned as absent.
import { stripComments } from '../helpers/strip_comments.ts';

/**
 * No DECLARED NAT64 prefix while the behavioural cases run: pinned to '' (a deleted
 * key falls back to ../private/.env through readEnv), so an operator's
 * `DEDALO_NAT64_PREFIXES` — a typo fails every IPv6 closed — cannot change what
 * they judge. The guard's own gate (ssrf_guard.test.ts) does the same.
 */
const NAT64_SETTING = 'DEDALO_NAT64_PREFIXES';
const originalNat64 = process.env[NAT64_SETTING];
beforeEach(() => {
	process.env[NAT64_SETTING] = '';
});
afterEach(() => {
	if (originalNat64 === undefined) delete process.env[NAT64_SETTING];
	else process.env[NAT64_SETTING] = originalNat64;
});

const REPO_ROOT = join(import.meta.dir, '..', '..');
const GUARD = 'src/core/security/ssrf_guard.ts';
/** The harvesting door — what a tool that reads another site's pages imports. */
const HARVEST_DOOR = 'src/core/harvest/harvest.ts';

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
 * `fetch` handed over as a VALUE — `deps.fetch ?? fetch`, `fetchImpl: fetch`,
 * `impl: typeof fetch = fetch` — and called later under another name. That is a
 * socket the call pattern above cannot see: measured 2026-09-29, six modules
 * dialled out this way unseen (the four model providers, the error-report relay,
 * the update reachability probe). Not a key (`fetch:`), not a member (`x.fetch`),
 * not a type (`typeof fetch`); run on code with literals BLANKED, so a sentence
 * saying "fetch" is not a socket.
 */
const OUTBOUND_VALUE = /(?<![\w$.])(?<!typeof\s+)fetch(?![\w$])(?!\s*(?:\(|\??:))/;

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
	// SEEN 2026-09-29, when the census learned OUTBOUND_VALUE — pre-existing
	// sockets it had been blind to, not new doors. Same burn-down, same rule.
	'src/core/update/status.ts':
		'advertisedUrlReachableCheck: a code server probes its OWN advertised release URL ' +
		'(operator config) to prove consumers can reach it — which may legitimately be a LAN ' +
		'address (the docker museum case), so the public-address guard cannot apply. ' +
		'redirect:"error" and a timeout at the call.',
	'src/ai/agent/openai_compat_provider.ts':
		'The agent’s model endpoint, operator-configured and commonly an on-premise sidecar ' +
		'on loopback or the LAN, which the public-address guard would refuse. Signal + idle ' +
		'timer at the call; NOT byte-capped (CARRY-14).',
	'src/ai/rag/llm_provider.ts':
		'The RAG answer model endpoint, operator-configured (commonly a local Ollama the guard ' +
		'would refuse). Signal + timeout at the call; NOT byte-capped (CARRY-14).',
	'src/ai/rag/embedding_provider.ts':
		'The embedding endpoint, operator-configured (commonly a local Ollama the guard would ' +
		'refuse). Signal + timeout at the call; NOT byte-capped (CARRY-14).',
	'src/ai/rag/multimodal_embedding_provider.ts':
		'The multimodal embedding endpoint, operator-configured (endpointIsLocal names the ' +
		'local case the guard would refuse). Signal + timeout at the call; NOT byte-capped (CARRY-14).',
	'tools/tool_error_report/server/index.ts':
		'Relays an error report to the operator-configured master (masterUrlAllowed: https, ' +
		'or loopback http). Signal + timeout at the call; no resolve-and-vet and NOT ' +
		'byte-capped — NOT YET on the guarded transport (CARRY-14).',
};

/** `code`: comments stripped, literals kept. `blanked`: literal bodies blanked too. */
function sourceFiles(): { file: string; code: string; blanked: string }[] {
	const files: { file: string; code: string; blanked: string }[] = [];
	for (const dir of ['src', 'tools'] as const) {
		for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
			const source = readFileSync(join(REPO_ROOT, file), 'utf8');
			const blanked = stripComments(source, { blankStrings: true, blankRegexBodies: true });
			files.push({ file, code: stripComments(source), blanked });
		}
	}
	return files.sort((a, b) => a.file.localeCompare(b.file));
}

describe('outbound SSRF: one guard', () => {
	const scanned = sourceFiles();
	const raw = scanned
		.filter((entry) => entry.file !== GUARD)
		.filter((entry) => OUTBOUND_CALL.test(entry.code) || OUTBOUND_VALUE.test(entry.blanked))
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
			'A new outbound door skips the resolve-and-vet, the redirect policy, the timeout ' +
				'and the byte cap. Harvesting pages from another site (redirects, robots.txt, ' +
				`pacing): harvestFetch in ${HARVEST_DOOR}. One API call to a public service: ` +
				`fetchGuardedText in ${GUARD}. If it genuinely can be neither (a unix socket, a ` +
				'deliberate loopback dial) add it to EXEMPT with a reason saying so. ' +
				`engineering/OUTBOUND_SPEC.md names the doors.\n  ${offenders.join('\n  ')}`,
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

	test('the guard itself still resolves, has a redirect policy per door and bounds the read', () => {
		// Coarse by design: that each door ENFORCES its policy (the single-call door
		// refuses a 3xx, the pinned hop returns it unread) is asserted per function,
		// and driven, in outbound_fetch_tripwire.test.ts.
		const guard = readFileSync(join(REPO_ROOT, GUARD), 'utf8');
		expect(guard).toContain("redirect: 'error'");
		expect(guard).toContain("redirect: 'manual'");
		expect(guard).toContain('maxBytes');
		expect(guard).toContain('AbortController');
		expect(guard).toMatch(/lookup|resolve/);
	});
});

// ---------------------------------------------------------------------------
// WHO HOLDS WHICH DOOR — an IMPORT-GRAPH census, not a grep for a name.
//
// The socket census above proves no module dials out BESIDE the guard. It cannot
// see which module dials THROUGH which door, and two rules depend on that:
//   - `fetchPinnedHop` returns a redirect unread and vets only the ADDRESS. Every
//     other rule a new target must pass again (scheme, https → http, the host
//     allowlist, robots.txt, pacing, the hop limit) lives in ITS CALLER. A second
//     caller is a second redirect loop, and the first one that forgets a rule is
//     an open redirect into an institution's harvester.
//   - A tool reading another site's pages owes robots.txt and a polite pace,
//     which only `harvestFetch` pays. A tool on a raw door skips both silently —
//     and so does one on `followVetted`, whose per-hop robots/pacing check is
//     whatever its caller passes, so it is censused as a door of its own.
//
// A binding is followed, not a spelling: named, renamed, namespace, default,
// `export … from`, `export *`, a top-level `const x = door` re-exported, a
// literal `import()` / `require()` — through any number of re-exporting
// modules. What it deliberately does NOT follow is a WRAPPER (`function get(u)
// { return fetchGuardedText(u) }`): a wrapper is a new function with its own
// contract, reviewed where it is written, and `harvestFetch` is exactly such a
// wrapper around the pinned hop.
// ---------------------------------------------------------------------------

/** The raw doors whose holders are censused. Policy helpers (isPrivateIp, assertPublicUrl…) are free to import. */
const RAW_DOORS = ['fetchPinnedHop', 'fetchBoundedText', 'fetchGuardedText'] as const;

/** The harvest redirect loop — the half-door between the pinned hop and `harvestFetch`. */
const FOLLOW = 'src/core/harvest/follow.ts';

/**
 * `followVetted` is a DOOR too, and censused as one. It vets every hop's URL, but
 * robots.txt and pacing are whatever its CALLER passes as `beforeHop` — the robots
 * fetch itself passes a no-op. A tool importing it gets redirects followed and a
 * pinned socket with neither, and no socket census sees it (it spells no `fetch(`).
 */
const FOLLOW_DOOR = 'followVetted';

/** Every door-carrying module the census starts from, with the doors it hands out. */
const DOOR_SEEDS: Record<string, readonly string[]> = {
	[GUARD]: RAW_DOORS,
	[FOLLOW]: [FOLLOW_DOOR],
};

/**
 * The reach of a module that names a door-carrying module AND loads something
 * through a NON-literal `import()`. The census cannot know what that loads, so
 * it reports the module instead of guessing it clean.
 */
const OPAQUE = '<non-literal import()>';

/**
 * The ONLY production importer of `fetchPinnedHop`. Exact in both directions: a
 * second importer is refused, and this row fails if its file stops importing it.
 */
const PINNED_HOP_IMPORTERS: Record<string, string> = {
	'src/core/harvest/follow.ts':
		'THE redirect loop of the harvesting door: for EVERY hop it re-runs the scheme, the ' +
		'https → http refusal, the caller’s host policy, the URL length ceiling and the ' +
		'caller’s robots/pacing check before handing the hop to fetchPinnedHop, and stops at ' +
		'MAX_REDIRECTS.',
};

/**
 * The ONLY importers of `followVetted`. Exact in both directions, like
 * `PINNED_HOP_IMPORTERS`: each passes its own per-hop gate, and a third is refused.
 */
const FOLLOW_VETTED_IMPORTERS: Record<string, string> = {
	'src/core/harvest/harvest.ts':
		'harvestFetch: THE harvesting door. Its beforeHop is hopGate — robots.txt for the ' +
		'hop’s origin, then that origin’s paced turn, released with the hop’s Retry-After.',
	'src/core/harvest/robots.ts':
		'The robots.txt fetch itself, under one fixed policy: it IS the robots check (so its ' +
		'beforeHop is a no-op) and is not paced — RFC 9309 §2.3.1.2 asks redirects followed.',
};

/**
 * Tools that hold a RAW door instead of `harvestFetch`. SHRINK-ONLY: a row may be
 * deleted or narrowed, never widened, and it fails when its file no longer
 * holds every door it lists. Each says what the tool fetches and why it has not
 * moved — never "it is safe".
 */
const TOOL_RAW_DOOR_IMPORTERS: Record<string, { doors: readonly string[]; reason: string }> = {
	'tools/tool_import_rdf/server/index.ts': {
		doors: ['fetchGuardedText'],
		reason:
			'Dereferences each RDF URI the cataloguer typed (`<uri>.rdf`), one user-initiated ' +
			'request per URI — not a crawl — with redirects REFUSED, not followed. NOT YET on the ' +
			'harvesting door: a linked-data server that redirects the document is refused today ' +
			'instead of followed under per-hop vetting; moving to harvestFetch deletes this row.',
	},
};

type AstNode = { type: string; [key: string]: unknown };

/** One runtime binding a module takes from another. `imported` '*' = the whole namespace. */
interface ImportLink {
	specifier: string;
	imported: string;
	local: string | null;
}

/** `export { a as b } from`, `export * as ns from` (imported '*'), `export * from` (exported '*'). */
interface ReExportLink {
	specifier: string;
	imported: string;
	exported: string;
}

/** A local binding (or a namespace member of one) exported under a name. */
interface LocalRef {
	local: string;
	member: string | null;
}

interface ModuleLinks {
	imports: ImportLink[];
	reexports: ReExportLink[];
	localExports: Array<LocalRef & { exported: string }>;
	/** Top-level `const x = y` / `const x = ns.y` — one module-internal rename. */
	aliases: Map<string, LocalRef>;
	opaque: boolean;
}

type Exposure = Map<string, Set<string>>;

interface CensusState {
	sources: ReadonlyMap<string, string>;
	/** The door-carrying modules the census starts from (`DOOR_SEEDS` unless told otherwise). */
	seeds: Readonly<Record<string, readonly string[]>>;
	links: Map<string, ModuleLinks>;
	/** For each door-CARRYING module: export name → the doors it hands out. */
	exposure: Map<string, Exposure>;
}

/** An identifier or string-literal name (`import { 'x' as y }` is legal). */
function nameOf(node: unknown): string {
	const named = node as { name?: string; value?: string };
	return named.name ?? named.value ?? '';
}

/** A module specifier written as a literal, or null. */
function literalSpecifier(node: unknown): string | null {
	const literal = node as AstNode | undefined;
	if (literal?.type === 'StringLiteral') return literal.value as string;
	const quasis = literal?.quasis as Array<{ value: { cooked: string } }> | undefined;
	if (literal?.type === 'TemplateLiteral' && (literal.expressions as unknown[]).length === 0) {
		return quasis?.[0]?.value.cooked ?? null;
	}
	return null;
}

/**
 * `x`, `ns.x`, `ns['x']`, and any of them under a type assertion — else null.
 * `ns[key]` with a key the scanner cannot read is the WHOLE namespace: the
 * census cannot know which member it is, so it assumes every one.
 */
function refOf(expression: unknown): LocalRef | null {
	const node = expression as AstNode | null;
	if (node === null || node === undefined) return null;
	if (/^TS(As|Satisfies|NonNull)Expression$|^ParenthesizedExpression$/.test(node.type)) {
		return refOf(node.expression);
	}
	if (node.type === 'Identifier') return { local: node.name as string, member: null };
	const object = node.object as AstNode | undefined;
	if (node.type !== 'MemberExpression' || object?.type !== 'Identifier') return null;
	const member = node.computed === true ? literalSpecifier(node.property) : nameOf(node.property);
	return { local: object.name as string, member };
}

function collectImport(statement: AstNode, links: ModuleLinks): void {
	if (statement.importKind === 'type') return; // erased at compile time: reaches nothing
	const specifier = (statement.source as AstNode).value as string;
	for (const binding of statement.specifiers as AstNode[]) {
		if (binding.importKind === 'type') continue;
		const imported =
			binding.type === 'ImportSpecifier'
				? nameOf(binding.imported)
				: binding.type === 'ImportDefaultSpecifier'
					? 'default'
					: '*';
		links.imports.push({ specifier, imported, local: nameOf(binding.local) });
	}
}

function collectDeclaredRefs(
	declaration: AstNode | null,
	links: ModuleLinks,
	exported: boolean,
): void {
	if (declaration?.type !== 'VariableDeclaration') return;
	for (const declarator of declaration.declarations as AstNode[]) {
		const id = declarator.id as AstNode;
		const ref = refOf(declarator.init);
		if (id.type !== 'Identifier' || ref === null) continue;
		links.aliases.set(id.name as string, ref);
		if (exported) links.localExports.push({ ...ref, exported: id.name as string });
	}
}

function collectExportNamed(statement: AstNode, links: ModuleLinks): void {
	if (statement.exportKind === 'type') return;
	const source = statement.source as AstNode | null;
	for (const binding of (statement.specifiers ?? []) as AstNode[]) {
		if (binding.exportKind === 'type') continue;
		const exported = nameOf(binding.exported);
		const imported = binding.type === 'ExportNamespaceSpecifier' ? '*' : nameOf(binding.local);
		if (source !== null) {
			links.reexports.push({ specifier: source.value as string, imported, exported });
		} else {
			links.localExports.push({ local: imported, member: null, exported });
		}
	}
	collectDeclaredRefs(statement.declaration as AstNode | null, links, true);
}

function collectStatement(statement: AstNode, links: ModuleLinks): void {
	if (statement.type === 'ImportDeclaration') collectImport(statement, links);
	else if (statement.type === 'ExportNamedDeclaration') collectExportNamed(statement, links);
	else if (statement.type === 'VariableDeclaration') collectDeclaredRefs(statement, links, false);
	else if (statement.type === 'ExportAllDeclaration' && statement.exportKind !== 'type') {
		const specifier = (statement.source as AstNode).value as string;
		links.reexports.push({ specifier, imported: '*', exported: '*' });
	} else if (statement.type === 'ExportDefaultDeclaration') {
		const ref = refOf(statement.declaration);
		if (ref !== null) links.localExports.push({ ...ref, exported: 'default' });
	} else if (statement.type === 'TSImportEqualsDeclaration' && statement.importKind !== 'type') {
		const specifier = literalSpecifier((statement.moduleReference as AstNode).expression);
		const local = nameOf(statement.id);
		if (specifier !== null) links.imports.push({ specifier, imported: '*', local });
	}
}

/** The specifier an `import()` / `require()` node loads: a string, null when not literal, undefined when not a load. */
function loadedSpecifier(node: AstNode): string | null | undefined {
	if (node.type === 'ImportExpression') return literalSpecifier(node.source);
	if (node.type !== 'CallExpression') return undefined;
	const callee = node.callee as AstNode;
	const isLoad =
		callee.type === 'Import' || (callee.type === 'Identifier' && callee.name === 'require');
	return isLoad ? literalSpecifier((node.arguments as unknown[])[0]) : undefined;
}

const NOT_CODE_KEYS = new Set([
	'loc',
	'extra',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);

/** Every `import()` / `require()` anywhere in the module, however deeply nested. */
function collectLoads(node: unknown, links: ModuleLinks): void {
	if (Array.isArray(node)) {
		for (const child of node) collectLoads(child, links);
		return;
	}
	if (node === null || typeof node !== 'object') return;
	const loaded = loadedSpecifier(node as AstNode);
	if (loaded === null) links.opaque = true;
	else if (loaded !== undefined)
		links.imports.push({ specifier: loaded, imported: '*', local: null });
	for (const [key, child] of Object.entries(node)) {
		if (!NOT_CODE_KEYS.has(key) && typeof child === 'object') collectLoads(child, links);
	}
}

function parseLinks(file: string, source: string): ModuleLinks {
	const links: ModuleLinks = {
		imports: [],
		reexports: [],
		localExports: [],
		aliases: new Map(),
		opaque: false,
	};
	let program: AstNode;
	try {
		// A parse failure THROWS: a module the census cannot read is not a clean one.
		const ast = parse(source, {
			sourceType: 'module',
			plugins: ['typescript', 'decorators-legacy'],
		});
		program = ast.program as unknown as AstNode;
	} catch (error) {
		throw new Error(`door census: cannot parse ${file}: ${String(error)}`);
	}
	for (const statement of program.body as AstNode[]) collectStatement(statement, links);
	collectLoads(program.body, links);
	return links;
}

/** The repo file a relative specifier names, or null (packages, `bun:` — never a door). */
function resolveSpecifier(
	from: string,
	specifier: string,
	known: ReadonlyMap<string, string>,
): string | null {
	if (!specifier.startsWith('.')) return null;
	const base = normalizePosix(joinPosix(dirname(from), specifier));
	const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}/index.ts`];
	return candidates.find((candidate) => known.has(candidate)) ?? null;
}

/** The doors a module hands out under `name` ('*' = all of them). */
function exposed(state: CensusState, from: string, specifier: string, name: string): Set<string> {
	const target = resolveSpecifier(from, specifier, state.sources);
	const exposure = target === null ? undefined : state.exposure.get(target);
	if (exposure === undefined) return new Set();
	if (name !== '*') return new Set(exposure.get(name) ?? []);
	return new Set([...exposure.values()].flatMap((doors) => [...doors]));
}

/** The doors a module-local name is bound to, following local `const` renames. */
function localReach(
	state: CensusState,
	file: string,
	links: ModuleLinks,
	ref: LocalRef,
): Set<string> {
	let current: LocalRef = ref;
	for (let step = 0; step < 8; step++) {
		const binding = links.imports.find((link) => link.local === current.local);
		if (binding !== undefined) {
			const key =
				binding.imported === '*'
					? (current.member ?? '*')
					: current.member === null
						? binding.imported
						: null;
			return key === null ? new Set() : exposed(state, file, binding.specifier, key);
		}
		const alias = links.aliases.get(current.local);
		if (alias === undefined || (alias.member !== null && current.member !== null)) return new Set();
		current = { local: alias.local, member: alias.member ?? current.member };
	}
	return new Set();
}

function addDoors(exposure: Exposure, name: string, doors: Set<string>): void {
	if (doors.size === 0) return;
	const held = exposure.get(name) ?? new Set<string>();
	for (const door of doors) held.add(door);
	exposure.set(name, held);
}

/** What a module hands out: its re-exports and its exported bindings that carry a door. */
function computeExposure(state: CensusState, file: string, links: ModuleLinks): Exposure {
	const exposure: Exposure = new Map();
	for (const link of links.reexports) {
		if (link.exported !== '*') {
			addDoors(exposure, link.exported, exposed(state, file, link.specifier, link.imported));
			continue;
		}
		const target = resolveSpecifier(file, link.specifier, state.sources);
		for (const [name, doors] of state.exposure.get(target ?? '') ?? []) {
			if (name !== 'default') addDoors(exposure, name, doors);
		}
	}
	for (const ref of links.localExports) {
		addDoors(exposure, ref.exported, localReach(state, file, links, ref));
	}
	return exposure;
}

/** A stable fingerprint, so the fixpoint knows when nothing changed. */
function exposureKey(exposure: Exposure | undefined): string {
	const entries = [...(exposure ?? new Map<string, Set<string>>())];
	return JSON.stringify(entries.map(([name, doors]) => [name, [...doors].sort()]).sort());
}

/** The name a specifier must spell to reach `file` (a directory for an index module). */
function specifierStem(file: string): string {
	const stem = basename(file).replace(/\.ts$/, '');
	return stem === 'index' ? basename(dirname(file)) : stem;
}

/** One fixpoint pass; true when some module's exposure grew. */
function exposurePass(state: CensusState): boolean {
	const stems = [...state.exposure.keys()].map(specifierStem);
	let grew = false;
	for (const [file, source] of state.sources) {
		// Only a module whose text spells a carrier's name can bind to it — which is
		// what keeps this from parsing the whole tree.
		if (file === GUARD || !stems.some((stem) => source.includes(stem))) continue;
		const links = state.links.get(file) ?? parseLinks(file, source);
		state.links.set(file, links);
		// A seeded door module hands out exactly its seed (its own imports still count).
		if (state.seeds[file] !== undefined) continue;
		const next = computeExposure(state, file, links);
		if (exposureKey(next) === exposureKey(state.exposure.get(file))) continue;
		if (next.size > 0) state.exposure.set(file, next);
		grew = true;
	}
	return grew;
}

/** Everything a module binds to: imports, re-exports, and the opaque marker. */
function reachOf(state: CensusState, file: string, links: ModuleLinks): Set<string> {
	const reach = new Set<string>();
	for (const link of [...links.imports, ...links.reexports]) {
		for (const door of exposed(state, file, link.specifier, link.imported)) reach.add(door);
	}
	if (links.opaque) reach.add(OPAQUE);
	return reach;
}

/**
 * file → the raw doors it can reach by BINDING (directly or through any chain
 * of re-exporting modules). Pure over its input, so a synthetic tree can prove
 * what the real one is checked for.
 */
function doorCensus(
	sources: ReadonlyMap<string, string>,
	seeds: Readonly<Record<string, readonly string[]>> = DOOR_SEEDS,
): Map<string, Set<string>> {
	const state: CensusState = { sources, seeds, links: new Map(), exposure: new Map() };
	for (const [file, doors] of Object.entries(seeds)) {
		if (sources.has(file)) state.exposure.set(file, new Map(doors.map((d) => [d, new Set([d])])));
	}
	// Exposure only grows and is bounded by modules × doors, so this terminates.
	while (exposurePass(state)) {
		/* until no carrier's exposure grows */
	}
	const census = new Map<string, Set<string>>();
	for (const [file, links] of state.links) {
		const reach = reachOf(state, file, links);
		if (reach.size > 0) census.set(file, reach);
	}
	return census;
}

function toolViolations(file: string, doors: Set<string>): string[] {
	const allowed = new Set(TOOL_RAW_DOOR_IMPORTERS[file]?.doors ?? []);
	return [...doors]
		.filter((door) => door !== OPAQUE && !allowed.has(door))
		.map(
			(door) =>
				`${file}: a tool holds ${door}. Harvest pages through harvestFetch (${HARVEST_DOOR}); ` +
				'one API call through fetchGuardedText needs a TOOL_RAW_DOOR_IMPORTERS row with its reason',
		);
}

/** Every rule the census enforces, as messages; empty when the tree is clean. */
function doorViolations(census: Map<string, Set<string>>): string[] {
	const found: string[] = [];
	for (const [file, doors] of census) {
		if (doors.has(OPAQUE)) {
			found.push(
				`${file}: names a door module but loads a non-literal import() — the census cannot see what it reaches`,
			);
		}
		if (doors.has('fetchPinnedHop') && PINNED_HOP_IMPORTERS[file] === undefined) {
			found.push(
				`${file}: holds fetchPinnedHop — only the harvest redirect loop may (it owes every per-hop ` +
					`rule the primitive does not apply). Harvest through harvestFetch (${HARVEST_DOOR}).`,
			);
		}
		if (doors.has(FOLLOW_DOOR) && FOLLOW_VETTED_IMPORTERS[file] === undefined) {
			found.push(
				`${file}: holds ${FOLLOW_DOOR} — it follows redirects but owes robots.txt and pacing to ` +
					`its caller's beforeHop. Harvest through harvestFetch (${HARVEST_DOOR}).`,
			);
		}
		if (file.startsWith('tools/')) found.push(...toolViolations(file, doors));
	}
	return found.sort();
}

describe('who holds which door (import-graph census)', () => {
	const scanned = sourceFiles();
	const census = doorCensus(new Map(scanned.map((entry) => [entry.file, entry.code])));

	test('the census finds the holders it is supposed to (anti-vacuity)', () => {
		// A census that resolved nothing would pass every rule below.
		expect([...(census.get('src/core/harvest/follow.ts') ?? [])]).toEqual(['fetchPinnedHop']);
		for (const file of Object.keys(FOLLOW_VETTED_IMPORTERS)) {
			expect([...(census.get(file) ?? [])], file).toEqual([FOLLOW_DOOR]);
		}
		expect(census.get('src/core/tools/translation.ts')?.has('fetchGuardedText')).toBe(true);
		expect(census.get('src/core/tools/transcription_local_asr.ts')?.has('fetchBoundedText')).toBe(
			true,
		);
		expect(census.get('tools/tool_import_rdf/server/index.ts')?.has('fetchGuardedText')).toBe(true);
	});

	test('the pinned hop has one holder, and a tool holds a raw door only by a written reason', () => {
		const violations = doorViolations(census);
		expect(
			violations,
			`engineering/OUTBOUND_SPEC.md names the doors.\n  ${violations.join('\n  ')}`,
		).toEqual([]);
	});

	test('the exemptions may only SHRINK', () => {
		const stale: string[] = [];
		for (const file of Object.keys(PINNED_HOP_IMPORTERS)) {
			if (census.get(file)?.has('fetchPinnedHop') !== true)
				stale.push(`${file}: no longer holds fetchPinnedHop`);
		}
		for (const file of Object.keys(FOLLOW_VETTED_IMPORTERS)) {
			if (census.get(file)?.has(FOLLOW_DOOR) !== true)
				stale.push(`${file}: no longer holds ${FOLLOW_DOOR}`);
		}
		for (const [file, row] of Object.entries(TOOL_RAW_DOOR_IMPORTERS)) {
			const unused = row.doors.filter((door) => census.get(file)?.has(door) !== true);
			if (unused.length > 0)
				stale.push(`${file}: no longer holds ${unused.join(', ')} — narrow or delete the row`);
			expect(row.reason.length, `${file}: an exemption needs a real reason`).toBeGreaterThan(80);
		}
		expect(stale, 'a row for a debt already paid hides that it was paid').toEqual([]);
	});

	test('the census sees through every binding form (synthetic tree)', () => {
		// The rules above are only as good as the census, and a clean real tree
		// cannot show that it would catch anything. So a synthetic tree carries one
		// module per evasion, and each must be caught — or, for the legitimate
		// shapes, must NOT be.
		const up = '../../../src/core';
		const synthetic = new Map<string, string>([
			[
				GUARD,
				'export async function fetchPinnedHop() {}\nexport async function fetchBoundedText() {}\n' +
					'export async function fetchGuardedText() {}\nexport function isPrivateIp() {}',
			],
			// The legitimate shapes.
			[
				'src/core/harvest/follow.ts',
				"import { fetchPinnedHop as hop } from '../security/ssrf_guard.ts';\nexport const followVetted = () => hop;",
			],
			[
				'src/core/harvest/robots.ts',
				"import { followVetted } from './follow.ts';\nexport const load = () => followVetted();",
			],
			// A tool on the redirect loop with a no-op beforeHop: no robots, no pace.
			[
				'tools/tool_follow/server/index.ts',
				`import { followVetted } from '${up}/harvest/follow.ts';\n` +
					'export const go = () => followVetted({}, { beforeHop: async () => undefined });',
			],
			['src/core/x/follow_barrel.ts', "export * from '../harvest/follow.ts';"],
			[
				'tools/tool_follow_barrel/server/index.ts',
				`import { followVetted as f } from '${up}/x/follow_barrel.ts';`,
			],
			[
				'src/core/harvest/harvest.ts',
				"import { followVetted } from './follow.ts';\nexport const harvestFetch = () => followVetted();",
			],
			[
				'tools/tool_clean/server/index.ts',
				`import { harvestFetch } from '${up}/harvest/harvest.ts';\n` +
					`import type { fetchPinnedHop as HopType, PinnedHopRequest } from '${up}/security/ssrf_guard.ts';\n` +
					`import { isPrivateIp, type fetchPinnedHop } from '${up}/security/ssrf_guard.ts';`,
			],
			[
				'tools/tool_import_rdf/server/index.ts',
				`import { fetchGuardedText } from '${up}/security/ssrf_guard.ts';`,
			],
			// The evasions: re-export chains, namespace members, renames, loads.
			[
				'src/core/x/barrel.ts',
				"export { fetchGuardedText as get } from '../security/ssrf_guard.ts';",
			],
			['src/core/x/star.ts', "export * from './barrel.ts';"],
			[
				'src/core/y/alias.ts',
				"import * as guard from '../security/ssrf_guard.ts';\nconst hop = guard['fetchPinnedHop'];\nexport { hop as pull };",
			],
			[
				'src/core/z/second_hop.ts',
				"import { fetchPinnedHop } from '../security/ssrf_guard';\nexport default fetchPinnedHop;",
			],
			[
				'src/core/y/computed.ts',
				"import * as guard from '../security/ssrf_guard.ts';\nconst key = pick();\nexport const any = guard[key];",
			],
			['tools/tool_barrel/server/index.ts', `import { get } from '${up}/x/star.ts';`],
			['tools/tool_computed/server/index.ts', `import { any } from '${up}/y/computed.ts';`],
			['tools/tool_alias/server/index.ts', `import { pull as p } from '${up}/y/alias.ts';`],
			['tools/tool_default/server/index.ts', `import anything from '${up}/z/second_hop.ts';`],
			[
				'tools/tool_dynamic/server/index.ts',
				`export async function go() { return (await import('${up}/security/ssrf_guard.ts')).fetchBoundedText; }`,
			],
			['tools/tool_require/server/index.ts', `import m = require('${up}/security/ssrf_guard.ts');`],
			[
				'tools/tool_opaque/server/index.ts',
				`const which = 'ssrf_guard';\nexport const go = () => import(\`${up}/security/\${which}.ts\`);`,
			],
		]);
		const synth = doorCensus(synthetic);
		const doorsOf = (file: string): string[] => [...(synth.get(file) ?? [])].sort();
		expect(doorsOf('tools/tool_clean/server/index.ts')).toEqual([]);
		expect(doorsOf('tools/tool_barrel/server/index.ts')).toEqual(['fetchGuardedText']);
		expect(doorsOf('tools/tool_alias/server/index.ts')).toEqual(['fetchPinnedHop']);
		expect(doorsOf('tools/tool_default/server/index.ts')).toEqual(['fetchPinnedHop']);
		// A key the scanner cannot read is every key.
		expect(doorsOf('tools/tool_computed/server/index.ts')).toEqual([...RAW_DOORS].sort());
		expect(doorsOf('tools/tool_dynamic/server/index.ts')).toEqual([...RAW_DOORS].sort());
		expect(doorsOf('tools/tool_require/server/index.ts')).toEqual([...RAW_DOORS].sort());
		expect(doorsOf('tools/tool_opaque/server/index.ts')).toEqual([OPAQUE]);
		expect(doorsOf('tools/tool_follow/server/index.ts')).toEqual([FOLLOW_DOOR]);
		expect(doorsOf('tools/tool_follow_barrel/server/index.ts')).toEqual([FOLLOW_DOOR]);
		expect(doorsOf('src/core/harvest/harvest.ts')).toEqual([FOLLOW_DOOR]);
		expect(doorsOf('src/core/harvest/follow.ts')).toEqual(['fetchPinnedHop']);

		const violators = [...new Set(doorViolations(synth).map((line) => line.split(':')[0]))].sort();
		expect(violators).toEqual(
			[
				'src/core/x/follow_barrel.ts',
				'src/core/y/alias.ts',
				'src/core/y/computed.ts',
				'src/core/z/second_hop.ts',
				'tools/tool_alias/server/index.ts',
				'tools/tool_follow/server/index.ts',
				'tools/tool_follow_barrel/server/index.ts',
				'tools/tool_barrel/server/index.ts',
				'tools/tool_computed/server/index.ts',
				'tools/tool_default/server/index.ts',
				'tools/tool_dynamic/server/index.ts',
				'tools/tool_opaque/server/index.ts',
				'tools/tool_require/server/index.ts',
			].sort(),
		);
	});
});

// ---------------------------------------------------------------------------
// WHAT A DOOR'S HOLDER SAYS, AND WHO READS THE GUARD'S REASONS.
//
// The guard's own `Error.message` names the address it refused (`… resolves to a
// private/reserved address (::1)`): right for the log, an internal-network oracle
// on the wire. So a TOOL that holds any outbound door — a raw one or
// `harvestFetch` — reports a failure as `toErrorBody(toDedaloError(error))` and
// reads no error's `.message` at all (docs/development/tools/security.md item 7).
// And the address-vs-shape split of the guard's refusals is ONE table
// (`SSRF_REFUSAL_KINDS`) read through ONE predicate (`isAddressRefusal`): a module
// spelling an address reason itself is a private copy of that table, which drifts
// the day the guard learns a new reason.
// ---------------------------------------------------------------------------

/** Every door a tool may hold, the harvesting door included. */
const OUTBOUND_DOOR_SEEDS: Record<string, readonly string[]> = {
	...DOOR_SEEDS,
	[HARVEST_DOOR]: ['harvestFetch'],
};

/**
 * `.message` read off a value. Read in code with LITERALS KEPT: a template literal's
 * `${(error as Error).message}` is the commonest read, and blanking literals blanks
 * it too (measured: the census went green over tool_import_rdf that way).
 */
const MESSAGE_READ = /\.message\b/;

/** Tools that hold an outbound door (by binding) and read an error's `.message`. */
function messageDisclosures(code: ReadonlyMap<string, string>): string[] {
	const holders = doorCensus(code, OUTBOUND_DOOR_SEEDS);
	return [...holders.keys()]
		.filter((file) => file.startsWith('tools/') && MESSAGE_READ.test(code.get(file) ?? ''))
		.sort();
}

/** The guard's ADDRESS reasons, from its own table. */
const ADDRESS_REASONS = Object.entries(SSRF_REFUSAL_KINDS)
	.filter(([, kind]) => kind === 'address')
	.map(([reason]) => reason);

/** Modules other than the guard that spell an address reason as a string literal. */
function reasonCopies(files: readonly { file: string; code: string }[]): string[] {
	const spelled = new RegExp(`(['"\`])(?:${ADDRESS_REASONS.join('|')})\\1`);
	return files
		.filter((entry) => entry.file !== GUARD && spelled.test(entry.code))
		.map((entry) => entry.file)
		.sort();
}

describe('a door holder discloses no address, and reads no reason of its own', () => {
	const scanned = sourceFiles();
	const code = new Map(scanned.map((entry) => [entry.file, entry.code]));

	test('a tool holding an outbound door never reads an error’s .message', () => {
		const found = messageDisclosures(code);
		expect(
			found,
			'report a failure as toErrorBody(toDedaloError(error)) — the guard’s message names ' +
				`the refused address:\n  ${found.join('\n  ')}`,
		).toEqual([]);
	});

	test('the disclosure census sees a door holder and a harvester (synthetic tree)', () => {
		const up = '../../../src/core';
		const synthetic = new Map<string, string>([
			[GUARD, 'export async function fetchGuardedText() {}'],
			[HARVEST_DOOR, 'export async function harvestFetch() {}'],
			[
				'tools/tool_a/server/index.ts',
				`import { fetchGuardedText } from '${up}/security/ssrf_guard.ts';\ntry { await fetchGuardedText(u) } catch (e) { out.push((e as Error).message) }`,
			],
			[
				'tools/tool_b/server/index.ts',
				[
					`import { harvestFetch as h } from '${up}/harvest/harvest.ts';`,
					// The read inside a template literal — the shape tool_import_rdf had.
					'try { await h(u) } catch (err) { out.push(`${u}: ${err.message}`) }',
				].join('\n'),
			],
			[
				'tools/tool_c/server/index.ts',
				`import { toErrorBody } from '${up}/errors/index.ts';\nconst m = error.message;`,
			],
			[
				'tools/tool_d/server/index.ts',
				`import { harvestFetch } from '${up}/harvest/harvest.ts';\ntry { await harvestFetch(u) } catch (e) { out.push(toErrorBody(toDedaloError(e))) }`,
			],
		]);
		expect(messageDisclosures(synthetic)).toEqual([
			'tools/tool_a/server/index.ts',
			'tools/tool_b/server/index.ts',
		]);
	});

	test('no module but the guard spells an address reason (read them with isAddressRefusal)', () => {
		expect(ADDRESS_REASONS.length).toBeGreaterThan(4); // the table is read, not empty
		const guard = scanned.find((entry) => entry.file === GUARD);
		expect(reasonCopies(guard === undefined ? [] : [{ ...guard, file: 'x.ts' }])).toEqual(['x.ts']);
		expect(
			reasonCopies([
				{ file: 'copy.ts', code: "if (error.coordinates?.reason === 'dns_failed') throw error;" },
				{ file: 'fine.ts', code: "if (isAddressRefusal(error)) throw error; const r = 'dns';" },
			]),
		).toEqual(['copy.ts']);
		expect(reasonCopies(scanned)).toEqual([]);
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
