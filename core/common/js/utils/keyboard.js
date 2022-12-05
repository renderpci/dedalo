/* global */
/*eslint no-undef: "error"*/



/**
* KEYBOARD_CODES
* 	Object with all keys definition
*/
export const keyboard_codes = {
	Backspace		: 'Backspace',
	Tab				: 'Tab',
	Enter			: 'Enter',
	ShiftLeft		: 'Shift',
	ShiftRight		: 'Shift',
	ControlLeft		: 'Control',
	ControlRight	: 'Control',
	AltLeft			: 'Alt',
	AltRight		: 'Alt',
	Pause			: 'Pause',
	CapsLock		: 'CapsLock',
	Escape			: 'Escape',
	Space			: '',
	PageUp			: 'PageUp',
	PageDown		: 'PageDown',
	End				: 'End',
	Home			: 'Home',
	ArrowLeft		: 'ArrowLeft',
	ArrowUp			: 'ArrowUp',
	ArrowRight		: 'ArrowRight',
	ArrowDown		: 'ArrowDown',
	PrintScreen		: 'PrintScreen',
	Insert			: 'Insert',
	Delete			: 'Delete',
	Digit0			: '0',
	Digit1			: '1',
	Digit2			: '2',
	Digit3			: '3',
	Digit4			: '4',
	Digit5			: '5',
	Digit6			: '6',
	Digit7			: '7',
	Digit8			: '8',
	Digit9			: '9',
	KeyA			: 'a',
	KeyB			: 'b',
	KeyC			: 'c',
	KeyD			: 'd',
	KeyE			: 'e',
	KeyF			: 'f',
	KeyG			: 'g',
	KeyH			: 'h',
	KeyI			: 'i',
	KeyJ			: 'j',
	KeyK			: 'k',
	KeyL			: 'l',
	KeyM			: 'm',
	KeyN			: 'n',
	KeyO			: 'o',
	KeyP			: 'p',
	KeyQ			: 'q',
	KeyR			: 'r',
	KeyS			: 's',
	KeyT			: 't',
	KeyU			: 'u',
	KeyV			: 'v',
	KeyW			: 'w',
	KeyX			: 'x',
	KeyY			: 'y',
	KeyZ			: 'z',
	MetaLeft		: 'Meta',
	MetaRight		: 'Meta',
	ContextMenu		: 'ContextMenu',
	Numpad0			: '0',
	Numpad1			: '1',
	Numpad2			: '2',
	Numpad3			: '3',
	Numpad4			: '4',
	Numpad5			: '5',
	Numpad6			: '6',
	Numpad7			: '7',
	Numpad8			: '8',
	Numpad9			: '9',
	NumpadMultiply	: '*',
	NumpadAdd		: '+',
	NumpadSubtract	: '-',
	NumpadDecimal	: '.',
	NumpadDivide	: '/',
	F1				: 'F1',
	F2				: 'F2',
	F3				: 'F3',
	F4				: 'F4',
	F5				: 'F5',
	F6				: 'F6',
	F7				: 'F7',
	F8				: 'F8',
	F9				: 'F9',
	F10				: 'F10',
	F11				: 'F11',
	F12				: 'F12',
	NumLock			: 'NumLock',
	ScrollLock		: 'ScrollLock',
	Semicolon		: ';',
	Equal			: '=',
	Comma			: ',',
	Minus			: '-',
	Period			: '.',
	Slash			: '/',
	Backquote		: '`',
	BracketLeft		: '[',
	Backslash		: '\\',
	BracketRight	: ']',
	Quote			: '\''
}//end keyboard_codes



/**
* ACTIVATE_WINDOW_KEYDOWN_DES
* @return bool
*/
export const activate_window_keydown_DES = function() {

	window.addEventListener("keydown", function (e) {
		console.log("e.ctrlKey, e.keyCode: ", e.ctrlKey, e.keyCode);
		return

		switch(true) {

			// PAGINATOR RIGHT ARROW <
			case (e.ctrlKey===true && e.keyCode===37):
				var element = $('.paginator_prev_icon');
				if ( $(element).length ) {
					$(element).first().trigger( "click" );
				}
				break;

			// PAGINATOR RIGHT ARROW >
			case (e.ctrlKey===true && e.keyCode===39):
				var element = $('.paginator_next_icon');
				if ( $(element).length ) {
					$(element).first().trigger( "click" );
				}
				break;

			// DEBUG_INFO : CONTROL + D (ctrlKey+68) TOGGLE DEBUG_INFO
			case (e.ctrlKey===true && e.keyCode===68):
				html_page.debug_info_toggle()
				break;

			// ONTOLOTY OPEN : CONTROL + O (ctrlKey+79) OPEN DOCU ONTOLOTY
			case (e.ctrlKey===true && e.keyCode===79):
				// fake button to open the tool_docu
				const selected_component = component_common.selected_component || null
				if (selected_component && selected_component.dataset.tipo && selected_component.dataset.section_tipo) {
					tool_common.open_tool_docu({
						dataset : {
							tipo			: selected_component.dataset.tipo,
							section_tipo	: selected_component.dataset.section_tipo,
							context_name	: 'online'
						}
					})
				}
				break;

			// INSPECTOR : CONTROL + I (ctrlKey+73) TOGGLE INSPECTOR
			case (e.ctrlKey===true && e.keyCode===73):
				inspector.toggle_sidebar()
				break;

			// LIST FILTER : CONTROL + F (ctrlKey+70) TOGGLE FILTER BODY
			case (e.ctrlKey===true && e.keyCode===70):
				search.toggle_filter_search_tap()
				break;

			// STATS : CONTROL + S (ctrlKey+83) TOGGLE STATS DIV
			case (e.ctrlKey===true && e.keyCode===83):
				$('.css_button_stats').trigger( "click" );
				break;

			// SEARCH SUBMIT (SEARCH2) : CONTROL + RETURN (ctrlKey+13)
			//case (e.ctrlKey==1 && e.keyCode==13):
			case (e.keyCode===13):
				if (page_globals.mode.indexOf('list')!==-1 || page_globals.mode.indexOf('tool_')!==-1) {

					if (page_globals.tipo==='dd100' || page_globals.mode==='tool_cataloging' || page_globals.mode==='tool_sort') {
						// if no activeElement children, we are in input order or editing a term
						if (!document.activeElement.firstChild) {
							return false;
						}
					}
					e.preventDefault()
					e.stopPropagation();
					if (e.target.id==='go_to_page') {
						return false
					}
					//console.log("e:",e.target.id);
					const button_submit = document.getElementById("button_submit")
					if (button_submit) {
						//button_submit.click()
						search2.search_from_enter_key(button_submit)
					}else{
						e.target.blur()
						if(SHOW_DEBUG===true) {
							console.warn("Submit button 'button_submit' not found in dom!");
						}
					}
				}
				break;

			// ESC
			case (e.keyCode===27):
				// Toggle filter tab in list
				/*
				if (page_globals.mode.indexOf('list')!==-1 || page_globals.mode.indexOf('tool_')!==-1) {
					search.toggle_filter_search_tap()
				}*/
				// Deselect components
				if (page_globals.mode && page_globals.mode.indexOf('edit')!==-1) {
					component_common.reset_all_selected_wraps(false)
				}
				// Deselect menu
				menu.close_all_drop_menu();

				// Reset thesaurus hilite terms
				if (page_globals && page_globals.section_tipo==='dd100' || page_globals.section_tipo==='dd101') {
					if (ts_object) ts_object.reset_hilites()
				}
				break;
		}

	});//end window.addEventListener("keydown", function (e)
}//end activate_window_keydown
