<?php declare(strict_types=1);
/**
* CLASS BUTTON_NEW
* Represents the "create new record" action button for a section.
*
* button_new is the server-side model for the ontology element typed as
* DEDALO_HIERARCHY_BUTTON_NEW_TIPO ('hierarchy11'). Its presence as a child
* of a section in the ontology declares that the section supports record
* creation, and its tipo is used as the permission gate for that action.
*
* Responsibilities and design:
* - Acts as a thin model whose presence in the section's ontology tree is
*   sufficient: callers (security::get_section_new_permissions(),
*   ts_object::get_permissions_element(), trait.request_config_utils.php
*   get_section_buttons()) look up button_new children of a section to
*   determine whether the current user may create records.
* - Permission level (0–3 int bitmask) is resolved via
*   common::get_permissions($section_tipo, $button_new_tipo). Level 0 means
*   the button is not surfaced in the UI; level > 0 exposes the "New record"
*   control.
* - The JSON controller (button_new_json.php) returns a standard
*   context/data envelope via common::build_element_json_output(). The data
*   array is always empty because button_new carries no data of its own;
*   all relevant information is in the ontology context.
* - All shared button infrastructure (constructor, define_id/tipo/lang/mode
*   helpers, $target, $id, $context_tipo properties) lives in button_common.
*   This class adds no new members; it exists to give the model a distinct
*   PHP class name so that common::get_json() resolves the correct
*   button_new_json.php controller via the called-class naming convention.
*
* Extends button_common, which extends common.
* Extended by nothing (final leaf in the hierarchy).
*
* @package Dédalo
* @subpackage Core
*/
class button_new extends button_common {



}
