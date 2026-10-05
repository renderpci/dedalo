/**
 * THE PAIRED PRIVATE AGENT CHANNEL HAS ONE DOOR, AND IT STAYS SHUT (2026-10-03;
 * engineering/OUTBOUND_SPEC.md §2.1, engineering/PUBLICATION_HOST_SPEC.md §2).
 *
 * The publication agent runs pushed code (`release.install`) and reloads a public web
 * server, so whatever can dial it can change what an institution publishes. The engine
 * dials it through ONE module, `src/core/publication_host/transport.ts`, and this gate
 * holds what a socket census cannot see:
 *
 *   1. ONLY THE DOOR LOADS AN AGENT'S TLS MATERIAL. `readHostTls` is taken from the secrets
 *      module by the door alone — followed by BINDING (named, renamed, namespace, default,
 *      `export … from`, `export *`, literal `import()` / `require()`), never by spelling.
 *      Without the client key a second dialler cannot complete the handshake.
 *   2. ONLY THE DOOR SPELLS THE AGENT'S BASE PATH. A second literal `/publication/host_agent`
 *      is a second URL builder, the first step of a second door.
 *   3. TLS VERIFICATION IS NEVER RELAXED. `rejectUnauthorized` appears in the door only, and
 *      only as `true` — LOAD-BEARING, not decoration: measured on Bun 1.4.2, the explicit
 *      `true` is what keeps a rogue agent refused when NODE_TLS_REJECT_UNAUTHORIZED=0 is in
 *      the environment (the native gate drives it). `checkServerIdentity` appears nowhere.
 *   4. THE DOOR'S SHAPE (Babel AST): exactly one `fetch(` call, on `target.url`, with
 *      `redirect: 'manual'` and a `signal`; `rejectUnauthorized: true` as a boolean
 *      literal; the shared capped reader imported from the guard and called; `agentRequest`
 *      reads the TLS material itself and dials through `dialAgent`.
 *   5. THE DOOR IS REGISTERED where the outbound gates and the spec look for it.
 *   6. THE DOOR IS DOCUMENTED ONCE, AND THE DOCS ARE HELD TO CODE (appended blocks, phase-3
 *      Task 10): OUTBOUND_SPEC's door count equals its §2 table, §2.1 and the §6 row exist
 *      once, §2.1 names every `unreachable` reason the door mints, §5 names the door
 *      module; every path a PUBLICATION_HOST_SPEC §8 "Built" row
 *      names exists; the operator page pairs with the CLI's verbs, flags and invoking user.
 *
 * The behaviour is driven in publication_host_transport_native; who may HOLD the door is
 * the import-graph census in ssrf_one_guard_tripwire.
 *
 * Honest limits: it scans the engine (`src/`, `tools/`), not `scripts/` — the operator CLI
 * and the drills there are reviewed where they are written; a non-literal `import()` of the
 * secrets module is not followed; and it proves no secret reaches a PAYLOAD only for the
 * door's failures (the native gate) — a widget's payload is pinned by the widget's own gate.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname, join as joinPosix, normalize as normalizePosix } from 'node:path/posix';
import { parse } from '@babel/parser';
import { shippedTextFiles } from '../helpers/shipped_text_corpus.ts';
import { stripComments } from '../helpers/strip_comments.ts';
import { writePathSourceFiles } from '../helpers/write_path_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const DOOR = 'src/core/publication_host/transport.ts';
const SECRETS = 'src/core/publication_host/secrets.ts';
const GUARD = 'src/core/security/ssrf_guard.ts';
const TLS_LOADER = 'readHostTls';
/** The agent's base path at the START of a literal (a filesystem path ending in it is not a URL). */
const BASE_PATH_LITERAL = /['"`]\/publication\/host_agent(?=[/'"`])/;

type AstNode = { type: string; [key: string]: unknown };

const NOT_CODE_KEYS = new Set([
	'loc',
	'extra',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);

function read(rel: string): string {
	return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/**
 * Non-test TypeScript under the engine's two trees, walked from disk (unstaged files
 * included) by the SHARED write-path lister (census_derivation_tripwire: no private walk
 * root), narrowed to `src/` + `tools/` — `scripts/` is the honest limit above.
 */
function engineFiles(): string[] {
	return writePathSourceFiles().filter(
		(file) => /^(src|tools)\//.test(file) && !file.endsWith('.d.ts'),
	);
}

function parseProgram(source: string): AstNode {
	const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'decorators-legacy'] });
	return ast.program as unknown as AstNode;
}

function visit(root: unknown, fn: (node: AstNode) => void): void {
	if (Array.isArray(root)) {
		for (const child of root) visit(child, fn);
		return;
	}
	if (root === null || typeof root !== 'object') return;
	fn(root as AstNode);
	for (const [key, child] of Object.entries(root)) {
		if (!NOT_CODE_KEYS.has(key) && typeof child === 'object') visit(child, fn);
	}
}

function nameOf(node: unknown): string {
	const named = node as { name?: string; value?: string } | undefined;
	return named?.name ?? named?.value ?? '';
}

/** The repo file a relative specifier names (`.ts` assumed when it carries no extension). */
function resolveSpecifier(file: string, specifier: unknown): string | null {
	if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
	const joined = normalizePosix(joinPosix(dirname(file), specifier));
	return /\.[cm]?[jt]s$/.test(joined) ? joined : `${joined}.ts`;
}

/** `import('x')` / `require('x')` with a literal argument: its specifier, else null. */
function loaderSpecifier(node: AstNode): string | null {
	// Babel spells a dynamic import either way, depending on its options and version.
	if (node.type === 'ImportExpression') return literalValue(node.source);
	if (node.type !== 'CallExpression') return null;
	const callee = node.callee as AstNode;
	const isLoader =
		callee.type === 'Import' || (callee.type === 'Identifier' && callee.name === 'require');
	return isLoader ? literalValue((node.arguments as AstNode[])[0]) : null;
}

function literalValue(node: unknown): string | null {
	const literal = node as AstNode | undefined;
	return literal?.type === 'StringLiteral' ? (literal.value as string) : null;
}

/** The bindings an import / re-export statement takes from its module ('*' = all of it). */
function bindingsOf(node: AstNode): string[] {
	if (node.type === 'ExportAllDeclaration') return ['*'];
	const specifiers = (node.specifiers ?? []) as AstNode[];
	return specifiers
		.filter((s) => s.importKind !== 'type' && s.exportKind !== 'type')
		.map((s) => {
			if (s.type === 'ImportSpecifier') return nameOf(s.imported);
			if (s.type === 'ExportSpecifier') return nameOf(s.local);
			return '*'; // namespace or default: the whole module
		});
}

const MODULE_STATEMENTS = new Set([
	'ImportDeclaration',
	'ExportNamedDeclaration',
	'ExportAllDeclaration',
]);

/** What `file` takes from `module`, by binding. */
function takenFrom(file: string, source: string, module: string): string[] {
	const taken: string[] = [];
	visit(parseProgram(source), (node) => {
		const typeOnly = node.importKind === 'type' || node.exportKind === 'type';
		const specifier = (node.source as AstNode | null | undefined)?.value;
		if (
			MODULE_STATEMENTS.has(node.type) &&
			!typeOnly &&
			resolveSpecifier(file, specifier) === module
		) {
			taken.push(...bindingsOf(node));
		}
		if (resolveSpecifier(file, loaderSpecifier(node)) === module) taken.push('*');
		const reference = (node.moduleReference as AstNode | undefined)?.expression as
			| AstNode
			| undefined;
		if (
			node.type === 'TSImportEqualsDeclaration' &&
			resolveSpecifier(file, reference?.value) === module
		) {
			taken.push('*');
		}
	});
	return taken;
}

function loadsTlsMaterial(file: string, source: string): boolean {
	const taken = takenFrom(file, source, SECRETS);
	return taken.includes(TLS_LOADER) || taken.includes('*');
}

/** Engine files (code, comments stripped, literals KEPT) matching `pattern`. */
function filesMatching(pattern: RegExp): string[] {
	return engineFiles().filter((file) => pattern.test(stripComments(read(file))));
}

describe('the scanners see what they claim (synthetic sources)', () => {
	const at = 'src/core/area_maintenance/widgets/x.ts';
	const spec = "'../../publication_host/secrets.ts'";
	const cases: Array<[string, string, boolean]> = [
		['named', `import { readHostTls } from ${spec};`, true],
		['renamed', `import { readHostTls as r } from ${spec};`, true],
		['namespace', `import * as s from ${spec};`, true],
		['default', `import s from ${spec};`, true],
		['no extension', "import { readHostTls } from '../../publication_host/secrets';", true],
		['re-export', `export { readHostTls } from ${spec};`, true],
		['export star', `export * from ${spec};`, true],
		['export star as', `export * as s from ${spec};`, true],
		['dynamic import', `const s = await import(${spec});`, true],
		['require', `const s = require(${spec});`, true],
		['import equals', `import s = require(${spec});`, true],
		['another binding only', `import { secretPresence } from ${spec};`, false],
		['type only', `import type { HostTls } from ${spec};`, false],
		['type specifier', `import { type HostTls } from ${spec};`, false],
		['another module', "import { readHostTls } from './secrets.ts';", false],
	];
	for (const [name, source, expected] of cases) {
		test(`TLS material census: ${name}`, () => {
			expect(loadsTlsMaterial(at, source)).toBe(expected);
		});
	}

	test('the base-path literal matches a URL path, not a filesystem path', () => {
		expect(BASE_PATH_LITERAL.test("const p = '/publication/host_agent';")).toBe(true);
		expect(BASE_PATH_LITERAL.test('const u = `/publication/host_agent/health`;')).toBe(true);
		expect(BASE_PATH_LITERAL.test("const d = '../publication/host_agent/package.json';")).toBe(
			false,
		);
		expect(BASE_PATH_LITERAL.test("const d = '/publication/host_agents';")).toBe(false);
	});
});

describe('one door to the publication agent', () => {
	test('the scan sees the tree (anti-vacuity)', () => {
		const files = engineFiles();
		expect(files.length).toBeGreaterThan(500);
		expect(files).toContain(DOOR);
		expect(files).toContain(SECRETS);
	});

	test('only the door loads an agent’s TLS material', () => {
		const holders = engineFiles().filter(
			(file) => file !== SECRETS && loadsTlsMaterial(file, read(file)),
		);
		expect(
			holders,
			`only ${DOOR} may take ${TLS_LOADER} from ${SECRETS} — dial through agentRequest`,
		).toEqual([DOOR]);
	});

	test('only the door spells the agent’s base path', () => {
		expect(
			filesMatching(BASE_PATH_LITERAL),
			`a second agent URL builder — import AGENT_BASE_PATH from ${DOOR}`,
		).toEqual([DOOR]);
	});

	test('TLS verification is never relaxed', () => {
		expect(filesMatching(/\brejectUnauthorized\b/)).toEqual([DOOR]);
		const door = stripComments(read(DOOR));
		// The value AND its type annotation: every spelling must say `true`.
		const all = [...door.matchAll(/\brejectUnauthorized\b\s*:\s*(\w+)/g)].map((m) => m[1]);
		expect(all.length).toBeGreaterThan(0);
		expect(all, 'rejectUnauthorized spelled as anything but true').toEqual(all.map(() => 'true'));
		expect(filesMatching(/\bcheckServerIdentity\b/)).toEqual([]);
	});
});

describe('the door’s shape (AST)', () => {
	const program = parseProgram(read(DOOR));

	function calls(name: string, root: unknown = program): AstNode[] {
		const found: AstNode[] = [];
		visit(root, (node) => {
			if (node.type === 'CallExpression' && nameOf(node.callee) === name) found.push(node);
		});
		return found;
	}

	function topLevelFunction(name: string): AstNode {
		let found: AstNode | undefined;
		for (const statement of program.body as AstNode[]) {
			const declaration = (statement.declaration as AstNode | undefined) ?? statement;
			if (declaration.type === 'FunctionDeclaration' && nameOf(declaration.id) === name)
				found = declaration;
		}
		expect(found, `${DOOR} no longer defines ${name}`).toBeDefined();
		return found as AstNode;
	}

	function property(object: AstNode, key: string): AstNode | undefined {
		return (object.properties as AstNode[]).find(
			(p) => p.type === 'ObjectProperty' && nameOf(p.key) === key,
		);
	}

	test('exactly one fetch call, on target.url, redirect manual, a signal armed', () => {
		const members: string[] = [];
		visit(program, (node) => {
			const callee = node.callee as AstNode | undefined;
			if (
				node.type === 'CallExpression' &&
				callee?.type === 'MemberExpression' &&
				nameOf(callee.property) === 'fetch'
			) {
				members.push('member fetch');
			}
		});
		expect(members, 'a member-spelled fetch is a second call').toEqual([]);
		const sites = calls('fetch');
		expect(sites.length).toBe(1);
		const [url, init] = (sites[0] as AstNode).arguments as AstNode[];
		expect(url?.type).toBe('MemberExpression');
		expect(`${nameOf(url?.object)}.${nameOf(url?.property)}`).toBe('target.url');
		expect(init?.type).toBe('ObjectExpression');
		const redirect = property(init as AstNode, 'redirect')?.value as AstNode | undefined;
		expect(redirect?.type === 'StringLiteral' ? redirect.value : '<missing>').toBe('manual');
		expect(property(init as AstNode, 'signal'), 'no signal on the call').toBeDefined();
		expect(
			property(init as AstNode, 'proxy'),
			'a proxy option on the private channel',
		).toBeUndefined();
	});

	test('rejectUnauthorized is the boolean literal true', () => {
		const values: string[] = [];
		visit(program, (node) => {
			if (node.type === 'ObjectProperty' && nameOf(node.key) === 'rejectUnauthorized') {
				const value = node.value as AstNode;
				values.push(value.type === 'BooleanLiteral' ? String(value.value) : value.type);
			}
		});
		expect(values).toEqual(['true']);
	});

	test('the body is read through the guard’s shared capped reader', () => {
		const imported = new Map<string, string>();
		for (const statement of program.body as AstNode[]) {
			if (statement.type !== 'ImportDeclaration') continue;
			if (resolveSpecifier(DOOR, (statement.source as AstNode).value) !== GUARD) continue;
			for (const s of statement.specifiers as AstNode[])
				imported.set(nameOf(s.local), nameOf(s.imported));
		}
		const local = [...imported].find(([, original]) => original === 'readBytesCapped')?.[0];
		expect(local, 'readBytesCapped is not imported from the guard').toBeDefined();
		expect(calls(local as string).length).toBeGreaterThanOrEqual(1);
	});

	test('agentRequest reads the TLS material itself and dials through dialAgent', () => {
		const door = topLevelFunction('agentRequest');
		expect(calls(TLS_LOADER, door).length).toBe(1);
		expect(calls('dialAgent', door).length).toBe(1);
		expect(calls('agentTarget', topLevelFunction('dialAgent')).length).toBe(1);
	});
});

describe('the door is registered where the outbound gates look', () => {
	test('OUTBOUND_SPEC names it as the fourth door', () => {
		const spec = read('engineering/OUTBOUND_SPEC.md');
		expect(spec).toContain(DOOR);
		expect(spec).toContain('FOUR outbound doors');
		expect(spec).not.toContain('THREE outbound doors');
		expect(spec).toContain('### 2.1 The paired private agent channel');
	});

	test('both outbound tripwires carry its rows', () => {
		const ssrf = read('test/unit/ssrf_one_guard_tripwire.test.ts');
		expect(ssrf).toContain(`const AGENT_CHANNEL = '${DOOR}';`);
		expect(ssrf).toContain('[AGENT_CHANNEL]: AGENT_CHANNEL_DOORS');
		const outbound = read('test/unit/outbound_fetch_tripwire.test.ts');
		expect(outbound.split(`'${DOOR}':`).length - 1, 'BOUNDED_BY + ADDRESS_POLICY').toBe(2);
	});

	test('this gate is indexed', () => {
		expect(read('engineering/TRIPWIRES.md')).toContain(
			'| test/unit/publication_host_door_tripwire.test.ts |',
		);
	});
});

// ─── THE DOOR IS DOCUMENTED ONCE, WHERE IT IS READ ─────────────────────────────
// The fourth door is stated in prose in two specs. A rule stated in a document needs a
// gate (DEC-12), so each statement is held to something countable: the rule sentence's
// door count to the §2 table, §2.1 and the §6 row to ONE copy each, §5 to the door module,
// and the publication-host spec's "Built" rows to files that exist.

const DOCS_GATE_ROOT = `${import.meta.dir}/../..`;
const DOOR_TRIPWIRE_ROW = '| `test/unit/publication_host_door_tripwire.test.ts` |';

async function docsGateRead(rel: string): Promise<string> {
	const file = Bun.file(`${DOCS_GATE_ROOT}/${rel}`);
	if (!(await file.exists()))
		throw new Error(`${rel}: missing — the door's documentation has nowhere to live`);
	return file.text();
}

async function docsGatePathExists(rel: string): Promise<boolean> {
	try {
		await Bun.file(`${DOCS_GATE_ROOT}/${rel}`).stat(); // stat: directories count too
		return true;
	} catch {
		return false;
	}
}

function docsGateSection(text: string, heading: string): string {
	const start = text.indexOf(`\n## ${heading}`);
	if (start === -1) throw new Error(`no "## ${heading}" heading`);
	const end = text.indexOf('\n## ', start + 1);
	return text.slice(start, end === -1 ? undefined : end);
}

function docsGateCount(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

const DOOR_COUNT_WORDS: Record<string, number> = { THREE: 3, FOUR: 4, FIVE: 5, SIX: 6 };

describe('the agent channel door is documented once, where it is read', () => {
	test('OUTBOUND_SPEC: the door count in the rule sentence equals the §2 table rows', async () => {
		const spec = await docsGateRead('engineering/OUTBOUND_SPEC.md');
		const word = /the engine has ([A-Z]+) outbound doors/.exec(spec)?.[1] ?? '';
		const lines = docsGateSection(spec, '2.').split('\n');
		const header = lines.findIndex((l) => l.startsWith('| Door |'));
		expect(header).toBeGreaterThan(-1);
		const rows: string[] = [];
		for (const line of lines.slice(header + 2)) {
			if (!line.startsWith('|')) break;
			rows.push(line);
		}
		expect(DOOR_COUNT_WORDS[word]).toBe(rows.length);
		expect(rows.filter((r) => r.includes('src/core/publication_host/transport.ts')).length).toBe(1);
	});

	test('OUTBOUND_SPEC: §2.1 and the door-tripwire §6 row exist ONCE; the row claims only what the gate checks', async () => {
		const spec = await docsGateRead('engineering/OUTBOUND_SPEC.md');
		expect(docsGateCount(spec, '### 2.1 The paired private agent channel')).toBe(1);
		const gates = docsGateSection(spec, '6.');
		expect(docsGateCount(gates, DOOR_TRIPWIRE_ROW)).toBe(1);
		const row = gates.split('\n').find((l) => l.startsWith(DOOR_TRIPWIRE_ROW)) ?? '';
		// A payload's secrets are the widget gate's (publication_host_widget_native), not this file's.
		expect(row).not.toMatch(/payload/i);
		expect(row).toContain('§8');
	});

	test('OUTBOUND_SPEC §2.1 names every `unreachable` reason the door mints (socket_perms included)', async () => {
		const source = read('src/core/publication_host/transport.ts');
		const reasons = new Set<string>();
		for (const chunk of source.split('failure(').slice(1)) {
			if (!chunk.trimStart().startsWith("'publication_host.unreachable'")) continue;
			const literal = /reason:\s*'(\w+)'/.exec(chunk.slice(0, 200))?.[1];
			if (literal !== undefined) reasons.add(literal);
		}
		for (const m of source.matchAll(/function transportReason[\s\S]*?\? '(\w+)' : '(\w+)'/g)) {
			reasons.add(m[1] as string);
			reasons.add(m[2] as string);
		}
		// anti-vacuity: transport, tls, redirect, socket_perms at least
		expect(reasons.size).toBeGreaterThanOrEqual(4);
		const spec = await docsGateRead('engineering/OUTBOUND_SPEC.md');
		const section = spec.slice(spec.indexOf('### 2.1 '), spec.indexOf('\n## 3.'));
		const missing = [...reasons].filter((r) => !section.includes(`\`${r}\``));
		expect(missing).toEqual([]);
		expect(section).toContain('assertSocketSafe');
	});

	test('OUTBOUND_SPEC: §5 says the channel is a door, naming the door module', async () => {
		const spec = await docsGateRead('engineering/OUTBOUND_SPEC.md');
		expect(docsGateSection(spec, '5.')).toContain('`src/core/publication_host/transport.ts`');
	});

	test('PUBLICATION_HOST_SPEC §8: phase 3 is Built and every repo path a Built row names exists', async () => {
		const phases = docsGateSection(
			await docsGateRead('engineering/PUBLICATION_HOST_SPEC.md'),
			'8.',
		).split('\n');
		expect(phases.find((l) => l.startsWith('| 3 |')) ?? '').toContain('**Built:**');
		const missing: string[] = [];
		for (const row of phases.filter((l) => l.includes('**Built:**'))) {
			for (const m of row.matchAll(
				/`((?:src|scripts|test|client|engineering|docs|publication)\/[^`\s]*)`/g,
			)) {
				const rel = (m[1] ?? '').replace(/\/$/, '');
				if (!(await docsGatePathExists(rel))) missing.push(rel);
			}
		}
		expect(missing).toEqual([]);
	});
});

/**
 * The invocation the CLI's own usage and owner rule name (Task 5: invocationOwnerProblem):
 * the package script, run as the engine user. The page uses it verbatim.
 */
const PAIR_INVOCATION = 'sudo -u <engine user> bun run dedalo:pair-publication-host ';
const PAIR_SCRIPT = 'dedalo:pair-publication-host';
const PAIR_LINE = /publication_host_pair\.ts |dedalo:pair-publication-host /;

describe('the operator is told how pairing and the panel really work', () => {
	test('the operator page pairs through the real CLI: its verbs, its flags, its invoking user', async () => {
		const page = await docsGateRead('docs/install/publication_host.md');
		const cli = await docsGateRead('scripts/publication_host_pair.ts');
		expect(
			cli,
			'the CLI no longer names the engine-user invocation: re-read its owner rule',
		).toContain(PAIR_INVOCATION.trim());
		const scripts = JSON.parse(await docsGateRead('package.json')).scripts as Record<
			string,
			string
		>;
		expect(scripts[PAIR_SCRIPT]).toBe('bun run scripts/publication_host_pair.ts');
		// The flags are the keys of the CLI's parseArgs `options` block — nothing else.
		const optionsBlock = /\boptions: \{\n([\s\S]*?)\n\t*\},/.exec(cli)?.[1] ?? '';
		const cliFlags = new Set(
			[...optionsBlock.matchAll(/^\s*'?([a-z][a-z-]*)'?: \{/gm)].map((m) => m[1] ?? ''),
		);
		expect([...cliFlags].sort()).toEqual([
			'bundle',
			'dry-run',
			'fragment',
			'token-file',
			'token-stdin',
		]);
		const lines = page.split('\n').filter((l) => PAIR_LINE.test(l));
		expect(lines.length).toBeGreaterThanOrEqual(4);
		const unknown: string[] = [];
		for (const line of lines) {
			if (!line.includes(PAIR_INVOCATION))
				unknown.push(`not run as the engine user: ${line.trim()}`);
			const verb =
				/(?:publication_host_pair\.ts|dedalo:pair-publication-host) ([a-z]+|…)/.exec(line)?.[1] ??
				'';
			if (verb !== '…' && !cli.includes(`'${verb}'`)) unknown.push(`verb ${verb}`);
			for (const m of line.matchAll(/ (--[a-z][a-z-]*)/g)) {
				const flag = m[1] ?? '';
				if (!cliFlags.has(flag.slice(2))) unknown.push(`flag ${flag}`);
			}
		}
		expect(unknown).toEqual([]);
	});

	test('no reader is told to pair as root (the CLI refuses any uid that does not own <private>)', async () => {
		const asRoot = /\*\*Pair\*\*,? as root|pair[^.\n]{0,60}\bas root\b/i;
		const page = await docsGateRead('docs/install/publication_host.md');
		expect(asRoot.test(docsGateSection(page, 'Pair it with the work system'))).toBe(false);
		expect(asRoot.test(await docsGateRead('docs/change_log.md'))).toBe(false);
		expect(await docsGateRead('publication/host_agent/README.md')).not.toContain('root-run');
	});

	test('in-product text points at the documented pair command, as the engine user', async () => {
		const documented = 'sudo -u <engine user> bun run dedalo:pair-publication-host';
		// the translated catalogs, from the registered shipped-text lister (no private walk)
		const catalogs = shippedTextFiles().filter((file) =>
			/^src\/core\/labels\/catalog\/lg-[^/]+\.json$/.test(file),
		);
		const sources = [
			'src/core/labels/master.json',
			...catalogs,
			'client/dedalo/core/area_maintenance/widgets/publication_hosts/js/render_publication_hosts.js',
		];
		let pointers = 0;
		for (const rel of sources) {
			const text = await docsGateRead(rel);
			// the raw script path is not what an operator runs (and run as root it is refused)
			expect(text.includes('scripts/publication_host_pair.ts'), rel).toBe(false);
			if (text.includes(documented)) pointers += 1;
		}
		// master + the client fallback + every translated catalog (anti-vacuity)
		expect(pointers).toBeGreaterThanOrEqual(19);
		const widget = await docsGateRead('src/core/area_maintenance/widgets/publication_hosts.ts');
		const refusal = /function refuseUnknownHost[\s\S]*?\n}/.exec(widget)?.[0] ?? '';
		expect(refusal).toContain(documented);
		expect(refusal).not.toContain('scripts/publication_host_pair.ts');
	});

	test('busy names BOTH causes: the agent, and the work host registry lock (wire.ts registryError)', async () => {
		const wire = await docsGateRead('src/core/publication_host/wire.ts');
		expect(wire).toContain("reason === 'locked' ? 'publication_host.busy'");
		const page = await docsGateRead('docs/install/publication_host.md');
		const row = page.split('\n').find((l) => l.startsWith('| busy |')) ?? '';
		expect(row).toContain('on the work system');
		const spec = await docsGateRead('engineering/PUBLICATION_HOST_SPEC.md');
		expect(spec).toMatch(/`busy` \(an agent 409, OR the work host's own registry lock/);
	});

	test('no reader is still told the panel comes later', async () => {
		const stale =
			/panel learns to[\s\S]{0,80}?later\s+release|the panel are phase 3|later pairing settings/;
		for (const rel of [
			'docs/install/publication_host.md',
			'publication/host_agent/README.md',
			'docs/change_log.md',
		]) {
			expect(stale.test(await docsGateRead(rel)), rel).toBe(false);
		}
	});
});
