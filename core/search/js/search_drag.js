


	/**
	* ON_DRAGSTART
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	export const on_dragstart = function(obj, event) {

		event.stopPropagation();

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', obj.dataset.path);

		return true
	};//end ondrag_start


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
	};//end on_dragover



	/**
	* ON_DRAGLEAVE
	*/
	export const on_dragleave = function(obj, event) {

		//console.log("dragleave");
		//obj.classList.remove('drag_over')
	};//end on_dragleave



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
		const path 		  = event.dataTransfer.getData('text/plain');// element thats move
		const wrap_target = obj 	 // element on user leaves source wrap

		// Build component html
		self.build_search_component(wrap_target, path).then(()=>{
			//Update the state and save
			self.update_state({state:'changed'})
		});

		return true
	};//end on_drop
