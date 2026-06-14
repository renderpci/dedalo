<?php declare(strict_types=1);
/**
* MARC21_VARS
* MARC21-to-Dédalo tipo mapping for the mdcat widget's import configuration.
*
* This file is included (not autoloaded) by the mdcat widget whenever it needs
* a symbolic name → ontology-tipo translation table for MARC21 field processing.
* Each property on $marc21_vars is a named alias ('custom_var1', 'custom_var2', …)
* whose value is the Dédalo component tipo string that the MARC21 import should
* write into.
*
* The guard block (isset check) prevents overwriting the object when the file is
* included more than once in the same request.
*
* Convention: values are mdcat-prefixed tipos belonging to the mdcat ontology
* namespace; the 'custom_var' names are generic placeholders whose semantics are
* defined by each mdcat installation's widget configuration.
*
* Related: tools/tool_import_marc21/class.tool_import_marc21.php (consumer),
*          tools/tool_import_marc21/sample_config.json (field-to-tipo mapping reference).
*
* @package Dédalo
* @subpackage Core
*/
if (!isset($marc21_vars)) {
	$marc21_vars = new stdClass();
}

	// custom_var1
	// Named alias for the target component tipo that receives the primary custom
	// MARC21 field value in the mdcat widget import. The tipo 'mdcat159' is the
	// ontology node for this installation's first custom variable slot.
	$marc21_vars->custom_var1 		= 'mdcat159';
