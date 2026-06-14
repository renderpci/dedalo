<?php declare(strict_types=1);
/**
* CLASS ZENON
* Entity adapter for the DAI (Deutsches Archäologisches Institut) Zenon library catalog API.
*
* Responsibilities:
* - Builds well-formed request URLs for the Zenon REST API v1 (`/api/v1/record` endpoint).
* - Translates Dédalo's internal language codes into the two-letter locale tokens (`lgn`)
*   that Zenon expects.
* - Selected fields are appended as repeated `field[]=<name>` query parameters; omitting
*   them returns the full Zenon record.
*
* This class is loaded dynamically by component_external::load_data_from_remote() using
* the `entity` value from the section's `api_config` ontology property:
*   `include_once( dirname(__FILE__) . '/entities/class.' . $entity . '.php' );`
* The method `build_row_request_url()` is therefore part of an informal static contract
* that every entity adapter under `entities/` must satisfy.
*
* @see https://zenon.dainst.org/swagger-ui/
* @see component_external::load_data_from_remote()
*
* @package Dédalo
* @subpackage Core
*/
class zenon {



	/**
	* BUILD_ROW_REQUEST_URL
	* Assembles the full Zenon API URL for fetching a single bibliographic record.
	*
	* The resulting URL targets the `/api/v1/record` endpoint and encodes three
	* kinds of query parameters:
	*   - `id`     — the Zenon record identifier, taken directly from the section_id.
	*   - `lgn`    — a BCP 47 two-letter language tag derived from Dédalo's internal
	*                lang code; falls back to 'en' when the mapping produces null.
	*   - `field[]` — zero or more field names that restrict the Zenon response payload.
	*                 When $options->ar_fields is empty no field[] parameters are added
	*                 and Zenon returns the complete record object.
	*
	* Sample output:
	*   https://zenon.dainst.org/api/v1/record?id=000903635&lgn=en&field[]=id&field[]=title&field[]=authors
	*
	* @param object $options - Configuration bag produced by component_external::load_data_from_remote():
	*   {
	*     api_url    : string     - Base URL of the Zenon API endpoint (e.g. "https://zenon.dainst.org/api/v1/record")
	*     ar_fields  : array      - Remote field names to include in the Zenon response; empty array returns all fields
	*     section_id : int|string - Zenon record identifier (the value stored in the Dédalo section)
	*     lang       : string     - Dédalo internal language code (e.g. "lang_en", "lang_de")
	*   }
	* @return string - Fully constructed request URL ready for curl_request()
	*/
	public static function build_row_request_url( object $options ) : string {

		// options
			$api_url	= $options->api_url;
			$ar_fields	= $options->ar_fields;
			$section_id	= $options->section_id;
			$lang		= $options->lang;

		// lang value tld 2
		// Zenon's `lgn` parameter expects an ISO 639-1 two-letter code ('en', 'de', …).
		// lang::get_alpha2_from_code() converts Dédalo internal codes (e.g. 'lang_en' → 'en').
		// The null-coalescing fallback to 'en' ensures a valid URL even for unmapped locales.
			$lang_value = lang::get_alpha2_from_code($lang) ?? 'en';

		// ar_fields_var
		// Each requested field must appear as a separate `field[]=<name>` parameter.
		// PHP array syntax in query strings (field[]) is supported natively by Zenon's API.
			$ar_fields_var = [];
			foreach($ar_fields as $field) {
				$ar_fields_var[] = 'field[]=' . $field;
			}

		// url
		// When no fields are requested the field portion is omitted entirely rather than
		// appending an empty string, avoiding a dangling '&' in the URL.
			$fields_query = empty($ar_fields_var) ? '' : '&'. implode('&', $ar_fields_var);
			$url = $api_url .'?id='. $section_id .'&lgn='. $lang_value . $fields_query;


		return $url;
	}//end build_row_request_url



}//end class zenon
