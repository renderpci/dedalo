// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_RELATION_PARENT
* Client-side module for the parent-relation component.
*
* This module is intentionally a thin alias: the full client behaviour
* (edit / list / search rendering, pagination, toolbar, event wiring) is
* owned by component_portal and re-used here unchanged.  The server side
* (core/component_relation_parent/class.component_relation_parent.php) is
* its own distinct PHP class with parent-specific semantics: cycle-guard
* (a record cannot be its own ancestor), child ordering, recursive ancestor
* walk, and the dd47 relation-type marker.
*
* Why share the client?  component_portal already renders a navigable list
* of locators with add / remove / browse actions, which is exactly the UI
* that a parent picker needs.  Duplicating the render layer would diverge
* without benefit.  The server JSON controller sets
*   properties.show_interface.button_add = false
* so the generic "add" button is hidden; parents are linked through the
* thesaurus / tree UI, not created inline from this component's toolbar.
*
* Data shape: an array of locators, each of the form
*   { id, type: 'dd47', section_tipo, section_id, from_component_tipo }
* stored in the section-wide `relations` bag and sliced by from_component_tipo.
*
* @module component_relation_parent
* @see component_portal (core/component_portal/js/component_portal.js)
* @see class.component_relation_parent.php (server-side, parent-specific logic)
* @see component_relation_children.js (the inverse downward-edge component)
*/

// imports
	import {component_portal} from '../../component_portal/js/component_portal.js'



/**
* COMPONENT_RELATION_PARENT. Alias of component_portal
*
* Exports component_portal under the component_relation_parent name so that
* the instance factory (common::get_instance) can resolve the correct client
* class by model name without any conditional logic or extra bundle weight.
* All prototype methods, render functions, and event subscriptions are
* inherited directly from component_portal.
*
* @type {Function} component_portal constructor
*/
export const component_relation_parent = component_portal



// @license-end
