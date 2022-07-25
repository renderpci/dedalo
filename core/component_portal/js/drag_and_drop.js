/*global get_label, page_globals, SHOW_DEBUG, ddEditor */
/*eslint no-undef: "error"*/

	import {ui} from '../../common/js/ui.js'

	/**
	* ON_DRAGSTART
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	export const on_dragstart = function(obj, event) {

		event.stopPropagation();

		const data = JSON.stringify(obj.locator)

		obj.classList.remove('hide')

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);

		const content_data			= obj.parentNode.parentNode.parentNode

		const content_data_children = content_data.children

		for (let i = content_data_children.length - 1; i >= 0; i--) {

			const section_record_node = content_data_children[i]
				console.log("section_record_node:",i, section_record_node);
			const section_record_rect	= section_record_node.getBoundingClientRect();
console.log("section_record_rect:",section_record_rect);
			const style = {
				'left'		: parseFloat(section_record_rect.x) + 'px',
				'top'		: parseFloat(section_record_rect.y + window.pageYOffset) + 'px',
				'height'	: parseFloat(section_record_rect.height) + 'px',
				'width'		: parseFloat(section_record_rect.width) + 'px'
			}
			// drop_row
				const drop_row = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'drop_row',
					style			: style,
					parent 			: content_data
				})



		}



		const section_record			= obj.parentNode.parentNode
		// const list_body				= section_record.parentNode.parentNode
		// const styles					= window.getComputedStyle(list_body)
		// const css_grid_template_columns	= styles.getPropertyValue('grid-template-columns')

		// const cloned_sr = section_record.cloneNode(true)
		// cloned_sr.style.display = 'grid'
		// cloned_sr.style.gridTemplateColumns = css_grid_template_columns

		// const drag_node = document.createElement("div");

		// drag_node.innerHTML = cloned_sr.outerHTML

		// document.body.appendChild(drag_node)

		// console.log("drag_node:",drag_node);

		// console.log("cloned_sr:",cloned_sr);

		// event.dataTransfer.setDragImage(drag_node, 25, 25);
		// cloned_sr.remove()

		return true
	}//end ondrag_start


	/**
	* ON_DRAGOVER
	*/
	export const on_dragover = function(obj, event) {

		event.preventDefault();
		event.stopPropagation();
		//console.log("dragover");
		//event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		//	obj.classList.add('drag_over')
	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	*/
	export const on_dragleave = function(obj, event) {

		//console.log("dragleave");
		//obj.classList.remove('drag_over')
	}//end on_dragleave




	/**
	* ON_DRAGEND
	*/
	export const on_dragend = function(obj, event) {

		console.log("dragleave", event);
		//obj.classList.remove('drag_over')
	}//end on_dragend


	/**
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	export const on_drop = function(obj, event) {

		event.preventDefault() // Necessary. Allows us to drop.
		event.stopPropagation()

		const self = this

		//console.log("on_drop:",obj);
		//console.log("on_drop event:", event.dataTransfer.getData('text/plain'));
		const data 		  = event.dataTransfer.getData('text/plain');// element thats move
		const wrap_target = obj 	 // element on user leaves source wrap

		const data_parse = JSON.parse(data)
		const path = data_parse.path

		const section_id = data_parse.section_id

		// Build component html
		self.build_search_component(wrap_target, path, null, null, section_id).then(()=>{
			//Update the state and save
			self.update_state({state:'changed'})

		});

		return true
	}//end on_drop
