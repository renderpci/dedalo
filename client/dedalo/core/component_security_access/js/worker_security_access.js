// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* WORKER_SECURITY_ACCESS
* Dedicated Web Worker that offloads expensive recursive ontology-tree walks
* needed by the security-access component (`component_security_access`) to a
* background thread, keeping the main UI thread free while large permission
* trees are computed.
*
* Exported functions (callable via `postMessage`):
*   - `get_children(item, datalist)` — collects all descendants of `item`
*   - `get_parents(item, datalist)`  — collects all ancestors of `item`
*
* Design notes:
*   - Web Worker module syntax (`{type:'module'}`) is NOT used here because it
*     does not work reliably in Firefox. All code in this file is therefore
*     plain-script globals bound to `self` (the worker's global scope).
*   - The worker is spawned on demand by `render_edit_component_security_access`
*     via `new Worker(self.worker_path)` (path resolved during `init()`), and
*     terminated by the caller immediately after the response is consumed.
*   - `children_generator` is a private generator helper defined in this file
*     that is NOT exposed through `onmessage`; it can be used internally if
*     the dispatch switch is extended in the future.
*
* Datalist node shape (`item` / elements of `datalist`):
* ```
* {
*   tipo         : {string}  — unique ontology identifier (e.g. "mht55")
*   section_tipo : {string}  — the section this node belongs to (e.g. "mht5")
*   model        : {string}  — component model name (e.g. "section_group")
*   label        : {string}  — human-readable label
*   parent       : {string}  — tipo of the immediate parent node
* }
* ```
* When `tipo === section_tipo` the node represents a section (or area) rather
* than a component leaf; tree-traversal logic branches on this condition to
* avoid crossing section boundaries.
*
* @see component_security_access.js  Host component; spawns this worker.
* @see render_edit_component_security_access.js  Render layer that triggers the worker.
*/

// WORKER
// Calculate complex data in background like recursive children or parent
// (!) Note that the worker module version doesn't work in Firefox and scope is very annoying to receive functions by name



/**
* ONMESSAGE
* Worker message handler. Receives a structured payload from the main thread,
* validates the requested function name, dispatches to the matching `self.*`
* function, and posts the result back.
*
* Expected message shape (`e.data`):
* ```
* {
*   fn     : {string}  — name of the worker function to call ('get_children' or 'get_parents')
*   params : {Array}   — positional arguments forwarded to the named function via spread
* }
* ```
*
* Response shape posted back (`self.postMessage`):
* ```
* {
*   result : {Array|false}  — return value of the called function, or false on error
*   msg    : {string}       — human-readable status / timing message
*   errors : {Array}        — list of error strings (empty on success)
* }
* ```
*
* Typical caller pattern (from `render_edit_component_security_access`):
* ```js
*   const current_worker = new Worker('../component_security_access/js/worker_security_access.js');
*   current_worker.postMessage({
*     fn     : 'get_children',
*     params : [item, datalist]
*   });
*   current_worker.onmessage = function(e) {
*     const children = e.data.result
*     fn_global_radio(children)
*     current_worker.terminate()
*   }
* ```
*
* Security note: only two function names are accepted ('get_children' /
* 'get_parents'). Any other value causes an early-return error response,
* preventing arbitrary code execution via `self[fn]()`.
*
* @param {MessageEvent} e - Worker message event; payload lives in `e.data`
*/
self.onmessage = function(e) {
	const t1 = performance.now()

	// Initialise the response envelope; result is overwritten on success.
	const response = {
		result	: false,
		msg		: 'onmessage error',
		errors	: []
	}

	// options
		const fn		= e.data.fn // function name
		const params	= e.data.params // array of params to sent to the function

	// Validate that the requested function exists on self before calling it.
	// This guards against arbitrary-function execution if the caller sends a
	// crafted fn value that happens to match a built-in global (e.g. 'close').
	// check function
		if (typeof self[fn]!=='function') {
			// error
			response.result	= false
			response.errors.push('Invalid target function name! ' + fn)
			response.msg	= 'Task rejected'
			console.error("Worker errors:", response.errors);
			self.postMessage(response);
			return
		}

	// Explicit allow-list switch: only the two known functions are dispatched.
	// The default branch catches function names that pass the typeof check above
	// but are not intentionally exposed (e.g. native self methods).
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
				response.errors.push('Invalid target function name! ' + fn)
				break;
		}

	// response OK
		response.result	= result
		response.msg	= 'Task done in ms: ' + performance.now()-t1 + ' ms'


	self.postMessage(response);
}//end onmessage



/**
* GET_CHILDREN
* Collect all descendants of `item` from `datalist` using an iterative
* depth-first stack (avoids call-stack overflow on deep ontology trees).
*
* Tree-traversal rules:
*   - When `item.tipo === item.section_tipo` the node is a section or area.
*     Its children are ALL datalist nodes whose `parent` equals `item.tipo`
*     (cross-section traversal is intentional here: sections can nest).
*   - Otherwise the node is a component leaf and only children within the same
*     section (`section_tipo`) are collected.
*
* The same branching logic is applied recursively at each level via the stack,
* so mixed-depth trees (areas → sections → components) are handled correctly.
*
* @param {Object} item     - Datalist node whose descendants are wanted
*   @param {string} item.tipo         - Unique ontology identifier
*   @param {string} item.section_tipo - Owning section tipo
*   @param {string} item.parent       - Tipo of this node's immediate parent
* @param {Array}  datalist - Full flat ontology datalist array
* @returns {Array} ar_children - Flat array of all descendant datalist nodes
*   (order is depth-first, but not stable across calls because stack.pop() is LIFO)
*/
self.get_children = function(item, datalist) {

	// optimized (stack way)
		const children = (item.tipo === item.section_tipo)
			? datalist.filter(el => el.parent === item.tipo) // section / area case
			: datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo); // components case

		const ar_children = [];
		const stack = [...children];

		while (stack.length > 0) {
			const current = stack.pop();
			ar_children.push(current);

			// Apply the same section/component branching for each level traversed.
			const grandchildren = (current.tipo === current.section_tipo)
				? datalist.filter(el => el.parent === current.tipo)
				: datalist.filter(el => el.parent === current.tipo && el.section_tipo === current.section_tipo);

			stack.push(...grandchildren);
		}


	return ar_children
}//end get_children



/**
* CHILDREN_GENERATOR
* Generator-based alternative to `get_children` for lazy depth-first traversal.
* Each `yield` produces one descendant node, allowing callers to short-circuit
* the walk early (e.g. break out of a `for...of` loop).
*
* NOTE: This function is NOT exposed through `onmessage` and is therefore not
* callable by the main thread via `postMessage`. It is retained here as a
* building block for future use or if the dispatch switch is extended.
*
* Traversal rules mirror `get_children`:
*   - Section/area nodes (`tipo === section_tipo`) yield all children regardless
*     of `section_tipo`, allowing cross-section descent.
*   - Component nodes restrict children to the same `section_tipo`.
*
* Limitation: recursive generator delegation (`for...of children_generator(...)`)
* may cause call-stack overflows on extremely deep trees. Prefer the iterative
* `get_children` for production use on large ontologies.
*
* @param {Object} item     - Root datalist node to traverse from
*   @param {string} item.tipo         - Unique ontology identifier
*   @param {string} item.section_tipo - Owning section tipo
*   @param {string} item.parent       - Tipo of this node's immediate parent
* @param {Array}  datalist - Full flat ontology datalist array
* @yields {Object} Individual descendant datalist nodes, depth-first
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
* Collect all ancestors of `item` from `datalist` by walking upward through
* the `parent` chain, using an iterative stack to avoid recursion depth limits.
*
* Tree-traversal rules (mirror the inverse of `get_children`):
*   - When a node is a section/area (`tipo === section_tipo`), the ancestor
*     lookup is unconstrained by `section_tipo` — sections can be nested inside
*     areas that have a different `section_tipo`.
*   - When a node is a component leaf, ancestor lookup is limited to the same
*     `section_tipo` to avoid accidentally climbing into sibling sections.
*
* The same branching is applied at each step via `parentFilter`, which is
* rebuilt per iteration based on the current node type.
*
* @param {Object} item     - Datalist node whose ancestors are wanted
*   @param {string} item.tipo         - Unique ontology identifier
*   @param {string} item.section_tipo - Owning section tipo
*   @param {string} item.parent       - Tipo of this node's immediate parent
* @param {Array}  datalist - Full flat ontology datalist array
* @returns {Array} ar_parents - Flat array of all ancestor datalist nodes
*   (order reflects pop() traversal; root-most ancestors appear last)
*/
self.get_parents = function(item, datalist) {

	// optimized (stack way)
		const parents = (item.tipo === item.section_tipo)
			? datalist.filter(el => el.tipo === item.parent)
			: datalist.filter(el => el.tipo === item.parent && el.section_tipo === item.section_tipo);

		const ar_parents = [];
		const stack = [...parents];

		while (stack.length > 0) {
			const current = stack.pop();
			ar_parents.push(current);

			// Build a filter predicate for the next generation of parents,
			// applying the same section/component branching as the initial lookup.
			const parentFilter = (current.tipo === current.section_tipo)
				? (el) => el.tipo === current.parent
				: (el) => el.tipo === current.parent && el.section_tipo === current.section_tipo;

			stack.push(...datalist.filter(parentFilter));
		}


	return ar_parents;
}//end get_parents



// @license-end

