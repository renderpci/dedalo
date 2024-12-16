<?php declare(strict_types=1);
/**
* AREA_ONTOLOGY
* Manage whole ontology hierarchy
*
*/
class area_ontology extends area_thesaurus {



	/**
	* CLASS VARS
	* @var
	*/



	/**
	* GET_hierarchy_section_tipo
	* @return string $section_tipo
	*/
	public function get_hierarchy_section_tipo() : string {

		$hierarchy_section_tipo = DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';

		return $hierarchy_section_tipo;
	}//end get_hierarchy_section_tipo



	/**
	* GET_MAIN_TABLE
	* @return string
	*/
	public function get_main_table() {

		return ontology::$main_table; // 'matrix_ontology_main'
	}//end get_main_table



}//end area_ontology
