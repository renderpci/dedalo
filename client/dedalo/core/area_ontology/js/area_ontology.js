// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/


/**
* AREA_ONTOLOGY
* Thin alias module that exposes the ontology area under its own name.
*
* The ontology area reuses all behaviour from area_thesaurus: hierarchical
* tree navigation, term look-up, search, and section management. The only
* difference between the two areas lives on the PHP/server side
* (class.area_ontology.php overrides get_hierarchy_section_tipo() to point at
* DEDALO_ONTOLOGY_SECTION_TIPO instead of the thesaurus section). The client
* needs no specialisation, so this file simply re-exports area_thesaurus under
* the area_ontology name so that dynamic module imports routed to
* core/area_ontology/js/area_ontology.js resolve correctly.
*
* Consumers that import { area_ontology } receive the exact same constructor /
* class reference as consumers that import { area_thesaurus }.
*/


// imports
	import {area_thesaurus} from '../../area_thesaurus/js/area_thesaurus.js'



/**
* AREA_ONTOLOGY
* Re-export of area_thesaurus under the area_ontology name.
*
* This alias exists so that the Dédalo module loader can resolve
* core/area_ontology/js/area_ontology.js without duplicating JS code. All
* runtime behaviour is identical to area_thesaurus; the server-side PHP class
* (class.area_ontology.php) supplies the only ontology-specific override
* (the hierarchy section tipo).
*
* @type {typeof area_thesaurus}
*/
export const area_ontology = area_thesaurus



// @license-end
