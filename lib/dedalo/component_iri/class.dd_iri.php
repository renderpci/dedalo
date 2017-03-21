<?php
/*
* CLASS DD_IRI

	Format:
	*[ 
	*	{
	*    "iri": "http://www.render.es/dedalo",
	*    "display": "dedalo"
	* 	}
	*]
	$iri->iri						= (string)$iri; //mandatory
	$iri->display					= (string)$display; //aditional no mandatory

	Note that properties can exists or not (are created on the fly). Final result object only contain set properties and iri object can be empty or partially set.
	For example, one link with display have only $iri

*/
class dd_iri extends stdClass {

	/* Created on the fly
		private $iri;
		private $display;
	*/

	# Mandatory and protected (use set/get to access)
	#protected $iri;
	#protected $display;

	const DELIMITER = '_';


	/**
	* __CONSTRUCT
	* @param object $data 
	*	optional . Default is null
	*/
	public function __construct( $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return false;
		}
		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			$this->$method($value);
		}
	}


	/**
	* SET  METHODDS
	* Verify values and set property to current object
	*/
	/**
	* SET_IRI
	*/
	public function set_iri($value) {

		$iri = parse_url($value);
		if(empty($iri['scheme']) || empty($iri['host'])){
				throw new Exception("Error Processing Request. Invalid iri: $value", 1);
		}
		$this->iri = (string)$value;
	}



	/**
	* SET  METHODDS
	* Verify values and set property to current object
	*/
	/**
	* SET_DSIPLAY
	*/
	public function set_display($value) {

		$this->display = (string)$value;
	}





	/**
	* SET_IRI_FROM_URL_PARTS
	* @param object $url_parts
	*/
	public function set_iri_from_url_parts($url_parts) {

		$scheme		= $url_parts->scheme;//mandatory
		$host		= $url_parts->host;//mandatory
		$port 		= isset($url_parts->port) ? $url_parts->port :null;//optional
		$user 		= isset($url_parts->user) ? $url_parts->user :null;//optional
		$pass 		= isset($url_parts->pass) ? $url_parts->pass :null;//optional
		$path 		= isset($url_parts->path) ? $url_parts->path :null;//optional
		$query 		= isset($url_parts->query) ? $url_parts->query :null;//optional
		$fragment 	= isset($url_parts->fragment) ? $url_parts->fragment :null;//optional
		
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
	}#end set_iri_from_url_parts
	


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
	private function GetAccessor($variable) {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;			
		}else{
			return false;
		}
	}


	/**
	* DESTRUCT
	* On destruct object, test if minimun data is set or not
	*/
	function __destruct() {

	}//end __destruct



}//end dd_iri
?>