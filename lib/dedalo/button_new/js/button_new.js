/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, common, document, console, $, html_page, DEDALO_LIB_BASE_URL */
/*eslint no-undef: "error"*/
"use strict";
/**
* BUTTON_NEW CLASS
*
*
*/
var button_new = new function() {	


	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.trigger_url	= DEDALO_LIB_BASE_URL + '/button_new/trigger.button_new.php';



	// NEW
	this.New = function(button_obj) {

		const self = this

		// section_tipo fix
			self.section_tipo = common.safe_tipo( page_globals.section_tipo )
			if (!self.section_tipo) {
				console.error("self.section_tipo:",self.section_tipo);
				alert("Error. section_tipo is not valid");
				return false;
			}

		// modo fix
			self.modo = page_globals.modo
			if (!self.modo) {
				console.error("self.modo:",self.modo);
				alert("Error. modo is not valid");
				return false;
			}

		// list mode. Always creates a new blank record
			if (self.modo==='list') {
				if (confirm(get_label.seguro)) {
					self.create_new_blank_record()
				}
				return true
			}

		// section_id fix
			self.section_id = parseInt( page_globals.section_id )
			if (!self.section_id) {
				console.error("self.section_id:",self.section_id);
				alert("Error. section_id is not valid");
				return false;
			}

		// dialog (blank or duplicate record)
			const new_dialog_node = self.build_new_dialog()
			$(new_dialog_node)
				.modal({
					show		: true,
					keyboard	: true
				})
				.on('hidden.bs.modal', function (e) {
					new_dialog_node.remove()
				});

		return true
	}//end this.New



	/**
	* BUILD_NEW_DIALOG
	* @return DOM obj modal_dialog
	*/
	this.build_new_dialog = function(options) {

		const self = this

		// header
			const header = common.create_dom_element({
				element_type	: 'div'
			})
			common.create_dom_element({
				element_type	: 'h4',
				class_name		: 'modal-title',
				text_node		: (get_label.nuevo || 'New') + ' ' + (get_label.registro || 'record'),
				parent			: header
			})

		// body
			const body = common.create_dom_element({
				element_type	: 'div'
			})
			const body_text_node = common.create_dom_element({
				element_type	: 'h4',
				class_name		: '',
				parent			: body,
				text_node		: (get_label.seleccione_una_opcion || 'Please, select an option')
			})
			if(SHOW_DEVELOPER===true) {
				common.create_dom_element({
					element_type	: 'div',
					class_name		: '',
					parent			: body,
					text_node		: `Current: ${page_globals.section_name} [${self.section_tipo}-${self.section_id}]`
				})
			}

		// footer (buttons)
			const footer = common.create_dom_element({
				element_type	: 'div'
			})

			const button_new_duplicate = common.create_dom_element({
				element_type	: 'button',
				class_name		: 'btn btn-warning',
				text_node		: get_label.button_new_duplicate || 'Duplicate current record',
				parent			: footer
			})
			button_new_duplicate.addEventListener("click", function (e) {
				this.blur()
				self.duplicate_current_record(this)
			})

			const button_new_blank = common.create_dom_element({
				element_type	: 'button',
				class_name		: 'btn btn-success',
				text_node		: get_label.button_new_blank || 'Create a new blank record',
				parent			: footer
			})
			button_new_blank.addEventListener("click", function (e) {
				this.blur()
				self.create_new_blank_record(this)
			})


		// modal dialog
			const modal_dialog = common.build_modal_dialog({
				id		: "delete_dialog",
				header	: header,
				body	: body,
				footer	: footer
			})


		return modal_dialog
	}//end build_new_dialog



	/**
	* CREATE_NEW_BLANK_RECORD
	* @return promise
	*/
	this.create_new_blank_record = function(button) {

		const self = this

		// short vars
			const section_tipo	= self.section_tipo
			const trigger_url	= self.trigger_url

		// trigger_vars
			const trigger_vars	= {
				mode			: 'new_record',
				section_tipo	: section_tipo,
				top_tipo		: page_globals.top_tipo
			}
			if(SHOW_DEBUG===true) {
				// console.log("[button_new.New] trigger_vars: " , trigger_vars); return
			}

		// section_wrap_div loading status
			const section_wrap_div = document.getElementsByClassName('css_section_wrap')[0]
			html_page.loading_content( section_wrap_div, 1 );
			button.classList.add("disable_element")
			button.blur()

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {

				if (response && response.result) {
					if( Number.isInteger(response.result)===true && response.result > 0 ){
						// Go to edit record page of created section
						window.location.href = '?t=' + section_tipo + '&id=' + response.result
					}else{
						alert("[button_new.New] Error: section_id: " + response.result + " received is not valid")
						html_page.loading_content( section_wrap_div, 0 );
						button.classList.remove("disable_element")
					}
				}else{
					// Alert error
					alert("[button_new.New] Error on create new record")
					console.error("[button_new.New] Error on new: ",response)
					if(SHOW_DEBUG===true) {
						console.trace()
					}
					html_page.loading_content( section_wrap_div, 0 );
					button.classList.remove("disable_element")
				}

		},function(error) {
			console.error("[button_new.New] error:",error);
			// Notify to log messages in top of page
			const msg = "<span class='error'>Error on create new record<br>Nothing is created!</span>";
			inspector.show_log_msg(msg);
			html_page.loading_content( section_wrap_div, 0 );
			button.classList.remove("disable_element")
		})

		return js_promise
	};//end create_new_blank_record



	/**
	* DUPLICATE_CURRENT_RECORD
	* @return promise
	*/
	this.duplicate_current_record = function(button) {

		const self = this

		// short vars
			const section_tipo	= self.section_tipo
			const section_id	= self.section_id
			const trigger_url	= self.trigger_url

		if (!section_id || self.modo!=='edit') {
			alert(`Error. Invalid params \n mode: ${self.modo} \n section_id: ${self.section_id}`);
			return false
		}

		// trigger_vars
			const trigger_vars	= {
				mode			: 'duplicate_current_record',
				section_tipo	: section_tipo,
				section_id		: section_id,
				top_tipo		: page_globals.top_tipo
			}

		// section_wrap_div loading status
			const section_wrap_div = document.getElementsByClassName('css_section_wrap')[0]
			html_page.loading_content( section_wrap_div, 1 );
			button.classList.add("disable_element")

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {

				if (response && response.result) {
					if( Number.isInteger(response.result)===true && response.result > 0 ){
						// Go to edit record page of created section
						window.location.href = '?t=' + section_tipo + '&id=' + response.result
					}else{
						alert("[button_new.New] Error: section_id: " + response.result + " received is not valid")
						html_page.loading_content( section_wrap_div, 0 );
						button.classList.remove("disable_element")
					}
				}else{
					// Alert error
					alert("[button_new.duplicate_current_record] Error on create new record")
					console.error("[button_new.duplicate_current_record] Error on new: ",response)
					if(SHOW_DEBUG===true) {
						console.trace()
					}
					html_page.loading_content( section_wrap_div, 0 );
					button.classList.remove("disable_element")
				}

		},function(error) {
			console.error("[button_new.duplicate_current_record] error:",error);
			// Notify to log messages in top of page
			const msg = "<span class='error'>Error on create new record<br>Nothing is created!</span>";
			inspector.show_log_msg(msg);
			html_page.loading_content( section_wrap_div, 0 );
			button.classList.remove("disable_element")
		})

		return js_promise
	};//end duplicate_current_record



}//end button_new