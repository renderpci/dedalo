// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_SELECT_LANG
* Client-side module for component_select_lang — the Dédalo language picker.
*
* component_select_lang is a specialised subclass of component_select whose
* purpose is to let a cataloguer declare **which language** a piece of content
* is written/spoken in, independently of the application UI language and
* independently of Dédalo's per-component translation slots.
*
* Instead of storing a free text string it stores a single locator that points
* at a record in the Dédalo languages section (lg1). The option list is built
* by the PHP server layer (get_list_of_values()) from the project's configured
* languages (DEDALO_PROJECTS_DEFAULT_LANGS / lang::resolve_multiple()) rather
* than from a generic RQO search; the client therefore receives a ready-made
* `datalist` array alongside `entries` (the stored locator) in the API datum.
*
* Client behaviour is identical to component_select: this module simply
* re-exports the component_select constructor under the component_select_lang
* name so the client-side registry can map the model string to the correct
* constructor without shipping any duplicated code. All rendering, save,
* search, and datalist logic lives in component_select and its render_* peers.
*
* @module component_select_lang
* @see core/component_select/js/component_select.js  — the shared implementation
* @see core/component_select_lang/js/                — no additional render files needed
* @see docs/core/components/component_select_lang.md — full data model + ontology spec
*/

// imports
	import {component_select} from '../../component_select/js/component_select.js'



/**
* COMPONENT_SELECT_LANG
* Direct alias of the component_select constructor.
*
* The two models share byte-identical client behaviour; the only differences
* between component_select and component_select_lang live on the PHP server
* side (get_list_of_values() builds from project languages instead of an RQO,
* conform_import_data() accepts language-code strings, get_value_code()
* exposes the lg-xxx code, etc.).  Exporting the same constructor under both
* names means the client registry can load either model string without needing
* a second copy of the prototype chain.
*
* @type {Function} component_select constructor (also used as component_select_lang)
*/
export const component_select_lang = component_select



// @license-end
