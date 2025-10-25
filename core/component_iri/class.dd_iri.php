<?php declare(strict_types=1);
/**
* CLASS DD_IRI
*
* 	DTO that defines each compoent_iri value schema and validation.
*
*	Format:
*	{
*		"iri": "https://dedalo.dev",
*		"title": "dedalo"
*	}
*	$iri->iri	= (string) $iri; // mandatory
*	$iri->title	= (string) $title; // additional no mandatory
*
*	(!) Note that properties can exists or not (are created on the fly).
* 	The resulting object contains only the properties assigned to it and IRI object can be empty or partially set.
*	For example, one link without title ,have only $iri property
*/
class dd_iri extends stdClass {



	const DELIMITER = '_';



	/**
	* __CONSTRUCT
	* @param object|null $data
	*	optional . Default is null
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
	* Set IRI value with check
	* Expected format is 'https://my_domain/org/item=1'
	* @param string|null $value
	* @return void
	*/
	public function set_iri( ?string $value ) {

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
	* Set the title or label to show in the web or other places
	* Expected descriptive string as 'My organization'
	* @param string $value
	*/
	public function set_title( string $value ) {

		$this->title = $value;
	}//end set_title



	/**
	* SET_ID
	* Set the id property of the IRI value element.
	* The value set is always an integer, but a string is accepted as a parameter.
	* @param string|int $value
	*/
	public function set_id( string|int $value ) {

		$this->id = (int)$value;
	}//end set_id



	/**
	* SET_LABEL_ID
	* Set a temporal label id property of the IRI value element.
	* Used by import process to define the target section_id of the IRI label dataframe.
	* This property is not part of data schema of the component_iri
	* and this property is not saved.
	* The value set is always an integer, but a string is accepted as a parameter.
	* @param string|int $value
	*/
	public function set_label_id( string|int $value ) {

		$this->label_id = (int)$value;
	}//end set_label_id



	/**
	* SET_IRI_FROM_URL_PARTS
	* @param object $url_parts
	*/
	public function set_iri_from_url_parts( object $url_parts ) {

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
	* By accessors. When property exits, return property value, else return null
	*/
	public function __call($strFunction, $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			#case 'set_' :
			#	if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
			#	return($this->SetAccessor($strMethodMember, $arArguments[0]));
			#	break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	private function GetAccessor(string $variable) {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;
		}else{
			return false;
		}
	}



}//end dd_iri
