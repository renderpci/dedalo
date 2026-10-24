/**
 * THE TARGET-LOCK CENSUS — every door that writes a publication target takes
 * the target lock, or is an enumerated, reasoned exemption (DIFF-2,
 * WC-2026-09-30-diffusion-target-fence; closure review cross-diffusion:r3).
 *
 * THE INVARIANT. A publication target — a MariaDB database, a files directory,
 * the media marker store's `dbs/<db>` subtree and its `pub/` union — is written
 * by ONE fenced unit at a time: the runner's batch (`withFencedBatch`), the
 * record-delete executor and core's files unlink (`withDeleteDoorLock`), the
 * ghost unpublish, the lang sweep, the media-index apply and rebuild
 * (`withTargetLock` / `withTargetLocks`). A seventh door that opens the target
 * pool or unlinks under the files root WITHOUT the lock interleaves with a live
 * runner's ALTER / INSERT / rename — exactly the corruption DIFF-2 closed.
 *
 * WHY A CENSUS AND NOT A LIST. diffusion_target_fence_native and
 * diffusion_operator_fence_budget_native prove the doors that exist today; they
 * import them by name, so they cannot see the next one. This census is TOTAL
 * and DERIVED over the shared write-path corpus (src/ + tools/ + scripts/,
 * test/helpers/write_path_corpus.ts): it parses every module (babel, the same
 * parser the complexity ratchet uses), finds every reference to a TARGET SINK,
 * and walks the call graph outward until each reference is either
 *   - LEXICALLY INSIDE the argument list of a lock door (the seeds, plus every
 *     wrapper DERIVED from them: a function handing its own callback parameter to
 *     a door — the runner's `fenced`, the lang sweep's `fenceDatabase`, the
 *     rebuild's `underDatabaseFence` — and a local alias of one), or
 *   - held by a function the walk continues from (its callers are judged the
 *     same way), or
 *   - an entry in the shrink-only EXEMPT map, with its reason.
 * A reference at module top level, or a function nothing fenced calls (an entry
 * point: an API handler, a script), is an OFFENDER.
 *
 * THE SINKS (derived, never a hand list of doors):
 *   - `getTargetPool` (targets/mariadb/db.ts): the writable MariaDB pool;
 *   - every fs MUTATOR call (unlink, rename, write, mkdir, rm, open, the durable
 *     helpers…) in a TARGET-ROOT MODULE — a module where a target root resolver
 *     is visible: `diffusionFilesRoot` (the files targets), media_index's
 *     `markerStoreBase` (the marker store), and every function DERIVED from
 *     them by returning a path built on one (files.ts `formatTargetDir`, …);
 *   - the media-copy agent's mutators (`hostMediaPut/Delete/Mark`), so a direct
 *     caller outside the media-copy door's own protocol is caught.
 * Methods are followed by name through their module and its importers; the
 * WRITER SESSION seam (writers/types.ts WriterSession + DiffusionWriter, member
 * names DERIVED from the interfaces) is followed to the modules that hold a
 * writer from the registry — so a writer method reached outside the runner's
 * fenced unit is an offender too.
 *
 * HONEST LIMITS. Lexical, not data flow: a target PATH resolved outside the
 * lock and written inside it is judged where the write is (that is correct);
 * a function smuggled through a value (`const f = session.writeRows`) or a
 * computed member is invisible (method references count only in call
 * position); a DI seam (`dependencies.fenceDatabase ?? fenceDatabase`) is
 * judged by its default. Name resolution is by import (relative specifiers,
 * re-exports, `await import()` destructuring); a same-named local shadow only
 * ADDS references, which is the conservative side.
 *
 * ANTI-VACUITY. Corpus floor, sink-site floor, fenced-site floor; the lock
 * seeds and sinks must still be DEFINED where the census looks (a rename is red,
 * not a silent zero); the doors the header of target_lock.ts names must each be
 * SEEN holding a sink; and the checker is run against a PLANTED corpus whose
 * unfenced door must be reported while its fenced twins are not.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { type ParserPlugin, parse } from '@babel/parser';
import {
	REPO_ROOT,
	WRITE_PATH_CORPUS_FLOOR,
	writePathSourceFiles,
} from '../helpers/write_path_corpus.ts';

// ─── the scanner ────────────────────────────────────────────────────────────

type Node = { type: string; start: number; end: number; [key: string]: unknown };
interface Link {
	node: Node;
	key: string;
}

const SKIP_KEYS = new Set([
	'loc',
	'start',
	'end',
	'range',
	'extra',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'comments',
	'tokens',
	'errors',
]);
const TS_VALUE_WRAPPERS = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
	'TSParameterProperty',
]);
const KEYED = new Set([
	'ObjectProperty',
	'ClassProperty',
	'ClassMethod',
	'ObjectMethod',
	'ClassPrivateProperty',
	'ClassAccessorProperty',
	'ClassPrivateMethod',
]);
const FUNCTIONS = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'ClassMethod',
	'ClassPrivateMethod',
	'ObjectMethod',
]);
const CALLS = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression']);
const MEMBERS = new Set(['MemberExpression', 'OptionalMemberExpression']);

function isNode(value: unknown): value is Node {
	return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

interface Module {
	file: string;
	source: string;
	parent: Map<Node, Link>;
	/** Identifier reads by name (binding, key and type positions excluded). */
	identifiers: Map<string, Node[]>;
	/** Member expressions by property name. */
	members: Map<string, Node[]>;
	imports: { local: string; imported: string; from: string | null }[];
	reexports: { exported: string; local: string; from: string | null }[];
	functions: Node[];
	interfaces: Map<string, string[]>;
}

/** The modules the census reads: repo-relative paths and their text. */
interface Corpus {
	files: readonly string[];
	read(file: string): string;
}

function push(map: Map<string, Node[]>, name: string, node: Node): void {
	const list = map.get(name);
	if (list === undefined) map.set(name, [node]);
	else list.push(node);
}

/** An Identifier in a READ position — a blacklist of binding/key/type positions (over-inclusion is the safe side). */
function isRead(link: Link, parentOf: (node: Node) => Link | undefined): boolean {
	const { node: parent, key } = link;
	if (key === 'id' || key === 'label' || key === 'params' || key === 'param') return false;
	if (parent.type.endsWith('Specifier')) return false;
	if (KEYED.has(parent.type) && key === 'key' && parent.computed !== true) return false;
	if (parent.type.startsWith('TS') && !TS_VALUE_WRAPPERS.has(parent.type)) return false;
	if (parent.type === 'ArrayPattern' || parent.type === 'RestElement') return false;
	if (parent.type === 'AssignmentPattern' && key === 'left') return false;
	if (parent.type === 'ObjectProperty' && key === 'value') {
		return parentOf(parent)?.node.type !== 'ObjectPattern';
	}
	return true;
}

function resolveSpecifier(
	files: ReadonlySet<string>,
	from: string,
	specifier: string,
): string | null {
	if (!specifier.startsWith('.')) return null;
	const base = normalize(join(dirname(from), specifier));
	for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
		if (files.has(candidate)) return candidate;
	}
	return base;
}

const DYNAMIC_IMPORT =
	/(?:const|let)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g;

function parseModule(file: string, source: string, files: ReadonlySet<string>): Module {
	const plugins: ParserPlugin[] = [
		file.endsWith('.d.ts') ? ['typescript', { dts: true }] : 'typescript',
		'decorators-legacy',
	];
	const ast = parse(source, { sourceType: 'module', errorRecovery: true, plugins }) as unknown as {
		program: Node;
		errors: unknown[];
	};
	if (ast.errors.length > 0) {
		throw new Error(
			`target-lock census: ${file} does not parse — a module the census cannot read is a module outside it`,
		);
	}
	const parsed: Module = {
		file,
		source,
		parent: new Map(),
		identifiers: new Map(),
		members: new Map(),
		imports: [],
		reexports: [],
		functions: [],
		interfaces: new Map(),
	};
	const identifiers: Node[] = [];
	const stack: Node[] = [ast.program];
	while (stack.length > 0) {
		const node = stack.pop() as Node;
		if (FUNCTIONS.has(node.type)) parsed.functions.push(node);
		if (node.type === 'TSInterfaceDeclaration') {
			const body = (node.body as Node).body as Node[];
			parsed.interfaces.set(
				(node.id as Node).name as string,
				body
					.map((member) => ((member.key as Node | undefined)?.name as string) ?? '')
					.filter(Boolean),
			);
		}
		for (const key of Object.keys(node)) {
			if (SKIP_KEYS.has(key)) continue;
			const value = node[key];
			for (const child of Array.isArray(value) ? value : [value]) {
				if (!isNode(child)) continue;
				parsed.parent.set(child, { node, key });
				if (child.type === 'Identifier') identifiers.push(child);
				else if (child.type === 'StringLiteral' && MEMBERS.has(node.type) && key === 'property') {
					push(parsed.members, child.value as string, node);
				}
				stack.push(child);
			}
		}
	}
	const parentOf = (node: Node) => parsed.parent.get(node);
	for (const identifier of identifiers) {
		const link = parsed.parent.get(identifier) as Link;
		const name = identifier.name as string;
		if (MEMBERS.has(link.node.type) && link.key === 'property' && link.node.computed !== true) {
			push(parsed.members, name, link.node);
		} else if (isRead(link, parentOf)) {
			push(parsed.identifiers, name, identifier);
		}
	}
	for (const statement of ast.program.body as Node[]) {
		if (statement.type === 'ImportDeclaration') {
			const from = resolveSpecifier(files, file, (statement.source as Node).value as string);
			for (const specifier of statement.specifiers as Node[]) {
				const local = (specifier.local as Node).name as string;
				if (specifier.type === 'ImportSpecifier') {
					const imported = specifier.imported as Node;
					parsed.imports.push({
						local,
						imported: (imported.name ?? imported.value) as string,
						from,
					});
				} else if (specifier.type === 'ImportNamespaceSpecifier') {
					parsed.imports.push({ local, imported: '*', from });
				}
			}
		} else if (statement.type === 'ExportNamedDeclaration') {
			const source = statement.source as Node | null;
			const from = source ? resolveSpecifier(files, file, source.value as string) : null;
			for (const specifier of (statement.specifiers as Node[] | undefined) ?? []) {
				if (specifier.type !== 'ExportSpecifier') continue;
				const exported = specifier.exported as Node;
				parsed.reexports.push({
					exported: (exported.name ?? exported.value) as string,
					local: (specifier.local as Node).name as string,
					from,
				});
			}
		}
	}
	for (const hit of source.matchAll(DYNAMIC_IMPORT)) {
		const from = resolveSpecifier(files, file, hit[2] as string);
		for (const part of (hit[1] as string).split(',')) {
			const [imported, local] = part.split(':').map((piece) => piece.trim());
			if (imported) parsed.imports.push({ local: local || imported, imported, from });
		}
	}
	return parsed;
}

/**
 * A symbol of the walk: a function or class (resolved through imports), or a
 * method (resolved by member name, in call position). `owner` qualifies a class
 * method's key (two classes of one module may share a method name).
 */
interface Def {
	file: string;
	name: string;
	kind: 'function' | 'method';
	owner?: string;
}
function defKey(def: Pick<Def, 'file' | 'name' | 'owner'>): string {
	return `${def.file}#${def.owner === undefined ? '' : `${def.owner}.`}${def.name}`;
}
const TOP_LEVEL = '(top level)';

interface ExemptEntry {
	/** Why this holder may reach a target sink without the lock (a sentence). */
	why: string;
	/** The holder only READS the target: its own body may hold no write SQL and no fs mutator. */
	readOnly?: true;
}

interface CensusConfig {
	sinks: readonly Def[];
	lockSeeds: readonly Def[];
	rootResolvers: readonly Def[];
	fsMutators: ReadonlySet<string>;
	writerSeam: {
		interfacesFile: string;
		interfaces: readonly string[];
		implementations: (file: string) => boolean;
		holders: readonly Def[];
	};
	exempt: Readonly<Record<string, ExemptEntry>>;
}

interface Census {
	/** Holder key → the chain step that reached it. */
	reached: Map<string, string>;
	/** Holder key → its function node and module (for the read-only check). */
	holders: Map<string, { module: Module; fn: Node | null }>;
	offenders: string[];
	/** The offending holder keys alone (the planted legs read these). */
	offenderKeys: string[];
	sinkSites: number;
	fencedSites: number;
	doors: Set<string>;
	rootModules: Set<string>;
	writerMembers: Set<string>;
}

function runCensus(corpus: Corpus, config: CensusConfig): Census {
	const fileSet = new Set(corpus.files);
	const cache = new Map<string, Module>();
	const module = (file: string): Module => {
		let hit = cache.get(file);
		if (hit === undefined) {
			hit = parseModule(file, corpus.read(file), fileSet);
			cache.set(file, hit);
		}
		return hit;
	};
	const mentioning = (text: string): string[] =>
		corpus.files.filter((file) => corpus.read(file).includes(text));

	/** Every (module, local name) a def is visible as: its own module, importers, re-exporters. */
	const visibleAs = (def: Def): { file: string; local: string; namespace: boolean }[] => {
		const views = [{ file: def.file, local: def.name, namespace: false }];
		const origins = [{ file: def.file, name: def.name }];
		for (let index = 0; index < origins.length; index++) {
			const origin = origins[index] as { file: string; name: string };
			for (const file of mentioning(origin.name)) {
				if (file === origin.file) continue;
				const parsed = module(file);
				for (const entry of parsed.imports) {
					if (entry.from !== origin.file) continue;
					if (entry.imported === origin.name)
						views.push({ file, local: entry.local, namespace: false });
					if (entry.imported === '*') views.push({ file, local: entry.local, namespace: true });
				}
				for (const entry of parsed.reexports) {
					const reexports =
						entry.from === origin.file
							? entry.local === origin.name
							: parsed.imports.some(
									(i) =>
										i.from === origin.file && i.imported === origin.name && i.local === entry.local,
								);
					if (reexports && !origins.some((o) => o.file === file && o.name === entry.exported)) {
						origins.push({ file, name: entry.exported });
					}
				}
			}
		}
		return views;
	};

	const inCallPosition = (parsed: Module, member: Node): boolean => {
		const link = parsed.parent.get(member);
		return link !== undefined && CALLS.has(link.node.type) && link.key === 'callee';
	};

	// The writer session seam: member names DERIVED from the interfaces, holders from the registry.
	const seamInterfaces = module(config.writerSeam.interfacesFile).interfaces;
	const writerMembers = new Set(
		config.writerSeam.interfaces.flatMap((name) => seamInterfaces.get(name) ?? []),
	);
	const seamHolderFiles = new Set(
		config.writerSeam.holders.flatMap((holder) => visibleAs(holder).map((view) => view.file)),
	);

	/** Where `def` is referenced: Identifier / namespace reads where visible; member CALLS for a method. */
	const referenceSites = (def: Def): { file: string; node: Node }[] => {
		const sites: { file: string; node: Node }[] = [];
		if (def.kind === 'function') {
			for (const view of visibleAs(def)) {
				const parsed = module(view.file);
				if (view.namespace) {
					for (const member of parsed.members.get(def.name) ?? []) {
						const object = member.object as Node;
						if (object.type === 'Identifier' && object.name === view.local) {
							sites.push({ file: view.file, node: member });
						}
					}
				} else {
					for (const node of parsed.identifiers.get(view.local) ?? []) {
						sites.push({ file: view.file, node });
					}
				}
			}
			return sites;
		}
		const viaSeam = config.writerSeam.implementations(def.file) && writerMembers.has(def.name);
		const stem = (def.file.split('/').pop() ?? '').replace(/\.ts$/, '');
		const files = new Set(
			viaSeam
				? [def.file, ...seamHolderFiles]
				: [
						def.file,
						...mentioning(stem).filter((file) =>
							module(file).imports.some((entry) => entry.from === def.file),
						),
					],
		);
		for (const file of files) {
			if (!corpus.read(file).includes(def.name)) continue;
			const parsed = module(file);
			for (const node of parsed.members.get(def.name) ?? []) {
				if (inCallPosition(parsed, node)) sites.push({ file, node });
			}
		}
		return sites;
	};

	/** The named function a node is, or null for an anonymous callback. */
	const holderOf = (parsed: Module, fn: Node): Def | null => {
		const file = parsed.file;
		if (fn.type === 'FunctionDeclaration') {
			return fn.id ? { file, name: (fn.id as Node).name as string, kind: 'function' } : null;
		}
		if (
			fn.type === 'ClassMethod' ||
			fn.type === 'ClassPrivateMethod' ||
			fn.type === 'ObjectMethod'
		) {
			let up = parsed.parent.get(fn);
			while (
				up !== undefined &&
				up.node.type !== 'ClassDeclaration' &&
				up.node.type !== 'ClassExpression'
			) {
				if (up.node.type === 'ObjectExpression') break;
				up = parsed.parent.get(up.node);
			}
			const owner =
				up !== undefined && up.node.type !== 'ObjectExpression'
					? ((up.node.id as Node | undefined)?.name as string | undefined)
					: undefined;
			if (fn.kind === 'constructor') {
				return owner === undefined ? null : { file, name: owner, kind: 'function' };
			}
			const key = fn.key as Node;
			const name = (key.name ?? key.value ?? (key.id as Node | undefined)?.name) as
				| string
				| undefined;
			return name === undefined ? null : { file, name, kind: 'method', owner };
		}
		let link = parsed.parent.get(fn);
		while (
			link !== undefined &&
			(TS_VALUE_WRAPPERS.has(link.node.type) || link.node.type === 'ParenthesizedExpression')
		) {
			link = parsed.parent.get(link.node);
		}
		if (link === undefined) return null;
		const { node: parent, key } = link;
		if (
			parent.type === 'VariableDeclarator' &&
			key === 'init' &&
			(parent.id as Node).type === 'Identifier'
		) {
			return { file, name: (parent.id as Node).name as string, kind: 'function' };
		}
		if ((parent.type === 'ObjectProperty' || parent.type === 'ClassProperty') && key === 'value') {
			const propertyKey = parent.key as Node;
			const name = (propertyKey.name ?? propertyKey.value) as string | undefined;
			return parent.computed === true || name === undefined ? null : { file, name, kind: 'method' };
		}
		return null;
	};

	// ── the lock doors: seeds + derived wrappers + local aliases ──
	const doors = new Set(config.lockSeeds.map(defKey));
	const doorLocals = new Map<string, Set<string>>();
	const addDoorLocal = (file: string, local: string): boolean => {
		let set = doorLocals.get(file);
		if (set === undefined) {
			set = new Set();
			doorLocals.set(file, set);
		}
		if (set.has(local)) return false;
		set.add(local);
		return true;
	};
	const addDoor = (def: Def): void => {
		doors.add(defKey(def));
		for (const view of visibleAs(def)) if (!view.namespace) addDoorLocal(view.file, view.local);
	};
	for (const seed of config.lockSeeds) addDoor(seed);
	const isDoorCall = (file: string, call: Node): boolean => {
		const callee = call.callee as Node;
		return (
			callee.type === 'Identifier' && (doorLocals.get(file)?.has(callee.name as string) ?? false)
		);
	};

	type Verdict = { kind: 'fenced' } | { kind: 'holder'; def: Def; fn: Node } | { kind: 'top' };
	const classify = (file: string, site: Node): Verdict => {
		const parsed = module(file);
		let link = parsed.parent.get(site);
		while (link !== undefined) {
			const node = link.node;
			if (CALLS.has(node.type) && link.key === 'arguments' && isDoorCall(file, node)) {
				return { kind: 'fenced' };
			}
			if (FUNCTIONS.has(node.type) && link.key !== 'key') {
				const def = holderOf(parsed, node);
				if (def !== null) return { kind: 'holder', def, fn: node };
			}
			link = parsed.parent.get(node);
		}
		return { kind: 'top' };
	};

	/** A param handed to the door as its work: a direct argument, or called inside a callback argument. */
	const handsParamToDoor = (parsed: Module, fn: Node, call: Node): boolean => {
		const params = new Set(
			(fn.params as Node[]).filter((p) => p.type === 'Identifier').map((p) => p.name as string),
		);
		for (const argument of call.arguments as Node[]) {
			if (argument.type === 'Identifier' && params.has(argument.name as string)) return true;
			if (!FUNCTIONS.has(argument.type)) continue;
			for (const name of params) {
				for (const read of parsed.identifiers.get(name) ?? []) {
					const link = parsed.parent.get(read);
					const inside = read.start >= argument.start && read.end <= argument.end;
					if (inside && link !== undefined && CALLS.has(link.node.type) && link.key === 'callee')
						return true;
				}
			}
		}
		return false;
	};

	for (let grew = true; grew; ) {
		grew = false;
		for (const [file, locals] of [...doorLocals]) {
			const parsed = module(file);
			for (const local of [...locals]) {
				for (const read of parsed.identifiers.get(local) ?? []) {
					const link = parsed.parent.get(read);
					if (link === undefined) continue;
					// a local alias: `const fence = deps.fenceDatabase ?? fenceDatabase`
					let up: Link | undefined = link;
					while (
						up !== undefined &&
						(up.node.type === 'LogicalExpression' || up.node.type === 'ConditionalExpression')
					) {
						up = parsed.parent.get(up.node);
					}
					if (
						up?.node.type === 'VariableDeclarator' &&
						up.key === 'init' &&
						(up.node.id as Node).type === 'Identifier'
					) {
						if (addDoorLocal(file, (up.node.id as Node).name as string)) grew = true;
						continue;
					}
					if (!CALLS.has(link.node.type) || link.key !== 'callee') continue;
					const verdict = classify(file, link.node);
					if (verdict.kind !== 'holder' || verdict.def.kind !== 'function') continue;
					if (doors.has(defKey(verdict.def))) continue;
					if (!handsParamToDoor(parsed, verdict.fn, link.node)) continue;
					addDoor(verdict.def);
					grew = true;
				}
			}
		}
	}

	// ── the target-root modules: resolvers + every function returning a path built on one ──
	const resolvers = [...config.rootResolvers];
	const resolverKeys = new Set(resolvers.map(defKey));
	const rootModules = new Set<string>();
	for (let index = 0; index < resolvers.length; index++) {
		const resolver = resolvers[index] as Def;
		for (const view of visibleAs(resolver)) {
			rootModules.add(view.file);
			if (view.namespace) continue;
			const parsed = module(view.file);
			for (const read of parsed.identifiers.get(view.local) ?? []) {
				let link = parsed.parent.get(read);
				let returned = false;
				while (link !== undefined && !FUNCTIONS.has(link.node.type)) {
					if (link.node.type === 'ReturnStatement') returned = true;
					link = parsed.parent.get(link.node);
				}
				if (link === undefined) continue;
				const fn = link.node;
				if (link.key === 'body' && fn.type === 'ArrowFunctionExpression') returned = true;
				if (!returned) continue;
				const def = holderOf(parsed, fn);
				if (def === null || def.kind !== 'function' || resolverKeys.has(defKey(def))) continue;
				resolverKeys.add(defKey(def));
				resolvers.push(def);
			}
		}
	}

	// ── the walk ──
	const reached = new Map<string, string>();
	const holders = new Map<string, { module: Module; fn: Node | null }>();
	const offenders: string[] = [];
	const offenderKeys: string[] = [];
	const queue: Def[] = [];
	let sinkSites = 0;
	let fencedSites = 0;

	const judge = (file: string, site: Node, via: string, self?: string): void => {
		const verdict = classify(file, site);
		if (verdict.kind === 'fenced') {
			fencedSites++;
			return;
		}
		if (verdict.kind === 'top') {
			const key = `${file}#${TOP_LEVEL}`;
			if (!reached.has(key)) reached.set(key, via);
			holders.set(key, { module: module(file), fn: null });
			if (config.exempt[key] === undefined) {
				offenders.push(`${key} ← ${via}`);
				offenderKeys.push(key);
			}
			return;
		}
		const key = defKey(verdict.def);
		if (key === self) return; // recursion
		if (reached.has(key)) return;
		reached.set(key, via);
		holders.set(key, { module: module(file), fn: verdict.fn });
		queue.push(verdict.def);
	};

	const judgeSink = (file: string, site: Node, via: string): void => {
		sinkSites++;
		judge(file, site, via);
	};
	for (const sink of config.sinks) {
		for (const site of referenceSites(sink))
			judgeSink(site.file, site.node, `${defKey(sink)} [sink]`);
	}
	for (const file of [...rootModules].sort()) {
		const parsed = module(file);
		for (const name of config.fsMutators) {
			for (const node of [
				...(parsed.identifiers.get(name) ?? []),
				...(parsed.members.get(name) ?? []),
			]) {
				const call = node.type === 'Identifier' ? parsed.parent.get(node) : parsed.parent.get(node);
				if (call === undefined || !CALLS.has(call.node.type) || call.key !== 'callee') continue;
				judgeSink(file, call.node, `${file} ${name}() [fs]`);
			}
		}
	}
	while (queue.length > 0) {
		const def = queue.shift() as Def;
		const key = defKey(def);
		if (config.exempt[key] !== undefined || doors.has(key)) continue;
		const sites = referenceSites(def).filter((site) => {
			const verdict = classify(site.file, site.node);
			return !(verdict.kind === 'holder' && defKey(verdict.def) === key);
		});
		if (sites.length === 0) {
			offenders.push(`${key} (nothing fenced calls it — an entry point) ← ${reached.get(key)}`);
			offenderKeys.push(key);
			continue;
		}
		for (const site of sites) judge(site.file, site.node, key, key);
	}
	return {
		reached,
		holders,
		offenders: [...new Set(offenders)].sort(),
		offenderKeys: [...new Set(offenderKeys)].sort(),
		sinkSites,
		fencedSites,
		doors,
		rootModules,
		writerMembers,
	};
}

// ─── the configuration: seeds, never a list of doors ────────────────────────

const TARGET_LOCK = 'src/core/diffusion_bridge/target_lock.ts';
const TARGET_DB = 'src/diffusion/targets/mariadb/db.ts';
const AGENT_CLIENT = 'src/core/publication_host/agent_client.ts';

const LOCK_SEEDS: Def[] = [
	{ file: TARGET_LOCK, name: 'withTargetLock', kind: 'function' },
	{ file: TARGET_LOCK, name: 'withTargetLocks', kind: 'function' },
	{ file: TARGET_LOCK, name: 'withDeleteDoorLock', kind: 'function' },
];

const SINKS: Def[] = [
	{ file: TARGET_DB, name: 'getTargetPool', kind: 'function' },
	{ file: AGENT_CLIENT, name: 'hostMediaPut', kind: 'function' },
	{ file: AGENT_CLIENT, name: 'hostMediaDelete', kind: 'function' },
	{ file: AGENT_CLIENT, name: 'hostMediaMark', kind: 'function' },
];

const ROOT_RESOLVERS: Def[] = [
	{
		file: 'src/core/diffusion_bridge/published_files.ts',
		name: 'diffusionFilesRoot',
		kind: 'function',
	},
	{
		file: 'src/diffusion/targets/mediastore/media_index.ts',
		name: 'markerStoreBase',
		kind: 'function',
	},
];

/** Every node:fs / durable.ts call that changes the filesystem (sync, async, promises, Bun). */
const FS_MUTATORS = new Set([
	'unlink',
	'unlinkSync',
	'rm',
	'rmSync',
	'rmdir',
	'rmdirSync',
	'rename',
	'renameSync',
	'writeFile',
	'writeFileSync',
	'appendFile',
	'appendFileSync',
	'truncate',
	'truncateSync',
	'ftruncate',
	'ftruncateSync',
	'mkdir',
	'mkdirSync',
	'copyFile',
	'copyFileSync',
	'cp',
	'cpSync',
	'symlink',
	'symlinkSync',
	'link',
	'linkSync',
	'open',
	'openSync',
	'write',
	'writeFileDurably',
	'mkdirDurably',
	'removeFileDurably',
]);

const WRITER_SEAM: CensusConfig['writerSeam'] = {
	interfacesFile: 'src/diffusion/writers/types.ts',
	interfaces: ['WriterSession', 'DiffusionWriter'],
	implementations: (file) => file.startsWith('src/diffusion/writers/'),
	holders: [
		{ file: 'src/diffusion/writers/registry.ts', name: 'getDiffusionWriter', kind: 'function' },
		{ file: 'src/diffusion/writers/registry.ts', name: 'WRITER_REGISTRY', kind: 'function' },
	],
};

/**
 * Holders that reach a target sink WITHOUT the lock, each with the reason it
 * may. SHRINK-ONLY: an entry the walk no longer reaches fails this gate. An
 * entry stops the walk at that holder — so it is placed at the LOWEST holder its
 * reason covers, never at an entry point that would launder its callers.
 */
const EXEMPT: Readonly<Record<string, ExemptEntry>> = {
	'src/diffusion/targets/mariadb/db.ts#getTargetDatabaseStatus': {
		why: 'A liveness probe for the diffusion info panel: one SELECT 1 on the pool, and it answers a status object — the pool never leaves it, so no write can ride it.',
		readOnly: true,
	},
	'src/diffusion/writers/mariadb_sql.ts#open': {
		why: "The sql writer's open() probes the database (probeTargetDatabase: SELECT 1, a loud unreachable error) and discards the pool it returns; every write of the session it opens is a seam method the runner calls inside its fenced unit.",
	},
	'src/diffusion/targets/mediastore/media_index.ts#fetchPublishedSectionIds': {
		why: 'The rebuild ground truth: SELECT DISTINCT section_id on one published table. It reaches the rebuild only as the fetchIds seam, which syncTargetMarkers invokes inside underDatabaseFence — the read runs under the lock, the parameter is what hides it from a lexical walk.',
		readOnly: true,
	},
	'src/diffusion/targets/mariadb/public_tier_reconcile.ts#tierRowIds': {
		why: 'The public-tier reconcile SCAN: it lists the section ids a published table holds to find ghosts. Read-only; every removal it plans is applied by unpublishGhosts under the target lock.',
		readOnly: true,
	},
	'src/diffusion/targets/mariadb/lang_sweep.ts#discoverPublishedTables': {
		why: "The lang audit's table discovery: an information_schema read on the target. The sweep calls it inside fenceDatabase; the audit-only action (auditPublishedLangs) reads without one, and a read never interleaves with a writer's unit.",
		readOnly: true,
	},
	'src/diffusion/targets/mariadb/lang_sweep.ts#auditTable': {
		why: "The lang audit's per-table count: a SELECT grouped by lang. The sweep calls it inside fenceDatabase before any DELETE; the audit-only action reads without one, and a read never interleaves with a writer's unit.",
		readOnly: true,
	},
	'src/diffusion/writers/files.ts#FullExportFile.abort': {
		why: "Removes only a SESSION-owned `.tmp-*` partial (a name no other writer can hold, never a published file); a job-scoped partial is kept for the resume. It runs on the runner's abort path, after the unit was refused or failed.",
	},
	'src/diffusion/targets/mediastore/media_copy.ts#realCopyDeps': {
		why: "Builds the media-copy door's CopyDeps. That door's safety is its own PROTOCOL, not this lock alone: grants and deletes run under media:<host> (deps.lock), the transfer runs outside every lock and is compensated when pub/ flipped meanwhile, and a withdrawal is order-safe outside it (media_copy_apply.ts; gates media_copy_target_lock_native, media_copy_apply_native).",
	},
	'src/diffusion/targets/mediastore/media_copy.ts#writeAtomic': {
		why: "Writes the media-copy worker's OWN state (the sha cache under mediaCopyStateDir), not a publication target; the module is a target-root module only because it reads pub/ markers.",
	},
	'src/diffusion/targets/mediastore/media_copy.ts#NdjsonShaCache.record': {
		why: "Appends to the media-copy worker's OWN sha cache under mediaCopyStateDir, not a publication target; the module is a target-root module only because it reads pub/ markers.",
	},
	'src/diffusion/targets/mediastore/media_copy.ts#NdjsonShaCache.open': {
		why: "Creates the media-copy worker's OWN state directory (mediaCopyStateDir), not a publication target; the module is a target-root module only because it reads pub/ markers.",
	},
	'src/diffusion/targets/mediastore/media_copy.ts#openShaCache': {
		why: "Opens the media-copy worker's OWN sha cache file under mediaCopyStateDir (read side), not a publication target; the module is a target-root module only because it reads pub/ markers.",
	},
	'scripts/capture_diffusion_old_cells.ts#(top level)': {
		why: 'A one-off capture script: it SELECTs frozen oracle cells from a published table and writes them to a TEST FIXTURE file, never to the target.',
	},
	'scripts/diffusion_harness_publish.ts#(top level)': {
		why: "OPEN (cross-diffusion:r3 integrator request): the v6/v7 parity harness drives a writer session (schema, rows, close) with no fence. Its safety belt refuses any database but the scratch one the operator names, which no runner serves by contract — but no lock holds that contract; it should run each step inside withTargetLock(sqlTargetLockKey / fileTargetLockKey) like the runner's units.",
	},
	'scripts/lib/publication_host_copy_engine.ts#publish': {
		why: 'A drill child: it refuses to start unless its media root is a scratch root marked .dedalo_test_media, so the marker store it publishes into is the drill’s own and no publication runner ever writes it.',
	},
	'scripts/lib/publication_host_copy_engine.ts#unpublish': {
		why: 'A drill child: it refuses to start unless its media root is a scratch root marked .dedalo_test_media, so the marker store it withdraws from is the drill’s own and no publication runner ever writes it.',
	},
};

const CONFIG: CensusConfig = {
	sinks: SINKS,
	lockSeeds: LOCK_SEEDS,
	rootResolvers: ROOT_RESOLVERS,
	fsMutators: FS_MUTATORS,
	writerSeam: WRITER_SEAM,
	exempt: EXEMPT,
};

function repoCorpus(): Corpus {
	const files = writePathSourceFiles();
	const cache = new Map<string, string>();
	return {
		files,
		read(file) {
			let text = cache.get(file);
			if (text === undefined) {
				text = readFileSync(join(REPO_ROOT, file), 'utf8');
				cache.set(file, text);
			}
			return text;
		},
	};
}

const CORPUS = repoCorpus();
const CENSUS = runCensus(CORPUS, CONFIG);

if (process.env.DEDALO_CENSUS_DEBUG === '1') {
	console.log([...CENSUS.reached].map(([key, via]) => `${key} ⇐ ${via}`).join('\n'));
	console.log(`doors: ${[...CENSUS.doors].join(', ')}`);
	console.log(`offenders:\n${CENSUS.offenders.join('\n')}`);
}

/** Floors (measured 2026-10-21: 69 sink sites, 22 of them fenced in place). */
const SINK_SITE_FLOOR = 50;
const FENCED_SITE_FLOOR = 10;

describe('the census saw a real tree', () => {
	test(`at least ${WRITE_PATH_CORPUS_FLOOR} modules in the write-path corpus`, () => {
		expect(CORPUS.files.length).toBeGreaterThanOrEqual(WRITE_PATH_CORPUS_FLOOR);
	});

	test('every seed is still DEFINED where the census looks (a rename is red, never a silent zero)', () => {
		for (const def of [...LOCK_SEEDS, ...SINKS, ...ROOT_RESOLVERS, ...WRITER_SEAM.holders]) {
			const source = CORPUS.read(def.file);
			expect(
				new RegExp(`export (?:async )?(?:function|const) ${def.name}\\b`).test(source),
				`${def.file} no longer defines ${def.name}`,
			).toBe(true);
		}
	});

	test(`at least ${SINK_SITE_FLOOR} sink sites judged, at least ${FENCED_SITE_FLOOR} fenced in place`, () => {
		expect(CENSUS.sinkSites).toBeGreaterThanOrEqual(SINK_SITE_FLOOR);
		expect(CENSUS.fencedSites).toBeGreaterThanOrEqual(FENCED_SITE_FLOOR);
	});

	test('the writer seam is derived from the interfaces, not spelled', () => {
		for (const member of ['ensureSchema', 'writeRows', 'removeRecords', 'close', 'open']) {
			expect(CENSUS.writerMembers.has(member), member).toBe(true);
		}
	});

	test('the derived doors include the runner unit and its alias, the sweep and rebuild wrappers', () => {
		for (const door of [
			'src/diffusion/jobs/target_fence.ts#withFencedBatch',
			'src/diffusion/runner.ts#fenced',
			'src/diffusion/targets/mariadb/lang_sweep.ts#fenceDatabase',
			'src/diffusion/targets/mediastore/media_index.ts#underDatabaseFence',
		]) {
			expect(CENSUS.doors.has(door), door).toBe(true);
		}
	});

	test('the target-root modules include the files writers and the marker store', () => {
		for (const file of [
			'src/diffusion/writers/files.ts',
			'src/diffusion/writers/csv.ts',
			'src/diffusion/writers/rdf.ts',
			'src/core/diffusion_bridge/diffusion_delete.ts',
			'src/diffusion/targets/mediastore/media_index.ts',
			'src/diffusion/targets/mariadb/public_tier_reconcile.ts',
		]) {
			expect(CENSUS.rootModules.has(file), file).toBe(true);
		}
	});

	test('every door target_lock.ts names is SEEN holding a sink (the census covers the doors it claims)', () => {
		for (const holder of [
			'src/diffusion/writers/mariadb_sql.ts#MariadbWriterSession.writeRows',
			'src/diffusion/targets/mariadb/delete_record.ts#deleteOneTarget',
			'src/core/diffusion_bridge/diffusion_delete.ts#unlinkRecordFiles',
			'src/diffusion/targets/mariadb/public_tier_reconcile.ts#unpublishTargetGhosts',
			'src/diffusion/targets/mariadb/lang_sweep.ts#sweepDatabase',
			'src/diffusion/targets/mediastore/media_index.ts#applyTableState',
			'src/diffusion/targets/mediastore/media_index.ts#syncTargetMarkers',
		]) {
			expect(CENSUS.reached.has(holder), holder).toBe(true);
		}
	});
});

describe('every door that writes a publication target takes the target lock', () => {
	test('TOTAL: no unfenced path from a target sink to an entry point outside EXEMPT', () => {
		expect(
			CENSUS.offenders,
			"A door reaches a publication target (getTargetPool, an fs write under the files root or the marker store, a media-copy agent mutator) with no target lock on the way. Run it inside withTargetLock / withTargetLocks / withDeleteDoorLock (or the runner's withFencedBatch), or add the LOWEST holder to EXEMPT with the reason it may not.",
		).toEqual([]);
	});

	test('EXEMPT is shrink-only — every entry is still reached by the walk', () => {
		const stale = Object.keys(EXEMPT).filter((key) => !CENSUS.reached.has(key));
		expect(stale, 'stale exemption(s): the walk no longer reaches them, delete them').toEqual([]);
	});

	test('every exemption reason is a real sentence', () => {
		for (const [key, entry] of Object.entries(EXEMPT)) {
			expect(entry.why.length, `${key}: too short to be a reason`).toBeGreaterThan(60);
			expect(entry.why.endsWith('.'), `${key}: not a sentence`).toBe(true);
		}
	});

	test('a READ-ONLY exemption holds no write SQL and no fs mutator in its own body', () => {
		const WRITE_SQL = /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|RENAME)\s/;
		for (const [key, entry] of Object.entries(EXEMPT)) {
			if (entry.readOnly !== true) continue;
			const holder = CENSUS.holders.get(key);
			expect(holder, `${key} is not a holder the walk saw`).toBeDefined();
			if (holder === undefined) continue;
			const body =
				holder.fn === null
					? holder.module.source
					: holder.module.source.slice(holder.fn.start, holder.fn.end);
			expect(WRITE_SQL.test(body), `${key} is exempt as read-only but holds write SQL`).toBe(false);
			const mutating = [...FS_MUTATORS].filter((name) =>
				new RegExp(`[.\\s(]${name}\\(`).test(body),
			);
			expect(mutating, `${key} is exempt as read-only but mutates the filesystem`).toEqual([]);
		}
	});
});

describe('anti-vacuity — the checker is run against a planted corpus', () => {
	const PLANTED: Record<string, string> = {
		[TARGET_LOCK]: [
			'export async function withTargetLock(key, work) { return { acquired: true, value: await work() }; }',
			'export async function withTargetLocks(keys, work) { return withTargetLock(keys[0], work); }',
			'export async function withDeleteDoorLock(key, work) { return withTargetLock(key, work); }',
		].join('\n'),
		[TARGET_DB]: 'export function getTargetPool(database) { return { unsafe: async () => [] }; }',
		'src/diffusion/writers/types.ts':
			'export interface WriterSession { writeRows(): Promise<void>; }\nexport interface DiffusionWriter { open(): Promise<WriterSession>; }',
		'src/diffusion/writers/registry.ts':
			'export function getDiffusionWriter(format) { return null; }',
		'src/core/diffusion_bridge/published_files.ts':
			'export function diffusionFilesRoot() { return "/x"; }',
		'src/diffusion/targets/mediastore/media_index.ts':
			'export function markerStoreBase() { return "/m"; }',
		'src/planted/doors.ts': [
			"import { getTargetPool as pool } from '../diffusion/targets/mariadb/db.ts';",
			"import { withTargetLock } from '../core/diffusion_bridge/target_lock.ts';",
			"import { diffusionFilesRoot } from '../core/diffusion_bridge/published_files.ts';",
			"import { unlinkSync } from 'node:fs';",
			'async function repairInPlace(database) { await pool(database).unsafe("UPDATE t SET a = 1"); }',
			'export async function maintenanceRepair(database) { await repairInPlace(database); }',
			'export async function fencedRepair(database) { return withTargetLock(`sql:${database}`, () => repairInPlace(database)); }',
			'function fenceMine(database, work) { return withTargetLock(`sql:${database}`, work); }',
			'export async function wrappedRepair(database) { return fenceMine(database, async () => { await pool(database).unsafe("DELETE FROM t"); }); }',
			'export function dropFile(name) { unlinkSync(`${diffusionFilesRoot()}/${name}`); }',
			'class Repairer { async run(database) { await pool(database).unsafe("ALTER TABLE t"); } }',
			'export async function viaMethod(database) { await new Repairer().run(database); }',
			'export const topLevel = pool("db1");',
		].join('\n'),
	};
	const planted = runCensus(
		{ files: Object.keys(PLANTED).sort(), read: (file) => PLANTED[file] as string },
		{ ...CONFIG, sinks: [SINKS[0] as Def], exempt: {} },
	);

	test('the unfenced doors are reported — renamed import, fs write under the root, method, top level', () => {
		const reported = planted.offenderKeys;
		expect(reported).toContain('src/planted/doors.ts#maintenanceRepair');
		expect(reported).toContain('src/planted/doors.ts#dropFile');
		expect(reported).toContain('src/planted/doors.ts#viaMethod');
		expect(reported).toContain(`src/planted/doors.ts#${TOP_LEVEL}`);
	});

	test('their fenced twins are not — direct, through a derived wrapper', () => {
		const reported = planted.offenderKeys.join('\n');
		expect(reported).not.toContain('fencedRepair');
		expect(reported).not.toContain('wrappedRepair');
		expect(planted.doors.has('src/planted/doors.ts#fenceMine')).toBe(true);
	});

	test('an exemption stops the walk at its holder, and only there', () => {
		const exempted = runCensus(
			{ files: Object.keys(PLANTED).sort(), read: (file) => PLANTED[file] as string },
			{
				...CONFIG,
				sinks: [SINKS[0] as Def],
				exempt: { 'src/planted/doors.ts#repairInPlace': { why: 'planted.' } },
			},
		);
		const reported = exempted.offenderKeys;
		expect(reported).not.toContain('src/planted/doors.ts#maintenanceRepair');
		expect(reported).toContain('src/planted/doors.ts#viaMethod');
	});
});
