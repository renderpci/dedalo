<?php



/**
* CLASS LAYOUT PRINT
* Based on class 'locator' concept
* Used from class component layout to standarize object layout_print
*/

/*
{
    "classes": {
        "page": {
            "position": "absolute",
            "left": "25px",
            "top": "361px",
            "width": "841px",
            "height": "133px"
        },
        "component_box": {
            "position": "absolute",
            "left": "25px",
            "top": "361px",
            "width": "841px",
            "height": "133px"
        }
    },
    "pages": [
        {
            "html_id": "page1",
            "data": {
                "section_tipo": "oh1"
            },
            "css": {
                "class": [
                    "page",
                    "fixed"
                ],
                "style": {
                    "border": "none"
                }
            },
            "components": [
                {
                    "html_id": "oh64_1",
                    "data": {
                        "parent_section": "oh1"
                    },
                    "css": {
                        "class": [
                            "component_boxborder_box",
                            "dedalo_component"
                        ],
                        "style": {
                            "position": "absolute",
                            "left": "25px",
                            "top": "361px",
                            "width": "841px",
                            "height": "133px"
                        }
                    }
                }
            ]
        }
    ]
}

*/


class layout_print extends stdClass {	

	/**
	* __CONSTRUCT
	* @param object $data optional
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
		/*
		if (!isset($this->section_tipo)) {
			dump($this, ' this');
			#dump(debug_backtrace(), 'debug_backtrace()');
			throw new Exception("Error Processing Request. locator section_tipo is mandatory", 1);			
		}
		if (!isset($this->section_id)) {
			dump($this, ' this');
			throw new Exception("Error Processing Request. locator section_id is mandatory", 1);			
		}
		*/
	}


}
?>