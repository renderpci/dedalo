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

	if (typeof self[e.data.fn]==='function') {

		const result = self[fn](...params)

		response.result	= result
		response.msg	= 'Task done in ms: ' + performance.now()-t1 + ' ms'

	}else{
		// error
		response.result	= false
		response.error	= 'Invalid target function name!'
		response.msg	= 'Task done in ms: ' + performance.now()-t1 + ' ms'
		console.warn("Worker error:", response.error);
	}

	console.log("__***Time performance.now()-t1 worker:", fn, performance.now()-t1);

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
function get_children(item, datalist) {

	let ar_children = []

	// const children = (item.model==='section' || item.model.indexOf('area')===0)
	const children = (item.tipo===item.section_tipo)
		? datalist.filter(el => el.parent === item.tipo) // section / area case
		: datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo) // components case

	const children_length = children.length
	if(children_length>0){
		// ar_children.push(...children)
		ar_children = children
		const children_length = children.length
		for (let i = 0; i < children_length; i++) {
			const recursive_parents = get_children( children[i], datalist )
			ar_children.push(...recursive_parents)
		}
	}

	return ar_children
}//end get_children



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
* @return array ar_parents
*/
function get_parents(item, datalist) {

	let ar_parents = []

	// const parents = (item.model==='section' || item.model.indexOf('area')===0)
	const parents = (item.tipo===item.section_tipo)
		? datalist.filter(el => el.tipo === item.parent)
		: datalist.filter(el => el.tipo === item.parent && el.section_tipo === item.section_tipo)

	const parents_length = parents.length
	if(parents_length>0){
		// ar_parents.push(...parents)
		ar_parents = parents
		for (let i = 0; i < parents_length; i++) {
			const recursive_parents = get_parents( parents[i], datalist )
			ar_parents.push(...recursive_parents)
		}
	}

	return ar_parents
}//end get_parents
