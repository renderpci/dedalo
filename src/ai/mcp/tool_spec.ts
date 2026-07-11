/**
 * ToolSpec — the one declaration a Dédalo MCP tool consists of. Every surface
 * (stdio server, in-process HTTP bridge, agent loop, change-plan apply)
 * consumes the SAME specs from registry.ts, so the catalog cannot drift
 * between surfaces (review doc §1).
 *
 * This module holds only the type + the `defineTool` helper so the tool
 * modules (tools/*.ts) and the registry can both import it without forming a
 * static-import cycle (import_scc_tripwire).
 *
 * Annotations are HINTS for MCP clients (what to confirm, what to cache) —
 * authorization is decided by the engine gates inside the handler, never by
 * the annotation (reference caveat, adopted verbatim).
 */

import { z } from 'zod';
import type { Principal } from '../../core/security/permissions.ts';

export interface ToolAnnotations {
	readOnlyHint: boolean;
	destructiveHint: boolean;
	idempotentHint: boolean;
	/** Always false here: tools act on the closed Dédalo domain, not the web. */
	openWorldHint: boolean;
}

export interface ToolSpec {
	/** Tool name, always `dedalo_*` (coexists with other MCP servers). */
	name: string;
	title: string;
	description: string;
	/** primitive = engine-shaped; agent = LLM-friendly verb built on primitives. */
	tier: 'primitive' | 'agent';
	/** Write tools register only under the fail-closed opt-in gates. */
	write: boolean;
	annotations: ToolAnnotations;
	inputShape: z.ZodRawShape;
	/**
	 * The pure ACL-gated handler: throws plain engine errors (wrapError turns
	 * them into coded envelopes at the surface — see registry.runTool).
	 */
	handler: (principal: Principal, input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Declare a tool with a typed handler: the handler's input type is inferred
 * from the zod shape, and the spec is stored with the erased signature the
 * registry runs (runTool parses input through the same shape first, so the
 * cast is sound).
 */
export function defineTool<Shape extends z.ZodRawShape>(spec: {
	name: string;
	title: string;
	description: string;
	tier: 'primitive' | 'agent';
	write: boolean;
	annotations: ToolAnnotations;
	inputShape: Shape;
	handler: (principal: Principal, input: z.infer<z.ZodObject<Shape>>) => Promise<unknown>;
}): ToolSpec {
	return spec as unknown as ToolSpec;
}

/**
 * The generic structured-output shape declared as every tool's outputSchema
 * (the envelope is the contract; per-tool payload typing lives in the
 * handlers' TS return types, not in the wire schema — reference approach).
 */
export const STRUCTURED_OUTPUT_SHAPE = {
	ok: z.boolean(),
	data: z.unknown().optional(),
	pagination: z
		.object({
			total: z.number().nullable(),
			offset: z.number(),
			count: z.number(),
			has_more: z.boolean(),
			next_offset: z.number().nullable(),
		})
		.optional(),
	error: z
		.object({ code: z.string(), message: z.string(), hint: z.string().optional() })
		.optional(),
} satisfies z.ZodRawShape;
