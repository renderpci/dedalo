


var component_info = new function() {


	this.update_info = function(button_obj) {

		var wrapper_id = button_obj.dataset.wrapper_id;

		return component_common.load_component_by_wrapper_id(wrapper_id);
	};


}//end component_info






