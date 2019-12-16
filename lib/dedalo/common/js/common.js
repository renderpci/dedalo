/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_BASE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {instances, get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'



/**
* COMMON
*/
export const common = function(){

	return true
}//end common



/**
* BUILD
* Generic agnostic build function created to maintain
* unity of calls.
* (!) For components, remember use always component_common.build()
* @return bool true
*/
common.prototype.build = async function(){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("+ Time to build",self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'builded'


	return true
}//end component_autocomplete.prototype.build



/**
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first dom node stored in instance 'node' array
*/
common.prototype.render = async function(options={render_level:'full'}) {
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
			console.warn(`Invalid function (render_mode: ${render_mode} ) ` +
						 'instance: ', self);
		}
		const node = await self[render_mode]({
			render_level : render_level
		})

	// result_node render based in render_level
		const result_node = (() => {

			// render_level
			switch(render_level) {

				case 'content':
					// replace content_data node in each element dom node
						// const nodes_length = self.node.length
						// for (let i = 0; i < nodes_length; i++) {

						// 	const wrapper 				 = self.node[i]
						// 	const old_content_data_node  = wrapper.querySelector(":scope >.content_data")
						// 	const new_content_data_node  = (i===0) ? node : node.cloneNode(true)

						// 	if (typeof old_content_data_node==="undefined" || !old_content_data_node) {
						// 		console.warn("Invalid node found in render:", typeof old_content_data_node, old_content_data_node, self);
						// 	}
						// 	//console.log("typeof old_content_data_node:",typeof old_content_data_node, old_content_data_node);

						// 	wrapper.replaceChild(new_content_data_node, old_content_data_node)
						// }
						const nodes_length = self.node.length
						for (let i = nodes_length - 1; i >= 0; i--) {

							const wrapper = self.node[i]

							// old content_data node
								const old_content_data_node = wrapper.querySelector(":scope >.content_data")

								// warning if not found
									if (typeof old_content_data_node==="undefined" || !old_content_data_node) {
										console.warn("Invalid node found in render:", typeof old_content_data_node, old_content_data_node, self);
									}
								//console.log("typeof old_content_data_node:",typeof old_content_data_node, old_content_data_node);

									//console.log("-----------------old_node:", old_content_data_node, self.model);

							// new content data node (first is new rendered node, others are clones of it)
								const new_content_data_node = (i===(nodes_length-1)) ? node : node.cloneNode(true)

								//console.log("-----------------new_node:", new_content_data_node, self.model);

							// replace child from parent wrapper
								wrapper.replaceChild(new_content_data_node, old_content_data_node)
						}

					return self.node[0]
					break;

				case 'full':
					// set
						self.node.push(node)

					return node
					break;
			}
		})()

	// status update
		self.status = 'rendered'

	// event publish
		event_manager.publish('render_'+self.id, node)

	// debug
		if(SHOW_DEBUG===true) {
			const total = performance.now()-t0
			if (total>100) {
				console.warn("+ Time to render ms:", self.model, self.section_tipo, self.tipo, total);
			}else{
				console.log("+ Time to render ms:", self.model, self.section_tipo, self.tipo, total);
			}
		}

	return result_node
}//end render



/**
* REFRESH
* @return promise
*/
common.prototype.refresh = async function() {
	const t0 = performance.now()

	const self = this

	// offset update
		if (self.sqo_context && typeof self.pagination!=="undefined") {
			const sqo = self.sqo_context.show.find(element => element.typo==='sqo')
			if (sqo) {
				sqo.offset = self.pagination.offset
			}

			const source = self.sqo_context.show.find(element => element.typo==='source')
			if (source) {
				source.pagination.offset = self.pagination.offset
			}
		}

	// destroy dependences only
		const destroyed = self.destroy(false, true);

	// build. Update the instance with new data
		const builded = self.build(true)

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



/*
* DESTROY
* Delete all instances dependents of the section and all events that was created by the instances.
* but it not delete the own section instance.
* @return
*/
common.prototype.destroy = async function (delete_self=true, delete_dependences=false, remove_dom=false) {

	const self = this

	const result = {}

	// destroy all instances associated
		if(delete_dependences===true){

			const do_delete_dependences = async function() {

				const ar_instances_length = self.ar_instances.length
				//if (ar_instances_length<1) {
				//	console.warn("Ignored empty ar_instances dependences ", self);
				//}
				for (let i = ar_instances_length - 1; i >= 0; i--) {
					//console.log("self.ar_instances:",JSON.parse(JSON.stringify(self.ar_instances[i])));
					self.ar_instances[i].destroy(true, true, false)
					self.ar_instances.splice(i, 1)
				}

				const result = (self.ar_instances.length===0) ? true : false

				return result
			}

			result.delete_dependences = await do_delete_dependences()
		}


	// delete self instance
		if(delete_self===true){

			const do_delete_self = async function() {

				// get the events that the instance was created
					const events_tokens = self.events_tokens

				// delete the registred events
					const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))

				// delete paginator
					if(self.paginator){
						// await self.paginator.destroy();
						delete self.paginator
					}

				// remove_dom optional
					if (remove_dom===true) {

						const remove_nodes = async () => {
							const node_length = self.node.length
							//for (let i = 0, l = node_length; i < l; i++) {
							for (let i = node_length - 1; i >= 0; i--) {
								const current_node = self.node[i]
								current_node.remove()
							}
						}
						await remove_nodes()
					}

				// delete_instance
					const result = await delete_instance({
						id				: self.id,
						model 			: self.model,
						tipo 			: self.tipo,
						section_tipo 	: self.section_tipo,
						section_id 		: self.section_id,
						mode 			: self.mode,
						lang 			: self.lang
					})

				return result
			}

			result.delete_self = await do_delete_self()
		}

	//console.log("self.ar_instances final:",JSON.parse(JSON.stringify(self.ar_instances)));
	return result
}//end destroy



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
		mode 			: (self.mode==='edit_in_list') ? 'edit' : self.mode,
		lang 			: self.lang,
		pagination		: self.pagination
	}

	return source
}//end create_source



/**
* LOAD_STYLE
* @param object self
*/
common.prototype.load_style = function(src){

	const js_promise = new Promise(function(resolve, reject) {

		// check already loaded
			const links 	= document.getElementsByTagName("link");
			const links_len = links.length
			for (let i = links_len - 1; i >= 0; i--) {
				if(links[i].getAttribute('href')===src) {
					resolve(src)
					return
				}
			}

		// DOM tag
			const element 	  = document.createElement("link")
				  element.rel = "stylesheet"

			//element.onload  = resolve(element)
			//element.onerror = reject(src)
			element.onload = function() {
				resolve(src);
			};
			element.onerror = function() {
				reject(src);
			};

			element.href = src

			document.getElementsByTagName("head")[0].appendChild(element)
	})

	if(SHOW_DEBUG===true) {
		//js_promise.then((response)=>{
		//	console.log("++ Loaded style: ", response)
		//})
	}

	return js_promise
}//end load_style



/**
* LOAD_SCRIPT
* @param object self
*//**/
common.prototype.load_script = async function(src) {

	const js_promise = new Promise(function(resolve, reject) {

		// check already loaded
			const scripts 	  = document.getElementsByTagName("script");
			const scripts_len = scripts.length
			for (let i = scripts_len - 1; i >= 0; i--) {
				if(scripts[i].getAttribute('src')===src) {
					resolve(src)
					return
				}
			}

		// DOM tag
			const element 	= document.createElement("script")
			element.setAttribute("defer", "defer");

			//element.onload  = resolve(element)
			//element.onerror = reject(src)
			element.onload = function() {
				resolve(src);
			};
			element.onerror = function() {
				reject(src);
			};

			element.src = src

			document.head.appendChild(element)
	})

	if(SHOW_DEBUG===true) {
		//js_promise.then((response)=>{
		//	console.log("++ Loaded script: ", response)
		//})
	}

	return js_promise
}//end load_script



/**
* LOAD_TOOL
* @param tool_object options
* @param self instance_caller
* @return object tool
*/
// common.prototype.load_tool = async function(self, tool_object){

	// 	const tool_instance = await get_instance({
	// 		model 			: tool_object.name,
	// 		tipo 			: self.tipo,
	// 		section_tipo 	: self.section_tipo,
	// 		section_id 		: self.section_id,
	// 		mode 			: self.mode,
	// 		lang 			: self.lang,
	// 		caller 			: self,
	// 		tool_object		: tool_object
	// 	})

	// 	// destroy if already loaded (toggle tool)
	// 		if (tool_instance.status && tool_instance.status!=='init') {

	// 			tool_instance.destroy(true, true, true)

	// 			return false
	// 		}

	// 	await tool_instance.build(true)
	// 	tool_instance.render()

	// 	return tool_instance
// }//end load_tool


