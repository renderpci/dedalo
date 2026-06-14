<?php declare(strict_types=1);
/**
* LOGIN — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for the
* login object. Executed via common::get_json() inside the calling object scope
* ($this = login).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context). The login context is richer than a typical
*   component: login::get_structure_context() appends the list of child
*   ontology items (login form fields) plus a properties.info array with
*   entity name, code/data/ontology version strings, SAML config flag, and,
*   on development installations only, DB connection diagnostics.
* - Build a minimal data item when $options->get_data is true. The login
*   object is always publicly accessible before authentication, so
*   $permissions is hard-coded to 1 (never 0) rather than read from the
*   security layer.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside login::get_json() (inherited from common). The variables $this
*   (login), $options (stdClass with boolean flags), and SHOW_DEBUG
*   (compile-time constant) are injected by the caller via PHP's include()
*   scope; no explicit argument passing is needed.
*
*   $options shape (populated by common::get_json() before the include):
*     - get_context  bool  whether to build the ontology structure context
*     - get_data     bool  whether to return a data item
*
* Why $permissions = 1 (hardcoded):
*   All other JSON controllers call $this->get_component_permissions() which
*   may return 0 for restricted components. The login form must be served to
*   unauthenticated users, so its permissions are unconditionally 1 (allow)
*   here. The security gate for the resulting session is enforced inside
*   login::Login() and login::verify_login(), not here.
*
* Data shape produced (one item in $data):
*   {
*     section_id          : string|int,
*     section_tipo        : string,
*     tipo                : string,
*     mode                : string,
*     lang                : string,
*     from_component_tipo : string,
*     value               : {}         // empty stdClass; placeholder for future login-page data
*   }
*
* Context shape (one dd_object in $context):
*   Produced by login::get_structure_context(). Includes properties:
*     login_items  : array of {tipo, model, label} — the child ontology nodes
*                    rendered as individual login form fields
*     info         : array of {type, label, value} — entity/version strings
*                    (and DB info on dev installs only; never exposed in production)
*     saml_config? : true — present only when SAML_CONFIG is defined,
*                    signals the client to render a SAML login button
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.login.php  login::get_structure_context(), login::Login()
* @see class.common.php common::get_json(), common::build_element_json_output()
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
/** @var login $this */
// JSON data controller



// configuration vars
// Unlike component JSON controllers, $permissions is unconditionally 1
// because the login form must be delivered to unauthenticated users.
// Authentication enforcement happens inside login::Login(), not here.
	$tipo			= $this->get_tipo();
	$permissions	= 1;
	$mode			= $this->get_mode();



// context
// Accumulates dd_object entries describing the login ontology structure.
// Contains exactly one entry when get_context is true; the entry carries
// the richer login-specific properties (login_items, info, saml_config).
	$context = [];

	if($options->get_context===true){

		// login structure context
		// Passes $permissions (always 1) so get_structure_context() can gate
		// any permission-sensitive properties. The second argument (add_rqo /
		// add_request_config) is false because the login form has no dataframe
		// and needs no embedded request_config in the payload.
			$context[] = $this->get_structure_context(
				$permissions,
				false // bool add_rqo
			);

	}//end if($options->get_context===true)



// data
// The login data item carries an empty stdClass as its value placeholder.
// No actual user data is resolved here; the login form is self-contained
// in the client. The $permissions > 0 guard is present for structural parity
// with other JSON controllers even though $permissions is always 1 above.
	$data = [];

	if($options->get_data===true && $permissions>0){

		$value = new stdClass();
			// $value->dedalo_application_langs = DEDALO_APPLICATION_LANGS;

		// data item
		// get_data_item() wraps $value with the standard envelope
		// {section_id, section_tipo, tipo, mode, lang, from_component_tipo, value}.
			$item  = $this->get_data_item($value);

		$data[] = $item;

	}// end if $permissions > 0



// JSON string
// Assemble the final response object {context: array, data: array} and
// return it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
