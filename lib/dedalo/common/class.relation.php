<?php
/*
* CLASS RELATION
* Manage relations between sections
*/


class relation {

	# object section
	public $section;
	# array relations_locators
	public $relations_locators;
	# array childrens
	public $childrens;


	/**
	* __CONSTRUCT
	* @return 
	*/
	public function __construct( $section_id , $section_tipo ) {
		
		# Create and fix current section
		$this->section = section::get_instance($section_id, $section_tipo);



	}//end __construct



	/**
	* GET_RELATION_LOCATORS
	* @return 
	*/
	public function get_relation_locators() {
		$relations_locators = array();
			#dump($this->relations_locators = (array)$this->section->get_relations(), ' var ++ '.to_string());
		$ar_locators = (array)$this->section->get_relations();
		foreach ($ar_locators as $value) {
			$relations_locators[] = clone $value; // Avoid modify original locator
		}
		#$this->relations_locators = $relations_locators;
		return $this->relations_locators = $relations_locators;
	}//end get_relation_locators



	/**
	* GET_PARENTS
	* @return array $parents
	*/
	public function get_parents() {
		$parents = array();

		$relations_locators = $this->get_relation_locators();		#dump($relations_locators, ' relations_locators ++ '.to_string());
		foreach ($relations_locators as $locator) {
			if ($locator->type===DEDALO_RELATION_TYPE_PARENT_TIPO) {
				$parents[] = $locator;
			}
		}

		return $this->parents = (array)$parents;
	}//end get_childrens



	/**
	* GET_PARENTS_RECURSIVE
	* @return array $parents_recursive
	*/
	public static function get_parents_recursive( $locator, $final2=array(), $recursive=false, $final=array() ){
		
		$relation = new relation( $locator->section_id , $locator->section_tipo );
		$parents  = $relation->get_parents();
		foreach ($parents as $key => $current_locator) {			

			$current_locator->childrens[] = $locator;

			$final[] = $current_locator;		
			
			if($recursive===true){
				$final2 = self::get_parents_recursive($current_locator, $final, true);
				if($key > 0){
					$final2[] = self::get_parents_recursive($current_locator, $final, true);
				}		
			}else{
				$a = self::get_parents_recursive($current_locator, $final, true);
				#$final2[] = self::get_parents_recursive($current_locator, $final, true);
				$final2[] = reset($a);
			}		
			
		}//end foreach ($ar_parents as $current_locator) {

		return $final2;
	}//end get_parents_recursive


	/**
	* GET_CHILDRENS
	* @return array $childrens
	*/
	public function get_childrens() {
		$childrens = array();

		$relations_locators = $this->get_relation_locators();
		foreach ($relations_locators as $locator) {
			if ($locator->type===DEDALO_RELATION_TYPE_CHILDREN_TIPO) {
				$childrens[] = $locator;
			}
		}

		return $this->childrens = (array)$childrens;
	}//end get_childrens



}//end relation
?>