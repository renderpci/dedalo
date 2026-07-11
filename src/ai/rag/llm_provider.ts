/**
 * Pluggable generation-LLM facade for the RAG `ask()` grounded-Q&A path (port of
 * `src/ai/rag2/src/llm_provider.ts`, Brick 5). Self-contained — no core deps.
 *
 *   - HttpLlmProvider: POSTs to an OpenAI-compatible endpoint
 *     (DEDALO_RAG_LLM_{ENDPOINT,MODEL,API_KEY}). The EGRESS decision (external
 *     generation allowed?) is the CALLER's; this provider only performs transport.
 *   - StubLlmProvider: deterministic, no-network. Echoes a templated answer that
 *     cites each passage so tests assert grounding end-to-end (and that generate()
 *     is NOT called on a refusal).
 *
 * The answer is returned VERBATIM (never escaped here — the client escapes at
 * render). Usage is discovered from the response, never hard-coded.
 */

/** One grounding passage handed to the LLM (provenance + the text to cite). */
export interface LlmPassage {
	sectionTipo: string;
	sectionId: number;
	componentTipo?: string | null;
	lang?: string | null;
	chunkIndex?: number | null;
	sourceText: string;
}

/** A citation tying answer → passage. */
export interface LlmCitation {
	/** The passage locator, e.g. "oh1-23". */
	locator: string;
	sectionTipo: string;
	sectionId: number;
	/** The (sub)text the answer drew from this passage, when reported. */
	citedText?: string;
}

export interface LlmGenerateOptions {
	system: string;
	prompt: string;
	/** The flattened grounding context (passage texts). */
	context: string;
	/** The structured passages (for citation + stub echo). */
	passages: LlmPassage[];
	maxTokens?: number;
}

export interface LlmUsage {
	inputTokens?: number;
	outputTokens?: number;
	[k: string]: number | undefined;
}

export interface LlmResult {
	/** The raw model answer (NEVER escaped here — caller renders/escapes). */
	answer: string;
	model: string;
	/** The provider that served it (for the envelope's used_provider). */
	usedProvider: string;
	citations: LlmCitation[];
	usage?: LlmUsage;
}

export interface LlmProvider {
	/**
	 * Generate a grounded answer. THROWS on transport/protocol failure (the caller
	 * maps a throw to a `generation_failed` envelope — it never fabricates an answer).
	 */
	generate(opts: LlmGenerateOptions): Promise<LlmResult>;
	/** The configured generation model id. */
	model(): string;
}

/** Build the "section_tipo-section_id" locator string for a passage. */
export function passageLocator(p: { sectionTipo: string; sectionId: number }): string {
	const st = (p.sectionTipo ?? '').toString();
	const sid = p.sectionId ?? 0;
	return `${st}-${sid}`.replace(/^-+|-+$/g, '');
}

// ──────────────────────────────── HTTP provider ─────────────────────────────

export interface HttpLlmConfig {
	endpoint: string;
	model: string;
	apiKey?: string;
	maxOutputTokens?: number;
	temperature?: number;
	timeoutMs?: number;
	/** Injectable fetch (defaults to global fetch). For tests. */
	fetchImpl?: typeof fetch;
}

/**
 * OpenAI-compatible chat-completions provider. Flattens passages into the prompt
 * so a local TEI/vLLM/llama.cpp endpoint or any OpenAI-compatible API works with
 * no code changes. Egress is decided by the caller, not here.
 */
export class HttpLlmProvider implements LlmProvider {
	private readonly fetchImpl: typeof fetch;

	constructor(private readonly cfg: HttpLlmConfig) {
		this.fetchImpl = cfg.fetchImpl ?? fetch;
	}

	model(): string {
		return this.cfg.model;
	}

	async generate(opts: LlmGenerateOptions): Promise<LlmResult> {
		const maxTokens = opts.maxTokens ?? this.cfg.maxOutputTokens ?? 1024;
		const userContent =
			opts.context.trim() === ''
				? opts.prompt
				: `Context:\n${opts.context}\n\nQuestion: ${opts.prompt}`;

		const payload: Record<string, unknown> = {
			model: this.cfg.model,
			max_tokens: maxTokens,
			temperature: this.cfg.temperature ?? 0,
			messages: [
				{ role: 'system', content: opts.system },
				{ role: 'user', content: userContent },
			],
		};

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.cfg.apiKey) headers.Authorization = `Bearer ${this.cfg.apiKey}`;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 60_000);
		let response: Response;
		try {
			response = await this.fetchImpl(this.cfg.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) throw new Error(`llm_http_${response.status}`);
		const decoded = (await response.json()) as unknown;
		const answer = extractOpenAiAnswer(decoded);
		if (answer === null) throw new Error('llm_bad_response');

		const usage = extractUsage(decoded);
		return {
			answer,
			model: extractModel(decoded) ?? this.cfg.model,
			usedProvider: 'http',
			citations: opts.passages.map((p) => ({
				locator: passageLocator(p),
				sectionTipo: p.sectionTipo,
				sectionId: p.sectionId,
			})),
			...(usage ? { usage } : {}),
		};
	}
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/** Pull the assistant text out of an OpenAI chat-completions response (or null). */
function extractOpenAiAnswer(decoded: unknown): string | null {
	if (!isObject(decoded)) return null;
	const choices = decoded.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const first = choices[0];
		if (isObject(first)) {
			const message = first.message;
			if (isObject(message) && typeof message.content === 'string') return message.content;
			if (typeof first.text === 'string') return first.text;
		}
	}
	return null;
}

function extractModel(decoded: unknown): string | null {
	if (isObject(decoded) && typeof decoded.model === 'string') return decoded.model;
	return null;
}

/** Discover usage counts from common shapes (never hard-coded). */
function extractUsage(decoded: unknown): LlmUsage | undefined {
	if (!isObject(decoded)) return undefined;
	const usage = decoded.usage;
	if (!isObject(usage)) return undefined;
	const out: LlmUsage = {};
	const inTok = usage.prompt_tokens ?? usage.input_tokens;
	const outTok = usage.completion_tokens ?? usage.output_tokens;
	if (typeof inTok === 'number') out.inputTokens = inTok;
	if (typeof outTok === 'number') out.outputTokens = outTok;
	return Object.keys(out).length > 0 ? out : undefined;
}

// ──────────────────────────────── Stub provider ─────────────────────────────

export interface StubLlmConfig {
	model?: string;
}

/**
 * Deterministic, network-free provider for TESTS and dev when no model is
 * configured. NEVER reaches a network. The answer quotes a snippet of each passage
 * and cites every locator so a test can assert the answer is grounded in exactly
 * the retrieved passages. It records every call so a test can assert generate()
 * was NOT called on a refusal.
 */
export class StubLlmProvider implements LlmProvider {
	private readonly modelId: string;
	readonly calls: LlmGenerateOptions[] = [];

	constructor(cfg: StubLlmConfig = {}) {
		this.modelId = cfg.model ?? 'stub-llm';
	}

	model(): string {
		return this.modelId;
	}

	async generate(opts: LlmGenerateOptions): Promise<LlmResult> {
		this.calls.push(opts);
		const citations: LlmCitation[] = opts.passages.map((p) => ({
			locator: passageLocator(p),
			sectionTipo: p.sectionTipo,
			sectionId: p.sectionId,
			citedText: (p.sourceText ?? '').slice(0, 80).trim(),
		}));
		const cited = citations.map((c) => `[${c.locator}]`).join(' ');
		const snippetLine = citations.map((c) => `${c.locator}: ${c.citedText}`).join(' | ');
		const answer =
			`Based on ${opts.passages.length} passage(s) ${cited}, ` +
			`here is a grounded answer to "${opts.prompt.trim()}". Sources: ${snippetLine}`;
		return {
			answer,
			model: this.modelId,
			usedProvider: 'stub',
			citations,
			usage: {
				inputTokens: rough(opts.system) + rough(opts.context) + rough(opts.prompt),
				outputTokens: rough(answer),
			},
		};
	}
}

function rough(text: string): number {
	return Math.max(1, Math.ceil([...(text ?? '')].length / 4));
}
