// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* SEARCH_UTILS
* Stateless utility helpers shared across the Dédalo search subsystem.
*
* Currently exports a single function, is_filter_empty, which decides whether
* a fully-built SQO filter tree contains at least one active query clause.
* Keeping these helpers in a separate module avoids circular imports between
* search.js, render_search.js, and the section modules that import them.
*
* Exports:
*   is_filter_empty  — tests whether an SQO filter object has any non-empty `q` leaf
*/



/**
* IS_FILTER_EMPTY
* Determine whether a normalized SQO filter tree is entirely empty — i.e. contains
* no active search clause — by recursively inspecting every leaf `q` value.
*
* Filter object shape (same structure produced by serialize_filter_model and consumed
* by the server-side SQO handler):
*
*   { "$and": [ <clause|group>, … ] }   — root or nested AND group
*   { "$or":  [ <clause|group>, … ] }   — nested OR group
*
* Each array element is either:
*   - A leaf clause:  { path: […], q: <Array|string|null>, q_operator: …, type: 'jsonb', … }
*   - A nested group: { "$and": […] }  or  { "$or": […] }
*
* Leaf vs group is decided by the PRESENCE of the `q` key, NOT by whether `q`
* holds a value: a leaf always carries `q` (even when its value is empty — '',
* null, or []); a group never does. A leaf is "empty" when its `q` is falsy or
* has length < 1, and "not empty" when `q.length > 0`. (Keying off q's
* truthiness instead misread an empty-value leaf as a group and recursed into
* it, crashing on `.length` of a null scalar prop — dd15 search-panel open.)
* A group is "not empty" when at least one descendant leaf is not empty.
* An empty operator array (`[].length < 1`) contributes nothing and is skipped.
*
* Called in two places:
*   - render_open_list_with_direct_relations.js before opening records in a new
*     window, to warn the user when no filter is active (which would open every record).
*   - search.js re-exports the symbol so other section modules can import it
*     from a single entry point.
*
* @param {Object} filter_obj - Root or nested filter group object. Must have at
*   least one operator key ($and or $or) at the top level. Passing an empty
*   object `{}` causes check_deep_filter to iterate zero keys and return an
*   empty array, which is treated as "empty" (returns true).
* @returns {boolean} true when every leaf `q` is empty (no active filter);
*   false when at least one leaf `q` contains a value.
*/
export const is_filter_empty = function(filter_obj) {

	// Recursive function to get every filter state
	 const check_deep_filter = (filter_obj) => {
		// store if q filters are empty (true) or not (false)
		const ar_empty = []
		// get the operator key ($and, $or)
		const ar_operators = Object.keys(filter_obj)
		const operators_length = ar_operators.length
		for (let i = operators_length - 1; i >= 0; i--) {
			// get current filter with the operator
			const current_operator 	= ar_operators[i]
			const filter			= filter_obj[current_operator]

			// check if the filter is empty
			// filter is the array under the operator key; skip when it has no elements
			const is_empty_current_filter = (filter.length<1) ? true : false
			if(is_empty_current_filter === false){

				// check if the current filter has q
				// A leaf row ALWAYS carries a `q` key (even when the value is empty:
				// '', null or []); only a nested group ($and/$or) lacks one. Detect
				// the leaf by the key's PRESENCE, not by q's truthiness — an empty
				// q is an EMPTY leaf, not a group. Keying off truthiness misread an
				// empty-value leaf as a group and recursed INTO it, then read .length
				// off the leaf's own scalar props (lang:null) and crashed.
				// (!) is_empty_q === null signals a nested group — trigger recursion rather
				// than treating the group itself as a leaf with an empty value.
				const has_q = filter && typeof filter === 'object' && 'q' in filter
				const is_empty_q = has_q
					? (!filter.q || filter.q.length<1)
					: null

				// if the filter has an operator, recursion to get next level
				if(is_empty_q === null){
					const deep_state = check_deep_filter(filter)

					// store the result of the recursion
					ar_empty.push(...deep_state)

				}else{
					// store the state of the q
					ar_empty.push(is_empty_q)
				}
			}
		}
		// return the states
		return ar_empty
	}

	// check if the filter has any q with data
	const result_check = check_deep_filter(filter_obj)
	// check if any q is not empty (false)
	// find returns the matched value (false) or undefined when none matched
	const find_if_any_has_filter = result_check.find(el => el === false)
	// if any q has a value to search return false in any other case return true
	const empty = find_if_any_has_filter===false ? false : true

	return empty
}//end is_filter_empty
