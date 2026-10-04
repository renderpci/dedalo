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
* point back to it via their own component_relation_parent. Its rendering
* requirements are identical to component_portal's (a paginated list of related
* records), so it is a SUBCLASS of component_portal that inherits every view,
* lifecycle step and event, and differs only where the data does:
*
*   - the entries are COMPUTED by the server (who declares me as parent) and
*     carry no item id, so an unlink removes BY LOCATOR
*     (a 'remove' whose value is the child locator, with no item id) — the server writes it
*     through to that child's own parent link (relations/children_write.ts);
*   - there is no list ORDER to drag: each child holds its own sibling order
*     value (`reorderable = false`, and sort_data never reaches the server, which
*     would refuse it).
*
* Data shape consumed from the API response:
*   - context layer: standard component_portal context (tipo, section_tipo, mode, …)
*   - data layer:    array of child locators { section_tipo, section_id, type,
*                    from_component_tipo } computed by the server
*
* @see core/component_portal/js/component_portal.js — the inherited implementation
*/
export const component_relation_children = function() {

	component_portal.call(this)
}//end component_relation_children

component_relation_children.prototype = Object.create(component_portal.prototype)
component_relation_children.prototype.constructor = component_relation_children

// children order is each child's own value — never a drag in this list
component_relation_children.prototype.reorderable = false
// entries are computed and carry no item id: a remove names the child by locator
// (component_common names_record_locator accepts it at all three remove doors)
component_relation_children.prototype.removes_by_locator = true



/**
* GET_UNLINK_CHANGED_DATA
* Children are removed BY LOCATOR: the computed entries carry no item id.
* @param {Object[]} ar_locators - The child locators to unlink.
* @returns {Object[]} Frozen changed_data items.
*/
component_relation_children.prototype.get_unlink_changed_data = function(ar_locators) {

	return ar_locators.map(el => Object.freeze({
		action	: 'remove',
		id		: null,
		value	: {
			section_tipo	: el.section_tipo,
			section_id		: el.section_id
		}
	}))
}//end get_unlink_changed_data



/**
* SORT_DATA
* Not available: the children order is each child's own order value, not a
* position in this list (the server refuses sort_data on this model).
* @returns {Promise<boolean>} Always false (nothing sent).
*/
component_relation_children.prototype.sort_data = async function() {

	console.warn('component_relation_children: the children order is not a list position (sort_data ignored)');
	return false
}//end sort_data



// @license-end
