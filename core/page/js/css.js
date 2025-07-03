// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
 * DYNAMIC CSS MANAGER
 */



/**
* ROOT_CSS
* Registry for storing CSS rules
*/
const root_css = new Map()



/**
* ELEMENTS_CSS
*   Proxy object where styles are set
*/
	// export const elements_css = new Proxy(root_css, {
	// 	set: function (target, key, value) {
	// 		// update style sheet value
	// 		update_style_sheet(key, value)
	// 		.then(function(result){
	// 			if (result===true) {
	// 				// update proxy var value
	// 				target[key] = value;
	// 			}
	// 		})
	// 		return true;
	// 	}
	// });



/**
* SET_ELEMENT_CSS
* Sets CSS styles for a specific element by updating the stylesheet and root CSS registry.
* Prevents overwriting existing styles unless explicitly requested via replace parameter.
* @param string key
* 	Unique identifier for the CSS rule/element (e.g., selector name, element ID)
* @param object value
* 	CSS properties object containing style declarations
*	e.g. { color: 'red', fontSize: '16px', margin: '10px' }
* @param bool replace
* 	 Whether to replace existing CSS rules for this key
*		- false: Skip if key already exists (default)
*		- true: Overwrite existing CSS rules
* @return result bool
* 	Success status
*		- true: CSS was successfully set/updated
*		- false: Operation failed (key exists and replace=false, or empty value)
* @example
* // Basic usage - set new CSS rule
* set_element_css('my-button', {
*	backgroundColor: '#007bff',
*	color: 'white',
*	padding: '10px 20px'
* }); // returns true
*/
export const set_element_css = (key, value, replace=false) => {

	// Check if key already exists and replace is disabled
	if (replace===false && root_css.has(key)) {
		// console.log("Ignored existing key (set_element_css):", key, value);
		return false
	}

	// Validate value parameter - must be non-empty object
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
		// empty object or invalid type
		return false;
	}

	// set root_css property
	const result = update_style_sheet(key, value)


	return result
}//end set_element_css



/**
* UPDATE_STYLE_SHEET
* @param string key
* 	like 'rsc170_rsc76'
* @param value object
* 	like
	{
		"rsc732": {
		  ".wrapper_component": {
			  "grid-row": "1 / 5",
			  "grid-column": "9 / 11",
			  "@media screen and (min-width: 900px)": {
				"width": "50%"
			}
		  }
		}
	}
* @return bool
*/
const update_style_sheet = function(key, value) {

	// style_sheet
		const css_style_sheet = get_elements_style_sheet()

	// add all
		for(const selector in value) {

			if (selector==='add_class') {
				continue;
			}

			// style values like {"width": "12%", height : "150px"}
				const json_css_values = value[selector] || null
				if (!json_css_values) {
					console.log("Ignored invalid style:", key, value[selector]);
					continue;
				}

			if (typeof json_css_values==='function') {

				// make_column_responsive and all custom case
				// see ui.make_column_responsive

				// get custom selector and values from callback function
					const data			= json_css_values()
					const full_selector	= data.selector
					const json_values	= data.value

				// insert rule
				insert_rule(full_selector, json_values, css_style_sheet, false)

			}else{

				// components case

				// direct children operator
					const operator = selector.indexOf('>')===0
						? ''
						: '>'

				const full_selector = selector.indexOf('.wrapper')===0
					? `.${key}${selector}` // like .oh1_rsc75.wrap_component
					: `.${key} ${operator} ${selector}`	// like .oh1_rsc75 > .content_data

				// const full_selector = `.${key}${selector}` // like .oh1_rsc75.wrap_component

				// insert rule
				insert_rule(full_selector, json_css_values, css_style_sheet, false)
			}
		}

	// store as already set
		root_css.set(key, value)


	return true
}//end update_style_sheet



/**
* INSERT_RULE
* Execute a standard 'insertRule' order with given values
*
* @param string selector
* 	like: '.rsc170_rsc20.wrapper_component'
* @param object json_css_values
* 	like:
* @param HTML stylesheet css_style_sheet
* 	Virtual css file stylesheet
* @param boolean skip_insert
* 	Used to control deep recursive resolutions
*
* @return array rules
*/
const insert_rule = function(selector, json_css_values, css_style_sheet, skip_insert) {

	const rules = []

	for(const key in json_css_values) {

		const value = json_css_values[key];

		if (typeof value==='string') {
			// Handle content property with quotes, others without
			const propText = key === 'content'
				? `${key}:'${value}'`
				: `${key}:${value}`

			rules.push(propText)
		}
		else if(
			typeof value==='object'
			&& !Array.isArray(value)
			&& value!==null)
			{

			const deep_rules = insert_rule(
				selector,
				value,
				css_style_sheet,
				true // skip_insert
			)

			const joined = deep_rules.join('; ');

			// Create nested rule (assuming key is a media query or pseudo-selector)
			const rule = `${key} {
				${selector} {
					${joined};
				}
			}`;
			// const rule		= `
			// ${key} {
			// 	${selector} {
			// 		${joined};
			// 	}
			// }`

			css_style_sheet.insertRule(rule, css_style_sheet.cssRules.length);
		}
	}

	// resolving deep_rules cases
		if (skip_insert) {
			return rules
		}

	 // Combine all rules for the main selector
		if (rules.length > 0) {
			const rule = `${selector} { ${rules.join('; ')} }`;
			css_style_sheet.insertRule(rule, css_style_sheet.cssRules.length);
		}


	return rules
}//end insert_rule



/**
* GET_ELEMENTS_CSS_OBJECT
* @return object root_css
*/
export const get_elements_css_object = function() {

	return root_css
}//end get_elements_css_object



/**
* GET_ELEMENTS_STYLE_SHEET
* Get / create new styleSheet if not already exists
* @return {CSSStyleSheet} instance window.elements_style_sheet
*/
export const get_elements_style_sheet = function() {

	if (!window.elements_style_sheet) {

		const style = document.createElement('style');
		style.id	= 'elements_style_sheet'

		// Append <style> element to <head>
		document.head.appendChild(style);

		// Grab style element's sheet
		window.elements_style_sheet = style.sheet;

		// Verify the sheet was created successfully
		if (!window.elements_style_sheet) {
			throw new Error('Failed to create stylesheet');
		}
	}

	return window.elements_style_sheet
}//end create_new_CSS_sheet



// @license-end
