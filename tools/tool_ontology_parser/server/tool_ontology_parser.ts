/**
 * tool_ontology_parser handler — PHP
 * tools/tool_ontology_parser/class.tool_ontology_parser.php.
 *
 * Developer-only. Three registered actions:
 *  - get_ontologies: read every matrix_ontology_main record and resolve the four
 *    UI metadata fields ({target_section_tipo, tld, name, typology_id,
 *    typology_name}); skip records missing target/tld (non-fatal, ledger errors).
 *    The census walk itself is SHARED (core/ontology/data_io.ts
 *    getActiveOntologies) with update_ontology_info's active-only subset.
 *  - regenerate_ontologies: full dd_ontology rebuild for the selected TLDs (→
 *    ontology_write.regenerateRecordsInDdOntology) + the LLM-map post-step
 *    (PHP: export_llm_map errors merged into the regenerate response).
 *  - export_ontologies: the strictly-ordered export pipeline (PHP :301-409):
 *    update_ontology_info → export_ontology_info (both hard-abort) → per-TLD
 *    export_to_file (fail-and-continue) → export_private_lists_to_file →
 *    export_llm_map; result=true only when zero errors accumulated.
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
import { regenerateRecordsInDdOntology } from '../../../src/core/ontology/ontology_write.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

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

export async function toolOntologyParserRegenerate(
	context: ToolActionContext,
): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return { result: false, msg: 'Error. developer privileges required', errors: ['unauthorized'] };
	}
	const selected = context.options.selected_ontologies;
	const tlds = Array.isArray(selected) ? selected.map((tld) => String(tld)) : [];
	const response = await regenerateRecordsInDdOntology(tlds, context.userId);

	// PHP regenerate_ontologies post-step: rebuild the LLM map even when the
	// regeneration partially failed (partial rows are still mappable); its
	// errors are MERGED into the response — result/msg stay the delegate's.
	const errors = [...response.errors];
	try {
		const llmMapResponse = await exportLlmMap();
		if (!llmMapResponse.result) {
			errors.push(...llmMapResponse.errors);
		}
	} catch (error) {
		errors.push((error as Error).message);
	}

	return {
		result: response.result,
		msg: response.msg,
		errors,
		total_insert: response.total_insert,
	};
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
 * PHP export_ontologies (:301-409) — the strictly-ordered pipeline with PHP's
 * abort/continue semantics:
 *   1. updateOntologyInfo    — HARD ABORT on failure (nothing written);
 *   2. exportOntologyInfo    — HARD ABORT on failure;
 *   3. per-TLD exportToFile  — soft-fail per TLD (errors recorded, loop
 *      continues); a THROWN error (file-not-created) aborts everything via
 *      the outer catch — PHP parity;
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

		// 3. Per-TLD loop — individual failures recorded, loop continues.
		let done = 0;
		const arMsg: string[] = [];
		for (const tld of tlds) {
			const ontologyResponse = await io.exportToFile(tld);
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
		response.msg = response.result
			? `OK. Export of ontologies completed successfully. Done: ${done}`
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
