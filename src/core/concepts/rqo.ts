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
	})
	.passthrough();
export type RqoSource = z.infer<typeof rqoSourceSchema>;

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
