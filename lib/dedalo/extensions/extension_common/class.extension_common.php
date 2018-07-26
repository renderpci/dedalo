<?php
/*
* CLASS COMPONENT_AUTOCOMPLETE
*
*
*/
class extension_common extends extension_common {


	public $tipo;
	public $modo;
	public $propiedades;
	

	/**
	* __CONSTRUCT
	* Component constructor
	*/
	public function __construct($tipo, $modo='edit') {

		$this->tipo = $tipo;
		$this->modo = $modo;

		return true;
	}//end __construct



	/**
	* GET_PROPIEDADES
	* @return object $propiedades
	*/
	public function get_propiedades() {

		if (isset($this->propiedades)) {
			return $this->propiedades;
		}

		$tipo = $this->get_tipo();

		$RecordObj_dd 		= new RecordObj_dd($tipo);
		$this->propiedades 	= $RecordObj_dd->get_propiedades(true);

		return $this->propiedades;
	}//end get_propiedades



	# ACCESSORS
		final public function __call($strFunction, $arArguments) {
			
			$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
			$strMethodMember 	= substr($strFunction, 4);
			switch($strMethodType) {
				case 'set_' :
					if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
					return($this->SetAccessor($strMethodMember, $arArguments[0]));
					break;
				case 'get_' :
					return($this->GetAccessor($strMethodMember));
					break;
			}
			return(false);
		}
		# SET
		final private function SetAccessor($strMember, $strNewValue) {
			
			if(property_exists($this, $strMember)) {
				$this->$strMember = $strNewValue;
			}else{
				return(false);
			}
		}
		# GET
		final private function GetAccessor($strMember) {
			
			if(property_exists($this, $strMember)) {
				$strRetVal = $this->$strMember;
				# stripslashes text values
				#if(is_string($strRetVal)) $strRetVal = stripslashes($strRetVal);
				return($strRetVal);
			}else{
				return(false);
			}
		}//end GetAccessor



}
?>