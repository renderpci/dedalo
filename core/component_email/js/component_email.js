/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_email} from '../../component_email/js/render_edit_component_email.js'
	import {render_list_component_email} from '../../component_email/js/render_list_component_email.js'
	import {render_mini_component_email} from '../../component_email/js/render_mini_component_email.js'
	import {render_search_component_email} from '../../component_email/js/render_search_component_email.js'


export const component_email = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	return true
}//end component_email



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_email.prototype.init				= component_common.prototype.init
	component_email.prototype.build				= component_common.prototype.build
	component_email.prototype.render			= common.prototype.render
	component_email.prototype.refresh			= common.prototype.refresh
	component_email.prototype.destroy			= common.prototype.destroy

	// change data
	component_email.prototype.save				= component_common.prototype.save
	component_email.prototype.update_data_value	= component_common.prototype.update_data_value
	component_email.prototype.update_datum		= component_common.prototype.update_datum
	component_email.prototype.change_value		= component_common.prototype.change_value
	component_email.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_email.prototype.mini				= render_mini_component_email.prototype.mini
	component_email.prototype.list				= render_list_component_email.prototype.list
	component_email.prototype.edit				= render_edit_component_email.prototype.edit
	component_email.prototype.edit_in_list		= render_edit_component_email.prototype.edit
	component_email.prototype.search			= render_search_component_email.prototype.search
	component_email.prototype.change_mode		= component_common.prototype.change_mode



/**
* VERIFY_EMAIL
* @param string email_value
* @return bool status
*/
component_email.prototype.verify_email = function(email_value) {

	// When we want delete email data, allow empty value
	if (email_value.length<1) {
		return true;
	}

	let valid_email		= false;
	const ar_email		= []
	const emailRegEx	= /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;

	if (!Array.isArray(email_value)){
		ar_email.push(email_value)
	}else{
		ar_email = email_value
	}

	ar_email.forEach(function(email) {
	 	if (email.search(emailRegEx) == -1) {
			valid_email = false;
		}else{
			valid_email = true;
		}
  	})

  	// debug
  		if(SHOW_DEBUG===true) {
  			if (valid_email!==true) {
  				console.warn("Invalid email rejected:",email_value);
  			}
  		}


	return valid_email;
}//end verify_email



/**
* SEND E-MAIL
*/
component_email.prototype.send_email = function(value) {

	const email = value

	if(email.length<=0){
		return false
	}
	//window.open('mailto:'+email, '_blank');
	window.location.href = 'mailto:' + email

	return true
}//end send_email



/**
* GET_AR_EMAILS
*/
component_email.prototype.get_ar_emails = async function() {

	const self = this

	// builder should be section or portal, the self.caller normally will be a section_record, and his caller should be the builder
	const builder = self.caller.caller
	// check if the builder is a section or portal. Sometimes it could be a tool, or widget,...
	if(builder.model !== 'section' && builder.model !== 'component_portal'){
		return false
	}
	// get the rqo of the builder, it will use to redo the search but only for the email
	const rqo = structuredClone(builder.rqo)

	// set the show with email component_data, and reset the limit to get all records searched
		rqo.show = {}
		rqo.show.ddo_map =[{
			tipo: self.tipo,
			parent: 'self',
			section_tipo: self.section_tipo
		}]

		rqo.sqo.limit = 0

	// load data
		const api_response = await data_manager.request({body:rqo})

	// get the result of the datum
		const search_datum	= api_response.result
		const data = search_datum.data.filter(el => el.tipo === self.tipo)

	// check if the data is empty
		const len = data.length

		if(len <= 0){
			return false
		}
	// set some vars
		const separator = ';';
		const emails = []
		const is_windows = /(Win)/i.test(navigator.platform); //(Mac|iPhone|iPod|iPad)
		const max_characters = 19 ; //1900 max characters, in win are 2000

		for (let i = len - 1; i >= 0; i--) {
			const current_data = data[i].value
			if(current_data.length<=0) {
				continue
			}
			const current_emails = current_data.join(separator)
			emails.push(current_emails)
		}

		const full_emails = emails.join(separator)

		function get_ar_emails(emails) {
			const ar_emails = []

			if(emails.length > max_characters){
				const truncate_postion = emails.indexOf(separator, max_characters);
				const part_one = emails.slice(0, truncate_postion);
				const part_two = emails.slice(truncate_postion + 1);
				ar_emails.push(part_one)
				if(part_two.length > max_characters){
					const result = get_ar_emails(part_two)
					ar_emails.push(...result)
				}else{
					ar_emails.push(part_two)
				}
			}
			return ar_emails
		}

		const ar_emails = is_windows
			? get_ar_emails(full_emails)
			: [full_emails]

	return ar_emails
}//end get_ar_emails


