// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
 * DYNAMIC CSS MANAGER
 * Runtime stylesheet manager for Dédalo element-level CSS injection.
 *
 * Provides a single shared <style> element (id="elements_style_sheet") that is
 * created on first use and reused for all subsequent rule operations. All writes
 * go through a debounced queue (requestAnimationFrame) so that multiple style
 * updates triggered in the same JS turn are coalesced into one DOM mutation.
 *
 * Exported API:
 *   set_element_css(key, value)     – Build and queue rules for a component key
 *   prune_rules(condition_fn)       – Remove rules that satisfy a predicate
 *   get_inserted_rules()            – Return the live inserted-rules registry Map
 *   get_elements_style_sheet()      – Return (or lazily create) the CSSStyleSheet
 *
 * Internal pipeline:
 *   set_element_css → process_rule → queue_style_update → flush_style_updates → safe_insert_rule
 *
 * The inserted_rules Map acts as a local mirror of what is in the stylesheet so
 * that duplicate inserts and stale-rule replacements can be detected without
 * iterating cssRules (which is O(n) in some browsers).
 */



/**
 * INSERTED_RULES
 * Registry that mirrors every CSS rule currently held in the dynamic stylesheet.
 * Keyed by the normalized CSS selector string; values record only the rule text.
 *
 * Entry shape:
 * {
 *   "key":   "#col_section_id::before",        // normalized selector (Map key)
 *   "value": {
 *     "rule_text": "#col_section_id::before { content:'Id' }"
 *   }
 * }
 *
 * (!) Absolute indices are deliberately NOT cached. insertRule/deleteRule shift
 * every later index, so any stored index goes stale after another rule is deleted
 * (by safe_insert_rule's replace path or by prune_rules) and deleteRule(index)
 * would then remove the wrong rule. Rules are instead located live by their
 * selector at delete time (see find_rule_index).
 *
 * @var {Map<string, {rule_text: string}>} inserted_rules
 */
const inserted_rules = new Map();



/**
 * SET_ELEMENT_CSS
 * Translate a component-level style descriptor into one or more dynamic CSS rules
 * and queue them for insertion into the shared stylesheet.
 *
 * The `value` parameter is a map from logical selector fragments to either:
 *   - a plain CSS-properties object: { width: '12%', height: '150px' }
 *   - a callback function that returns { selector, value } for custom/responsive rules
 *     (see ui.make_column_responsive)
 *
 * The special key 'add_class' is silently skipped — it is handled elsewhere in the
 * component lifecycle (class list mutation, not stylesheet injection).
 *
 * Selector construction for non-callback entries:
 *   - If the fragment starts with '.wrapper', the component key is prepended
 *     directly: `.${key}${selector}` → e.g. `.oh1_rsc75.wrapper_component`
 *   - Otherwise the component key scopes the fragment as a child:
 *     `.${key} > ${selector}` (or without '>' when the fragment already starts with '>')
 *
 * (!) This function is declared async but contains no await expression. It returns
 * a resolved Promise<boolean>. Callers that do not await the return value receive
 * the resolved value directly via the microtask queue, which is functionally
 * equivalent in practice but callers should be aware of the async boundary.
 *
 * (!) The original doc-block described a `replace` parameter that does not exist
 * in the actual function signature. No replace logic is implemented here; all
 * deduplication is handled inside safe_insert_rule via the inserted_rules cache.
 *
 * @param {string} key - Unique component identifier used as the CSS scope class
 *   (e.g. 'oh1_rsc75'). Becomes the leading class selector for all rules.
 * @param {Object} value - Style descriptor map. Keys are selector fragments;
 *   values are either a CSS-properties object or a callback returning
 *   { selector: string, value: Object }.
 * @returns {Promise<boolean>} Resolves to true when at least one rule was queued,
 *   false when `value` is empty, not a plain object, or null.
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
				// Omit '>' when the fragment already leads with '>' to avoid '> >' duplication
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
 * Recursively flatten a CSS-properties descriptor into rule text and hand it to
 * the update queue.
 *
 * For flat string values, each property is serialised as `property:value` (with
 * single quotes around the value for the `content` CSS property so that the
 * generated text is syntactically valid: `content:'Id'`).
 *
 * For nested object values, the function recurses with skip_insert=true, collects
 * the child declarations, and calls queue_style_update with the parent key used
 * as a wrapping selector (typically a @media query or pseudo-selector nesting
 * context). This handles the case where `json_css_values` contains entries like:
 *   { '@media (max-width: 768px)': { width: '100%' } }
 *
 * The skip_insert flag controls whether collected rules are only returned (for
 * the recursive caller to assemble) or also flushed to the queue. Top-level calls
 * always pass false; recursive calls always pass true to prevent premature insertion
 * of partial rule fragments.
 *
 * @param {string} selector - Full CSS selector for the rule (e.g. '.rsc170_rsc20.wrapper_component')
 * @param {Object} json_css_values - Flat or nested CSS-property object
 * @param {boolean} skip_insert - When true, collected declarations are returned to
 *   the caller without queuing; used during recursion to build nested rule bodies
 * @returns {Array<string>} Flat list of serialised CSS declarations for this level
 *   (e.g. ['width:12%', 'height:150px']). Empty when all entries are nested objects.
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
 * QUEUE_STYLE_UPDATE
 * Batch-collect CSS rule updates and schedule a single DOM flush via
 * requestAnimationFrame to deduplicate rapid back-to-back writes.
 *
 * The queue is keyed by selector. If the same selector is submitted multiple
 * times within one animation frame only the last rule_body wins (last-write-wins
 * within a frame). If the incoming rule_body is identical to the currently queued
 * one it is skipped immediately without rescheduling.
 *
 * requestAnimationFrame is used (rather than setTimeout/microtask) so that all
 * style mutations for a given render cycle are batched together and applied just
 * before the browser's next paint, minimising forced style recalculations.
 *
 * Module-level state (declared here for colocation):
 *   style_update_queue      – Pending selector→rule_body pairs
 *   style_update_scheduled  – Guard flag: true while a rAF callback is pending
 *
 * @param {string} selector - Full CSS selector to update (Map key)
 * @param {string} rule_body - Serialised CSS declarations WITHOUT the wrapping
 *   braces, e.g. 'width:12%; height:150px'
 * @returns {void}
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
 * FLUSH_STYLE_UPDATES
 * Drain the pending style update queue and write every rule to the live
 * stylesheet in a single rAF callback.
 *
 * Resets style_update_scheduled before iterating so that any new updates
 * arriving during a (synchronous) safe_insert_rule call can schedule a
 * fresh rAF without being blocked by a stale true value.
 *
 * After all rules are processed the queue is cleared so that the Map does
 * not grow unboundedly across frames.
 *
 * @returns {void}
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
 *
 * @param {string} selector
 * @returns {string}
 */
const normalize_selector = function(selector) {

	return selector.replace(/\s+/g, ' ').trim()
}//end normalize_selector



/**
 * FIND_RULE_INDEX
 * Locate the live index of a rule in the sheet by its (normalized) selector.
 *
 * (!) Cached absolute indices are never trusted: insertRule/deleteRule shift every
 * later index, so the only reliable way to delete a rule is to locate it live at
 * delete time. Style rules are matched by selectorText; at-rules (@media /
 * @supports / @keyframes), which have no selectorText, are matched by their
 * prelude so they get replaced instead of duplicated on a body change.
 *
 * @param {CSSStyleSheet} sheet
 * @param {string} normalized_selector
 * @returns {number} index, or -1 if not found
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
 * Insert or replace a single CSS rule in the dynamic stylesheet, maintaining
 * the inserted_rules cache as a source of truth.
 *
 * If the selector already exists in inserted_rules the old rule is located live
 * (never by a cached index, which would be stale after any other insert/delete or
 * prune) and removed, then the new rule is re-inserted at the end of cssRules.
 *
 * Errors from both deleteRule and insertRule are caught and warned so that a
 * single malformed rule (e.g. invalid selector from a callback) does not abort
 * the rest of the batch.
 *
 * @param {string} selector - Full CSS selector
 * @param {string} rule_body - Serialised declarations without outer braces
 * @returns {boolean} true when the rule was successfully inserted or replaced;
 *   false when insertion failed or no change was needed
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
 * Remove all rules from the dynamic stylesheet that satisfy a caller-supplied
 * predicate, and evict the corresponding entries from inserted_rules.
 *
 * The predicate receives the raw CSSStyleRule object (not just the selector) so
 * callers can match on any property, e.g.:
 *   prune_rules(rule => rule.selectorText.startsWith('.oh1_rsc75'))
 *
 * Iteration is performed in reverse index order (high → low) so that deleteRule()
 * does not invalidate the indices of remaining rules ahead of the cursor.
 *
 * The cache is kept in sync by the normalized selectorText, matching the key that
 * safe_insert_rule stores. safe_insert_rule never relies on a cached index (it
 * relocates rules live), so prune-induced index shifts can no longer cause a
 * wrong-delete.
 *
 * @param {Function} condition_fn - Predicate receiving a CSSStyleRule; return true
 *   to delete the rule, false to keep it
 * @returns {void}
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
 * Check whether a rule's selector still matches at least one element in the DOM.
 *
 * Pseudo-classes and pseudo-elements are stripped so the test is state-independent
 * (e.g. a ':hover' rule is not treated as orphan just because nothing is hovered).
 * Stripping only ever broadens the match, so the test is biased towards keeping
 * rules: it never reports a live rule as orphan, at most it keeps a few dead ones.
 *
 * @param {CSSRule} rule
 * @returns {boolean} true to keep (an element matches, or presence can't be
 *   determined); false when the rule is orphan (no element matches) and safe to prune
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
 *
 * @returns {number} number of pruned rules
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
 * Return the live inserted-rules registry Map.
 * Callers may inspect it for debugging or to check whether a rule for a given
 * selector has already been injected, but should not mutate it directly —
 * all writes must go through safe_insert_rule so the cache stays consistent
 * with the stylesheet.
 *
 * @returns {Map<string, {rule_text: string}>} Reference to the
 *   module-level inserted_rules Map (not a copy)
 */
export const get_inserted_rules = function() {

	return inserted_rules
}//end get_inserted_rules



/**
 * GET_ELEMENTS_STYLE_SHEET
 * Return the singleton dynamic CSSStyleSheet, creating it on first access.
 *
 * On first call a <style id="elements_style_sheet"> element is appended to
 * <head> and its .sheet reference is stored on window.elements_style_sheet for
 * fast subsequent access without a DOM query. All later calls return the cached
 * reference directly.
 *
 * Storing on window (rather than a module-level variable) means the same sheet
 * is shared across ES module instances if more than one bundle is loaded into
 * the same window — useful in Dédalo's multi-panel layout where sections may be
 * loaded as separate module graphs.
 *
 * @throws {Error} When the browser fails to expose the sheet property after
 *   appending the <style> element (should not occur in any modern browser)
 * @returns {CSSStyleSheet} The live stylesheet object backed by
 *   window.elements_style_sheet
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
}//end get_elements_style_sheet



// @license-end
