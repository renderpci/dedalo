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
		render_level	: 'full'
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
		//console.log("typeof self[render_mode]:",typeof self[render_mode], self.model);

	// render node. Method name is element node like 'edit' or 'list'
		if (typeof self[render_mode]!=='function') {
			console.warn(`Invalid function ${render_mode} ` +
						 'instance: ', self);
		}
		const node = await self[render_mode]({
			render_level 	: render_level
		})


	let result_node = null

	// render_level
		switch(render_level) {
			case 'content':
				// replace content data node in each element dom node
					for (let i = 0, l = self.node.length; i < l; i++) {

						const wrapper 				 = self.node[i]
						const old_content_data_node  = wrapper.querySelector(":scope >.content_data")
						const new_content_data_node  = node

						if (typeof old_content_data_node==="undefined" || !old_content_data_node) {
							console.warn("Invalid node found in render:", typeof old_content_data_node, old_content_data_node, self);
						}
						//console.log("typeof old_content_data_node:",typeof old_content_data_node, old_content_data_node);

						wrapper.replaceChild(new_content_data_node, old_content_data_node)
					}
				result_node = self.node[0]
				break;
			case 'full':
				// set
					self.node.push(node)

				result_node = node
				break;
		}

	// status update
		self.status = 'rendered'

	// event publish
		event_manager.publish('render_'+self.id, node)

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("+ Time to render:", self.model, self.section_tipo, self.tipo, performance.now()-t0);
		}


	return result_node
}//end render



/*
* DESTROY
* Delete all instances dependents of the section and all events that was created by the instances.
* but it not delete the own section instance.
* @return
*/
common.prototype.destroy = async function (delete_self=true, delete_dependences=false){

	const self = this

	// delete self instance
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

	// destroy all instances associated
		if(delete_dependences===true){

			const ar_instances_length = self.ar_instances.length
			//if (ar_instances_length<1) {
			//	console.warn("Ignored empty ar_instances dependences ", self);
			//}
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
		if (self.sqo_context && self.pagination.offset) {
			const sqo = self.sqo_context.show.find(element => element.typo==='sqo')
			sqo.offset = self.pagination.offset

			const source = self.sqo_context.show.find(element => element.typo==='source')
			source.pagination.offset = self.pagination.offset
		}

	// destroy dependences only
		self.destroy(false, true);

	// build. Update the instance with new data
	if (typeof self.build === 'function') {
		await self.build(true)
	}

	// copy original ar_node
		//const ar_node 		 = self.node
		//const ar_node_length = ar_node.length

	// empty instance nodes
		//self.node = []

	// render
		const node = await self.render({
			render_level : 'content'
		})



	//node.classList.add("loading")
	//const isPromise = (val) => {
	//  return (
	//  	(val !== undefined && val !== null) &&
	//    typeof val.then === 'function' &&
	//    typeof val.catch === 'function'
	//  )
	//}


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



/**
* LOAD_TOOL
* @param tool_object options
* @param self instance_caller
* @return object tool
*/
common.prototype.load_tool = async function(self, tool_object){

	const tool_instance = await get_instance({
		model 			: tool_object.name,
		tipo 			: self.tipo,
		section_tipo 	: self.section_tipo,
		section_id 		: self.section_id,
		mode 			: self.mode,
		lang 			: self.lang,
		caller 			: self
	})

	if (tool_instance.status && tool_instance.status!=='init') {
		return false
	}

	tool_instance.build()
	tool_instance.render()

	return tool_instance
}//end load_tool



/**
* LOAD_STYLE
* @param object self
*/
common.prototype.load_style = async function(url){

	const js_promise = new Promise(function(resolve, reject) {

		const is_loaded = is_loaded_component_script(url, "link")
		if (true===is_loaded) {

			resolve(url);

		}else{

			// DOM tag
			const element = document.createElement("link")
				  element.rel  = "stylesheet"
				  element.href = url

			element.onload = function() {
				resolve(url);
			};
			element.onerror = function() {
				reject(url);
			};

			document.getElementsByTagName("head")[0].appendChild(element);
		}

	});

	return js_promise
}//end load_style



/**
* IS_LOADED_COMPONENT_SCRIPT
* @return bool
*/
const is_loaded_component_script = function(src, type) {

	if(type==="link") {

		const links 	= document.getElementsByTagName("link");
		const links_len = links.length
		for (let i = links_len - 1; i >= 0; i--) {
			if(links[i].getAttribute('href') === src) return true;
		}

	}else{

		const scripts 	  = document.getElementsByTagName("script");
		const scripts_len = scripts.length
		for (let i = scripts_len - 1; i >= 0; i--) {
			if(scripts[i].getAttribute('src') === src) return true;
		}
	}


	return false;
}//end is_loaded_component_script


