"use strict";
/**
* TOOL_USER_ADMIN CLASS
*
*
*/
var tool_user_admin = new function() {


	/**
	* BUILD_TOOLS
	* @return 
	*/
	this.build_tools = function(current_script, tools_data) {
			
		const container  = current_script.parentNode
	
		const tools_data_lenght = tools_data.length
		for (let i = 0; i < tools_data.length; i++) {
			const tool_data 	= tools_data[i]
			const tool_button 	= inspector.build_tool_button(tool_data)

			// append
				container.appendChild(tool_button)
		}

	};//end build_tools

}