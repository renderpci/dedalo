<?php declare(strict_types=1);
/**
* COMPONENT_SECURITY_ACCESS — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_security_access instance. Executed via common::get_json() inside
* the calling object scope ($this = component_security_access).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant.
* - Resolve component data for the current mode (edit/list/tm):
*     - 'edit' mode: fetches the raw permission array ($value) via get_data_lang(),
*       the user-specific datalist (the full ontology tree for the permission UI),
*       and the list of schema-change files so the client can highlight changed nodes.
*     - 'list'/'tm' modes: fetches only get_list_value() — the compact view does
*       not need the tree or change-files.
* - Attach parent_tipo and parent_section_id to the data item so the client can
*   derive the component locator in portal or inline-relation contexts.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Inclusion contract:
*   This file is NOT a class or a standalone script. It is loaded by
*   common::get_json() via include(), so $this is already bound and $options
*   is already constructed before execution begins. The file returns the
*   stdClass produced by common::build_element_json_output().
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang, from_component_tipo,
*     entries: array|null,         // raw permission objects [{id,tipo,section_tipo,value}]
*     parent_tipo: string,
*     parent_section_id: string|int|null,
*     datalist?: array,            // full ontology tree (edit mode only, expensive to build)
*     changes_files?: string[]     // schema change JSON file names (edit mode only)
*   }
*
* Datalist shape (each item in datalist):
*   {
*     tipo: string,
*     section_tipo: string,
*     model: string,
*     label: string,
*     parent: string,
*     ar_parent: string[]          // full ancestor chain for client-side tree traversal
*   }
*
* @package Dédalo
* @subpackage Core
*/
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_security_access $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		// add_rqo. True when the component ontology properties include a 'unique'
		// flag — that flag signals that a request_config object must travel inside
		// the context payload so the client search autocomplete can enforce
		// uniqueness server-side. In practice, component_security_access does not
		// use 'unique', so $add_rqo is almost always false here.
		$add_rqo = isset($properties->unique) ? true : false;
		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				// Lightweight variant: omits tools and buttons; used for list/tm/portal
				// wrappers that only need the ontology structure.
				$this->context = $this->get_structure_context_simple(
					$permissions,
					$add_rqo
				);
				break;

			default:

				// Component structure context (tipo, relations, properties, etc.)
				// Full context includes tools (tool_propagate_component_data,
				// tool_time_machine) and buttons; used in 'edit' and 'search' views.
				$this->context = $this->get_structure_context(
					$permissions,
					$add_rqo
				);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// logged_user_id. Required for get_datalist() to filter areas by profile
		// (non-admin users see only the areas they are already authorized for)
		// and to determine whether to build the full or user-scoped tree.
		$user_id = logged_user_id();

		// value
		// Resolve value according to rendering mode.
		// 'list'/'tm': get_list_value() returns the language-filtered slice used by
		//   the compact list renderer ("View list unavailable" placeholder in JS).
		// 'edit' (default): get_data_lang() returns the full array of stored
		//   permission objects for the current lang (always lg-nolan for this
		//   non-translatable component), then also fetches the datalist and
		//   schema change-files needed by the tree UI.
		//
		// (!) Building the datalist on first access can take 3–6 s; the login
		// sequence pre-warms it in the background via calculate_tree(). On a cache
		// hit (dd_cache::cache_from_file) the overhead is negligible.
			switch ($mode) {
				case 'list':
				case 'tm':
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					$value			= $this->get_data_lang();
					$datalist		= $this->get_datalist($user_id);
					// changes_files. Array of schema-change JSON filenames (sorted
					// descending by date) from the ontology backup/changes directory.
					// The client renders a side panel so admins can see which ontology
					// elements were recently added/modified and adjust permissions
					// accordingly without leaving the profile edit view.
					$changes_files	= hierarchy::get_simple_schema_changes_files();
					break;
			}
		// data item
		// Build the standard data envelope. parent_tipo and parent_section_id are
		// added so the client can derive the parent component locator when needed
		// (e.g., in portal or inline-relation contexts).
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

			// datalist. Attach only when present (edit mode), so list/tm responses
			// stay compact — the full tree can contain thousands of nodes.
			if (isset($datalist)) {
				$item->datalist = $datalist;
			}

			// changes_files. Attach only in edit mode (same guard as $datalist).
			if (isset($changes_files)) {
				$item->changes_files = $changes_files;
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
