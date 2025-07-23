// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {when_in_dom} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const view_default_list_section_record = function() {

	return true
}//end view_default_list_section_record



/**
* RENDER
* Render node for use in list with all columns and rendered components
* @param object self
* @para object options
* @return HTMLElement wrapper
*/
view_default_list_section_record.render = async function(self, options) {

	// options
		const add_hilite_row = options.add_hilite_row!==undefined
			? options.add_hilite_row
			: true // default

	// wrapper.  section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: self.id
		})
		const ar_css = [
			self.model,
			self.tipo,
			self.mode,
			'view_'+self.context.view
		]
		wrapper.classList.add(...ar_css)

		// hilite_row. User mouse enter/mouseleave creates an DOM node to hilite current row
		// Note that only is activated when self.caller is a section to prevent deep portals issues
			if (add_hilite_row===true && self.caller.model==='section' || self.caller.model==='service_time_machine') {
				when_in_dom(wrapper, function(){
					hilite_row(wrapper)
				})
			}

	// content_data render_columns
		const fragment = await get_content_data(self)
		wrapper.appendChild(fragment)

	// debug
		if(SHOW_DEBUG===true) {
			wrapper.addEventListener('click', function(e){
				if (e.altKey) {
					e.stopPropagation()
					e.preventDefault()
					console.log('/// selected instance:', self);
				}
			})
		}


	return wrapper
}//end render



/**
* HILITE_ROW
* Add the necessary events to the row to hilite when mouseenter /  mouseleave
* @param HTMLElement wrapper
* 	section_record wrapper node
* @return bool
*/
const hilite_row = function(wrapper) {

	// fn_hilite. Add hilite
		const fn_hilite = function() {

			// remove previous hilite if exist
				fn_remove_hilite()

			// small screen case. Do not add hilite. (Place here because user can resize the window)
				const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
				if (width<960) {
					return
				}

			// row_style
				const wrapper_first_column	= wrapper.firstChild
				const wrapper_last_column	= wrapper.lastChild
				const firstChild_el_rect	= wrapper_first_column.getBoundingClientRect();
				const lastChild_el_rect		= wrapper_last_column.getBoundingClientRect();
				const row_style				= {
					width : parseFloat(lastChild_el_rect.x + lastChild_el_rect.width - firstChild_el_rect.x) + 'px'
				}

			// hilite_row_node. First column set vars. This affect ::after pseudo element
				wrapper_first_column.style.setProperty('--box_display', 'block');
				wrapper_first_column.style.setProperty('--box_width', row_style.width);
		}

	// fn_remove_hilite (if is set)
		const fn_remove_hilite = () => {
			// first column set vars. This affect ::after pseudo element
			wrapper.firstChild.style.setProperty('--box_display', 'none');
		}

	// events
		wrapper.addEventListener('mouseenter', fn_hilite);
		wrapper.addEventListener('mouseleave', fn_remove_hilite);


	return true
}//end hilite_row



/**
* GET_CONTENT_DATA
* Render all the columns into a Document Fragment
* @param object self
* @return DocumentFragment
*/
const get_content_data = async function(self) {

	// ar_columns_instances
		const ar_columns_instances	= await self.get_ar_columns_instances_list()
		const columns_map			= self.columns_map

	// fragment
		const fragment = new DocumentFragment()

	// render the columns
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// callback column case
			// (!) Note that many colum_id are callbacks (like tool_time_machine id column)
				if(current_column.callback && typeof current_column.callback==='function'){

					// column_node (standard section_record empty column to be filled with content_node)
						const column_node = render_column_node_callback(current_column, self)

					// content_node. Normally a DocumentFragment
						const content_node = await current_column.callback({
							section_tipo		: self.section_tipo,
							section_id			: self.section_id,
							row_key				: self.row_key,
							paginated_key		: self.paginated_key,
							caller				: self.caller,
							matrix_id			: self.matrix_id, // tm var
							modification_date	: self.modification_date || null, // tm var
							locator				: self.locator,
							ar_instances		: self.ar_instances
						})
						if (content_node) {
							column_node.appendChild(content_node)
						}

					fragment.appendChild(column_node)
					continue;
				}

			// get the specific instances for the current column
				const ar_instances			= ar_columns_instances.filter(el => el.column_id === current_column.id)
				const ar_instances_length	= ar_instances.length

			// loop the instances for select the parent node

			// case zero (user don't have enough privileges cases)
				if (ar_instances_length===0) {
					// empty column
					const column_node = render_empty_column_node(current_column, self)
					fragment.appendChild(column_node)
					continue;
				}

			// render all instances in parallel before create the columns nodes (to get the internal nodes)
				const ar_promises = []
				for (let k = 0; k < ar_instances_length; k++) {
					const current_promise = new Promise(function(resolve, reject){

						const current_instance = ar_instances[k]

						// already rendered case
						if (current_instance.node!==null) {
							resolve(true)
						}else{
							// render the instance
							// if the column has defined a render_callback use it to render the instance
							// else use the common render
							// render_callback allow to add event listeners to the instance nodes
							const render_promise = (current_column.render_callback && typeof current_column.render_callback==='function')
								? current_column.render_callback(current_instance)
								: current_instance.render()

							render_promise
							.then(function(current_instance_node){
								// bad node case
								if (!current_instance_node) {
									console.error('Invalid instance_node', current_instance);
									reject(false)
									return
								}

								resolve(true)
							}).catch((errorMsg) => {
								// error occurred case
								console.error(errorMsg);
								reject(false)
							})
						}
					})
					ar_promises.push(current_promise)
				}//end for (let k = 0; k < ar_instances_length; k++)

				// nodes. Await all instances are parallel rendered
				await Promise.all(ar_promises)// render work done safely

			// create the column nodes and assign the instances nodes to it.
				const ar_column_nodes = []
				for (let j = 0; j < ar_instances_length; j++) {

					const current_instance = ar_instances[j]

					// check instance
						if (typeof current_instance==="undefined") {
							console.error("Undefined current_instance:", current_instance, j, ar_instances);
							continue;
						}
						// check if the current_instance has column_id. If not, an error was occur on common creating the columns.
						if (!current_instance.column_id) {
							console.error("current_instance column_id not found:",current_instance);
							continue;
						}

					// ar_sub_columns_map
						const ar_sub_columns_map = current_instance.columns_map || ar_instances

					// column_node. If column already exists, place the component node into the column.
					// Else, creates a new column and place it into the fragment
						const found_node	= ar_column_nodes.find(el => el.column_id === current_instance.column_id)
						const column_node	= found_node
							? found_node
							: (()=>{
								const new_column_node = render_column_node(current_instance, self, ar_sub_columns_map)
								// push column in ar_column_nodes
								ar_column_nodes.push(new_column_node)
								// add node to fragment
								fragment.appendChild(new_column_node)

								return new_column_node
							  })()
						// append current_instance wrapper node
						column_node.appendChild( current_instance.node )
				}//end for (let j = 0; j < ar_instances_length; j++)

		}//end for (let i = 0; i < columns_map_length; i++)


	return fragment
}//end get_content_data



/**
* RENDER_COLUMN_NODE
* @param object component_instance
* @param object self
* @param array ar_instances
* @return HTMLElement column_node
*/
const render_column_node = function(component_instance, self, ar_instances){

	const column_id	= component_instance.column_id
	const model		= self.caller.model

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' column_' + model,
		id				: `col_${column_id}`
	})
	// set the id to the node, it used to be selected to mach column and instances.
	column_node.column_id			= column_id
	column_node.component_instance	= component_instance

	// column_responsive mobile add-ons
		if (self.caller.model==='section') {
			ui.make_column_responsive({
				selector	: `#col_${column_id}`,
				label		: component_instance.label
			})
		}//end mobile add-ons

	if (model==='component_portal') {

		const children_length = ar_instances.length // column_node.children.length
		if (children_length>1) {

			const grid_template_columns_ar_value = []
			for (let i = 0; i < children_length; i++) {
				const width = '1fr'
				// get the grid column spaces
				grid_template_columns_ar_value.push(width)
			}

			Object.assign(
				column_node.style,
				{
					"grid-template-columns": grid_template_columns_ar_value.join(' ')
				}
			)
		}
	}


	return column_node
}//end render_column_node



/**
* RENDER_COLUMN_NODE_CALLBACK
* @param object column_obj
* 	column from the columns_map
* @param object self
* 	element instance
* @return HTMLElement column_node
*/
export const render_column_node_callback = function(column_obj, self){

	const column_id	= column_obj.id
	const model		= 'callback'

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' ' + model,
		id				: `col_${column_id}`
	})

	// column_responsive mobile add-ons
		if (self.caller.model==='section') {
			ui.make_column_responsive({
				selector	: `#col_${column_id}`,
				label		: column_obj.label
			})
		}//end mobile add-ons


	return column_node
}//end render_column_node_callback



/**
* RENDER_EMPTY_COLUMN_NODE
* @param object column_obj
* 	column from the columns_map
* @param object self
* 	element instance
* @return HTMLElement column_node
*/
const render_empty_column_node = function(column_obj, self){

	const column_id	= column_obj.id
	const model		= 'empty'

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' ' + model,
		id				: `col_${column_id}`
	})

	// column_responsive mobile add-ons
		if (self.caller.model==='section') {
			ui.make_column_responsive({
				selector	: `#col_${column_id}`,
				label		: column_obj.label
			})
		}//end mobile add-ons


	return column_node
}//end render_empty_column_node



// @license-end
