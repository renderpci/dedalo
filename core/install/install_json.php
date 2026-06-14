<?php declare(strict_types=1);
/**
* INSTALL — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for the
* install object. Executed via common::get_json() inside the calling object
* scope ($this = install).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the installation wizard context when the caller requests it
*   ($options->get_context). install::get_structure_context() runs a cascade
*   of pre-flight checks (filesystem permissions, DB connectivity, PHP version)
*   and on success returns a dd_object whose properties contain all information
*   the JS install wizard needs to render the setup steps and progress UI.
* - Build a minimal data item when $options->get_data is true. The install
*   object is always accessible before authentication (it is the entry point
*   for first-time setup), so $permissions is hard-coded to 1 rather than
*   resolved from the security layer.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside install::get_json() (inherited from common). The variables $this
*   (install), $options (stdClass with boolean flags), and SHOW_DEBUG
*   (compile-time constant) are injected by the caller via PHP's include()
*   scope; no explicit argument passing is needed.
*
*   Path resolution in common::get_json():
*     $called_model = get_class($this);  // → 'install'
*     $path = DEDALO_CORE_PATH . '/' . $called_model . '/' . $called_model . '_json.php';
*     // resolves to: <core>/install/install_json.php  (this file)
*
*   $options shape (populated by common::get_json() before the include):
*     - get_context  bool  whether to build the ontology/install structure context
*     - get_data     bool  whether to return a data item
*
* Why $permissions = 1 (hardcoded):
*   All component JSON controllers resolve permissions via
*   get_component_permissions() which may return 0 for restricted elements.
*   The install wizard must be reachable before any user session exists, so
*   its permissions are unconditionally 1 (allow) here. The actual security
*   boundary is enforced by install::get_structure_context(), which returns
*   a partial (empty-properties) dd_object when DEDALO_INSTALL_STATUS is
*   already 'installed', preventing re-entry after a completed setup.
*
* Context shape (one dd_object in $context, produced by install::get_structure_context()):
*   On failure / already-installed: dd_object with empty properties.
*   On init-test failure: dd_object with properties.init_test set only.
*   On DB failure: dd_object with properties.init_test + properties.db_status.
*   On full success:
*   {
*     init_test               : {result: bool, msg: string[]}
*     db_status               : {global_status: bool, …}
*     dedalo_entity           : string
*     db_config               : {db_name, user_name, hostname, port, socket}
*     db_data_version         : string[]|null  // e.g. ['5','8','2'], null if not readable
*     version                 : string         // DEDALO_VERSION + ' - Build ' + DEDALO_BUILD
*     target_file_path        : string         // path to the .pgsql.gz seed archive
*     target_file_path_exists : bool
*     hierarchy_files_dir_path: string
*     hierarchies             : array|null     // available .copy.gz hierarchy files
*     install_checked_default : array          // pre-selected hierarchy codes
*     hierarchy_typologies    : object
*     php_version             : string         // PHP_VERSION constant
*     php_version_supported   : bool           // true when PHP >= 8.1.0
*     max_execution_time      : string         // from php.ini
*   }
*
* Data shape produced (one item in $data, when get_data is true):
*   {
*     section_id          : string|int,
*     section_tipo        : string,        // 'dd1590' (install ontology node)
*     tipo                : string,
*     pagination          : object,
*     from_component_tipo : string,
*     value               : {}             // empty stdClass; placeholder
*   }
*   The data item carries no meaningful value. It exists for structural parity
*   with other JSON controllers. The real install payload lives in context.
*
* Primary caller:
*   dd_utils_api::get_install_context() instantiates install, calls get_json()
*   with get_context=true / get_data=false, and forwards context[0] to the JS
*   install wizard over the API.
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.install.php  install::get_structure_context(), install::__construct()
* @see class.common.php   common::get_json(), common::build_element_json_output()
* @see class.dd_utils_api.php  dd_utils_api::get_install_context()
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
/** @var install $this */
// JSON data controller



// configuration vars
// $permissions is unconditionally 1: the install wizard must be served before
// any authenticated session exists. The security boundary is inside
// install::get_structure_context() (partial return when already installed).
	$tipo			= $this->get_tipo();
	$permissions	= 1;
	$mode			= $this->get_mode();



// context
// Accumulates the single dd_object entry describing the install wizard state.
// The dd_object properties contain pre-flight checks, DB status, version
// strings, and hierarchy file lists; see the file-level doc for the full shape.
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
		// $permissions (always 1) is forwarded for interface compatibility.
		// add_rqo (second arg) is false: no dataframe or request_config needed.
			$context[] = $this->get_structure_context(
				$permissions,
				false // bool add_rqo
			);
	}//end if($options->get_context===true)



// data
// The data item is a structural placeholder — the install wizard reads its
// payload exclusively from context[0]. An empty stdClass is used as value
// because no database record is involved at this stage.
	$data = [];

	if($options->get_data===true && $permissions>0){

		$value = new stdClass();

		// data item
		// Wraps $value in the standard envelope
		// {section_id, section_tipo, tipo, pagination, from_component_tipo, value}.
			$item  = $this->get_data_item($value);

		$data[] = $item;
	}//end if $permissions>0



// JSON string
// Assemble the final response object {context: array, data: array} and
// return it to common::get_json(), which passes it to the API caller.
	return common::build_element_json_output($context, $data);
