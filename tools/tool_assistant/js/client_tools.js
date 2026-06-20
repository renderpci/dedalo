// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
 * CLIENT_TOOLS
 * Tools that execute mostly in the browser by reading from the component
 * instances registry (instances_map). Pure-context tools never hit the
 * network; image tools call the configured vision endpoint plus a small
 * number of MCP calls.
 *
 * Each tool exposes the same { name, description, parameters } JSON-schema
 * shape as MCP tool declarations, plus a `run(ctx, args, host)` handler
 * invoked by `ai_assistant._dispatch_tool()`:
 *   - ctx  : `client_context` instance (loaded component data, SQO helpers)
 *   - args : object literal from the model
 *   - host : the `ai_assistant` instance — exposes mcp_client, chat_render,
 *           analyze_image_url(), and the bulk-approval slot. Optional; the
 *           five read-only context tools ignore it.
 * The model sees both client and MCP tools as identical function declarations;
 * the runtime routes by `client_` prefix.
 *
 * Tool taxonomy:
 *   Read-only context tools (no network, no `host` needed):
 *     client_get_current_context, client_read_component_value,
 *     client_list_section_data, client_search_loaded_data,
 *     client_get_active_search
 *   Vision tools (require `host.analyze_image_url`, no MCP write):
 *     client_analyze_image_url, client_analyze_image
 *   Bulk write tool (requires `host`, MCP write, user confirmation):
 *     client_bulk_image_transcribe
 *
 * All `run` handlers return a value that `_dispatch_tool` will JSON-stringify
 * and inject as a tool-result message. Returning a plain string is safe;
 * returning an object lets the model reference individual keys.
 *
 * Frozen array: entries must not be mutated at runtime. New tools are added
 * here at build time only.
 */
export const CLIENT_TOOLS = Object.freeze([

	/**
	 * TOOL: client_get_current_context
	 * Returns a formatted multi-line snapshot of what is currently on screen:
	 * the active section tipo, record id, focused component, and a truncated
	 * preview of every loaded field value (up to 20 fields shown).
	 *
	 * This is the recommended first call when the user says "tell me about this
	 * record" or "what am I looking at" — it gives the model a compact overview
	 * before deciding whether to drill deeper via other tools.
	 *
	 * No arguments. No network call. Delegates to `ctx.get_context_summary()`.
	 *
	 * @returns {string|null} Newline-joined context string, or null when no
	 *   section/component context is available yet (e.g. still loading).
	 */
	{
		name		: 'client_get_current_context',
		description	: 'Get the current section, record, active component and a summary of all loaded fields in the current record. No arguments. Use this first when the user asks about what is on screen.',
		parameters	: {
			type		: 'object',
			properties	: {}
		},
		run			: (ctx) => ctx.get_context_summary()
	},

	/**
	 * TOOL: client_read_component_value
	 * Reads the full display value of a single component identified by its
	 * ontology tipo (e.g. "numisdata18"). The value is extracted from the
	 * already-loaded browser instance — no server round-trip.
	 *
	 * Prefer this over client_list_section_data when the model already knows
	 * which field it needs (e.g. the user says "translate this description").
	 *
	 * Text-area fields are returned HTML-stripped. Relation/portal fields are
	 * returned as "[section_tipo#id, ...]" locator lists. Passwords are masked.
	 * See `client_context.get_value_string()` for the full per-model branch.
	 *
	 * @param {Object} args
	 * @param {string} args.component_tipo - Ontology tipo of the target component.
	 *   Obtain from the "Context:" line produced by client_get_current_context.
	 * @param {string} [args.lang] - Optional language code (e.g. "lg-eng").
	 *   When omitted, the first instance with the matching tipo is used regardless
	 *   of language.
	 * @returns {string|null} The display value string, or null when no matching
	 *   instance is found in the registry.
	 */
	{
		name		: 'client_read_component_value',
		description	: 'Read the value of a component field by its tipo in the currently loaded record. Use this for "this component" / "this field" / a field mentioned by label. Returns plain text. No server call.',
		parameters	: {
			type		: 'object',
			properties	: {
				component_tipo	: {
					type		: 'string',
					description	: 'The ontology tipo of the component (e.g. numisdata18). Use the value from the Context line.'
				},
				lang			: {
					type		: 'string',
					description	: 'Optional language code (e.g. lg-eng, lg-spa). Omit to use the active language.'
				}
			},
			required	: ['component_tipo']
		},
		run			: (ctx, args) => ctx.get_component_value(args.component_tipo, args.lang)
	},

	/**
	 * TOOL: client_list_section_data
	 * Returns all component instances loaded for the current record, each as a
	 * `{ tipo, label, model, value, lang, mode, section_tipo, section_id }`
	 * summary object. Values are normalized by model type (same rules as
	 * client_read_component_value). No server call.
	 *
	 * The result can be large (dozens of fields). Prefer
	 * client_search_loaded_data when looking for a specific keyword, or
	 * client_read_component_value when the tipo is already known.
	 *
	 * Deduplicates by tipo — only the first instance per tipo is included, so
	 * multi-lang duplicates with the same tipo collapse to one entry.
	 *
	 * @returns {Array} Array of component summary objects. Empty array when no
	 *   section context is active or no instances are loaded.
	 */
	{
		name		: 'client_list_section_data',
		description	: 'List every field in the current record with its label and current value. Can be large; prefer client_search_loaded_data for targeted lookups. No server call.',
		parameters	: {
			type		: 'object',
			properties	: {}
		},
		run			: (ctx) => ctx.get_section_components()
	},

	/**
	 * TOOL: client_search_loaded_data
	 * Case-insensitive substring search across all component labels and values
	 * in the currently loaded record. Returns only the matching entries as
	 * "label: value" strings — useful to find fields without knowing their tipo.
	 *
	 * Runs entirely in the browser against the already-loaded instance data.
	 * No server call, no pagination.
	 *
	 * Example use: "Does this record mention Rome?" → search for "rome".
	 *
	 * @param {Object} args
	 * @param {string} args.query - Case-insensitive text to search for.
	 *   Matched against both the component label and the normalized value string.
	 * @returns {Array} Array of "label: value" strings for matching components.
	 *   Empty array when nothing matches or no context is loaded.
	 */
	{
		name		: 'client_search_loaded_data',
		description	: 'Case-insensitive search across labels and values in the current record. Returns matching "label: value" lines.',
		parameters	: {
			type		: 'object',
			properties	: {
				query			: {
					type		: 'string',
					description	: 'Text to search for (case-insensitive). Matches against both field labels and values.'
				}
			},
			required	: ['query']
		},
		run			: (ctx, args) => ctx.search_loaded_data(args.query)
	},

	/**
	 * TOOL: client_analyze_image_url
	 * Sends any public image URL to the configured vision model and returns its
	 * textual response. Unlike client_analyze_image, this tool is not restricted
	 * to the current record — it accepts any URL, including URLs obtained from
	 * the MCP tool `dedalo_get_media_url` for records in other sections.
	 *
	 * Typical flow when the user asks about an image in a different section:
	 *   1. dedalo_get_media_url(section_tipo, section_id, component_tipo)
	 *   2. client_analyze_image_url(url, prompt)
	 *
	 * Requires `host` (the ai_assistant instance) with a working `analyze_image_url`
	 * method pointing to a vision-capable API endpoint configured in `api_url`.
	 *
	 * @param {Object} ctx - client_context instance (unused by this tool but
	 *   required by the dispatcher signature).
	 * @param {Object} args
	 * @param {string} args.url - Absolute public URL of the image to analyze.
	 *   Relative URLs will fail at the vision API. Obtain from dedalo_get_media_url.
	 * @param {string} args.prompt - Instruction for the vision model (e.g.
	 *   "describe", "identify the people", "transcribe any text").
	 * @param {Object} host - ai_assistant instance; must expose analyze_image_url().
	 * @returns {Promise<Object|string>} On success: `{ url, analysis }` where
	 *   `analysis` is the vision model's plain-text response.
	 *   On error: a plain error string (model sees it as the tool result).
	 */
	{
		name		: 'client_analyze_image_url',
		description	: 'Analyze an arbitrary image URL using the vision model. Works for images from ANY section (not just the current record). Use this when you get an image URL from dedalo_get_media_url for a record in another section. Returns the vision model\'s response as plain text.',
		parameters	: {
			type		: 'object',
			properties	: {
				url				: {
					type		: 'string',
					description	: 'Public image URL to analyze (obtained from dedalo_get_media_url).'
				},
				prompt			: {
					type		: 'string',
					description	: 'What to ask about the image (e.g. "describe", "identify the people").'
				}
			},
			required	: ['url', 'prompt']
		},
		run			: async (ctx, args, host) => {
			if (!host) return 'Internal error: host not provided.'
			if (!args.url) return 'Missing url argument.'
			const text = await host.analyze_image_url(args.url, args.prompt)
			return {
				url		: args.url,
				analysis: text
			}
		}
	},

	/**
	 * TOOL: client_analyze_image
	 * Analyzes an image belonging to the CURRENT record open in the browser.
	 * Resolves the image URL locally (no MCP call) via
	 * `ctx.get_active_image_url()`, then forwards to `host.analyze_image_url()`
	 * which calls the configured vision endpoint.
	 *
	 * Component selection priority:
	 *   1. `args.component_tipo` if provided and the instance is a media model.
	 *   2. The currently active (focused) component if it is a media model.
	 *   3. The first component_image / component_av instance found in the record.
	 *
	 * The `quality` argument maps to Dédalo's `files_info` quality key
	 * (e.g. "1.5MB", "original"). When omitted, the page-level default quality
	 * from `page_globals.dedalo_image_quality_default` is used, falling back to
	 * "1.5MB" then "original". Vision APIs require an absolute URL; the handler
	 * prepends `window.location.origin` when `DEDALO_MEDIA_URL` is root-relative.
	 *
	 * Do NOT use this tool for images in other sections — use the sequence
	 * dedalo_get_media_url → client_analyze_image_url instead.
	 *
	 * @param {Object} ctx - client_context instance; used to resolve the image URL.
	 * @param {Object} args
	 * @param {string} args.prompt - Instruction for the vision model.
	 * @param {string} [args.component_tipo] - Tipo of a specific image component.
	 *   Defaults to the active or first media component.
	 * @param {string} [args.quality] - Dédalo quality key for the file variant.
	 * @param {Object} host - ai_assistant instance; must expose analyze_image_url().
	 * @returns {Promise<Object|string>} On success: `{ field, url, analysis }` —
	 *   `field` is the component's human label, `url` is the resolved public URL,
	 *   `analysis` is the vision model's response. On error: a plain error string.
	 */
	{
		name		: 'client_analyze_image',
		description	: 'Describe / transcribe / answer questions about an image attached to the CURRENT loaded record. Uses a configured vision-capable model. By default targets the active media component; pass `component_tipo` to pick a specific image field. Returns plain text. Requires a vision-capable api_url.',
		parameters	: {
			type		: 'object',
			properties	: {
				prompt			: {
					type		: 'string',
					description	: 'What to ask about the image (e.g. "describe in one paragraph", "transcribe the legend").'
				},
				component_tipo	: {
					type		: 'string',
					description	: 'Optional tipo of the image component. Defaults to the active component or the first image in the record.'
				},
				quality			: {
					type		: 'string',
					description	: 'Optional Dédalo quality key (e.g. "1.5MB", "original"). Defaults to the page default.'
				}
			},
			required	: ['prompt']
		},
		run			: async (ctx, args, host) => {
			if (!host) return 'Internal error: host not provided to client_analyze_image.'

			const media = ctx.get_active_image_url(args.component_tipo, args.quality)
			if (!media || !media.url) {
				return 'No image found in the current record. Open a record that has an image (or pass component_tipo).'
			}

			const text = await host.analyze_image_url(media.url, args.prompt)
			return {
				field			: media.label,
				url				: media.url,
				analysis		: text
			}
		}
	},

	/**
	 * TOOL: client_get_active_search
	 * Inspects the section-list instance currently open in the browser to reveal
	 * the user's active search state without modifying it. Returns the section
	 * tipo, total matched records, and a compact human-readable filter summary
	 * (e.g. "section=oh1 | total=42 | filter_rules=2").
	 *
	 * Call this BEFORE client_bulk_image_transcribe to let the model confirm the
	 * scope with the user ("You are about to process 42 records in section oh1.
	 * Shall I proceed?").
	 *
	 * The SQO (Search Query Object) is read from the live section instance via
	 * `ctx.get_active_sqo()`. The returned SQO clone is not exposed to the model
	 * — only the summary string is returned, which intentionally omits tipos to
	 * avoid overwhelming the model with raw ontology identifiers.
	 *
	 * @returns {Object|string} On success: `{ section_tipo, total, summary }`.
	 *   `total` is null when the section has not yet reported a count.
	 *   On failure (no section open): a plain error string.
	 */
	{
		name		: 'client_get_active_search',
		description	: 'Inspect the user\'s current search in the section list. Returns the active section, total records, and a compact filter summary. Use this BEFORE client_bulk_image_transcribe to confirm what will be processed.',
		parameters	: {
			type		: 'object',
			properties	: {}
		},
		run			: (ctx) => {
			const info = ctx.get_active_sqo()
			if (!info) return 'No active search. The user must open a section list (and optionally run a search) first.'
			return {
				section_tipo	: info.section_tipo,
				total			: info.total,
				summary			: ctx.summarize_sqo()
			}
		}
	},

	/**
	 * TOOL: client_bulk_image_transcribe
	 * Iterates every record in the user's current search, reads the image
	 * identified by `image_field` label, calls the vision model with `prompt`,
	 * and writes the result into the text component identified by `target_field`
	 * label — one MCP `dedalo_save_record` call per record.
	 *
	 * Before processing any record, the tool presents a single batch confirmation
	 * dialog via `host.run_bulk_image_transcribe()`. The user must approve once;
	 * individual records are then processed strictly sequentially so progress can
	 * be tracked and errors isolated.
	 *
	 * Operational requirements:
	 *   - An active section list must be open (use client_get_active_search first).
	 *   - The configured `api_url` must support vision (multi-modal model).
	 *   - The MCP server must be connected (write access for dedalo_save_record).
	 *
	 * Pagination: records are fetched in pages of `page_size` (default 25, max 50)
	 * to avoid loading too many records at once. The optional `max_records` cap
	 * provides a safety limit — useful for dry runs on large result sets.
	 *
	 * The actual loop logic lives in `ai_assistant.run_bulk_image_transcribe()`.
	 * This entry is a thin gateway that guards the `host` reference.
	 *
	 * @param {Object} ctx - client_context instance forwarded to
	 *   host.run_bulk_image_transcribe for SQO access.
	 * @param {Object} args
	 * @param {string} args.prompt - Vision-model instruction applied to every image.
	 * @param {string} args.image_field - Human-readable label of the image component
	 *   (e.g. "Stamp image"). Matched case-insensitively by run_bulk_image_transcribe.
	 * @param {string} args.target_field - Human-readable label of the text component
	 *   that receives the vision output (e.g. "Description").
	 * @param {number} [args.max_records] - Maximum records to process. Defaults to
	 *   the full search total. Use for partial runs or testing.
	 * @param {number} [args.page_size] - Records per API page (1–50). Defaults to 25.
	 *   Lower values reduce memory pressure; higher values reduce API round-trips.
	 * @param {Object} host - ai_assistant instance; must expose run_bulk_image_transcribe().
	 * @returns {Promise<Object|string>} The summary object returned by
	 *   host.run_bulk_image_transcribe (processed/skipped/error counts), or a plain
	 *   error string if host is missing.
	 */
	{
		name		: 'client_bulk_image_transcribe',
		description	: 'For each record in the user\'s current search: read an image field, call the vision model, write the result into a target text field. Asks for ONE batch confirmation before starting. Requires an active section list and a vision-capable api_url. Strictly sequential.',
		parameters	: {
			type		: 'object',
			properties	: {
				prompt			: {
					type		: 'string',
					description	: 'Instruction sent to the vision model for every image (e.g. "describe the stamp in one short paragraph in English").'
				},
				image_field		: {
					type		: 'string',
					description	: 'Human label of the image component to read (e.g. "Stamp", "Image").'
				},
				target_field	: {
					type		: 'string',
					description	: 'Human label of the text component to write into (e.g. "Description", "Notes").'
				},
				max_records		: {
					type		: 'number',
					description	: 'Optional safety cap on the number of records processed. Defaults to the section total.'
				},
				page_size		: {
					type		: 'number',
					description	: 'Optional pagination page size (1..50). Defaults to 25.'
				}
			},
			required	: ['prompt', 'image_field', 'target_field']
		},
		run			: async (ctx, args, host) => {
			if (!host) return 'Internal error: host not provided to client_bulk_image_transcribe.'
			return host.run_bulk_image_transcribe(ctx, args)
		}
	}

])

// @license-end
