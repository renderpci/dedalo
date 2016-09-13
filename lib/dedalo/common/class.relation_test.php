<?php


class relation_test extends relation {
	


	/**
	* GET_PARENTS_RECURSIVE
	* @return array $parents_recursive
	*/
	public static function get_parents_recursive2( $locator, $is_recursion=false ) {
		
		$relation = new relation( $locator->section_id , $locator->section_tipo );
		$parents  = $relation->get_parents();		
		foreach ((array)$parents as $key => $current_locator) {
				#dump($current_locator, ' current_locator ++ '.to_string());
			
			# Get complete array of parents of current branch
			$current_parents = (array)self::get_recursive_branch( $current_locator );
				#dump($current_parents, ' parents ++ '.to_string($locator->section_id .'-'. $locator->section_tipo));

			foreach ($current_parents as $pkey => $current_parent) {

				# fold previous parent as current locator children
				$current_parent->childrens = isset($current_parents[$pkey-1]) ? array($current_parents[$pkey-1]) : array();

				if($current_parent == reset($current_parents)) {

					# add self requested locator 
					$current_locator->childrens= array($locator);

					# add first direct children at last position
					$current_parent->childrens = array($current_locator);
				}
			}			
			#dump($current_parents, ' parents ++ '.to_string());			

			$full_tree = end($current_parents);
				#dump($full_tree, ' full_tree ++ '.to_string());

			$parents_recursive[] = $full_tree;

		}//end foreach ($ar_parents as $current_locator) {

		return $parents_recursive;
	}//end get_parents_recursive



	/**
	* GET_RECURSIVE_BRANCH
	* @return 
	*/
	public static function get_recursive_branch( $locator, $result=array() ) {
		
		$relation = new relation( $locator->section_id , $locator->section_tipo );
		$parents  = $relation->get_parents();

		foreach ((array)$parents as $key => $current_locator) {
				
			$result[] 	= $current_locator; // Add first term
			$result 	= self::get_recursive_branch( $current_locator, $result );
			
		}//end foreach ($ar_parents as $current_locator) {

		return $result;
	}//end get_recursive_branch




}