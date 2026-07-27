<?php declare(strict_types=1);
/**
* TRAIT SELECT
* Builds the SQL SELECT clause for the Dédalo matrix search engine.
*
* This trait is mixed into the `search` class (and its subclasses) by
* `class.search.php`. It owns the single entry-point
* `build_sql_query_select()`, which writes to `$this->sql_obj->select[]`
* — the accumulator that `parse_sql_query()` later joins into the final
* SQL string.
*
* Responsibilities:
* - Always emit `section_id` and `section_tipo` as mandatory leading columns.
* - Support the `full_count` shortcut (replaces all columns with a single
*   `count(DISTINCT …) as full_count` expression and returns early).
* - Apply DISTINCT ON when `$sqo->remove_distinct` is false (the default);
*   omit it when multiple section tipos share a UNION or when the thesaurus
*   search explicitly sets `remove_distinct = true`.
* - Fall back to all ten matrix JSONB columns when `$sqo->select` is null.
* - Validate every client-supplied `column` and `key` value through the
*   security allowlist helpers (`search::is_valid_data_column()` and
*   `search::is_valid_tipo()`) before interpolating them verbatim into SQL,
*   because JSONB key paths cannot be parameterized.
* - Build the JSONB sub-key arrow operator (`column->'key' as key`) for
*   select objects that carry an ontology `key` (tipo).
*
* Data shapes managed:
*   select_object: stdClass { column: string, key?: string|null }
*     column — one of the allowed matrix column names (data, relation,
*              string, date, iri, geo, number, media, misc, meta, …).
*     key    — an ontology tipo (e.g. 'oh62') used as a JSONB key to
*              extract a single component's data from the JSONB column,
*              aliased back to the tipo name in the result row.
*
* Relationships:
*   - Mixed into: search (class.search.php)
*   - Overridden by: search_tm::build_sql_query_select() for time-machine mode
*   - Consumers: search::parse_sql_query() assembles $sql_obj->select into
*     the SQL SELECT list after this method populates it.
*   - Security helpers: search::is_valid_data_column(), search::is_valid_tipo()
*     (defined in trait.utils.php)
*
* @package Dédalo
* @subpackage Core
*/
trait select {



	/**
	* BUILD_SQL_QUERY_SELECT
	* Populates $this->sql_obj->select[] with every column expression that
	* belongs in the SQL SELECT list for the current SQO.
	*
	* The method handles four distinct cases in order:
	*
	* 1. full_count shortcut — when $sqo->full_count is true the caller only
	*    needs the total number of matching rows. A single
	*    `count(DISTINCT alias.section_id) as full_count` expression is
	*    appended and the method returns immediately; no data columns are added.
	*
	* 2. section_id — always required; wrapped in `DISTINCT ON (…)` unless
	*    $sqo->remove_distinct is true (thesaurus multi-section searches or
	*    explicit caller request).
	*
	* 3. section_tipo — always required; identifies which section the row
	*    belongs to when the result set covers multiple section tipos.
	*
	* 4. Data columns — each select_object in $sqo->select produces one SQL
	*    expression. If $sqo->select is null the method substitutes a default
	*    covering all ten matrix JSONB columns (data, relation, string, date,
	*    iri, geo, number, media, misc, meta). When a select_object carries a
	*    key (ontology tipo), the expression becomes
	*    `alias.column->'key' as key` to extract a single component's data
	*    via the PostgreSQL JSONB arrow operator; otherwise the whole column is
	*    selected as-is.
	*
	* Security: $column and $key are interpolated verbatim into the SQL string
	* because PostgreSQL does not allow parameterized column or JSONB-key
	* identifiers. Both values are validated through allowlist helpers before
	* use; invalid values are logged and skipped.
	*
	* Side effects: mutates $this->sql_obj->select[] and, when $sqo->select is
	* null, also writes a default array back to $this->sqo->select.
	*
	* @return void
	*/
	public function build_sql_query_select() : void {

		$sqo = $this->sqo;

		// full_count shortcut
		// When the caller only needs a record count (pagination totals, etc.) the
		// SQO sets full_count=true. A single aggregate expression is enough;
		// adding data columns would be wasteful and structurally wrong here because
		// parse_sql_full_count() wraps this output in its own outer COUNT(*) query.
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

		// section_tipo
		// Mandatory in every sentence
		$this->sql_obj->select[] = $this->main_section_tipo_alias.'.section_tipo';

		// Select fallback to all matrix columns when $sqo->select is unset (null)
		// Set the default with all columns
		$select = $sqo->select ?? null;
		if ( $select === null ) {
			// Default covering set: ten JSONB matrix columns (data through meta).
			// Note: section_record_data::$columns_name also includes 'relation_search',
			// which is intentionally omitted from the default select projection.
			// This default is what most list/edit mode searches need when no explicit
			// column projection was requested.
			$sqo->select = [
				(object)['column' => 'data'],
				(object)['column' => 'relation'],
				(object)['column' => 'string'],
				(object)['column' => 'date'],
				(object)['column' => 'iri'],
				(object)['column' => 'geo'],
				(object)['column' => 'number'],
				(object)['column' => 'media'],
				(object)['column' => 'misc'],
				(object)['column' => 'meta']
			];
		}

		// Set all select sentences for every column
		foreach ($sqo->select as $select_object) {

			$key	= $select_object->key ?? null;
			$column	= $select_object->column;

			// section_id and section_tipo is mandatory
			// When it is set doesn't include again.
			if( $column==='section_id' || $column==='section_tipo' ){
				continue;
			}

			// Security: $column and $key come from the client SQO and are interpolated
			// verbatim ($column as a column identifier, $key as a JSONB key inside quotes),
			// neither of which can be parameterized. Validate before use and skip on failure.
			if( !search::is_valid_data_column((string)$column) ){
				debug_log(__METHOD__
					." Skipped select with invalid column: " . to_string($column)
					, logger::ERROR
				);
				continue;
			}
			if( !empty($key) && !search::is_valid_tipo((string)$key) ){
				debug_log(__METHOD__
					." Skipped select with invalid key (not a tipo): " . to_string($key)
					, logger::ERROR
				);
				continue;
			}

			// Create the select for every column
			// if the definition has key (as ontology tipo) it will be added
			$sentence = $this->main_section_tipo_alias.'.'.$column; // matrix.section_id

			// key add as alias
			// When a key (tipo) is provided the JSONB arrow operator extracts just that
			// component's sub-object from the column, and the result is aliased to the tipo
			// so the PHP layer can address it by name without knowing the column it came from.
			if( !empty($key) ){
				$sentence .= '->'.'\''.$key.'\''; // matrix.section_id->'oh62'
				$sentence .= ' as '.$key; // DISTINCT ON (matrix.section_id) matrix.section_id as oh62
			}

			$this->sql_obj->select[] = $sentence;
		}
	}//end build_sql_query_select



}//end select
