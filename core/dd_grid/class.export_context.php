<?php declare(strict_types=1);
/**
* CLASS EXPORT_CONTEXT
* Immutable-by-convention bag of per-call state threaded through the export
* atom pipeline (component_common::get_export_value() and its overrides).
*
* Purpose and motivation
* -----------------------
* Before this class the export path relied on mutating component instances:
* - request_config->show->ddo_map was injected directly into request_config
*   before each get_grid_value() call so the component could find its sub-columns.
* - column_obj was injected as a property on the component instance.
* - $component->caller === 'tool_export' guards were scattered across media
*   components to decide whether URLs should be absolute.
*
* These per-call mutations made instance caching unsafe and were a source of
* state-bleed bugs in persistent-worker environments.  export_context collects
* all of that per-call state into a single immutable-by-convention argument:
* - $ddo_map        replaces the request_config->show->ddo_map injection
* - $path_prefix    replaces the column_obj injection (structured path breadcrumbs)
* - $absolute_urls  replaces the $caller==='tool_export' boolean switches
* - $value_with_parents  replaces per-ddo ddinfo annotations on relation records
*
* Because export context travels as an argument, component instances are no
* longer specialised per export column, making instance caching safe (caching
* kept disabled in phase 1 for parity with the legacy get_grid_value() path;
* see the export-atoms migration plan for the phase 2 rollout).
*
* Lifecycle
* ---------
* tool_export creates a root export_context for each export column, then
* component_relation_common::get_export_value() calls descend() for every
* traversed locator, producing a child context with an extended path_prefix
* and the item_index of the traversed locator position.  Leaf components
* consume the context but never call descend() — they only read $path_prefix,
* $ddo, and $absolute_urls.
*
* The context object MUST NOT be mutated after construction.  Always call
* descend() to produce a child.
*
* Relationships
* -------------
* - Created by tool_export::get_export_column_value() (root context per column)
* - Created via $context ?? new export_context() in every get_export_value()
*   implementation as a null-safe default (no-op context)
* - descend() is called exclusively by component_relation_common::get_export_value()
* - Consumed (read-only) by every get_export_value() and get_raw_export_value()
*   override in component_common and its subclasses
* - Works together with export_atom, export_path_segment, and export_value
*   (all in core/dd_grid/)
*
* @package Dédalo
* @subpackage Core
*/
class export_context {



	/**
	 * Ordered list of export_path_segment objects accumulated so far, root first.
	 * When a relation component traverses a locator it passes its own full
	 * path (prefix + own segment) as the child's path_prefix via descend().
	 * The child component then appends its own segment when building atoms, so
	 * the final atom path is: [root-segment, ..., parent-segment, leaf-segment].
	 * Empty array at the root call (no segments accumulated yet).
	 * @var array $path_prefix
	 */
	public array $path_prefix = [];

	/**
	 * The Data Definition Object (ddo) for this specific component, as
	 * supplied by the tool_export ddo_map entry.  Carries optional per-column
	 * overrides: fields_separator, records_separator, class_list, and the
	 * value_with_parents flag.  This is the same object the legacy
	 * get_grid_value($ddo) received as its first argument.
	 * Null when no per-column ddo was configured (default separators apply).
	 * @var ?object $ddo
	 */
	public ?object $ddo = null;

	/**
	 * Flat list of ddo objects for the descendants of this component.
	 * Relation components (component_relation_common and its subclasses) use
	 * this to determine which child components to resolve when iterating
	 * locators, replacing the legacy request_config->show->ddo_map injection.
	 * Each call to descend() receives the appropriate subset (get_export_ddo_descendants)
	 * so deeper levels only see their own branch of the tree.
	 * Empty array means: resolve all default children (no ddo_map filter).
	 * @var array $ddo_map
	 */
	public array $ddo_map = [];

	/**
	 * When true, media components (component_av, component_3d, component_image,
	 * component_media_common) must emit absolute URLs including the server origin
	 * rather than server-relative paths.  Set to true by tool_export, which
	 * produces files consumed outside the web context.
	 * Replaces the scattered $this->caller === 'tool_export' conditional switches
	 * in every media component.  Default false (relative paths for in-app grids).
	 * @var bool $absolute_urls
	 */
	public bool $absolute_urls = false;

	/**
	 * Informational caller identifier, e.g. 'tool_export'.  Carried for
	 * diagnostic / logging purposes only.
	 * (!) No component behavior should branch on this value — use explicit
	 * boolean flags like $absolute_urls instead.  Branching on $caller
	 * recreates the coupling that export_context was designed to eliminate.
	 * @var string $caller
	 */
	public string $caller = '';

	/**
	 * When true, component_relation_common::get_export_value() appends an
	 * additional set of atoms carrying the full ancestor chain of every
	 * resolved locator target (thesaurus/hierarchy parents) as a sibling
	 * 'parents' sub-column alongside the normal value atoms.  Targets that
	 * have no parents produce no extra atoms (nothing emitted, not an empty
	 * placeholder).
	 * Mirrors the list-view ddinfo 'value_with_parents' per-column behavior
	 * (see common::get_ddinfo_parents).  tool_export activates this globally
	 * via tool_export::$value_with_parents, or per-column via the individual
	 * ddo->value_with_parents flag.  Default false.
	 * @var bool $value_with_parents
	 */
	public bool $value_with_parents = false;

	/**
	 * Current nesting depth of the export traversal (0 = root call).
	 * Incremented by 1 in each descend() call.  Acts as a sanity guard
	 * against runaway recursion; in practice the depth is naturally bounded
	 * by the length of the ddo_map descendant chain, so this counter is
	 * mainly informational and available for logging/debugging.
	 * @var int $depth
	 */
	public int $depth = 0;

	/**
	 * Zero-based position of the locator (data item) in the parent relation
	 * component's data array that was traversed to reach this component.
	 * The child component incorporates this value into its own export_path_segment
	 * as item_index, allowing the export tabulator to reconstruct which
	 * relation items produced which atoms and thereby explode them into
	 * separate rows or columns depending on the breakdown mode.
	 * Null at the root call and for non-relation leaf components.
	 * @var ?int $item_index
	 */
	public ?int $item_index = null;

	/**
	 * Resolved section_id of the locator record traversed by the parent
	 * relation component (i.e. the target record this child belongs to).
	 * Lands on the child's own export_path_segment->section_id for
	 * informational use by the export tabulator (e.g. label resolution).
	 * Null at the root call and for non-relation hops.
	 * @var ?int $item_section_id
	 */
	public ?int $item_section_id = null;



	/**
	* __CONSTRUCT
	* Accepts an optional options object whose properties are copied onto the
	* context.  Only recognised property names (those that exist on this class)
	* are applied; unknown keys are silently ignored.  All properties have
	* defaults, so passing null produces a valid no-op root context used as
	* the null-safe fallback ($context ?? new export_context()) in every
	* get_export_value() implementation.
	*
	* Recognised option keys (all optional):
	*   path_prefix       array  — pre-accumulated path segments
	*   ddo               object — per-column ddo from the ddo_map
	*   ddo_map           array  — descendant ddo list for child resolution
	*   absolute_urls     bool   — emit absolute media URLs
	*   caller            string — informational caller label
	*   value_with_parents bool  — include ancestor chain atoms
	*   depth             int    — starting nesting depth
	*   item_index        ?int   — traversed locator position in parent data
	*   item_section_id   ?int   — section_id of the traversed locator
	*
	* @param ?object $options = null - property bag; unknown keys are ignored
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
	* Produce a child export_context for the next hop in the traversal.
	* Called exclusively by component_relation_common::get_export_value()
	* once per ddo child / locator combination before recursing into the
	* child component's get_export_value().
	*
	* Inheritance rules (what descend() inherits vs. resets):
	*   Inherited from parent : absolute_urls, caller, value_with_parents
	*   Reset / supplied fresh: path_prefix (extended by parent), ddo_map
	*                           (child subset), ddo (child own ddo),
	*                           item_index, item_section_id
	*   Incremented           : depth (+1)
	*
	* The caller is responsible for computing path_prefix correctly:
	* it must be the parent's full path including its own segment
	* (context->path_prefix + parent own segment), NOT just the parent
	* prefix.  That way the child's build_export_path_segment() can
	* append its own segment and arrive at the complete leaf path.
	*
	* @param array $path_prefix - parent's full accumulated path (prefix + own segment)
	* @param array $sub_ddo_map - descendant ddo list scoped to this child branch
	* @param ?object $ddo = null - child's own ddo (per-column separator/class overrides)
	* @param ?int $item_index = null - zero-based locator position in the parent data array
	* @param ?int $item_section_id = null - section_id of the traversed locator target
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
