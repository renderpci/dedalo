/**
 * Per-section / per-component RAG configuration, resolved from the ontology
 * `properties` object (no bespoke table — the Dédalo way). Port of PHP rag_config
 * (reference: `src/ai/rag2/src/rag_config.ts`, Brick 2), adapted to this branch's
 * functional ontology resolver via a small `OntologyPort` seam.
 *
 * A section opts in with   properties.rag = { enabled:true }
 * A component opts in with  properties.rag = { embed:true, strategy?, mode?, chunk:{max_tokens,min_tokens}?, system_prompt? }
 *
 * The `properties.rag.context` block (images/metadata/compare_scope) drives the
 * multimodal image layer (Brick 5) and is parsed here so the whole config surface
 * lives in one place.
 *
 * Per-INSTANCE cache (Maps on the object), NOT module-global — construct one
 * RagConfig per request/drain and inject it (spec §4 request isolation).
 */

import { readEnv } from '../../config/env.ts';
import {
	getModelByTipo,
	getNode,
	getRecursiveChildrenTipos,
	getTranslatableByTipo,
} from '../../core/ontology/resolver.ts';

export interface ChunkConfig {
	maxTokens?: number;
	minTokens?: number;
}

export interface ComponentRagConfig {
	embed: boolean;
	strategy?: string;
	mode?: string;
	chunk?: ChunkConfig;
	systemPrompt?: string;
}

/** One image component declared in properties.rag.context.images. */
export interface ContextImage {
	/** The image component tipo (e.g. 'rsc29'). */
	tipo: string;
	/** The face/view label (e.g. 'obverse'), or null. */
	view: string | null;
}

/**
 * The resolved properties.rag.context for a section:
 *   { images:[{tipo,view}], metadata:{role→componentTipo}, compareScope:[sectionTipo,…] }
 */
export interface RagContext {
	images: ContextImage[];
	metadata: Record<string, string>;
	compareScope: string[] | null;
}

/**
 * The ontology reads the config needs. Satisfied in production by
 * `defaultOntologyPort()` (over src/core/ontology/resolver.ts); a fake is
 * injected in unit tests so config resolution needs no DB.
 */
export interface OntologyPort {
	/** The full `properties` object of a tipo (or null). */
	getProperties(tipo: string): Promise<Record<string, unknown> | null>;
	/** Runtime model name of a tipo (or null). */
	getModelByTipo(tipo: string): Promise<string | null>;
	/** Whether the tipo's data carries language variants. */
	getTranslatable(tipo: string): Promise<boolean>;
	/** All descendant component tipos of a section (not crossing nested sections). */
	getRecursiveChildren(sectionTipo: string): Promise<string[]>;
}

/** Models whose components are candidates for text embedding
 * (PHP DEDALO_RAG_EMBEDDABLE_MODELS; comma list or JSON array). */
export const DEFAULT_EMBEDDABLE_MODELS: readonly string[] = (() => {
	const raw = (readEnv('DEDALO_RAG_EMBEDDABLE_MODELS', '') as string).trim();
	const fallback = ['component_text_area', 'component_input_text', 'component_text'];
	if (raw === '') return fallback;
	if (raw.startsWith('[')) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed.map(String);
		} catch {
			return fallback;
		}
	}
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
})();

export class RagConfig {
	private readonly ragCache = new Map<string, Record<string, unknown> | null>();
	private readonly embeddableCache = new Map<string, string[]>();
	private readonly contextCache = new Map<string, RagContext | null>();

	constructor(
		private readonly ontology: OntologyPort,
		private readonly embeddableModels: readonly string[] = DEFAULT_EMBEDDABLE_MODELS,
	) {}

	/** The `rag` sub-object of a tipo's properties (or null). Cached per instance. */
	async getRag(tipo: string): Promise<Record<string, unknown> | null> {
		const cached = this.ragCache.get(tipo);
		if (cached !== undefined) return cached;

		let rag: Record<string, unknown> | null = null;
		try {
			const props = await this.ontology.getProperties(tipo);
			const candidate = props?.rag;
			rag = isPlainObject(candidate) ? candidate : null;
		} catch {
			rag = null;
		}
		this.ragCache.set(tipo, rag);
		return rag;
	}

	/**
	 * Cheap gate: true when the section declares properties.rag.enabled === true.
	 * (The global kill-switch DEDALO_RAG_ENABLED is enforced at a higher layer —
	 * the save hook / API handler — not here; this resolves the ontology intent.)
	 */
	async sectionIsRagEnabled(sectionTipo: string): Promise<boolean> {
		const rag = await this.getRag(sectionTipo);
		return rag !== null && rag.enabled === true;
	}

	/** True when a component declares rag.embed === true. */
	async componentIsEmbeddable(componentTipo: string): Promise<boolean> {
		const rag = await this.getRag(componentTipo);
		return rag !== null && rag.embed === true;
	}

	/**
	 * Enumerate the section's text-bearing child components that opted in with
	 * rag.embed. Candidates are restricted to the embeddable models for efficiency,
	 * then filtered by the flag. Cached per instance.
	 */
	async getEmbeddableComponentTipos(sectionTipo: string): Promise<string[]> {
		const cached = this.embeddableCache.get(sectionTipo);
		if (cached !== undefined) return cached;

		const embeddableModelSet = new Set(this.embeddableModels);
		const out: string[] = [];
		try {
			const children = await this.ontology.getRecursiveChildren(sectionTipo);
			for (const childTipo of children) {
				const model = await this.ontology.getModelByTipo(childTipo);
				if (model === null || !embeddableModelSet.has(model)) continue;
				if (await this.componentIsEmbeddable(childTipo)) out.push(childTipo);
			}
		} catch {
			// leave out empty on failure
		}

		this.embeddableCache.set(sectionTipo, out);
		return out;
	}

	/** Per-component chunker config derived from rag.strategy / rag.mode / rag.chunk. */
	async getComponentRagConfig(componentTipo: string): Promise<ComponentRagConfig> {
		const rag = await this.getRag(componentTipo);
		const config: ComponentRagConfig = {
			embed: rag !== null && rag.embed === true,
			strategy: 'structural_semantic',
			mode: 'auto',
		};
		if (rag !== null) {
			if (typeof rag.strategy === 'string') config.strategy = rag.strategy;
			if (typeof rag.mode === 'string') config.mode = rag.mode;
			if (typeof rag.system_prompt === 'string') config.systemPrompt = rag.system_prompt;
			if (isPlainObject(rag.chunk)) {
				const chunk: ChunkConfig = {};
				if (typeof rag.chunk.max_tokens === 'number') chunk.maxTokens = rag.chunk.max_tokens;
				if (typeof rag.chunk.min_tokens === 'number') chunk.minTokens = rag.chunk.min_tokens;
				config.chunk = chunk;
			}
		}
		return config;
	}

	// ──────────────────────── properties.rag.context (images) ────────────────────

	/**
	 * Resolve properties.rag.context for a section into the normalized
	 * { images, metadata, compareScope } shape, or null when absent. Cached per
	 * instance. Drives the multimodal IMAGE layer (NOT the text rag.embed flag).
	 */
	async getContext(sectionTipo: string): Promise<RagContext | null> {
		const cached = this.contextCache.get(sectionTipo);
		if (cached !== undefined) return cached;

		let out: RagContext | null = null;
		const rag = await this.getRag(sectionTipo);
		const ctx = rag?.context;
		if (isPlainObject(ctx)) {
			out = {
				images: normalizeImages(ctx.images),
				metadata: normalizeMetadata(ctx.metadata),
				compareScope: normalizeCompareScope(ctx.compare_scope),
			};
		}
		this.contextCache.set(sectionTipo, out);
		return out;
	}

	/** True when the section declares at least one context image component. */
	async sectionHasImageContext(sectionTipo: string): Promise<boolean> {
		const ctx = await this.getContext(sectionTipo);
		return ctx !== null && ctx.images.length > 0;
	}

	/** The section's context image components [{tipo,view}] (empty when none). */
	async getContextImages(sectionTipo: string): Promise<ContextImage[]> {
		const ctx = await this.getContext(sectionTipo);
		return ctx?.images ?? [];
	}

	/** The section's role→componentTipo metadata map (typology/period/material/…). */
	async getContextMetadata(sectionTipo: string): Promise<Record<string, string>> {
		const ctx = await this.getContext(sectionTipo);
		return ctx?.metadata ?? {};
	}

	/**
	 * The compare scope for object similarity: the explicit section list when given,
	 * else [sectionTipo] ('same_section' default). Never empty.
	 */
	async getCompareScope(sectionTipo: string): Promise<string[]> {
		const ctx = await this.getContext(sectionTipo);
		const scope = ctx?.compareScope;
		if (scope && scope.length > 0) return scope;
		return [sectionTipo];
	}
}

/** The production ontology port, backed by this branch's resolver. */
export function defaultOntologyPort(): OntologyPort {
	return {
		async getProperties(tipo) {
			const node = await getNode(tipo);
			const props = node?.properties;
			return isPlainObject(props) ? props : null;
		},
		getModelByTipo,
		getTranslatable: getTranslatableByTipo,
		getRecursiveChildren: getRecursiveChildrenTipos,
	};
}

/** Normalize context.images: object {tipo,view} | bare-string tipo; drop empty tipos. */
function normalizeImages(raw: unknown): ContextImage[] {
	if (!Array.isArray(raw)) return [];
	const out: ContextImage[] = [];
	for (const entry of raw) {
		if (typeof entry === 'string') {
			if (entry !== '') out.push({ tipo: entry, view: null });
			continue;
		}
		if (isPlainObject(entry)) {
			const tipo = typeof entry.tipo === 'string' ? entry.tipo : '';
			if (tipo === '') continue;
			const view = typeof entry.view === 'string' && entry.view !== '' ? entry.view : null;
			out.push({ tipo, view });
		}
	}
	return out;
}

/** Normalize context.metadata: {role: componentTipo} keeping only non-empty string tipos. */
function normalizeMetadata(raw: unknown): Record<string, string> {
	if (!isPlainObject(raw)) return {};
	const out: Record<string, string> = {};
	for (const [role, tipo] of Object.entries(raw)) {
		if (typeof tipo === 'string' && tipo !== '') out[role] = tipo;
	}
	return out;
}

/** Normalize context.compare_scope: an array of section tipos, or null (→ same_section). */
function normalizeCompareScope(raw: unknown): string[] | null {
	if (!Array.isArray(raw)) return null;
	const out = raw.filter((x): x is string => typeof x === 'string' && x !== '');
	return out.length > 0 ? out : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}
