// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* ROOT_CSS
*   Real target object where styles are stored
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
export const set_element_css = async (key, value, replace=false) => {

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
	const result = await update_style_sheet(key, value)


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
const update_style_sheet = async function(key, value) {

	// already exits case
		// if (root_css[key]!==undefined) {
		// 	console.log("Duplicated key (ignored):", key, value);
		// 	return false
		// }

	// style_sheet
		const css_style_sheet = get_elements_style_sheet()

	// add all
		for(const selector in value) {

			if (selector==='add_class') {
				continue;
			}

			// mixin. Compatibility with v5 mixin 'width'
				// if (value[selector].mixin) {
				// 	// width from mixin
				// 	const found = value[selector].mixin.find(el=> el.substring(0,7)==='.width_') // like .width_33
				// 	if (found) { //  && found!=='.width_50'
				// 		value[selector].style = value[selector].style || {}
				// 		// added to style like any other
				// 		value[selector].style.width = found.substring(7) + '%';
				// 	}
				// }

			// style values like {"width": "12%", height : "150px"}
				const json_css_values = value[selector] || null
				if (!json_css_values) {
					console.log("Ignored invalid style:", key, value[selector]);
					continue;
				}
				// console.log("json_css_values:", key, selector, json_css_values);

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

				// full_selector compatible v5 like '.wrap_component.oh1_rsc75'
				// const full_selector = selector==='.wrapper_component'
				// 	? `.${key}.wrapper_component` // like .oh1_rsc75.wrap_component
				// 	: `.${key}.wrapper_component ${operator} ${selector}`	// like .oh1_rsc75 > .content_data

				const full_selector = selector.indexOf('.wrapper')===0
					? `.${key}${selector}` // like .oh1_rsc75.wrap_component
					: `.${key} ${operator} ${selector}`	// like .oh1_rsc75 > .content_data

				// const full_selector = `.${key}${selector}` // like .oh1_rsc75.wrap_component

				// console.log("full_selector:", full_selector, json_css_values);

				// insert rule
				insert_rule(full_selector, json_css_values, css_style_sheet, false)
			}
		}
		// console.log("cssRules:",css_style_sheet.cssRules);

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

	// console.log("Object.keys(json_css_values):",Object.keys(json_css_values));

	const rules = []
	for(const key in json_css_values) {
		// console.log("key:",key);
		// console.log("json_css_values[key]:",json_css_values[key]);

		// prevent old styles to apply
			// if (key==='width' || key==='height') {
			// 	continue;
			// }

		if (typeof json_css_values[key]==='string') {
			const propText = key==='content'
				? `${key}:'${json_css_values[key]}'`
				: `${key}:${json_css_values[key]}`
			// console.log("+++++++++++++++++++ propText:",propText);
			rules.push(propText)
		}
		else if(
			typeof json_css_values[key]==='object'
			&& !Array.isArray(json_css_values[key])
			&& json_css_values[key]!==null)
			{

			const deep_rules = insert_rule(
				selector,
				json_css_values[key],
				css_style_sheet,
				true // skip_insert
			)
			// console.log('deep_rules:', deep_rules); // used ?
			const _joined	= deep_rules.join('; ')
			const rule		= `
			${key} {
				${selector} {
					${_joined};
				}
			}`
			// console.log("... FINAL RULE 1:", rule);
			css_style_sheet.insertRule(rule, css_style_sheet.cssRules.length);
			// window.requestAnimationFrame(inserting_inside)
			// function inserting_inside() {
			// 	css_style_sheet.insertRule(rule, css_style_sheet.cssRules.length);
			// }
		}
	}
	// console.log("rules:",rules);

	// resolving deep_rules cases
		if (skip_insert) {
			return rules
		}

	// const propText = Object.keys(json_css_values).map(function (p) {
	// 	return p + ':' + (p==='content' ? "'" + json_css_values[p] + "'" : json_css_values[p]);
	// }).join(';');
	// console.log("//////////// propText:",propText);

	// combine all rules
		const rule = selector + '{ ' + rules.join('; ') + ' }'
		// const rule =  rules.join('; ')
		// const rule = `@media screen and (min-width: 900px) {
		//   .example {
		//     background-color: blue;
		//   }
		// }`;
		// console.log("... FINAL RULE 2:", rule);

	css_style_sheet.insertRule(rule, css_style_sheet.cssRules.length);
	// console.log('index:', index);
	// window.requestAnimationFrame(inserting)
	// function inserting() {
	// 	css_style_sheet.insertRule(rule, css_style_sheet.cssRules.length);
	// }

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
*  Get / create new styleSheet if not already exists
* @return instance window.elements_style_sheet
*/
export const get_elements_style_sheet = function() {

	if (!window.elements_style_sheet) {

		const style = document.createElement('style');
		// style.type	= 'text/css'
		style.id	= 'elements_style_sheet'

		// Append <style> element to <head>
		document.head.appendChild(style);

		// Grab style element's sheet
		window.elements_style_sheet = style.sheet;
	}

	return window.elements_style_sheet
}//end create_new_CSS_sheet



// @license-end
