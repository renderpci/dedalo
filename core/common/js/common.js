/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
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
};//end common



/**
* BUILD
* Generic agnostic build function created to maintain
* unity of calls.
* (!) For components, remember use always component_common.build()
* @return bool true
*/
common.prototype.build = async function () {

	const self = this

	// status update
		self.status = 'building'

	// permissions. calculate and set (used by section records later)
		self.permissions = self.context.permissions

	// status update
		self.status = 'builded'


	return true
};//end common.prototype.build



/**
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first dom node stored in instance 'node' array
*/
common.prototype.render = async function (options={render_level:'full'}) {
	const t0 = performance.now()

	const self = this

	const render_level 	= options.render_level || 'full'
	let render_mode 	= self.mode

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
			console.warn(`Invalid function (render_mode: ${render_mode} ) using fallbact to LIST mode on ` +
						 'instance: ', self);
			render_mode = 'list'
		}
		const node = await self[render_mode]({
			render_level : render_level
		})

	// result_node render based in render_level
		const result_node = await (async () => {

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
								const old_content_data_node = self.model==='section' && self.mode==='list'
									? wrapper.querySelector(":scope >.list_body >.content_data")
									: wrapper.querySelector(":scope >.content_data")

								// const old_content_data_nodes = wrapper.querySelectorAll(":scope >.content_data")
								// const get_content_data_node = () => {
								// 	let result = null
								// 	for (let v = 0; v < old_content_data_nodes.length; v++) {
								// 		if (v===0) {
								// 			result = old_content_data_nodes[v]
								// 		}else{
								// 			old_content_data_nodes[v].remove()
								// 			console.warn("!!! Removed additional content_data noded:", v, self.model);
								// 		}
								// 	}
								// 	return result
								// }
								// const old_content_data_node = get_content_data_node()

								// warning if not found
									if (typeof old_content_data_node==="undefined" || !old_content_data_node) {
										console.warn("Invalid node found in render:", typeof old_content_data_node, old_content_data_node, self);
									}
								//console.log("typeof old_content_data_node:",typeof old_content_data_node, old_content_data_node);
								//console.log("-----------------old_node:", old_content_data_node, self.model);

							// new content data node (first is new rendered node, others are clones of it)
								// const new_content_data_node = (i===(nodes_length-1)) ? node : node.cloneNode(true) (!) Removed 25-03-2020
								// Note : In some context like dd-tiny, it is necessary to generate a fresh DOM node for each
								// component node like text_area in a time machine refresh scenario
								const new_content_data_node = (i===0)
									? node // use already calculated node
									: await self[render_mode]({render_level : render_level});

								// console.log("-----------------old_content_data_node:",old_content_data_node);
								// console.log("-----------------new_node:", new_content_data_node, self.model);

							// replace child from parent wrapper
								if (self.model==='section' && self.mode==='list') {
									const list_body = wrapper.querySelector(":scope >.list_body")
									list_body.replaceChild(new_content_data_node, old_content_data_node)
								}else{
									wrapper.replaceChild(new_content_data_node, old_content_data_node)
								}
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
		event_manager.publish('render_'+self.id, result_node)
		event_manager.publish('render_instance', self)

	// debug
		if(SHOW_DEBUG===true) {
			const total = performance.now()-t0
			if (total>100) {
				console.warn("__Time to render ms:", self.model, self.section_tipo, self.tipo, total);
			}else{
				console.log("__Time to render ms:", self.model, self.section_tipo, self.tipo, total);
			}
		}

	return result_node
};//end render



/**
* REFRESH
* @return promise
*/
common.prototype.refresh = async function () {
	const t0 = performance.now()

	const self = this

	// offset update
		if (self.dd_request.show && typeof self.pagination!=="undefined") {
			const sqo = self.dd_request.show.find(element => element.typo==='sqo')
			if (sqo) {
				sqo.offset = self.pagination.offset
			}

		}

	// destroy dependences only
		if (self.status==='rendered') {
			const destroyed = await self.destroy(false, true)
		}else{
			console.warn("/// destroyed fail with status:", self.model, self.status);
			return false
		}

	// build. Update the instance with new data
		//if (self.status==='destroyed') {
			const builded = await self.build(true)
		//}else{
		//	console.warn("/// build fail with status:", self.model, self.status);
		//	return false
		//}

	// copy original ar_node
		//const ar_node 		 = self.node
		//const ar_node_length = ar_node.length

	// render
		if (self.status==='builded') {
			await self.render({render_level : 'content'})
		}else{
			console.warn("/// render fail with status:", self.model, self.status);
			return false
		}

	//node.classList.add("loading")
	//const isPromise = (val) => {
	//  return (
	//  	(val !== undefined && val !== null) &&
	//    typeof val.then==='function' &&
	//    typeof val.catch==='function'
	//  )
	//}

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Time to refresh:", self.model, performance.now()-t0);
		}


	return true
};//end refresh



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

				if(SHOW_DEBUG===true) {
					if (ar_instances_length<1) {
						// console.warn("[common.destroy.delete_dependences] Ignored empty ar_instances as dependences ", self);
					}
				}

				// remove instances from self ar_instances
					//const ar_to_destroy = []
					for (let i = ar_instances_length - 1; i >= 0; i--) {

						if(self.ar_instances[i].destroyable===false){
							const destroyed_elements = self.ar_instances.splice(i, 1);
							continue;
						}
						// console.log("self.ar_instances:",JSON.parse(JSON.stringify(self.ar_instances[i])));
						// remove from array of instances of current element
						const destroyed_elements = self.ar_instances.splice(i, 1)

						// send instance to general destroy
						if (typeof destroyed_elements[0].destroy!=="undefined") {
							destroyed_elements[0].destroy(true, true, false) // No wait here, only launch destroy order
						}
					}

				// destroy all removed instances
					// const ar_to_destroy_length = ar_to_destroy.length
					// for (let k = ar_to_destroy_length - 1; k >= 0; k--) {
					// 	ar_to_destroy[k].destroy(true, true, false)
					// }

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

				// destroy services
					if (self.services) {
						const services_length = self.services.length
						for (let i = self.services.length - 1; i >= 0; i--) {
							console.log("removed services:", i, services_length);
							delete self.services[i]
						}
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
					const instance_options = {
						id				: self.id,
						model 			: self.model,
						tipo 			: self.tipo,
						section_tipo 	: self.section_tipo,
						section_id 		: self.section_id,
						mode 			: self.mode,
						lang 			: self.lang
					}
					// time machine case
					if (self.matrix_id) {
						instance_options.matrix_id = self.matrix_id
					}
					const result = await delete_instance(instance_options)

				return result
			}

			result.delete_self = await do_delete_self()
		}

	// status update
		self.status = 'destroyed'


	//console.log("self.ar_instances final:",JSON.parse(JSON.stringify(self.ar_instances)));
	return result
};//end destroy



/**
* CREATE_SOURCE
* @param object options
* @return object source
*/
export const create_source = function (self, action) {

	const source = { // source object
		typo			: "source",
		action			: action,
		model 			: self.model,
		tipo 			: self.tipo,
		section_tipo	: self.section_tipo,
		section_id		: self.section_id,
		mode 			: (self.mode==='edit_in_list') ? 'edit' : self.mode,
		lang 			: self.lang,
		//pagination		: self.pagination || null
	}

	// matrix_id optional (used in time machine mode)
		if (true===self.hasOwnProperty('matrix_id') && self.matrix_id) {
			source.matrix_id = self.matrix_id
		}

	return source
};//end create_source



/**
* LOAD_STYLE
* @param object self
*/
common.prototype.load_style = function (src) {

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
};//end load_style



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
			const element = document.createElement("script")
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
};//end load_script



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
// };//end load_tool



/**
* BUILD_DD_REQUEST
*/
common.prototype.build_dd_request = function(dd_request_type, request_config, action){

	const self = this

	switch (dd_request_type) {

		case 'show':
			return build_request_show(self, request_config, action)

		case 'search':
			return build_request_search(self, request_config, action)

		case 'select':
			return build_request_select(self, request_config, action)
			break;
	}

	return null
};//end build_dd_request



/**
* BUILD_REQUEST_SHOW
* @return array dd_request
*/
const build_request_show = function(self, request_config, action){

	const dd_request = []

	// source . auto create
		const source = create_source(self, action);
		dd_request.push(source)

	// empty request_config cases
		if(!request_config) {
			return dd_request;
		}

	// direct request ddo if exists
		const ar_requested_ddo = request_config.filter(item => item.typo==='ddo')
		if (ar_requested_ddo.length>0) {
			for (let i = 0; i < ar_requested_ddo.length; i++) {
				dd_request.push(ar_requested_ddo[i])
			}
		}

	// direct request sqo if exists
		const request_sqo = request_config.find(item => item.typo==='sqo')
		if (request_sqo) {
			dd_request.push(request_sqo)
		}

	// rqo. If don't has rqo, return the source only
		const rqo = request_config.filter(item => item.typo==='rqo')
		if(rqo.length < 1){
			return dd_request;
		}

	// ddo. get the global request_ddo storage, ddo_storage is the centralized storage for all ddo in section
		const request_ddo_object	= self.datum.context.find(item => item.typo==='request_ddo')
		const all_request_ddo		= request_ddo_object.value

		const rqo_length	= rqo.length
		const ar_sections	= []
		const request_ddo 	= []
		for (let i = 0; i < rqo_length; i++) {

			const current_rqo		= rqo[i]
			const operator			= current_rqo.show.sqo_config.operator || '$and'
			const sections			= current_rqo.section_tipo

			const sections_length	= sections.length
			// show
			const show				= current_rqo.show
			const ddo_map			= show.ddo_map
			const ddo_map_length	= ddo_map.length
			//get sections
			for (let j = 0; j < sections_length; j++) {
				ar_sections.push(sections[j])
				// get the fpath array
				for (let k = 0; k < ddo_map_length; k++) {

					const f_path = typeof ddo_map[k].f_path!=='undefined' ? ddo_map[k].f_path : ['self', ddo_map[k]]
					const f_path_length = f_path.length

					// get the current item of the fpath
					for (let l = 0; l < f_path_length; l++) {
						const item = f_path[l]==='self'
							? sections[j]
							: f_path[l]
						const exist = request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===sections[j])

						if(!exist){
							const ddo = all_request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===sections[j])

							if(ddo){
								request_ddo.push(ddo)
							}
						}
					}
				}
			}

			//value_with_parents
			if(show.value_with_parents){
				dd_request.push({
					typo : 'value_with_parents',
					value : show.value_with_parents
				})
			}

			//divisor
			if(show.divisor){
				dd_request.push({
					typo : 'divisor',
					value : show.divisor
				})
			}
		}

		// set the selected ddos into new request_ddo for do the call with the selection
		dd_request.push({
			typo : 'request_ddo',
			value : request_ddo
		})


	// get the limit and offset
		const limit	= (rqo[0].show.sqo_config.limit)
			? rqo[0].show.sqo_config.limit
			: 10
		const offset = (rqo[0].show.sqo_config.offset)
			? rqo[0].show.sqo_config.offset
			: 0

	// sqo
		const sqo = {
			typo				: 'sqo',
			section_tipo		: ar_sections,
			filter				: null,
			limit				: limit,
			offset				: offset,
			select				: [],
			full_count			: false,
			filter_by_locators	: null
		}
		dd_request.push(sqo)

		//add the full rqo to the dd_request
		dd_request.push(rqo[0])

	return dd_request
};//end build_request_show



/**
* BUILD_REQUEST_SEARCH
* @return array dd_request
*/
const build_request_search = function(self, request_config, action){

	const dd_request	= []
	const ar_sections	= []

	const rqo = request_config.filter(item => item.typo==='rqo')

	// get the global request_ddo storage, ddo_storage is the centralized storage for all ddo in section.
	const all_request_ddo	= self.datum.context.find(item => item.typo==='request_ddo').value

	const rqo_length	= rqo.length
	// const operator	= self.context.properties.source.operator || '$and'
	const request_ddo 		= []

	for (let i = 0; i < rqo_length; i++) {

		const current_rqo		= rqo[i]
		const operator			= current_rqo.search.sqo_config.operator || '$and'
		const sections			= current_rqo.section_tipo
		const sections_length	= sections.length
		const sqo_search		= []

		// source . auto create
			const source = create_source(self, action)
			sqo_search.push(source)


		const fixed_filter	= current_rqo.fixed_filter
		const filter_free	= {}
			  filter_free[operator] = []

		// type add
		sqo_search.push({
			typo	: 'search_engine',
			value	: current_rqo.search_engine
		})

		// search
		const search			= current_rqo.search
		const ddo_map			= search.ddo_map
		const ddo_map_length	= ddo_map.length

		//get sections
		for (let j = 0; j < sections_length; j++) {
			const section_ddo = all_request_ddo.find(ddo => ddo.tipo===sections[j]  && ddo.section_tipo===sections[j])
			request_ddo.push(section_ddo)

			// get the fpath array
			for (let k = 0; k < ddo_map_length; k++) {

				const f_path		= typeof ddo_map[k].f_path!=='undefined' ? ddo_map[k].f_path :  ['self', ddo_map[k]]
				const f_path_length	= f_path.length
				const ar_paths		= []

				// get the current item of the fpath
				for (let l = 0; l < f_path_length; l++) {
					if(l % 2 !== 0){

						const item = f_path[l]
						const section_tipo = (f_path[l-1]==='self')
							? sections[j]
							: f_path[l-1]

						const ddo = all_request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===section_tipo )
						if (ddo) {
							ddo.mode = 'list' // enable lang fallback value
							request_ddo.push(ddo)
							const path = {
								section_tipo	: section_tipo,
								component_tipo	: item,
								modelo			: ddo.model
							}
							ar_paths.push(path)
						}
					}
				}

				filter_free[operator].push({
					q		: '',
					path	: ar_paths
				})
			}
		}
		// fixed_filter
		if (fixed_filter) {
			sqo_search.push({
				typo : 'fixed_filter',
				value : fixed_filter
			})
		}

		// filter_free
		if (filter_free) {
			sqo_search.push({
				typo 		: 'filter_free',
				value 		: filter_free,
				operator 	: operator
			})
		}

		// filter_by_list if exists
		const filter_by_list = current_rqo.filter_by_list
		if (filter_by_list) {
			sqo_search.push({
				typo : 'filter_by_list',
				value : filter_by_list
			})
		}

		// limit and offset
			// check if limit and offset exist in select
			const limit	= current_rqo.select && current_rqo.select.sqo_config && current_rqo.select.sqo_config.limit
				? current_rqo.select.sqo_config.limit
				: (search.sqo_config.limit)
					? search.sqo_config.limit
					: current_rqo.show.sqo_config.limit
			const offset = current_rqo.select && current_rqo.select.sqo_config && current_rqo.select.sqo_config.offset
				? current_rqo.select.sqo_config.offset
				: search.sqo_config.offset

		// sqo_search
		sqo_search.push({
			typo			: 'sqo',
			section_tipo	: sections,
			filter			: {[operator]:[]},
			offset			: offset || 0,
			limit			: limit || 10,
			select			: [],
			full_count		: false
		})

		// if(current_rqo.select){
		// 	const select = self.build_dd_request('select', request_config, 'get_data')
		// 	const ddo_select = select.filter(item => item.typo === 'ddo')
		// 	sqo_search.push(...ddo_select)
		// 	console.log("ddo_select", sqo_search);
		// }

		//value_with_parents
		if(search.value_with_parents){
			sqo_search.push({
				typo : 'value_with_parents',
				value : search.value_with_parents
			})
		}

		//divisor
		if(search.divisor){
			sqo_search.push({
				typo : 'divisor',
				value : search.divisor
			})
		}

		// set the selected ddos into new request_ddo for do the call with the selection
		sqo_search.push({
			typo : 'request_ddo',
			value : request_ddo
		})


		// add group
		dd_request.push(sqo_search)
	}//end for (let i = 0; i < length; i++)


	return dd_request
};//end build_request_search



/**
* BUILD_REQUEST_SELECT
* @return array dd_request
*/
const build_request_select = function(self, request_config, action){

	const dd_request = []

	// source . auto create
		const source = create_source(self, action);
		dd_request.push(source)

	// empty request_config cases
		if(!request_config) {
			return dd_request;
		}

	// direct request ddo if exists
		const ar_requested_ddo = request_config.filter(item => item.typo==='ddo')
		if (ar_requested_ddo.length>0) {
			for (let i = 0; i < ar_requested_ddo.length; i++) {
				dd_request.push(ar_requested_ddo[i])
			}
		}

	// direct request sqo if exists
		const request_sqo = request_config.find(item => item.typo==='sqo')
		if (request_sqo) {
			dd_request.push(request_sqo)
		}

	// rqo. If don't has rqo, return the source only
		const rqo = request_config.filter(item => item.typo==='rqo')
		if(rqo.length < 1){
			return dd_request;
		}

	// ddo. get the global request_ddo storage, ddo_storage is the centralized storage for all ddo in section
		const request_ddo_object	= self.datum.context.find(item => item.typo==='request_ddo')
		const all_request_ddo			= request_ddo_object.value

		const request_ddo 			= []

		const rqo_length	= rqo.length
		const ar_sections	= []
		for (let i = 0; i < rqo_length; i++) {

			const current_rqo		= rqo[i]
			const sections			= current_rqo.section_tipo

			const sections_length	= sections.length
			// select
			const select			= current_rqo.select
			const ddo_map			= select.ddo_map
			const ddo_map_length	= ddo_map.length
			//get sections
			for (let j = 0; j < sections_length; j++) {
				ar_sections.push(sections[j])
				// get the fpath array
				for (let k = 0; k < ddo_map_length; k++) {

					const f_path = typeof ddo_map[k].f_path!=='undefined' ? ddo_map[k].f_path : ['self', ddo_map[k]]
					const f_path_length = f_path.length

					// get the current item of the fpath
					for (let l = 0; l < f_path_length; l++) {
						const item = f_path[l]==='self'
							? sections[j]
							: f_path[l]
						const exist = request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===sections[j])

						if(!exist){
							const ddo = all_request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===sections[j])

							if(ddo){
								request_ddo.push(ddo)
							}
						}
					}
				}
			}
			//value_with_parents
			if(select.value_with_parents){
				dd_request.push({
					typo : 'value_with_parents',
					value : select.value_with_parents
				})
			}

			//divisor
			if(select.divisor){
				dd_request.push({
					typo : 'divisor',
					value : select.divisor
				})
			}
		}

		// set the selected ddos into new request_ddo for do the call with the selection
		dd_request.push({
			typo : 'request_ddo',
			value : request_ddo
		})

	return dd_request
};//end build_request_show




/**
* LOAD_DATA_DEBUG
* @return
*/
export const load_data_debug = async function(self, load_data_promise, dd_request_show_original) {

	if(SHOW_DEBUG===false) {
		return false
	}

	if (self.model!=="section" && self.model!=="area" && self.model.indexOf("area_")===-1) {
		return false
	}

	const response		= await load_data_promise
	const dd_request	= self.dd_request

	console.log("----> load_data_debug request dd_request_show_original "+self.model +" "+self.tipo+ ":", dd_request_show_original);
	// console.trace()

	// load_data_promise
	if (response.result===false) {
		console.error("API EXCEPTION:",response.msg);
	}
	console.log("["+self.model+".load_data_debug] response:",response, " TIME: "+response.debug.exec_time)
	// console.log("["+self.model+".load_data_debug] context:",response.result.context)
	// console.log("["+self.model+".load_data_debug] data:",response.result.data)

	const debug = document.getElementById("debug")
	// debug.classList.add("hide")

	// clean
		while (debug.firstChild) {
			debug.removeChild(debug.firstChild)
		}

	// request to api
		const sqo = dd_request_show_original.find(el => el.typo==='sqo') || null
		const request_pre = ui.create_dom_element({
			element_type	: 'pre',
			text_content	: "dd_request sended to api: \n\n" + JSON.stringify(dd_request_show_original, null, "  ") + "\n\n\n\n" + "dd_request new builded: \n\n" + JSON.stringify(dd_request, null, "  "),
			parent			: debug
		})


	// context
		const context_pre = ui.create_dom_element({
			element_type	: 'pre',
			text_content	: "context: " + JSON.stringify(response.result.context, null, "  "),
			parent			: debug
		})

	// data
		const data_pre = ui.create_dom_element({
			element_type	: 'pre',
			text_content	: "data: " + JSON.stringify(response.result.data, null, "  "),
			parent			: debug
		})

	// const time_info = "" +
	// 	"Total time: " + response.debug.exec_time +
	// 	"<br>Context exec_time: " + response.result.debug.context_exec_time +
	// 	"<br>Data exec_time: " + response.result.debug.data_exec_time  + "<br>"

	// const time_info_pre = ui.create_dom_element({
	// 	element_type : "pre",
	// 	class_name   : "total_time",
	// 	id   		 : "total_time",
	// 	inner_html   : time_info,
	// 	parent 		 : debug
	// })

	// show
		// event_manager.subscribe('render_'+self.id, function(node){
		// 	//console.log("node:",node);
		// 	debug.classList.remove("hide")
		// })
		debug.classList.remove("hide")


	return true
};//end load_data_debug
