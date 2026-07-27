<?php declare(strict_types=1);
/**
* CLASS LANG
* Static utility class for resolving Dédalo language codes and their human-readable names.
*
* Dédalo represents languages as thesaurus terms stored in the 'matrix_langs' PostgreSQL
* matrix table. Each language record carries:
*   - An ISO 639-2/T three-letter code stored in the 'hierarchy41' component (e.g. "spa").
*   - A set of multilingual name strings in the 'hierarchy25' component
*     (e.g. {"lg-eng": "Spanish", "lg-spa": "Castellano"}).
*   - A section_id that can be used to build a locator pointing to that language record.
*
* Dédalo lang codes use the prefix "lg-" followed by an ISO 639-2 alpha-3 code:
*   lg-eng, lg-spa, lg-cat, lg-fra, lg-por, …
* The special code "lg-nolan" (DEDALO_DATA_NOLAN) means "no language" — data that is not
* language-tagged. Many methods return null for this sentinel rather than attempting a lookup.
*
* Responsibilities:
*   - Resolve a lang code to its thesaurus record (section_id + multilingual names).
*   - Retrieve the human-readable name for a lang in a given display language, with fallback.
*   - Build a locator pointing to a language's thesaurus record.
*   - Convert between Dédalo lg- codes, ISO 639-1 alpha-2 codes, and BCP-47 locale strings.
*   - Map ISO 639-1 alpha-2 codes (e.g. "es") to Dédalo lg- codes (e.g. "lg-spa") and back.
*
* Resolution path:
*   resolve() → resolve_multiple() → matrix_db_manager::exec_search() (PostgreSQL GIN index).
*
* @package Dédalo
* @subpackage Core
*/
class lang {



	/**
	* Matrix table name where all language thesaurus records are stored.
	* Mirrors the PostgreSQL table 'matrix_langs'. Exposed as a public static
	* so callers outside this class (e.g. class.search.php, class.hierarchy.php)
	* can reference the same canonical table name without hard-coding it.
	* @var string $langs_matrix_table
	*/
	public static string $langs_matrix_table = 'matrix_langs';

	/**
	* In-process cache for resolve_multiple() results, keyed by the comma-joined
	* list of alpha-3 code strings (e.g. "spa,eng"). Populated on first hit and
	* reused for all subsequent calls within the same PHP request.
	* @var array $resolve_multiple_lang_cache
	*/
	public static array $resolve_multiple_lang_cache = [];



	/**
	* RESOLVE
	* Resolves a single Dédalo lang code to its thesaurus record object.
	*
	* Strips the "lg-" prefix if present before delegating to resolve_multiple(),
	* which performs the actual PostgreSQL lookup with caching.
	* Returns null when the code cannot be found in the matrix.
	*
	* @param string $lang_tld - Dédalo lang code with or without prefix, e.g. 'lg-spa' or 'spa'
	* @return object|null - Resolved record, or null on miss:
	* {
	*    "code": "spa",
	*    "section_id": 17344,
	*    "names": {
	*        "lg-eng": "Spanish",
	*        "lg-spa": "Castellano"
	*    }
	* }
	*/
	private static function resolve(string $lang_tld) : ?object {

		// lang tld formatting
		// Strip the "lg-" prefix so the bare alpha-3 code is passed to resolve_multiple.
		if (strpos($lang_tld, 'lg-')===0) {
			$lang_tld = substr($lang_tld, 3);
		}

		// resolve using unified method resolve_multiple
		$items = lang::resolve_multiple([$lang_tld]);

		// select first array item (one is expected)
		$response = $items[0] ?? null;

		return $response;
	}//end resolve



	/**
	* RESOLVE_MULTIPLE
	* Batch-resolves a set of bare ISO 639-2 alpha-3 codes to their thesaurus records,
	* issuing a single PostgreSQL query against the matrix_langs table.
	*
	* The query uses the 'matrix_langs_hierarchy41_gin' GIN index on the JSONB 'string'
	* column, filtering via a JSONPath expression that matches any of the supplied codes
	* against the hierarchy41 component's value array.
	*
	* Results are stored in a static per-request cache keyed by the sorted comma-joined
	* code string, so repeated calls for the same set cost nothing after the first hit.
	*
	* Each returned item has the shape:
	* {
	*   "code": "spa",           // bare ISO 639-2/T code as stored in hierarchy41
	*   "section_id": 17344,     // thesaurus record id in matrix_langs
	*   "names": {               // multilingual name map, keyed by Dédalo lang code
	*     "lg-eng": "Spanish",
	*     "lg-spa": "Castellano"
	*   }
	* }
	*
	* @param array $ar_lang_tld - Bare alpha-3 codes without "lg-" prefix, e.g. ['spa','eng']
	* @return array|null - Ordered array of resolved objects, or null on DB error.
	*                      Returns an empty array when no codes match.
	*/
	public static function resolve_multiple(array $ar_lang_tld) : ?array {

		// cache
		// Cache key is the sorted, comma-joined code list so call order does not matter.
		$cache_key = implode(',', $ar_lang_tld);
		if (isset(self::$resolve_multiple_lang_cache[$cache_key])) {
			return self::$resolve_multiple_lang_cache[$cache_key];
		}

		// short vars
		$table		= lang::$langs_matrix_table;

		// No langs table yet (e.g. a fresh install before the DB is imported): return quietly.
		// Otherwise exec_search logs a noisy "relation does not exist" pg error and raises the
		// "server errors" banner while the installer page builds its environment.
		if (class_exists('DBi') && DBi::check_table_exists($table) === false) {
			self::$resolve_multiple_lang_cache[$cache_key] = null;
			return null;
		}

		$term_tipo	= DEDALO_THESAURUS_TERM_TIPO;
		$code_tipo	= DEDALO_THESAURUS_CODE_TIPO; // hierarchy41

		// query: (!) This is a temporal query until the search class is refactored (24/11/2025)
		// to do: Refactor this query using search class
		// The JSONPath operator @? filters rows where the hierarchy41 array contains
		// at least one object whose 'value' property matches one of the requested codes.
		// $1 is the single bound parameter — a JSONPath string built below.
		$sql = '';
		$sql .= PHP_EOL . 'SELECT';
		$sql .= PHP_EOL . 'section_id, section_tipo,';
		$sql .= PHP_EOL . 'string->\''.$term_tipo.'\' AS names,';
		$sql .= PHP_EOL . 'string->\''.$code_tipo.'\'->0->>\'value\' AS code';
		$sql .= PHP_EOL . 'FROM "'.$table.'"';
		$sql .= PHP_EOL . 'WHERE';
		$sql .= PHP_EOL . "string @? $1";

		// Build condiionals as ['@ == "eng"', '@ == "spa"']
		// Each element becomes a JSONPath existence check; they are OR-joined so a single
		// query can retrieve all requested languages in one round trip.
		$conds = array_map(
			fn($l) => '@ == "' . str_replace('lg-', '', $l) . '"',
			$ar_lang_tld
		);
		$params = [
			"\$.{$code_tipo}[*].value ? (" . implode(' || ', $conds) . ')'
		];

		// DB query exec
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result===false) {
			debug_log(__METHOD__
				." Error on exec_search. strQuery: " . PHP_EOL
				.to_string($sql)
				, logger::ERROR
			);
			return null;
		}

		// items
		// Reshape each raw DB row into the canonical resolved-lang object.
		// The 'names' column is a JSONB array of {lang, value} pairs; we flatten it
		// into a plain object keyed by Dédalo lang code for cheap property access.
		$items = [];
		while ($rows = pg_fetch_assoc($result)) {

			$section_id	= (int)$rows['section_id'];
			$code		= $rows['code'];
			$names		= json_handler::decode($rows['names']);

			$value = new stdClass();
			if(is_array($names)) {
				foreach($names as $n) {
					$value->{$n->lang} = $n->value; // As lg-spa => Spanish
				}
			}

			$items[] = (object)[
				'code'			=> $code,
				'section_id'	=> $section_id,
				'names'			=> $value
			];
		}

		// cache
		self::$resolve_multiple_lang_cache[$cache_key] = $items;


		return $items;
	}//end resolve_multiple



	/**
	* GET_SECTION_ID_FROM_CODE
	* Returns the thesaurus section_id (integer record identifier in matrix_langs)
	* for a given Dédalo lang code.
	*
	* The section_id is the database row identifier that locates the language record;
	* it is used wherever a locator must be constructed for a language.
	*
	* @param string $code - Dédalo lang code, e.g. 'lg-spa'
	* @return int|null - section_id, or null if the code cannot be resolved
	*/
	public static function get_section_id_from_code(string $code) : int|null {

		$result		= lang::resolve($code);
		$section_id	= !empty($result->section_id)
			? (int)$result->section_id
			: null;

		return $section_id;
	}//end get_section_id_from_code



	/**
	* GET_LANG_LOCATOR_FROM_CODE
	* Builds a locator object pointing to the thesaurus language record for the given
	* Dédalo lang code.
	*
	* Normally the section_id is resolved live from the matrix_langs table via resolve().
	* If the live lookup fails (e.g. matrix not yet populated, DB error), the method falls
	* back to a hardcoded map of well-known language section_ids. This ensures that core
	* languages always produce a valid locator even in partially bootstrapped environments.
	*
	* The returned locator always uses DEDALO_LANGS_SECTION_TIPO ('lg1') as its section_tipo,
	* since all language thesaurus records belong to that section type.
	*
	* (!) The fallback section_ids are database-specific constants that must match the
	* actual records in the target installation's matrix_langs table.
	*
	* @param string $code - Dédalo lang code, e.g. 'lg-spa'
	* @return locator - Locator pointing to the corresponding language thesaurus record
	*/
	public static function get_lang_locator_from_code(string $code) : locator {

		$result = lang::resolve($code);
		if (!isset($result->section_id)) {
			// fallback to common languages
			// (!) When the DB lookup fails or the lang is not found, use hardcoded section_ids.
			// These IDs are stable across standard Dédalo installations but must be verified
			// if the matrix is rebuilt from scratch.
			$lang = DEDALO_DATA_LANG;
			switch ($lang) {
				case 'lg-eng':	$section_id = 5101; break;
				case 'lg-spa':	$section_id = 17344; break;
				case 'lg-cat':	$section_id = 3032; break;
				case 'lg-ell':	$section_id = 5037; break;
				case 'lg-deu':	$section_id = 4253; break;
				case 'lg-vlca':	$section_id = 20155; break;
				case 'lg-fra':	$section_id = 5450; break;
				case 'lg-eus':	$section_id = 5223; break;
				case 'lg-por':	$section_id = 14895; break;
				case 'lg-ara':	$section_id = 841; break;
				case 'lg-rus':	$section_id = 15862; break;
				case 'lg-ita':	$section_id = 7466; break;
				// Nepal add
				case 'lg-nep':	$section_id = 12943; break;
				case 'lg-bho':	$section_id = 1792; break;
				case 'lg-mai':	$section_id = 10912; break;
				case 'lg-nptl':	$section_id = 13486; break;
				case 'lg-tajs':	$section_id = 18132; break;
				case 'lg-awa':	$section_id = 1154; break;
				case 'lg-vjk':	$section_id = 21712; break;
				// default
				default: break;
			}
		}else{
			// Normal case
			$section_id  = $result->section_id;
		}

		$locator = new locator();
			$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO);
			$locator->set_section_id($section_id);


		return $locator;
	}//end get_lang_locator_from_code



	/**
	* GET_NAME_FROM_CODE
	* Returns the human-readable display name for a language, translated into the
	* requested $lang display language.
	*
	* For example: get_name_from_code('lg-spa', 'lg-eng') → "Spanish"
	*              get_name_from_code('lg-spa', 'lg-spa') → "Castellano"
	*
	* Resolution order (via fallback_lang_value):
	*   1. Exact match for $lang in the names map.
	*   2. The installation's main lang (hierarchy::get_main_lang).
	*   3. The first non-empty name available in any language.
	*
	* Returns null for the sentinel code DEDALO_DATA_NOLAN ('lg-nolan'), which
	* represents language-neutral data rather than a real language.
	*
	* @param string $lang_code - Dédalo lang code to look up, e.g. 'lg-spa'
	* @param string $lang = DEDALO_DATA_LANG - Display language for the returned name
	* @param bool $from_cache = true - Reserved for future cache-bypass; currently unused
	* @return string|null - Human-readable language name, or null when unresolvable
	*/
	public static function get_name_from_code(string $lang_code, string $lang=DEDALO_DATA_LANG, bool $from_cache=true) : ?string {
		$start_time = start_time();

		// DEDALO_DATA_NOLAN case : When lang code is lg-nolan, null is returned
		// 'lg-nolan' is the Dédalo sentinel for "no language" — it is not a real language
		// and has no thesaurus entry, so returning null prevents a pointless DB query.
			if ($lang_code === DEDALO_DATA_NOLAN) {
				return null;
			}

		// resolve
			$result = lang::resolve( $lang_code );

			// expected result format:
			// {
			//    "code": "spa",
			//    "section_id": 17344,
			//    "names": {
			//        "lg-eng": "Spanish",
			//        "lg-spa": "Castellano"
			//    }
			// }

		// not founded name
			if(!isset($result->names) || empty($result->names)) {
				return null;
			}

		// try to get the name in the requested language, else fallback to main lang or any.
		$name = lang::fallback_lang_value($result->names, $lang);

		return $name;
	}//end get_name_from_code



	/**
	* FALLBACK_LANG_VALUE
	* Selects the best available name string from a multilingual names map, with
	* a three-level fallback strategy:
	*
	*   1. Exact match on $lang (the caller's requested display language).
	*   2. The main lang for the DEDALO_LANGS_SECTION_TIPO section
	*      (hierarchy::get_main_lang — the installation's primary language).
	*   3. The first non-empty value found by iterating over the map.
	*
	* This method is intentionally reusable for any names map in the same shape,
	* not only for language records — it is also used when displaying ontology terms
	* or other multilingual strings stored in the same {lg-xxx: "label"} format.
	*
	* @param object $names - Multilingual names map keyed by Dédalo lang code, e.g.:
	*   {
	*     "lg-eng": "Spanish",
	*     "lg-spa": "Castellano"
	*   }
	* @param string $lang = DEDALO_DATA_LANG - Preferred display language code
	* @return string|null - Best available name, or null if the map is empty
	*/
	public static function fallback_lang_value(object $names, string $lang=DEDALO_DATA_LANG) : ?string {

		// try to get the name in the requested language
		if(isset($names->{$lang})) {

			$name = $names->{$lang};

		}else{

			// main lang try
			// When the requested language is missing, try the installation's primary language
			// before giving up and picking any available value.
			$main_lang = hierarchy::get_main_lang(DEDALO_LANGS_SECTION_TIPO);

			if(isset($names->{$main_lang})) {
				// main lang
				$name = $names->{$main_lang};
			}else{
				// first not empty lang available
				// Last resort: return the first non-empty string in the map, regardless of language.
				foreach($names as $code => $label) {
					if( !empty($label) ) {
						$name = $label;
						break;
					}
				}
			}
		}

		return $name ?? null;
	}//end fallback_lang_value



	/**
	* GET_LANG_NAME_BY_LOCATOR
	* Returns the display name for the language that a locator points to, in the
	* requested display language.
	*
	* Delegates to ts_object::get_term_by_locator(), which retrieves the 'hierarchy25'
	* (term) component value for the given locator's section_id.
	*
	* This method exists as a named wrapper so call sites that already hold a locator
	* do not need to know about ts_object directly.
	*
	* @param object $locator - Locator pointing to a language thesaurus record
	* @param string $lang = DEDALO_APPLICATION_LANG - Display language for the returned name
	* @param bool $from_cache = false - Whether to use ts_object's term cache
	* @return string|null - Human-readable language name, or null when not found
	*/
	public static function get_lang_name_by_locator(object $locator, string $lang=DEDALO_APPLICATION_LANG, bool $from_cache=false) : ?string {

		$lang_name = ts_object::get_term_by_locator( $locator, $lang, $from_cache );

		return $lang_name;
	}//end get_lang_name_by_locator



	/**
	* GET_CODE_FROM_LOCATOR
	* Derives the Dédalo lang code (e.g. 'lg-spa') from a locator that points to
	* a language thesaurus record.
	*
	* Loads the hierarchy41 (code) component for the locator's section_id and reads
	* its value, then prepends the 'lg-' prefix to form the canonical lang code.
	*
	* The component is instantiated in 'list' mode with DEDALO_DATA_NOLAN because
	* the code field is language-neutral — it stores the ISO alpha-3 string, not
	* a translated label. Passing DEDALO_DATA_NOLAN prevents any language-specific
	* data resolution logic from running.
	*
	* Returns null when:
	*   - The locator has no section_id (missing or malformed locator).
	*   - The hierarchy41 component has no stored value.
	*
	* @param object $locator - Locator with section_id pointing to a language record
	* @return string|null - Dédalo lang code with 'lg-' prefix, or null on failure
	*/
	public static function get_code_from_locator(object $locator) : ?string {

		// locator check section_id
		// A locator without section_id cannot identify a language record; bail early.
			if (!isset($locator->section_id)) {
				if(SHOW_DEBUG===true) {
					dump($locator, ' locator ++ (locator_id not found!)'.to_string());
					dump(debug_backtrace(), ' debug_backtrace() ++ '.to_string());
				}
				return null;
			}

		// section_tipo
			$section_tipo = DEDALO_LANGS_SECTION_TIPO;

		// component value (code)
		// Instantiate the hierarchy41 component (the ISO code field) for this language record.
			$tipo		= DEDALO_THESAURUS_CODE_TIPO;
			$model_name	= ontology_node::get_model_by_tipo($tipo, true);
			$parent		= $locator->section_id;
			$component	= component_common::get_instance(
				$model_name,
				$tipo,
				$parent,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$code = $component->get_value();

			if(empty($code)) {
				return null;
			}

		// add_prefix. Default is true
		// Reattach the 'lg-' prefix to convert from the bare stored code ("spa") to
		// the full Dédalo lang identifier ("lg-spa").
		$code = 'lg-'.$code;


		return $code;
	}//end get_code_from_locator



	/**
	* GET_LANG_CODE_FROM_ALPHA2
	* Converts an ISO 639-1 two-letter language code (alpha-2) to the corresponding
	* Dédalo lg- lang code (ISO 639-2/T alpha-3 with 'lg-' prefix).
	*
	* Covers the complete ISO 639-1 standard set plus one Dédalo-specific extension:
	*   'va' → 'lg-vlca'  (Valencian — non-standard ISO code used by this installation)
	*   'sh' → 'lg-hbs'   (Serbo-Croatian, deprecated ISO 639-1 code)
	*
	* Returns null and logs an error for any code not in the map.
	*
	* @param string $lang_apha2 - ISO 639-1 alpha-2 code, e.g. 'es', 'en', 'fr'
	* @return string|null - Dédalo lang code e.g. 'lg-spa', or null if unmapped
	*/
	public static function get_lang_code_from_alpha2(string $lang_apha2) : ?string {

		$lang_code = null;

		switch ($lang_apha2) {
			// custom
			// 'va' is a custom code for Valencian, which ISO 639-1 does not distinguish
			// from Catalan ('ca'). Dédalo treats them as separate languages.
			case 'va'	: $code = 'lg-vlca';break;
			// official list
			case 'aa' 	: $code = 'lg-aar'; break;
			case 'ab' 	: $code = 'lg-abk'; break;
			case 'ae' 	: $code = 'lg-ave'; break;
			case 'af' 	: $code = 'lg-afr'; break;
			case 'ak' 	: $code = 'lg-aka'; break;
			case 'am' 	: $code = 'lg-amh'; break;
			case 'an' 	: $code = 'lg-arg'; break;
			case 'ar' 	: $code = 'lg-ara'; break;
			case 'as' 	: $code = 'lg-asm'; break;
			case 'av' 	: $code = 'lg-ava'; break;
			case 'ay' 	: $code = 'lg-aym'; break;
			case 'az' 	: $code = 'lg-aze'; break;
			case 'ba' 	: $code = 'lg-bak'; break;
			case 'be' 	: $code = 'lg-bel'; break;
			case 'bg' 	: $code = 'lg-bul'; break;
			case 'bi' 	: $code = 'lg-bis'; break;
			case 'bm' 	: $code = 'lg-bam'; break;
			case 'bn' 	: $code = 'lg-ben'; break;
			case 'bo' 	: $code = 'lg-bod'; break;
			case 'br' 	: $code = 'lg-bre'; break;
			case 'bs' 	: $code = 'lg-bos'; break;
			case 'ca' 	: $code = 'lg-cat'; break;
			case 'ce' 	: $code = 'lg-che'; break;
			case 'ch' 	: $code = 'lg-cha'; break;
			case 'co' 	: $code = 'lg-cos'; break;
			case 'cr' 	: $code = 'lg-cre'; break;
			case 'cs' 	: $code = 'lg-ces'; break;
			case 'cu' 	: $code = 'lg-chu'; break;
			case 'cv' 	: $code = 'lg-chv'; break;
			case 'cy' 	: $code = 'lg-cym'; break;
			case 'da' 	: $code = 'lg-dan'; break;
			case 'de' 	: $code = 'lg-deu'; break;
			case 'dv' 	: $code = 'lg-div'; break;
			case 'dz' 	: $code = 'lg-dzo'; break;
			case 'ee' 	: $code = 'lg-ewe'; break;
			case 'el' 	: $code = 'lg-ell'; break;
			case 'en' 	: $code = 'lg-eng'; break;
			case 'eo' 	: $code = 'lg-epo'; break;
			case 'es' 	: $code = 'lg-spa'; break;
			case 'et' 	: $code = 'lg-est'; break;
			case 'eu' 	: $code = 'lg-eus'; break;
			case 'fa' 	: $code = 'lg-fas'; break;
			case 'ff' 	: $code = 'lg-ful'; break;
			case 'fi' 	: $code = 'lg-fin'; break;
			case 'fj' 	: $code = 'lg-fij'; break;
			case 'fo' 	: $code = 'lg-fao'; break;
			case 'fr' 	: $code = 'lg-fra'; break;
			case 'fy' 	: $code = 'lg-fry'; break;
			case 'ga' 	: $code = 'lg-gle'; break;
			case 'gd' 	: $code = 'lg-gla'; break;
			case 'gl' 	: $code = 'lg-glg'; break;
			case 'gn' 	: $code = 'lg-grn'; break;
			case 'gu' 	: $code = 'lg-guj'; break;
			case 'gv' 	: $code = 'lg-glv'; break;
			case 'ha' 	: $code = 'lg-hau'; break;
			case 'he' 	: $code = 'lg-heb'; break;
			case 'hi' 	: $code = 'lg-hin'; break;
			case 'ho' 	: $code = 'lg-hmo'; break;
			case 'hr' 	: $code = 'lg-hrv'; break;
			case 'ht' 	: $code = 'lg-hat'; break;
			case 'hu' 	: $code = 'lg-hun'; break;
			case 'hy' 	: $code = 'lg-hye'; break;
			case 'hz' 	: $code = 'lg-her'; break;
			case 'ia' 	: $code = 'lg-ina'; break;
			case 'id' 	: $code = 'lg-ind'; break;
			case 'ie' 	: $code = 'lg-ile'; break;
			case 'ig' 	: $code = 'lg-ibo'; break;
			case 'ii' 	: $code = 'lg-iii'; break;
			case 'ik' 	: $code = 'lg-ipk'; break;
			case 'io' 	: $code = 'lg-ido'; break;
			case 'is' 	: $code = 'lg-isl'; break;
			case 'it' 	: $code = 'lg-ita'; break;
			case 'iu' 	: $code = 'lg-iku'; break;
			case 'ja' 	: $code = 'lg-jpn'; break;
			case 'jv' 	: $code = 'lg-jav'; break;
			case 'ka' 	: $code = 'lg-kat'; break;
			case 'kg' 	: $code = 'lg-kon'; break;
			case 'ki' 	: $code = 'lg-kik'; break;
			case 'kj' 	: $code = 'lg-kua'; break;
			case 'kk' 	: $code = 'lg-kaz'; break;
			case 'kl' 	: $code = 'lg-kal'; break;
			case 'km' 	: $code = 'lg-khm'; break;
			case 'kn' 	: $code = 'lg-kan'; break;
			case 'ko' 	: $code = 'lg-kor'; break;
			case 'kr' 	: $code = 'lg-kau'; break;
			case 'ks' 	: $code = 'lg-kas'; break;
			case 'ku' 	: $code = 'lg-kur'; break;
			case 'kv' 	: $code = 'lg-kom'; break;
			case 'kw' 	: $code = 'lg-cor'; break;
			case 'ky' 	: $code = 'lg-kir'; break;
			case 'la' 	: $code = 'lg-lat'; break;
			case 'lb' 	: $code = 'lg-ltz'; break;
			case 'lg' 	: $code = 'lg-lug'; break;
			case 'li' 	: $code = 'lg-lim'; break;
			case 'ln' 	: $code = 'lg-lin'; break;
			case 'lo' 	: $code = 'lg-lao'; break;
			case 'lt' 	: $code = 'lg-lit'; break;
			case 'lu' 	: $code = 'lg-lub'; break;
			case 'lv' 	: $code = 'lg-lav'; break;
			case 'mg' 	: $code = 'lg-mlg'; break;
			case 'mh' 	: $code = 'lg-mah'; break;
			case 'mi' 	: $code = 'lg-mri'; break;
			case 'mk' 	: $code = 'lg-mkd'; break;
			case 'ml' 	: $code = 'lg-mal'; break;
			case 'mn' 	: $code = 'lg-mon'; break;
			case 'mr' 	: $code = 'lg-mar'; break;
			case 'ms' 	: $code = 'lg-msa'; break;
			case 'mt' 	: $code = 'lg-mlt'; break;
			case 'my' 	: $code = 'lg-mya'; break;
			case 'na' 	: $code = 'lg-nau'; break;
			case 'nb' 	: $code = 'lg-nob'; break;
			case 'nd' 	: $code = 'lg-nde'; break;
			case 'ne' 	: $code = 'lg-nep'; break;
			case 'ng' 	: $code = 'lg-ndo'; break;
			case 'nl' 	: $code = 'lg-nld'; break;
			case 'nn' 	: $code = 'lg-nno'; break;
			case 'no' 	: $code = 'lg-nor'; break;
			case 'nr' 	: $code = 'lg-nbl'; break;
			case 'nv' 	: $code = 'lg-nav'; break;
			case 'ny' 	: $code = 'lg-nya'; break;
			case 'oc' 	: $code = 'lg-oci'; break;
			case 'oj' 	: $code = 'lg-oji'; break;
			case 'om' 	: $code = 'lg-orm'; break;
			case 'or' 	: $code = 'lg-ori'; break;
			case 'os' 	: $code = 'lg-oss'; break;
			case 'pa' 	: $code = 'lg-pan'; break;
			case 'pi' 	: $code = 'lg-pli'; break;
			case 'pl' 	: $code = 'lg-pol'; break;
			case 'ps' 	: $code = 'lg-pus'; break;
			case 'pt' 	: $code = 'lg-por'; break;
			case 'qu' 	: $code = 'lg-que'; break;
			case 'rm' 	: $code = 'lg-roh'; break;
			case 'rn' 	: $code = 'lg-run'; break;
			case 'ro' 	: $code = 'lg-ron'; break;
			case 'ru' 	: $code = 'lg-rus'; break;
			case 'rw' 	: $code = 'lg-kin'; break;
			case 'sa' 	: $code = 'lg-san'; break;
			case 'sc' 	: $code = 'lg-srd'; break;
			case 'sd' 	: $code = 'lg-snd'; break;
			case 'se' 	: $code = 'lg-sme'; break;
			case 'sg' 	: $code = 'lg-sag'; break;
			case 'sh' 	: $code = 'lg-hbs'; break; // deprecated
			case 'hbs' 	: $code = 'lg-hbs'; break; // changed
			case 'si' 	: $code = 'lg-sin'; break;
			case 'sk' 	: $code = 'lg-slk'; break;
			case 'sl' 	: $code = 'lg-slv'; break;
			case 'sm' 	: $code = 'lg-smo'; break;
			case 'sn' 	: $code = 'lg-sna'; break;
			case 'so' 	: $code = 'lg-som'; break;
			case 'sq' 	: $code = 'lg-sqi'; break;
			case 'sr' 	: $code = 'lg-srp'; break;
			case 'ss' 	: $code = 'lg-ssw'; break;
			case 'st' 	: $code = 'lg-sot'; break;
			case 'su' 	: $code = 'lg-sun'; break;
			case 'sv' 	: $code = 'lg-swe'; break;
			case 'sw' 	: $code = 'lg-swa'; break;
			case 'ta' 	: $code = 'lg-tam'; break;
			case 'te' 	: $code = 'lg-tel'; break;
			case 'tg' 	: $code = 'lg-tgk'; break;
			case 'th' 	: $code = 'lg-tha'; break;
			case 'ti' 	: $code = 'lg-tir'; break;
			case 'tk' 	: $code = 'lg-tuk'; break;
			case 'tl' 	: $code = 'lg-tgl'; break;
			case 'tn' 	: $code = 'lg-tsn'; break;
			case 'to' 	: $code = 'lg-ton'; break;
			case 'tr' 	: $code = 'lg-tur'; break;
			case 'ts' 	: $code = 'lg-tso'; break;
			case 'tt' 	: $code = 'lg-tat'; break;
			case 'tw' 	: $code = 'lg-twi'; break;
			case 'ty' 	: $code = 'lg-tah'; break;
			case 'ug' 	: $code = 'lg-uig'; break;
			case 'uk' 	: $code = 'lg-ukr'; break;
			case 'ur' 	: $code = 'lg-urd'; break;
			case 'uz' 	: $code = 'lg-uzb'; break;
			case 've' 	: $code = 'lg-ven'; break;
			case 'vi' 	: $code = 'lg-vie'; break;
			case 'vo' 	: $code = 'lg-vol'; break;
			case 'wa' 	: $code = 'lg-wln'; break;
			case 'wo' 	: $code = 'lg-wol'; break;
			case 'xh' 	: $code = 'lg-xho'; break;
			case 'yi' 	: $code = 'lg-yid'; break;
			case 'yo' 	: $code = 'lg-yor'; break;
			case 'za' 	: $code = 'lg-zha'; break;
			case 'zh' 	: $code = 'lg-zho'; break;
			case 'zu' 	: $code = 'lg-zul'; break;
			default:
				debug_log(__METHOD__
					." Sorry, lang not defined: \"$lang_apha2\" "
					, logger::ERROR
				);
				break;
		}
		if (isset($code)) {
			$lang_code = $code;
		}

		return $lang_code;
	}//end get_lang_code_from_alpha2



	/**
	* GET_ALPHA2_FROM_CODE
	* Converts a Dédalo lg- lang code back to an ISO 639-1 two-letter alpha-2 code.
	*
	* This is the inverse of get_lang_code_from_alpha2(), but covers only a subset
	* of languages — the ones most commonly needed for HTML lang attributes, HTTP
	* Accept-Language headers, and locale strings. Languages not in this map return
	* null with an error log.
	*
	* Note: 'lg-vlca' (Valencian) maps to 'ca' because ISO 639-1 does not have a
	* separate code for Valencian.
	*
	* The large commented-out block below is the inverse of the full alpha-2 map and
	* is preserved for future expansion of this method.
	*
	* @param string $lang_code - Dédalo lang code, e.g. 'lg-spa'
	* @return string|null - ISO 639-1 alpha-2 code e.g. 'es', or null if unmapped
	*/
	public static function get_alpha2_from_code(string $lang_code) : ?string {

		$alpha2 = null;

		switch ($lang_code) {
			case 'lg-spa'	: $code = 'es';	break;
			case 'lg-eng'	: $code = 'en';	break;
			case 'lg-cat'	: $code = 'ca';	break;
			// Valencian shares the Catalan ISO 639-1 code
			case 'lg-vlca'	: $code = 'ca'; break;
			case 'lg-fra'	: $code = 'fr';	break;
			case 'lg-eus'	: $code = 'eu';	break;
			case 'lg-por'	: $code = 'pt';	break;
			case 'lg-ara'	: $code = 'ar';	break;
			case 'lg-rus'	: $code = 'ru';	break;
			case 'lg-ell'	: $code = 'el';	break;
			case 'lg-deu'	: $code = 'de';	break;
			case 'lg-ita'	: $code = 'it';	break;
			case 'lg-lat'	: $code = 'la'; break;
			case 'lg-glg'	: $code = 'gl'; break;
			case 'lg-nep'	: $code = 'ne'; break;

			/*
				case "aa" 	: $code = "lg-aar"; break;
				case "ab" 	: $code = "lg-abk"; break;
				case "ae" 	: $code = "lg-ave"; break;
				case "af" 	: $code = "lg-afr"; break;
				case "ak" 	: $code = "lg-aka"; break;
				case "am" 	: $code = "lg-amh"; break;
				case "an" 	: $code = "lg-arg"; break;
				case "ar" 	: $code = "lg-ara"; break;
				case "as" 	: $code = "lg-asm"; break;
				case "av" 	: $code = "lg-ava"; break;
				case "ay" 	: $code = "lg-aym"; break;
				case "az" 	: $code = "lg-aze"; break;
				case "ba" 	: $code = "lg-bak"; break;
				case "be" 	: $code = "lg-bel"; break;
				case "bg" 	: $code = "lg-bul"; break;
				case "bi" 	: $code = "lg-bis"; break;
				case "bm" 	: $code = "lg-bam"; break;
				case "bn" 	: $code = "lg-ben"; break;
				case "bo" 	: $code = "lg-bod"; break;
				case "br" 	: $code = "lg-bre"; break;
				case "bs" 	: $code = "lg-bos"; break;
				case "ca" 	: $code = "lg-cat"; break;
				case "ce" 	: $code = "lg-che"; break;
				case "ch" 	: $code = "lg-cha"; break;
				case "co" 	: $code = "lg-cos"; break;
				case "cr" 	: $code = "lg-cre"; break;
				case "cs" 	: $code = "lg-ces"; break;
				case "cu" 	: $code = "lg-chu"; break;
				case "cv" 	: $code = "lg-chv"; break;
				case "cy" 	: $code = "lg-cym"; break;
				case "da" 	: $code = "lg-dan"; break;
				case "de" 	: $code = "lg-deu"; break;
				case "dv" 	: $code = "lg-div"; break;
				case "dz" 	: $code = "lg-dzo"; break;
				case "ee" 	: $code = "lg-ewe"; break;
				case "el" 	: $code = "lg-ell"; break;
				case "en" 	: $code = "lg-eng"; break;
				case "eo" 	: $code = "lg-epo"; break;
				case "es" 	: $code = "lg-spa"; break;
				case "et" 	: $code = "lg-est"; break;
				case "eu" 	: $code = "lg-eus"; break;
				case "fa" 	: $code = "lg-fas"; break;
				case "ff" 	: $code = "lg-ful"; break;
				case "fi" 	: $code = "lg-fin"; break;
				case "fj" 	: $code = "lg-fij"; break;
				case "fo" 	: $code = "lg-fao"; break;
				case "fr" 	: $code = "lg-fra"; break;
				case "fy" 	: $code = "lg-fry"; break;
				case "ga" 	: $code = "lg-gle"; break;
				case "gd" 	: $code = "lg-gla"; break;
				case "gl" 	: $code = "lg-glg"; break;
				case "gn" 	: $code = "lg-grn"; break;
				case "gu" 	: $code = "lg-guj"; break;
				case "gv" 	: $code = "lg-glv"; break;
				case "ha" 	: $code = "lg-hau"; break;
				case "he" 	: $code = "lg-heb"; break;
				case "hi" 	: $code = "lg-hin"; break;
				case "ho" 	: $code = "lg-hmo"; break;
				case "hr" 	: $code = "lg-hrv"; break;
				case "ht" 	: $code = "lg-hat"; break;
				case "hu" 	: $code = "lg-hun"; break;
				case "hy" 	: $code = "lg-hye"; break;
				case "hz" 	: $code = "lg-her"; break;
				case "ia" 	: $code = "lg-ina"; break;
				case "id" 	: $code = "lg-ind"; break;
				case "ie" 	: $code = "lg-ile"; break;
				case "ig" 	: $code = "lg-ibo"; break;
				case "ii" 	: $code = "lg-iii"; break;
				case "ik" 	: $code = "lg-ipk"; break;
				case "io" 	: $code = "lg-ido"; break;
				case "is" 	: $code = "lg-isl"; break;
				case "it" 	: $code = "lg-ita"; break;
				case "iu" 	: $code = "lg-iku"; break;
				case "ja" 	: $code = "lg-jpn"; break;
				case "jv" 	: $code = "lg-jav"; break;
				case "ka" 	: $code = "lg-kat"; break;
				case "kg" 	: $code = "lg-kon"; break;
				case "ki" 	: $code = "lg-kik"; break;
				case "kj" 	: $code = "lg-kua"; break;
				case "kk" 	: $code = "lg-kaz"; break;
				case "kl" 	: $code = "lg-kal"; break;
				case "km" 	: $code = "lg-khm"; break;
				case "kn" 	: $code = "lg-kan"; break;
				case "ko" 	: $code = "lg-kor"; break;
				case "kr" 	: $code = "lg-kau"; break;
				case "ks" 	: $code = "lg-kas"; break;
				case "ku" 	: $code = "lg-kur"; break;
				case "kv" 	: $code = "lg-kom"; break;
				case "kw" 	: $code = "lg-cor"; break;
				case "ky" 	: $code = "lg-kir"; break;
				case "la" 	: $code = "lg-lat"; break;
				case "lb" 	: $code = "lg-ltz"; break;
				case "lg" 	: $code = "lg-lug"; break;
				case "li" 	: $code = "lg-lim"; break;
				case "ln" 	: $code = "lg-lin"; break;
				case "lo" 	: $code = "lg-lao"; break;
				case "lt" 	: $code = "lg-lit"; break;
				case "lu" 	: $code = "lg-lub"; break;
				case "lv" 	: $code = "lg-lav"; break;
				case "mg" 	: $code = "lg-mlg"; break;
				case "mh" 	: $code = "lg-mah"; break;
				case "mi" 	: $code = "lg-mri"; break;
				case "mk" 	: $code = "lg-mkd"; break;
				case "ml" 	: $code = "lg-mal"; break;
				case "mn" 	: $code = "lg-mon"; break;
				case "mr" 	: $code = "lg-mar"; break;
				case "ms" 	: $code = "lg-msa"; break;
				case "mt" 	: $code = "lg-mlt"; break;
				case "my" 	: $code = "lg-mya"; break;
				case "na" 	: $code = "lg-nau"; break;
				case "nb" 	: $code = "lg-nob"; break;
				case "nd" 	: $code = "lg-nde"; break;
				case "ne" 	: $code = "lg-nep"; break;
				case "ng" 	: $code = "lg-ndo"; break;
				case "nl" 	: $code = "lg-nld"; break;
				case "nn" 	: $code = "lg-nno"; break;
				case "no" 	: $code = "lg-nor"; break;
				case "nr" 	: $code = "lg-nbl"; break;
				case "nv" 	: $code = "lg-nav"; break;
				case "ny" 	: $code = "lg-nya"; break;
				case "oc" 	: $code = "lg-oci"; break;
				case "oj" 	: $code = "lg-oji"; break;
				case "om" 	: $code = "lg-orm"; break;
				case "or" 	: $code = "lg-ori"; break;
				case "os" 	: $code = "lg-oss"; break;
				case "pa" 	: $code = "lg-pan"; break;
				case "pi" 	: $code = "lg-pli"; break;
				case "pl" 	: $code = "lg-pol"; break;
				case "ps" 	: $code = "lg-pus"; break;
				case "pt" 	: $code = "lg-por"; break;
				case "qu" 	: $code = "lg-que"; break;
				case "rm" 	: $code = "lg-roh"; break;
				case "rn" 	: $code = "lg-run"; break;
				case "ro" 	: $code = "lg-ron"; break;
				case "ru" 	: $code = "lg-rus"; break;
				case "rw" 	: $code = "lg-kin"; break;
				case "sa" 	: $code = "lg-san"; break;
				case "sc" 	: $code = "lg-srd"; break;
				case "sd" 	: $code = "lg-snd"; break;
				case "se" 	: $code = "lg-sme"; break;
				case "sg" 	: $code = "lg-sag"; break;
				case "sh" 	: $code = "lg-hbs"; break;//deprecated
				case "hbs" 	: $code = "lg-hbs"; break;//changed
				case "si" 	: $code = "lg-sin"; break;
				case "sk" 	: $code = "lg-slk"; break;
				case "sl" 	: $code = "lg-slv"; break;
				case "sm" 	: $code = "lg-smo"; break;
				case "sn" 	: $code = "lg-sna"; break;
				case "so" 	: $code = "lg-som"; break;
				case "sq" 	: $code = "lg-sqi"; break;
				case "sr" 	: $code = "lg-srp"; break;
				case "ss" 	: $code = "lg-ssw"; break;
				case "st" 	: $code = "lg-sot"; break;
				case "su" 	: $code = "lg-sun"; break;
				case "sv" 	: $code = "lg-swe"; break;
				case "sw" 	: $code = "lg-swa"; break;
				case "ta" 	: $code = "lg-tam"; break;
				case "te" 	: $code = "lg-tel"; break;
				case "tg" 	: $code = "lg-tgk"; break;
				case "th" 	: $code = "lg-tha"; break;
				case "ti" 	: $code = "lg-tir"; break;
				case "tk" 	: $code = "lg-tuk"; break;
				case "tl" 	: $code = "lg-tgl"; break;
				case "tn" 	: $code = "lg-tsn"; break;
				case "to" 	: $code = "lg-ton"; break;
				case "tr" 	: $code = "lg-tur"; break;
				case "ts" 	: $code = "lg-tso"; break;
				case "tt" 	: $code = "lg-tat"; break;
				case "tw" 	: $code = "lg-twi"; break;
				case "ty" 	: $code = "lg-tah"; break;
				case "ug" 	: $code = "lg-uig"; break;
				case "uk" 	: $code = "lg-ukr"; break;
				case "ur" 	: $code = "lg-urd"; break;
				case "uz" 	: $code = "lg-uzb"; break;
				case "ve" 	: $code = "lg-ven"; break;
				case "vi" 	: $code = "lg-vie"; break;
				case "vo" 	: $code = "lg-vol"; break;
				case "wa" 	: $code = "lg-wln"; break;
				case "wo" 	: $code = "lg-wol"; break;
				case "xh" 	: $code = "lg-xho"; break;
				case "yi" 	: $code = "lg-yid"; break;
				case "yo" 	: $code = "lg-yor"; break;
				case "za" 	: $code = "lg-zha"; break;
				case "zh" 	: $code = "lg-zho"; break;
				case "zu" 	: $code = "lg-zul"; break;
			*/
			default:
				debug_log(__METHOD__
					." Sorry, lang not defined: \"$lang_code\". NULL will be returned "
					, logger::ERROR
				);
				break;
		}
		if (isset($code)) {
			$alpha2 = $code;
		}

		return $alpha2;
	}//end get_alpha2_from_code



	/**
	* GET_LOCALE_FROM_CODE
	* Returns a BCP 47 / POSIX locale string for a given Dédalo lang code.
	*
	* A handful of languages receive explicit, well-known locale overrides:
	*   lg-eng → 'en-US', lg-spa → 'es-ES', lg-cat → 'ca', lg-nep → 'ne_NP'
	*
	* All other languages fall back to their ISO 639-1 alpha-2 code (via
	* get_alpha2_from_code), which approximates a minimal BCP 47 subtag. The
	* commented-out '. '-'. strtoupper($alpha2)' portion shows an earlier design that
	* added an uppercase region suffix; it was removed because many locales do not have
	* a meaningful default region.
	*
	* @param string $lang_code - Dédalo lang code, e.g. 'lg-eng'
	* @return string - Locale string, e.g. 'en-US', 'es-ES', 'ca', 'fr'
	*/
	public static function get_locale_from_code(string $lang_code) : string {

		switch ($lang_code) {
			case 'lg-eng':	$locale = 'en-US'; break;
			case 'lg-spa':	$locale = 'es-ES'; break;
			case 'lg-cat':	$locale = 'ca'; break;
			case 'lg-nep':	$locale = 'ne_NP'; break;

			default:
				$alpha2 = lang::get_alpha2_from_code($lang_code);
				$locale = $alpha2 ; //. '-'. strtoupper($alpha2);
				break;
		}

		return $locale;
	}//end get_locale_from_code


	/**
	* GET_LABEL_LANG
	* Normalises a display lang code before using it to look up UI labels or ontology
	* translations, applying language equivalences where Dédalo does not maintain
	* separate translation data.
	*
	* Currently: Valencian ('lg-vlca') is collapsed to Catalan ('lg-cat') because the
	* ontology and UI translations are maintained in Catalan and serve both language
	* variants. Callers that need to display ontology terms or interface labels should
	* pass the lang through this method first.
	*
	* @param string $lang = DEDALO_APPLICATION_LANG - Raw display lang code
	* @return string - Normalised lang code, possibly remapped to a canonical equivalent
	*/
	public static function get_label_lang( string $lang=DEDALO_APPLICATION_LANG ) {

		// lang vlca fallback
		// Valencian shares ontology translations with Catalan; remap before any label lookup.
		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		return $lang;
	}//end get_label_lang



}//end class lang
