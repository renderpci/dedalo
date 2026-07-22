// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
 * DYNAMIC CSS MANAGER
 */



/**
* INSERTED_RULES
* Registry for style sheet inserted CSS rules
* value e.g. {
*    "key": "#col_section_id::before",
*    "value": {
*        "rule_text": "#col_section_id::before { content:'Id' }",
*        "index": 0
*    }
*  }
*/
const inserted_rules = new Map();



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
export const set_element_css = async function(key, value) {

	// Validate value parameter - must be non-empty object
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
		// empty object or invalid type
		return false;
	}

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

				// process and insert rule
				process_rule(full_selector, json_values, false)

			}else{

				// components case

				// direct children operator
					const operator = selector.indexOf('>')===0
						? ''
						: '>'

				const full_selector = selector.indexOf('.wrapper')===0
					? `.${key}${selector}` // like .oh1_rsc75.wrap_component
					: `.${key} ${operator} ${selector}`	// like .oh1_rsc75 > .content_data

				// process and insert rule
				process_rule(full_selector, json_css_values, false)
			}
		}


	return true
}//end set_element_css



/**
* PROCESS_RULE
* Execute a standard 'insertRule' order with given values
*
* @param string selector
* 	like: '.rsc170_rsc20.wrapper_component'
* @param object json_css_values
* 	like:
* @param boolean skip_insert
* 	Used to control deep recursive resolutions
*
* @return array rules
*/
const process_rule = function(selector, json_css_values, skip_insert) {

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

			// recursion
			const deep_rules = process_rule(
				selector,
				value,
				true // skip_insert
			)

			const joined = deep_rules.join('; ');

			// Create nested rule (assuming key is a media query or pseudo-selector)
			// const rule = `
			// ${key} {
			// 	${selector} {
			// 		${joined};
			// 	}
			// }`;

			const rule_body = `${selector} { ${joined} }`
			queue_style_update(key, rule_body)
		}
	}

	// resolving deep_rules cases
		if (skip_insert) {
			return rules
		}

	 // Combine all rules for the main selector
		if (rules.length > 0) {

			const rule_body = rules.join('; ');
			queue_style_update(selector, rule_body)
		}


	return rules
}//end process_rule



/**
* QUEUE_RULE
* Batch Insert Rules.
* Debounce the rules injection for rule deduplication
* @param object rule
* @return void
*/
const style_update_queue	= new Map(); // selector -> rule_body
let style_update_scheduled	= false;
const queue_style_update = function(selector, rule_body) {

	const current = style_update_queue.get(selector);
	if (current === rule_body) {
		return; // skip identical queued rule
	}

	style_update_queue.set(selector, rule_body);

	if (!style_update_scheduled) {
		style_update_scheduled = true;
		requestAnimationFrame(flush_style_updates);
	}
}//end queue_style_update



/**
* FLUSH_RULES
* Insert batch rules in a pack of various between a requestAnimationFrame
*/
const flush_style_updates = function() {
	style_update_scheduled = false;
	for (const [rule_selector, rule_body] of style_update_queue.entries()) {
		safe_insert_rule(rule_selector, rule_body);
	}
	style_update_queue.clear();
}//end flush_style_updates



/**
* NORMALIZE_SELECTOR
* Collapse whitespace so a constructed selector and the browser-normalized
* CSSRule.selectorText can be compared reliably.
* @param string selector
* @return string
*/
const normalize_selector = function(selector) {

	return selector.replace(/\s+/g, ' ').trim()
}//end normalize_selector



/**
* FIND_RULE_INDEX
* Locate the live index of a rule in the sheet by its (normalized) selector.
* (!) Cached absolute indices are never trusted: insertRule/deleteRule shift
* every later index, so the only reliable way to delete a rule is to locate
* it live at delete time. Style rules are matched by selectorText; at-rules
* (@media / @supports / @keyframes), which have no selectorText, are matched by
* their prelude so they get replaced instead of duplicated on a body change.
* @param CSSStyleSheet sheet
* @param string normalized_selector
* @return int index or -1 if not found
*/
const find_rule_index = function(sheet, normalized_selector) {

	const rules = sheet.cssRules

	// whitespace-insensitive form, used only to match at-rule preludes. Removing
	// all whitespace is safe for a prelude (no descendant-vs-compound ambiguity)
	// and is never applied to element selectors.
	const compact_key = normalized_selector.replace(/\s+/g, '')

	for (let i = 0; i < rules.length; i++) {

		const rule = rules[i]

		// style rules: match by normalized selectorText
		const selector_text = rule.selectorText
		if (selector_text) {
			if (normalize_selector(selector_text)===normalized_selector) {
				return i
			}
			continue
		}

		// at-rules (no selectorText): match by the prelude before the first '{'
		const css_text	= rule.cssText || ''
		const brace		= css_text.indexOf('{')
		const head		= (brace===-1 ? css_text : css_text.slice(0, brace)).replace(/\s+/g, '')
		if (head!=='' && head===compact_key) {
			return i
		}
	}

	return -1
}//end find_rule_index



/**
* SAFE_INSERT_RULE
* Add new styleSheet rules if not already exists
* @param string selector
* @param string rule_body
* @return bool
*/
const safe_insert_rule = function(selector, rule_body) {

	// sheet
	const sheet = get_elements_style_sheet()

	// normalized map key. Used to compare against the browser-normalized
	// selectorText when locating / pruning the rule later.
	const key = normalize_selector(selector)

	// rule_text
	const rule_text = `${selector} { ${rule_body} }`;

	// check for already inserted rule
	const cached = inserted_rules.get(key);
	if (cached) {

		if (cached.rule_text === rule_text) {
			// if(SHOW_DEBUG===true) {
			// 	console.log('Ignored already existing rule:', selector, rule_text);
			// }
			return false; // No change needed
		}

		// replace: locate the rule live (cached index would be stale after any
		// other insert/delete or prune) and remove exactly that one
		const index = find_rule_index(sheet, key);
		if (index !== -1) {
			try {
				sheet.deleteRule(index);
			} catch (e) {
				console.warn('Failed to delete rule', e);
			}
		}
	}

	try {
		sheet.insertRule(rule_text, sheet.cssRules.length);
		inserted_rules.set(key, { rule_text });
	} catch (e) {
		console.warn('Failed to insert rule', rule_text, e);
		inserted_rules.delete(key);
		return false;
	}


	return true;
}//end safe_insert_rule



/**
* PRUNE_RULES
* Clean up unused rules
* @param condition_fn - Function returning boolean
*/
export const prune_rules = function(condition_fn) {

	const sheet = get_elements_style_sheet();

	for (let i = sheet.cssRules.length - 1; i >= 0; i--) {

		const rule			= sheet.cssRules[i];
		const rule_selector	= rule.selectorText // e.g. '.oh1_oh62.edit.wrapper_component'
			? normalize_selector(rule.selectorText)
			: null;

		if (condition_fn(rule)) {

			// delete sheet rule by index
			sheet.deleteRule(i);

			// inserted_rules delete to keep the cache in sync
			if (rule_selector) {
				inserted_rules.delete(rule_selector);
			}
		}
	}
}//end prune_rules



/**
* IS_SELECTOR_ALIVE
* Checks whether a rule's selector still matches at least one element in the DOM.
* Pseudo-classes and pseudo-elements are stripped so the test is state-independent
* (e.g. a ':hover' rule is not treated as orphan just because nothing is hovered).
* Stripping only ever broadens the match, so the test is biased towards keeping
* rules: it never reports a live rule as orphan, at most it keeps a few dead ones.
* @param CSSRule rule
* @return bool
*	true  -> keep the rule (an element matches, or presence can't be determined)
*	false -> orphan (no element matches): safe to prune
*/
const pseudo_re = /:{1,2}[a-zA-Z-]+(\([^)]*\))?/g;
const is_selector_alive = function(rule) {

	// Non-style rules (media, keyframes, font-face...) have no selectorText.
	// They are few and cannot be DOM-tested: keep them.
	const selector_text = rule && rule.selectorText;
	if (!selector_text) {
		return true
	}

	// test each comma separated branch independently
	const ar_selector = selector_text.split(',');
	for (let i = 0; i < ar_selector.length; i++) {

		// strip pseudo-classes / pseudo-elements and any dangling combinators
		const clean = ar_selector[i]
			.replace(pseudo_re, '')
			.replace(/[>+~\s]+$/, '')
			.trim();

		if (clean==='') {
			// nothing testable left: keep the rule to be safe
			return true
		}

		try {
			if (document.querySelector(clean)) {
				return true // at least one matching element is alive
			}
		} catch (e) {
			// unsupported/invalid selector after stripping: keep to be safe
			return true
		}
	}

	// no element matched any branch: the rule is orphan
	return false
}//end is_selector_alive



/**
* PRUNE_ORPHAN_RULES
* Remove only rules whose selector no longer matches any element in the DOM.
* Frees memory from destroyed components (e.g. when browsing records) without
* ever stripping CSS from components that are still visible on screen.
* @return int number of pruned rules
*/
export const prune_orphan_rules = function() {

	let pruned = 0;

	prune_rules((rule) => {
		const orphan = !is_selector_alive(rule);
		if (orphan) {
			pruned++;
		}
		return orphan
	});


	return pruned
}//end prune_orphan_rules



/**
* GET_INSERTED_RULES
* @return Map inserted_rules
*/
export const get_inserted_rules = function() {

	return inserted_rules
}//end get_inserted_rules



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
