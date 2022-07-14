import {tool_indexation} from './tool_indexation.js'



/**
* DELETE_TAG
* Remove selected tag an all relations / indexes associated
* Delete / remove current tag in all component langs, all references (inverse) in all portals and index record (matrix descriptors)
* @param object button_obj
* @return promise
*/
tool_indexation.prototype.delete_tag = function(tag_id) {

	const self = this

	// Confirm action
		if( !confirm( `${self.get_tool_label('delete_tag') || 'Delete tag?'}\nID: ${tag_id}`) ) {
			return Promise.resolve(false)
		}
		if( !confirm(
			`${get_label.warning || 'Warning!'} !! ${self.get_tool_label('warning_delete_tag') || 'It will delete the selected tag in all languages and all the relationships and indexing associated with it'}`)
			) {
			return Promise.resolve(false)
		}

	// call to the API, fetch data and get response
	return new Promise(async function(resolve){

		// delete tag in all langs (component_text_area)
			const api_response_delete_tag = self.transcription_component.delete_tag(
				tag_id,
				'index'
			)
			.catch(error => {
				console.error('ERROR: delete_tag found errors')
				console.error(error.message)
			});
			// transcription_component response
			if (api_response_delete_tag.result===false) {
				// error case
				const msg = api_response_delete_tag.msg
					? api_response_delete_tag.msg.join('\n')
					: 'Unknown error'
				alert(
					(self.get_tool_label('error_delete_tag') || 'Error on delete tag') + '\n' + msg
				)
			}

		// delete_locator (component_portal)
			const api_response_delete_locator = self.indexing_component.delete_locator(
				// object locator
				{
					tag_id	: tag_id,
					type	: DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO // dd96
				},
				// array ar_properties
				['tag_id','type']
			)
			.catch(error => {
				console.error('ERROR: delete_locator found errors')
				console.error(error.message)
			});
			// indexing_component response
			if (api_response_delete_locator.result===false) {
				// error case
				const msg = api_response_delete_locator.msg
					? api_response_delete_locator.msg.join('\n')
					: 'Unknown error'
				alert(
					(self.get_tool_label('error_delete_locator') || 'Error on delete locator') + '\n' + msg
				)
			}else{
				// indexing_component. Remember force clean full data and datum before refresh
				self.indexing_component.data	= null
				self.indexing_component.datum	= null
				self.indexing_component.refresh()
			}

		// response
			const response = {
				'delete_tag'		: api_response_delete_tag,
				'delete_locator'	: api_response_delete_locator
			}

		resolve(response)
	})
}//end delete_tag