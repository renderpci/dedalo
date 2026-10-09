/**
 * THE DOMAIN-ONTOLOGY CHOICE of an install (installer unification A4/A5/A6) —
 * which ontologies an installation carries beyond the core the seed ships, and
 * the ORDER they are imported in. PURE AND CONFIG-FREE, like the plan that uses
 * it (install_plan.ts): it imports only the core TLD list, the install paths
 * and the version, so the CLI can decide its plan before it seeds the process
 * environment config.ts freezes.
 *
 * THE MODEL:
 *  - CORE (core_tlds.ts) is the seed's, always installed, never a choice: a core
 *    TLD in the answer is dropped with a note.
 *  - A DOMAIN ontology is an answer (`ontologies`, >= 1 required, default `oh`).
 *    `oh` is VENDORED: the installer reads ONE file of the vendored ontology dir,
 *    `oh.copy.gz` (+ the `oh` entry of its `ontology.json` for the metadata) —
 *    nothing else there; the rest of that dir belongs to the ontology-server
 *    role. Every other TLD comes from the selected SOURCE: an ontology server's
 *    manifest, or a local `--ontology-source` directory/archive.
 *  - DEPENDENCIES ARE DECLARED, NEVER COMPUTED. A source's manifest carries
 *    `dependencies` per TLD (declared by the master — ddengine11); the closure of
 *    the chosen TLDs over those declarations is installed, deps first. A TLD
 *    WITHOUT the field (an older server) is installed alone, with a loud warning.
 *    The vendored `oh` declares its dependencies HERE (VENDORED_DOMAIN_ONTOLOGIES
 *    — proven by vendored_ontology_closure_tripwire), never from the vendored
 *    ontology.json, which predates the field.
 *  - PRECEDENCE per TLD: a local source > the vendored file > a server.
 *
 * describeOntologyCatalog is the ONE view of a catalog: the wizard's
 * get_ontology_catalog answers it and the CLI's --list-ontologies prints it.
 * Gate: test/unit/install_ontology_choice.test.ts (+ the plan parity tripwire).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DedaloError } from '../errors/dedalo_error.ts';
import { CORE_ONTOLOGY_TLDS, isCoreOntologyTld } from '../ontology/core_tlds.ts';
import { VENDORED_ONTOLOGY_DIR } from './paths.ts';

/** The domain ontologies an install gets when the answer is absent or `default`. */
export const DEFAULT_DOMAIN_ONTOLOGIES: readonly string[] = Object.freeze(['oh']);

/** The vendored domain ontologies and their DECLARED dependencies (see header). */
export const VENDORED_DOMAIN_ONTOLOGIES: readonly {
	readonly tld: string;
	readonly dependencies: readonly string[];
}[] = Object.freeze([Object.freeze({ tld: 'oh', dependencies: CORE_ONTOLOGY_TLDS })]);

/** The label key of the explanatory note the front ends show under a TLD. */
export const ONTOLOGY_NOTE_LABELS: Readonly<Record<string, string>> = Object.freeze({
	oh: 'installation_ontology_note_oh',
	tch: 'installation_ontology_note_tch',
});

/**
 * The engine-owned TLD (engine_ontology.ts ENGINE_TLD — gated equal by
 * install_ontology_choice): materialized by the engine itself, never a choice,
 * never a dependency to install. Not imported: engine_ontology.ts reaches the db.
 */
const ENGINE_OWNED_TLD = 'ddengine';

const TLD_RE = /^[a-z]{2,}$/;

export interface OntologyServerRef {
	name: string;
	url: string;
	code: string;
}
export type OntologySource =
	| { kind: 'none' }
	| { kind: 'local'; path: string }
	| { kind: 'server'; server: OntologyServerRef };
/** A source as a front end may see it — never the server's access code. */
export type OntologySourceView =
	| { kind: 'none' }
	| { kind: 'local'; path: string }
	| { kind: 'server'; server: { name: string; url: string } };

export type OntologyOrigin = 'vendored' | 'local' | 'server';

export interface OntologyCatalogEntry {
	tld: string;
	name: string;
	name_data: unknown;
	typology_id: number | string | null;
	typology_name: string | null;
	/** Declared dependencies (core included); null = NOT declared. */
	dependencies: string[] | null;
	origin: OntologyOrigin;
	/** An absolute path (vendored/local) or a URL (server). */
	file: string;
}
export interface OntologyMatrixDd {
	origin: 'local' | 'server';
	file: string;
}
export interface OntologyCatalog {
	source: OntologySource;
	entries: OntologyCatalogEntry[];
	matrixDd: OntologyMatrixDd | null;
	warnings: string[];
}
export interface OntologyInstallItem {
	tld: string;
	origin: OntologyOrigin;
	file: string;
	typology_id: number | string | null;
	name_data: unknown;
	dependencies: string[] | null;
}
export interface OntologyInstallRequest {
	source: OntologySourceView;
	/** Deps first. */
	items: OntologyInstallItem[];
	matrixDd: OntologyMatrixDd | null;
}
export interface OntologyCatalogViewEntry {
	tld: string;
	name: string;
	typology_id: number | string | null;
	typology_name: string | null;
	origin: OntologyOrigin;
	is_default: boolean;
	note_key: string | null;
	dependencies: string[] | null;
	also_installs: string[];
}
export interface OntologyCatalogView {
	source: OntologySourceView;
	default: string[];
	core: string[];
	entries: OntologyCatalogViewEntry[];
	warnings: string[];
}

// ── the vendored catalog ─────────────────────────────────────────────────────

interface VendoredInfoEntry {
	tld?: unknown;
	name?: unknown;
	name_data?: unknown;
	typology_id?: unknown;
	typology_name?: unknown;
}

/** The vendored ontology.json `active_ontologies` entry of `tld` (undefined when absent). */
function vendoredInfoEntry(tld: string): VendoredInfoEntry | undefined {
	try {
		const info = JSON.parse(readFileSync(join(VENDORED_ONTOLOGY_DIR, 'ontology.json'), 'utf8')) as {
			active_ontologies?: VendoredInfoEntry[];
		};
		return (info.active_ontologies ?? []).find((entry) => entry.tld === tld);
	} catch {
		return undefined;
	}
}

function typologyIdOf(value: unknown): number | string | null {
	return typeof value === 'number' || typeof value === 'string' ? value : null;
}

function stringOr<T>(value: unknown, fallback: T): string | T {
	return typeof value === 'string' && value !== '' ? value : fallback;
}

/** One vendored entry (its metadata from the vendored ontology.json, its deps declared here). */
function vendoredEntry(tld: string, dependencies: readonly string[]): OntologyCatalogEntry {
	const meta = vendoredInfoEntry(tld) ?? {};
	return {
		tld,
		name: stringOr(meta.name, tld),
		name_data: meta.name_data ?? null,
		typology_id: typologyIdOf(meta.typology_id),
		typology_name: stringOr(meta.typology_name, null),
		dependencies: [...dependencies],
		origin: 'vendored',
		file: join(VENDORED_ONTOLOGY_DIR, `${tld}.copy.gz`),
	};
}

/**
 * The built-in catalog: the vendored domain ontologies whose file is present
 * (a missing file is a warning, and the TLD is not offered).
 */
export function vendoredOntologyCatalog(): OntologyCatalog {
	const entries: OntologyCatalogEntry[] = [];
	const warnings: string[] = [];
	for (const vendored of VENDORED_DOMAIN_ONTOLOGIES) {
		const entry = vendoredEntry(vendored.tld, vendored.dependencies);
		if (existsSync(entry.file)) entries.push(entry);
		else warnings.push(`the built-in ontology file ${vendored.tld}.copy.gz is missing`);
	}
	return { source: { kind: 'none' }, entries, matrixDd: null, warnings };
}

const ORIGIN_RANK: Readonly<Record<OntologyOrigin, number>> = { local: 3, vendored: 2, server: 1 };

/**
 * A source's catalog merged with the vendored one — per TLD the higher-ranked
 * origin wins (local > vendored > server). Idempotent: merging an already merged
 * catalog again changes nothing.
 */
export function mergeOntologyCatalogs(
	sourceCatalog: OntologyCatalog | undefined,
	vendored: OntologyCatalog,
): OntologyCatalog {
	if (sourceCatalog === undefined) return vendored;
	const byTld = new Map<string, OntologyCatalogEntry>();
	for (const entry of [...sourceCatalog.entries, ...vendored.entries]) {
		const held = byTld.get(entry.tld);
		if (held === undefined || ORIGIN_RANK[entry.origin] > ORIGIN_RANK[held.origin]) {
			byTld.set(entry.tld, entry);
		}
	}
	return {
		source: sourceCatalog.source,
		entries: [...byTld.values()],
		matrixDd: sourceCatalog.matrixDd,
		warnings: [...new Set([...sourceCatalog.warnings, ...vendored.warnings])],
	};
}

// ── the answer ───────────────────────────────────────────────────────────────

const NONE_ERROR = 'at least one domain ontology is required (the default is oh)';

/** The requested TLDs before the core filter (absent / 'default' → the default set). */
function requestedOntologies(value: unknown): string[] {
	if (value === undefined || value === null || value === 'default') {
		return [...DEFAULT_DOMAIN_ONTOLOGIES];
	}
	if (value === 'none') return [];
	const items = Array.isArray(value) ? value : String(value).split(',');
	return items.map((item) => String(item).trim().toLowerCase()).filter((item) => item !== '');
}

/** One requested TLD → kept, noted (core) or refused (grammar). */
function admitOntology(tld: string, picked: string[], notes: string[], errors: string[]): void {
	if (!TLD_RE.test(tld)) errors.push(`ontologies: '${tld}' is not a TLD`);
	else if (isCoreOntologyTld(tld)) {
		notes.push(`${tld} is a core ontology (always installed) — dropped from the list`);
	} else if (!picked.includes(tld)) picked.push(tld);
}

/**
 * The `ontologies` answer normalized: lowercased, de-duplicated, a core TLD
 * dropped with a note, a non-TLD refused; at least one domain ontology left.
 */
export function normalizeOntologyChoice(value: unknown): {
	ontologies: string[];
	notes: string[];
	errors: string[];
} {
	const ontologies: string[] = [];
	const notes: string[] = [];
	const errors: string[] = [];
	for (const tld of requestedOntologies(value)) admitOntology(tld, ontologies, notes, errors);
	if (ontologies.length === 0 && errors.length === 0) errors.push(NONE_ERROR);
	return { ontologies, notes, errors };
}

/**
 * Whether the choice needs a catalog RESOLVED beyond the vendored one: a local
 * source always (its files win over the vendored `oh`), a server when a chosen
 * TLD is not vendored. Never for `none` — there is nothing else to resolve, and
 * the vendored catalog answers (an unvendored TLD is then "not offered").
 */
export function ontologyCatalogNeeded(chosen: readonly string[], source: OntologySource): boolean {
	if (source.kind === 'none') return false;
	const vendored = new Set(VENDORED_DOMAIN_ONTOLOGIES.map((entry) => entry.tld));
	return source.kind === 'local' || chosen.some((tld) => !vendored.has(tld));
}

/** The words that name a catalog's source in a refusal. */
export function ontologySourceLabel(source: OntologySource | OntologySourceView): string {
	if (source.kind === 'server') return `the ontology server '${source.server.name}'`;
	if (source.kind === 'local') return `--ontology-source ${source.path}`;
	return 'the built-in set (air-gapped: only oh is available offline)';
}

/** A source without its access code. */
export function ontologySourceView(source: OntologySource): OntologySourceView {
	if (source.kind !== 'server') return source;
	return { kind: 'server', server: { name: source.server.name, url: source.server.url } };
}

// ── the closure ──────────────────────────────────────────────────────────────

/** A TLD the closure never follows: core (the seed's) or engine-owned. */
function isFixedTld(tld: string): boolean {
	return isCoreOntologyTld(tld) || tld === ENGINE_OWNED_TLD;
}

interface ClosureWalk {
	byTld: ReadonlyMap<string, OntologyCatalogEntry>;
	label: string;
	state: Map<string, 'visiting' | 'done'>;
	order: string[];
	warnings: string[];
	errors: string[];
}

function undeclaredWarning(tld: string): string {
	return `the ontology source declares no dependencies for '${tld}' (an older ontology server) — '${tld}' is installed alone; anything it references in other ontologies stays unresolved`;
}

/** Visit one declared dependency of `tld` (skipped when fixed, refused when absent). */
function visitDependency(walk: ClosureWalk, tld: string, dependency: string): void {
	if (isFixedTld(dependency)) return;
	if (walk.byTld.has(dependency)) {
		visitOntology(walk, dependency);
		return;
	}
	walk.errors.push(
		`'${dependency}', declared as a dependency of '${tld}', is not offered by ${walk.label}`,
	);
}

/** Depth-first, post-order (deps first); a TLD being visited is skipped (cycles tolerated). */
function visitOntology(walk: ClosureWalk, tld: string): void {
	if (walk.state.has(tld)) return;
	walk.state.set(tld, 'visiting');
	const entry = walk.byTld.get(tld) as OntologyCatalogEntry;
	if (entry.dependencies === null) walk.warnings.push(undeclaredWarning(tld));
	for (const dependency of entry.dependencies ?? []) visitDependency(walk, tld, dependency);
	walk.state.set(tld, 'done');
	walk.order.push(tld);
}

function newWalk(catalog: OntologyCatalog): ClosureWalk {
	return {
		byTld: new Map(catalog.entries.map((entry) => [entry.tld, entry])),
		label: ontologySourceLabel(catalog.source),
		state: new Map(),
		order: [],
		warnings: [],
		errors: [],
	};
}

/** The transitive declared dependencies of `tld` (core and itself excluded), in install order. */
function alsoInstalls(tld: string, catalog: OntologyCatalog): string[] {
	const walk = newWalk(catalog);
	if (walk.byTld.has(tld)) visitOntology(walk, tld);
	return walk.order.filter((item) => item !== tld);
}

/**
 * The install order of the chosen TLDs: the closure over their DECLARED
 * dependencies, deps first (depth-first post-order), core and engine-owned TLDs
 * skipped, cycles tolerated (first finish wins; the installer's re-derive pass
 * settles them). Undeclared → warning; a TLD or dependency the catalog does not
 * offer → error.
 */
export function closeOntologyChoice(
	chosen: readonly string[],
	catalog: OntologyCatalog,
): { order: string[]; notes: string[]; warnings: string[]; errors: string[] } {
	const walk = newWalk(catalog);
	for (const tld of chosen) {
		if (walk.byTld.has(tld)) visitOntology(walk, tld);
		else walk.errors.push(`unknown ontology '${tld}' — not offered by ${walk.label}`);
	}
	const notes = chosen
		.filter((tld) => walk.byTld.has(tld))
		.map((tld) => ({ tld, extra: alsoInstalls(tld, catalog) }))
		.filter((item) => item.extra.length > 0)
		.map((item) => `${item.tld} also installs: ${item.extra.join(', ')}`);
	return { order: walk.order, notes, warnings: walk.warnings, errors: walk.errors };
}

/** The matrix_dd file travels only with an item of the same origin (it is that source's lists). */
function requestMatrixDd(
	items: readonly OntologyInstallItem[],
	catalog: OntologyCatalog,
): OntologyMatrixDd | null {
	const matrixDd = catalog.matrixDd;
	if (matrixDd === null) return null;
	return items.some((item) => item.origin === matrixDd.origin) ? matrixDd : null;
}

/** The ordered TLDs → what the installer stages and imports. */
export function ontologyInstallRequest(
	order: readonly string[],
	catalog: OntologyCatalog,
): OntologyInstallRequest {
	const byTld = new Map(catalog.entries.map((entry) => [entry.tld, entry]));
	const items = order.flatMap((tld) => {
		const entry = byTld.get(tld);
		return entry === undefined ? [] : [installItem(entry)];
	});
	return {
		source: ontologySourceView(catalog.source),
		items,
		matrixDd: requestMatrixDd(items, catalog),
	};
}

function installItem(entry: OntologyCatalogEntry): OntologyInstallItem {
	return {
		tld: entry.tld,
		origin: entry.origin,
		file: entry.file,
		typology_id: entry.typology_id,
		name_data: entry.name_data,
		dependencies: entry.dependencies,
	};
}

/** The ACTIVE_ONTOLOGY_TLDS an install writes: core, then the installed domains in install order. */
export function activeOntologyTldsOf(order: readonly string[]): string[] {
	return [...CORE_ONTOLOGY_TLDS, ...order];
}

/**
 * The install request a written ACTIVE_ONTOLOGY_TLDS stands for (the wizard
 * path: persist_config wrote the key, the restarted process stages from it).
 * The closure of its domain part must be exactly that part — a hand-edited list
 * missing a declared dependency is refused, never silently extended.
 */
export function ontologyRequestFromActive(
	active: readonly string[],
	catalog: OntologyCatalog,
): { request: OntologyInstallRequest | null; errors: string[] } {
	const domain = [...new Set(active.map((tld) => tld.trim().toLowerCase()))].filter(
		(tld) => tld !== '' && !isFixedTld(tld),
	);
	if (domain.length === 0) return { request: null, errors: [NONE_ERROR] };
	const closure = closeOntologyChoice(domain, catalog);
	const errors = [...closure.errors, ...closureMismatch(domain, closure.order)];
	if (errors.length > 0) return { request: null, errors };
	return { request: ontologyInstallRequest(closure.order, catalog), errors: [] };
}

function closureMismatch(domain: readonly string[], order: readonly string[]): string[] {
	const missing = order.filter((tld) => !domain.includes(tld));
	if (missing.length === 0) return [];
	return [
		`ACTIVE_ONTOLOGY_TLDS lacks ${missing.join(', ')}, declared as dependencies of its ontologies — save the configuration again`,
	];
}

// ── the one view ─────────────────────────────────────────────────────────────

function viewEntry(
	entry: OntologyCatalogEntry,
	catalog: OntologyCatalog,
): OntologyCatalogViewEntry {
	return {
		tld: entry.tld,
		name: entry.name,
		typology_id: entry.typology_id,
		typology_name: entry.typology_name,
		origin: entry.origin,
		is_default: DEFAULT_DOMAIN_ONTOLOGIES.includes(entry.tld),
		note_key: ONTOLOGY_NOTE_LABELS[entry.tld] ?? null,
		dependencies: entry.dependencies,
		also_installs: alsoInstalls(entry.tld, catalog),
	};
}

/** Default first, then by typology name (unnamed last), then by TLD. */
function compareViewEntries(a: OntologyCatalogViewEntry, b: OntologyCatalogViewEntry): number {
	if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
	const byTypology = (a.typology_name ?? '￿').localeCompare(b.typology_name ?? '￿');
	return byTypology !== 0 ? byTypology : a.tld.localeCompare(b.tld);
}

/** THE view of a catalog (wizard get_ontology_catalog ≡ CLI --list-ontologies). */
export function describeOntologyCatalog(catalog: OntologyCatalog): OntologyCatalogView {
	return {
		source: ontologySourceView(catalog.source),
		default: [...DEFAULT_DOMAIN_ONTOLOGIES],
		core: [...CORE_ONTOLOGY_TLDS],
		entries: catalog.entries
			.filter((entry) => !isFixedTld(entry.tld))
			.map((entry) => viewEntry(entry, catalog))
			.sort(compareViewEntries),
		warnings: [...catalog.warnings],
	};
}

/**
 * The default domain ontologies from the vendored catalog alone — what an
 * offline install gets, and what the suite database is built with
 * (scripts/test_db_setup.ts). Throws when the vendored set cannot serve it.
 */
export function defaultOfflineOntologyRequest(): OntologyInstallRequest {
	const catalog = vendoredOntologyCatalog();
	const closure = closeOntologyChoice(DEFAULT_DOMAIN_ONTOLOGIES, catalog);
	const errors = [...catalog.warnings, ...closure.errors];
	if (errors.length > 0) {
		throw new DedaloError('internal.invariant', {
			message: `the built-in ontology set cannot serve the default (${errors.join('; ')})`,
		});
	}
	return ontologyInstallRequest(closure.order, catalog);
}
