// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
 * CLIENT_TOOLS
 * Read-only tools that execute entirely in the browser by reading from the
 * component instances registry (instances_map). No server round-trip needed.
 *
 * Each tool exposes the same { name, description, parameters } JSON-schema
 * shape as MCP tool declarations, plus a `run(ctx, args)` handler invoked by
 * `ai_assistant._dispatch_tool()`. The model sees both client and MCP tools
 * as identical function declarations; the runtime routes by `client_` prefix.
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
	}

])

// @license-end
