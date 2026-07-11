/**
 * Dédalo MCP server — exposes the ontology-typed read/search core to LLM tools
 * over the Model Context Protocol (REWRITE_SPEC §8, greenfield). This is a THIN
 * transport shell: every tool comes from the shared registry (registry.ts) and
 * delegates to the pure, ACL-gated handlers in tools/*.ts. The server itself
 * holds no business logic and no privilege — it resolves ONE service principal
 * at startup (from DEDALO_MCP_USER_ID) and runs every tool call under that
 * principal, so the MCP surface can never see more than the configured Dédalo
 * user would through the web client.
 *
 * Run it (stdio transport, the MCP default for a locally-spawned server):
 *   DEDALO_MCP_USER_ID=<dd128 section_id> bun run src/ai/mcp/server.ts
 *   # add DEDALO_MCP_ALLOW_WRITE=true to also register the write tools
 *   # optionally DEDALO_MCP_WRITE_SECTIONS=oh1,rsc25 to allowlist writable sections
 *
 * Security posture: the principal is server-authoritative and fixed for the
 * process lifetime; there is no tool to change identity. The server is
 * READ-ONLY unless DEDALO_MCP_ALLOW_WRITE=true explicitly registers the write
 * tools (which enforce the same level>=2 permission gate as the human API and
 * audit every change in the Time Machine). A misconfigured or missing
 * DEDALO_MCP_USER_ID is a hard startup error — the server never silently
 * falls back to a privileged identity.
 *
 * WRITE MODE requires a LEAST-PRIVILEGE principal: because the same LLM also
 * reads untrusted, lower-trust record data, a prompt injected into that data
 * could steer a write/delete (a confused deputy). If the write tools ran under
 * an ambient global-admin/superuser they would execute those under full
 * authority. So write mode is REFUSED for a global-admin principal (a hard
 * error) and can be further narrowed to an allowlist of writable sections
 * (DEDALO_MCP_WRITE_SECTIONS). The superuser (-1) is fine for READ-ONLY.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readEnv } from '../../config/env.ts';
import { resolvePrincipal } from '../../core/security/permissions.ts';
import { asToolResult } from './envelope.ts';
import { type RegistryGates, registeredTools, runTool } from './registry.ts';
import { STRUCTURED_OUTPUT_SHAPE } from './tool_spec.ts';

/** Options for buildMcpServer. */
export interface McpServerOptions {
	/**
	 * Register the WRITE tools (save/create/delete). Default false — the server
	 * is read-only unless the deployment explicitly opts in via
	 * DEDALO_MCP_ALLOW_WRITE=true (fail-closed). REFUSED (throws) when the
	 * principal is a global admin — write mode demands a least-privilege user.
	 */
	allowWrite?: boolean;
	/**
	 * When non-empty, write tools may ONLY target these section tipos (an
	 * allowlist checked before the per-record permission gate). Sourced from
	 * DEDALO_MCP_WRITE_SECTIONS; empty/undefined ⇒ no extra section restriction.
	 */
	writableSections?: Set<string>;
}

/**
 * Build the MCP server for a given principal. Exposed as a function (rather than
 * run at import) so tests can construct a server with a test principal and so
 * the identity resolution stays explicit and injectable.
 */
export function buildMcpServer(
	principal: {
		userId: number;
		isGlobalAdmin: boolean;
		isDeveloper: boolean;
	},
	options: McpServerOptions = {},
): McpServer {
	// SECURITY INVARIANT (confused-deputy defense): write mode must run under a
	// LEAST-PRIVILEGE user, never an ambient global-admin/superuser. The agent
	// also ingests untrusted record data, so a prompt injected there could drive
	// a write/delete; under a broad principal that would execute with full
	// authority. Refuse to register write tools rather than widen access.
	if (options.allowWrite === true && principal.isGlobalAdmin) {
		throw new Error(
			'DEDALO_MCP_ALLOW_WRITE refused: the MCP service principal is a global admin/superuser. ' +
				'Write mode requires a scoped, least-privilege dd128 user — set DEDALO_MCP_USER_ID to a ' +
				'non-admin user carrying exactly the grants the agent needs.',
		);
	}

	const server = new McpServer({
		name: 'dedalo-core',
		version: '0.0.1',
	});

	const gates: RegistryGates = {
		allowWrite: options.allowWrite === true,
		writableSections: options.writableSections,
	};

	for (const spec of registeredTools(gates)) {
		server.registerTool(
			spec.name,
			{
				title: spec.title,
				description: spec.description,
				inputSchema: spec.inputShape,
				outputSchema: STRUCTURED_OUTPUT_SHAPE,
				annotations: spec.annotations,
			},
			// A refused call (permission, scope, allowlist) comes back as a
			// structured {ok:false, error} envelope with a model-facing hint —
			// never a transport-level crash the model cannot act on.
			async (args: Record<string, unknown>) =>
				asToolResult(await runTool(spec, principal, args, gates)),
		);
	}

	return server;
}

/**
 * Resolve the configured service principal from the environment. Hard-fails on a
 * missing/invalid DEDALO_MCP_USER_ID rather than defaulting to a privileged
 * identity — a fail-closed startup, per §7's "never silently widen access".
 */
async function resolveServicePrincipal() {
	// readEnv, NOT process.env: the documented precedence includes
	// ../private/.env (audit S2-21) — a raw read silently drops that half.
	const raw = readEnv('DEDALO_MCP_USER_ID');
	if (raw === undefined || raw.trim() === '') {
		throw new Error(
			'DEDALO_MCP_USER_ID is required: the MCP server runs every tool as this Dédalo user. ' +
				'Set it to a dd128 user section_id (or -1 for the superuser in trusted local dev — ' +
				'READ-ONLY only; write mode refuses a global-admin/superuser principal).',
		);
	}
	const userId = Number(raw);
	if (!Number.isInteger(userId)) {
		throw new Error(`DEDALO_MCP_USER_ID must be an integer user id, got: ${raw}`);
	}
	return resolvePrincipal(userId);
}

// Entry point: only run the stdio transport when invoked directly (not on import
// from a test). Bun sets import.meta.main for the entry module.
if (import.meta.main) {
	const principal = await resolveServicePrincipal();
	// Write tools require the explicit opt-in; anything else is read-only.
	const allowWrite = readEnv('DEDALO_MCP_ALLOW_WRITE') === 'true';
	const writableSections = new Set(
		(readEnv('DEDALO_MCP_WRITE_SECTIONS') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s !== ''),
	);
	const server = buildMcpServer(principal, { allowWrite, writableSections });
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
