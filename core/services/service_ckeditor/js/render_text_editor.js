// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOLBAR
* Called from services to render generic toolbar
* @para object options
* @return HTMLElement fragment
*/
	// export const render_toolbar = function() {

	// 	const toolbar_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name		: 'toolbar'
	// 	})

	// 	return toolbar_container
	// }//end render_toolbar



/**
* RENDER_BUTTON
* @param object button_config
* 	Defined in render_edit function 'get_custom_buttons'
* @return HTMLElement button_node
*/
export const render_button = function(button_config) {

	// button_config
		const name				= button_config.name
		const image				= button_config.options.image
		const text				= button_config.options.text || ''
		const class_name		= button_config.options.class_name
			? ' ' + button_config.options.class_name
			: ''
		const tooltip			= button_config.options.tooltip
		const onclick			= button_config.options.onclick
		const manager_editor	= button_config.manager_editor

	// button_node
		const name_to_class = name !== '|'
			? ' ' + name
			: ''

		const button_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'toolbar_button' + name_to_class + class_name,
			inner_html		: text
		})

	// icon svg
	 	if(text==='') {
	 		// button_icon
		 	ui.create_dom_element({
				element_type	: 'img',
				src				: image,
				parent			: button_node
			})
	 	}

	// events
		if(manager_editor!==true && typeof onclick==='function'){
			button_node.addEventListener("click", onclick)
		}


	return button_node
}//end render_button



/**
* RENDER_FIND_AND_REPLACE
* Crates an modal with all find and replace options
* @param object editor
* 	Instance of editor
* @return HTMLElement modal
*/
export const render_find_and_replace = function(editor) {

	const self = {}

	const findAndReplaceEditing	= editor.plugins.get( 'FindAndReplaceEditing' );
	const state					= findAndReplaceEditing.state;
	const find_options			= {
		match_case	: false,
		whole_words	: false
	}

	self.results = 0

	// title (modal)
		const title_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'title_container'
		})
		const title_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'title_label',
			inner_html		: get_label.find_and_replace || 'Find and replace',
			parent			: title_container
		})

	// body (modal)
		const body_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body content find_and_replace'
		})

		// search
		const input_search = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_search',
			placeholder		: get_label.search || 'Search',
			parent			: body_container
		})
		input_search.addEventListener('keyup',function(){
			state.clear( editor.model );
			findAndReplaceEditing.stop();
		})

		const button_search = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_search',
			inner_html		: get_label.search || 'Search',
			parent			: body_container
		})
		button_search.addEventListener('click',() => {
			if(!input_search.value){
				return
			}
			const { findCallback, results } = editor.execute( 'find', input_search.value,
				{
					matchCase	: find_options.match_case,
					wholeWords	: find_options.whole_words
				}
			);
			self.results  = results
			result_label.innerHTML = self.results.length
		})

		const button_previous = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_previous',
			inner_html		: get_label.previous || 'Previous',
			parent			: body_container
		})
		button_previous.addEventListener('click',() => {
			editor.execute( 'findPrevious' );
		})

		const button_next = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_next',
			inner_html		: get_label.next || 'Next',
			parent			: body_container
		})
		button_next.addEventListener('click',() => {
			editor.execute( 'findNext' );
		})

		const result_label = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'result_label',
			inner_html		: self.result,
			parent			: body_container
		})

	// replace
		const replace_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'replace_container',
			parent			: body_container
		})
		const input_replace = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_replace',
			placeholder		: get_label.replace || 'Replace',
			parent			: replace_container
		})
		const button_replace = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_replace',
			inner_html		: get_label.replace || 'Replace',
			parent			: replace_container
		})
		button_replace.addEventListener('click',() => {

			const high_lighted_result = state.highlightedResult;
			if ( high_lighted_result ) {
				editor.execute( 'replace', input_replace.value, high_lighted_result );
			}
		})
		const button_replace_all = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_replace_all',
			inner_html		: get_label.replace_all || 'Replace All',
			parent			: replace_container
		})
		button_replace_all.addEventListener('click',() => {
			editor.execute( 'replaceAll', input_replace.value, input_search.value );
		})

	// options_container
		const options_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'options_container',
			parent			: replace_container
		})

		// match_case
			const label_match_case = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label_match_case',
				inner_html		: get_label.match_case  || 'Match case',
				parent			: options_container
			})
			const match_case = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'check',
				parent			: options_container
			})
			const button_match_case = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'check_match_case',
				name			: 'match_case',
				parent			: match_case
			})
			const selector_match_case = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'check',
				parent			: match_case
			})
			selector_match_case.addEventListener('click',function(){
				button_match_case.checked = button_match_case.checked
					? false
					: true

				find_options.match_case = button_match_case.checked
					? true
					: false
			})

		// whole_words
			const label_whole_words = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label_whole_words',
				inner_html		: get_label.whole_words  || 'Whole words',
				parent			: options_container
			})
			const whole_words = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'check',
				parent			: options_container
			})
			const button_whole_words = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'check_whole_words',
				name			: 'whole_words',
				parent			: whole_words
			})
			const selector_whole_words = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'check',
				parent			: whole_words
			})
			selector_whole_words.addEventListener('click',function(){

				button_whole_words.checked = button_whole_words.checked
					? false
					: true

				find_options.whole_words = button_whole_words.checked
					? true
					: false
			})

	// modal
		const modal = ui.attach_to_modal({
			header			: title_container,
			body			: body_container,
			size			: 'small',
			remove_overlay	: true
		})
		modal.on_close = ()=>{
			state.clear( editor.model );
			findAndReplaceEditing.stop();
		}


	return modal
}//end render_find_and_replace



// @license-end

