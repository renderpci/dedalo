<?php declare(strict_types=1);
/**
* DD_COMPONENT_INFO
* API handler that exposes component_info widget data to the REST API layer.
*
* component_info elements are read-only, display-only components that do not
* store data directly in the database. Instead they aggregate dynamic data
* produced by one or more widgets — each defined in the component's ontology
* properties under the 'widgets' key. This class acts as the bridge between
* the API routing layer and the widget subsystem for those components.
*
* Responsibilities:
* - Validate inbound RQO requests targeting component_info widget actions.
* - Resolve the component instance from the ontology (tipo → model → instance).
* - Locate the requested widget definition inside the component's properties.
* - Instantiate the correct widget subclass via widget_common::get_instance()
*   and call its get_data() method.
* - Return a normalised response object (result / msg / errors) to the caller.
*
* Routing: dd_manager maps the 'dd_api' RQO field value 'dd_component_info'
* to this class; only actions listed in API_ACTIONS may be dispatched
* (SEC-024 allowlist).
*
* Relationships:
* - Works with component_info (core/component_info) at the component layer.
* - Delegates widget instantiation to widget_common (core/widgets/widget_common).
* - Resolves component models via ontology_node::get_model_by_tipo().
* - Obtains component instances via component_common::get_instance().
*
* @package Dédalo
* @subpackage Core
*/
final class dd_component_info {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	*
	* Only methods enumerated here can be dispatched by dd_manager. Adding a
	* new public static method does NOT make it remotely callable; it must also
	* be listed here.  This prevents accidental exposure of internal helpers.
	*/
	public const API_ACTIONS = [
		'get_widget_data'
	];



	/**
	* GET_WIDGET_DATA
	* Resolves and returns the computed data for a single named widget belonging
	* to a component_info instance.
	*
	* Workflow:
	* 1. Unpack the RQO into component coordinates (tipo, section_tipo, section_id)
	*    and the target widget name from options.
	* 2. Instantiate the component_info element in 'list' mode with lang=NOLAN so
	*    that no translatable data is pre-loaded — only the ontology properties
	*    (including the widget list) are needed at this stage.
	* 3. Look up the matching widget definition object inside the component's
	*    'widgets' property array by widget_name.
	* 4. Build a $widget_options object combining the record coordinates (from the
	*    RQO source) with the per-widget ontology configuration (widget_name, path,
	*    ipo) and the caller's mode.
	* 5. Instantiate the concrete widget class via widget_common::get_instance()
	*    and call its get_data() to obtain the resolved data payload.
	* 6. Return the standard response envelope.
	*
	* The component is resolved with lang=DEDALO_DATA_NOLAN ('lg-nolan') — the
	* "no-language" sentinel — because component_info properties are language-
	* agnostic. Actual language-sensitive widget data is resolved internally by
	* the widget using DEDALO_DATA_LANG (the session language).
	*
	* @param object $rqo  Request Query Object. Required shape:
	*   {
	*     action  : "get_widget_data",
	*     dd_api  : "dd_component_info",
	*     source  : {
	*       tipo         : string,  // ontology tipo of the component_info element (e.g. 'oh87')
	*       section_tipo : string,  // section tipo owning the component (e.g. 'oh1')
	*       section_id   : string,  // record ID within that section
	*       mode         : string   // UI mode: 'edit' | 'list' | etc.
	*     },
	*     options : {
	*       widget_name  : string   // name of the widget to retrieve (must match a
	*                               // widget_name in the component's ontology 'widgets' array)
	*     }
	*   }
	*
	* @return object $response  Standard API envelope:
	*   {
	*     result : mixed   // widget data on success; false on failure
	*     msg    : mixed   // 'OK. Request done successfully' on success;
	*                      // array of error strings on failure
	*     errors : array   // reserved for structured error objects (may be empty)
	*   }
	*/
	public static function get_widget_data( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$mode			= $source->mode;

		// options
			$options		= $rqo->options;
			$widget_name	= $options->widget_name;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// component
			// Resolve the PHP class name (model) for this ontology tipo, then build
			// the component instance. Mode 'list' and lang NOLAN are used here because
			// only the ontology properties (widget definitions) are needed — no record
			// data is fetched at this stage.
			$model = ontology_node::get_model_by_tipo($tipo,true);
			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

			$properties	= $component->get_properties();
			$widgets	= $properties->widgets ?? null;

			// Guard: a component_info element without any configured widgets is a
			// misconfiguration in the ontology; nothing useful can be returned.
			if (empty($widgets) || !is_array($widgets)) {

				$msg = ' Empty defined widgets for '.get_called_class()." : $component->label [$component->tipo] ".to_string($widgets);

				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg[] = $msg;
				return $response;
			}

			// Locate the specific widget definition by matching widget_name.
			// array_find returns the first matching element or null/false if absent.
			$widget_obj = array_find($widgets, function($widget) use ($widget_name){
				return $widget->widget_name === $widget_name;
			});

			// Guard: the caller requested a widget_name that is not declared in the
			// component's ontology properties — this is a client-side or ontology error.
			if(empty($widget_obj)){
				$msg = ' Empty widget_obj for widget '. $widget_name;

				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg[] = $msg;
				return $response;
			}

			// Build the options object for widget_common::get_instance().
			// The record coordinates (section_tipo, section_id, mode) come from the
			// caller's RQO source, while the widget class identity (widget_name, path)
			// and IPO pipeline (ipo) come from the ontology widget definition object.
			// DEDALO_DATA_LANG carries the session language so the widget resolves any
			// translatable labels in the active UI language.
			$widget_options = new stdClass();
				$widget_options->section_tipo		= $section_tipo;
				$widget_options->section_id			= $section_id;
				$widget_options->lang				= DEDALO_DATA_LANG;
				// $widget_options->component_info	= $this;
				$widget_options->widget_name		= $widget_obj->widget_name;
				$widget_options->path				= $widget_obj->path;
				$widget_options->ipo				= $widget_obj->ipo;
				$widget_options->mode				= $mode;

			// Instantiate the concrete widget class (looked up by widget_name/path)
			// and retrieve its computed data payload.
			$widget = widget_common::get_instance($widget_options);
			$widget_data = $widget->get_data();

		// response
			$response->result	= $widget_data;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_widget_data



}//end dd_component_info
