/**
 * tool_import_rdf — the RUN: what `get_rdf_data` does with the IRIs the
 * cataloguer picked, between the fetch (index.ts, the harvesting door) and the
 * write (rdf_import_execute.ts). The v6 `get_rdf_data` → `get_class_map_to_dd`
 * flow, on the TS pieces:
 *
 *   for each IRI, under ONE deadline (RDF_IRI_DEADLINE_MS, everything included):
 *     1. fetch the document (the injected `readDocument`, already typed for the wire);
 *     2. read it twice: the parsed subjects (`rdf`, the pre-import dump, kept
 *        for compatibility) and the triple graph (rdf_graph.ts);
 *     3. pick the subject (the IRI itself, its `.rdf`-less form, the other http
 *        scheme) and PLAN it through the external ontology (rdf_import_plan.ts).
 *        A subject whose type no `owl:Class` maps INTO the caller's section is a
 *        per-URI `tool.rdf_class_unmapped` — nothing of it is written;
 *     3b. THE TARGET CHECK (rdf_import_prune.ts): a link the ontology maps into a
 *        section its component does not target is skipped with the ontology's
 *        reason, and the term only it reached is never looked up nor fetched;
 *     4. resolve the LINKED TERMS the plan could not describe (`needs_fetch_iri`):
 *        MATCH FIRST — a term some record already carries is linked, never
 *        fetched; only an unknown term is dereferenced, through the same fetch,
 *        within what is left of the IRI's deadline, and its own plan is appended
 *        to the op list (the decision of 2026-10-01). A term that does not fit the budget (or whose site is out of
 *        service) is NOT linked and is reported 'not fetched — run again': the
 *        next run finds nothing, fetches it, and completes it. A term whose
 *        document is permanently unreadable (404, not RDF, too large) is created
 *        and linked by its IRI alone, and reported so.
 *   then ONE executor run for every planned IRI (one dd800, minted by the first
 *   write; one transaction per IRI, one savepoint per op — the executor's contract).
 *
 * Nothing here writes, and nothing here is module state: the label cache is the
 * call's own.
 */

import {
	type ApiErrorBody,
	DedaloError,
	toDedaloError,
	toErrorBody,
} from '../../../src/core/errors/index.ts';
import { getSectionRealTipo, getTermByTipo } from '../../../src/core/ontology/resolver.ts';
import { currentApplicationLang } from '../../../src/core/resolve/request_lang.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import { itemAsText } from '../../../src/core/tools/import_code_lookup.ts';
import { parseRdfGraph, type RdfGraph } from '../../../src/core/tools/rdf_graph.ts';
import { parseRdfXml } from '../../../src/core/tools/rdf_xml.ts';
import {
	executeRdfImport,
	type RdfCallerLocator,
	type RdfCreatedEntry,
	type RdfIriReport,
	type RdfSkippedEntry,
	type RdfWrittenEntry,
	schemeTwin,
} from './rdf_import_execute.ts';
import {
	emittedKeys,
	planRdfImport,
	planRdfResource,
	type RdfFindOrCreateOp,
	type RdfImportOntology,
	type RdfImportOp,
	type RdfImportPlan,
	type RdfPlanLangs,
	type RdfSetOp,
} from './rdf_import_plan.ts';
import { type PrunedSkip, pruneOffTarget, withoutKey } from './rdf_import_prune.ts';

// ---------------------------------------------------------------------------
// Input and result
// ---------------------------------------------------------------------------

/** Dereference one IRI within `deadlineMs`; throws the error the cataloguer is told. */
export type RdfDocumentFetch = (iri: string, deadlineMs: number) => Promise<string>;

/** The match-first lookup: the record id, null (unknown), or a refusal sentence (ambiguous). */
export type RdfTermLookup = (
	op: RdfFindOrCreateOp,
	principal: Principal,
) => Promise<number | null | string>;

export interface RdfRunInput {
	readonly uris: readonly string[];
	readonly ontology: RdfImportOntology;
	readonly langs: RdfPlanLangs;
	readonly caller: RdfCallerLocator;
	readonly principal: Principal;
	readonly readDocument: RdfDocumentFetch;
	readonly lookup: RdfTermLookup;
	/** The whole budget of ONE IRI: its document and every linked term it fetches. */
	readonly deadlineMs: number;
	/** The clock (test seam); `Date.now` by default. */
	readonly now?: () => number;
}

export interface RdfReportWritten extends RdfWrittenEntry {
	/** The component's name in the user's language (null when the tipo has no term). */
	component_label: string | null;
}

export interface RdfReportCreated extends RdfCreatedEntry {
	section_label: string | null;
}

export interface RdfReportSkipped extends RdfSkippedEntry {
	component_label: string | null;
	/** The linked term the reason is about (a term that was not fetched). */
	iri?: string;
}

/** What one IRI did to the records. */
export interface RdfUriReport {
	uri: string;
	written: RdfReportWritten[];
	created: RdfReportCreated[];
	skipped: RdfReportSkipped[];
}

/** The `data` of a `get_rdf_data` answer. */
export interface RdfImportResult {
	/** Every loaded IRI's parsed subjects (the pre-import dump, kept for compatibility). */
	rdf: { uri: string; subjects: unknown[] }[];
	/** Per-URI failures: fetch, read, unmapped type, a rolled-back write. */
	errors: { uri: string; error: ApiErrorBody }[];
	/** One entry per IRI that reached the executor (a rolled-back one with empty lists). */
	report: RdfUriReport[];
	/** The run's dd800 bulk process (the revert handle); null when nothing was applied. */
	bulk_process_id: number | null;
}

/** Below this much of the IRI's deadline, a linked term is not started. */
export const RDF_LINKED_MIN_MS = 1_000;
/** The most linked terms one IRI may fetch (the deadline bounds them first, normally). */
export const RDF_MAX_LINKED_FETCHES = 32;
/**
 * The most linked terms one IRI may LOOK UP (match first). A document chooses how
 * many terms it names (up to the graph's triple cap); each costs a search, so
 * past this many the rest are not resolved at all.
 */
export const RDF_MAX_LINKED_LOOKUPS = 4 * RDF_MAX_LINKED_FETCHES;
/** The reason a linked term that did not fit is reported with. */
export const RDF_NOT_FETCHED = 'not fetched — run again';
/** The reason a linked term past {@link RDF_MAX_LINKED_LOOKUPS} is reported with. */
export const RDF_TOO_MANY_LINKED = 'not linked — more linked terms than one import resolves';

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** A planned IRI: its plan (linked terms spliced in) and the wire's own skips. */
interface PreparedUri {
	uri: string;
	plan: RdfImportPlan;
	skipped: RdfReportSkipped[];
}

/**
 * Fetch, plan and resolve every IRI in turn (one bad IRI never fails the batch:
 * it is a per-URI `errors` entry), then apply every plan in one executor run.
 */
export async function runRdfImport(input: RdfRunInput): Promise<RdfImportResult> {
	const result: RdfImportResult = { rdf: [], errors: [], report: [], bulk_process_id: null };
	const prepared: PreparedUri[] = [];
	for (const uri of input.uris) {
		try {
			prepared.push(await prepareUri(uri, input, result));
		} catch (error) {
			result.errors.push({ uri, error: toErrorBody(toDedaloError(error)) });
		}
	}
	if (prepared.length > 0) await applyPrepared(prepared, input, result);
	return result;
}

async function prepareUri(
	uri: string,
	input: RdfRunInput,
	result: RdfImportResult,
): Promise<PreparedUri> {
	const clock = input.now ?? Date.now;
	const deadline = clock() + input.deadlineMs;
	const text = await input.readDocument(uri, input.deadlineMs);
	result.rdf.push({ uri, subjects: parseRdfXml(text).subjects });
	const graph = parseRdfGraph(text, { baseIri: uri });
	const mapped = await mappedPlan(uri, graph, input);
	// THE TARGET CHECK first: a link the ontology maps off target costs no lookup,
	// no fetch and no record (rdf_import_prune.ts).
	const onTarget = await pruneOffTarget(mapped.ops, input.caller.section_tipo);
	const plan = { ...mapped, ops: onTarget.ops };
	const linked = await resolveLinkedTerms(plan, { ...input, deadline, clock });
	return {
		uri,
		plan: linked.plan,
		skipped: [...onTarget.skipped.map(reportSkip), ...linked.skipped],
	};
}

/** A prune skip as the report carries it (the label is added with the rest). */
function reportSkip(skip: PrunedSkip): RdfReportSkipped {
	return { ...skip, component_label: null };
}

/**
 * The subject the IRI names in its own document: the IRI as given, else its
 * `.rdf`-less form, else the same address under the other http scheme (a 301 to
 * https, a document still describing the http IRI) — the first one the graph
 * types. Falls back to the IRI as given (the plan then finds no class).
 */
export function subjectOf(graph: RdfGraph, uri: string): string {
	return subjectCandidates(uri).find((candidate) => graph.types(candidate).length > 0) ?? uri;
}

function subjectCandidates(uri: string): string[] {
	const bare = uri.replace(/\.rdf$/i, '');
	return [uri, bare, schemeTwin(bare)];
}

/**
 * The subject's plan, or `tool.rdf_class_unmapped` when no `owl:Class` maps its
 * type — or maps it into ANOTHER section than the caller's (its real section,
 * for a virtual one): the plan's components belong to that section, and the
 * caller record cannot hold them.
 */
async function mappedPlan(
	uri: string,
	graph: RdfGraph,
	input: RdfRunInput,
): Promise<RdfImportPlan> {
	const subject = subjectOf(graph, uri);
	const plan = planRdfImport(input.ontology, graph, { subject, langs: input.langs });
	if (await importsInto(plan.section_tipo, input.caller.section_tipo)) return plan;
	throw new DedaloError('tool.rdf_class_unmapped', {
		details: { type: graph.types(subject, input.ontology.xmlns)[0] ?? '-' },
		coordinates: {
			tool: 'tool_import_rdf',
			class_tipo: plan.class_tipo ?? '',
			section_tipo: input.caller.section_tipo,
		},
	});
}

/**
 * Does a plan for `planSection` write into a record of `callerSection`? The same
 * section, or two sections with one real section (a virtual one and its real
 * one, either way round, or two virtuals of it): they hold the same components.
 */
export async function importsInto(
	planSection: string | null,
	callerSection: string,
): Promise<boolean> {
	if (planSection === null) return false;
	return (await getSectionRealTipo(planSection)) === (await getSectionRealTipo(callerSection));
}

// ---------------------------------------------------------------------------
// Linked terms: match first, fetch only new, within the IRI's budget
// ---------------------------------------------------------------------------

interface LinkedEnv extends RdfRunInput {
	/** The IRI's deadline (epoch ms on `clock`). */
	readonly deadline: number;
	readonly clock: () => number;
}

type LinkedOutcome =
	| {
			readonly kind: 'keep';
			readonly ops: readonly RdfImportOp[];
			readonly note: string | null;
			/** The fetched term's own off-target links, skipped before they are walked. */
			readonly pruned: readonly PrunedSkip[];
			/** The find_or_create as the executor must see it (its equivalents attached). */
			readonly op?: RdfFindOrCreateOp;
	  }
	| { readonly kind: 'drop'; readonly reason: string };

const KEEP: LinkedOutcome = Object.freeze({ kind: 'keep', ops: [], note: null, pruned: [] });

type FetchableOp = RdfFindOrCreateOp & { readonly needs_fetch_iri: string };

function needsFetch(op: RdfImportOp | undefined): op is FetchableOp {
	return op?.op === 'find_or_create' && op.needs_fetch_iri !== null;
}

/** One IRI's linked-term walk: its counters, and what it reports, in walk order. */
interface LinkedWalk {
	lookups: number;
	fetches: number;
	/** A note as it is, or a dropped term (its entry is built once the drops are applied). */
	readonly events: ({ note: RdfReportSkipped } | { drop: FetchableOp; reason: string })[];
	readonly dropped: Set<string>;
}

/**
 * Walk the ops in order; each linked term that asks for its document is looked
 * up, and fetched + planned only when unknown. Appended ops are walked too (a
 * fetched mint may name a term of its own), inside the same budget. A dropped
 * term is only REMEMBERED during the walk; the ops are pruned once, at the end
 * (one linear pass, however many terms a document names).
 */
async function resolveLinkedTerms(
	plan: RdfImportPlan,
	env: LinkedEnv,
): Promise<{ plan: RdfImportPlan; skipped: RdfReportSkipped[] }> {
	const ops: RdfImportOp[] = [...plan.ops];
	const walk: LinkedWalk = { lookups: 0, fetches: 0, events: [], dropped: new Set() };
	for (let index = 0; index < ops.length; index += 1) {
		const op = ops[index];
		if (needsFetch(op)) {
			recordOutcome(ops, index, await linkedOutcome(op, ops, env, walk), walk);
		}
	}
	const { kept, removed } = withoutKey(ops, walk.dropped);
	return { plan: { ...plan, ops: kept }, skipped: walkSkips(walk, removed) };
}

async function linkedOutcome(
	op: FetchableOp,
	ops: readonly RdfImportOp[],
	env: LinkedEnv,
	walk: LinkedWalk,
): Promise<LinkedOutcome> {
	if (walk.lookups >= RDF_MAX_LINKED_LOOKUPS) return { kind: 'drop', reason: RDF_TOO_MANY_LINKED };
	walk.lookups += 1;
	// Known (or ambiguous — the executor reports that): linked as it is, never fetched.
	if ((await env.lookup(op, env.principal)) !== null) return KEEP;
	const budget = env.deadline - env.clock();
	if (budget < RDF_LINKED_MIN_MS || walk.fetches >= RDF_MAX_LINKED_FETCHES) {
		return { kind: 'drop', reason: RDF_NOT_FETCHED };
	}
	walk.fetches += 1;
	return fetchLinked(op, ops, env, budget);
}

/** The fetched term's plan: its ops on target, and its own off-target links. */
interface FetchedTerm {
	readonly ops: readonly RdfImportOp[];
	readonly pruned: readonly PrunedSkip[];
}

/**
 * Dereference the term and plan it as the record its find_or_create creates —
 * unless its EQUIVALENTS name a record already (the decision of 2026-10-02):
 * the op, carrying them, is then linked to that record (or reported as a
 * conflict when they name several), and the fetched plan is NOT applied — only
 * the term's own identifier is appended to the record it matched (the executor's
 * `bindMatch`), never its other fields. (A record matched only at EXECUTE time —
 * created by an earlier IRI or op of this run — gets the same: the executor
 * withholds the kept plan's writes into it, `writableTarget`.) One more lookup
 * per FETCHED term, so still bounded by {@link RDF_MAX_LINKED_FETCHES}.
 */
async function fetchLinked(
	op: FetchableOp,
	ops: readonly RdfImportOp[],
	env: LinkedEnv,
	budget: number,
): Promise<LinkedOutcome> {
	let fetched: FetchedTerm;
	try {
		fetched = await fetchedTerm(op, ops, env, budget);
	} catch (error) {
		return failedFetch(toDedaloError(error));
	}
	const withEquivalents = { ...op, match_equivalents: equivalentsOf(op, fetched.ops) };
	if (withEquivalents.match_equivalents.length > 0) {
		const found = await env.lookup(withEquivalents, env.principal);
		if (found !== null)
			return { kind: 'keep', ops: [], note: null, pruned: [], op: withEquivalents };
	}
	return {
		kind: 'keep',
		ops: fetched.ops,
		note: null,
		pruned: fetched.pruned,
		op: withEquivalents,
	};
}

async function fetchedTerm(
	op: FetchableOp,
	ops: readonly RdfImportOp[],
	env: LinkedEnv,
	budget: number,
): Promise<FetchedTerm> {
	const iri = op.needs_fetch_iri;
	const graph = parseRdfGraph(await env.readDocument(iri, budget), { baseIri: iri });
	const planned = planRdfResource(env.ontology, graph, {
		subject: subjectOf(graph, iri),
		class_tipo: op.class_tipo,
		key: op.key,
		langs: env.langs,
		known_keys: emittedKeys(ops),
	});
	const onTarget = await pruneOffTarget(planned, env.caller.section_tipo);
	return { ops: onTarget.ops, pruned: onTarget.skipped };
}

/**
 * The term's OTHER identifiers: every value its own plan writes into its match
 * component (the ontology decides what identifies a record of the class — on
 * the live Nomisma mapping, `skos:exactMatch`), its own identifier excluded.
 */
export function equivalentsOf(op: RdfFindOrCreateOp, ops: readonly RdfImportOp[]): string[] {
	const values = ops
		.filter((candidate) => writesIdentity(candidate, op))
		.flatMap((set) => (set as RdfSetOp).value.map((item) => itemAsText(item) ?? ''));
	const own = new Set(['', op.match_value.trim()]);
	return [...new Set(values)].filter((value) => !own.has(value));
}

function writesIdentity(candidate: RdfImportOp, op: RdfFindOrCreateOp): boolean {
	return (
		candidate.op === 'set' &&
		candidate.target.kind === 'found_or_created' &&
		candidate.target.key === op.key &&
		candidate.component_tipo === op.match_component_tipo
	);
}

/**
 * A site out of service (the deadline included) may answer next time: the term
 * is left for the next run. Any other failure would repeat every run: the term
 * is created and linked by its IRI alone.
 */
function failedFetch(error: DedaloError): LinkedOutcome {
	if (error.code === 'tool.source_unavailable') return { kind: 'drop', reason: RDF_NOT_FETCHED };
	const note = `not fetched (${error.code}) — linked by its IRI only`;
	return { kind: 'keep', ops: [], note, pruned: [] };
}

function recordOutcome(
	ops: RdfImportOp[],
	index: number,
	outcome: LinkedOutcome,
	walk: LinkedWalk,
): void {
	const op = ops[index] as FetchableOp;
	if (outcome.kind === 'drop') {
		walk.dropped.add(op.key);
		walk.events.push({ drop: op, reason: outcome.reason });
		return;
	}
	if (outcome.op !== undefined) ops[index] = outcome.op;
	if (outcome.note !== null) {
		walk.events.push({
			note: skipEntry(op.match_component_tipo, outcome.note, op.needs_fetch_iri),
		});
	}
	for (const skip of outcome.pruned) walk.events.push({ note: reportSkip(skip) });
	// APPENDED, never inserted after the find_or_create: the term's plan may link
	// records the main plan emits LATER (`known_keys`), and a key is always
	// emitted before any op names it. Its own new keys come first within it.
	ops.push(...outcome.ops);
}

function skipEntry(componentTipo: string, reason: string, iri: string): RdfReportSkipped {
	return { component_tipo: componentTipo, reason, component_label: null, iri };
}

/** The walk's skips, in walk order; a dropped term's on the component that would have linked it. */
function walkSkips(walk: LinkedWalk, removed: readonly RdfImportOp[]): RdfReportSkipped[] {
	const linkedBy = new Map<string, string>();
	for (const op of removed) {
		if (op.op === 'link' && op.to.kind === 'found_or_created' && !linkedBy.has(op.to.key)) {
			linkedBy.set(op.to.key, op.component_tipo);
		}
	}
	return walk.events.map((event) => {
		if ('note' in event) return event.note;
		const { drop } = event;
		const component = linkedBy.get(drop.key) ?? drop.match_component_tipo;
		return skipEntry(component, event.reason, drop.needs_fetch_iri);
	});
}

// ---------------------------------------------------------------------------
// Apply, then report
// ---------------------------------------------------------------------------

async function applyPrepared(
	prepared: readonly PreparedUri[],
	input: RdfRunInput,
	result: RdfImportResult,
): Promise<void> {
	const executed = await executeRdfImport({
		caller: input.caller,
		plans: prepared.map((entry) => entry.plan),
		principal: input.principal,
		sourceFile: prepared.map((entry) => entry.uri).join(' '),
	});
	result.bulk_process_id = executed.bulk_process_id;
	const labels = new Map<string, string | null>();
	for (const [index, entry] of prepared.entries()) {
		const iri = executed.iris[index] as RdfIriReport;
		if (iri.failure !== undefined) {
			result.errors.push({ uri: entry.uri, error: toErrorBody(toDedaloError(iri.failure)) });
		}
		result.report.push(await uriReport(entry, iri, labels));
	}
}

/** One IRI's report; a rolled-back IRI did nothing, so its lists are empty. */
async function uriReport(
	entry: PreparedUri,
	iri: RdfIriReport,
	labels: Map<string, string | null>,
): Promise<RdfUriReport> {
	const done = iri.failure === undefined;
	const label = (tipo: string) => termOf(tipo, labels);
	return {
		uri: entry.uri,
		written: await Promise.all(
			iri.written.map(async (w) => ({ ...w, component_label: await label(w.component_tipo) })),
		),
		created: await Promise.all(
			iri.created.map(async (c) => ({ ...c, section_label: await label(c.section_tipo) })),
		),
		skipped: done
			? await Promise.all(
					[...iri.skipped, ...entry.skipped].map(async (s) => ({
						...s,
						component_label: await label(s.component_tipo),
					})),
				)
			: [],
	};
}

/** The tipo's term in the user's language, read once per call. */
async function termOf(tipo: string, labels: Map<string, string | null>): Promise<string | null> {
	if (tipo === '') return null;
	if (!labels.has(tipo)) labels.set(tipo, await getTermByTipo(tipo, currentApplicationLang()));
	return labels.get(tipo) ?? null;
}
