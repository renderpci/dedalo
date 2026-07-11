// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// component_portal supplies the full render/view/lifecycle layer reused by this alias.
	import {component_portal} from '../../component_portal/js/component_portal.js'



/**
* COMPONENT_RELATION_INDEX
* Client-side alias of component_portal for the indexation backlink component.
*
* component_relation_index answers "who indexes me?": it displays the list of records
* in other sections that index (cite) the current record through an indexation relation
* of type DEDALO_RELATION_TYPE_INDEX_TIPO (dd96). Typical use: a thesaurus term shows
* every catalogue record that has tagged it.
*
* All rendering, lifecycle management, pagination and event handling are identical to
* component_portal — the alias pattern means the JS instance class is exactly the same
* constructor/prototype chain, rendered by the portal render files
* (render_edit_component_portal.js, render_list_component_portal.js,
* render_search_component_portal.js).
*
* The entire behavioural difference between component_relation_index and component_portal
* lives on the PHP side (class.component_relation_index.php): the PHP class resolves
* INVERSE locators (who points at the current record) rather than outgoing ones, caches
* the resolved value in the matrix data column to power easy-search operators (* / !*),
* and dynamically assembles per-citing-section sub-contexts without a hand-authored
* request_config (see get_related_section_context()).
*
* This alias is intentional and permanent: adding a separate JS constructor would
* duplicate the portal code without any functional gain. Avoid creating a subclass here.
*/
export const component_relation_index = component_portal



// @license-end
