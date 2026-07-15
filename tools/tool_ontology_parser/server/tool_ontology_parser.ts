/**
 * tool_ontology_parser handler — PHP
 * tools/tool_ontology_parser/class.tool_ontology_parser.php.
 *
 * Developer-only. The dd_ontology writes are OWNED by core/ontology/ontology_state.ts
 * (inspect/ensure/rebuild — the single reconcile authority); this tool is a gated door onto
 * it, matching the tool_hierarchy → hierarchy_state pattern. Registered actions:
 *  - get_ontologies: the census — every matrix_ontology_main record's UI metadata
 *    ({target_section_tipo, tld, name, typology_id, typology_name}); skips records missing
 *    target/tld (non-fatal). Shared with update_ontology_info (data_io.ts getActiveOntologies).
 *  - inspect_ontologies (READ): the drift of each selected TLD (which dd_ontology nodes are
 *    missing, stale or orphaned vs the matrix source). The client's status panel.
 *  - reconcile_ontologies (WRITE, default): INCREMENTAL — apply only the delta
 *    (ensureOntology). Non-destructive; a TLD in sync is a no-op.
 *  - regenerate_ontologies (WRITE, nuclear): TRANSACTIONAL wipe-and-rebuild
 *    (rebuildOntology) for structural corruption the incremental path cannot fix.
 *  - both writes run the LLM-map post-step (PHP: export_llm_map errors merged in).
 *  - export_ontologies: the ordered export pipeline (PHP :301-409):
 *    update_ontology_info → export_ontology_info (both hard-abort) → per-TLD
 *    export_to_file (fail-and-continue, run BOUNDED-PARALLEL — see
 *    EXPORT_CONCURRENCY) → export_private_lists_to_file → export_llm_map;
 *    result=true only when zero errors accumulated. Only the per-TLD step
 *    parallelizes; the four surrounding steps stay strictly sequential.
 */

import {
	exportLlmMap,
	exportOntologyInfo,
	exportPrivateListsToFile,
	exportToFile,
	getActiveOntologies,
	updateOntologyInfo,
} from '../../../src/core/ontology/data_io.ts';
import type { OntologyIoResponse } from '../../../src/core/ontology/data_io.ts';
import {
	type EnsureOntologyResult,
	ensureOntologies,
	inspectOntology,
	rebuildOntologies,
} from '../../../src/core/ontology/ontology_state.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

/** The selected TLDs from options, coerced to a clean string list. */
function selectedTlds(context: ToolActionContext): string[] {
	const selected = context.options.selected_ontologies;
	return Array.isArray(selected) ? selected.map((tld) => String(tld)) : [];
}

/** Roll a per-TLD reconcile/rebuild batch into one tool response. */
function summarize(outcomes: EnsureOntologyResult[], tlds: string[], verb: string): ToolResponse {
	const errors: string[] = [];
	const ar_msg: string[] = [];
	let applied = 0;
	outcomes.forEach((outcome, index) => {
		const tld = tlds[index] ?? outcome.state.tld ?? '?';
		if (!outcome.result) errors.push(`${tld}: ${outcome.msg}`);
		errors.push(...outcome.errors.map((error) => `${tld}: ${error}`));
		applied += outcome.applied.length;
		ar_msg.push(
			`${tld}: ${outcome.msg}${outcome.applied.length ? ` (${outcome.applied.join('; ')})` : ''}`,
		);
	});
	const ok = errors.length === 0;
	return {
		result: ok,
		msg: ok
			? `${verb} ${outcomes.length} ontolog${outcomes.length === 1 ? 'y' : 'ies'} — ${applied} change(s)`
			: `${verb} completed with errors`,
		errors,
		ar_msg,
	};
}

export async function toolOntologyParserGetOntologies(
	context: ToolActionContext,
): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return { result: false, msg: 'Error. developer privileges required', errors: ['unauthorized'] };
	}
	const census = await getActiveOntologies();

	// PHP get_ontologies wire shape: exactly the five UI metadata fields
	// (name_data stays internal to the census / update_ontology_info).
	const ontologies = census.ontologies.map((entry) => ({
		target_section_tipo: entry.target_section_tipo,
		tld: entry.tld,
		name: entry.name,
		typology_id: entry.typology_id,
		typology_name: entry.typology_name,
	}));

	return { result: ontologies, msg: 'OK. Request done', errors: census.errors };
}

/**
 * READ: the drift of each selected TLD (core/ontology/ontology_state.ts inspectOntology).
 * The client renders this as a per-TLD status panel — which nodes are missing, stale or
 * orphaned — so an operator SEES why an ontology is out of sync before touching anything.
 */
export async function toolOntologyParserInspect(context: ToolActionContext): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return { result: false, msg: 'Error. developer privileges required', errors: ['unauthorized'] };
	}
	const tlds = selectedTlds(context);
	const states = [];
	for (const tld of tlds) states.push(await inspectOntology(tld));
	return { result: true, msg: 'OK. Request done', errors: [], states };
}

/**
 * WRITE (default): INCREMENTAL reconcile — bring each selected TLD's dd_ontology in line
 * with its matrix source by applying only the delta (ensureOntology). Non-destructive: the
 * runtime ontology is never momentarily empty, and a TLD already in sync is a no-op.
 */
export async function toolOntologyParserReconcile(
	context: ToolActionContext,
): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return { result: false, msg: 'Error. developer privileges required', errors: ['unauthorized'] };
	}
	const tlds = selectedTlds(context);
	const outcomes = await ensureOntologies(tlds, context.userId);
	return withLlmMap(summarize(outcomes, tlds, 'Reconciled'));
}

/**
 * WRITE (nuclear): TRANSACTIONAL rebuild — wipe and re-derive each selected TLD's
 * dd_ontology from scratch (rebuildOntology). For structural corruption the incremental
 * reconcile cannot converge. The delete + reinsert run in one transaction per TLD, so a
 * failure rolls back with no empty window and no leftover backup table.
 */
export async function toolOntologyParserRegenerate(
	context: ToolActionContext,
): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return { result: false, msg: 'Error. developer privileges required', errors: ['unauthorized'] };
	}
	const tlds = selectedTlds(context);
	const outcomes = await rebuildOntologies(tlds, context.userId);
	return withLlmMap(summarize(outcomes, tlds, 'Rebuilt'));
}

/**
 * PHP regenerate_ontologies post-step: rebuild the LLM map after a dd_ontology write, even
 * when it partially failed (partial rows are still mappable). Its errors are MERGED in;
 * result/msg stay the write's.
 */
async function withLlmMap(response: ToolResponse): Promise<ToolResponse> {
	const errors = [...((response.errors as string[]) ?? [])];
	try {
		const llmMapResponse = await exportLlmMap();
		if (!llmMapResponse.result) errors.push(...llmMapResponse.errors);
	} catch (error) {
		errors.push((error as Error).message);
	}
	return { ...response, errors };
}

/**
 * The five data_io calls export_ontologies makes, injectable for the unit
 * gate on ordering/abort semantics (production uses the data_io module fns).
 */
export interface OntologyExportIo {
	updateOntologyInfo: (userId: number) => Promise<boolean>;
	exportOntologyInfo: () => Promise<OntologyIoResponse>;
	exportToFile: (tld: string) => Promise<OntologyIoResponse>;
	exportPrivateListsToFile: () => Promise<OntologyIoResponse>;
	exportLlmMap: () => Promise<OntologyIoResponse>;
}

const PRODUCTION_IO: OntologyExportIo = {
	updateOntologyInfo,
	exportOntologyInfo,
	exportToFile,
	exportPrivateListsToFile,
	exportLlmMap,
};

/**
 * Max per-TLD exports in flight at once. Each io.exportToFile forks its own
 * psql subprocess (\copy … TO PROGRAM 'gzip …'); with 100+ ontologies a fully
 * unbounded fan-out would spawn 100+ processes — this caps it.
 */
const EXPORT_CONCURRENCY = 6;

/**
 * PHP export_ontologies (:301-409) — the ordered pipeline with PHP's
 * abort/continue semantics:
 *   1. updateOntologyInfo    — HARD ABORT on failure (nothing written);
 *   2. exportOntologyInfo    — HARD ABORT on failure;
 *   3. per-TLD exportToFile  — BOUNDED-PARALLEL (≤ EXPORT_CONCURRENCY in
 *      flight): soft-fail per TLD (errors recorded, the others continue);
 *      a THROWN error (file-not-created) aborts everything via the outer
 *      catch — PHP parity. Steps 1,2,4,5 stay strictly sequential; only
 *      this one parallelizes (the per-TLD dumps are independent — each
 *      forks its own psql writing its own <tld>.copy.gz, no shared state);
 *   4. exportPrivateListsToFile — always runs regardless of per-TLD errors;
 *   5. exportLlmMap          — always runs; errors merged.
 * result=true only when the errors array is still empty after the full run.
 */
export async function runExportOntologies(
	context: ToolActionContext,
	io: OntologyExportIo = PRODUCTION_IO,
): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return { result: false, msg: 'Error. developer privileges required', errors: ['unauthorized'] };
	}

	const response: ToolResponse & { errors: string[]; ar_msg: string[] } = {
		result: false,
		msg: 'Error. Request failed [export_ontologies]',
		errors: [],
		ar_msg: [],
	};

	// Guard against a client sending null or a non-array value. An empty array
	// would write only the metadata file — not useful (PHP parity).
	const selected = context.options.selected_ontologies;
	if (!Array.isArray(selected) || selected.length === 0) {
		response.msg = 'Error. Invalid or empty selected_ontologies parameter';
		response.errors.push('selected_ontologies must be a non-empty array');
		return response;
	}
	const tlds = selected.map((tld) => String(tld));

	try {
		// 1. Stamp current time/version/active TLDs into dd0/1 ontology18.
		// (!) Must run before exportOntologyInfo, which reads the value just written.
		const updated = await io.updateOntologyInfo(context.userId);
		if (!updated) {
			response.errors.push('unable to update_ontology_info');
			response.msg = 'Unable to update ontology information in dd1 (ontology40_1)';
			return response;
		}

		// 2. Shared metadata file — must exist before any per-TLD file.
		const infoResponse = await io.exportOntologyInfo();
		if (!infoResponse.result) {
			response.errors.push('unable to export ontology info JSON file');
			response.msg = 'Unable to export the ontology information JSON file';
			return response;
		}

		// 3. Per-TLD exports — BOUNDED-PARALLEL. Each exportToFile forks an
		// independent psql writing its own <tld>.copy.gz with no shared state,
		// so the exports are safe to overlap; we run at most EXPORT_CONCURRENCY
		// at a time (chunked allSettled) instead of the old strict sequence.
		// Steps 1,2,4,5 above/below stay sequential — only this step parallelizes.
		let done = 0;
		const arMsg: string[] = [];
		const settled: PromiseSettledResult<OntologyIoResponse>[] = [];
		for (let i = 0; i < tlds.length; i += EXPORT_CONCURRENCY) {
			const chunk = tlds.slice(i, i + EXPORT_CONCURRENCY);
			// allSettled preserves input order within a chunk; chunks are pushed
			// in order — so `settled` stays in the original tld order regardless
			// of which subprocess finished first.
			settled.push(...(await Promise.allSettled(chunk.map((tld) => io.exportToFile(tld)))));
		}

		// A THROWN export (COPY output file not created) aborts everything —
		// re-throw the first (input-order) rejection so the outer catch reports
		// it exactly as the old sequential loop did (PHP parity). Other in-flight
		// exports may already have run; that is acceptable — the overall result
		// still becomes a failure.
		const firstRejected = settled.find((result) => result.status === 'rejected');
		if (firstRejected?.status === 'rejected') {
			throw firstRejected.reason;
		}

		// Soft-fail per TLD: record errors, count only successes, keep going.
		// arMsg is emitted in input tld order (settled is order-preserving).
		for (const result of settled) {
			if (result.status !== 'fulfilled') continue; // unreachable: rejects thrown above
			const ontologyResponse = result.value;
			arMsg.push(ontologyResponse.msg);
			if (ontologyResponse.result === false) {
				response.errors.push(...(ontologyResponse.errors ?? []));
				continue;
			}
			done++;
		}

		// 4. Private lists — always runs regardless of per-TLD errors.
		const privateListResponse = await io.exportPrivateListsToFile();
		arMsg.push(privateListResponse.msg);
		if (privateListResponse.result === false) {
			response.errors.push(...(privateListResponse.errors ?? []));
		}

		// 5. LLM map — regenerated so it stays in sync with the new files.
		const llmMapResponse = await io.exportLlmMap();
		arMsg.push(llmMapResponse.msg);
		if (!llmMapResponse.result) {
			response.errors.push(...(llmMapResponse.errors ?? []));
		}

		response.result = response.errors.length === 0;
		// The per-file ar_msg lines carry each file's path (relative to the I/O dir) + size;
		// name the target directory once here so the operator knows where to find them.
		const { config } = await import('../../../src/config/config.ts');
		response.msg = response.result
			? `OK. Exported ${done} ontolog${done === 1 ? 'y' : 'ies'} to ${config.ops.ontologyDataIoDir}`
			: 'Errors found. Export Ontologies request failed.';
		response.ar_msg = arMsg;
	} catch (error) {
		// PHP outer catch: a thrown sub-step (e.g. COPY output file not created)
		// aborts the remaining steps and reports the message.
		response.result = false;
		response.msg = `Error. ${(error as Error).message}`;
		response.errors.push((error as Error).message);
		console.error('[tool_ontology_parser] export_ontologies exception:', error);
	}

	return response;
}

export async function toolOntologyParserExport(context: ToolActionContext): Promise<ToolResponse> {
	return runExportOntologies(context);
}
