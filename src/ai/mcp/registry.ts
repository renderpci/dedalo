/**
 * The Dédalo MCP tool registry — the ONE catalog every surface consumes:
 *
 *   - stdio MCP server (server.ts) registers these specs;
 *   - the in-process HTTP bridge (dd_mcp_api, Phase 5) lists/calls them;
 *   - the agent loop (src/ai/agent/loop.ts) derives its tool definitions;
 *   - change-plan apply (Phase 4) executes ops THROUGH runTool, never engines.
 *
 * One catalog means the surfaces cannot drift, and the write-scope tripwire
 * can enumerate `TOOL_REGISTRY.filter(t => t.write)` mechanically.
 *
 * `runTool` is the single execution chokepoint: input re-validation (the SDK
 * validates on the stdio path, but the HTTP bridge and the apply path enter
 * here directly), the write-section allowlist, and the error→envelope
 * translation all live HERE — a tool module only ever contains pure handlers.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentToolDefinition } from '../agent/llm_provider.ts';
import { Page, type Structured, err, ok, wrapError } from './envelope.ts';
import type { ToolSpec } from './tool_spec.ts';
import { DISCOVERY_SPECS } from './tools/discovery.ts';
import { FIELDS_WRITE_SPECS } from './tools/fields_write.ts';
import { MEDIA_SPECS } from './tools/media.ts';
import { RECORDS_READ_SPECS } from './tools/records_read.ts';
import { RECORDS_WRITE_SPECS } from './tools/records_write.ts';
import { SEARCH_SPECS } from './tools/search.ts';

/** Principal shape the registry needs (matches core/security Principal). */
export interface RegistryPrincipal {
	userId: number;
	isGlobalAdmin: boolean;
	isDeveloper: boolean;
}

/** Every tool, read and write. Registration gates decide what is EXPOSED. */
export const TOOL_REGISTRY: ToolSpec[] = [
	...DISCOVERY_SPECS,
	...RECORDS_READ_SPECS,
	...SEARCH_SPECS,
	...MEDIA_SPECS,
	...RECORDS_WRITE_SPECS,
	...FIELDS_WRITE_SPECS,
];

/** Options that scope a surface's view of the registry. */
export interface RegistryGates {
	/** Expose write tools (fail-closed: default false). */
	allowWrite?: boolean;
	/** When non-empty, write tools may only target these section tipos. */
	writableSections?: Set<string>;
}

/** The specs a surface may expose under its gates (read-only by default). */
export function registeredTools(gates: RegistryGates = {}): ToolSpec[] {
	return gates.allowWrite === true ? TOOL_REGISTRY : TOOL_REGISTRY.filter((spec) => !spec.write);
}

export function getToolSpec(name: string): ToolSpec | undefined {
	return TOOL_REGISTRY.find((spec) => spec.name === name);
}

/**
 * Execute one tool under a principal: parse input against the spec's shape,
 * enforce the write-section allowlist, run the pure handler, and translate
 * the outcome (value or thrown engine error) into the structured envelope.
 */
export async function runTool(
	spec: ToolSpec,
	principal: RegistryPrincipal,
	input: unknown,
	gates: RegistryGates = {},
): Promise<Structured> {
	const parsed = z.object(spec.inputShape).safeParse(input ?? {});
	if (!parsed.success) {
		return err('invalid_request', `Invalid input for ${spec.name}: ${parsed.error.message}`);
	}
	if (spec.write) {
		if (gates.allowWrite !== true) {
			return err(
				'permission_denied',
				`${spec.name} is a write tool and this surface is read-only (DEDALO_MCP_ALLOW_WRITE).`,
			);
		}
		const sectionTipo = (parsed.data as { section_tipo?: unknown }).section_tipo;
		if (
			gates.writableSections !== undefined &&
			gates.writableSections.size > 0 &&
			typeof sectionTipo === 'string' &&
			!gates.writableSections.has(sectionTipo)
		) {
			return err(
				'section_not_writable',
				`MCP write refused: section '${sectionTipo}' is not in the write allowlist (DEDALO_MCP_WRITE_SECTIONS).`,
			);
		}
	}
	try {
		// Handlers return raw payloads and THROW on refusal; the envelope is
		// applied here, once (a save outcome's own ok/message stays inside data).
		// A Page result carries its pagination up to the envelope top level.
		const result = await spec.handler(principal, parsed.data as Record<string, unknown>);
		return result instanceof Page ? ok(result.data, result.pagination) : ok(result);
	} catch (error) {
		return wrapError(error);
	}
}

/**
 * Project a spec into the provider-neutral tool definition the agent loop
 * offers the model (JSON-schema input, Messages-API shape).
 */
export function toAgentToolDefinition(spec: ToolSpec): AgentToolDefinition {
	return {
		name: spec.name,
		description: spec.description,
		input_schema: zodToJsonSchema(z.object(spec.inputShape), {
			$refStrategy: 'none',
		}) as Record<string, unknown>,
	};
}
