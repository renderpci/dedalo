<?php
/**
* BUTTON_DELETE — HTML CONTROLLER
* Included-file controller that selects and renders the correct .phtml view
* template for a button_delete instance.  Executed inside the calling object
* scope ($this = button_delete) by common or the section render pipeline.
*
* Responsibilities:
* - Extract the identity and UI state needed by the view template from the
*   button_delete instance (tipo, section_tipo, target, mode, label,
*   properties, permissions).
* - Normalise the incoming $mode value to a canonical $file_name.  Several
*   request contexts ('tool_portal', 'relation', 'tool_time_machine',
*   'selected_fragment') use the same 'edit' view template, so the switch maps
*   them before the path is built.
* - Enforce a strict allowlist (SEC-054) and a realpath confinement check
*   before any include, preventing an attacker from redirecting $file_name to
*   an arbitrary path via a crafted 'mode' value.
* - Include the resolved .phtml template, which reads the local variables set
*   above (especially $permissions, $tipo, $label, $mode) to render the button
*   markup.
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside the button render pipeline.  The variable $this (button_delete) is
*   provided by the caller; the local variables defined here are consumed by
*   the included .phtml template.  No explicit argument passing is needed.
*
* Modes handled:
*   'edit'             → button_delete_edit.phtml
*   'tool_portal'      → button_delete_edit.phtml  (portal wraps the edit view)
*   'relation'         → button_delete_edit.phtml  (relation context reuses edit)
*   'tool_time_machine'→ button_delete_edit.phtml  (Time Machine read-only overlay)
*   'selected_fragment'→ button_delete_edit.phtml  (fragment context reuses edit)
*   'list'             → button_delete_list.phtml
*   'list_of_values'   → button_delete_list_of_values.phtml
*
* Security notes:
*   SEC-054: $mode is client-supplied via source.mode and would otherwise be
*   interpolated directly into the include path.  Two defences are applied in
*   sequence:
*     1. Allowlist: only the three canonical file names ('edit', 'list',
*        'list_of_values') can emerge from the switch; anything else is logged
*        and rejected before the include is reached.
*     2. Realpath confinement: even if a future change adds a new mode without
*        updating the allowlist, realpath() is used to verify the resolved path
*        stays within the button_delete class directory.
*
* Variables exposed to the .phtml template:
*   $tipo          string      ontology tipo of this button (e.g. 'hierarchy11')
*   $section_tipo  string      tipo of the owning section
*   $target_tipo   string|int  matrix-row target (same as $id — see flag below)
*   $id            string|int  matrix-row target (same source as $target_tipo)
*   $mode          string|null render mode as stored on the instance
*   $label         string|null human-readable button label (ontology term)
*   $properties    object|null ontology properties for this button node
*   $debugger      mixed       (unused — see flag below)
*   $html_title    string      tooltip/title string built from $tipo (unused — see flag below)
*   $permissions   int         numeric permission level (0–3) for this button
*   $file_name     string      canonical template stem after switch normalisation
*
* Called by:
*   section render pipeline  →  includes this file
*
* @see class.button_delete.php
* @see class.button_common.php
* @see class.common.php  common::get_permissions()
*
* @package Dédalo
* @subpackage Core
*/
/** @var button_delete $this */

	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$section_tipo 			= $this->get_section_tipo();
	// (!) $target_tipo and $id are assigned from the same get_target() call.
	// Both variables exist for legacy template compatibility; they hold the
	// same int matrix-row ID.  A future consolidation should pick one name.
	$target_tipo			= $this->get_target();
	$id 					= $this->get_target();
	$mode					= $this->get_mode();
	$label 					= $this->get_label();
	$properties 			= $this->get_properties();
	// (!) $debugger is assigned here but is not consumed by any current
	// .phtml template and get_debugger() is not defined on button_common or
	// common.  This is likely dead code from an earlier debugging mechanism.
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	// (!) $html_title is constructed but never consumed by any current .phtml
	// template.  It appears to be a remnant from an earlier tooltip approach.
	$html_title				= "Info about $tipo";

	// $file_name normalisation
	// Start with $mode as the default stem; the switch below collapses all
	// alias modes to a canonical stem before the path is built.
	$file_name 				= $mode;


	// Mode alias map
	// Several contextual modes share the same 'edit' view (the button looks
	// and behaves identically in portals, relations, Time Machine overlays,
	// and selected-fragment contexts).  Only 'list' and 'list_of_values' have
	// their own dedicated templates.
	switch($mode) {

		case 'edit':
					break;

		case 'tool_portal':
					$file_name  = 'edit';
					break;

		case 'relation':$file_name  = 'edit';
					break;

		case 'tool_time_machine':
					$file_name  = 'edit';
					break;

		case 'selected_fragment':
					$file_name  = 'edit';
					break;

		case 'list':
					break;

		case 'list_of_values':
					break;
	}


	// SEC-054: refuse any $file_name that is not one of the modes the
	// switch above is allowed to set. `$mode` comes from the client via
	// `source.mode` and would otherwise be concatenated into the include
	// path, letting an attacker reach any `.phtml` under DEDALO_CORE_PATH
	// via traversal (e.g. `../../other_class/html/other_class_evil`).
	$allowed_modes = ['edit','list','list_of_values'];
	if (!in_array($file_name, $allowed_modes, true)) {
		debug_log(__METHOD__
			. ' SEC-054 refused button_delete mode: ' . to_string($mode)
			, logger::ERROR
		);
		echo "<div class=\"error\">Invalid mode</div>";
		return;
	}
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	// Realpath confinement against the class directory. Even with the
	// allowlist above, this catches any future misuse (symlinks, new
	// modes added without updating the list).
	$class_dir = realpath(DEDALO_CORE_PATH .'/'. get_class($this));
	$real_page = realpath($page_html);
	if ($class_dir === false || $real_page === false
		|| strncmp($real_page, $class_dir . DIRECTORY_SEPARATOR, strlen($class_dir) + 1) !== 0) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
		return;
	}
	if( !include($real_page) ) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
	}
?>
