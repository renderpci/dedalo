<?php

class Accessors {
	
	
	# ACCESSORS
	public function __call($strFunction, $arArguments) {
		
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
	
	private function SetAccessor($strMember, $strNewValue) {
		
		if(property_exists($this, $strMember)) {
			
			if(is_numeric($strNewValue)) {
				#eval(' $this->' . $strMember .'=' . $strNewValue . ';');
				$this->$strMember = $strNewValue;
			}elseif(is_string($strNewValue)) {
				# stripslashes and addslashes text values 			
				$strNewValue = stripslashes($strNewValue);
				$strNewValue = addslashes($strNewValue);
				$this->$strMember = $strNewValue;	
			}elseif(is_object($strNewValue)) {
				dump($strNewValue);
				error_log("Error trying set var $this->$strMember to no string/numeric value var_export($strNewValue,false); ");
				die();
			}else{
				$this->$strMember = $strNewValue;	
			}
		}else{
			return(false);
		}
	}
	
	private function GetAccessor($strMember) {
		
		if(property_exists($this, $strMember)) {
			#eval(' $strRetVal = $this->' . $strMember .';');
			$strRetVal = $this->$strMember;
			# stripslashes text values
			if(is_string($strRetVal)) $strRetVal = stripslashes($strRetVal);
			return($strRetVal);
		}else{
			return(false);
		}
	}
		
}
?>