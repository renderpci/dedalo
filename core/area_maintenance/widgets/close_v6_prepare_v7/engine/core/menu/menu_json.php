<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
// JSON data component controller

/**
* MENU_JSON (controller)
* JSON API controller for the `menu` element (ontology tipo dd85).
*
* This file is NOT a class — it is a PHP script included via common::get_json()
* inside the calling `menu` object's scope. At inclusion time `$this` refers to
* the live `menu` instance, and `$options` is the normalised options stdClass
* prepared by common::get_json() from the caller's request_options.
*
* Responsibilities:
* - Optionally assemble the structure context (ontology metadata for the menu
*   element itself) when $options->get_context is true.
* - Optionally assemble the data payload when $options->get_data is true.
*   The data item carries the flat list of permitted menu areas
*   (tree_datalist), installation-level diagnostics (info_data), a flag
*   that enables ontology inspection UI for developer accounts
*   (show_ontology), and the current user's short username.
* - Return the combined result as a stdClass via
*   common::build_element_json_output(), which is the return value of the
*   include() call that invoked this script.
*
* Response shape (both branches):
*   {
*     context: [ dd_object ],   // present when get_context === true
*     data: [                   // present when get_data === true
*       {
*         tipo:          string,   // 'dd85'  — the menu ontology tipo
*         model:         string,   // always 'menu'
*         tree_datalist: array,    // permitted areas; see menu::get_tree_datalist()
*         info_data:     object,   // installation diagnostics; see menu::get_info_data()
*         show_ontology: bool,     // true only for developer-role users
*         username:      string|null
*       }
*     ]
*   }
*
* Execution context:
*   - $this      — the menu instance (class menu extends common)
*   - $options   — stdClass with boolean flags: get_context, get_data,
*                  context_type, get_request_config (all set by common::get_json)
*
* @package Dédalo
* @subpackage Core
*/



// component configuration vars
	$mode			= $this->get_mode();
	// permissions
	// The menu is always displayed in 'edit' mode (level 2) because it drives
	// the application navigation and is never meaningful in a read-only context.
	// Level scale: 0 = none, 1 = read, 2 = edit, 3 = full.
	$permissions	= 2;

// context
	$context = [];

	if($options->get_context===true){

		// element structure context (tipo, relations, properties, etc.)
			$structure_context = $this->get_structure_context(
				$permissions,
				false // bool add_rqo
			);

		$context[] = $structure_context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true ){

		// Value
		switch ($mode) {
			case 'edit':
			default:
				// tree_datalist
				// Flat list of area objects that the current user is authorised to
				// see. Each item carries tipo, model, parent, label, and optional
				// config overrides (e.g. tool_context for section_tool areas).
				$tree_datalist	= $this->get_tree_datalist();
				// info_data
				// Installation-level diagnostics: Dédalo version/build, database
				// connection name, PHP version + JIT state, memory limit, server
				// software, and PostgreSQL server version. Used by the info panel
				// accessible from the main menu.
				$info_data		= $this->get_info_data();
				break;
		}

		// logged_user_id
		// Reads the integer user id from $_SESSION['dedalo']['auth']['user_id'].
		// Returns null when no session exists (should not happen here because
		// access to the API requires authentication, but checked for safety).
		// (!) The inline comment 'CURRENT_LOGGED_USED_ID' is a legacy marker
		// referencing the old constant name; it no longer maps to any constant.
		$user_id = logged_user_id(); // CURRENT_LOGGED_USED_ID

		// data item
		$item = new stdClass();
			$item->tipo				= $this->get_tipo();
			$item->model			= 'menu';
			$item->tree_datalist	= $tree_datalist;
			$item->info_data		= $info_data;
			// show_ontology
			// When true, the JS menu view renders the ontology inspection panel.
			// Only developer-role users should see internal ontology tooling.
			// (!) The inline comment '// SHOW_DEVELOPER; // boolean from config file'
			// is a leftover from when this was driven by a PHP constant; it is now
			// computed at runtime via security::is_developer().
			$item->show_ontology	= security::is_developer($user_id); //  SHOW_DEVELOPER; // boolean from config file
			// username
			// Short session username (e.g. 'render'), used by the menu header to
			// display the current user. Sourced from $_SESSION['dedalo']['auth'].
			$item->username			= logged_user_username();

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
