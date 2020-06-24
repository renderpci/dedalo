<?php
// include class.xml.php file
	// require_once 'class.xml.php';


/**
* XML_DCNAV_PARSER
*/
class xml_dcnav_parser {
	
	
	/**
	* PARSE_FILE
	* @return array $ar_items
	*/
	public static function parse_file($file) {
		
		$xml = new xml($file);

		// first key check to determine multiple
			$first_key = array_key_first($xml->data['rdf:RDF']);

		// base rdf. can be multi or mono
			$base = ($first_key===0)
				? $xml->data['rdf:RDF'] // multi
				: [$xml->data['rdf:RDF']]; // direct

		// items with data grouped
			$ar_items = [];
			foreach ($base as $key => $element) {
				if ($key===0) {
					// descripción
					$item = self::group_data_d($element);
					$ar_items[] = $item;
				}else{
					// punto de accceso
					$item = self::group_data_pa($element);
					$ar_items[] = $item;
				}	
			}

		// json version
			// $json_data = json_encode($ar_items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

		return $ar_items;
	}//end parse_file



	/**
	* GROUP_DATA_D
	*/
	public static function group_data_d($element) {

		$item = new stdClass();
			$item->type		= 'description';
			$item->value	= [];
		
		foreach ((array)$element as $type => $value) {
			
			switch ($type) {
				case '@rdf:about':
					// $item->about = $value; // string
					$c_element = new stdClass();
						$c_element->prefix	= 'rdf';
						$c_element->local	= 'about';
						$c_element->cmp		= null;
						$c_element->tip		= null;
						$c_element->value	= $value;	
					$item->value[] = $c_element;				
					break;			
				case 'rdf:Description':				
					foreach ($value as $key => $ar_cvalue) {				
						foreach ($ar_cvalue as $ckey => $cvalue) {
							$parts = explode(':', $ckey);
							$c_element = new stdClass();
								$c_element->prefix	= $parts[0];
								$c_element->local	= $parts[1];
								$c_element->cmp		= null;
								$c_element->tip		= null;
								$c_element->value	= $cvalue;

							$item->value[] = $c_element;
						}
					}
					break;
			}
		}

		return $item;
	}//end group_data_d



	/**
	* GROUP_DATA_PA
	*/
	public static function group_data_pa($element) {

		$item = new stdClass();
			$item->type		= 'access_point';
			$item->value	= [];
		
		foreach ((array)$element as $type => $value) {
			
			switch ($type) {
				case '@rdf:about':
					$c_element = new stdClass();
						$c_element->prefix	= 'rdf';
						$c_element->local	= 'about';
						$c_element->cmp		= null;
						$c_element->tip		= null;
						$c_element->value	= $value;	
					$item->value[] = $c_element;				
					break;			
				case 'rdf:Description':							
					foreach ($value as $key => $ar_cvalue) {
						// print_r($ar_cvalue);

						$c_element = new stdClass();
					
						foreach ($ar_cvalue as $ckey => $cvalue) {

							$parts = explode(':', $ckey);

							if (isset($parts[1])) {

								$c_element->prefix	= $parts[0];
								$c_element->local	= $parts[1];
								$c_element->value	= $cvalue;
							
							}else{

								if (strpos($ckey, '@')===0) {
									$name = substr($ckey, 1); 
									$c_element->{$name} = $cvalue;
								}
							}							
						}
						$item->value[] = $c_element;
					}
					break;
			}
		}

		return $item;
	}//end group_data_pa



}//xml_dcnav_parser


