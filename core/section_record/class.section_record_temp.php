<?php declare(strict_types=1);
/**
* SECTION_RECORD_TEMP
* Subclass of section_record that routes all storage through the 'temp' PostgreSQL table
* instead of the section's normal matrix table.
*
* Purpose and use-cases:
* - Draft / pre-save editing: the Dédalo editing flow stages per-user unsaved changes in
*   the 'temp' table so that incomplete edits do not pollute the live matrix data.
*   Callers obtain an instance via section_record::get_instance($tipo, $id, true).
* - Per-user isolation: the 'temp' table keys rows by (section_tipo + user_id) via
*   matrix_temp_manager::get_uid(), so two editors working on the same section_tipo
*   never overwrite each other's draft data.
*
* Overridden behaviour vs. section_record:
* - __construct:        forces $data_handler to 'matrix_temp_manager' instead of the
*                       default 'matrix_db_manager'.
* - get_component_data: same signature as parent; included explicitly to ensure the
*                       correct handler is in play when load_data() is called.
* - save:              calls matrix_temp_manager::update() directly and intentionally
*                       skips save_event(), because temp records should not trigger
*                       cache invalidation for tool registrations, request-config presets,
*                       or any other production-system caches.
* - delete:            performs a lightweight removal: deletes the temp row, clears
*                       in-memory state, and removes the instance from the request cache.
*                       It does NOT take a Time Machine snapshot, remove inverse
*                       references, remove media files, or call diffusion_delete —
*                       none of those concepts apply to ephemeral draft data.
* - get_table:         always returns the string 'temp'.
*
* The $section_id stored in instances of this class is the same PK as the corresponding
* live record (or 0 when the record has never been saved).  It is used as part of the
* request-cache key ("{section_tipo}_{section_id}_temp") to avoid collisions with the
* normal section_record cached under "{section_tipo}_{section_id}".
*
* Instantiated exclusively by section_record::get_instance() when $is_temporal=true.
* Never instantiated directly; constructor is protected.
*
* @package Dédalo
* @subpackage Core
*/
class section_record_temp extends section_record {

	/**
	* __CONSTRUCT
	* Completes parent construction and then redirects the data handler.
	*
	* The parent constructor resolves the table and sets $data_handler based on the
	* ontology tipo.  This override immediately replaces that selection with
	* 'matrix_temp_manager' so every subsequent CRUD operation — read(), save(),
	* delete(), allocate_component_ids() — uses the temp-table schema (single 'key'
	* column + flat JSONB 'value') rather than the standard matrix column layout.
	*
	* @param string $section_tipo - ontology tipo of the section (e.g. "oh1")
	* @param int $section_id - record PK of the corresponding live record, or 0 for new
	*/
	protected function __construct( string $section_tipo, int $section_id ) {
		// Call parent constructor
		parent::__construct($section_tipo, $section_id);

		// Force the data handler to matrix_temp_manager
		// This overrides whatever the parent resolved (matrix_db_manager or
		// matrix_activity_db_manager) so that all storage goes to the 'temp' table.
		$this->data_handler = 'matrix_temp_manager';
	}

	/**
	* GET_COMPONENT_DATA
	* Returns the stored dato array for one component from the temp table.
	*
	* Delegates to load_data() (which calls read() → matrix_temp_manager::read())
	* and then to data_instance::get_key_data().  The override exists to make the
	* temp data handler the explicit entry point; without it the inherited parent
	* method would work identically, but having it here documents the intent and
	* guarantees the correct handler is active when loading.
	*
	* @param string $tipo - component ontology tipo (e.g. "oh25")
	* @param string $column - JSONB column name the component stores its data in
	*                         (e.g. "string", "relation", "date")
	* @return array|null - raw dato array as stored in the temp table, or null if absent
	*/
	public function get_component_data( string $tipo, string $column ) : ?array {
		// Load the DB data once
		$this->load_data();
		return $this->data_instance->get_key_data( $column, $tipo );
	}

	/**
	* SAVE
	* Persists the current in-memory data to the 'temp' table via an upsert.
	*
	* Calls matrix_temp_manager::update() which merges the full data object into the
	* JSONB 'value' column of the temp row (identified by section_tipo + logged user ID).
	*
	* Intentionally does NOT call save_event(): temp records are ephemeral drafts and
	* must never invalidate production-system caches (tool registrations, request-config
	* presets, etc.).  If those caches need refreshing, it will happen when the draft is
	* promoted to the live matrix table via the normal section_record::save() path.
	*
	* @return bool - true on successful upsert, false if matrix_temp_manager::update() fails
	*/
	public function save() : bool {
		$section_tipo = $this->section_tipo;
		$section_id = $this->section_id;

		$table = $this->get_table();
		$data = $this->data_instance->get_data();

		$result = matrix_temp_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$data
		);

		return $result;
	}

	/**
	* DELETE
	* Removes the draft record from the 'temp' table and clears all in-memory state.
	*
	* This is a deliberately lightweight delete compared to section_record::delete():
	*  - No Time Machine snapshot (temp data is ephemeral by definition).
	*  - No inverse-reference cleanup (temp records are not cross-linked by other components).
	*  - No media file removal (media is managed on the live matrix row, not its temp draft).
	*  - No diffusion_delete call (temp records are never published to external targets).
	*
	* On success:
	*  - record_in_the_database is set to false.
	*  - is_loaded_data is reset to false so any future access forces a re-read.
	*  - data_instance is unset to release memory.
	*  - The "_temp"-suffixed cache entry is removed from section_record_instances_cache
	*    so the next get_instance(…, true) call creates a fresh instance.
	*
	* The $delete_diffusion_records parameter is accepted for API compatibility with
	* the parent's signature but is never used here.
	*
	* @param bool $delete_diffusion_records [= true] - ignored; kept for signature compatibility
	* @return bool - true if the temp row was deleted (or did not exist), false on DB error
	*/
	public function delete( bool $delete_diffusion_records=true ) : bool {
		$section_tipo = $this->section_tipo;
		$section_id = $this->section_id;

		$table = $this->get_table();
		$result = matrix_temp_manager::delete(
			$table,
			$section_tipo,
			$section_id
		);

		if ($result) {
			$this->record_in_the_database = false;
			$this->is_loaded_data = false;
			unset($this->data_instance);

			// Remove the "_temp"-suffixed cache entry.
			// The normal (non-temp) instance cached under "{section_tipo}_{section_id}"
			// is intentionally left in place; it refers to the live matrix row, which
			// this delete does not touch.
			$cache_key = $section_tipo .'_' .$section_id . '_temp';
			section_record_instances_cache::delete($cache_key);
		}

		return $result;
	}


	/**
	* GET_TABLE
	* Returns the fixed table name used by all temp record operations.
	*
	* Overrides section_record::get_table() which returns the matrix table resolved
	* from the ontology tipo (e.g. "matrix_oh", "matrix_dd").  Temp records always
	* go to the shared 'temp' table regardless of the section_tipo, so this override
	* hard-codes the return value.
	*
	* @return string - always 'temp'
	*/
	public function get_table() : string {

		return 'temp';
	}//end get_table


}
