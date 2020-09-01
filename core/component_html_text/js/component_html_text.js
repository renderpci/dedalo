

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_html_text} from '../../component_html_text/js/render_component_html_text.js'



export const component_html_text = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	return true
};//end component_html_text



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_html_text.prototype.init 	 			= component_common.prototype.init
	component_html_text.prototype.build 	 		= component_common.prototype.build
	component_html_text.prototype.render 			= common.prototype.render
	component_html_text.prototype.refresh 			= common.prototype.refresh
	component_html_text.prototype.destroy 			= common.prototype.destroy

	// change data
	component_html_text.prototype.save 	 			= component_common.prototype.save
	//component_html_text.prototype.load_data 		= component_common.prototype.load_data
	//component_html_text.prototype.get_value 		= component_common.prototype.get_value
	//component_html_text.prototype.set_value 		= component_common.prototype.set_value
	component_html_text.prototype.update_data_value = component_common.prototype.update_data_value
	component_html_text.prototype.update_datum		= component_common.prototype.update_datum
	component_html_text.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_html_text.prototype.mini 				= render_component_html_text.prototype.mini
	component_html_text.prototype.list 				= render_component_html_text.prototype.list
	component_html_text.prototype.edit 				= render_component_html_text.prototype.edit
	component_html_text.prototype.edit_in_list		= render_component_html_text.prototype.edit
	component_html_text.prototype.change_mode 		= component_common.prototype.change_mode



/**
* SAVE_VALUE
* Saves individual value based on element key
* @param int key
*	defined in container dataset key
* @param string value
*	value from active text editor
*/
component_html_text.prototype.save_value = async function(key, value) {

	const self = this

	const changed_data = Object.freeze({
		action	: 'update',
		key		: key,
		value	: (value.length>0) ? value : null,
	})
	self.change_value({
		changed_data : changed_data,
		refresh 	 : false
	})
	.then((save_response)=>{
		// event to update the dom elements of the instance
		event_manager.publish('update_value_'+self.id, changed_data)
	})

	return true
};//end save_value



// /**
// * SELECT_COMPONENT
// * Overwrite common method
// * @param object obj_wrap
// */
// component_html_text.prototype.select_component = function(obj_wrap) {

// 	obj_wrap.classList.add("selected_wrap");
// 	var text_area = $(obj_wrap).find('textarea').first()
// 	if (text_area.length==1) {
// 		tinyMCE.get( text_area[0].id ).focus()
// 	}
// };//end select_component



// /**
// * SAVE_COMMAND
// */
// component_html_text.prototype.save_command = function(ed, evt, obj_html_text, self) {
// 	// DATO : Overwrite
// 	// Reemplazamos el dato a guardar (que sería el contenido del textarea real) por el contenido del editor (tinyMCE)
// 	// eliminando los saltos de línea (IMPORTANTE!)
// 	var text = ed.getContent();
// 		text = text.replace(/(\r\n|\n|\r)/gm," ");
// 		//component_html_text.save_arguments.dato = text;


// 	// REAL TEXT AREA OBJ
// 	if(obj_html_text) {

// ed.setContent(text)
// 		//var text_area_id = obj_html_text.id
// 			console.log("obj_html_text:",obj_html_text)
// 			console.log("self:",self)

// 			const parentNode = obj_html_text.parentNode

// 		//// FORCE UPDATE REAL TEXT AREA CONTENT
// 		//tinyMCE.triggerSave();      //alert(ed.getContent())
// //
// //		//// SAVE REAL TEXTAREA CONTENTS
// //		//component_html_text.Save(obj_html_text);        if(SHOW_DEBUG===true) console.log("-> trigger Save from tinyMCE " + text_area_id);
// //		////var text = ed.getContent();
// //		////$(obj_html_text).val( escape('xxx '+text) );  console.log($(obj_html_text))
// //		////component_html_text.Save(obj_html_text);
// //		////alert( $(obj_html_text).val() )
// //
// //		//// Notify time machine tool content is changed
// //		//top.component_common.changed_original_content = 1;   //if(SHOW_DEBUG===true) console.log(tool_time_machine.changed_original_content)
// //
// 		////if(SHOW_DEBUG===true) console.log( obj_html_text )
// 		const changed_data = Object.freeze({
// 				action	: 'update',
// 				key		: JSON.parse(obj_html_text.dataset.key),
// 				value	: (obj_html_text.value.length>0) ? obj_html_text.value : null,
// 			})
// 			self.change_value({
// 				changed_data : changed_data,
// 				refresh 	 : false
// 			})
// 			.then((save_response)=>{
// 				// event to update the dom elements of the instance
// 				event_manager.publish('update_value_'+obj_html_text.id, changed_data)
// 				ed.setDirty(false)
// 			})

// 	}else{
// 		alert("text editor obj_html_text not found "+ text_area_id);
// 	}

// };//end save_command

// component_html_text.prototype.click_event = function(e, wrapper) {

// 	//const wrapper = e.target
// 	const all_buttons_remove =wrapper.parentNode.querySelectorAll('.remove')
// 		for (let i = all_buttons_remove.length - 1; i >= 0; i--) {
// 			all_buttons_remove[i].classList.add("display_none")
// 		}

// 	// insert
// 	if (e.target.matches('.button.add')) {

// 		const changed_data = Object.freeze({
// 			action	: 'insert',
// 			key		: self.data.value.length,
// 			value	: null
// 		})
// 		self.change_value({
// 			changed_data : changed_data,
// 			refresh 	 : false
// 		})
// 		.then((save_response)=>{
// 			// event to update the dom elements of the instance
// 			event_manager.publish('add_element_'+self.id, changed_data)
// 		})

// 		return true
// 	}

// 	// remove
// 	if (e.target.matches('.button.remove')) {

// 		// force possible input change before remove
// 		document.activeElement.blur()

// 		const changed_data = Object.freeze({
// 			action	: 'remove',
// 			key		: e.target.dataset.key,
// 			value	: null,
// 			refresh : true
// 		})
// 		self.change_value({
// 			changed_data : changed_data,
// 			label 		 : e.target.previousElementSibling.value,
// 			refresh 	 : true
// 		})
// 		.then(()=>{
// 		})

// 		return true
// 	}

// 	if (e.target.matches('.button.close')) {
// 		//change mode
// 		self.change_mode('list', true)

// 		return true
// 	}

// }
