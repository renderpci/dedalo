/**
 * Per-section RAG configuration, resolved from the ontology (no bespoke table —
 * the Dédalo way).
 *
 * TEXT opt-in (2026-07-22 redesign — the boolean era is DELETED): a section's
 * `section_map` node declares a `rag` scope whose `embed` is an ARRAY of named
 * GROUPS, each an exact request_config `ddo_map` (src/core/concepts/ddo.ts):
 *
 *   properties.rag = {
 *     embed: [ { id: 'default', ddo_map: [ {tipo, section_tipo, parent?, mode}, … ],
 *               chunk?: {max_tokens, min_tokens}, mode?, strategy? } ],
 *     strategy?, system_prompt?
 *   }
 *
 * Each group produces its OWN vector document per (record, dataLang), stored
 * under component_tipo `rag:<id>` — the facet unit (a person's "profession" vs
 * "filiation"; a "fulltext" transcription with its own chunking). The
 * section_map read is VIRTUAL-AWARE (own node wins, else the real section's via
 * relations[0].tipo — getSectionMap), so records keyed by a virtual tipo select
 * their own map. There is deliberately NO per-component `rag.embed` flag: a
 * shared component node cannot differentiate two virtual siblings.
 *
 * The `properties.rag.context` block (images/metadata/compare_scope) still
 * drives the multimodal image layer from the SECTION NODE's properties and is
 * parsed here so the whole config surface lives in one place.
 *
 * Per-INSTANCE cache (Maps on the object), NOT module-global — construct one
 * RagConfig per request/drain and inject it (spec §4 request isolation).
 */

import { type Ddo, ddoSchema } from '../../core/concepts/ddo.ts';
import { getModelByTipo, getNode, getTranslatableByTipo } from '../../core/ontology/resolver.ts';
import { getSectionMap } from '../../core/ontology/section_map.ts';

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

/** One named embed group: a request_config ddo_map + its chunking config. */
export interface RagEmbedGroup {
	/** Unique group id (slug ≤ 40 chars); the chunk storage key is `rag:<id>`. */
	id: string;
	/** The components that form this group's document — EXACT show.ddo_map shape. */
	ddoMap: Ddo[];
	chunk?: ChunkConfig;
	mode?: string;
	strategy?: string;
}

/** The storage-key prefix for group chunks in rag_embeddings.component_tipo. */
export const RAG_GROUP_PREFIX = 'rag:';

/** Group-id grammar: a slug that fits component_tipo (varchar 64) with the prefix. */
const GROUP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * The ontology reads the config needs. Satisfied in production by
 * `defaultOntologyPort()` (over src/core/ontology/resolver.ts +
 * section_map.ts); a fake is injected in unit tests so config resolution needs
 * no DB.
 */
export interface OntologyPort {
	/** The full `properties` object of a tipo (or null). */
	getProperties(tipo: string): Promise<Record<string, unknown> | null>;
	/** Runtime model name of a tipo (or null). */
	getModelByTipo(tipo: string): Promise<string | null>;
	/** Whether the tipo's data carries language variants. */
	getTranslatable(tipo: string): Promise<boolean>;
	/**
	 * The section's `section_map` `rag` scope, raw (or null). VIRTUAL-AWARE in
	 * production (getSectionMap: own node wins, else the real section's).
	 */
	getSectionMapRag(sectionTipo: string): Promise<Record<string, unknown> | null>;
}

export class RagConfig {
	private readonly ragCache = new Map<string, Record<string, unknown> | null>();
	private readonly groupsCache = new Map<string, RagEmbedGroup[]>();
	private readonly contextCache = new Map<string, RagContext | null>();

	constructor(private readonly ontology: OntologyPort) {}

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
	 * Cheap gate: true when the section's section_map declares at least one embed
	 * group with a non-empty ddo_map. (The global kill-switch DEDALO_RAG_ENABLED
	 * is enforced at a higher layer — the save hook / API handler — not here;
	 * this resolves the ontology intent.)
	 */
	async sectionIsRagEnabled(sectionTipo: string): Promise<boolean> {
		return (await this.getEmbedGroups(sectionTipo)).length > 0;
	}

	/**
	 * The section's embed groups from the section_map `rag.embed` array — the ONE
	 * canonical shape: `[{id, ddo_map, chunk?, mode?, strategy?}, …]`. Malformed
	 * or duplicate-id groups and non-ddo entries are dropped LOUDLY (console) —
	 * a typo must not silently index nothing without a trace. Cached per instance.
	 */
	async getEmbedGroups(sectionTipo: string): Promise<RagEmbedGroup[]> {
		const cached = this.groupsCache.get(sectionTipo);
		if (cached !== undefined) return cached;

		const out: RagEmbedGroup[] = [];
		try {
			const rag = await this.ontology.getSectionMapRag(sectionTipo);
			const raw = rag?.embed;
			if (Array.isArray(raw)) {
				const seen = new Set<string>();
				for (const entry of raw) {
					const group = parseEmbedGroup(entry, sectionTipo);
					if (group === null) continue;
					if (seen.has(group.id)) {
						console.error(
							`rag: duplicate embed group id '${group.id}' in ${sectionTipo} section_map — dropped`,
						);
						continue;
					}
					seen.add(group.id);
					out.push(group);
				}
			} else if (raw !== undefined) {
				console.error(
					`rag: section_map ${sectionTipo} rag.embed must be an ARRAY of {id, ddo_map} groups — got ${typeof raw}`,
				);
			}
		} catch {
			// leave out empty on failure (retryable at the indexer layer)
		}

		this.groupsCache.set(sectionTipo, out);
		return out;
	}

	/** The section_map `rag` scope, raw (virtual-aware; null on failure/absence). */
	async getSectionMapRag(sectionTipo: string): Promise<Record<string, unknown> | null> {
		return this.ontology.getSectionMapRag(sectionTipo).catch(() => null);
	}

	/**
	 * A group's chunker config: the group's own chunk/mode/strategy, falling back
	 * to the section-level `rag.strategy` / `rag.system_prompt` of the section_map
	 * scope. `embed` is true iff the group exists.
	 */
	async getGroupRagConfig(sectionTipo: string, groupId: string): Promise<ComponentRagConfig> {
		const groups = await this.getEmbedGroups(sectionTipo);
		const group = groups.find((g) => g.id === groupId);
		const rag = await this.ontology.getSectionMapRag(sectionTipo).catch(() => null);
		const config: ComponentRagConfig = {
			embed: group !== undefined,
			strategy: 'structural_semantic',
			mode: 'auto',
		};
		if (rag !== null && typeof rag?.strategy === 'string') config.strategy = rag.strategy;
		if (rag !== null && typeof rag?.system_prompt === 'string') {
			config.systemPrompt = rag.system_prompt;
		}
		if (group !== undefined) {
			if (typeof group.strategy === 'string') config.strategy = group.strategy;
			if (typeof group.mode === 'string') config.mode = group.mode;
			if (group.chunk !== undefined) config.chunk = group.chunk;
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

/** The production ontology port, backed by this branch's resolver + section_map. */
export function defaultOntologyPort(): OntologyPort {
	return {
		async getProperties(tipo) {
			const node = await getNode(tipo);
			const props = node?.properties;
			return isPlainObject(props) ? props : null;
		},
		getModelByTipo,
		getTranslatable: getTranslatableByTipo,
		async getSectionMapRag(sectionTipo) {
			// getSectionMap is the virtual-aware read: the virtual's OWN section_map
			// node wins; else the real section's (relations[0].tipo fallback).
			const map = await getSectionMap(sectionTipo);
			const rag = isPlainObject(map) ? map.rag : null;
			return isPlainObject(rag) ? rag : null;
		},
	};
}

/**
 * Parse ONE raw embed-group entry into the canonical RagEmbedGroup, or null
 * (loudly) when malformed. Every ddo entry is validated against the wire
 * `ddoSchema` — the map is server-stored ontology, but staying schema-valid
 * guarantees it feeds `emitDdoData` unmodified.
 */
function parseEmbedGroup(raw: unknown, sectionTipo: string): RagEmbedGroup | null {
	if (!isPlainObject(raw)) {
		console.error(`rag: non-object embed group in ${sectionTipo} section_map — dropped`);
		return null;
	}
	const id = typeof raw.id === 'string' ? raw.id : '';
	if (!GROUP_ID_RE.test(id)) {
		console.error(
			`rag: embed group with missing/invalid id in ${sectionTipo} section_map — dropped (need a slug ≤40 chars)`,
		);
		return null;
	}
	if (!Array.isArray(raw.ddo_map)) {
		console.error(`rag: embed group '${id}' in ${sectionTipo} has no ddo_map array — dropped`);
		return null;
	}
	const ddoMap: Ddo[] = [];
	for (const entry of raw.ddo_map) {
		const parsed = ddoSchema.safeParse(entry);
		if (!parsed.success || parsed.data.tipo === '') {
			console.error(
				`rag: invalid ddo entry in ${sectionTipo} group '${id}' — dropped: ${JSON.stringify(entry)}`,
			);
			continue;
		}
		ddoMap.push(parsed.data);
	}
	if (ddoMap.length === 0) return null;
	const group: RagEmbedGroup = { id, ddoMap };
	if (typeof raw.mode === 'string') group.mode = raw.mode;
	if (typeof raw.strategy === 'string') group.strategy = raw.strategy;
	if (isPlainObject(raw.chunk)) {
		const chunk: ChunkConfig = {};
		if (typeof raw.chunk.max_tokens === 'number') chunk.maxTokens = raw.chunk.max_tokens;
		if (typeof raw.chunk.min_tokens === 'number') chunk.minTokens = raw.chunk.min_tokens;
		group.chunk = chunk;
	}
	return group;
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
