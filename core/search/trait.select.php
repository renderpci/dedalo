<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT SELECT
*
*/
trait select {



	/**
	* BUILD_SQL_QUERY_SELECT
	* select_object sample:
	* {
	* 	"column" : "relation" string column name
	* 	"key": "oh25" string|null component tipo
	* }
	* @return void
	*/
	public function build_sql_query_select() : void {

		$sqo = $this->sqo;

		// Unique column for count
		// If the SQO has active full_count set the SELECT with specific count for the section_id column
		if ( isset($sqo->full_count) && $sqo->full_count===true ) {
			$this->sql_obj->select[] = 'count(DISTINCT '.$this->main_section_tipo_alias.'.section_id) as full_count';
			return;
		}

		// section_id
		// Mandatory in every sentence
		// By default is used with a DISTINCT clause. But, thesaurus search needs to remove it because search across multiple sections.
		$this->sql_obj->select[] = ($sqo->remove_distinct===true)
			? $this->main_section_tipo_alias.'.section_id'
			: 'DISTINCT ON ('.$this->main_section_tipo_alias.'.section_id) '.$this->main_section_tipo_alias.'.section_id';

		// Select fallback to all matrix columns when $sqo->select is empty or unset
		// Set the default with all columns
		if ( empty($sqo->select) ) {
			$sqo->select = [
				(object)['column' => 'section_tipo'],
				(object)['column' => 'data'],
				(object)['column' => 'relation'],
				(object)['column' => 'string'],
				(object)['column' => 'date'],
				(object)['column' => 'iri'],
				(object)['column' => 'geo'],
				(object)['column' => 'number'],
				(object)['column' => 'media'],
				(object)['column' => 'misc'],
				(object)['column' => 'relation_search'],
				(object)['column' => 'meta']
			];
		}

		// Set all select sentences for every column
		foreach ($sqo->select as $select_object) {

			$key	= $select_object->key ?? null;
			$column	= $select_object->column;

			// section_id is mandatory
			// When it is set doesn't include again.
			if( $column==='section_id' ){
				continue;
			}

			// Create the select for every column
			// if the definition has key (as ontology tipo) it will be added
			$sentence = $this->main_section_tipo_alias.'.'.$column; // matrix.section_id

			// key add as alias
			if( !empty($key) ){
				$sentence .= ' as '.$key; // DISTINCT ON (matrix.section_id) matrix.section_id as oh62
			}

			$this->sql_obj->select[] = $sentence;
		}

		// Add order columns sentences
 		if ( !empty($this->order_columns) ) {
			foreach ($this->order_columns as $sentence) {
				$this->sql_obj->select[] = $sentence;
			}
		}
	}//end build_sql_query_select


}//end select