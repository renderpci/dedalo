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



	/**
	* Placeholder shown in grid/list views and diffusion exports instead of the real credential.
	* Prevents password hashes (or legacy ciphertext) from leaking into UI responses or downstream
	* diffusion pipelines that would render the value in a public-facing context.
	* The component_password_json.php controller reads this property directly when building the
	* data payload; it intentionally never calls get_data() in the password flow.
	* @var string $fake_value
	*/
	public string $fake_value = '****************';



	/**
	* __CONSTRUCT
	* Initialises the component with the language forced to DEDALO_DATA_NOLAN (language-neutral),
	* ignoring whatever $lang the caller supplies. Passwords are never language-specific; storing
	* them under a language key would create orphan rows during language iteration and make
	* verification impossible when the session language changes.
	*
	* The $mode default is overridden to 'list' (rather than the base class 'edit') because
	* passwords are almost always read in read-only contexts; callers that need to write must
	* pass 'edit' explicitly.
	*
	* @param string $tipo - Ontology tipo of the component (e.g. DEDALO_USER_PASSWORD_TIPO)
	* @param mixed $section_id = null - Database record id of the parent section
	* @param string $mode = 'list' - Rendering mode; normally 'list' or 'edit'
	* @param string $lang = DEDALO_DATA_NOLAN - Ignored; always overridden to DEDALO_DATA_NOLAN
	* @param string|null $section_tipo = null - Ontology tipo of the parent section
	* @param bool $cache = true - Whether to enable instance-level caching
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_DIFFUSION_VALUE
	* Overrides component_common::get_diffusion_value() to prevent the password hash (or legacy
	* AES ciphertext) from propagating into diffusion targets (SQL, RDF, XML). Returns the
	* fake_value sentinel instead of any actual credential.
	*
	* Diffusion pipelines must never receive real password data; this override is the single
	* enforcement point for that invariant.
	*
	* @param string|null $lang = null - Language (unused; passwords are language-neutral)
	* @param object|null $option_obj = null - Diffusion options (unused)
	* @return string|null $diffusion_value - Always returns fake_value ('****************')
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

		// Normalize scalar elements to stdClass { value }
		// is_empty_data() delegates to is_empty(?object $data_item), so each element must be
		// an object before the call. Raw arrays or plain strings from client requests are
		// normalised here rather than rejected so that callers need not wrap values manually.
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

			// Clone to avoid mutating the caller's array; each element is now guaranteed to be an object
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
	* GET_EXPORT_VALUE
	* Overrides the atoms-based export contract from component_common::get_export_value() to ensure
	* the real credential is never emitted in export payloads (tool_export, flat_table, etc.).
	*
	* Returns a single-atom export_value whose scalar is always fake_value. The atom path follows
	* the same build_export_path_segment() logic as every other component so that column headers
	* and positional metadata remain consistent with the rest of the export row.
	*
	* @param export_context|null $context = null - Export context carrying path prefix and ddo options
	* @return export_value - Single atom containing fake_value; label sourced from get_label()
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$segment	= $this->build_export_path_segment($context);
			$path		= [...$context->path_prefix, $segment];

		return export_value::from_scalar(
			$path,
			$this->fake_value,
			null, // atom options: null → default cell_type 'text'
			$this->get_label(),
			get_called_class()
		);
	}//end get_export_value



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
	* Returns true when $stored is the legacy reversible AES blob produced by encrypt_password()
	* (i.e. a base64-encoded OpenSSL ciphertext), and false when it is a modern password_hash()
	* output (Argon2id or bcrypt). Note the logic is the inverse of is_stored_credential(): this
	* method distinguishes *between* credential formats, while is_stored_credential() only tests
	* *whether* the value is any kind of stored credential.
	*
	* Used by verify_password() to select the correct verification branch: modern hashes go through
	* password_verify(); legacy blobs are re-encrypted with encrypt_password() and compared with
	* hash_equals() before triggering the lazy-upgrade rehash.
	*
	* @param string $stored - The value as read from the 'string' column of matrix_users
	* @return bool - True when $stored is the legacy AES blob, false when it is a modern hash
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
	* Stub override of component_common::update_data_version(). Called by migration scripts
	* (tool_update_cache and similar) when schema upgrades need to rewrite stored component data.
	*
	* component_password does not participate in versioned data migrations: the SEC-001 credential
	* upgrade from legacy AES blobs to Argon2id is handled lazily at login time via verify_password()
	* and login::Login(), never through a batch update_data_version pass. That design is intentional
	* because batch migration would require the plaintext password, which is not available server-side.
	*
	* Response result codes (inherited contract from component_common):
	*   result = 0 → component does not have an applicable migration; action is ignored.
	*   result = 1 → (unused here) component updated and saved the data.
	*   result = 2 → (unused here) component inspected the data but no change was needed.
	*
	* @param object $request_options - Options object; recognised keys: update_version (array),
	*   data_unchanged (mixed), reference_id (string|null), tipo (string|null),
	*   section_id (mixed), section_tipo (string|null), context (string)
	* @return object $response - {result: int, msg: string}; always result=0 for this class
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
	* Reads the 'root' superuser password directly from the legacy v6 'datos' JSONB column of
	* matrix_users, bypassing the v7 matrix column layout. Used as a last-resort fallback in
	* login::Login() when the v7 'string' column is empty for section_id = '-1' (the root user),
	* which is the expected state immediately after a v6→v7 migration before the first root login.
	*
	* The v6 datos JSON path navigated here is:
	*   datos -> 'components' -> 'dd133' -> 'dato' -> 'lg-nolan' ->> 0
	* where 'dd133' is the ontology tipo for the password component in the v6 schema and
	* 'lg-nolan' is the language-neutral locale key used by legacy records.
	*
	* Returns null immediately when the 'datos' column no longer exists (post-migration cleanup),
	* ensuring the method is safe to call after the column has been dropped.
	*
	* (!) PROVISIONAL — v6→v7 transition only. Remove when versions > 7.0.0 are released and the
	* v6 'datos' column can no longer be present.
	*
	* @return string|null $data - The raw credential string from the v6 column, or null if
	*   the column is absent, the query returns no rows, or the value is not a string
	*/
	public function get_v6_root_password_data() : ?string {

		// Guard: 'datos' column only exists during the v6→v7 migration window.
		// Once the upgrade scripts drop it, this method can no longer serve its purpose
		// and returns null so login::Login() treats the root user as having no stored credential.
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
