<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/**
* SECTION JSON CONTROLLER
* Assembles the standard {context, data} API response for a section element.
*
* This file is the JSON controller for the `section` model. It is never invoked
* directly by a web request; it is `include`d by `common::get_json()` inside the
* calling `section` object scope. On entry `$this` refers to the `section`
* instance, and `$options` (a stdClass normalised by `get_json()`) is available
* in the local variable table.
*
* Responsibilities:
* - Resolve the caller's permission level for this section.
* - Build the section's full structure context (with request_config attached)
*   and add it as the first item of the context array.
* - Expand all section_record locators stored in `$this->section_records` into
*   their child component data via `get_subdatum`, then merge the resulting
*   sub-contexts (deduplicating against the already-added section context) and
*   collect each sub-data item.
* - Return the envelope object built by `common::build_element_json_output()`.
*
* Key differences from component *_json.php controllers:
* - Does NOT gate on `$options->get_context` / `$options->get_data` flags.
*   A section response always includes both context and data when the caller
*   has permission (permissions > 0).  The flags are defined by get_json() but
*   section_json intentionally ignores them.
* - `get_structure_context()` is called with `add_rqo = true` so the
*   request_config tree is embedded in the section context; this is required for
*   `get_subdatum()` to iterate child DDOs correctly.
*
* Scope contract (variables available on entry via the include scope):
*   @var section   $this     The section instance being serialised.
*   @var stdClass  $options  Normalised options from common::get_json():
*                              - get_context (bool)        — not used here (see above)
*                              - context_type (string)     — not used here
*                              - get_data (bool)           — not used here (see above)
*                              - get_request_config (bool) — not used here
*
* @package Dédalo
* @subpackage Core
*/



// configuration vars
	$tipo			= $this->get_tipo();
	$mode			= $this->get_mode();
	$permissions	= $this->get_section_permissions();

	$context	= [];
	$data		= [];

	if($permissions>0){

		// Context

		// build_section_context
		// `add_rqo = true` embeds the request_config tree into the returned
		// dd_object so that get_subdatum() can walk the child DDO list.
		// The result is also cached on $this->context for get_subdatum()'s
		// internal reference (see common::get_subdatum — it reads $this->context).
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_rqo
		);
		$context[] = $this->context;

		// Data

		// section_records_as_locators
		// $this->section_records is an array of section_record instances keyed
		// by section_id. It is populated during search/list resolution and acts
		// as the locator list that get_subdatum() fans out into component data.
		$value = $this->section_records;

		// subdata add
		// Note: a 'skip_subdatum' option was passed here historically but was never
		// implemented by get_subdatum; removed to avoid a false affordance.
		$subdatum = $this->get_subdatum($tipo, $value);

		// subcontext add. get_subdatum already dedups internally; guard here against
		// items colliding with the already-added section context (tipo+section_tipo+mode)
		$context = common::merge_unique_context($context, $subdatum->context);

		$ar_subdata	= $subdatum->data;
		foreach ($ar_subdata as $sub_value) {
			$data[] = $sub_value;
		}

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
