// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



/**
* RENDER_SECTION_TAB
*
* Client-side view layer for the `section_tab` element type.
* A `section_tab` is a UI container that arranges its child sections or components
* as labelled tabs inside a record form.  It supports two view modes:
*
*   - 'section_tab' (default): renders a full tab bar whose labels come from
*     `self.context.children`.  Clicking a label activates that child by
*     publishing a `tab_active_<tipo>` event via event_manager, and the last
*     selected tab is persisted to IndexedDB (table 'status') so the selection
*     survives a page reload.
*
*   - 'tab': the element is itself a child being activated by a parent
*     `section_tab`.  In this mode no tab bar is rendered; the element simply
*     subscribes to its own `tab_active_<tipo>` event and adds the CSS class
*     'active' to its wrapper when triggered.
*
* Main export: `render_section_tab` — a constructor whose prototype methods are
* mixed into `section_tab` (see section_tab.js).
*
* Depends on:
*   event_manager  — named publish/subscribe bus (token-based unsubscription)
*   data_manager   — IndexedDB-backed async local storage (get/set_local_db_data)
*   ui             — DOM factory helpers (create_dom_element)
*   set_element_css — applies scoped dynamic CSS rules from context.css
*/

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'



/**
* RENDER_SECTION_TAB
* Constructor for the render layer.  Instances are never created directly; the
* prototype methods are assigned to `section_tab.prototype` in section_tab.js.
* The constructor itself does nothing and returns `true` as a conventional
* truthy sentinel consistent with other Dédalo render constructors.
* @returns {boolean} true
*/
export const render_section_tab = function() {

	return true
}//end render_section_tab



/**
* EDIT
* Builds and returns the DOM wrapper for a `section_tab` instance in edit mode.
*
* Behaviour depends on `self.context.view`:
*
*   'tab' view  — The element is a child being managed by a parent section_tab.
*     No tab labels are rendered here.  A `tab_active_<self.tipo>` event
*     subscription is registered so the parent can activate this element by
*     adding the CSS class 'active' to the wrapper.  The token is pushed onto
*     `self.events_tokens` so `common.prototype.destroy` can unsubscribe it.
*
*   'section_tab' view (default) — A full tab bar is built:
*     1. One `<div class="tab_label">` per entry in `self.context.children` is
*        appended to the wrapper.  Each label node carries a `.tipo` property
*        for identification and a click handler that calls `active_tab()`.
*     2. `children_object` maps child tipo → label DOM node for O(1) lookup.
*     3. `active_tab(child_node)` is a closure that:
*          a. Strips the 'active' CSS class from all sibling tab labels.
*          b. Publishes `tab_active_<tipo>` so the corresponding child section
*             adds its own 'active' class (see 'tab' view branch above).
*          c. Persists the selected tipo to IndexedDB under the key
*             `section_tab_<section_tipo>_<tipo>` in the 'status' table.
*          d. Adds the 'active' class to the clicked label node itself.
*     4. The previously persisted selection is read from IndexedDB and used to
*        restore the tab the user last had open.  If the stored tipo is not
*        found in `children_object` (e.g. because permissions changed), the
*        first child is used as a fallback.  If no valid node is found at all,
*        no tab is activated — this avoids blocking the entire record.
*
* The wrapper's `.content_data` property is set to the wrapper itself so that
* the section_record grouper selector can identify this element.
*
* Note: `render_level` is read from options but not currently used in this
* implementation — the wrapper is always fully built.
*
* @param {Object} options - Render options forwarded by common.prototype.render
* @param {string} [options.render_level='full'] - Render depth hint ('full'|'content')
* @returns {Promise<HTMLElement>} The populated wrapper element
*/
render_section_tab.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	get_wrapper(self)
		// set wrapper content data property (used as grouper selector from section_record)
		wrapper.content_data = wrapper

	// view
		switch (self.context.view) {
			case 'tab': {
				// nothing to do
				// Subscribe to the parent section_tab's activation event.
				// When the parent calls active_tab() for this child's tipo, the
				// 'active' class is added here so CSS can show this element.
				const tab_active_handler = () => {
					wrapper.classList.add('active')
				}
				self.events_tokens.push(
					event_manager.subscribe('tab_active_'+self.tipo, tab_active_handler)
				)
				break;
			}

			case 'section_tab':
			default: {
				// status
				// Unique IndexedDB key per section_tab instance, scoped by both
				// section_tipo and the tab container's tipo to avoid collisions
				// when the same tab container tipo appears in different section types.
					const status_id		= `section_tab_${self.section_tipo}_${self.tipo}`
					const status_table	= 'status'

				// section_tab children, as tab
				// children_object will store the tipo and the node in the object to be referenced and selected.
				// Build the tab label bar from the children declared in context.
				// Each child gets a clickable <div class="tab_label"> containing the child's label text.
					const children			= self.context.children
					const children_length	= children.length
					// Map of child tipo → label DOM node for fast lookup by active_tab() and status restore.
					const children_object	= {}
					for (let i = 0; i < children_length; i++) {
						const child = children[i]
						const child_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'tab_label',
							inner_html		: child.label,
							parent			: wrapper
						})
						// Attach tipo directly to the node so the click handler can
						// identify which child to activate without a closure variable.
						child_node.tipo = child.tipo
						child_node.addEventListener("click", function(e) {
							e.stopPropagation()
							active_tab(child_node)
						})
						children_object[child.tipo] = child_node
					}

				// active_tab
				// Closure over wrapper, children_object, status_id, and status_table.
				// Called on click and once on initial render to restore persisted state.
					const active_tab = (child_node) => {

						const tipo = child_node.tipo;

						// clean all active
						// Remove 'active' from every sibling label before adding it to
						// the selected one, ensuring only one tab appears selected at a time.
							[...wrapper.childNodes].map(el => {
								if(el.classList.contains('active')) {
									el.classList.remove('active')
								}
							})

						// publish the activate event
						// The child section_tab in 'tab' view mode listens for this event
						// and adds the 'active' class to its own wrapper, making it visible.
							event_manager.publish('tab_active_'+tipo, child_node)

						// status update
						// Persist the selected tipo so the same tab is restored on reload.
						// The record is keyed by status_id (unique per container instance).
							const data = {
								id		: status_id,
								value	: tipo
							}
							data_manager.set_local_db_data(
								data,
								status_table
							)

						// active self
						// Mark the label node itself so CSS can style the selected tab header.
							child_node.classList.add('active')
					}

				// status
				// get active tab stored by previous user selection and active the tab
				// Read the stored tipo from IndexedDB.  Falls back to children[0].tipo
				// if nothing was stored yet (first visit) or the value is falsy.
					const ui_status		= await data_manager.get_local_db_data(status_id, status_table)
					const selected_tipo	= ui_status && ui_status.value
						? ui_status.value
						: children[0].tipo // first tab tipo fallback

					// if the element is not available, for permissions or exclude it, use default node, first node.
					// (!) If a stored tipo is no longer in children_object (e.g. access was
					// revoked), fall back to the first child rather than activating nothing
					// and leaving all tabs invisible.
					const valid_tab_node = children_object[selected_tipo] || children_object[children[0]?.tipo] // first tab tipo fallback

					// if the node is not available, don't active it (will create a error and block the access to the entire section)
					// (!) Do NOT call active_tab with a null/undefined node — it would throw
					// and prevent the entire record from rendering.
					if(valid_tab_node){
						active_tab( valid_tab_node )
					}
				break;
			}
		}


	return wrapper
}//end edit



/**
* GET_WRAPPER
* Creates and returns the outer wrapper `<div>` for a `section_tab` instance.
*
* The wrapper's CSS class list is composed from four space-separated parts:
*   1. `wrapper_<type>`   — generic element-type marker (e.g. `wrapper_section_tab`)
*   2. `<tipo>`           — the ontology tipo of this element (e.g. `dd767`)
*   3. `<section_tipo>_<tipo>` — section-scoped selector for per-instance CSS overrides
*   4. `<view>`           — current view mode ('section_tab' or 'tab')
*   5. `<mode>`           — current interaction mode (e.g. 'edit')
*
* If `self.context.css` is defined, `set_element_css` is called to inject
* scoped dynamic CSS rules using the selector `<section_tipo>_<tipo>.edit`.
* This allows per-instance styling overrides declared in the ontology context.
*
* The wrapper is not yet attached to the DOM — the caller (`edit`) is
* responsible for insertion.
*
* @param {Object} self - The `section_tab` instance being rendered
* @param {string} self.type - Element type string (e.g. 'section_tab')
* @param {string} self.tipo - Ontology tipo identifier
* @param {string} self.section_tipo - Parent section's tipo identifier
* @param {string} self.mode - Interaction mode (e.g. 'edit')
* @param {Object} self.context - Render context object
* @param {string} [self.context.view] - View mode ('section_tab'|'tab')
* @param {*} [self.context.css] - Optional dynamic CSS rules to inject
* @returns {HTMLElement} Unstyled, detached wrapper div
*/
const get_wrapper = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `${'wrapper_'+self.type} ${self.tipo} ${self.section_tipo+'_'+self.tipo} ${self.context.view} ${self.mode}`
		})

	// apply CSS from context
	// Inject any dynamic CSS rules declared in the ontology context for this
	// specific element instance.  The selector scopes rules to this element's
	// section+tipo combination in edit mode.
		if (self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
		}


	return wrapper
}//end get_wrapper



// @license-end
