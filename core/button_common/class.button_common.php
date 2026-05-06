<?php declare(strict_types=1);
/**
* BUTTON_COMMON
*
*
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

	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define mode
	protected function define_mode($mode) {	$this->mode = $mode ; }



}//end button_common
