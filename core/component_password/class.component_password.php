<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PASSWORD
* Manages password storage with secure hashing in Dédalo.
*
* Stores user passwords using one-way Argon2id hashing for security.
* Legacy AES-encrypted passwords are migrated to Argon2id on the next
* successful login via lazy upgrade in login::Login().
*
* Key security features:
* - Argon2id one-way hashing (non-reversible)
* - Fake value display in grids and exports to prevent password exposure
* - Lazy migration from legacy AES encryption
* - Hash values persisted verbatim for export/import compatibility
*
* Display behavior:
* - Grid views show fake_value: '****************'
* - Diffusion exports return fake_value instead of actual hash
* - Raw hash values never exposed in user-facing contexts
*
* Data is stored in the 'string' column of matrix tables.
*
* Extends component_common for standard component functionality.
*
* @package Dédalo
* @subpackage Core
*/
class component_password extends component_common {



	// string . Fake value to show in grid

	public string $fake_value = '****************';



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component_common method
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		return $this->fake_value;
	}//end get_diffusion_value



	/**
	* SET_DATA
	* Overwrite component_common method.
	*
	* SEC-001/002/007: passwords are now stored as one-way Argon2id hashes via
	* {@see hash_password()} instead of the legacy reversible AES blob produced
	* by {@see encrypt_password()}. Existing legacy values are migrated lazily
	* on the next successful login (see `login::Login()`).
	*
	* If the supplied value is already a stored hash (legacy AES blob OR
	* `password_hash()` output) it is persisted verbatim. This preserves the
	* admin's ability to round-trip data export/import, and is also what the
	* lazy-upgrade path in `login::Login()` relies on when it re-saves the
	* freshly hashed value.
	*
	* @param ?array $data
	* @return bool
	*/
	public function set_data( ?array $data ) : bool {

		// Normalize data to objects if it's not already
		// This is required before calling is_empty_data as it eventually calls is_empty(?object $data_item)
		if (is_array($data)) {
			foreach ($data as &$element) {
				if (!is_object($element) && $element !== null) {
					$new_element        = new stdClass();
					$new_element->value = $element;
					$element            = $new_element;
				}
			}
		}

		if ($this->is_empty_data($data)) {
			return parent::set_data(null);
		}

		$safe_data = [];
		foreach ($data as $data_element) {

			// At this point data_element is guaranteed to be an object due to normalization above
			$safe_data_element = clone $data_element;
			$value_to_store   = (string)($data_element->value ?? '');

			// SEC-001: hash with Argon2id unless the caller has already supplied a
			// stored credential (legacy AES blob or modern hash). This is detected
			// by self::is_stored_credential() which is intentionally conservative.
			if ($value_to_store !== '' && !self::is_stored_credential($value_to_store)) {
				$value_to_store = self::hash_password($value_to_store);
			}

			$safe_data_element->value = $value_to_store;

			$safe_data[] = $safe_data_element;
		}

		return parent::set_data($safe_data);
	}//end set_data



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_data().
	* overwrite in every different specific component
	* Some the text components can set the value with the data directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? ',';
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// short vars
			$label		= $this->get_label();
			$properties	= $this->get_properties();

		// data
			$data = [
				(object)[
					'value' => $this->fake_value
				]
			];

		// flat_value (array of one value full resolved)
			$flat_value = empty($data)
				? []
				: [implode( $records_separator, array_column($data, 'value') )];

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// dd_grid_cell_object
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($flat_value);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* ENCRYPT_PASSWORD
	*
	* @deprecated SEC-001/002/007: this is the legacy reversible AES helper. New
	* passwords are stored as Argon2id hashes via {@see hash_password()}. This
	* method is kept ONLY so the lazy-upgrade login path can recompute legacy
	* values for comparison; do not call it from new code.
	*
	* @param string $string_value
	* @return string
	*/
	public static function encrypt_password(string $string_value) : string {

		return dedalo_encrypt_openssl(
			$string_value,
			DEDALO_INFORMATION
		);
	}//end encrypt_password



	/**
	* HASH_PASSWORD
	* Produce a one-way password hash suitable for storage.
	*
	* SEC-001: uses Argon2id (memory-hard, side-channel resistant). Each call
	* produces a distinct hash because password_hash() incorporates a random
	* salt; do not use the output for equality checks, always compare via
	* {@see verify_password()} / `password_verify()`.
	*
	* @param string $plaintext
	* @return string Hash including algorithm identifier (e.g. `$argon2id$...`).
	*/
	public static function hash_password(string $plaintext) : string {

		return password_hash($plaintext, PASSWORD_ARGON2ID);
	}//end hash_password



	/**
	* IS_STORED_CREDENTIAL
	* Heuristic that returns true when the given string is already a stored
	* credential (modern Argon2id/bcrypt hash OR legacy AES blob) and therefore
	* must not be re-hashed by set_data(). This is intentionally permissive on
	* the legacy side (anything base64-decodable to a non-trivial blob) so we
	* never accidentally double-hash a legacy value during data import.
	*
	* @param string $value
	* @return bool
	*/
	public static function is_stored_credential(string $value) : bool {

		if ($value === '') {
			return false;
		}
		// Modern hash sentinels produced by password_hash().
		if (strncmp($value, '$argon2', 7) === 0
			|| strncmp($value, '$2y$', 4) === 0
			|| strncmp($value, '$2a$', 4) === 0
			|| strncmp($value, '$2b$', 4) === 0
		) {
			return true;
		}
		// Legacy AES blob: base64-encoded ciphertext. Real plaintext passwords
		// (which contain mixed punctuation) almost never satisfy a strict
		// base64 round-trip, so this gate is reliable in practice.
		if (preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $value) === 1
			&& strlen($value) >= 24
		) {
			$decoded = base64_decode($value, true);
			if ($decoded !== false && strlen($decoded) >= 16) {
				return true;
			}
		}
		return false;
	}//end is_stored_credential



	/**
	* IS_LEGACY_HASH
	* @param string $stored
	* @return bool True when $stored looks like the legacy reversible AES blob.
	*/
	public static function is_legacy_hash(string $stored) : bool {

		if ($stored === '') {
			return false;
		}
		if (strncmp($stored, '$argon2', 7) === 0
			|| strncmp($stored, '$2y$', 4) === 0
			|| strncmp($stored, '$2a$', 4) === 0
			|| strncmp($stored, '$2b$', 4) === 0
		) {
			return false;
		}
		return true;
	}//end is_legacy_hash



	/**
	* VERIFY_PASSWORD
	* Constant-time check of a plaintext attempt against a stored credential.
	*
	* Supports both storage formats during the SEC-001 migration window:
	*  - Modern: Argon2id (or bcrypt) hash → verified with password_verify().
	*  - Legacy: reversible AES blob → recompute via {@see encrypt_password()}
	*    and compare with hash_equals(). On legacy success the caller is told
	*    to rehash via the second tuple element.
	*
	* @param string $plaintext
	* @param string $stored
	* @return array{0: bool, 1: bool} Tuple of (verified, needs_rehash).
	*/
	public static function verify_password(string $plaintext, string $stored) : array {

		if ($plaintext === '' || $stored === '') {
			return [false, false];
		}

		if (!self::is_legacy_hash($stored)) {
			// Modern Argon2id / bcrypt path.
			$ok           = password_verify($plaintext, $stored);
			$needs_rehash = $ok && password_needs_rehash($stored, PASSWORD_ARGON2ID);
			return [$ok, $needs_rehash];
		}

		// Legacy AES blob: recompute deterministically and compare.
		$candidate = self::encrypt_password($plaintext);
		$ok = hash_equals($stored, $candidate);
		return [$ok, $ok]; // any successful legacy verification triggers rehash.
	}//end verify_password







	/**
	* UPDATE_DATA_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id ?? '';

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	 * GET_V6_ROOT_PASSWORD_DATA
	 * PROVISIONAL! TO BE USED IN THE V6 TO V7 TRANSITION
	 * REMOVE IT IN VERSIONS > 7.0.0
	 * @return string|null $data
	 */
	public function get_v6_root_password_data() : ?string {

		// If the 'datos' column does not exist, it means the migration is complete and we can no longer use this method
		if (!DBi::check_column_exists('matrix_users', 'datos')) {
			return null;
		}

		$sql_query = "
			SELECT datos->'components'->'dd133'->'dato'->'lg-nolan'->>0
			FROM \"matrix_users\"
			WHERE \"section_id\" = '-1'
			LIMIT 1;
		";

		$result = matrix_db_manager::exec_sql($sql_query);

		if ($result && pg_num_rows($result) > 0) {
			$data = pg_fetch_result($result, 0, 0);
			return is_string($data) ? $data : null;
		}

		return null;
	}//end get_v6_root_password_data



}//end class component_password
