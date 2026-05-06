<?php declare(strict_types=1);
/**
 * CLASS TOOL_CATALOGING
 *
 * This tool facilitates the grouping and hierarchization of cultural assets or other
 * data entities. It allows users to build complex structures (like thesauruses) by
 * dragging and dropping records from source sections into a target hierarchy.
 *
 * Example use case: Organizing numismatic types within specific mints.
 *
 * It extends tool_common to inherit standard tool functionality.
 *
 * @package    Dédalo
 * @subpackage Tools
 */
class tool_cataloging extends tool_common {



	/**
	* SEC-024 (§9.2): UI-only tool. No remotely callable methods.
	*/
	public const API_ACTIONS = [];



}//end class tool_cataloging
