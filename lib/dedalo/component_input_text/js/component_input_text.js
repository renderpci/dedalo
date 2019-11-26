// imports
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_input_text} from '../../component_input_text/js/render_component_input_text.js'
import {data_manager} from '../../common/js/data_manager.js'


export const component_input_text = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools

	return true
}//end component_input_text



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_input_text.prototype.init 	 			= component_common.prototype.init
	component_input_text.prototype.build 	 			= component_common.prototype.build
	component_input_text.prototype.render 				= common.prototype.render
	component_input_text.prototype.destroy 	 			= common.prototype.destroy
	component_input_text.prototype.refresh 				= common.prototype.refresh
	component_input_text.prototype.save 	 			= component_common.prototype.save
	component_input_text.prototype.load_data 			= component_common.prototype.load_data
	component_input_text.prototype.get_value 			= component_common.prototype.get_value
	component_input_text.prototype.set_value 			= component_common.prototype.set_value
	component_input_text.prototype.update_data_value	= component_common.prototype.update_data_value
	component_input_text.prototype.update_datum 		= component_common.prototype.update_datum
	component_input_text.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_input_text.prototype.list 		= render_component_input_text.prototype.list
	component_input_text.prototype.edit 		= render_component_input_text.prototype.edit
	component_input_text.prototype.edit_in_list	= render_component_input_text.prototype.edit
	component_input_text.prototype.search 		= render_component_input_text.prototype.search
	component_input_text.prototype.change_mode 	= component_common.prototype.change_mode



/**
* ACTIVE
* Custom active function triggered after ui.active has finish
*/
component_input_text.prototype.active = function() {

	//console.log("Yujuu! This is my component custom active test triggered after ui.active. id:", this.id )

	return true
}//end active




/**
* IS_UNIQUE
* Check the value of the input_text with the all values in the database
* result:
* 	true : unique value, it not has any record inside the section.
* 	false: the value has almost 1 record inside the database, but it is not unique.
*/
component_input_text.prototype.is_unique = async function(new_value){

		const self = this

		const unique_config = self.context.properties.unique

		// sqo_context
				// create the sqo_context
				self.sqo_context = {search: []}
				// create the own show ddo element
				const source = create_source(self, 'get_data')

				const sqo = {
					typo 				: 'sqo',
					q 					: "=" + new_value,
					q_operator 			: null,
					q_split 			: false,
					section_tipo 		: [self.section_tipo],	
					component_name 		: self.model,
					component_tipo 		: self.tipo,			
					name 				: self.model,
					limit 				: 1
				}

				self.sqo_context.search.push(sqo)
				self.sqo_context.search.push(source)

					console.log("self:",self);
			// load data
				const current_data_manager 	= new data_manager()
				const api_response 			= await current_data_manager.section_load_data(self.sqo_context.search)

					console.log("api_response:",api_response);


		return

		

		/*
		const options = {
			q 					: "=" + component_input_node.value,
			q_operator 			: null,
			q_split 			: false,
			section_tipo 		: wrap_div.dataset.section_tipo,	
			component_name 		: wrap_div.dataset.component_name,
			component_tipo 		: wrap_div.dataset.tipo,			
			name 				: self.model,
			limit 				: 1
		}
	
		const search_query_object = component_common.build_search_query_object(options)
		const js_promise 		  = service_autocomplete.autocomplete_search({
												component_tipo 		: options.component_tipo, 
												section_tipo 		: options.section_tipo, 
												divisor 			: ' | ',
												search_query_object : search_query_object
			}).then(function(result){

				let unique_warning = component_input_node.parentNode.querySelector('.unique_warning')
				
				if(result.length === 0){
					if(unique_warning){
						unique_warning.remove()
					}
					if(disable_save === false){
						wrap_div.dataset.is_saveable = true
						component_input_node.classList.remove('icon_prohibited')
						component_input_node.classList.add('icon_validated')
					} 

					return true
				}else{

					if(!unique_warning){
						const unique_warning = common.create_dom_element({
							element_type 	: "div",
							class_name 	 	: "unique_warning",
							parent 			: component_input_node.parentNode,
							text_content	: get_label['value_already_exists']
						})						
					}
					if(disable_save === true){
						wrap_div.dataset.is_saveable = false
						component_input_node.classList.remove('icon_validated')
						component_input_node.classList.add('icon_prohibited')
					}


					return false

				}
			})

		return js_promise

		*/
	}//end is_unique



