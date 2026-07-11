/**
 * LLM provider seam for the Dédalo agent loop (spec §8, greenfield).
 *
 * The loop depends only on these types — a thin, provider-neutral slice of the
 * Messages-API tool-use shapes (assistant turns made of text + tool_use
 * blocks, tool results fed back as user content). The REAL provider
 * (anthropic_provider.ts, official SDK) and the deterministic SCRIPTED
 * provider used by the offline gates both implement this one interface, so
 * the whole loop — including its ACL behavior — is testable without keys.
 */

/** A tool the loop offers the model (JSON-schema input, MCP-style). */
export interface AgentToolDefinition {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

/** One tool invocation requested by the model. */
export interface AgentToolUse {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** One assistant turn: optional text plus zero or more tool calls. */
export interface AgentAssistantTurn {
	text: string;
	tool_uses: AgentToolUse[];
	/** 'tool_use' keeps the loop running; anything else ends it. */
	stop_reason: 'tool_use' | 'end_turn' | 'max_tokens' | 'refusal';
	/**
	 * Provider-native content blocks of this turn, echoed VERBATIM when the
	 * transcript is replayed to the SAME provider. Opaque to the loop. This is
	 * how thinking blocks survive replay (Opus adaptive thinking + tool use
	 * requires passing them back unchanged); providers that don't need it
	 * simply omit it and the transcript is reconstructed from text/tool_uses.
	 */
	provider_content?: unknown;
	/** Per-turn token usage when the provider reports it. */
	usage?: AgentTurnUsage;
}

/** Token usage for one provider turn (all fields optional/provider-dependent). */
export interface AgentTurnUsage {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
}

/**
 * Streaming deltas a provider MAY emit while producing a turn. The `thinking`
 * delta is an indicator only — reasoning text is never forwarded.
 */
export type AgentTurnDelta =
	| { type: 'text_delta'; text: string }
	| { type: 'thinking'; state: 'start' | 'stop' }
	| { type: 'tool_input_start'; name: string };

/** A tool result the loop feeds back (JSON-serialized by the loop). */
export interface AgentToolResult {
	tool_use_id: string;
	content: string;
	is_error: boolean;
}

/** The provider contract: given the running transcript, produce a turn. */
export interface AgentLlmProvider {
	readonly name: string;
	createTurn(
		request: {
			system: string;
			tools: AgentToolDefinition[];
			/** The user question followed by alternating tool exchanges. */
			transcript: AgentTranscriptEntry[];
		},
		/** Optional streaming sink — a provider that can stream calls it per delta. */
		onDelta?: (delta: AgentTurnDelta) => void,
	): Promise<AgentAssistantTurn>;
}

/** An image attached to a user entry (vision input for the flagship flow). */
export type AgentImage =
	| {
			media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
			data_base64: string;
	  }
	| { url: string };

/** Transcript entries the loop maintains (provider-neutral). */
export type AgentTranscriptEntry =
	| { role: 'user'; text: string; images?: AgentImage[] }
	| { role: 'assistant'; turn: AgentAssistantTurn }
	| { role: 'tool_results'; results: AgentToolResult[] };
