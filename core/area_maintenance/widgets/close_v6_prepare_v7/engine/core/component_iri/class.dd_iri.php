<?php declare(strict_types=1);
/**
* CLASS DD_IRI
* Value-object (DTO) that represents a single IRI entry managed by component_iri.
*
* Each component_iri dato item is stored as a dd_iri instance (or a compatible plain object)
* inside the component's data array. The class extends stdClass so that JSON serialization
* and property_exists() introspection work without extra adapters.
*
* Persisted data shape (JSON stored in the matrix JSONB column):
* {
*     "id":    1,            // (int)    per-component monotonic counter; keys the dataframe pairing
*     "iri":   "https://…", // (string) the Internationalized Resource Identifier (required)
*     "title": "My org"     // (string) deprecated inline label; authoritative label lives in the
*                           //          paired label dataframe (dd560/DEDALO_COMPONENT_IRI_LABEL_DATAFRAME)
* }
*
* Property semantics:
* - $iri   — the validated URL/URI string; scheme + host are mandatory.
* - $title — legacy human-readable label kept for read-path fallback during migration
*            (resolve_title() prefers the dataframe value; see component_iri::resolve_title()).
* - $id    — unique within one component instance; used as the pairing key (id_key) between
*            the data item and its label dataframe locator. NOT auto-assigned here — callers
*            (set_dato in component_iri) manage the per-component counter.
* - $label_id — transient, import-only property: carries the target section_id of the label
*              dataframe record to create/link on save. This property is NEVER persisted;
*              it is stripped before the data is written to the database.
*
* (!) Properties are created on the fly (stdClass semantics). An instance can be partially
* populated; callers must guard with isset() / property_exists() rather than assuming all
* four properties exist.
*
* @package Dédalo
* @subpackage Core
*/
class dd_iri extends stdClass {



	/**
	* CLASS VARS
	*/

	/**
	* The IRI (URL/URI) string.
	* Scheme and host are required; validated on assignment via set_iri().
	* @var ?string $iri
	*/
	public ?string $iri = null;

	/**
	* Human-readable label for the IRI.
	* Deprecated: the authoritative label now lives in the paired label dataframe
	* (DEDALO_COMPONENT_IRI_LABEL_DATAFRAME slot). This property is kept as a
	* read-path fallback until the title-materialization migration completes.
	* @var ?string $title
	*/
	public ?string $title = null;

	/**
	* Monotonic per-component item identifier.
	* Doubles as the pairing key (id_key) for the label dataframe locator.
	* Unlike most Dédalo component IDs this value IS meaningful on import —
	* callers may supply it explicitly to control the dataframe pairing.
	* @var ?int $id
	*/
	public ?int $id = null;

	/**
	* Transient import-only property: target section_id for the label dataframe.
	* When present, import_save() uses this value to build the dataframe locator
	* and then removes the property before persisting the data.
	* Never stored in the database.
	* @var ?int $label_id
	*/
	public ?int $label_id = null;

	/**
	* Separator used when building composite keys from dd_iri parts.
	* Not currently used in public API but reserved for internal utilities.
	*/
	const DELIMITER = '_';



	/**
	* __CONSTRUCT
	* Creates a dd_iri instance, optionally hydrating it from a plain data object.
	*
	* Each property in $data is dispatched to the corresponding set_<property>() method.
	* Unknown keys are rejected with a logger::ERROR entry so that callers discover
	* schema drift at runtime rather than silently losing data.
	*
	* @param object|null $data [= null] - plain object with any subset of {iri, title, id, label_id}
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		if (empty($data)) {
			return;
		}

		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			if (method_exists($this, $method)) {
				// Execute the setter
				$this->$method($value);
			}else{
				debug_log(__METHOD__
					.' Ignored invalid property: "'.$key.'" is not defined as set method.' . PHP_EOL
					.' key: ' . to_string($key) . PHP_EOL
					.' value: ' . to_string($value)
					, logger::ERROR
				);
			}
		}
	}



	/**
	* SET_IRI
	* Validates and assigns the IRI string.
	*
	* Parses the value with parse_url() and emits a logger::ERROR if either the
	* scheme or host component is absent — the value is still assigned so that
	* partially-formed IRIs are not silently dropped during editing.
	*
	* A null/empty value clears the property without logging.
	*
	* @param string|null $value - IRI string, e.g. 'https://example.org/items/42'
	* @return void
	*/
	public function set_iri( ?string $value ) : void {

		if (!empty($value)) {
			$iri = parse_url($value);
			if(empty($iri['scheme']) || empty($iri['host'])){
				debug_log(__METHOD__
					. " Invalid IRI value " . PHP_EOL
					. ' value: ' . to_string($value)
					, logger::ERROR
				);
			}
		}

		$this->iri = $value;
	}//end set_iri



	/**
	* SET_TITLE
	* Assigns the human-readable label displayed alongside the IRI.
	*
	* Kept for backward compatibility with data that still carries an inline title.
	* New data should store the label through the dataframe pairing (label_id / label
	* dataframe slot); resolve_title() in component_iri prefers that path.
	*
	* @param string $value - display label, e.g. 'My organisation'
	* @return void
	*/
	public function set_title( string $value ) : void {

		$this->title = $value;
	}//end set_title



	/**
	* SET_ID
	* Assigns the per-item identifier.
	*
	* Accepts a string to accommodate JSON-decoded integers arriving as strings.
	* Always stored as int because the dataframe pairing (id_key) requires an integer.
	*
	* @param string|int $value - item id; must be a positive integer in practice
	* @return void
	*/
	public function set_id( string|int $value ) : void {

		$this->id = (int)$value;
	}//end set_id



	/**
	* SET_LABEL_ID
	* Assigns the transient import-only label dataframe target section_id.
	*
	* This property signals to component_iri::import_save() which section_id should
	* be used as the pairing target for the label dataframe locator. It is stripped
	* before the data is written to the database and is NEVER persisted.
	*
	* Accepts a string to accommodate JSON-decoded integers arriving as strings.
	*
	* @param string|int $value - target section_id in the label dataframe section (dd1706)
	* @return void
	*/
	public function set_label_id( string|int $value ) : void {

		$this->label_id = (int)$value;
	}//end set_label_id



	/**
	* SET_IRI_FROM_URL_PARTS
	* Builds and assigns the $iri property by assembling a URL from its parsed components.
	*
	* Accepts an object whose properties mirror the array returned by PHP's parse_url():
	*   scheme   (string) — required, e.g. 'https'
	*   host     (string) — required, e.g. 'example.org'
	*   port     (int)    — optional
	*   user     (string) — optional
	*   pass     (string) — optional; only emitted when $user is also set
	*   path     (string) — optional, leading '/' is added automatically
	*   query    (string) — optional, prepended with '?'
	*   fragment (string) — optional, prepended with '#'
	*
	* (!) Scheme and host are mandatory; an Exception is thrown if either is absent.
	*
	* Note: the assembled URL concatenates scheme and host WITHOUT the '://' separator
	* (the caller is expected to include it in the scheme value, e.g. 'https://').
	*
	* @param object $url_parts - object with URL components (see above)
	* @return void
	* @throws Exception when scheme or host is missing
	*/
	public function set_iri_from_url_parts( object $url_parts ) : void {

		$scheme		= $url_parts->scheme; //mandatory
		$host		= $url_parts->host; //mandatory
		$port		= $url_parts->port ?? null; //optional
		$user		= $url_parts->user ?? null; //optional
		$pass		= $url_parts->pass ?? null; //optional
		$path		= $url_parts->path ?? null; //optional
		$query		= $url_parts->query ?? null; //optional
		$fragment	= $url_parts->fragment ?? null; //optional

		if(empty($scheme) || empty($host)){
			throw new Exception("Error Processing Request. Invalid url_parts: ".to_string($url_parts), 1);
		}
		$url= '';

		if (!empty($user)) {
			$url .= $user;
		}

		if (!empty($pass)) {
			$url .= ':'.$pass .'@';
		}else if(!empty($user)){
			$url .= '@';
		}

		$url .= (string)$scheme.(string)$host;

		if (!empty($port)) {
			$url .= ':'.(string)$port;
		}

		if (!empty($path)) {
			$url .= '/'.(string)$path;
		}
		if (!empty($query)) {
			$url .= '?'.(string)$query;
		}
		if (!empty($fragment)) {
			$url .= '#'.(string)$fragment;
		}

		$this->iri = $url;
	}//end set_iri_from_url_parts



	/**
	* GET METHODS
	* Generic property read-accessor via PHP's magic __call mechanism.
	*
	* Any call to get_<property>() that has no explicit method defined is handled here.
	* If the named property exists and is not null, its value is returned as a string.
	* Otherwise false is returned.
	*
	* Example: $dd_iri->get_iri() returns (string) $this->iri or false.
	*
	* The commented-out 'set_' case below is a placeholder for a symmetric
	* write-accessor that was never implemented; it is left for reference.
	*
	* @param string $strFunction - called method name, e.g. 'get_iri'
	* @param array  $arArguments - positional arguments passed to the call (unused for getters)
	* @return mixed - string value on success, false when the property is absent or null
	*/
	public function __call(string $strFunction, array $arArguments) : mixed {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			#case 'set_' :
			#	if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
			#	return($this->SetAccessor($strMethodMember, $arArguments[0]));
			#	break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
		}
		return(false);
	}

	/**
	* GETACCESSOR
	* Internal helper used by __call to read a named property.
	*
	* Returns the property value cast to string when the property exists and is
	* non-null; returns false otherwise. Casting to string allows callers to use
	* the result directly in string context without additional type checks.
	*
	* @param string $variable - property name (e.g. 'iri', 'title')
	* @return string|false - property value as string, or false if absent/null
	*/
	private function GetAccessor(string $variable) : string|false {
		if(property_exists($this, $variable) && $this->$variable !== null) {
			return (string)$this->$variable;
		}else{
			return false;
		}
	}



}//end dd_iri
