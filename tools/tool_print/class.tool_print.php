<?php declare(strict_types=1);
/**
* CLASS TOOL_PRINT
*
* Visual print-layout tool. The client editor (js/) lets the user drag a
* section's components onto printable pages, position/resize them freely and
* save reusable layout templates per section_tipo. Templates are persisted as
* ordinary section records (see js/print_layout_presets.js) through the generic
* core data API, so this PHP class needs NO write actions for the browser-print
* MVP — it exists so the tool registers (dd1324) and as the home for the
* phase-2 server-side PDF generator.
*
* CONTRACT (see tool_dev_template for the canonical reference)
* - extends tool_common, named exactly like its directory.
* - every remotely callable method is public static, takes a single
*   `object $options` and returns an object {result, msg, errors}.
* - every remotely callable method MUST be listed in API_ACTIONS (SEC-024)
*   with the permission gate the framework enforces before dispatch.
*
* @see tools/tool_print/js/print_layout_presets.js  (client persistence)
* @see tools/tool_dev_template/class.tool_dev_template.php  (template)
*/
class tool_print extends tool_common {



	/**
	* SEC-024: allowlist of methods callable via dd_tools_api::tool_request.
	* Empty in the browser-print MVP: saving/loading/listing/deleting layout
	* templates is done client-side via the generic core data actions
	* (create/save/search/delete), each already permission- and scope-checked
	* by the core API. The phase-2 server PDF generator will add:
	*   'generate_pdf' => ['permission' => 'record', 'min_level' => 1]
	*/
	public const API_ACTIONS = [];

	/**
	* Methods the CLI background runner (process_runner.php) may execute when
	* called with `background: true`. Empty until phase-2 PDF generation.
	*/
	public const BACKGROUND_RUNNABLE = [];



	// ---------------------------------------------------------------------
	// PHASE 2 (server-side PDF) — sketch, kept commented until implemented.
	//
	// Reads the saved layout blob and the record data server-side and renders
	// a PDF positioned by the layout's millimetre geometry. Values must be read
	// through the same atoms export contract the browser/export use
	// (component_common::get_export_value/get_value) so PDF and browser output
	// stay consistent. Read-only against the DB (Bun owns MariaDB; no bespoke
	// tables). Add 'generate_pdf' to API_ACTIONS with the 'record'/level-1 gate.
	//
	// public static function generate_pdf(object $options) : object {
	//
	//     $response = new stdClass();
	//         $response->result = false;
	//         $response->msg    = 'Error. Request failed ['.__FUNCTION__.']';
	//         $response->errors = [];
	//
	//     $section_tipo        = $options->section_tipo ?? null;
	//     $section_id          = $options->section_id ?? null;
	//     $template_section_id = $options->template_section_id ?? null;
	//
	//     // defense in depth (the CLI background path skips dd_tools_api)
	//     if (isset($section_id)) {
	//         security::assert_record_in_user_scope(
	//             $section_tipo, (int)$section_id, __METHOD__
	//         );
	//     }
	//
	//     // 1. read the layout blob from the print-layouts section (component_json)
	//     // 2. validate $layout->target_section_tipo === $section_tipo
	//     // 3. per box: component_common::get_instance(...)->get_value()
	//     // 4. position by box mm geometry into a PDF engine (TCPDF/mPDF), one
	//     //    PDF page per layout page; repeat per record id in scope.
	//
	//     return $response;
	// }//end generate_pdf



}//end class tool_print
