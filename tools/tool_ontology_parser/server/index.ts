/**
 * tool_ontology_parser server module — inspect, rebuild & export ontology
 * definitions. DEVELOPER-only (PHP assert_developer); handlers re-assert the flag internally.
 *
 * The dd_ontology write lives in core/ontology/ontology_state.ts (the single rebuild
 * authority); this module only gates + surfaces it. `regenerate_ontologies` is the
 * transactional wipe-and-rebuild — the ONE write door onto the projection (the incremental
 * `reconcile_ontologies` companion was removed 2026-08-11: see the ontology_state.ts header
 * for why a transactional rebuild makes it redundant). `inspect_ontologies` is the read the
 * client's status panel renders. `repair_tlds` is the
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
	toolOntologyParserRegenerate,
	toolOntologyParserRepairTlds,
} from './tool_ontology_parser.ts';

export const tool: ToolServerModule = {
	name: 'tool_ontology_parser',
	apiActions: {
		get_ontologies: { permission: 'developer', handler: toolOntologyParserGetOntologies },
		inspect_ontologies: { permission: 'developer', handler: toolOntologyParserInspect },
		repair_tlds: { permission: 'developer', handler: toolOntologyParserRepairTlds },
		regenerate_ontologies: { permission: 'developer', handler: toolOntologyParserRegenerate },
		export_ontologies: { permission: 'developer', handler: toolOntologyParserExport },
	},
};
