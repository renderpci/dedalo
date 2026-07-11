/**
 * Barrel for the MCP tool handlers. The implementations moved to per-group
 * modules (tools/records_read.ts, tools/records_write.ts) when the registry
 * landed; this module keeps the original import surface stable for the gates
 * (test/unit/mcp_tools.test.ts, mcp_write_tools.test.ts) and the agent loop.
 * New tools are added to their group module + the registry, never here.
 */

export type {
	McpSearchFilter,
	SectionSearchHit,
	SectionSearchResult,
} from './tools/records_read.ts';
export {
	describeOntologyNode,
	readSectionRecord,
	searchSectionRecords,
} from './tools/records_read.ts';
export { createRecord, deleteRecord, saveComponentValue } from './tools/records_write.ts';
