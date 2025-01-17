// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

// WORKER
// Calculate complex data in background like recursive children or parent
// (!) Note that the worker module version doesn't work in Firefox and scope is very annoying to receive functions by name



/**
* ONMESSAGE
* Called from caller 'postMessage' action like:

	const current_worker = new Worker('../component_security_access/js/worker.js');
	current_worker.postMessage({
		fn		: 'get_children',
		params	: [item, datalist]
	});
	current_worker.onmessage = function(e) {
		const children = e.data.result
		fn_global_radio(children)
		current_worker.terminate()
	}
*/
self.onmessage = function(e) {
	const t1 = performance.now()

	const response = {}

	// options
		const fn		= e.data.fn // function name
		const params	= e.data.params // array of params to sent to the function

	// check function
		if (typeof self[fn]!=='function') {
			// error
			response.result	= false
			response.error	= 'Invalid target function name! ' + fn
			response.msg	= 'Task rejected'
			console.error("Worker error:", response.error);
			self.postMessage(response);
			return
		}

	// fire function
		let result
		switch (fn) {
			case 'get_children':
				result = self.get_children(...params)
				break;
			case 'get_parents':
				result = self.get_parents(...params)
				break;
			default:
				response.error	= 'Invalid target function name! ' + fn
				break;
		}

	// response OK
		response.result	= result
		response.msg	= 'Task done in ms: ' + performance.now()-t1 + ' ms'


	self.postMessage(response);
}//end onmessage



/**
* GET_CHILDREN
* Get datalist children recursively from given item
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
	}
* @return array ar_children
*/
self.get_children = function(item, datalist) {

	// old way
		// const ar_children = []
		// const children = (item.tipo===item.section_tipo)
		// 	? datalist.filter(el => el.parent === item.tipo) // section / area case
		// 	: datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo) // components case
		// const children_length = children.length
		// if(children_length>0){
		// 	// add
		// 	ar_children.push(...children)
		// 	// recursion
		// 	for (let i = 0; i < children_length; i++) {
		// 		const recursive_children = self.get_children( children[i], datalist )
		// 		ar_children.push(...recursive_children)
		// 	}
		// }

	// optimized (stack way)
		const children = (item.tipo === item.section_tipo)
			? datalist.filter(el => el.parent === item.tipo)
			: datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo);

		const ar_children = [];
		const stack = [...children];

		while (stack.length > 0) {
			const current = stack.pop();
			ar_children.push(current);

			const grandchildren = (current.tipo === current.section_tipo)
				? datalist.filter(el => el.parent === current.tipo)
				: datalist.filter(el => el.parent === current.tipo && el.section_tipo === current.section_tipo);

			stack.push(...grandchildren);
		}


	return ar_children
}//end get_children



/**
* CHILDREN_GENERATOR
* 	Recursive children generator
* @param object item
* @param array datalist
* @yield array
*/
const children_generator = function*(item, datalist) {

	const children = (item.tipo===item.section_tipo)
		? datalist.filter(el => el.parent === item.tipo) // section / area case
		: datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo)

	const children_length = children.length
	if(children_length>0){
		for (let i = 0; i < children_length; i++) {
			yield children[i]
			// recursion
			for (const el of children_generator(children[i], datalist)) {
				yield el
			}
		}
	}
}//end children_generator




/**
* GET_PARENTS
* Get parents recursively from given item
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
	}
* @return array parents
*/
self.get_parents = function(item, datalist) {

	// old way
		// const ar_parents = []
		// const parents = (item.tipo===item.section_tipo)
		// 	? datalist.filter(el => el.tipo === item.parent)
		// 	: datalist.filter(el => el.tipo === item.parent && el.section_tipo === item.section_tipo)
		// const parents_length = parents.length
		// if(parents_length>0){
		// 	// add
		// 	ar_parents.push(...parents)
		// 	for (let i = 0; i < parents_length; i++) {
		// 		const recursive_parents = self.get_parents( parents[i], datalist )
		// 		ar_parents.push(...recursive_parents)
		// 	}
		// }

	// optimized (stack way)
		const parents = (item.tipo === item.section_tipo)
			? datalist.filter(el => el.tipo === item.parent)
			: datalist.filter(el => el.tipo === item.parent && el.section_tipo === item.section_tipo);

		const ar_parents = [];
		const stack = [...parents];

		while (stack.length > 0) {
			const current = stack.pop();
			ar_parents.push(current);

			const parentFilter = (current.tipo === current.section_tipo)
				? (el) => el.tipo === current.parent
				: (el) => el.tipo === current.parent && el.section_tipo === current.section_tipo;

			stack.push(...datalist.filter(parentFilter));
		}


	return ar_parents;
}//end get_parents



// @license-end

