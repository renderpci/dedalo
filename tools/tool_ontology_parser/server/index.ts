/**
 * tool_ontology_parser server module — inspect, reconcile, rebuild & export ontology
 * definitions. DEVELOPER-only (PHP assert_developer); handlers re-assert the flag internally.
 *
 * The dd_ontology writes live in core/ontology/ontology_state.ts (the single reconcile
 * authority); this module only gates + surfaces them. `reconcile_ontologies` is the safe
 * default (incremental), `regenerate_ontologies` is the transactional nuclear rebuild,
 * `inspect_ontologies` is the read the client's status panel renders. `repair_tlds` is the
 * one action that writes SOURCE records rather than the projection: it rewrites a misfiled
 * `ontology7` back to its section's tld, the repair the read-only edit field otherwise removed. export_ontologies runs
 * the PHP :301-409 pipeline via core/ontology/data_io.ts (update info → ontology.json →
 * per-TLD COPY dumps → matrix_dd private lists → LLM map).
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import {
	toolOntologyParserExport,
	toolOntologyParserGetOntologies,
	toolOntologyParserInspect,
	toolOntologyParserReconcile,
	toolOntologyParserRegenerate,
	toolOntologyParserRepairTlds,
} from './tool_ontology_parser.ts';

export const tool: ToolServerModule = {
	name: 'tool_ontology_parser',
	apiActions: {
		get_ontologies: { permission: 'developer', handler: toolOntologyParserGetOntologies },
		inspect_ontologies: { permission: 'developer', handler: toolOntologyParserInspect },
		reconcile_ontologies: { permission: 'developer', handler: toolOntologyParserReconcile },
		repair_tlds: { permission: 'developer', handler: toolOntologyParserRepairTlds },
		regenerate_ontologies: { permission: 'developer', handler: toolOntologyParserRegenerate },
		export_ontologies: { permission: 'developer', handler: toolOntologyParserExport },
	},
};
