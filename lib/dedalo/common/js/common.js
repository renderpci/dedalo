// imports
	import event_manager from '../../page/js/page.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'



/**
* COMMON
*/
export const common = function(){

	return true
}//end common



/**
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first dom node stored in instance 'node' array
*/
common.prototype.render = async function(options={
		render_level : 'full'
	}) {
	const t0 = performance.now()

	const self = this

	const render_mode 	= self.mode
	const render_level 	= options.render_level


	// status update
		self.status = 'rendering'

	// self data verification before render
		//if (typeof self.data==="undefined") {
		//	console.warn("self.data is undefined !! Using default empty value for render");
		//	self.data = {
		//		value : []
		//	}
		//}

	// render node. Method name is element node like 'edit' or 'list'
		if (typeof self[render_mode]!=='function') {
			console.warn(`Invalid function ${render_mode} ` +
				'instance: ', self);
		}
		const node = await self[render_mode]({
			render_level : render_level
		})

	// render_level
		switch(render_level) {
			case 'content':
				// replace content data node in each element dom node
					for (let i = 0, l = self.node.length; i < l; i++) {

						const wrapper 				 = self.node[i]
						const old_content_data_node  = wrapper.querySelector(":scope >.content_data")
						const new_content_data_node  = node

						wrapper.replaceChild(new_content_data_node, old_content_data_node)
					}
				break;
			case 'full':
				// set
					self.node.push(node)
				break;
		}

	// status update
		self.status = 'rendered'

	// event publish
		event_manager.publish('render_'+self.id, node)

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Time to render:", self.model, self.section_tipo, self.tipo, performance.now()-t0);
		}


	return self.node[0]
}//end render



/*
* DESTROY
* Delete all instances dependents of the section and all events that was created by the instances.
* but it not delete the own section instance.
* @return
*/
common.prototype.destroy = async function (delete_self=true, delete_dependences=false){

	const self = this

	// delete the own instance
		if(delete_self===true){

			// get the events that the instance was created
				const events_tokens = self.events_tokens

			// delete the registred events
				const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))

			// delete paginator
				if(self.paginator){
					self.paginator.destroy();
					delete self.paginator
				}

			// delete_instance
				delete_instance({
					model 			: self.model,
					tipo 			: self.tipo,
					section_tipo 	: self.section_tipo,
					section_id 		: self.section_id,
					mode 			: self.mode,
					lang 			: self.lang
				})
		}

	// destroy all instances asociated
		if(delete_dependences===true){

			const ar_instances_length = self.ar_instances.length
			if (ar_instances_length<1) {
				console.warn("Ignored empty ar_instances dependences ", self);
			}
			for (let i = ar_instances_length - 1; i >= 0; i--) {
				//console.log("self.ar_instances:",JSON.parse(JSON.stringify(self.ar_instances[i])));
				self.ar_instances[i].destroy(true, true)
				self.ar_instances.splice(i, 1)
			}
		}

	//console.log("self.ar_instances final:",JSON.parse(JSON.stringify(self.ar_instances)));

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
		if (self.sqo_context) {
			const sqo = self.sqo_context.show.find(element => element.typo==='sqo')
			sqo.offset = self.pagination.offset

			const source = self.sqo_context.show.find(element => element.typo==='source')
			source.pagination.offset = self.pagination.offset
		}

	// destroy dependences only
		self.destroy(false, true);

	// build. Update the instance with new data
		await self.build(true)

	// copy original ar_node
		//const ar_node 		 = self.node
		//const ar_node_length = ar_node.length

	// empty instance nodes
		//self.node = []

	// render
		const node = await self.render({
			render_level : 'content'
		})


	return true

		node.classList.add("loading")

	const isPromise = (val) => {
	  return (
	  	(val !== undefined && val !== null) &&
	    typeof val.then === 'function' &&
	    typeof val.catch === 'function'
	  )
	}
	//console.log("isPromise node:",isPromise(node));

	// clean and replace old dom nodes
		const replace_nodes = async () => {

			for (let i = ar_node_length - 1; i >= 0; i--) {

				const current_node = ar_node[i]
				const parent_node  = ar_node[i].parentNode


				//console.log("isPromise current_node:",isPromise(current_node));
				//console.log("isPromise parentNode:",isPromise(parent_node));

				/*
				const fragment = document.createDocumentFragment()
				while (node.firstChild) {
					fragment.appendChild(node.firstChild);
				}
				console.log("fragment:",fragment);

				// remove the all child nodes of the node
					while (current_node.firstChild) {
						current_node.removeChild(current_node.firstChild)
					}

				var childNodes = fragment.childNodes;
				//for (var k = 0; k < childNodes.length; k++) {
				for (var k = 0; k < childNodes.length; k++) {

					console.log(" + childNodes[k]:",childNodes[k]);
					current_node.appendChild(childNodes[k])
				}
				*/

				// replace the node with the new render
				// if (!isPromise(node) && !isPromise(current_node))
					parent_node.replaceChild(node, current_node)
		 	}

		 	return true
	 	}
	 	replace_nodes().then(()=>{
	 		node.classList.remove("loading")
	 	})


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


