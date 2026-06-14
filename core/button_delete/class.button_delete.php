<?php declare(strict_types=1);
/**
* CLASS BUTTON_DELETE
* Delete-action button model for Dédalo v7 sections.
*
* Represents a button that exposes record-deletion functionality within a section.
* It is the model counterpart of the delete UI control rendered by button_delete.php
* (the HTML controller script that maps the current mode to a .phtml view template).
*
* Responsibilities:
* - Serve as the ontology-typed model for "button_delete" nodes registered as
*   children of a section in the ontology tree.
* - Inherit all construction, permission, label, and property resolution from
*   button_common (which in turn extends common).
* - Carry no additional state or logic of its own: deletion behaviour is fully
*   delegated to the HTML controller (button_delete.php) and the JS layer that
*   consumes the rendered widget.
*
* Lifecycle / instantiation:
* - button_delete nodes are discovered via
*   section::get_ar_children_tipo_by_model_name_in_section() and passed through
*   common::get_buttons_context(), which checks permissions (must be >= 2) and
*   builds the rendered context for the client.
* - In the thesaurus (ts_object) context, get_permissions_element('button_delete')
*   returns 0 for hierarchy roots (deletion of root nodes is always disallowed)
*   and the standard permission bitmask for ordinary term nodes.
* - The HTML controller (button_delete.php) resolves the active mode
*   ('edit', 'list', 'list_of_values', 'relation', 'tool_portal',
*   'tool_time_machine', 'selected_fragment') to one of the allowed .phtml
*   templates and enforces SEC-054 path-traversal protection.
*
* Extends button_common, which extends common.
* Extended by: none (concrete leaf class).
* HTML controller: core/button_delete/button_delete.php
*
* @package Dédalo
* @subpackage Core
*/
class button_delete extends button_common {



}
