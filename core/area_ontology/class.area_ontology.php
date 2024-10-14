<?php
declare(strict_types=1);
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

		$hierarchy_section_tipo = 'ontology35';

		return $hierarchy_section_tipo;
	}//end get_hierarchy_section_tipo



}//end area_ontology
