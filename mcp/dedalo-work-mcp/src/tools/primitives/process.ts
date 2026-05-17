import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import type { ToolContext } from '../_shared/register.js';

/**
 * Async background-process tools.
 */
export function registerProcessTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	// no process tools registered
}
