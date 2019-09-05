// imports
	import event_manager from '../../page/js/page.js'
	import * as instances from '../../common/js/instances.js'



/**
* COMMON
*/
export const common = function(){

	return true
}//end common



/*
* DESTROY
* Delete all instances dependents of the section and all events that was created by the instances.
* but it not delete the own section instance.
* @return
*/
common.prototype.destroy = async function (delete_self=true, delete_dependences=false){

	const self = this

	// destroy all instances asociated
		if(delete_dependences){
			//event_manager.publish('paginator_destroy'+self.paginator_id, self)
			const ar_instances_length = self.ar_instances.length
			for (let i = ar_instances_length - 1; i >= 0; i--) {
				self.ar_instances[i].destroy(true,true)
				self.ar_instances.splice(i, 1)
			}
		}

	// delete the own instance
		if(delete_self){

			// get the events that the instance was created
				const events_tokens = self.events_tokens

			// delete the registred events
				const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))

			// delete paginator
				if(self.paginator){
					self.paginator.destroy();
					delete self.paginator
				}

			// instance
				const current_instance = instances.delete_instance({
					model 			: self.model,
					tipo 			: self.tipo,
					section_tipo 	: self.section_tipo,
					section_id 		: self.section_id,
					mode 			: self.mode,
					lang 			: self.lang,
				})
		}

	return true
}//end destroy



/**
* REFRESH
* @return promise
*/
common.prototype.refresh = async function() {
	const t0 = performance.now()

	const self = this

	// offset update
		const sqo = self.sqo_context.show.find(element => element.typo==='sqo')
		sqo.offset = self.pagination.offset

		const source = self.sqo_context.show.find(element => element.typo==='source')
		source.pagination.offset = self.pagination.offset

	// destroy the own instance for build the new one
		self.destroy(false, true);

	// build. change the instance with the new data
		await self.build(true)

	// copy original ar_node
		const ar_node = self.node

	// empty instance nodes
		self.node = []

	// render
		const node = await self.render()

	// clean and replace old dom nodes
		const ar_node_length = ar_node.length
		for (let i = ar_node_length - 1; i >= 0; i--) {

			const current_node = ar_node[i]
			const parent_node  = ar_node[i].parentNode

			// remove the all child nodes of the node
				//while (current_node.firstChild) {
				//	current_node.removeChild(current_node.firstChild)
				//}

			// replace the node with the new render
				parent_node.replaceChild(node, current_node)
	 	}

	 // debug
	 	if(SHOW_DEBUG===true) {
	 		console.log("+ Time to refresh:", self.model, performance.now()-t0);
	 	}


 	return true
}//end refresh



/**
* CREATE_SOURCE
* @param object options
* @return object source
*/
export const create_source = function(self, action){

	const source = { // source object
		typo			: "source",
		action			: action,
		model 			: self.model,
		tipo 			: self.tipo,
		section_tipo	: self.section_tipo,
		section_id		: self.section_id,
		mode 			: self.mode,
		lang 			: self.lang,
		pagination		: self.pagination
	}

	return source
}//end create_source


