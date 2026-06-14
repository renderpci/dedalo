// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_EDIT_STATE
* Edit-mode renderer for the `state` widget (core/widgets/state).
*
* This module builds the full edit-mode DOM subtree for the `state` widget —
* a diagnostic panel that shows the completion percentage of a record split
* into two metric columns:
*   - "situation" — user-controlled completion status (dd174 section, dd92 value)
*   - "state"     — admin-controlled completion status (dd501 section, dd83 value)
*
* Each column renders a collapsible detail: a summary percentage (total) that
* expands to per-language (or non-language) breakdown rows on mouseenter.
*
* Architecture overview:
*   - `render_edit_state` is a no-op constructor. Its prototype methods are
*     mixed into the `state` class via
*       state.prototype.edit = render_edit_state.prototype.edit
*     (see state.js). It is never instantiated directly.
*   - All DOM-building delegates to `ui.create_dom_element` (core/common/js/ui.js).
*   - Live value updates (e.g. when the user changes a state/situation component
*     in the same session) are delivered via `event_manager` on the channel
*     `update_widget_value_<ipo_index>_<widget_id>`.
*   - Event subscription tokens are stored in `self.events_tokens` so the
*     widget's `destroy()` lifecycle hook can unsubscribe them.
*
* Data contract — `self.value` (produced by class.state.php::get_data()):
*   An array of flat objects each carrying a nested `.value` property:
*   {
*     value: {
*       widget:    string,   // always 'state'
*       key:       number,   // zero-based IPO index this item belongs to
*       widget_id: string,   // var_name from IPO output — e.g. 'state'|'situation'
*       lang:      string,   // language tag (e.g. 'lg-spa') or 'lg-nolan' for non-translatable
*       value:     number,   // completion percentage 0–1 (total rows) or 0/1 (detail rows)
*       locator:   {section_tipo:string, section_id:string, ...} | null,
*       column:    string,   // 'situation' | 'state'
*       type:      string    // 'total' | 'detail'
*     }
*   }
*
* `self.datalist` (produced by class.state.php::get_data_list()):
*   An array of list-of-values items. Each entry has a `.value` with
*   `.section_tipo` and `.section_id` keys, plus a top-level `.label` string
*   used to display the human-readable name of the selected state option.
*
* `self.ipo` (from ontology properties — Input/Process/Output config):
*   An array of IPO objects:
*   {
*     input:  { type: 'locator'|'component_data', source: [...], paths: [...] },
*     output: [ { id: string, label: string }, ... ]   // columns to render
*   }
*
* Companion files:
*   - render_list_state.js  — compact list-mode renderer for the same widget
*   - state.js              — constructor + prototype wiring
*   - class.state.php       — server-side data builder
*
* @module render_edit_state
*/

// imports
	import {ui} from '../../../common/js/ui.js'
	import {event_manager} from '../../../common/js/event_manager.js'



/**
* RENDER_EDIT_STATE
* Constructor stub. All logic lives on the prototype and is mixed into `state`.
* @returns {boolean} true
*/
export const render_edit_state = function() {

	return true
}//end render_edit_state



/**
* EDIT
* Render node for use in modes: edit, edit_in_list.
*
* Builds a two-level structure:
*   wrapper (ui.widget.build_wrapper_edit)
*     └── content_data (div)
*           └── <ul class="values_container">
*                 └── <li class="widget_item state"> × ipo.length
*
* When `options.render_level === 'content'` the wrapper is bypassed and only
* the raw content_data element is returned. This is used by layouts that
* embed widgets directly without the standard widget chrome.
*
* @param {Object} options - Render options passed by the widget lifecycle.
* @param {string} options.render_level - When set to 'content', skip the wrapper
*   and return only the content_data element.
* @returns {Promise<HTMLElement>} wrapper (or content_data when render_level='content')
*/
render_edit_state.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* Build the inner content_data container for edit mode.
*
* Iterates over every IPO entry (self.ipo) and builds one <li> per entry by
* delegating to `get_value_element`. Items from `self.value` are pre-filtered
* by IPO index (item.value.key === i) before being passed down.
*
* The returned element is a plain <div> wrapping a DocumentFragment that holds
* the <ul class="values_container">. The DocumentFragment is consumed by
* `content_data.appendChild()` which flattens it into the div.
*
* @param {Object} self - The `state` widget instance (this).
* @returns {Promise<HTMLElement>} content_data div element ready to be inserted
*   into the DOM.
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data = self.value.filter(item => item.value.key === i)
			const value_element	= get_value_element(i, data, self)
			values_container.appendChild(value_element)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* Build the complete <li> element for one IPO entry (index `i`).
*
* Structure produced for each IPO entry:
*   <li class="widget_item state">
*     <div class="li_item header">
*       <label />              ← empty group-name column
*       <label>situation</label>
*       <label>state</label>
*     </div>
*     <!-- one .li_item.container per ipo[i].output row -->
*     <div class="li_item container">
*       <label>…row label…</label>
*       <div class="situation">
*         <div class="total">  ← shows aggregate % (mouseenter reveals detail)
*           <span class="value">X%</span>
*         </div>
*         <div class="detail hide">   ← per-language breakdown rows
*           …
*         </div>
*       </div>
*       <div class="state">
*         <div class="total"> … </div>
*         <div class="detail hide"> … </div>
*       </div>
*     </div>
*   </li>
*
* The "situation" column maps to ontology section dd174 (user-editable status);
* the "state" column maps to dd501 (admin-controlled status).
*
* Both "total" rows toggle their corresponding ".detail" panel via
* mouseenter/mouseleave events instead of a click handler. This means the
* detail panel disappears as soon as the pointer leaves the total node —
* there is no persistent-open/close toggle.
*
* The `ar_nodes` array accumulates node descriptors used by the
* `fn_update_widget_value` event handler to patch the DOM in place when the
* underlying component data changes without a full widget re-render.
*
* Node descriptor shape stored in ar_nodes:
*   For 'total' rows:
*   {
*     node_value : HTMLElement,  // the <span class="value"> that shows "X%"
*     type       : 'total',
*     value      : Object,       // original .value from self.value data item
*     lang       : string,       // always nolan for totals
*     widget_id  : string,       // output_item.id — e.g. 'state'|'situation'
*     key        : number,       // IPO index
*     column     : string        // 'situation'|'state'
*   }
*   For 'detail' rows (additional fields):
*   {
*     node_label_list : HTMLElement,  // <label> showing the list value name
*     value           : Object|number // 0 when item not found in data
*   }
*
* @param {number} i    - Zero-based index of the current IPO entry.
* @param {Array}  data - Subset of self.value items whose value.key === i.
* @param {Object} self - The `state` widget instance (this).
* @returns {HTMLElement} value_element — the fully built <li> element.
*/
const get_value_element = (i, data, self) => {

	// li, for every ipo will create a li node
		const value_element = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item state'
		})

	// header. First row with the header labels
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'li_item header',
			inner_html		: '',
			parent			: value_element
		})
		// group_name_column
			const group_name_column = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: '',
				parent			: header
			})
		// label_situation
			const label_situation = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label['situation'] || 'situation',
				parent			: header
			})
		// label_state
			const label_state = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label['state'] || 'state',
				parent			: header
			})

		// (!) Data only contains langs that actually have a value.
		// When a component is translatable, not all project langs may be present in `data`
		// (only the ones with saved values). For non-translatable components, there is
		// always exactly one entry keyed to 'lg-nolan'.
		// We therefore always iterate over project_langs (or length 1 for nolan) instead
		// of the data array to ensure every language slot is rendered, even when empty.
		const project_langs	= page_globals.dedalo_projects_default_langs
		const nolan			= page_globals.dedalo_data_nolan

		// select the current ipo.output
		const output		= self.ipo[i].output

		// we will store the nodes to re-create the value when the components change our data and send the 'update_widget_value' event
		const ar_nodes = []

	// li container
		// every ipo has one output array whit the objects for every row
		// get the output for reference of the rows
		for (let o = 0; o < output.length; o++) {
			const output_item = output[o]
			// row container
				const container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'li_item container',
					parent			: value_element
				})

				// label for the row
				const label = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label[output_item.label] || output_item.id,
					parent			: container
				})

			// Situation
				// check if the component is translatable, with the first item in the data of the current column
				const situation_item = data.find(item => item.value.widget_id === output_item.id && item.value.column === 'situation')
				if (situation_item) {

					// check if the item is translatable
					const situation_translatable = (situation_item.lang !== nolan)
					// if the item is translatable select the all projects langs, else the item will be lg-nolan and only will has 1 item
					const situation_length = situation_translatable ? project_langs.length : 1;
					// get the total item for situation
					const situation_total = data.find(item => item.value.widget_id === output_item.id
																&& item.value.column === 'situation'
																&& item.value.type ==='total')

					// node for the column situation
						const situation = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'situation',
							parent			: container
						})
						// total
						const situation_total_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'total',
							parent			: situation
						})
						// Reveal/hide the per-language detail panel on hover.
						// The detail panel is initially hidden (.hide class) and is only shown
						// while the pointer is over the total node.
						situation_total_node.addEventListener('mouseenter', function(e) {
							situation_detail_container.classList.remove('hide')
						})
						situation_total_node.addEventListener('mouseleave', function(e) {
							situation_detail_container.classList.add('hide')
						})
						// create the node with the total value
						const situation_total_value = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value',
							inner_text		: situation_total.value.value + '%',
							parent			: situation_total_node
						})
						// save the node for reuse later in 'update_widget_value' event
						ar_nodes.push({
							node_value	: situation_total_value,
							type		: 'total',
							value		: situation_total.value,
							lang		: nolan,
							widget_id	: output_item.id,
							key			: i,
							column		: 'situation'
						})

					// detail node with all languages
						const situation_detail_container = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'detail hide',
							parent			: situation
						})
						// situation detail (by lang)
						for (let j = 0; j < situation_length; j++) {
							// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
							const lang = situation_translatable ? project_langs[j].value : nolan
							const situation_items_data = data.find(item => item.value.widget_id === output_item.id
																		&& item.value.column === 'situation'
																		&& item.value.lang === lang
																		&& item.value.type ==='detail')
							// build the label with the lang name
							const label_situation = ui.create_dom_element({
								element_type	: 'label',
								inner_text		: (situation_translatable) ? project_langs[j].label+': ' : 'total :',
								parent			: situation_detail_container
							})
							// create the node with the value
							const item_situation = ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'value',
								inner_text		: (situation_items_data) ? situation_items_data.value.value + '%' : '0%',
								parent			: situation_detail_container
							})
							// build the label with the list name
							const datalist_item = (situation_items_data && situation_items_data.locator)
								? self.datalist.find(item => item.value.section_tipo === situation_items_data.locator.section_tipo
														&& item.value.section_id === situation_items_data.locator.section_id) || {label: ''}
								: {label: ''}

							const label_list_situation = ui.create_dom_element({
								element_type	: 'label',
								inner_text		: datalist_item.label,
								parent			: situation_detail_container
							})
							// save the node for reuse later in 'update_widget_value' event
							ar_nodes.push({
								node_value		: item_situation,
								node_label_list	: label_list_situation,
								type			: 'detail',
								value			: (situation_items_data) ? situation_items_data.value : 0,
								lang			: lang,
								widget_id		: output_item.id,
								key				: i,
								column			: 'situation'
							})
						}//end for (let j = 0; j < situation_length; j++)
				}//end if (situation_item)

			// State
				// check if the component is translatable, with the first item in the data of the current column
				const state_item = data.find(item => item.value.widget_id === output_item.id && item.value.column === 'state')
				if (state_item) {
					// second, check if the item is translatable
					const state_translatable = (state_item.value.lang !== nolan)
					// if the item is translatable select the projects lang else the item is lg-nolan and only has 1 item
					const item_length = state_translatable ? project_langs.length : 1;

					const state_total = data.find(item => item.value.id === output_item.id
														&& item.value.column === 'state'
														&& item.value.type ==='total')

					// node for state column
					const state = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'state',
						parent 			: container
					})
						// total
						const state_total_node = ui.create_dom_element({
							element_type 	: 'div',
							class_name		: 'total',
							parent 			: state
						})
						// Reveal/hide the per-language detail panel on hover (same pattern as situation above).
						state_total_node.addEventListener('mouseenter', function(e) {
							state_detail_container.classList.remove('hide')
						})
						state_total_node.addEventListener('mouseleave', function(e) {
							state_detail_container.classList.add('hide')
						})
						// create the node with the value
						const total_value = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value',
							inner_html 		: state_total.value.value +'%',
							parent 			: state_total_node
						})
						// save the node for reuse later in 'update_widget_value' event
						ar_nodes.push({
							node_value 	: total_value,
							type 		: 'total',
							value 		: state_total.value.value,
							lang 		: nolan,
							widget_id	: output_item.id,
							key 		: i,
							column		: 'state'
						})

					// detail with all languages
					const state_detail_container = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'detail hide',
						parent 			: state
					})
					for (let k = 0; k < item_length; k++) {
						// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
						const lang = state_translatable ? project_langs[k].value : nolan
						// find the data of the item with the lang
						const state_item_data = data.find(item => item.value.widget_id === output_item.id
																&& item.value.column === 'state'
																&& item.value.lang === lang
																&& item.value.type ==='detail')

						// build the label with the lang
						const label_state = ui.create_dom_element({
							element_type	: 'label',
							inner_html 		: (state_translatable) ? (project_langs[k].label+': ') : 'total :',
							// inner_html 		: 'total :',
							parent 			: state_detail_container
						})

						// create the node with the value
						const item_state = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value',
							inner_html 		: (state_item_data) ? state_item_data.value.value +'%' : '0%',
							parent 			: state_detail_container
						})
						// build the label with the list name
						const datalist_item_status = (state_item_data && state_item_data.locator)
							? self.datalist.find(item => item.value.section_tipo === state_item_data.locator.section_tipo
													&& item.value.section_id === state_item_data.locator.section_id) || {label: ''}
							: {label: ''}

						const label_list_state = ui.create_dom_element({
							element_type	: 'label',
							inner_html		: datalist_item_status.label,
							parent			: state_detail_container
						})
						// save the node for reuse later in the event 'update_widget_value'
						ar_nodes.push({
							node_value		: item_state,
							node_label_list	: label_list_state,
							type			: 'detail',
							value			: (state_item_data) ? state_item_data.value : 0,
							lang			: lang,
							widget_id		: output_item.id,
							key				: i,
							column			: 'state'
						})
					}// end for (let k = 0; k < item_length; k++)
				}//end if (state_item)
		}//end for (let o = 0; o < output.length; o++)

		// Subscribe to live-update events for this IPO slot.
		// The event channel is keyed as 'update_widget_value_<i>_<widget.id>' so
		// that only the matching IPO entry responds when multiple state widgets
		// coexist on the same page. Tokens are pushed into self.events_tokens so
		// destroy() can unsubscribe all handlers when the widget is torn down.
		self.events_tokens.push(
			event_manager.subscribe('update_widget_value_'+i+'_'+self.id, fn_update_widget_value)
		)
		/**
		* FN_UPDATE_WIDGET_VALUE
		* Live-update handler invoked when `update_widget_value_<i>_<id>` fires.
		*
		* Iterates ar_nodes in reverse order and for each registered node finds
		* the matching item in `changed_data` using a five-key identity check
		* (widget_id, column, lang, key, type). When found, the node's
		* percentage span and — for detail rows — its list-label are updated
		* directly via innerHTML. When not found (e.g. value was cleared), the
		* percentage is reset to '0%' and the list-label is cleared.
		*
		* The reverse-order iteration is harmless here (no removal) but matches
		* the pattern used in list-mode for consistency.
		*
		* @param {Array} changed_data - Array of updated value objects in the same
		*   shape as `self.value` but with the new values set by the server.
		*/
		function fn_update_widget_value(changed_data) {

			// get all detail nodes 'situation' and 'state' in DOM
			const detail_nodes = ar_nodes //.filter(node => node.type === 'detail')
			const node_length = detail_nodes.length

			for (let o = node_length - 1; o >= 0; o--) {
				const node = detail_nodes[o]
				// find if the node has new data
				const new_data = changed_data.find(
					item => item.value.widget_id === node.widget_id
					&& item.value.column === node.column
					&& item.value.lang === node.lang
					&& item.value.key === i
					&& item.value.type === node.type
				)
				// set the new value
				if(new_data){
					node.node_value.innerHTML = new_data.value +'%'
					if(node.type==='detail'){
						const datalist_item = (new_data.locator)
							? self.datalist.find(item => item.value.section_tipo===new_data.locator.section_tipo
													  && item.value.section_id===new_data.locator.section_id)
							: {label: ''}

						node.node_label_list.innerHTML = datalist_item.label
					}

				}else{
					node.node_value.innerHTML = '0%'
					if(node.type==='detail'){
						node.node_label_list.innerHTML = ''
					}
				}// end if(new_data){
			}// end for (let o = node_length - 1; o >= 0; o--)
		}//end fn_update_widget_value


	return value_element
}//end get_value_element



// @license-end
