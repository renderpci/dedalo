// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {component_portal} from '../../component_portal/js/component_portal.js'



/**
* COMPONENT_RELATION_CHILDREN
* Client-side module for the component_relation_children component.
*
* component_relation_children is the inverse of component_relation_parent: it
* presents, from a parent record's perspective, the list of child records that
* point back to it via their own component_relation_parent. On the server side
* (class.component_relation_children.php) this involves a dedicated SQL query
* that traverses the JSONB matrix; on the client side, however, the rendering
* requirements are identical to those of component_portal — both render a
* paginated list of related section records inside an embedded portal view.
*
* Rather than duplicating component_portal's JavaScript, this module re-exports
* it under the component_relation_children name. The Dédalo client factory
* resolves the component model string returned by the API and calls
* `new component_relation_children()`, so any caller importing this module will
* get a fully functional portal instance whose lifecycle (init → render →
* destroy), event subscriptions, and pagination are handled by component_portal.
*
* Data shape consumed from the API response:
*   - context layer: standard component_portal context (tipo, section_tipo, mode, …)
*   - data layer:    array of locator objects produced by
*                    component_relation_children::get_data() on the server, each
*                    carrying { section_tipo, section_id, type, from_component_tipo }
*
* @see core/component_portal/js/component_portal.js  — the aliased implementation
* @see core/component_relation_children/class.component_relation_children.php — server logic
*/
export const component_relation_children = component_portal



// @license-end
