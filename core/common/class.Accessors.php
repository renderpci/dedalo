<?php declare(strict_types=1);
/**
* CLASS ACCESSORS
* Generic magic-accessor base class for Dédalo's property get/set convention.
*
* Provides a `__call` interceptor that routes any method call whose name
* starts with "set_" or "get_" to a typed property accessor:
*
*   $obj->set_tipo('dd123');   // writes $obj->tipo = 'dd123'
*   $obj->get_tipo();          // reads  $obj->tipo
*
* This lets callers use a stable, consistent API across all Dédalo objects
* without writing boilerplate getter/setter pairs for every property.
*
* The approach is intentionally lightweight:
* - Only properties that already exist on the concrete class are accessible.
*   Attempts to set or get an undeclared property return false silently.
* - No type coercion is applied; the raw value is stored as-is.
* - `__call` is `final` to prevent subclasses from overriding the dispatch loop.
*
* Note: class.common.php duplicates this pattern with an extended `__call`
* that also delegates to diffusion_fn. This standalone class is used where
* the full common base is not appropriate.
*
* @package Dédalo
* @subpackage Core
*/
class Accessors {


	# ACCESSORS
	/**
	* __CALL
	* Magic dispatcher for dynamic set_ and get_ method calls.
	*
	* Strips the four-character prefix ("set_" or "get_") to derive the
	* target property name, then delegates to SetAccessor or GetAccessor.
	* Calls that match neither prefix fall through and return false.
	*
	* @param string $strFunction   - the called method name, e.g. "set_tipo" or "get_label"
	* @param array  $arArguments   - arguments passed to the call; set_ expects exactly one
	* @return mixed                - the property value (get_), true on success (set_), or false on failure
	*/
	final public function __call(string $strFunction, array $arArguments) : mixed {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return $this->SetAccessor($strMethodMember, $arArguments[0]);
			case 'get_' :
				return $this->GetAccessor($strMethodMember);
		}
		return false;
	}
	# SET
	/**
	* SETACCESSOR
	* Writes $strNewValue to a named property on the concrete instance.
	*
	* Silently returns false if the property does not exist on the class,
	* avoiding dynamic property creation (which PHP 8.2+ deprecates).
	*
	* @param string $strMember   - property name without the "set_" prefix
	* @param mixed  $strNewValue - value to assign; no type coercion is applied
	* @return bool               - true when the property exists and was written; false otherwise
	*/
	private function SetAccessor(string $strMember, mixed $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix property value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	/**
	* GETACCESSOR
	* Reads a named property from the concrete instance.
	*
	* Returns false (not null) when the property does not exist, so callers
	* can distinguish "property is null" from "property was never declared".
	*
	* @param string $strMember - property name without the "get_" prefix
	* @return mixed            - the current property value, or false if the property does not exist
	*/
	private function GetAccessor(string $strMember) : mixed {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class Accessors
