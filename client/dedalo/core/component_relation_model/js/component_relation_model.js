// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_RELATION_MODEL
*
* Client-side module for the component_relation_model component.
*
* component_relation_model is the browser counterpart of the PHP class
* component_relation_model (core/component_relation_model/class.component_relation_model.php).
* On the server side the component stores a locator of type
* DEDALO_RELATION_TYPE_MODEL_TIPO ('dd98') that links a record to its
* structural template ("model section"). The data shape exposed in the JSON
* API is identical to a component_select datum:
*
*   data.entries  : [{section_id, section_tipo, type, from_component_tipo}, …]
*   data.datalist : [{label, value: {section_id, section_tipo}}, …]
*
* Because the user-facing behaviour — a single-value dropdown constrained to
* an allowed list of target sections — is identical to component_select, the
* client implementation is a direct re-export alias of that class rather than a
* separate implementation. No additional methods or overrides are needed.
*
* Target section resolution (server-side, for context):
*   - 'free' mode: target sections come directly from ontology properties.
*   - hierarchy mode (default): the server looks up hierarchy1 using
*     hierarchy53 (target section tipo) and hierarchy58 (target model section
*     tipo). Falls back to prefix+'2' if the hierarchy lookup yields nothing.
*
* @module component_relation_model
* @see component_select (core/component_select/js/component_select.js)
*/

// imports
	import {component_select} from '../../component_select/js/component_select.js'



/**
* COMPONENT_RELATION_MODEL
* Direct alias of component_select.
*
* The class is re-exported under its own name so that the component loader
* (which maps server-side component tipo strings to JS constructors) can
* resolve 'component_relation_model' without special-casing. At runtime the
* constructor, prototype chain, and all lifecycle methods (init, build,
* render_edit, render_list, save, destroy, …) are exactly those of
* component_select — no behaviour differs.
*
* @type {typeof component_select}
*/
export const component_relation_model = component_select



// @license-end
