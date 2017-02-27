


var component_info = new function() {


	this.update_info = function(button_obj) {

		//var wrapper_id = button_obj.dataset.wrapper_id;

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_info:update_info: Sorry: wrap_div dom element not found")
			}
			var wrapper_id = wrap_div.id

		return component_common.load_component_by_wrapper_id(wrapper_id);
	};


}//end component_info






