import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import type { ToolContext } from '../_shared/register.js';
import { registerSectionAgentTools } from './section.js';
import { registerRecordAgentTools } from './record.js';
import { registerSearchAgentTools } from './search.js';
import { registerMediaAgentTools } from './media.js';

/**
 * Register agent-tier tools.
 *
 * These are the stable, LLM-friendly surface (8 verbs in final form).
 * They wrap `dd_agent_api` and return human-label views so small models
 * never need to learn tipos, RQO, or portal mechanics.
 */
export function registerAgentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerSectionAgentTools(server, client, ctx);
	registerRecordAgentTools(server, client, ctx);
	registerSearchAgentTools(server, client, ctx);
	registerMediaAgentTools(server, client, ctx);
}
