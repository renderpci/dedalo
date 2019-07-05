import * as instances from '../../common/js/instances.js'

export const render_section_layout = function(){

	this.context
	this.section_tipo
	this.section_id
	this.modo
	this.lang

	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		this.context 		= options.context
		this.section_tipo 	= options.section_tipo
		this.section_id 	= options.section_id
		this.modo			= options.modo
		this.lang			= options.lang
		
	};//end init

	return true
}

//main render
render_section_layout.prototype.render = function(){

	const self = this

	const items = self.context

	//create dom node
		const dom_node = common.create_dom_element({
							element_type		: 'div',
							id 					: self.section_tipo+'_'+self.section_id,
							class_name			: self.model,
							inner_html			: self.model
							})


	const root_items = items.filter(element => element.parent === self.section_tipo )

	const root_items_length = root_items.length

	//iterate elements
	const loaded = new Promise(function(resolve){
		for (let i = 0; i < root_items_length; i++) {	
			self.solve_item(root_items[i]).then(function(current_node){
				dom_node.appendChild(current_node)
				if(i === (root_items_length-1)){
					resolve(dom_node)
				}
			})
		}//end for
	})//end Promise

	return loaded
}

// solve functions 
	// solve item manager 
		render_section_layout.prototype.solve_item = function(item) {

			const self = this

			// skip already solved items
				if (item.hasOwnProperty('solved')) return null;

			let result

			switch (true) {
				case  ( item.type === 'section' ):
					break;
				case ( item.type === 'component' ): // components
					result =self.solve_component(item)
					break;
				case ( item.type === 'grouper' ): // section_group, section_group_div, section_tabs, tabs
					result = self.solve_grouper(item);
					
					break;
				case ( item.type === 'button' ):
					result = self.solve_button(item);
					break;
				default:
					// result = call_user_func('solve_'.$item->model, $item); // others (section_tab, ..)
					const fn_name = 'solve_' + item.model
					result = self[fn_name]
					break;
			}
			return result;
		}



	// solve_component 
		render_section_layout.prototype.solve_component = function(component) {

			const self = this

			//get grouper instance
				const model 	 		= component.model
		
			// init component
				const component_options = {
					model 		: model,
					tipo 		: component.tipo,
					section_tipo: component.section_tipo,
					section_id	: self.section_id,
					modo		: self.modo,
					lang		: self.lang
				}

				const component_node = new Promise(function(resolve){
					instances.get_instance(component_options).then(function(component_instance){
						const component_node = component_instance.render().then(function(current_component_node){
							component.solved = true
							resolve(current_component_node)
						})// end render
					})// end instance
				})// end Promise

				return component_node
		}

/*	// solve_button 
		render_section_layout.prototype.solve_button = function($item) {
			global $section_id, $section_tipo, $modo;

			$button = new $item->model($item->tipo);
			
			// Inject section_id as parent to current button object (!)
				$button->set_parent($section_id);									
			
			$html = $button->get_html();

			$item->solved = true;

			return $html;
		}
	*/


	// solve section_group and section_group_div 
		render_section_layout.prototype.solve_grouper = function(grouper) {

			const self = this

			//get grouper instance
			const model 	 		= grouper.model
		
			// init component
				const grouper_options = {
					model 		: model,
					context 	: grouper,
					section_tipo: grouper.section_tipo,
					modo		: self.modo,
					tipo		: grouper.tipo
				}

			const grouper_node = new Promise(function(resolve){
				instances.get_instance(grouper_options).then(function(grouper_instance){
					const options ={
						section_id : self.section_id
					}
					const current_grouper_node = grouper_instance.render(options).then(function(current_grouper_node){
				
						const items = self.context
						const children_items = items.filter(element => element.parent === grouper.tipo)
						const children_items_length = children_items.length

						for (var i = 0; i < children_items_length; i++) {
							self.solve_item(children_items[i]).then(function(child_node){
								current_grouper_node.appendChild(child_node)
							})
						}// end for

						grouper.solved = true
						resolve(current_grouper_node)
					})//end render	
				})//end instance		
			})//end Promise

			return grouper_node

		}
