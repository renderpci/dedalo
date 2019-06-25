/**
* ui
*/
export const ui = {

	component : {

	
		/**
		* BUILD_WRAPPER
		*/
		build_wrapper : (options) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper] options:",options)
			}
				
			const id 		= options.id
			const tipo 		= options.tipo
			const model 	= options.model
			const mode 		= options.mode		

			// wrapper
				const wrapper = common.create_dom_element({
						element_type	: 'div',
						id 				: id,
						class_name		: 'wrapper_component ' + model + ' ' + tipo + ' ' + mode
					})

			return wrapper
		},//end build_wrapper


		/**
		* BUILD_LABEL
		*/
		build_label : (options) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_label] options:",options)
			}				

			const mode 			= options.mode
			const label 		= options.label
			const parent 		= options.parent

			// label 
				const component_label = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label,
						parent 			: parent
					})
			

			return component_label
		},//end build_label



		/**
		* BUILD_CONTENT_DATA
		*/
		build_content_data : (options) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_content_data] options:",options)
			}
				
			const parent = options.parent

			// content_data 
				const content_data = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'content_data',
						parent 			: parent
					})			
			

			return content_data
		},//end build_content_data



	},//end video_player

	

	section : {


		

	}



}// interface