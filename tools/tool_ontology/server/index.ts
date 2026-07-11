/**
 * tool_ontology server module — write ontology definition records.
 *
 * set_records_in_dd_ontology: DEVELOPER-only (PHP assert_developer); the handler
 * also asserts the developer flag internally (defense in depth).
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import { toolOntologySetRecords } from './tool_ontology.ts';

export const tool: ToolServerModule = {
	name: 'tool_ontology',
	apiActions: {
		set_records_in_dd_ontology: { permission: 'developer', handler: toolOntologySetRecords },
	},
};
