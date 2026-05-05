import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import type { ToolContext } from './_shared/register.js';
import { registerDiscoveryTools } from './discovery.js';
import { registerRecordsReadTools } from './records_read.js';
import { registerRecordsWriteTools } from './records_write.js';
import { registerComponentTools } from './components.js';
import { registerDiffusionTools } from './diffusion.js';
import { registerTimeMachineTools } from './time_machine.js';
import { registerFilesTools } from './files.js';
import { registerProcessTools } from './process.js';
import { registerSystemTools } from './system.js';
import { registerMaintenanceTools } from './maintenance.js';
import { registerAdminTools } from './admin.js';

/**
 * Register every dedalo-work-mcp tool. Authorisation is enforced by
 * Dédalo's user/profile system, so all tools register unconditionally.
 */
export function registerAllTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerDiscoveryTools(server, client, ctx);
	registerRecordsReadTools(server, client, ctx);
	registerRecordsWriteTools(server, client, ctx);
	registerComponentTools(server, client, ctx);
	registerDiffusionTools(server, client, ctx);
	registerTimeMachineTools(server, client, ctx);
	registerFilesTools(server, client, ctx);
	registerProcessTools(server, client, ctx);
	registerSystemTools(server, client, ctx);
	registerMaintenanceTools(server, client, ctx);
	registerAdminTools(server, client, ctx);
}
