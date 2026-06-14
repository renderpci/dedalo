<?php declare(strict_types=1);
/**
* CLASS COMPONENT_EMAIL
* Manages one or more e-mail address values in a Dédalo record.
*
* `component_email` is a **literal-direct** component: it owns and stores its own
* value (never a locator to another section). It exists so that e-mail addresses
* cannot be stored as free `component_input_text` values where nothing guarantees
* a well-formed `local-part@domain.tld`.
*
* Responsibilities:
* - Enforce non-translatable storage: the constructor always pins `lang` to
*   `DEDALO_DATA_NOLAN`, preventing accidental translatable variants.
* - Normalize raw input in `set_data()`: bare scalars are coerced into objects
*   with `{value, lang:'lg-nolan'}` and then passed through `clean_email()`.
* - Validate format before committing: `save()` rejects the write and logs an
*   error if any non-empty value fails `is_valid_email()`.
* - Provide sanitization utilities: `clean_email()` strips header-injection
*   payloads (CR/LF sequences, quotes, control characters).
* - Support the v7 import pipeline: `conform_import_data()` normalizes the full
*   range of import shapes (JSON array, single object, legacy lang-keyed object,
*   plain string, pipe-separated multi-value string) into canonical v7 items.
*
* Data shape stored per language group (always `lg-nolan`):
* ```json
* {"lg-nolan":[{"id":1,"lang":"lg-nolan","value":"user@example.com"}]}
* ```
*
* Extends component_string_common, which in turn extends component_common.
* String search traits (search_component_string_common) are inherited from the
* parent class.
*
* @package Dédalo
* @subpackage Core
*/
class component_email extends component_string_common {



	/**
	* __CONSTRUCT
	* Initialise the component, forcing the language to DEDALO_DATA_NOLAN before
	* delegating to the parent constructor.
	*
	* E-mail addresses are inherently language-neutral: there is no per-language
	* variant or transliteration. Pinning `lang` here — before `parent::__construct`
	* is called — guarantees that every downstream call (`get_data_lang()`,
	* `set_data_lang()`, …) operates on the single `lg-nolan` group, regardless of
	* the `$lang` argument supplied by the caller.
	*
	* (!) The `$lang` parameter is accepted for signature compatibility but is
	* silently overridden. Callers must not rely on passing a language here.
	*
	* @param string $tipo - ontology node identifier for this component
	* @param mixed $section_id = null - record ID in the owning section
	* @param string $mode = 'list' - rendering mode (edit / list / tm / search)
	* @param string $lang = DEDALO_DATA_NOLAN - ignored; always forced to DEDALO_DATA_NOLAN
	* @param ?string $section_tipo = null - ontology tipo of the owning section
	* @param bool $cache = true - whether to use the component instance cache
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// fix lang (email always is DEDALO_DATA_NOLAN)
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* SET_DATA
	* Store an array of e-mail data items, normalizing each entry into the
	* canonical v7 object shape before delegating to the parent.
	*
	* Normalization steps applied to every element of `$data`:
	* 1. Non-objects (plain strings, null, empty string) are coerced into
	*    `{value, lang:'lg-nolan'}` objects — or kept as `null` when blank.
	* 2. Any resulting object has its `value` property passed through
	*    `clean_email()` to strip header-injection payloads.
	*
	* An empty or null `$data` argument is forwarded as `null` to the parent,
	* which clears the stored value for the current language group.
	*
	* (!) `clean_email()` may return `null` for an input that was non-null — for
	* instance an all-whitespace string. The nulled item is still included in the
	* normalized array and reaches the parent as a `null` slot; the parent's
	* empty-value detection then determines whether the slot is persisted.
	*
	* @param array|null $data - array of data items (objects or scalar strings); null clears the value
	* @return bool - true on success, false when the parent set_data() fails
	*/
	public function set_data( ?array $data ) : bool {

		// Handle null or empty array case
		if (empty($data)) {
			return parent::set_data(null);
		}

		// array case
		$safe_data = [];
		foreach ($data as $data_item) {

			// 1. Normalize non-objects into objects
			if (!is_object($data_item)) {
				if ($data_item === null || $data_item === '') {
					$data_item = null;
				} else {
					$data_item = (object)[
						'value' => $data_item,
						'lang'  => DEDALO_DATA_NOLAN
					];
				}
			}

			// 2. Process objects (either newly created or passed in)
			if (is_object($data_item)) {
				// Ensure the value property exists or is null
				$current_val = $data_item->value ?? null;
				$data_item->value = component_email::clean_email($current_val);
			}

			$safe_data[] = $data_item;
		}

		return parent::set_data($safe_data);
	}//end set_data



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to check data before save:
	* E-mail format validation.
	*
	* Validates every non-empty `value` in the stored data array against
	* `is_valid_email()` before delegating to `parent::save()`. The parent
	* performs the actual database write, so this override acts as a
	* server-side gate — the authoritative backstop after any client-side check.
	*
	* When any item fails validation the method logs a `logger::ERROR` entry and
	* returns `false` immediately without writing any data. The failure is silent
	* to the end-user; the JavaScript `verify_email()` check is responsible for
	* surfacing the error in the UI.
	*
	* (!) A `false` return here does not throw an exception. The caller (API handler
	* or import tool) must inspect the return value to detect the refusal.
	*
	* @return bool - true when all values are valid and the write succeeds; false on validation failure or write error
	*/
	public function save() : bool {

		// Optionally, the data could be validated here... although it has already been done in javascript
		$data = $this->get_data();
		if (!empty($data)) {
			foreach ($data as $data_item) {
				if (!empty($data_item->value) && !component_email::is_valid_email($data_item->value)) {
					debug_log(__METHOD__
						. " Data is NOT saved. Invalid email !"
						. ' value:' . to_string($data_item->value)
						, logger::ERROR
					);
					return false;
				}
			}
		}

		return parent::save();
	}//end save



	/**
	* IS_VALID_EMAIL
	* Validate email format
	*
	* Performs a two-layer validation:
	* 1. PHP's `filter_var(…, FILTER_VALIDATE_EMAIL)` — rejects obviously malformed
	*    addresses (missing `@`, invalid characters, consecutive dots, etc.).
	* 2. An extra regex `/@.+\./` — ensures the domain part contains at least one
	*    dot, which `FILTER_VALIDATE_EMAIL` alone does not always enforce for unusual
	*    top-level domains or punycode-encoded hostnames.
	*
	* This pair matches the contract documented in the component_email.md data model:
	* a valid address must have a `local-part`, the `@` character, and a `domain`
	* with at least one dot before the TLD label.
	*
	* @param string $email - raw e-mail string to test (must already be trimmed)
	* @return bool - true when both checks pass; false when either rejects the address
	*/
	public static function is_valid_email( string $email ) : bool {

		return filter_var($email, FILTER_VALIDATE_EMAIL)
			&& preg_match('/@.+\./', $email);
	}//end is_valid_email



	/**
	* CLEAN_EMAIL
	* Clean email from special characters
	*
	* Strips CR/LF sequences and header-injection payloads from a raw e-mail
	* string as a defence-in-depth measure. The regex removes any occurrence of
	* `<CR>`, `<LF>`, `0x0A`, `%0A`, `0x0D`, `%0D`, literal `\n`, literal `\r`,
	* single-quote, or double-quote — followed by any non-whitespace character —
	* and everything after it. The remainder is then trimmed.
	*
	* This sanitization is applied inside `set_data()` so that injected line
	* breaks are eliminated before the value reaches storage or the validation
	* check in `save()`.
	*
	* Returns `null` unchanged when given `null`. An empty string is returned as-is
	* (the `!empty()` guard skips the substitution for falsy inputs).
	*
	* @param ?string $email - raw e-mail string, or null
	* @return ?string $email - sanitized string, or null if input was null
	*/
	public static function clean_email(?string $email) : ?string {

		if (!empty($email)) {
			$email = trim(
				preg_replace('=((<CR>|<LF>|0x0A/%0A|0x0D/%0D|\\n|\\r|\'|\")\S).*=i', '', $email)
			);
		}

		return $email;
	}//end clean_email



	/**
	* CONFORM_IMPORT_DATA
	* Normalize a raw import value into the canonical v7 data array for this
	* component, ready for `set_data()`.
	*
	* The method handles the full range of shapes produced by the export/import
	* pipeline and by legacy formats:
	*
	* 1. **JSON array of value objects** (canonical v7):
	*    `[{"value":"user@example.com"},{"value":"admin@example.com"}]`
	*    Bare scalars inside the array are auto-wrapped into `{"value":…}` objects.
	*
	* 2. **Single value object** (canonical single item):
	*    `{"value":"user@example.com"}` — wrapped into a one-element array.
	*
	* 3. **Lang-keyed object** (legacy raw-export round-trip):
	*    `{"lg-nolan":["user@example.com"]}` — the first language group is
	*    extracted and normalized into v7 items. Because component_email is
	*    non-translatable, only the first key is used; additional language keys
	*    are silently ignored.
	*
	* 4. **Object without a `value` property and without a `lg-*` key** — logged as
	*    an error and returned with `result = null` and a populated `errors` array.
	*
	* 5. **Plain string** (single address): `user@example.com`
	*    Wrapped into `[{"value":"user@example.com"}]`.
	*
	* 6. **Pipe-separated string** (multiple addresses):
	*    `user@example.com | admin@example.com` — split on the fixed ` | `
	*    separator (space-pipe-space) into one item per address. The separator is
	*    not configurable; an address that literally contains ` | ` must be
	*    imported via the JSON array form instead.
	*
	* 7. **Empty string** — returns `result = null` with `msg = 'OK'` (no error).
	*
	* (!) This method does NOT validate e-mail format. Validation is the
	* responsibility of `save()` → `is_valid_email()`. Invalid addresses that pass
	* import normalization will be rejected at save time.
	*
	* @param string $import_value - raw string from the CSV/import source
	* @param string $column_name - CSV column header (unused here; kept for interface parity)
	* @return object $response
	*   - $response->result  array|null  normalized v7 items on success; null on error or empty
	*   - $response->errors  array       error detail objects (populated on object-shape mismatch)
	*   - $response->msg     string      'OK' on success; error description otherwise
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// object | array case
			// Check if is a JSON string. Is yes, decode
			// if data is a object | array it will be the Dédalo format and it's not necessary processed
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$data_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				// Normalize: ensure array items are objects with 'value' property (v7 format)
				if (is_array($data_from_json)) {
					$normalized = [];
					foreach ($data_from_json as $val) {
						if (!is_object($val)) {
							$normalized[] = (object)['value' => $val];
						}else if (!property_exists($val, 'value')) {
							$normalized[] = (object)['value' => $val];
						}else{
							$normalized[] = $val;
						}
					}
					$data_from_json = $normalized;
				}else if (is_object($data_from_json)) {

					$first_key = array_key_first( (array)$data_from_json );
					if ($first_key!==null && strpos($first_key, 'lg-')===0) {
						// Lang keyed object as {"lg-nolan":["user@example.com"]} (legacy raw export)
						// component_email is non translatable: extract the first lang value
						// and normalize it into an array of v7 items
						$lang_value = $data_from_json->{$first_key};
						$ar_lang_value = is_array($lang_value)
							? $lang_value
							: [$lang_value];
						$normalized = [];
						foreach ($ar_lang_value as $val) {
							$normalized[] = (is_object($val))
								? $val
								: (object)['value' => $val];
						}
						$data_from_json = $normalized;
					}else if (property_exists($data_from_json, 'value')) {
						// Single object item as {"value":"user@example.com"}. Wrap into an array
						$data_from_json = [$data_from_json];
					}else{
						$failed = new stdClass();
							$failed->section_id		= $this->section_id;
							$failed->data			= stripslashes( $import_value );
							$failed->component_tipo	= $this->get_tipo();
							$failed->msg			= 'IGNORED: object without value property '. to_string($import_value);
						$response->errors[] = $failed;

						return $response;
					}
				}

				$response->result	= $data_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// string case

		// empty
			if(empty($import_value)) {

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// convert value
			// multiple emails can be imported using the ' | ' separator
			// as 'user@example.com | admin@example.com'
			$ar_values = explode(' | ', $import_value);
			$result = [];
			foreach ($ar_values as $current_value) {
				$current_value = trim($current_value);
				if ($current_value==='') {
					continue;
				}
				$result[] = (object)['value' => $current_value];
			}

		// response OK
			$response->result	= !empty($result) ? $result : null;
			$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class email
