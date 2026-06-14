<?php declare(strict_types=1);
/**
* CLASS BUTTON_COMMON
* Abstract base class for all action button models in Dédalo v7.
*
* Responsibilities:
* - Provides the shared constructor contract that every concrete button subclass
*   inherits: tipo (ontology identifier), target (the matrix-row int on which
*   the action acts), and section_tipo (the owning section's tipo).
* - Bootstraps each button instance via parent::load_structure_data(), which
*   populates the ontology node, model, label, translatable flag, and
*   properties from the cached ontology graph.
* - Exposes the four protected define_*() helpers (id, tipo, lang, mode) so
*   subclasses and controllers can set identity state without touching
*   properties directly.
* - Adds $target (the int section-id / matrix-row the action targets) and
*   $context_tipo (the ontology tipo of the calling context) on top of the
*   identity fields already declared on common.
*
* Concrete subclasses (each adds no new members; the class name alone drives
* the controller-dispatch convention used by common::get_json()):
* - button_delete  — removes the record identified by $target
* - button_new     — creates a new record in the owning section
*
* Design notes:
* - Buttons are discovered as children of a section or area in the ontology
*   graph and are surfaced to the client by common::get_buttons_context() only
*   when the current user has permission level >= 2 for that button's tipo.
* - The permission gate for record creation (button_new) is resolved by
*   security::get_section_new_permissions() and ts_object::get_permissions_element().
* - A button carries no persistent data of its own; its JSON output (e.g.
*   button_new_json.php) always returns an empty $data array alongside the
*   ontology context envelope.
* - $lang is set to DEDALO_APPLICATION_LANG (UI locale) rather than the
*   data lang, because button labels come from the ontology term, not from
*   the data matrix.
*
* Extends: common
* Extended by: button_delete, button_new
*
* @package Dédalo
* @subpackage Core
*/
class button_common extends common {



	/**
	* CLASS VARS
	*/

		/**
		 * Target section ID or record identifier the button operates on.
		 * Typically a matrix table ID (int) for delete/edit operations.
		 * @var string|int|null $target
		 */
		public string|int|null $target = null;

		/**
		 * Unique identifier for this button instance.
		 * Set via define_id(), often null for simple action buttons.
		 * @var string|int|null $id
		 */
		public string|int|null $id = null;

		/**
		 * Tipo of the calling context (department, section, area, etc.).
		 * Represents who instantiated the button, regardless of the button's own model.
		 * Examples: 'dd12' (department), 'dd323' (section).
		 * @var ?string $context_tipo
		 */
		public ?string $context_tipo = null;



	/**
	* __CONSTRUCT
	* Initialises a button instance with its ontology identity, its target
	* matrix-row, and the section it belongs to, then loads the ontology node.
	*
	* Sequence:
	* 1. Assigns tipo, target, and section_tipo.
	* 2. Calls define_id(null) — buttons have no persistent record id of their own.
	* 3. Sets lang to DEDALO_APPLICATION_LANG so the button label is resolved in
	*    the UI locale (ontology term), not in the data language.
	* 4. Invokes parent::load_structure_data() to populate model, label,
	*    translatable, and properties from the ontology cache.
	* 5. Validates that $target, when non-empty, is an int.  Any other type
	*    (e.g. a string section_id such as 'temp1') is rejected because buttons
	*    only make sense against persisted, integer-keyed matrix rows.
	*
	* (!) The error message in the Exception says "delete button" but this
	*     constructor is shared by all subclasses (button_new, button_delete, …).
	*     That wording is a pre-existing inaccuracy — do not rely on it to infer
	*     subclass type at runtime.
	*
	* @param string $tipo        - Ontology tipo of this button (e.g. 'hierarchy11').
	* @param int    $target      - Matrix-table row ID the button acts upon.
	* @param string $section_tipo - Tipo of the section that owns this button.
	* @throws Exception When $target is non-empty and not an int.
	*/
	function __construct(string $tipo, int $target, string $section_tipo) {

		$this->tipo 		= $tipo;
		$this->target 		= $target;
		$this->section_tipo = $section_tipo;

		$this->define_id(NULL);
		$this->define_lang(DEDALO_APPLICATION_LANG);

		parent::load_structure_data();

		# Target is normally a int section id matrix
		if(!empty($target) && !is_int($target)) throw new Exception("Error creating delete button (target '$target' is not valid int id matrix)", 1);
	}

	/**
	* DEFINE_ID
	* Sets the instance identifier for this button.
	* Buttons typically pass null because they do not correspond to a persisted
	* data record; a non-null value may be assigned by specialised callers that
	* need to distinguish multiple instances of the same button tipo.
	* @param string|int|null $id [= null] - Instance identifier, or null.
	* @return void
	*/
	protected function define_id($id) {	$this->id = $id ; }

	/**
	* DEFINE_TIPO
	* Overrides the ontology tipo for this button after construction.
	* Rarely needed outside the constructor; provided for subclasses or
	* specialised factory flows that need to swap the tipo post-init.
	* @param string $tipo - New ontology tipo string.
	* @return void
	*/
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }

	/**
	* DEFINE_LANG
	* Sets the language code used to resolve human-readable labels for this button.
	* Buttons use DEDALO_APPLICATION_LANG (the UI locale) rather than a data
	* language, because their labels originate from ontology terms.
	* @param string $lang - Language code (e.g. 'lg-eng').
	* @return void
	*/
	protected function define_lang($lang) {	$this->lang = $lang ; }

	/**
	* DEFINE_MODE
	* Sets the rendering mode for this button (e.g. 'edit', 'list').
	* Mode is used by the HTML controller (e.g. button_delete.php) to select
	* the correct .phtml template; unknown modes are rejected by an allowlist
	* check in those controllers (see SEC-054 guard in button_delete.php).
	* @param string $mode - Mode identifier.
	* @return void
	*/
	protected function define_mode($mode) {	$this->mode = $mode ; }



}//end button_common
