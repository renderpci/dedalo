/**
 * Shared tool types (the runtime registry face). The ToolServerModule plugin
 * contract lives in ./module.ts; this file holds the data shapes the registry
 * reader and the section/component tool filter produce and consume.
 */

/**
 * One toolbar-entry DDO (PHP tool_common::create_tool_simple_context). This is
 * the object the client toolbar renders and the object `open_tool` clones as a
 * tool's caller context.
 */
export interface ToolSimpleContext {
	typo: 'ddo';
	type: 'tool';
	section_tipo: string;
	mode: 'edit';
	model: string;
	/** Present only when the tool has view/open_as properties (dd_object drops null). */
	properties?: unknown;
	label: string;
	css: { url: string };
	name: string;
	icon: string;
	show_in_inspector: boolean;
	show_in_component: boolean;
}

/** The element an element-tools filter runs against (PHP common::get_tools $this). */
export interface ElementToolsTarget {
	/** The element's runtime model (e.g. 'section', 'component_input_text'). */
	model: string;
	tipo: string;
	/** True for component_* models (enables the 'all_components' catch-all). */
	isComponent: boolean;
	/** The element's translatable flag (components: gates requirement_translatable). */
	translatable: boolean;
	/** Keys of the element's own properties.tool_config (in_properties match). */
	toolConfigKeys: string[];
}

/** Result of the element-tools filter, with the availability-ledgered tools. */
export interface ElementToolsResult {
	tools: ToolSimpleContext[];
	/** Tools omitted because their availability decision is ledgered. */
	ledgered: string[];
}
