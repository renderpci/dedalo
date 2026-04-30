<?php declare(strict_types=1);
/**
 * CLASS TOOL_USER_ADMIN
 * Provides user administration interface and administrative functions for the current user.
 *
 * This tool is activated from the user menu (click on user name in header) and provides
 * administrative actions for the logged-in user. It extends the base tool_common class
 * to inherit standard tool functionality including context generation and JSON serialization.
 *
 * Tool activation:
 * - Triggered by user click on username in main menu
 * - Provides user-specific administrative options
 * - Inherits standard tool behavior from tool_common
 *
 * Extends tool_common for:
 * - Tool context management and JSON generation
 * - Section-based tool handling
 * - Standard tool registration and initialization
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_user_admin extends tool_common {



	/**
	* SEC-024 (§9.2): UI-only tool. No remotely callable methods. The empty
	* allowlist prevents inherited tool_common static methods from being
	* dispatched via `dd_tools_api::tool_request` against this tool name.
	*/
	public const API_ACTIONS = [];



}//end class tool_user_admin
