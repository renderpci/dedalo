// imports
	//import event_manager from '../../page/js/page.js'
	import {common} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	//import {ui} from '../../common/js/ui.js'
	//import * as instances from '../../common/js/instances.js'



export const tool_common = function(){

	return true
}//end tool_common



/**
* BUILD
*/
tool_common.prototype.build = async function(autoload = false) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'


	// load self style
		const url = DEDALO_LIB_BASE_URL + "/tools/" + self.model + "/css/" + self.model + ".css"
		await common.prototype.load_style(url)


	// load data if is not already received as option
		if (autoload===true) {

			// sqo_context
				// create the sqo_context
				const sqo_context = {show: []}
				// create the own show ddo element

				const source = { // source object
								typo			: "source",
								action			: 'get_data',
								model 			: 'component_json',
								tipo 			: 'dd1353',
								section_tipo	: self.tool_section_tipo,
								section_id		: self.tool_section_id,
								mode 			: 'edit',
								lang 			: 'lg-nolan'
							}
				sqo_context.show.push(source)

			// load data
				const current_data_manager 	= new data_manager()
				const api_response 			= await current_data_manager.section_load_data(sqo_context.show)
				const data 					= api_response.result.data

				self.config 		= data.find(item => item.section_id===self.tool_section_id && item.tipo==='dd1353').value
				self.label 			= self.config.label.find(item => item.lang === self.lang).value
				self.description 	= self.config.description.find(item => item.lang === self.lang).value


			// debug
				if(SHOW_DEBUG===true) {
					console.log("[tool_lang.build] api_response:",api_response);
				}
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'builded'


	return true
}//end build


