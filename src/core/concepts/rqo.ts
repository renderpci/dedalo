/**
 * RQO — Request Query Object (spec §3.2). The API request contract.
 *
 * Every client call to the Dédalo API is an RQO: which api class (`dd_api`)
 * and `action` to run, on which target (`source`), optionally with a search
 * (`sqo`) and with `show` / `search` / `choose` blocks whose ddo_maps say
 * which components to resolve and how deep (via ddo `parent` chaining — the
 * heart of the RQO, spec §3.4).
 *
 * PHP references:
 * - canonical keys: class.request_query_object.php:360 ($direct_keys)
 * - entry/dispatch:  core/api/v1/json/index.php → dd_manager::sanitize_client_rqo
 *                    → dd_manager::manage_request → <dd_api>::<action>($rqo)
 *
 * WIRE-CONTRACT NOTE: the user has authorized modernizing the wire contract
 * (the client call layer adapts at the seam). We keep the RQO's conceptual
 * shape and field names — they are the shared vocabulary with the ontology and
 * the copied client — and reserve renames/restructures for deliberate,
 * documented seam decisions, not incidental drift.
 */

import { z } from 'zod';
import { ddoMapSchema } from './ddo.ts';
import { sqoSchema } from './sqo.ts';

/**
 * The request target: what model/record/mode the action operates on.
 * PHP: rqo->source built client-side, validated server-side per action.
 */
export const rqoSourceSchema = z
	.object({
		/** Model name, e.g. 'section', 'component_input_text'. The real client
		 * sends explicit null on some save paths (component_text_area
		 * add_component_history_note builds its Code-save source with
		 * model:null); the server resolves the model from `tipo` (PHP parity —
		 * dd_core_api resolves via get_model_by_tipo when absent). */
		model: z.string().nullish(),
		/** Ontology tipo of the element to resolve. */
		tipo: z.string().optional(),
		/** Section the element lives in. */
		section_tipo: z.string().optional(),
		/** Record id (string or number in the wild). */
		section_id: z.union([z.number(), z.string()]).nullable().optional(),
		/** Render mode: edit | list | search | tm | ... */
		mode: z.string().optional(),
		/** Request language ('lg-*'). */
		lang: z.string().optional(),
		/** Sub-action discriminator used by some api methods (e.g. read → 'search').
		 * The real client sends explicit null when unset (browser E2E). */
		action: z.string().nullish(),
		/** Custom view name. */
		view: z.string().nullable().optional(),
		/**
		 * Element properties OVERRIDE (PHP dd_core_api read :2305-2308,
		 * `$element->set_properties($properties)`): the client ships the
		 * instance's declared properties with its reads (common.js
		 * create_source — TOOL components carry their ddo_map entry's
		 * properties this way) and the server must build config/data from
		 * THEM, not the ontology node (epigraphy coins portal: the override's
		 * sqo_config.limit 1 beats the ontology's 9). Nullish-tolerant like PHP
		 * (`?? null`) — an explicit null is NOT an override.
		 */
		properties: z.record(z.unknown()).nullish(),
		/**
		 * Time Machine read overrides (PHP dd_core_api :2372-2383,
		 * `$element->matrix_id` / `$element->data_source`): when `data_source` is
		 * 'tm' the component loads its value from the `matrix_time_machine` row
		 * identified by `matrix_id` instead of the live record — the
		 * tool_time_machine preview pane. Both must be present to take effect.
		 */
		matrix_id: z.union([z.number(), z.string()]).nullish(),
		data_source: z.string().nullish(),
		/**
		 * TEMPORAL instance (WC-059): a tool's throwaway editable clone — the
		 * propagate tool's value widget, service_tmp_section's staging form, the
		 * component_text_area draw/reference pickers. It ADDRESSES NO RECORD: the
		 * `section_id` it carries is a client-side sentinel (1), never an address.
		 * The save door routes it to `resolveTemporalSave` (resolve + echo, no
		 * write) and the read door resolves context with an empty value — unless the
		 * source ALSO carries `temporal_scope` (WC-079), which grafts the caller's
		 * own scratch row instead. The record-lifecycle doors refuse it either way.
		 * See core/section/record/temporal.ts.
		 *
		 * Declared — not left to `.passthrough()` — because that is exactly how it
		 * went unread for a whole engine generation while the client kept sending
		 * it, and `section_id: 1` landed on real records.
		 */
		is_temporal: z.boolean().nullish(),
		/**
		 * TEMPORAL SCRATCH scope (WC-079): names the OWNING TOOL of a temporal
		 * instance whose values must survive a reload, and is therefore also the
		 * lifetime holder — the tool that clears them once they are consumed.
		 *
		 * SEPARATE from `is_temporal` on purpose. That flag answers "does this
		 * address a record?"; this one answers "should this persist?". They are
		 * different questions with very different blast radii: of the five temporal
		 * producers only service_tmp_section wants persistence, and the other four
		 * would be CORRUPTED or pointlessly served by it —
		 * tool_propagate_component_data seeds its clone from the open record and then
		 * bulk-writes across a search result set; the component_text_area draw and
		 * reference pickers are transient, so a restored value is a stale locator
		 * stamped into a tag; and view_graph_solved_section builds its instance for
		 * the CONTEXT only and never saves. Conflating the two flags is how one
		 * producer's need becomes five producers' bug.
		 *
		 * A plain string, validated at the accessor (temporal_store.ts
		 * temporalScratchAddress) rather than as a z.enum: a stale client sending an
		 * unknown scope must degrade to today's no-persistence behaviour, not 400
		 * every save in the form.
		 */
		temporal_scope: z.string().max(64).nullish(),
		/**
		 * DATAFRAME PAIRING context (PHP source.caller_dataframe): which item of
		 * which main component the frame instance extends. The client sends it on
		 * EVERY component_dataframe request — read and save alike (common.js
		 * create_source :1184-94) — sourcing `id_key` from the last read echo.
		 *
		 * Declared rather than left to `.passthrough()` for the reason the
		 * `is_temporal` note above spells out: it rode through undeclared, only
		 * the SAVE door ever cast it out of the bag, and the READ door silently
		 * ignored it — so get_data served every frame in the slot regardless of
		 * which main item was open, and handed the client back an item with no
		 * `id_key` to echo. Nullish-tolerant: a caller without a pairing (search
		 * mode, maintenance) is legitimate and degrades to the unpaired read.
		 */
		caller_dataframe: z
			.object({
				main_component_tipo: z.string().nullish(),
				section_tipo: z.string().nullish(),
				section_id: z.union([z.number(), z.string()]).nullish(),
				id_key: z.union([z.number(), z.string()]).nullish(),
			})
			.passthrough()
			.nullish(),
	})
	.passthrough();
export type RqoSource = z.infer<typeof rqoSourceSchema>;

/**
 * THE single reader of `source.caller_dataframe` (mirrors
 * `isTemporalSource` below): returns the pairing ONLY when it is complete
 * enough to scope a read or a write — a main component AND an item id.
 *
 * Everything else is a caller WITHOUT a pairing, which is legitimate (search
 * mode, the maintenance widgets) and must degrade to the unpaired path rather
 * than throw or, worse, pair against a partial context.
 */
export function callerDataframePairing(
	source: RqoSource | undefined,
): { main_component_tipo: string; id_key: number } | null {
	return dataframePairingOf(source?.caller_dataframe);
}

/**
 * THE pairing validity rule, shared by every door (read, save, merge).
 *
 * It exists as one function because it started as three: the read accepted any
 * finite id_key, the save demanded >= 1, and the merge accepted anything
 * non-null. That disagreement was a hole, not a nuance — `id_key: 0` or a
 * null `main_component_tipo` (which the client sends as
 * `self.caller?.tipo || null` whenever the caller instance is not threaded)
 * passed one gate and failed another, so a frame could be written through the
 * UNPAIRED path and land in exactly the unreadable shape this whole change set
 * exists to prevent.
 *
 * Item ids are 1-based and server-minted, so a valid pairing is an integer
 * >= 1 plus a non-empty main component tipo. `id_key` is returned as a NUMBER:
 * every consumer wants it numeric, and normalizing here means no caller has to
 * remember to (a string "abc" used to reach Math.trunc(Number(...)) and write
 * NaN, which the jsonb encoder then threw on, aborting the transaction).
 */
export function dataframePairingOf(
	caller: { main_component_tipo?: unknown; id_key?: unknown } | null | undefined,
): { main_component_tipo: string; id_key: number } | null {
	if (caller === null || caller === undefined) return null;
	const mainComponentTipo = caller.main_component_tipo;
	if (typeof mainComponentTipo !== 'string' || mainComponentTipo === '') return null;
	const idKey = caller.id_key;
	if (idKey === null || idKey === undefined || idKey === '') return null;
	const numericIdKey = Number(idKey);
	if (!Number.isInteger(numericIdKey) || numericIdKey < 1) return null;
	return { main_component_tipo: mainComponentTipo, id_key: numericIdKey };
}

/**
 * THE single reader of `source.is_temporal` (the invariant
 * test/unit/temporal_instance_tripwire.test.ts asserts). Every door calls this
 * predicate rather than touching the wire field, so the concept cannot acquire a
 * second, subtly different definition.
 *
 * It lives HERE, beside the field declaration, rather than in
 * core/section/record/temporal.ts (which owns the BEHAVIOUR) because this module
 * is a leaf: `section/read.ts` needs the predicate, and temporal.ts reaches back
 * into read.ts, so a predicate defined there would close a static import cycle
 * (import_scc_tripwire).
 *
 * STRICT `=== true`: a string 'false' or a stray 0 must not open the
 * non-persisting path, and an absent flag is an ordinary record request.
 */
export function isTemporalSource(source: RqoSource | undefined | null): boolean {
	return (source as { is_temporal?: unknown } | undefined | null)?.is_temporal === true;
}

/**
 * A show/search/choose block: a ddo_map plus optional per-block SQO tweaks.
 * PHP: request_config 'show'/'search'/'choose' objects.
 */
export const rqoDdoBlockSchema = z
	.object({
		ddo_map: ddoMapSchema.optional(),
		sqo_config: z.record(z.unknown()).optional(),
	})
	.passthrough();

/**
 * The RQO. Field set mirrors PHP request_query_object::$direct_keys — the
 * canonical wire vocabulary.
 */
export const rqoSchema = z
	.object({
		/** Optional request identifier (client correlation). */
		id: z.union([z.string(), z.number()]).optional(),
		/** Resolution engine; 'dedalo' unless an external engine is configured. */
		api_engine: z.string().optional(),
		/** API class to dispatch to, e.g. 'dd_core_api'. Allowlisted (§7.1). */
		dd_api: z.string().optional(),
		/** Action (method) to run, e.g. 'read', 'save', 'search'. Allowlisted (§7.1). */
		action: z.string(),
		source: rqoSourceSchema.optional(),
		/** Search query for read/search actions. Sanitized at the boundary (§7.5). */
		sqo: sqoSchema.optional(),
		show: rqoDdoBlockSchema.optional(),
		search: rqoDdoBlockSchema.optional(),
		choose: rqoDdoBlockSchema.optional(),
		/** Payload for write actions (save/delete/...). Shape is action-specific. */
		data: z.unknown().optional(),
		/**
		 * Accepted for wire compatibility but INERT by design (SECTION_SPEC §10):
		 * in PHP this gated session_write_close() before long queries — a
		 * PHP-session-runtime concern with no Bun equivalent (Bun sessions are not
		 * file-locked). The real client and the MCP write tools set it; the TS
		 * server neither needs nor honors it. NOT related to the component edit
		 * locks (section/locks.ts).
		 */
		prevent_lock: z.boolean().optional(),
		/** Action-specific options bag (file uploads, etc.). May carry a nested sqo. */
		options: z.record(z.unknown()).optional(),
		/** Pretty-print the JSON response (dev aid). */
		pretty_print: z.boolean().optional(),
	})
	.passthrough();

export type Rqo = z.infer<typeof rqoSchema>;

/**
 * Standard API response envelope (PHP dd_manager response shape).
 * Captured here so parity fixtures can be schema-checked from day one.
 */
export const apiResponseSchema = z
	.object({
		result: z.unknown(),
		msg: z.union([z.string(), z.array(z.string())]).optional(),
		error: z.unknown().optional(),
		errors: z.array(z.unknown()).optional(),
	})
	.passthrough();
export type ApiResponse = z.infer<typeof apiResponseSchema>;
