// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* IS_FILTER_EMPTY
* Check if filter is empty
* @param object filter_obj
* @return bool is_empty
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
			const is_empty_current_filter = (filter.length<1) ? true : false
			if(is_empty_current_filter === false){

				// check if the current filter has q
				// of the filter has q, check if is empty
				// else the filter has an operator ($and, $or) and set null q
				const is_empty_q = filter.q
					? filter.q.length<1
					: null

				// if the filter has an operator, recursion to get next level
				if(is_empty_q === null){
					const result = check_deep_filter(filter)

					// store the result of the recursion
					ar_empty.push(...result)

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
	const find_if_any_has_filter = result_check.find(el => el === false)
	// if any q has a value to search return false in any other case return true
	const empty = find_if_any_has_filter===false ? false : true

	return empty
}//end is_filter_empty
