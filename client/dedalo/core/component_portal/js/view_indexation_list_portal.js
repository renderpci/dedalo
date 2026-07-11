// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'

/**
* VIEW_INDEXATION_LIST_PORTAL
* List-mode renderer for component_portal when view = 'indexation'.
*
* In list (read-only) contexts the indexation view intentionally shows only a
* summary counter — how many linked records exist for this portal — rather than
* rendering the full linked-record list.  This keeps list rows compact while
* still surfacing the total-records count from the server-returned pagination
* object.
*
* Routing: invoked exclusively by render_list_component_portal.list() when
* self.context.view resolves to 'indexation'.
*
* Main export: the static method view_indexation_list_portal.render().
*/
export const view_indexation_list_portal = function() {

	return true
}//end view_indexation_list_portal



/**
* RENDER
* Build the list-mode DOM node for an indexation-view portal.
*
* Produces a component wrapper containing a single <span> whose text is the
* total number of linked records drawn from `self.data.pagination.total`.
* When the portal has no records yet (pagination absent or total falsy) the
* function returns an empty wrapper immediately — no child nodes are added.
*
* Data contract:
*   self.data?.pagination?.total — server-authoritative integer count of all
*   linked records for this portal.  Set by component_portal.build() from the
*   API response before this renderer is called.
*
* Side effects: none — purely creates and returns DOM nodes.
*
* @param {Object} self    - component_portal instance carrying context, data, and permissions.
* @param {Object} options - Render options forwarded from render_list_component_portal.list().
*                           Not read directly by this view, but passed for forward-compatibility.
* @returns {Promise<HTMLElement>} Resolves to the component wrapper element (always non-null);
*                                 may be empty if no pagination total is available.
*/
view_indexation_list_portal.render = async function(self, options) {

	// wrapper. ui build_wrapper_list returns component wrapper
		const wrapper = ui.component.build_wrapper_list(self)
		wrapper.classList.add('portal', 'view_indexation')

	// get the value of the total records
	// self.data.pagination is populated server-side; absence means the portal
	// has zero or unknown linked records — render an empty wrapper in that case.
		const value_string	= self.data?.pagination?.total || null

		if(!value_string){
			return wrapper
		}

	// create the content_value node
	// Intentional: content_value is created for its DOM side-effect (appended to wrapper
	// via the `parent` option in ui.create_dom_element) even though the variable itself
	// is not referenced afterwards.
		const content_value = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: value_string,
			parent			: wrapper
		})


	return wrapper
}//end render



// @license-end
