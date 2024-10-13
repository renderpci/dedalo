<?php
// ontology custom config file
require_once( dirname(__FILE__) .'/ontology_legacy_setup.php');



/**
* LOGIN
*/
$is_logged	= login::is_logged();

if($is_logged!==true) {
	// $url =  DEDALO_ROOT_WEB ;//."/main/";
	// header("Location: $url");
	echo 'Please login';
	exit();
}
$is_global_admin = security::is_global_admin(CURRENT_LOGGED_USED_ID);

if($is_global_admin!==true) {
	// $url =  DEDALO_ROOT_WEB ;//."/main/";
	// header("Location: $url");
	echo 'Only admins are allowed to enter here';
	exit();
}


// excute
print_children_recursive();



/**
* PRINT_CHILDREN_RECURSIVE
* Prints given term recursive children in given langs
*/
function print_children_recursive() {

	echo '<pre>';

	echo '<b>print_children_recursive</b>. Prints given term recursive children in given langs. Column separator is \t and line separator is \n'.PHP_EOL;
	echo '<hr>';
	echo 'Available url vars:'.PHP_EOL;
	echo 'string tipo (sample: dd3)'.PHP_EOL;
	echo 'string lang (sample: lg-spa,lg-eng)'.PHP_EOL;
	echo '<hr>';

	// term_id (tipo)
		$term_id = $_GET['tipo'] ?? 'dd3'; // diffusion

	// children recursive
		$ar_tipo = RecordObj_dd_edit::get_ar_recursive_childrens(
			$term_id,
			$is_recursion=false,
			$ar_exclude_models=false,
			$order_by=null
		);

		// echo json_encode($ar_tipo, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE);
		// echo implode("\n", $ar_tipo);
		// echo '<hr>';

	// ar_langs
		$req_langs = $_GET['lang'] ?? $_GET['ar_langs'] ?? null;
		$ar_langs = isset($req_langs)
			? explode(',', $req_langs)
			: ['lg-spa','lg-eng','lg-cat','lg-ita','lg-fra','lg-ell'];

	// info
		echo 'tipo: '.json_encode($term_id);
		echo '<hr>';
		echo 'ar_langs: '.json_encode($ar_langs);
		echo '<hr>';
		echo 'total: '.count($ar_tipo);
		echo '<hr>';

	$ar_term = [];
	foreach ($ar_tipo as $current_tipo) {

		$lang_terms = [];
		foreach ($ar_langs as $lang) {

			// term. resolve term from descriptors
				$term = RecordObj_dd_edit::get_termino_by_tipo(
					$current_tipo, // string $terminoID
					$lang, // string $lang=null
					false, // bool $from_cache=false
					false // bool $fallback=true
				);

			// escape
				// if (!empty($term)) {
				// 	$term = str_replace('"', '""', $term);
				// }

			$lang_terms[] = $term;
		}

		// mix line
		$ar_term[] = $current_tipo."\t".implode("\t", $lang_terms);
	}

	echo implode("\n", $ar_term);

	echo '</pre>';
}//end print_children_recursive
