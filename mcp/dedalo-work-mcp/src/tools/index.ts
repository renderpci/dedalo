import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import type { ToolContext } from './_shared/register.js';
import { registerDiscoveryTools } from './primitives/discovery.js';
import { registerRecordsReadTools } from './primitives/records_read.js';
import { registerRecordsWriteTools } from './primitives/records_write.js';
import { registerComponentTools } from './primitives/components.js';
import { registerDiffusionTools } from './primitives/diffusion.js';
import { registerTimeMachineTools } from './primitives/time_machine.js';
import { registerFilesTools } from './primitives/files.js';
import { registerProcessTools } from './primitives/process.js';
import { registerSystemTools } from './primitives/system.js';
import { registerMaintenanceTools } from './primitives/maintenance.js';
import { registerAdminTools } from './primitives/admin.js';
import { registerAgentTools } from './agent/index.js';

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
	registerAgentTools(server, client, ctx);
}
