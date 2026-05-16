import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerOntologyResources } from './ontology.js';

/**
 * Register all MCP resources for dedalo-work-mcp.
 * Resources expose Dédalo's ontology as readable MCP resources
 * that the LLM can proactively fetch.
 */
export function registerAllResources(server: McpServer, client: WorkClient): void {
	registerOntologyResources(server, client);
}
