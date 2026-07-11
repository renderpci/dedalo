/**
 * tool_ontology_parser server module — parse, regenerate & export ontology
 * definitions.
 *
 * get_ontologies / regenerate_ontologies / export_ontologies: DEVELOPER-only
 * (PHP assert_developer); handlers assert the developer flag internally too.
 * export_ontologies runs the PHP :301-409 pipeline via
 * core/ontology/data_io.ts (update info → ontology.json → per-TLD COPY dumps
 * → matrix_dd private lists → LLM map).
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import {
	toolOntologyParserExport,
	toolOntologyParserGetOntologies,
	toolOntologyParserRegenerate,
} from './tool_ontology_parser.ts';

export const tool: ToolServerModule = {
	name: 'tool_ontology_parser',
	apiActions: {
		get_ontologies: { permission: 'developer', handler: toolOntologyParserGetOntologies },
		regenerate_ontologies: { permission: 'developer', handler: toolOntologyParserRegenerate },
		export_ontologies: { permission: 'developer', handler: toolOntologyParserExport },
	},
};
