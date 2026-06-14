<?php declare(strict_types=1);
/**
* EXPORT_CONTEXT
*
* Per-call context passed to component_common::get_export_value().
*
* Replaces the legacy instance mutations of the export path:
* - request_config injection (show->ddo_map)	-> $this->ddo_map argument
* - column_obj injection						-> $this->path_prefix
* - $component->caller === 'tool_export' checks	-> $this->absolute_urls flag
*
* Because the context travels as an argument and component instances are
* no longer specialized per export column, instance caching becomes safe
* (kept disabled in phase 1 for parity; see plan).
*/
class export_context {



	/**
	 * Segments accumulated so far (root first). The calling relation
	 * pushes the child hop segment before descending; the component
	 * itself appends its own segment when building atoms.
	 * @var array $path_prefix
	 */
	public array $path_prefix = [];

	/**
	 * The component own ddo as passed by the caller (tool_export ddo_map
	 * entry). Carries optional fields_separator / records_separator /
	 * class_list overrides, same object the legacy get_grid_value($ddo)
	 * received.
	 * @var ?object $ddo
	 */
	public ?object $ddo = null;

	/**
	 * Flattened descendant ddo_map the component must use to resolve its
	 * children (relation components only). Replaces the legacy
	 * request_config->show->ddo_map injection.
	 * @var array $ddo_map
	 */
	public array $ddo_map = [];

	/**
	 * True when media URLs must be absolute (tool_export case).
	 * Replaces the $this->caller==='tool_export' switches in media components.
	 * @var bool $absolute_urls
	 */
	public bool $absolute_urls = false;

	/**
	 * Informational caller name ('tool_export', ...). No component
	 * behavior should depend on it; use explicit flags instead.
	 * @var string $caller
	 */
	public string $caller = '';

	/**
	 * True when relation components must also export the ancestor chain
	 * of every locator target (thesaurus/hierarchy parents) as a sibling
	 * 'parents' sub-column. Targets without parents emit nothing.
	 * Mirrors the list-view ddinfo 'value_with_parents' behavior
	 * (see common::get_ddinfo_parents). Default false.
	 * @var bool $value_with_parents
	 */
	public bool $value_with_parents = false;

	/**
	 * Recursion depth sanity guard (recursion is naturally bounded by ddo_map)
	 * @var int $depth
	 */
	public int $depth = 0;

	/**
	 * 0 based position of the relation data item (locator) the calling
	 * relation traversed to reach this component. The component
	 * incorporates it into its own path segment (item_index), so the
	 * tabulator can explode relation items into rows or columns.
	 * Null when not reached through a relation item.
	 * @var ?int $item_index
	 */
	public ?int $item_index = null;

	/**
	 * section_id of the traversed locator (informational; lands on the
	 * component own path segment)
	 * @var ?int $item_section_id
	 */
	public ?int $item_section_id = null;



	/**
	* __CONSTRUCT
	* @param object|null $options = null
	* 	Optional properties: path_prefix, ddo, ddo_map, absolute_urls, caller, depth
	*/
	public function __construct( ?object $options=null ) {

		if (is_object($options)) {
			foreach ($options as $key => $value) {
				if (property_exists($this, $key)) {
					$this->$key = $value;
				}
			}
		}
	}//end __construct



	/**
	* DESCEND
	* Build the child context used to resolve a relation child component.
	* The child incorporates item_index / item_section_id into its own
	* path segment (see component_common::build_export_path_segment), so
	* the parent passes the full path prefix (including its own segment)
	* and the traversed locator position, without pushing a hop segment.
	* @param array $path_prefix
	* 	the parent full path (parent prefix + parent own segment)
	* @param array $sub_ddo_map
	* 	the descendant ddo_map subset for the child
	* @param object|null $ddo = null
	* 	the child own ddo (separator overrides)
	* @param int|null $item_index = null
	* 	0 based position of the traversed locator in the parent data
	* @param int|null $item_section_id = null
	* 	section_id of the traversed locator
	* @return export_context
	*/
	public function descend( array $path_prefix, array $sub_ddo_map, ?object $ddo=null, ?int $item_index=null, ?int $item_section_id=null ) : export_context {

		$child_context = new export_context();
			$child_context->path_prefix			= $path_prefix;
			$child_context->ddo					= $ddo;
			$child_context->ddo_map				= $sub_ddo_map;
			$child_context->absolute_urls		= $this->absolute_urls;
			$child_context->caller				= $this->caller;
			$child_context->value_with_parents	= $this->value_with_parents;
			$child_context->depth				= $this->depth + 1;
			$child_context->item_index			= $item_index;
			$child_context->item_section_id		= $item_section_id;

		return $child_context;
	}//end descend



}//end class export_context
