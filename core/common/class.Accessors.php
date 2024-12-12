<?php declare(strict_types=1);

class Accessors {


	# ACCESSORS
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return $this->SetAccessor($strMethodMember, $arArguments[0]);
				break;
			case 'get_' :
				return $this->GetAccessor($strMethodMember);
				break;
		}
		return false;
	}
	# SET
	private function SetAccessor(string $strMember, $strNewValue) {

		if(property_exists($this, $strMember)) {

			// fix property value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	private function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class Accessors
