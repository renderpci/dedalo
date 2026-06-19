<?php declare(strict_types=1);
/**
 * CLASS TOOL_USER_ADMIN
 * UI-only tool that lets the currently logged-in user manage their own account data.
 *
 * Activated by clicking the username link in the main navigation header, this tool
 * opens a popup/modal backed by a live section dd128 (Users) record scoped to
 * page_globals.user_id. It renders a fixed ddo_map of dd128 components so the user
 * can view and update their own profile fields:
 *   - dd330  — section_id (read-only)
 *   - dd132  — username (read-only)
 *   - dd1725 — user profile (read-only)
 *   - dd452  — full name (editable)
 *   - dd133  — password (editable)
 *   - dd134  — email (editable)
 *   - dd522  — profile image (editable)
 *
 * All server-side logic lives in the inherited tool_common base and in the browser-side
 * JS modules (tool_user_admin.js / render_tool_user_admin.js). This PHP class exists
 * only to register the tool in the Dédalo tool subsystem with the correct name
 * (get_called_class() in tool_common::__construct() resolves to 'tool_user_admin') and
 * to declare an empty API_ACTIONS constant, making the tool UI-only with no server-side
 * API surface.
 *
 * Security notes:
 * - DEDALO_DEMO guard: tool_user_admin.js::build() blocks the demo user from using this
 *   tool in demo installations. The PHP API layer adds a second independent layer.
 * - No write path is exposed here: components write through their own API, not this tool.
 * - register.json dd1350 lists section tipo dd85 (root), meaning the tool button is
 *   injected at the application level, not tied to a specific content section.
 *
 * Relationships:
 * - Extends tool_common (inherits get_json, get_structure_context, get_config, etc.).
 * - No concrete subclasses.
 * - JS entry point: tools/tool_user_admin/js/tool_user_admin.js
 * - Renderer:       tools/tool_user_admin/js/render_tool_user_admin.js
 * - Registration:   tools/tool_user_admin/register.json (dd1340, section_id 9; v2.0.2)
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_user_admin extends tool_common {



	/**
	* API_ACTIONS
	* Remotely callable method allowlist enforced by dd_tools_api::tool_request (SEC-024 §9.2).
	*
	* Empty array: this is a pure UI tool with no server-side API actions of its own.
	* All user-account writes are handled by the individual component_* instances (password,
	* email, image) through their own APIs, not through this tool class.
	* Declaring [] explicitly prevents inherited tool_common static methods from being
	* dispatched against this tool name via dd_tools_api::tool_request.
	*
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [];



}//end class tool_user_admin
