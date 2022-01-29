/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/

/**
* RENDER_TIME_MACHINE
* Manages the component's logic and appearance in client side
*/
export const render_time_machine = function() {

	return true
};//end render_time_machine


/**
* TM (render mode)
* Chose the view render module to generate DOM nodes
* @param object options
* @return DOM node wrapper | null
*/
render_time_machine.prototype.tm = async function(options) {

	const self = this

	// view (is injected by the caller)
		const view	= self.view || null
		if (!view) {
			console.error("Error. self view is not defined:", self);
			return false
		}

	return self.view(self, options)
}//end tm
