<?php
/**
* CLASS TOOL_INDEXATION
*
*
*/
class tool_indexation extends tool_common {



	/**
	* SEC-024 (§9.2): UI-only tool. No remotely callable methods.
	* Indexation actions go through `dd_component_*_api` (see §5.11).
	*/
	public const API_ACTIONS = [];



}//end class tool_indexation
