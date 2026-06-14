// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {component_portal} from '../../component_portal/js/component_portal.js'



/**
* COMPONENT_RELATION_RELATED
* Client-side module for the related-term (associative) relation component.
*
* This module is intentionally a thin alias: the full client behaviour
* (edit / list / search rendering, pagination, toolbar, event wiring) is
* owned by component_portal and re-used here unchanged.  The server side
* (core/component_relation_related/class.component_relation_related.php)
* is its own distinct PHP class with relation-specific semantics:
*
*   Directionality modes (controlled by DEDALO_RELATION_TYPE_RELATED_*_TIPO):
*   - Unidirectional (dd620): A → B; B has no back-reference to A.
*     The client simply shows the stored locators.
*   - Bidirectional   (dd467): A ↔ B; both terms reference each other.
*     The server calls get_references_recursive() to discover terms that
*     point at the current term and merges them into the data layer as
*     calculated/derived locators.
*   - Multidirectional (dd621): star topology; any term in a cluster
*     references every other term.  The recursive resolver traverses the
*     full graph to collect all members.
*
* Why share the client?  component_portal already renders a paginated,
* navigable list of locators with add / remove / browse actions — exactly
* the UI that an associative relation needs.  The extra bidirectional /
* multidirectional entries are injected server-side via
* get_data_with_references() so the client receives a flat array of
* locators in the standard data layer and renders them transparently.
*
* Data shape consumed from the API response:
*   - context layer: standard component_portal context
*     (tipo, section_tipo, mode, show, ddo_map, …)
*   - data layer:    array of locator objects, each:
*     { id, section_tipo, section_id, type: 'dd89', type_rel: 'dd620'|'dd467'|'dd621',
*       from_component_tipo }
*     For bidirectional / multidirectional modes the array also contains
*     derived locators computed by get_references_recursive() on the server.
*
* The Dédalo client instance factory resolves the model string returned by
* the API (component_relation_related) and calls
* `new component_relation_related()`, obtaining a fully-functional portal
* instance.  No additional JS is required on the client side.
*
* @type {typeof component_portal}
* @see core/component_portal/js/component_portal.js           — shared implementation
* @see core/component_relation_related/class.component_relation_related.php — server logic
* @see core/component_relation_children/js/component_relation_children.js  — sibling alias
* @see core/component_relation_parent/js/component_relation_parent.js       — sibling alias
*/
export const component_relation_related = component_portal



// @license-end