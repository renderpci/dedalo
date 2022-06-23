/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



	/**
	* ON_DRAGSTART
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	export const on_dragstart = function(obj, event) {
		event.stopPropagation();

		const data = JSON.stringify({
			path			: obj.path,
			// section_id	: obj.dataset.section_id
			ddo				: obj.ddo
		})

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);

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
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	export const on_drop = function(obj, event) {
		event.preventDefault() // Necessary. Allows us to drop.
		event.stopPropagation()

		const self = this

		//console.log("on_drop event:", event.dataTransfer.getData('text/plain'));
		const wrap_target	= obj 	 // element on user leaves source wrap
		const data			= event.dataTransfer.getData('text/plain');// element that move
		const parsed_data	= JSON.parse(data)
		const path			= parsed_data.path
		const ddo			= parsed_data.ddo

		const new_ddo = {
			id				: ddo.section_tipo +'_'+ ddo.tipo +'_list_'+ ddo.lang,
			tipo			: ddo.tipo,
			section_tipo	: ddo.section_tipo,
			model			: ddo.model,
			parent			: ddo.parent,
			lang			: ddo.lang,
			mode			: ddo.mode,
			label			: ddo.label,
			path			: path
		}

		// Build component html
		self.build_export_component(wrap_target, path, new_ddo)
		.then(()=>{
			// Update the ddo_export
			self.ar_ddo_to_export.push(new_ddo)
		})

		return true
	}//end on_drop


