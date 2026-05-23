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
 *           four read-only context tools ignore it.
 * The model sees both client and MCP tools as identical function declarations;
 * the runtime routes by `client_` prefix.
 */
export const CLIENT_TOOLS = Object.freeze([

	{
		name		: 'client_get_current_context',
		description	: 'Get the current section, record, active component and a summary of all loaded fields in the current record. No arguments. Use this first when the user asks about what is on screen.',
		parameters	: {
			type		: 'object',
			properties	: {}
		},
		run			: (ctx) => ctx.get_context_summary()
	},

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

	{
		name		: 'client_list_section_data',
		description	: 'List every field in the current record with its label and current value. Can be large; prefer client_search_loaded_data for targeted lookups. No server call.',
		parameters	: {
			type		: 'object',
			properties	: {}
		},
		run			: (ctx) => ctx.get_section_components()
	},

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
