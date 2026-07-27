<?php declare(strict_types=1);
/**
* RELATION_LIST_JSON
* JSON response controller for the relation_list element.
*
* This file is included (not directly executed) by common::get_json() inside
* the calling relation_list object's scope. It acts as the view layer that
* decides which data to return based on the current mode and the caller's
* permissions.
*
* Responsibilities:
* - Extract configuration variables from $this (the enclosing relation_list instance).
* - Guard against insufficient permissions (permissions <= 0 returns an empty shell).
* - In 'edit' mode: resolve inverse references via get_inverse_references(), then
*   either return the raw count result or the formatted context+data object built
*   by get_relation_list_obj().
*
* Output shape (non-count path):
*   {
*     context : [ { section_tipo, section_label, component_tipo, component_label }, ... ],
*     data    : [ { section_tipo, section_id, component_tipo, value }, ... ]
*   }
*
* The output is produced by common::build_element_json_output() and is consumed
* by the client-side relation_list JS renderer.
*
* @package Dédalo
* @subpackage Core
*
* @see relation_list::get_json()        — the entry point that includes this file
* @see relation_list::get_inverse_references() — builds the raw locator list
* @see relation_list::get_relation_list_obj()  — formats the final context+data object
* @see common::build_element_json_output()     — wraps context/data arrays into stdClass
*/

// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var relation_list $this */



// configuration vars
// Extract all needed properties from the enclosing relation_list instance up
// front so the logic below reads cleanly. $sqo carries the Search Query Object
// pre-built by the caller (typically from API request parameters).
	$tipo			= $this->tipo;
	$section_tipo	= $this->section_tipo;
	$section_id		= $this->section_id;
	$mode			= $this->mode;
	$sqo			= $this->sqo;
	$count			= $this->count;
	$permissions	= common::get_permissions($section_tipo, $tipo);
	$file_name		= $mode;

// default value empty
// Returns a valid but empty context+data shell so callers never receive null.
	$json = common::build_element_json_output([], []);

// calculated value based on permissions and mode
// Only compute data when the current user has at least read access (>0).
// A permissions value of 0 means no access; the empty $json shell is returned.
	if($permissions>0) {

		switch($mode) {

			case 'edit':
				$ar_inverse_references 	= $this->get_inverse_references($sqo);

				// note that result is already an object with properties context and data
				// When $count is true the caller only needs the raw inverse-reference
				// result (e.g. for a pagination total) — skip the heavier formatting pass.
				$json = ($count===true)
					? $ar_inverse_references
					: $this->get_relation_list_obj($ar_inverse_references);
				break;
		}
	}

return $json;
